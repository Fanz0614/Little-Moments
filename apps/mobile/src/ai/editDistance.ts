/**
 * Levenshtein distance over code points (an emoji is one edit, like
 * charCount in ai-contracts). Used for the "how much did the user change the
 * AI caption" metric; texts are at most a few hundred characters.
 */
export function editDistance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  if (x.length === 0) return y.length;
  if (y.length === 0) return x.length;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[y.length]!;
}

/** 0 = untouched, 1 = completely rewritten (relative to the longer text). */
export function editRatio(original: string, final: string): number {
  const longest = Math.max([...original].length, [...final].length);
  return longest === 0 ? 0 : Math.round((editDistance(original, final) / longest) * 1000) / 1000;
}
