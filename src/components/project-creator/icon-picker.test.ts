import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * A project's icon lives in a plain text column holding a *name* — "Target",
 * "folder-kanban". Every surface used to print that column straight to the
 * screen, so picking Rocket showed the word "Target" next to the project's name
 * and no glyph anywhere. These lock in that the name is resolved to a shape.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => "/projects",
  useSearchParams: () => new URLSearchParams(),
}));

import { resolveIcon, ProjectIcon, IconPreview } from "@/components/project-creator/icon-picker";

describe("resolveIcon", () => {
  it("resolves a catalogue name to a component", () => {
    const Icon = resolveIcon("Target");
    // Not `toBeTypeOf("function")`: lucide v1 ships forwardRef components, so
    // the value is an object with a `render` method, not a plain function.
    expect(Icon).not.toBeNull();
    expect((Icon as { render?: unknown }).render).toBeTypeOf("function");
  });

  it("is case-insensitive", () => {
    // The column is plain text with nothing constraining its case, so a project
    // saved as "target" has to render the same as one saved as "Target".
    expect(resolveIcon("target")).toBe(resolveIcon("Target"));
  });

  it("tolerates surrounding whitespace", () => {
    expect(resolveIcon("  Target  ")).toBe(resolveIcon("Target"));
  });

  it("returns null for values that are not in the catalogue", () => {
    expect(resolveIcon("definitely-not-an-icon")).toBeNull();
  });

  it("returns null for empty input rather than throwing", () => {
    expect(resolveIcon(null)).toBeNull();
    expect(resolveIcon(undefined)).toBeNull();
    expect(resolveIcon("")).toBeNull();
    expect(resolveIcon("   ")).toBeNull();
  });
});

describe("ProjectIcon", () => {
  it("renders an svg glyph for a catalogue name, not the name itself", () => {
    const html = renderToStaticMarkup(
      createElement(ProjectIcon, { name: "Target", fallbackName: "Apollo" })
    );
    expect(html).toContain("<svg");
    expect(html).not.toContain("Target");
    expect(html).not.toContain("Ap");
  });

  it("falls back to the first letter of the project name", () => {
    const html = renderToStaticMarkup(
      createElement(ProjectIcon, { name: null, fallbackName: "Apollo" })
    );
    expect(html).toContain("A");
    expect(html).not.toContain("<svg");
  });

  it("falls back to the initial for a name this build does not ship", () => {
    // A project created against an older build keeps working rather than
    // showing an empty box that looks like a rendering failure.
    const html = renderToStaticMarkup(
      createElement(ProjectIcon, { name: "IconFromTheFuture", fallbackName: "Apollo" })
    );
    expect(html).toContain("A");
  });

  it("renders a custom emoji as itself", () => {
    const html = renderToStaticMarkup(
      createElement(ProjectIcon, { name: "🚀", fallbackName: "Apollo" })
    );
    expect(html).toContain("🚀");
  });

  it("never renders nothing when there is no name at all", () => {
    const html = renderToStaticMarkup(createElement(ProjectIcon, {}));
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("?");
  });
});

describe("IconPreview", () => {
  it("shows the glyph inside the coloured tile", () => {
    const html = renderToStaticMarkup(
      createElement(IconPreview, { icon: "Target", color: "#ff0000" })
    );
    expect(html).toContain("<svg");
    expect(html).toContain("#ff0000");
    expect(html).not.toContain(">Ro<");
  });

  it("does not paint a tile behind an emoji", () => {
    // The emoji carries its own colours; a coloured box behind it fights them.
    const html = renderToStaticMarkup(
      createElement(IconPreview, { icon: "🚀", color: "#ff0000" })
    );
    expect(html).not.toContain("#ff0000");
    expect(html).toContain("🚀");
  });

  it("shows a question mark when nothing is chosen", () => {
    expect(renderToStaticMarkup(createElement(IconPreview, {}))).toContain("?");
  });
});
