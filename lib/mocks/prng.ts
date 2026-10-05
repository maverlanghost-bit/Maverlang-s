/** FNV-1a de 32 bits. Misma semilla → misma serie. */
export function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** PRNG en [0, 1). No usa Math.random. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
