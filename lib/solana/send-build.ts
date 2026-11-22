import {
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type Connection,
  type TransactionInstruction,
} from "@solana/web3.js";

import { DomainError } from "@/lib/api/result";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@/lib/solana/token-instructions";

/**
 * Construcción de un envío SPL / Token-2022.
 *
 * El programa dueño del mint no se infiere del catálogo por sí solo: se lee de
 * la cadena y se exige que coincida con el catálogo verificado (USDC → clásico,
 * acciones → Token-2022). La ATA de origen, la de destino y las instrucciones
 * usan ese mismo programa. Cualquier inconsistencia falla cerrado antes de
 * armar la transacción.
 *
 * Sin dependencias de `@solana/spl-token` ni `bigint-buffer`.
 */

/** Los dos tipos de mint que se pueden enviar. */
export type SendMintKind = "usdc" | "stock";

/** Subconjunto del RPC que necesita este módulo; permite tests sin red. */
export type SendRpc = Pick<Connection, "getAccountInfo" | "getTokenAccountBalance">;

/** Programa que el catálogo verificado espera para cada tipo de mint. */
export function expectedTokenProgram(kind: SendMintKind): PublicKey {
  return kind === "usdc" ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID;
}

async function readAccountOwner(
  connection: SendRpc,
  address: PublicKey,
): Promise<PublicKey | null> {
  try {
    const info = await connection.getAccountInfo(address, "confirmed");
    return info?.owner ?? null;
  } catch {
    throw new DomainError("UPSTREAM", "No se pudo verificar la cuenta en la cadena.");
  }
}

/**
 * Lee el programa dueño real del mint y lo compara con el esperado por el
 * catálogo. Mint inexistente, programa desconocido o programa distinto →
 * `MINT_NOT_ALLOWED`. Error del RPC → `UPSTREAM`.
 */
export async function resolveTokenProgram(
  connection: SendRpc,
  mint: PublicKey,
  kind: SendMintKind,
): Promise<PublicKey> {
  const expected = expectedTokenProgram(kind);
  const owner = await readAccountOwner(connection, mint);
  if (!owner || !owner.equals(expected)) {
    throw new DomainError(
      "MINT_NOT_ALLOWED",
      "El mint no pertenece al programa de token esperado.",
    );
  }
  return expected;
}

/**
 * MON-4: el destino tiene que ser una billetera común. Se rechaza:
 * - una clave fuera de la curva (PDA / dirección sin llave privada);
 * - la propia billetera de origen;
 * - una cuenta que ya es token account, mint (programa Token / Token-2022) o
 *   un programa ejecutable: pegar ahí la dirección deja los fondos
 *   irrecuperables. Cuenta del sistema o inexistente → OK.
 */
export async function assertSafeDestinationOwner(
  connection: SendRpc,
  to: PublicKey,
  owner: PublicKey,
): Promise<void> {
  if (to.equals(owner)) {
    throw new DomainError("VALIDATION", "El destino no puede ser tu propia billetera.");
  }
  if (!PublicKey.isOnCurve(to.toBytes())) {
    throw new DomainError(
      "VALIDATION",
      "Esa dirección no es una billetera válida para recibir fondos.",
    );
  }
  let info: Awaited<ReturnType<SendRpc["getAccountInfo"]>>;
  try {
    info = await connection.getAccountInfo(to, "confirmed");
  } catch {
    throw new DomainError("UPSTREAM", "No se pudo verificar la cuenta en la cadena.");
  }
  if (!info) return;
  if (
    info.executable ||
    info.owner.equals(TOKEN_PROGRAM_ID) ||
    info.owner.equals(TOKEN_2022_PROGRAM_ID)
  ) {
    throw new DomainError(
      "VALIDATION",
      "Esa dirección es una cuenta de token, un mint o un programa, no una billetera. Pega la dirección de la billetera del destinatario.",
    );
  }
}

export interface SendInstructionInput {
  mint: PublicKey;
  owner: PublicKey;
  to: PublicKey;
  rawAmount: bigint;
  programId: PublicKey;
}

export interface SendInstructions {
  source: PublicKey;
  destination: PublicKey;
  instructions: TransactionInstruction[];
}

/**
 * Deriva las ATA con el programa recibido y arma las dos instrucciones. Es
 * pura: no toca la red. `programId` sólo puede ser el clásico o Token-2022.
 */
export function buildSendInstructions(input: SendInstructionInput): SendInstructions {
  const allowed =
    input.programId.equals(TOKEN_PROGRAM_ID) ||
    input.programId.equals(TOKEN_2022_PROGRAM_ID);
  if (!allowed) {
    throw new DomainError("VALIDATION", "Programa de token no permitido.");
  }
  if (input.rawAmount <= BigInt(0)) {
    throw new DomainError("VALIDATION", "El monto tiene que ser mayor que cero.");
  }

  const source = getAssociatedTokenAddressSync(
    input.mint,
    input.owner,
    false,
    input.programId,
  );
  const destination = getAssociatedTokenAddressSync(
    input.mint,
    input.to,
    true,
    input.programId,
  );
  const instructions = [
    createAssociatedTokenAccountIdempotentInstruction(
      input.owner,
      destination,
      input.to,
      input.mint,
      input.programId,
    ),
    createTransferInstruction(
      source,
      destination,
      input.owner,
      input.rawAmount,
      [],
      input.programId,
    ),
  ];
  return { source, destination, instructions };
}

export interface BuildSendTransactionInput {
  connection: SendRpc;
  mint: PublicKey;
  kind: SendMintKind;
  owner: PublicKey;
  to: PublicKey;
  rawAmount: bigint;
  recentBlockhash: string;
}

export interface BuiltSendTransaction {
  transactionBase64: string;
  source: PublicKey;
  destination: PublicKey;
  programId: PublicKey;
}

/**
 * Verifica mint, ATA de origen y ATA de destino (si ya existe), comprueba el
 * saldo y devuelve la transacción sin firmar en base64. Nunca arma la
 * transacción si una cuenta no pertenece al programa del mint.
 */
export async function buildSendTransaction(
  input: BuildSendTransactionInput,
): Promise<BuiltSendTransaction> {
  const programId = await resolveTokenProgram(input.connection, input.mint, input.kind);
  await assertSafeDestinationOwner(input.connection, input.to, input.owner);
  const { source, destination, instructions } = buildSendInstructions({
    mint: input.mint,
    owner: input.owner,
    to: input.to,
    rawAmount: input.rawAmount,
    programId,
  });

  const sourceOwner = await readAccountOwner(input.connection, source);
  if (!sourceOwner) throw new DomainError("INSUFFICIENT_FUNDS");
  if (!sourceOwner.equals(programId)) {
    throw new DomainError(
      "VALIDATION",
      "La cuenta de origen no pertenece al programa del mint.",
    );
  }

  const destinationOwner = await readAccountOwner(input.connection, destination);
  if (destinationOwner && !destinationOwner.equals(programId)) {
    throw new DomainError(
      "VALIDATION",
      "La cuenta de destino no pertenece al programa del mint.",
    );
  }

  let balance: bigint;
  try {
    const account = await input.connection.getTokenAccountBalance(source, "confirmed");
    balance = BigInt(account.value.amount);
  } catch {
    throw new DomainError("UPSTREAM", "No se pudo leer el saldo de la cuenta de origen.");
  }
  if (balance < input.rawAmount) throw new DomainError("INSUFFICIENT_FUNDS");

  const message = new TransactionMessage({
    payerKey: input.owner,
    recentBlockhash: input.recentBlockhash,
    instructions,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  return {
    transactionBase64: Buffer.from(transaction.serialize()).toString("base64"),
    source,
    destination,
    programId,
  };
}
