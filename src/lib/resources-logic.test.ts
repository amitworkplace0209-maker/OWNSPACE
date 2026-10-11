import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  EMPTY_RESOURCE_FILTERS,
  filterResources,
  formatBytesShort,
  groupResources,
  KINDS_BY_SOURCE,
  kindNeedsFile,
  kindNeedsUrl,
  MAX_UPLOAD_BYTES,
  summariseResources,
  sortResources,
  validateUploadSize,
  type ResourceItem,
  type ResourceKind,
  type ResourceSource,
} from "@/lib/resources-logic";
import { RESOURCE_TYPES } from "@/types";

function item(overrides: Partial<ResourceItem> = {}): ResourceItem {
  return {
    key: "supabase:1",
    source: "supabase",
    id: "1",
    kind: "supabase_file",
    name: "spec.pdf",
    description: null,
    url: null,
    mimeType: "application/pdf",
    sizeBytes: 1024,
    projectId: "p1",
    projectName: "Apollo",
    projectColor: "#6366f1",
    taskId: null,
    taskTitle: null,
    noteId: null,
    noteTitle: null,
    accountEmail: null,
    tags: [],
    createdAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("KINDS_BY_SOURCE", () => {
  it("never offers a Drive kind for an upload", () => {
    expect(KINDS_BY_SOURCE.supabase).not.toContain("google_drive");
  });

  it("only offers Drive for the Drive destination", () => {
    expect(KINDS_BY_SOURCE.drive).toEqual(["google_drive"]);
  });

  it("uses only kinds the database actually stores", () => {
    for (const source of ["supabase", "drive", "link"] as ResourceSource[]) {
      for (const kind of KINDS_BY_SOURCE[source]) {
        expect(RESOURCE_TYPES).toContain(kind);
      }
    }
  });

  it("covers every kind somewhere, so none is unreachable", () => {
    const all = [...KINDS_BY_SOURCE.supabase, ...KINDS_BY_SOURCE.drive, ...KINDS_BY_SOURCE.link];
    for (const kind of RESOURCE_TYPES) expect(all).toContain(kind);
  });
});

describe("kindNeedsUrl / kindNeedsFile", () => {
  it("separates link-shaped kinds from file-shaped ones", () => {
    expect(kindNeedsUrl("repository")).toBe(true);
    expect(kindNeedsUrl("custom")).toBe(false);
    expect(kindNeedsFile("google_drive")).toBe(true);
    expect(kindNeedsFile("link")).toBe(false);
  });
});

describe("filterResources", () => {
  const items = [
    item({ key: "supabase:1", id: "1" }),
    item({
      key: "drive:2",
      source: "drive",
      id: "2",
      kind: "google_drive",
      name: "budget.gsheet",
      projectId: null,
      projectName: null,
      accountEmail: "a@x.com",
      createdAt: "2026-02-01T00:00:00.000Z",
    }),
    item({
      key: "link:3",
      source: "link",
      id: "3",
      kind: "repository",
      name: "github.com/you/repo",
      url: "https://github.com/you/repo",
      tags: ["oss"],
    }),
  ];

  it("returns everything for an empty filter", () => {
    expect(filterResources(items, EMPTY_RESOURCE_FILTERS)).toHaveLength(3);
  });

  it("filters by source", () => {
    const out = filterResources(items, { ...EMPTY_RESOURCE_FILTERS, sources: ["drive"] });
    expect(out.map((row) => row.id)).toEqual(["2"]);
  });

  it("filters by kind", () => {
    const out = filterResources(items, { ...EMPTY_RESOURCE_FILTERS, kinds: ["repository"] });
    expect(out.map((row) => row.id)).toEqual(["3"]);
  });

  it("filters by project, including the unattached bucket", () => {
    expect(
      filterResources(items, { ...EMPTY_RESOURCE_FILTERS, projectId: "p1" }).map((r) => r.id)
    ).toEqual(["1", "3"]);
  });

  it("searches the name", () => {
    expect(
      filterResources(items, { ...EMPTY_RESOURCE_FILTERS, query: "sheet" }).map((r) => r.id)
    ).toEqual(["2"]);
  });

  it("searches the project name, task title and tags", () => {
    expect(
      filterResources(items, { ...EMPTY_RESOURCE_FILTERS, query: "apollo" }).map((r) => r.id)
    ).toEqual(["1", "3"]);
    expect(
      filterResources(items, { ...EMPTY_RESOURCE_FILTERS, query: "oss" }).map((r) => r.id)
    ).toEqual(["3"]);
  });

  it("combines filters with AND", () => {
    const out = filterResources(items, {
      ...EMPTY_RESOURCE_FILTERS,
      sources: ["supabase"],
      projectId: "p1",
    });
    expect(out.map((r) => r.id)).toEqual(["1"]);
  });

  it("ignores surrounding whitespace in the query", () => {
    const out = filterResources(items, {
      ...EMPTY_RESOURCE_FILTERS,
      query: "  repo ",
    });
    expect(out).toHaveLength(1);
  });
});

describe("groupResources", () => {
  const items = [
    item({ key: "supabase:1", id: "1", projectId: "p1", projectName: "Apollo" }),
    item({ key: "supabase:2", id: "2", projectId: "p1", projectName: "Apollo" }),
    item({
      key: "drive:3",
      id: "3",
      source: "drive",
      kind: "google_drive",
      projectId: null,
      projectName: null,
    }),
  ];

  it("returns one group when not grouping", () => {
    expect(groupResources(items, "none")).toHaveLength(1);
  });

  it("groups by project and puts unattached items in their own bucket", () => {
    const groups = groupResources(items, "project");
    expect(groups[0].label).toBe("Apollo");
    expect(groups[0].items).toHaveLength(2);
    expect(groups.find((group) => group.id === "none")?.items).toHaveLength(1);
  });

  it("groups by source", () => {
    const groups = groupResources(items, "source");
    expect(groups.map((group) => group.id).sort()).toEqual(["drive", "supabase"]);
  });

  it("orders the biggest group first", () => {
    const groups = groupResources(items, "project");
    expect(groups[0].items.length).toBeGreaterThanOrEqual(groups[1].items.length);
  });
});

describe("sortResources", () => {
  const items = [
    item({ key: "a", id: "a", name: "b", sizeBytes: 10, createdAt: "2026-01-01T00:00:00.000Z" }),
    item({ key: "b", id: "b", name: "a", sizeBytes: 30, createdAt: "2026-03-01T00:00:00.000Z" }),
  ];

  it("sorts newest first by default", () => {
    expect(sortResources(items, "recent").map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("sorts oldest first", () => {
    expect(sortResources(items, "oldest").map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("sorts by name", () => {
    expect(sortResources(items, "name").map((r) => r.name)).toEqual(["a", "b"]);
  });

  it("puts unknown sizes last when sorting by size", () => {
    const withNull = [...items, item({ key: "c", id: "c", sizeBytes: null })];
    expect(sortResources(withNull, "size").at(-1)?.id).toBe("c");
  });

  it("does not mutate its input", () => {
    const input = [...items];
    sortResources(input, "name");
    expect(input.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("summariseResources", () => {
  it("counts by source and kind", () => {
    const summary = summariseResources([
      item({ key: "1", id: "1", source: "supabase", kind: "supabase_file" }),
      item({ key: "2", id: "2", source: "supabase", kind: "document" }),
      item({ key: "3", id: "3", source: "drive", kind: "google_drive", sizeBytes: 500 }),
    ]);
    expect(summary.total).toBe(3);
    expect(summary.bySource.supabase).toBe(2);
    expect(summary.bySource.drive).toBe(1);
    expect(summary.byKind.supabase_file).toBe(1);
    expect(summary.byKind.document).toBe(1);
  });

  it("reports bytes per source and never blends them", () => {
    const summary = summariseResources([
      item({ key: "1", id: "1", source: "supabase", sizeBytes: 100 }),
      item({ key: "2", id: "2", source: "drive", kind: "google_drive", sizeBytes: 900 }),
    ]);
    expect(summary.bytesBySource.supabase).toBe(100);
    expect(summary.bytesBySource.drive).toBe(900);
    expect(summary.bytesBySource.link).toBe(0);
  });

  it("counts distinct projects, not rows", () => {
    const summary = summariseResources([
      item({ key: "1", id: "1", projectId: "p1" }),
      item({ key: "2", id: "2", projectId: "p1" }),
      item({ key: "3", id: "3", projectId: "p2" }),
    ]);
    expect(summary.projectCount).toBe(2);
  });

  it("counts unattached, task and note links separately", () => {
    const summary = summariseResources([
      item({ key: "1", id: "1", projectId: null }),
      item({ key: "2", id: "2", taskId: "t1" }),
      item({ key: "3", id: "3", noteId: "n1" }),
    ]);
    expect(summary.unattached).toBe(1);
    expect(summary.linkedToTask).toBe(1);
    expect(summary.linkedToNote).toBe(1);
  });

  it("ignores a null size instead of treating it as zero bytes of data", () => {
    const summary = summariseResources([item({ key: "1", id: "1", sizeBytes: null })]);
    expect(summary.bytesBySource.supabase).toBe(0);
    expect(summary.total).toBe(1);
  });

  it("handles an empty list", () => {
    const summary = summariseResources([]);
    expect(summary.total).toBe(0);
    expect(summary.projectCount).toBe(0);
  });
});

describe("activeFilterCount", () => {
  it("counts each dimension once", () => {
    expect(activeFilterCount(EMPTY_RESOURCE_FILTERS)).toBe(0);
    expect(
      activeFilterCount({
        query: "x",
        sources: ["drive", "link"],
        kinds: ["repository"],
        projectId: "p1",
        taskId: "t1",
      })
    ).toBe(5);
  });

  it("ignores a whitespace-only query", () => {
    expect(activeFilterCount({ ...EMPTY_RESOURCE_FILTERS, query: "   " })).toBe(0);
  });
});

describe("validateUploadSize", () => {
  it("accepts a file inside the limit", () => {
    expect(validateUploadSize(1024)).toEqual({ ok: true });
  });

  it("rejects an empty file", () => {
    expect(validateUploadSize(0).ok).toBe(false);
  });

  it("rejects a file over the bucket limit", () => {
    const result = validateUploadSize(MAX_UPLOAD_BYTES + 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("100 MB");
  });

  it("names the limit in the largest unit that stays a whole number", () => {
    const oneMegabyte = 1024 * 1024;
    const overMegabyte = validateUploadSize(oneMegabyte * 2, oneMegabyte);
    expect(overMegabyte.ok).toBe(false);
    if (!overMegabyte.ok) expect(overMegabyte.error).toContain("1 MB");

    // A sub-megabyte limit must not round to "0 MB", which tells the user
    // nothing about what they were actually allowed to upload.
    const small = validateUploadSize(2000, 1000);
    expect(small.ok).toBe(false);
    if (!small.ok) expect(small.error).toContain("1000 B");
  });

  it("allows exactly the limit", () => {
    expect(validateUploadSize(MAX_UPLOAD_BYTES).ok).toBe(true);
  });
});

describe("formatBytesShort", () => {
  it("renders each magnitude", () => {
    expect(formatBytesShort(0)).toBe("0 B");
    expect(formatBytesShort(512)).toBe("512 B");
    expect(formatBytesShort(2048)).toBe("2 KB");
    expect(formatBytesShort(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytesShort(3 * 1024 * 1024 * 1024)).toBe("3.0 GB");
  });

  it("never renders NaN for a bad number", () => {
    expect(formatBytesShort(Number.NaN)).toBe("0 B");
    expect(formatBytesShort(-5)).toBe("0 B");
  });
});

describe("every kind is labelled", () => {
  it("has a human label for each type the database allows", () => {
    const labels: Record<ResourceKind, string> = {
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
    for (const kind of RESOURCE_TYPES) {
      expect(labels[kind]).toBeTruthy();
    }
  });
});