/** Small bounded read batches. A failed batch rejects the read instead of inventing partial totals. */
export async function readBatches<T, R>(items: readonly T[], size: number, read: (batch: readonly T[]) => Promise<readonly R[]>): Promise<R[]> {
  if (!Number.isInteger(size) || size < 1) throw new RangeError("Batch size must be a positive integer");
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  const results: R[][] = chunks.map(() => []);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(2, chunks.length) }, async () => {
    while (cursor < chunks.length) {
      const index = cursor++;
      results[index] = [...await read(chunks[index]!)];
    }
  }));
  return results.flat();
}
