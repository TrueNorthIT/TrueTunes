export function applyReorderLocally<T>(items: T[], fromIndices: number[], toIndex: number): T[] {
  const selectedSet = new Set(fromIndices);
  const remaining = items.filter((_, i) => !selectedSet.has(i));
  const origNonSelected = items.flatMap((_, i) => (selectedSet.has(i) ? [] : [i]));
  const insertAt = origNonSelected.filter(i => i < toIndex).length;
  const movers = [...fromIndices].sort((a, b) => a - b).map(i => items[i]);
  return [...remaining.slice(0, insertAt), ...movers, ...remaining.slice(insertAt)];
}
