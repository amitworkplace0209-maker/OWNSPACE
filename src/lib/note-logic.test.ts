import { describe, expect, it } from "vitest";
import {
  UPDATED_BUCKET_LABEL,
  allTags,
  applyNoteFilters,
  bucketForUpdated,
  computeNoteStats,
  excerpt,
  groupNotes,
  noteSize,
  sortNotes,
  tagHue,
  type NoteFilterState,
  type NoteListItem,
} from "@/lib/note-logic";

const NOW = new Date("2026-03-10T12:00:00");

function note(over: Partial<NoteListItem> = {}): NoteListItem {
  return {
    id: "n1",
    user_id: "u1",
    project_id: null,
    node_id: null,
    title: "Meeting notes",
    content: "Some body text about the release.",
    is_pinned: false,
    is_favorited: false,
    color: null,
    sort_order: 0,
    created_at: "2026-03-01T10:00:00.000Z",
    updated_at: "2026-03-09T10:00:00.000Z",
    tag_names: [],
    project_name: null,
    project_color: null,
    node_name: null,
    ...over,
  };
}

const filter = (over: Partial<NoteFilterState> = {}): NoteFilterState => ({
  query: "",
  projectId: "",
  scope: "all",
  pinned: false,
  favorited: false,
  tag: "",
  ...over,
});

describe("excerpt", () => {
  it("strips markdown syntax down to readable text", () => {
    expect(excerpt("# Title\n\n**bold** and `code`")).toBe("Title bold and code");
  });

  it("keeps the link text but drops the URL", () => {
    expect(excerpt("See [the docs](https://example.com) now")).toBe("See the docs now");
  });

  it("removes fenced code blocks entirely", () => {
    expect(excerpt("before\n```js\nconst x = 1;\n```\nafter")).toBe("before after");
  });

  it("collapses whitespace", () => {
    expect(excerpt("a\n\n\nb   c")).toBe("a b c");
  });

  it("truncates with an ellipsis", () => {
    const result = excerpt("word ".repeat(100), 20);
    expect(result.length).toBeLessThanOrEqual(21);
    expect(result.endsWith("…")).toBe(true);
  });

  it("returns an empty string for empty content", () => {
    expect(excerpt("")).toBe("");
  });
});

describe("noteSize", () => {
  it("counts words and estimates reading time", () => {
    expect(noteSize("one two three")).toMatchObject({ words: 3, readingMinutes: 1 });
  });

  it("reports zero for blank content", () => {
    expect(noteSize("   ").words).toBe(0);
  });
});

describe("applyNoteFilters", () => {
  const items = [
    note({ id: "a", title: "Roadmap", project_id: "p1", project_name: "Home", tag_names: ["plan"] }),
    note({ id: "b", title: "Groceries", content: "milk and bread" }),
    note({ id: "c", title: "Ideas", project_id: "p1", is_pinned: true }),
    note({ id: "d", title: "Archive", is_favorited: true, tag_names: ["plan"] }),
  ];

  it("returns everything with an empty filter", () => {
    expect(applyNoteFilters(items, filter())).toHaveLength(4);
  });

  it("filters to personal notes", () => {
    expect(applyNoteFilters(items, filter({ scope: "personal" })).map((n) => n.id)).toEqual(["b", "d"]);
  });

  it("filters to one project", () => {
    expect(applyNoteFilters(items, filter({ projectId: "p1" })).map((n) => n.id)).toEqual(["a", "c"]);
  });

  it("filters by pinned and favourited", () => {
    expect(applyNoteFilters(items, filter({ pinned: true })).map((n) => n.id)).toEqual(["c"]);
    expect(applyNoteFilters(items, filter({ favorited: true })).map((n) => n.id)).toEqual(["d"]);
  });

  it("filters by tag", () => {
    expect(applyNoteFilters(items, filter({ tag: "plan" })).map((n) => n.id)).toEqual(["a", "d"]);
  });

  it("searches the body, not just the title", () => {
    const result = applyNoteFilters(items, filter({ query: "milk" }));
    expect(result.map((n) => n.id)).toEqual(["b"]);
  });

  it("searches the title too", () => {
    expect(applyNoteFilters(items, filter({ query: "roadmap" })).map((n) => n.id)).toEqual(["a"]);
  });

  it("searches inside markdown without matching the syntax", () => {
    const items2 = [note({ id: "x", content: "see **important**" })];
    expect(applyNoteFilters(items2, filter({ query: "important" }))).toHaveLength(1);
  });
});

describe("sortNotes", () => {
  it("floats pinned notes to the top whatever the sort", () => {
    const sorted = sortNotes([
      note({ id: "old", updated_at: "2026-03-01T00:00:00.000Z" }),
      note({ id: "pinned", is_pinned: true, updated_at: "2020-01-01T00:00:00.000Z" }),
    ]);
    expect(sorted[0].id).toBe("pinned");
  });

  it("sorts by updated descending by default", () => {
    const sorted = sortNotes([
      note({ id: "old", updated_at: "2026-01-01T00:00:00.000Z" }),
      note({ id: "new", updated_at: "2026-05-01T00:00:00.000Z" }),
    ]);
    expect(sorted[0].id).toBe("new");
  });

  it("sorts by title", () => {
    const sorted = sortNotes(
      [note({ id: "b", title: "Beta" }), note({ id: "a", title: "Alpha" })],
      "title"
    );
    expect(sorted[0].id).toBe("a");
  });

  it("does not mutate its input", () => {
    const input = [note({ id: "b" }), note({ id: "a", is_pinned: true })];
    const before = input.map((n) => n.id);
    sortNotes(input);
    expect(input.map((n) => n.id)).toEqual(before);
  });
});

describe("computeNoteStats", () => {
  it("counts every bucket", () => {
    const stats = computeNoteStats(
      [
        note({ id: "a", is_pinned: true }),
        note({ id: "b", is_favorited: true }),
        note({ id: "c", content: "   " }),
        note({ id: "d", tag_names: ["x", "y"] }),
      ],
      NOW
    );

    expect(stats.total).toBe(4);
    expect(stats.pinned).toBe(1);
    expect(stats.favorited).toBe(1);
    expect(stats.empty).toBe(1);
    expect(stats.tags).toBe(2);
  });

  it("counts personal notes separately", () => {
    const stats = computeNoteStats([note({ id: "a", project_id: "p1" }), note({ id: "b" })], NOW);
    expect(stats.personal).toBe(1);
    expect(stats.byProject.p1).toBe(1);
    expect(stats.byProject.personal).toBe(1);
  });

  it("counts notes touched this week", () => {
    const stats = computeNoteStats(
      [
        note({ id: "a", updated_at: "2026-03-09T00:00:00.000Z" }),
        note({ id: "b", updated_at: "2025-01-01T00:00:00.000Z" }),
      ],
      NOW
    );
    expect(stats.recent).toBe(1);
  });

  it("reports a curated rate and never divides by zero", () => {
    expect(computeNoteStats([note({ is_pinned: true }), note({})], NOW).curatedRate).toBe(50);
    expect(computeNoteStats([], NOW).curatedRate).toBe(0);
  });
});

describe("groupNotes", () => {
  it("returns one bucket when ungrouped", () => {
    expect(groupNotes([note({ id: "a" })], "none", NOW)).toHaveLength(1);
  });

  it("splits by project with a personal bucket", () => {
    const groups = groupNotes(
      [note({ id: "a", project_id: "p1", project_name: "Home" }), note({ id: "b" })],
      "project",
      NOW
    );
    expect(groups.map((g) => g.label).sort()).toEqual(["Home", "Personal notes"]);
  });

  it("puts a multi-tagged note in each of its tag buckets", () => {
    const groups = groupNotes([note({ id: "a", tag_names: ["x", "y"] })], "tag", NOW);
    expect(groups.map((g) => g.id).sort()).toEqual(["x", "y"]);
  });

  it("collects untagged notes in their own bucket", () => {
    const groups = groupNotes([note({ id: "a" })], "tag", NOW);
    expect(groups[0].id).toBe("untagged");
  });
});

describe("bucketForUpdated", () => {
  const stamp = (iso: string) => new Date(iso).toISOString();

  it("buckets today, yesterday, this week and older", () => {
    expect(bucketForUpdated(note({ updated_at: stamp("2026-03-10T08:00:00") }), NOW)).toBe("today");
    expect(bucketForUpdated(note({ updated_at: stamp("2026-03-09T08:00:00") }), NOW)).toBe("yesterday");
    expect(bucketForUpdated(note({ updated_at: stamp("2026-03-06T08:00:00") }), NOW)).toBe("week");
    expect(bucketForUpdated(note({ updated_at: stamp("2026-01-06T08:00:00") }), NOW)).toBe("earlier");
  });

  it("falls back to older for an unparseable timestamp", () => {
    expect(bucketForUpdated(note({ updated_at: "nope" }), NOW)).toBe("earlier");
  });

  it("has a label for every bucket it can return", () => {
    for (const id of ["today", "yesterday", "week", "earlier"]) {
      expect(UPDATED_BUCKET_LABEL[id]).toBeTruthy();
    }
  });
});

describe("allTags", () => {
  it("counts and orders by frequency", () => {
    expect(
      allTags([
        note({ tag_names: ["a", "b"] }),
        note({ tag_names: ["a"] }),
      ])
    ).toEqual([
      { tag: "a", count: 2 },
      { tag: "b", count: 1 },
    ]);
  });
});

describe("tagHue", () => {
  it("is stable and in range", () => {
    expect(tagHue("plan")).toBe(tagHue("plan"));
    expect(tagHue("plan")).toBeGreaterThanOrEqual(0);
    expect(tagHue("plan")).toBeLessThan(360);
  });
});