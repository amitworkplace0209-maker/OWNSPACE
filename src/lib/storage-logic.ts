/**
 * Pure helpers behind the /storage dashboard.
 *
 * Kept out of `dal/storage.ts` because that file is `server-only`, and the
 * arithmetic here — percentages, rollups, orphan accounting — is exactly the
 * part worth testing without a database.
 */

export type StorageSlice = { key: string; label: string; count: number; sizeBytes: number };

/**
 * Share of a total, as a percentage rounded to one decimal.
 *
 * Returns 0 for an empty total rather than NaN/Infinity: an empty account is
 * a normal state, and rendering "NaN%" would be both wrong and alarming.
 */
export function percentOf(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

/** Clamped percentage for a progress bar, where 0-100 is the valid range. */
export function clampedPercent(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((part / total) * 100)));
}

/** Bytes as a 0-1 fraction, for the width of a stacked bar segment. */
export function shareOf(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(1, part / total));
}

export function sumSizes(slices: StorageSlice[]): number {
  return slices.reduce((total, slice) => total + (slice.sizeBytes || 0), 0);
}

/** Slices ordered by size, biggest first — the order a person cares about. */
export function bySizeDescending(slices: StorageSlice[]): StorageSlice[] {
  return [...slices].sort((a, b) => b.sizeBytes - a.sizeBytes || b.count - a.count);
}

export type HealthLevel = "ok" | "warning" | "critical" | "unknown";

/**
 * Bucket health from the real, API-reported figures only.
 *
 * There is no account-level Supabase storage quota exposed to the app, so the
 * only real ceiling available is the per-object `file_size_limit`. Everything
 * is therefore judged against that, and anything unknown is reported as
 * `unknown` rather than guessed — an invented limit would be worse than none.
 */
export function bucketHealth(input: {
  usedBytes: number;
  /** Total bytes the bucket is allowed, if the platform reported one. */
  limitBytes: number | null;
  /** Largest single object stored, for the per-object limit check. */
  largestObjectBytes: number;
  /** Per-object upload cap configured on the bucket. */
  fileSizeLimitBytes: number | null;
  error?: string | null;
}): HealthLevel {
  if (input.error) return "unknown";
  if (input.limitBytes && input.limitBytes > 0) {
    const used = percentOf(input.usedBytes, input.limitBytes);
    if (used >= 95) return "critical";
    if (used >= 80) return "warning";
    return "ok";
  }
  // No total quota is known, so the best remaining real signal is the
  // per-object cap. Having that cap is enough to call a bucket healthy; only a
  // complete absence of limits leaves the state genuinely unknown.
  if (input.fileSizeLimitBytes && input.fileSizeLimitBytes > 0) {
    if (input.largestObjectBytes <= 0) return "ok";
    const ratio = percentOf(input.largestObjectBytes, input.fileSizeLimitBytes);
    if (ratio >= 95) return "warning";
    return "ok";
  }
  return "unknown";
}

export type OrphanSummary = {
  /** Bytes sitting in storage that no `files` row points at any more. */
  orphanBytes: number;
  orphanCount: number;
  /** True when a scan could not run, so the numbers must not be trusted. */
  unavailable: boolean;
};

/**
 * Reconciles what is actually stored against what the app still tracks.
 *
 * A file whose metadata row was deleted — a project removed, a failed wizard
 * rollback, an interrupted upload — keeps occupying space forever. Showing the
 * difference is the only way the user can find out.
 */
export function summariseOrphans(input: {
  storedBytes: number | null;
  storedCount: number | null;
  trackedBytes: number;
  trackedCount: number;
  error?: string | null;
}): OrphanSummary {
  if (input.error || input.storedBytes === null || input.storedCount === null) {
    return { orphanBytes: 0, orphanCount: 0, unavailable: true };
  }

  // Tracked bytes can exceed stored bytes if a file row survives a blob
  // deletion; the difference is then not an orphan but a dangling reference,
  // so it is clamped to zero rather than reported as negative space.
  const orphanBytes = Math.max(0, input.storedBytes - input.trackedBytes);
  const orphanCount = Math.max(0, input.storedCount - input.trackedCount);

  return { orphanBytes, orphanCount, unavailable: false };
}

export type DriveAccountUsage = {
  connectionId: string;
  email: string;
  label: string | null;
  status: "active" | "revoked" | "error";
  /** Bytes Drive itself reports for this account. */
  quotaUsed: number | null;
  quotaLimit: number | null;
  sharedDriveUsed: number | null;
  sharedDriveLimit: number | null;
  /** Bytes of this account's files linked into the workspace. */
  linkedBytes: number;
  linkedCount: number;
  error: string | null;
};

export type DriveUsageSummary = {
  accounts: DriveAccountUsage[];
  totalQuotaLimit: number;
  totalQuotaUsed: number;
  totalLinkedBytes: number;
  totalLinkedCount: number;
  /** Accounts whose quota could not be read. */
  unavailable: number;
};

/**
 * Rolls several Drive accounts into one summary.
 *
 * Accounts keep their own rows regardless — `docs/STORAGE.md` requires the two
 * providers stay visually separate, so this total is for the KPI strip only.
 */
export function summariseDriveUsage(accounts: DriveAccountUsage[]): DriveUsageSummary {
  const withQuota = accounts.filter(
    (account) => account.quotaLimit !== null && account.quotaUsed !== null
  );

  return {
    accounts,
    // Only accounts that actually reported a quota contribute, otherwise one
    // unknown account would silently zero out the total.
    totalQuotaLimit: withQuota.reduce((sum, account) => sum + (account.quotaLimit ?? 0), 0),
    totalQuotaUsed: withQuota.reduce((sum, account) => sum + (account.quotaUsed ?? 0), 0),
    totalLinkedBytes: accounts.reduce((sum, account) => sum + account.linkedBytes, 0),
    totalLinkedCount: accounts.reduce((sum, account) => sum + account.linkedCount, 0),
    unavailable: accounts.filter((account) => account.quotaLimit === null).length,
  };
}

/** "3 of 5 files" style summary, skipping the part that is zero. */
export function describeCounts(counts: Array<{ count: number; label: string }>): string {
  const present = counts.filter((entry) => entry.count > 0);
  if (present.length === 0) return "none";
  return present.map((entry) => `${entry.count} ${entry.label}`).join(", ");
}