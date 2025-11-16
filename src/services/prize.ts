export function estimatedPrizeBps(topN: number): number[] {
  if (topN <= 0) return [];
  if (topN === 1) return [10000];
  if (topN === 3) return [5000, 3000, 2000];
  // Equal split fallback
  const base = Math.floor(10000 / topN);
  const arr = new Array(topN).fill(base);
  let remainder = 10000 - base * topN;
  for (let i = 0; i < arr.length && remainder > 0; i++, remainder--) arr[i]++;
  return arr;
}