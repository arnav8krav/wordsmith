const DAY_MS = 86_400_000;

export type Weightable = {
  times_seen: number;
  times_revealed: number;
  times_used_correctly: number;
  last_seen_at: number | null;
};

/**
 * How eagerly a previously met word should resurface. Words are never banned:
 * every word keeps a floor weight, so archived words can always come back.
 * Revealed or flagged words and words not seen in a while weigh more; words the
 * user has already used correctly weigh less.
 */
export function weightWord(w: Weightable, now = Date.now()): number {
  const days = w.last_seen_at == null ? 30 : (now - w.last_seen_at) / DAY_MS;
  const recency = Math.min(Math.max(days, 0), 30) / 30;
  const seen = Math.max(w.times_seen, 1);
  const revealRate = w.times_revealed / seen;
  const masteryRate = w.times_used_correctly / seen;
  return Math.max(0.1, 0.5 + 1.5 * revealRate + 1.0 * recency - 0.8 * masteryRate);
}

/** Weighted sampling without replacement. */
export function sampleWeighted<T extends Weightable>(
  items: T[],
  n: number,
  now = Date.now(),
  rng: () => number = Math.random,
): T[] {
  const pool = items.map((item) => ({ item, weight: weightWord(item, now) }));
  const picked: T[] = [];
  while (picked.length < n && pool.length > 0) {
    const total = pool.reduce((sum, p) => sum + p.weight, 0);
    let r = rng() * total;
    let idx = pool.findIndex((p) => (r -= p.weight) < 0);
    if (idx === -1) idx = pool.length - 1;
    picked.push(pool[idx].item);
    pool.splice(idx, 1);
  }
  return picked;
}
