import "server-only";

import { createHash, createPublicKey, verify } from "node:crypto";

import { VersionedTransaction, type PublicKey } from "@solana/web3.js";

import { addressesEqual, decodeBase58, isValidSolanaAddress } from "@/lib/solana/address";

import {
  COMPUTE_BUDGET_PROGRAM_ID,
  HARD_MAX_ACCOUNTS,
  HARD_MAX_COMPUTE_UNITS,
  HARD_MAX_INSTRUCTIONS,
  HARD_MAX_SIGNATURES,
  HARD_MAX_SPONSOR_FEE_LAMPORTS,
  HARD_MAX_TRANSACTION_BYTES,
  SponsorError,
  type SponsorTransactionLimits,
  type ValidatedSponsorship,
  type ValidatedSponsorshipData,
} from "./contracts";

/**
 * Inspección y validación de una transacción candidata a patrocinio.
 *
 * NO firma ni envía nada. Sólo responde:
 * - ¿el fee-payer es el sponsor registrado?
 * - ¿las firmas requeridas son exactamente sponsor + usuario?
 * - ¿el sponsor ya viene firmado?
 * - ¿el sponsor aparece como cuenta de alguna instrucción? (debe ser NO)
 * - ¿el programa invocado está en la allowlist?
 * - ¿la comisión máxima (base + prioridad) cabe en el tope?
 * - ¿el blockhash es el que el servidor guardó?
 *
 * Todo error es fail-closed y con mensaje fijo. Nunca se registra el base64,
 * la firma ni el mensaje crudo de la librería.
 */

const BASE_SIGNATURE_FEE_LAMPORTS = 5_000;
const DEFAULT_COMPUTE_UNITS_PER_INSTRUCTION = 200_000;
const MICRO_LAMPORTS_PER_LAMPORT = BigInt(1_000_000);

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= Number.MAX_SAFE_INTEGER;
}

function decodeTransaction(
  transactionBase64: string,
  maxBytes: number,
): { readonly tx: VersionedTransaction; readonly bytes: Uint8Array } {
  const text = typeof transactionBase64 === "string" ? transactionBase64.trim() : "";
  if (!text) {
    throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
  }
  // Cota antes de decodificar: evita asignar memoria por una entrada enorme.
  const maxEncodedLength = Math.ceil(maxBytes / 3) * 4 + 4;
  if (text.length > maxEncodedLength) {
    throw new SponsorError("SPONSOR_TRANSACTION_TOO_LARGE");
  }
  if (!BASE64_RE.test(text) || text.length % 4 === 1) {
    throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(Buffer.from(text, "base64"));
  } catch {
    throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
  }
  if (bytes.length === 0) {
    throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
  }
  if (bytes.length > maxBytes) {
    throw new SponsorError("SPONSOR_TRANSACTION_TOO_LARGE");
  }

  try {
    return { tx: VersionedTransaction.deserialize(bytes), bytes };
  } catch {
    throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
  }
}

function isSignaturePresent(signature: Uint8Array | undefined): boolean {
  if (!signature || signature.length !== 64) return false;
  for (let index = 0; index < signature.length; index += 1) {
    if (signature[index] !== 0) return true;
  }
  return false;
}

function bytesEqual(left: Uint8Array | undefined, right: Uint8Array | undefined): boolean {
  if (!left || !right || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function programIdAt(accountKeys: readonly PublicKey[], index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= accountKeys.length) {
    throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
  }
  const key = accountKeys[index];
  if (!key) {
    throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
  }
  return key.toBase58();
}

function readU32LE(data: Uint8Array, offset: number): number {
  if (data.length < offset + 4) {
    throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
  }
  return (
    ((data[offset] ?? 0) |
      ((data[offset + 1] ?? 0) << 8) |
      ((data[offset + 2] ?? 0) << 16) |
      ((data[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

function readU64LE(data: Uint8Array, offset: number): bigint {
  if (data.length < offset + 8) {
    throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
  }
  let value = BigInt(0);
  for (let index = 7; index >= 0; index -= 1) {
    value = (value << BigInt(8)) | BigInt(data[offset + index] ?? 0);
  }
  return value;
}

type ParsedComputeBudget =
  | { readonly kind: "limit"; readonly value: number }
  | { readonly kind: "price"; readonly value: bigint }
  | { readonly kind: "other" };

/**
 * Discriminantes de ComputeBudget: 0 deprecado, 1 heap, 2 límite de CU,
 * 3 precio por CU, 4 límite de datos cargados. Se rechaza lo desconocido y
 * el 0 (RequestUnitsDeprecated) porque permite declarar una comisión extra
 * fuera del cálculo de prioridad.
 */
function parseComputeBudgetInstruction(data: Uint8Array): ParsedComputeBudget {
  if (data.length < 1) {
    throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
  }
  const discriminant = data[0] ?? -1;
  switch (discriminant) {
    case 1: {
      if (data.length !== 5) throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
      return { kind: "other" };
    }
    case 2: {
      if (data.length !== 5) throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
      const value = readU32LE(data, 1);
      if (value <= 0 || value > HARD_MAX_COMPUTE_UNITS) {
        throw new SponsorError("SPONSOR_FEE_TOO_HIGH");
      }
      return { kind: "limit", value };
    }
    case 3: {
      if (data.length !== 9) throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
      return { kind: "price", value: readU64LE(data, 1) };
    }
    case 4: {
      if (data.length !== 5) throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
      return { kind: "other" };
    }
    default:
      throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
  }
}

function assertTransactionLimits(limits: SponsorTransactionLimits): void {
  if (!limits || typeof limits !== "object") {
    throw new SponsorError("SPONSOR_POLICY_INVALID");
  }
  if (
    typeof limits.sponsorFeePayer !== "string" ||
    typeof limits.userWallet !== "string" ||
    !isValidSolanaAddress(limits.sponsorFeePayer) ||
    !isValidSolanaAddress(limits.userWallet)
  ) {
    throw new SponsorError("SPONSOR_POLICY_INVALID");
  }
  if (
    typeof limits.expectedRecentBlockhash !== "string" ||
    !isValidSolanaAddress(limits.expectedRecentBlockhash)
  ) {
    throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
  }
  if (
    !isPositiveInteger(limits.maxFeeLamports) ||
    limits.maxFeeLamports > HARD_MAX_SPONSOR_FEE_LAMPORTS ||
    !isPositiveInteger(limits.maxTransactionBytes) ||
    limits.maxTransactionBytes > HARD_MAX_TRANSACTION_BYTES ||
    !isPositiveInteger(limits.maxSignatures) ||
    limits.maxSignatures > HARD_MAX_SIGNATURES ||
    !isPositiveInteger(limits.maxInstructions) ||
    limits.maxInstructions > HARD_MAX_INSTRUCTIONS ||
    !isPositiveInteger(limits.maxAccounts) ||
    limits.maxAccounts > HARD_MAX_ACCOUNTS ||
    !isPositiveInteger(limits.maxComputeUnits) ||
    limits.maxComputeUnits > HARD_MAX_COMPUTE_UNITS
  ) {
    throw new SponsorError("SPONSOR_POLICY_INVALID");
  }
  if (
    !Array.isArray(limits.allowedPrograms) ||
    limits.allowedPrograms.length === 0 ||
    !limits.allowedPrograms.every(
      (program) => typeof program === "string" && isValidSolanaAddress(program),
    )
  ) {
    throw new SponsorError("SPONSOR_POLICY_INVALID");
  }
  if (limits.expectedMessageSha256 !== undefined) {
    if (
      typeof limits.expectedMessageSha256 !== "string" ||
      !SHA256_HEX_RE.test(limits.expectedMessageSha256.trim().toLowerCase())
    ) {
      throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
    }
  }
}

/**
 * Datos que el servidor debe guardar al construir la transacción para luego
 * patrocinarla. Se calculan sobre la transacción EXACTA que tendrá al sponsor
 * como fee-payer (no sobre una versión previa con el usuario como payer).
 */
export interface SponsorTransactionBinding {
  readonly recentBlockhash: string;
  readonly messageSha256: string;
}

function bindingOf(tx: VersionedTransaction): SponsorTransactionBinding {
  const version = tx.version;
  if (version !== "legacy" && version !== 0) {
    throw new SponsorError("SPONSOR_UNSUPPORTED_VERSION");
  }
  const message = tx.message;
  if (message.addressTableLookups.length > 0) {
    throw new SponsorError("SPONSOR_ALT_NOT_SUPPORTED");
  }
  const recentBlockhash = message.recentBlockhash;
  if (typeof recentBlockhash !== "string" || !isValidSolanaAddress(recentBlockhash)) {
    throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
  }
  return {
    recentBlockhash,
    messageSha256: createHash("sha256").update(message.serialize()).digest("hex"),
  };
}

export function readSponsorTransactionBinding(
  transactionBase64: string,
): SponsorTransactionBinding {
  const { tx } = decodeTransaction(transactionBase64, HARD_MAX_TRANSACTION_BYTES);
  return bindingOf(tx);
}

/**
 * Valida la transacción sin firmarla. Devuelve una forma marcada
 * `ValidatedSponsorship` que es lo único que debe aceptar el KMS.
 */
export function validateSponsorTransaction(
  transactionBase64: string,
  limits: SponsorTransactionLimits,
): ValidatedSponsorship {
  assertTransactionLimits(limits);
  if (addressesEqual(limits.sponsorFeePayer, limits.userWallet)) {
    throw new SponsorError("SPONSOR_SELF_PAYMENT");
  }

  const { tx, bytes } = decodeTransaction(transactionBase64, limits.maxTransactionBytes);
  const version = tx.version;
  if (version !== "legacy" && version !== 0) {
    throw new SponsorError("SPONSOR_UNSUPPORTED_VERSION");
  }

  const message = tx.message;
  // Sin tablas de direcciones: todas las cuentas son estáticas y se pueden
  // inspeccionar sin RPC. Habilitarlas exige resolver las tablas y revisar
  // cada cuenta cargada; queda fuera de este contrato.
  if (message.addressTableLookups.length > 0) {
    throw new SponsorError("SPONSOR_ALT_NOT_SUPPORTED");
  }

  const signatureCount = message.header.numRequiredSignatures;
  if (
    !Number.isInteger(signatureCount) ||
    signatureCount < 1 ||
    signatureCount > limits.maxSignatures ||
    tx.signatures.length !== signatureCount
  ) {
    throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
  }

  const accountKeys = message.staticAccountKeys;
  if (accountKeys.length < signatureCount || accountKeys.length > limits.maxAccounts) {
    throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
  }

  const feePayerKey = accountKeys[0];
  if (!feePayerKey || !addressesEqual(feePayerKey.toBase58(), limits.sponsorFeePayer)) {
    throw new SponsorError("SPONSOR_FEE_PAYER_MISMATCH");
  }

  const requiredSignerKeys = accountKeys.slice(0, signatureCount).map((key) => key.toBase58());
  const userSignerIndex = requiredSignerKeys.findIndex((key) => addressesEqual(key, limits.userWallet));
  if (userSignerIndex < 0) {
    throw new SponsorError("SPONSOR_UNEXPECTED_SIGNER");
  }
  for (const signerKey of requiredSignerKeys) {
    if (
      !addressesEqual(signerKey, limits.sponsorFeePayer) &&
      !addressesEqual(signerKey, limits.userWallet)
    ) {
      throw new SponsorError("SPONSOR_UNEXPECTED_SIGNER");
    }
  }

  const sponsorSignature = tx.signatures[0];
  if (isSignaturePresent(sponsorSignature)) {
    throw new SponsorError("SPONSOR_ALREADY_SIGNED");
  }
  const userSignaturePresent = isSignaturePresent(tx.signatures[userSignerIndex]);

  const instructions = message.compiledInstructions;
  if (
    !Array.isArray(instructions) ||
    instructions.length === 0 ||
    instructions.length > limits.maxInstructions
  ) {
    throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
  }

  const allowedPrograms = new Set(limits.allowedPrograms);
  const programIds: string[] = [];
  let computeUnitLimit: number | null = null;
  let computeUnitPrice: bigint | null = null;
  let economicInstructions = 0;

  for (const instruction of instructions) {
    const programId = programIdAt(accountKeys, instruction.programIdIndex);
    programIds.push(programId);
    if (programId !== COMPUTE_BUDGET_PROGRAM_ID) {
      economicInstructions += 1;
    }
    if (addressesEqual(programId, limits.sponsorFeePayer)) {
      throw new SponsorError("SPONSOR_PROGRAM_NOT_ALLOWED");
    }
    if (!allowedPrograms.has(programId)) {
      throw new SponsorError("SPONSOR_PROGRAM_NOT_ALLOWED");
    }

    for (const accountIndex of instruction.accountKeyIndexes) {
      if (
        !Number.isInteger(accountIndex) ||
        accountIndex < 0 ||
        accountIndex >= accountKeys.length
      ) {
        throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
      }
      const account = accountKeys[accountIndex];
      if (!account) {
        throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
      }
      // El sponsor sólo paga la comisión. Si aparece en una instrucción,
      // su firma podría autorizar transferencias, renta o aprobaciones.
      if (addressesEqual(account.toBase58(), limits.sponsorFeePayer)) {
        throw new SponsorError("SPONSOR_INSTRUCTION_ACCOUNT_NOT_ALLOWED");
      }
    }

    if (programId === COMPUTE_BUDGET_PROGRAM_ID) {
      const parsed = parseComputeBudgetInstruction(instruction.data);
      if (parsed.kind === "limit") {
        computeUnitLimit = Math.max(computeUnitLimit ?? 0, parsed.value);
      } else if (parsed.kind === "price") {
        computeUnitPrice =
          computeUnitPrice === null || parsed.value > computeUnitPrice
            ? parsed.value
            : computeUnitPrice;
      }
    }
  }

  // Una transacción sólo de ComputeBudget no hace nada útil: quemaría la
  // comisión del sponsor sin una operación económica detrás.
  if (economicInstructions === 0) {
    throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
  }

  const defaultComputeLimit = Math.min(
    HARD_MAX_COMPUTE_UNITS,
    Math.max(1, instructions.length) * DEFAULT_COMPUTE_UNITS_PER_INSTRUCTION,
  );
  const effectiveComputeLimit = computeUnitLimit ?? defaultComputeLimit;
  if (
    !Number.isInteger(effectiveComputeLimit) ||
    effectiveComputeLimit <= 0 ||
    effectiveComputeLimit > limits.maxComputeUnits
  ) {
    throw new SponsorError("SPONSOR_FEE_TOO_HIGH");
  }

  const price = computeUnitPrice ?? BigInt(0);
  const priorityFee =
    price > BigInt(0)
      ? (BigInt(effectiveComputeLimit) * price + MICRO_LAMPORTS_PER_LAMPORT - BigInt(1)) /
        MICRO_LAMPORTS_PER_LAMPORT
      : BigInt(0);
  const baseFee = BigInt(signatureCount) * BigInt(BASE_SIGNATURE_FEE_LAMPORTS);
  const totalFee = baseFee + priorityFee;
  if (
    totalFee > BigInt(limits.maxFeeLamports) ||
    totalFee > BigInt(HARD_MAX_SPONSOR_FEE_LAMPORTS)
  ) {
    throw new SponsorError("SPONSOR_FEE_TOO_HIGH");
  }

  const { recentBlockhash, messageSha256 } = bindingOf(tx);
  if (!addressesEqual(recentBlockhash, limits.expectedRecentBlockhash)) {
    throw new SponsorError("SPONSOR_BLOCKHASH_MISMATCH");
  }
  if (limits.expectedMessageSha256 !== undefined) {
    const expected = limits.expectedMessageSha256.trim().toLowerCase();
    if (expected !== messageSha256) {
      throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
    }
  }

  const validated: ValidatedSponsorshipData = {
    transactionBase64,
    transactionBytes: bytes.length,
    sponsorFeePayer: limits.sponsorFeePayer,
    userWallet: limits.userWallet,
    recentBlockhash,
    messageSha256,
    fee: {
      baseFeeLamports: Number(baseFee),
      priorityFeeLamports: Number(priorityFee),
      totalFeeLamports: Number(totalFee),
      computeUnitLimit: effectiveComputeLimit,
      computeUnitPriceMicroLamports: Number(price),
    },
    programIds,
    instructionCount: instructions.length,
    accountCount: accountKeys.length,
    userSignaturePresent,
  };
  // Única conversión al tipo marcado: ocurre aquí, después de todas las
  // comprobaciones. La marca es sólo de tipos y no existe en tiempo de
  // ejecución.
  return validated as ValidatedSponsorship;
}

/**
 * Verifica que el KMS sólo agregó la firma del sponsor:
 * mismo mensaje (SHA-256), mismo fee-payer, mismas firmas de usuario, y una
 * firma Ed25519 válida del sponsor.
 *
 * Así una implementación de KMS comprometida no puede cambiar la transacción
 * ni colar instrucciones después de la validación.
 */
export function verifySponsorSignature(
  signedTransactionBase64: string,
  validated: ValidatedSponsorship,
): void {
  const original = decodeTransaction(validated.transactionBase64, HARD_MAX_TRANSACTION_BYTES);
  const signed = decodeTransaction(signedTransactionBase64, HARD_MAX_TRANSACTION_BYTES);

  if (signed.bytes.length !== original.bytes.length) {
    throw new SponsorError("SPONSOR_SIGNATURE_INVALID");
  }
  if (signed.tx.version !== original.tx.version) {
    throw new SponsorError("SPONSOR_SIGNATURE_INVALID");
  }
  if (signed.tx.signatures.length !== original.tx.signatures.length) {
    throw new SponsorError("SPONSOR_SIGNATURE_INVALID");
  }

  const signedMessageHash = createHash("sha256")
    .update(signed.tx.message.serialize())
    .digest("hex");
  if (signedMessageHash !== validated.messageSha256) {
    throw new SponsorError("SPONSOR_SIGNATURE_INVALID");
  }

  const feePayerKey = signed.tx.message.staticAccountKeys[0];
  if (!feePayerKey || !addressesEqual(feePayerKey.toBase58(), validated.sponsorFeePayer)) {
    throw new SponsorError("SPONSOR_SIGNATURE_INVALID");
  }

  // Sólo puede cambiar la firma del sponsor (índice 0). Cualquier otra
  // firma debe quedar byte a byte igual que en la transacción validada.
  for (let index = 1; index < signed.tx.signatures.length; index += 1) {
    if (!bytesEqual(signed.tx.signatures[index], original.tx.signatures[index])) {
      throw new SponsorError("SPONSOR_SIGNATURE_INVALID");
    }
  }

  const sponsorSignature = signed.tx.signatures[0];
  if (!sponsorSignature || !isSignaturePresent(sponsorSignature)) {
    throw new SponsorError("SPONSOR_SIGNATURE_INVALID");
  }

  const publicKeyBytes = decodeBase58(validated.sponsorFeePayer);
  if (!publicKeyBytes || publicKeyBytes.length !== 32) {
    throw new SponsorError("SPONSOR_SIGNATURE_INVALID");
  }

  let publicKey: ReturnType<typeof createPublicKey>;
  try {
    publicKey = createPublicKey({
      key: Buffer.concat([
        Buffer.from("302a300506032b6570032100", "hex"),
        Buffer.from(publicKeyBytes),
      ]),
      format: "der",
      type: "spki",
    });
  } catch {
    throw new SponsorError("SPONSOR_SIGNATURE_INVALID");
  }

  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(signed.tx.message.serialize()),
      publicKey,
      Buffer.from(sponsorSignature),
    );
  } catch {
    throw new SponsorError("SPONSOR_SIGNATURE_INVALID");
  }
  if (!valid) {
    throw new SponsorError("SPONSOR_SIGNATURE_INVALID");
  }
}
