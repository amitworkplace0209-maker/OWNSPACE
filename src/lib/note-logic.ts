import type { Note } from "@/types";

/** A note plus the joins the list needs to render without a second query. */
export type NoteListItem = Note & {
  tag_names: string[];
  project_name: string | null;
  project_color: string | null;
  /** Set when the note is filed under a project section rather than just the project. */
  node_name: string | null;
};

/**
 * Plain-text preview of a note body for card summaries and search results.
 *
 * Markdown fences, headings and links are stripped rather than rendered: this
 * only has to look right inside a three-line card, and the detail page is
 * where the real rendering happens.
 */
export function excerpt(content: string, maxLength = 180): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/(\*\*|__|\*|_|~~)/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength).trimEnd()}…`;
}

export type NoteWordCount = { words: number; characters: number; readingMinutes: number };

/** Rough reading time at 200wpm; shown next to long notes. */
export function noteSize(content: string): NoteWordCount {
  const trimmed = content.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  return {
    words,
    characters: trimmed.length,
    readingMinutes: Math.max(1, Math.ceil(words / 200)),
  };
}

export type NoteFilterState = {
  query: string;
  projectId: string;
  /** "all" mixes project notes with personal ones; "personal" excludes project notes. */
  scope: "all" | "personal";
  pinned: boolean;
  favorited: boolean;
  tag: string;
};

export type NoteSort = "updated" | "created" | "title";

/**
 * Applies every filter in one place so the grid, the stat tiles and the empty
 * state can never disagree about what is visible.
 */
export function applyNoteFilters(
  notes: NoteListItem[],
  filter: NoteFilterState
): NoteListItem[] {
  const needle = filter.query.trim().toLowerCase();

  return notes.filter((note) => {
    if (filter.scope === "personal" && note.project_id) return false;
    if (filter.projectId && note.project_id !== filter.projectId) return false;
    if (filter.pinned && !note.is_pinned) return false;
    if (filter.favorited && !note.is_favorited) return false;
    if (filter.tag && !note.tag_names.includes(filter.tag)) return false;

    // Search reaches the body, not just the title: notes are usually
    // remembered by a phrase inside them.
    if (needle) {
      const haystack = [
        note.title,
        excerpt(note.content, 4000),
        note.project_name ?? "",
        ...note.tag_names,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

/**
 * Pinned notes float to the top regardless of the chosen sort — a pin is a
 * statement that this note outranks the rest.
 */
export function sortNotes(notes: NoteListItem[], sort: NoteSort = "updated"): NoteListItem[] {
  return [...notes].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;

    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "created") return b.created_at.localeCompare(a.created_at);
    return b.updated_at.localeCompare(a.updated_at);
  });
}

export type NoteStats = {
  total: number;
  pinned: number;
  favorited: number;
  /** Touched within the last 7 days. */
  recent: number;
  personal: number;
  empty: number;
  tags: number;
  byProject: Record<string, number>;
  /** Share of notes that are pinned or starred, 0-100. */
  curatedRate: number;
};

/**
 * Computed from the same array the grid renders, never from a second
 * aggregate query — otherwise the tiles above the list drift from the list.
 */
export function computeNoteStats(
  notes: NoteListItem[],
  now: Date = new Date()
): NoteStats {
  const stats: NoteStats = {
    total: notes.length,
    pinned: 0,
    favorited: 0,
    recent: 0,
    personal: 0,
    empty: 0,
    tags: 0,
    byProject: {},
    curatedRate: 0,
  };

  const weekAgo = now.getTime() - 7 * 86_400_000;
  const allTags = new Set<string>();
  let curated = 0;

  for (const note of notes) {
    if (note.is_pinned) stats.pinned += 1;
    if (note.is_favorited) stats.favorited += 1;
    if (note.is_pinned || note.is_favorited) curated += 1;
    if (!note.content.trim()) stats.empty += 1;
    if (!note.project_id) stats.personal += 1;

    if (new Date(note.updated_at).getTime() >= weekAgo) stats.recent += 1;

    for (const tag of note.tag_names) allTags.add(tag);
    const key = note.project_id ?? "personal";
    stats.byProject[key] = (stats.byProject[key] ?? 0) + 1;
  }

  stats.tags = allTags.size;
  stats.curatedRate = notes.length === 0 ? 0 : Math.round((curated / notes.length) * 100);
  return stats;
}

export type NoteGrouping = "none" | "project" | "tag" | "updated";

export type NoteGroup = { id: string; label: string; items: NoteListItem[] };

/**
 * Buckets for the list view. "Untitled bucket" style groups are avoided — a
 * project group with no project is explicitly "Personal notes".
 */
export function groupNotes(
  notes: NoteListItem[],
  grouped: NoteGrouping,
  now: Date = new Date()
): NoteGroup[] {
  if (grouped === "none") return [{ id: "all", label: "All notes", items: notes }];

  const buckets = new Map<string, NoteGroup>();
  const ensure = (id: string, label: string): NoteGroup => {
    let bucket = buckets.get(id);
    if (!bucket) {
      bucket = { id, label, items: [] };
      buckets.set(id, bucket);
    }
    return bucket;
  };

  for (const note of notes) {
    if (grouped === "project") {
      ensure(note.project_id ?? "personal", note.project_name ?? "Personal notes").items.push(note);
      continue;
    }
    if (grouped === "tag") {
      if (note.tag_names.length === 0) {
        ensure("untagged", "Untagged").items.push(note);
        continue;
      }
      for (const tag of note.tag_names) ensure(tag, tag).items.push(note);
      continue;
    }
    ensure(bucketForUpdated(note, now), bucketForUpdated(note, now)).items.push(note);
  }

  // Most recent bucket first, which is also the reading order for the
  // "group by updated" view.
  return [...buckets.values()].sort((a, b) => b.id.localeCompare(a.id));
}

/** "Today" / "Yesterday" / "This week" / "Earlier". */
export function bucketForUpdated(note: Note, now: Date = new Date()): string {
  const at = new Date(note.updated_at).getTime();
  if (Number.isNaN(at)) return "earlier";

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const startOfWeek = startOfToday - 6 * 86_400_000;

  if (at >= startOfToday) return "today";
  if (at >= startOfYesterday) return "yesterday";
  if (at >= startOfWeek) return "week";
  return "earlier";
}

export const UPDATED_BUCKET_LABEL: Record<string, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "Earlier this week",
  earlier: "Older",
};

/** Every tag in use, sorted, for the toolbar's tag filter. */
export function allTags(notes: NoteListItem[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const note of notes) {
    for (const tag of note.tag_names) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Deterministic colour per tag, so the same tag always reads the same way. */
export function tagHue(tag: string): number {
  let hash = 0;
  for (let index = 0; index < tag.length; index += 1) {
    hash = (hash * 31 + tag.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 360;
}