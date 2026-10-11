import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/dal";
import type { StoredFile } from "@/types";

export type StorageCategory = {
  key: string;
  label: string;
  count: number;
  sizeBytes: number;
};

export type StorageStats = {
  usedBytes: number;
  fileCount: number;
  byCategory: StorageCategory[];
};

export function categorizeFile(file: { name: string; mime_type: string | null }): string {
  const mime = file.mime_type?.toLowerCase() ?? "";
  const name = file.name.toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() ?? "" : "";

  if (mime.startsWith("image/")) return "Images";
  if (mime.startsWith("video/")) return "Videos";
  if (mime === "application/pdf" || ext === "pdf") return "PDF";
  if (mime.startsWith("text/") || mime === "application/json" || mime === "application/xml") return "Documents";
  if (["zip", "gz", "tar", "rar", "7z", "bz2"].includes(ext) || mime.includes("zip") || mime.includes("compressed")) return "ZIP";
  if (["ts", "tsx", "js", "jsx", "py", "go", "rs", "java", "cpp", "c", "h", "rb", "php", "sql", "json", "css", "html", "yml", "yaml", "toml", "md", "sh"].includes(ext)) return "Source Code";
  return "Other";
}

export const storageCategoryOrder = [
  "Images",
  "Videos",
  "PDF",
  "Documents",
  "ZIP",
  "Source Code",
  "Other",
];

/** Real storage statistics computed from the files table. */
export const getStorageStats = cache(async (): Promise<StorageStats> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("files")
    .select("name, mime_type, size_bytes")
    .eq("user_id", user.id);

  if (error || !data) {
    return { usedBytes: 0, fileCount: 0, byCategory: [] };
  }

  const totals = new Map<string, { count: number; sizeBytes: number }>();
  let usedBytes = 0;

  for (const file of data as StoredFile[]) {
    const key = categorizeFile(file);
    const entry = totals.get(key) ?? { count: 0, sizeBytes: 0 };
    entry.count += 1;
    entry.sizeBytes += file.size_bytes ?? 0;
    totals.set(key, entry);
    usedBytes += file.size_bytes ?? 0;
  }

  const byCategory = storageCategoryOrder
    .filter((key) => totals.has(key))
    .map((key) => {
      const entry = totals.get(key)!;
      return { key, label: key, count: entry.count, sizeBytes: entry.sizeBytes };
    });

  return { usedBytes, fileCount: data.length, byCategory };
});

/** Files with their computed category, for listing and filtering. */
export const getCategorizedFiles = cache(
  async (
    options: { limit?: number; category?: string } = {}
  ): Promise<Array<StoredFile & { category: string }>> => {
    const user = await requireUser();
    const supabase = await createClient();

    let query = supabase
      .from("files")
      .select("*, project:projects(id, name, color), task:tasks(id, title)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    // Filtering happens in JS (category is derived from mime/extension), so when
    // a category is requested we must load before filtering; otherwise the DB
    // limit is safe to apply up front.
    if (options.limit && !options.category) query = query.limit(options.limit);

    const { data, error } = await query;
    if (error || !data) return [];

    let rows = (data as unknown as StoredFile[]).map((file) => ({
      ...file,
      category: categorizeFile(file),
    }));

    if (options.category) {
      rows = rows.filter((file) => file.category === options.category);
    }
    if (options.limit) rows = rows.slice(0, options.limit);

    return rows;
  }
);
// ---------------------------------------------------------------------------
// Real bucket usage
// ---------------------------------------------------------------------------

/** The bucket every upload in this app lands in. */
export const FILES_BUCKET = "ownspece-files";

export type StorageObjectRow = {
  name: string;
  sizeBytes: number;
  mimeType: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type BucketReport = {
  bucket: string;
  public: boolean;
  /** Per-object upload cap, from the bucket's own configuration. */
  fileSizeLimitBytes: number | null;
  /** Bytes actually present in the bucket for this user. */
  storedBytes: number;
  storedCount: number;
  largestObjectBytes: number;
  /** True when the listing could not run, so the numbers are not trustworthy. */
  unavailable: boolean;
};

/**
 * What is *actually* sitting in Supabase Storage for this user.
 *
 * `getStorageStats` counts rows in the `files` table, which only knows about
 * objects the app still tracks. A blob whose metadata row was deleted — a
 * project removed, an interrupted wizard rollback — keeps consuming space with
 * nothing pointing at it. Listing the bucket finds those.
 *
 * The listing is RLS-scoped to the caller's own folder, so this cannot leak
 * another user's objects.
 */
export const getBucketUsage = cache(async (bucket = FILES_BUCKET): Promise<BucketReport> => {
  const user = await requireUser();
  const supabase = await createClient();

  const report: BucketReport = {
    bucket,
    public: false,
    fileSizeLimitBytes: null,
    storedBytes: 0,
    storedCount: 0,
    largestObjectBytes: 0,
    unavailable: false,
  };

  const folder = user.id;

  // Walk the bucket. The API pages at 1000 and reports a `size` per object.
  try {
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage.from(bucket).list(folder, {
        limit: 1000,
        offset,
      });
      if (error) {
        report.unavailable = true;
        break;
      }

      const objects = data ?? [];
      for (const object of objects) {
        // Folders come back as entries with a null size.
        const size = Number(object.metadata?.size ?? 0);
        if (!Number.isFinite(size)) continue;
        report.storedCount += 1;
        report.storedBytes += size;
        if (size > report.largestObjectBytes) report.largestObjectBytes = size;
      }

      if (objects.length < 1000) break;
      offset += 1000;
      if (offset > 50_000) break;
    }
  } catch {
    report.unavailable = true;
  }

  return report;
});

export type BucketConfig = {
  name: string;
  public: boolean;
  fileSizeLimitBytes: number | null;
  allowedMimeTypes: string[] | null;
};

/**
 * Bucket configuration, read with the service-role client.
 *
 * `storage.buckets` has no RLS policy for the anon/session key, so
 * `listBuckets()` on the normal client returns nothing. The service role can
 * read it. This is read-only configuration — never file contents.
 */
export const getBucketConfigs = cache(async (): Promise<{
  configs: BucketConfig[];
  error: string | null;
}> => {
  try {
    const admin = getAdminClient();

    const { data, error } = await admin.storage.listBuckets();
    if (error) return { configs: [], error: error.message };
    if (!data) return { configs: [], error: null };

    return {
      configs: data.map((bucket) => ({
        name: bucket.name,
        public: bucket.public ?? false,
        fileSizeLimitBytes:
          typeof bucket.file_size_limit === "number" && bucket.file_size_limit > 0
            ? bucket.file_size_limit
            : null,
        allowedMimeTypes: bucket.allowed_mime_types ?? null,
      })),
      error: null,
    };
  } catch (err) {
    return {
      configs: [],
      error: err instanceof Error ? err.message : "Could not read bucket settings.",
    };
  }
});

/**
 * Objects present in the bucket that no `files` row points at.
 *
 * These are the ones worth flagging: nothing in the UI can reach them, but
 * they still occupy storage.
 */
export const getUntrackedObjects = cache(async (bucket = FILES_BUCKET): Promise<{
  objects: StorageObjectRow[];
  untrackedBytes: number;
  error: string | null;
}> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: trackedRows, error: trackedError } = await supabase
    .from("files")
    .select("storage_path")
    .eq("user_id", user.id);

  const tracked = new Set(
    ((trackedRows ?? []) as Array<{ storage_path: string }>).map((row) => row.storage_path)
  );

  const objects: StorageObjectRow[] = [];
  let untrackedBytes = 0;

  try {
    const listing = await supabase.storage.from(bucket).list(user.id, { limit: 1000 });
    if (listing.error) {
      return { objects: [], untrackedBytes: 0, error: listing.error.message };
    }

    for (const object of listing.data ?? []) {
      const path = `${user.id}/${object.name}`;
      if (tracked.has(path)) continue;

      const size = Number(object.metadata?.size ?? 0);
      const safeSize = Number.isFinite(size) ? size : 0;
      untrackedBytes += safeSize;
      objects.push({
        name: object.name,
        sizeBytes: safeSize,
        mimeType: (object.metadata?.mimetype as string | undefined) ?? null,
        createdAt: object.created_at ?? null,
        updatedAt: object.updated_at ?? null,
      });
    }
  } catch (err) {
    return {
      objects: [],
      untrackedBytes: 0,
      error: err instanceof Error ? err.message : "Could not list the bucket.",
    };
  }

  // A metadata read failure must not be reported as "nothing is orphaned".
  if (trackedError) {
    return { objects, untrackedBytes: 0, error: trackedError.message };
  }

  return { objects, untrackedBytes, error: null };
});
