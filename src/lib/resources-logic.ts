import type { ResourceType } from "@/types";

/**
 * Workspace resources — pure logic.
 *
 * Three unrelated tables become one list on the Resources page, so the rules
 * about what a resource *is*, how it is labelled and how the rollups are
 * computed live here rather than in a component where they cannot be tested.
 *
 * The one invariant worth stating: a Drive byte and a Supabase byte are never
 * summed into a single "used" figure, because they do not share a quota. The
 * total row reports counts, and size is reported per source.
 */

export const RESOURCE_SOURCES = ["supabase", "drive", "link"] as const;
export type ResourceSource = (typeof RESOURCE_SOURCES)[number];

export type ResourceKind = ResourceType;

/** One row on the Resources page, whichever table it came from. */
export type ResourceItem = {
  /** Stable across renders: `${source}:${id}`. */
  key: string;
  source: ResourceSource;
  /** Row id in its own table. */
  id: string;
  kind: ResourceKind;
  name: string;
  description: string | null;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  taskId: string | null;
  taskTitle: string | null;
  noteId: string | null;
  noteTitle: string | null;
  /** Which Google account, for Drive rows. */
  accountEmail: string | null;
  tags: string[];
  createdAt: string;
};

export const KIND_LABELS: Record<ResourceKind, string> = {
  link: "Link",
  file: "File",
  google_drive: "Google Drive",
  supabase_file: "Stored file",
  note: "Note",
  document: "Document",
  repository: "Repository",
  api: "API docs",
  video: "Video",
  image: "Image",
  custom: "Other",
};

export const SOURCE_LABELS: Record<ResourceSource, string> = {
  supabase: "App storage",
  drive: "Google Drive",
  link: "Link",
};

/**
 * Which kinds each source can produce.
 *
 * The Add form uses this to decide which kind list to offer, so it is not
 * possible to pick "Google Drive" and then be asked to upload a local file.
 */
export const KINDS_BY_SOURCE: Record<ResourceSource, ResourceKind[]> = {
  supabase: ["supabase_file", "file", "document", "image", "video"],
  // A Drive row's kind is fixed by where the bytes live, not by what the user
  // calls it — offering "document" here would produce a row the write path
  // rejects. Drive files also carry Drive's own mime type.
  drive: ["google_drive"],
  link: ["link", "repository", "api", "video", "image", "document", "note", "custom"],
};

/** Kinds that cannot be saved without something to point at. */
export const URL_KINDS: ResourceKind[] = [
  "link",
  "repository",
  "api",
  "video",
  "image",
  "document",
];

/** Kinds whose content has to come from a file, not a URL. */
export const FILE_KINDS: ResourceKind[] = [
  "supabase_file",
  "file",
  "google_drive",
];

/** Where a kind's bytes are accounted, for the per-source size rollup. */
export function byteSourceFor(item: ResourceItem): ResourceSource | null {
  if (item.sizeBytes == null) return null;
  if (item.source === "drive") return "drive";
  if (item.source === "supabase") return "supabase";
  return null;
}

/** True when the kind needs a URL rather than an uploaded file. */
export function kindNeedsUrl(kind: ResourceKind): boolean {
  return URL_KINDS.includes(kind);
}

/** True when the kind needs a file from the device or Drive. */
export function kindNeedsFile(kind: ResourceKind): boolean {
  return FILE_KINDS.includes(kind);
}

export function kindLabel(kind: ResourceKind): string {
  return KIND_LABELS[kind] ?? kind;
}

export function sourceLabel(source: ResourceSource): string {
  return SOURCE_LABELS[source] ?? source;
}

// ---------------------------------------------------------------------------
// Filtering, grouping, sorting
// ---------------------------------------------------------------------------

export type ResourceFilterState = {
  query: string;
  sources: ResourceSource[];
  kinds: ResourceKind[];
  projectId: string | null;
  taskId: string | null;
};

export const EMPTY_RESOURCE_FILTERS: ResourceFilterState = {
  query: "",
  sources: [],
  kinds: [],
  projectId: null,
  taskId: null,
};

export type ResourceGrouping = "none" | "project" | "source" | "kind";

export type ResourceGroup = { id: string; label: string; items: ResourceItem[] };

/**
 * Applies every filter at once.
 *
 * Search reaches the name, description, tags, project name and task title —
 * the name alone stops being enough the moment a workspace has more than a
 * handful of projects.
 */
export function filterResources(
  items: ResourceItem[],
  filters: ResourceFilterState
): ResourceItem[] {
  const needle = filters.query.trim().toLowerCase();

  return items.filter((item) => {
    if (filters.sources.length > 0 && !filters.sources.includes(item.source)) return false;
    if (filters.kinds.length > 0 && !filters.kinds.includes(item.kind)) return false;
    if (filters.projectId && item.projectId !== filters.projectId) return false;
    if (filters.taskId && item.taskId !== filters.taskId) return false;

    if (!needle) return true;
    const haystack = [
      item.name,
      item.description ?? "",
      item.projectName ?? "",
      item.taskTitle ?? "",
      item.noteTitle ?? "",
      item.accountEmail ?? "",
      ...item.tags,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function groupResources(
  items: ResourceItem[],
  grouping: ResourceGrouping
): ResourceGroup[] {
  if (grouping === "none") return [{ id: "all", label: "All resources", items }];

  const buckets = new Map<string, ResourceGroup>();
  const ensure = (id: string, label: string): ResourceGroup => {
    const existing = buckets.get(id);
    if (existing) return existing;
    const created: ResourceGroup = { id, label, items: [] };
    buckets.set(id, created);
    return created;
  };

  for (const item of items) {
    if (grouping === "project") {
      const id = item.projectId ?? "none";
      ensure(id, item.projectName ?? "No project");
      buckets.get(id)!.items.push(item);
    } else if (grouping === "source") {
      ensure(item.source, sourceLabel(item.source));
      buckets.get(item.source)!.items.push(item);
    } else if (grouping === "kind") {
      ensure(item.kind, kindLabel(item.kind));
      buckets.get(item.kind)!.items.push(item);
    }
  }

  // Biggest group first: the point of grouping is to lead with where the bulk
  // of the work is, not to alphabetise the buckets.
  return [...buckets.values()].sort(
    (a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label)
  );
}

export type ResourceSort = "recent" | "oldest" | "name" | "size";

export function sortResources(
  items: ResourceItem[],
  sort: ResourceSort
): ResourceItem[] {
  const list = [...items];
  if (sort === "oldest") {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } else if (sort === "name") {
    list.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === "size") {
    list.sort((a, b) => (b.sizeBytes ?? -1) - (a.sizeBytes ?? -1));
  } else {
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return list;
}

// ---------------------------------------------------------------------------
// Rollups
// ---------------------------------------------------------------------------

export type ResourceSummary = {
  total: number;
  bySource: Record<ResourceSource, number>;
  byKind: Record<string, number>;
  /** Bytes per source. Never summed across sources — no shared quota. */
  bytesBySource: Record<ResourceSource, number>;
  /** Distinct projects that have at least one resource. */
  projectCount: number;
  /** Resources not attached to any project. */
  unattached: number;
  linkedToTask: number;
  linkedToNote: number;
};

/**
 * Counts for the stat strip.
 *
 * Derived from the same rows the grid renders, so a number can never disagree
 * with what is on screen.
 */
export function summariseResources(items: ResourceItem[]): ResourceSummary {
  const summary: ResourceSummary = {
    total: items.length,
    bySource: { supabase: 0, drive: 0, link: 0 },
    byKind: {},
    bytesBySource: { supabase: 0, drive: 0, link: 0 },
    projectCount: 0,
    unattached: 0,
    linkedToTask: 0,
    linkedToNote: 0,
  };

  const projects = new Set<string>();

  for (const item of items) {
    summary.bySource[item.source] += 1;
    summary.byKind[item.kind] = (summary.byKind[item.kind] ?? 0) + 1;

    const bytes = byteSourceFor(item);
    if (bytes) summary.bytesBySource[bytes] += item.sizeBytes ?? 0;

    if (item.projectId) projects.add(item.projectId);
    else summary.unattached += 1;
    if (item.taskId) summary.linkedToTask += 1;
    if (item.noteId) summary.linkedToNote += 1;
  }

  summary.projectCount = projects.size;
  return summary;
}

/** Which filters are active, for the "N filters" hint on the clear button. */
export function activeFilterCount(filters: ResourceFilterState): number {
  let count = 0;
  if (filters.query.trim()) count += 1;
  if (filters.sources.length > 0) count += 1;
  if (filters.kinds.length > 0) count += 1;
  if (filters.projectId) count += 1;
  if (filters.taskId) count += 1;
  return count;
}

// ---------------------------------------------------------------------------
// Upload validation
// ---------------------------------------------------------------------------

/** Matches the bucket's own `file_size_limit` from migration 010. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export type UploadValidation = { ok: true } | { ok: false; error: string };

/**
 * Client-side size check, so an oversized file is refused before the upload
 * starts instead of after the bytes have crossed the network.
 *
 * The server checks again — this is a courtesy, not the guard.
 */
export function validateUploadSize(
  bytes: number,
  limit = MAX_UPLOAD_BYTES
): UploadValidation {
  if (bytes <= 0) return { ok: false, error: "That file is empty." };
  if (bytes > limit) {
    return { ok: false, error: `That file is larger than the ${describeLimit(limit)} limit.` };
  }
  return { ok: true };
}

/**
 * A limit in the largest unit that still reads as a whole number.
 *
 * Rounding a sub-megabyte limit to megabytes would render "0 MB", which tells
 * the user nothing about how big the file actually was allowed to be.
 */
function describeLimit(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
  }
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Bytes as a compact human string, for the stat tiles. */
export function formatBytesShort(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}