import type { ReactNode } from "react";

/**
 * Shared frame for a project sub-page.
 *
 * Deliberately does not reuse `PageHeader`: that renders an `<h1>`, and the
 * project layout already owns the page's `<h1>`. A second one would break the
 * document outline, so the section heading is an `<h2>` instead.
 */
export function ProjectSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}