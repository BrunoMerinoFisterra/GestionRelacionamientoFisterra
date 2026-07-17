import type { DashboardSummary } from "./types";

interface SummaryCacheEntry {
  expiresAt: number;
  value?: DashboardSummary;
  pending?: Promise<DashboardSummary>;
}

const entries = new Map<string, SummaryCacheEntry>();
const MAX_ENTRIES = 250;

function ttlMilliseconds() {
  const configured = Number(process.env.SUMMARY_CACHE_TTL_SECONDS);
  const seconds = Number.isFinite(configured) ? Math.min(86_400, Math.max(60, configured)) : 3_600;
  return seconds * 1_000;
}

function prune(now: number) {
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now && !entry.pending) entries.delete(key);
  }
  while (entries.size >= MAX_ENTRIES) {
    const oldestKey = entries.keys().next().value as string | undefined;
    if (!oldestKey) break;
    entries.delete(oldestKey);
  }
}

export async function getCachedSummary(
  key: string,
  loader: () => Promise<DashboardSummary> | DashboardSummary,
) {
  const now = Date.now();
  const existing = entries.get(key);
  if (existing?.value && existing.expiresAt > now) return existing.value;
  if (existing?.pending) return existing.pending;

  prune(now);
  const expiresAt = now + ttlMilliseconds();
  const pending = Promise.resolve(loader())
    .then((value) => {
      entries.set(key, { value, expiresAt });
      return value;
    })
    .catch((error) => {
      entries.delete(key);
      throw error;
    });
  entries.set(key, { pending, expiresAt });
  return pending;
}

export function clearSummaryCache() {
  entries.clear();
}
