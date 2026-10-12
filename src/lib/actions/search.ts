"use server";

import { searchAll } from "@/lib/dal/search";

export type PaletteHit = {
  id: string;
  kind: string;
  title: string;
  /** Optional, and the DAL leaves it undefined where it has nothing to add. */
  subtitle?: string | null;
  href: string;
};

export type PaletteSearchResult = {
  hits: PaletteHit[];
  /** How many matched in total, so the palette can say "showing 12 of 40". */
  total: number;
};

/**
 * Workspace search, for the command palette.
 *
 * The palette is the only search surface now, so this returns one flat list
 * rather than the seven buckets the old results page drew — the palette groups
 * them itself, and a flat shape is what a keyboard-driven list wants.
 *
 * Capped per kind rather than in total: a search for "a" would otherwise return
 * fifteen tasks and nothing else, which is a worse answer than three of each.
 */
export async function workspaceSearchAction(
  query: string
): Promise<{ error?: string } & PaletteSearchResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { hits: [], total: 0 };

  const results = await searchAll(trimmed);

  const flat: PaletteHit[] = [
    ...results.projects,
    ...results.tasks,
    ...results.notes,
    ...results.wiki,
    ...results.dailyNotes,
    ...results.files,
    ...results.milestones,
  ];

  // Five of each kind, then a hard ceiling, so the list stays scrollable rather
  // than becoming a second page.
  const perKind = new Map<string, number>();
  const hits = flat
    .filter((hit) => {
      const seen = perKind.get(hit.kind) ?? 0;
      if (seen >= 5) return false;
      perKind.set(hit.kind, seen + 1);
      return true;
    })
    .slice(0, 25);

  return { hits, total: flat.length };
}
