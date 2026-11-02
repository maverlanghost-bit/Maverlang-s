import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";

/**
 * Subconjunto local y mínimo de `@solana/spl-token` (0.4.15) para las tres
 * operaciones que usa la app: derivar una ATA, crear una ATA idempotente y
 * transferir tokens. No hay dependencia de `@solana/spl-token` ni de
 * `bigint-buffer`; los bytes se codifican con `Buffer` de Node.
 *
 * Los layouts y las cuentas se copiaron de la implementación instalada de
 * `@solana/spl-token@0.4.15` y se contrastaron con los paquetes oficiales
 * `@solana-program/token` / `@solana-program/token-2022`:
 * - ATA: PDA con seeds `[owner, tokenProgram, mint]` bajo el programa ATA.
 * - CreateIdempotent: data `[1]`, cuentas payer, ATA, owner, mint, system, token.
 * - Transfer: data `[3]` + monto u64 little-endian, cuentas source, destination,
 *   authority (+ firmantes adicionales si el owner es una multisig).
 *
 * Es código de servidor: usa `Buffer`. No importar desde un componente cliente.
 * Las funciones son puras: no leen el entorno ni la cadena.
 */

/** Programa SPL Token clásico (USDC). */
export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
/** Programa Token-2022 (xStocks). */
export const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
);
/** Programa Associated Token Account. */
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

/** Cuenta que puede firmar como autoridad adicional de una multisig. */
export type MultiSigner = PublicKey | { publicKey: PublicKey };

const TRANSFER_INSTRUCTION = 3;
const CREATE_IDEMPOTENT_INSTRUCTION = 1;
const U64_MAX = (BigInt(1) << BigInt(64)) - BigInt(1);

function assertU64(amount: bigint): bigint {
  if (typeof amount !== "bigint") throw new Error("el monto tiene que ser bigint");
  if (amount < BigInt(0) || amount > U64_MAX) {
    throw new Error("monto fuera de rango u64");
  }
  return amount;
}

function signerPublicKey(signer: MultiSigner): PublicKey {
  return signer instanceof PublicKey ? signer : signer.publicKey;
}

function addSigners(
  keys: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>,
  authority: PublicKey,
  multiSigners: readonly MultiSigner[],
): typeof keys {
  if (multiSigners.length > 0) {
    keys.push({ pubkey: authority, isSigner: false, isWritable: false });
    for (const signer of multiSigners) {
      keys.push({
        pubkey: signerPublicKey(signer),
        isSigner: true,
        isWritable: false,
      });
    }
    return keys;
  }
  keys.push({ pubkey: authority, isSigner: true, isWritable: false });
  return keys;
}

/**
 * Dirección de la cuenta asociada (ATA) para `mint` y `owner`.
 * Con `allowOwnerOffCurve=false` exige que el owner esté sobre la curva
 * (una wallet normal); una PDA requiere `true`.
 */
export function getAssociatedTokenAddressSync(
  mint: PublicKey,
  owner: PublicKey,
  allowOwnerOffCurve = false,
  programId: PublicKey = TOKEN_PROGRAM_ID,
  associatedTokenProgramId: PublicKey = ASSOCIATED_TOKEN_PROGRAM_ID,
): PublicKey {
  if (!allowOwnerOffCurve && !PublicKey.isOnCurve(owner.toBuffer())) {
    throw new Error("el owner de la ATA no puede ser una PDA");
  }
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), programId.toBuffer(), mint.toBuffer()],
    associatedTokenProgramId,
  );
  return address;
}

/**
 * Crea una ATA si no existe (idempotente). Si ya existe, la transacción no
 * falla. `programId` es el programa de token dueño del mint (clásico o 2022).
 */
export function createAssociatedTokenAccountIdempotentInstruction(
  payer: PublicKey,
  associatedToken: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  programId: PublicKey = TOKEN_PROGRAM_ID,
  associatedTokenProgramId: PublicKey = ASSOCIATED_TOKEN_PROGRAM_ID,
): TransactionInstruction {
  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: associatedToken, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: false, isWritable: false },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: programId, isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({
    keys,
    programId: associatedTokenProgramId,
    data: Buffer.from([CREATE_IDEMPOTENT_INSTRUCTION]),
  });
}

/**
 * Transfiere `amount` en unidades crudas desde `source` a `destination`.
 * `authority` es el dueño (o delegado) de `source`. Si es una multisig,
 * `multiSigners` lleva las firmas adicionales. `programId` debe corresponder
 * al programa dueño del mint (clásico o Token-2022).
 */
export function createTransferInstruction(
  source: PublicKey,
  destination: PublicKey,
  authority: PublicKey,
  amount: bigint,
  multiSigners: readonly MultiSigner[] = [],
  programId: PublicKey = TOKEN_PROGRAM_ID,
): TransactionInstruction {
  const keys = addSigners(
    [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
    ],
    authority,
    multiSigners,
  );
  const data = Buffer.alloc(9);
  data[0] = TRANSFER_INSTRUCTION;
  data.writeBigUInt64LE(assertU64(amount), 1);
  return new TransactionInstruction({ keys, programId, data });
}
