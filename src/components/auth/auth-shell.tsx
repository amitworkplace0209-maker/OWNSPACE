import Link from "next/link";
import {
  AlarmClock,
  BarChart3,
  CheckSquare,
  FolderKanban,
  Layers,
  Lock,
  NotebookPen,
} from "lucide-react";
import { cn } from "cn";

/**
 * The two-column sign-in shell.
 *
 * The split exists because the form itself is four fields and needs no more than
 * 24rem of width, while the *promise* — this is a whole workspace, not a login —
 * needs room to say so. On a phone the aside is dropped rather than stacked: a
 * marketing panel above a sign-in form pushes the form itself below the fold,
 * which is the one thing a sign-in page must never do.
 *
 * Everything here is `aria-hidden` decoration or a real link, so the landmark
 * outline is one `main` and one heading.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
  aside = true,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Turns off the brand column for narrow screens only; it is never removed. */
  aside?: boolean;
}) {
  return (
    <main className="grid min-h-svh w-full lg:grid-cols-[1.1fr_1fr]">
      {aside ? <BrandAside /> : null}

      <div className="flex items-center justify-center px-5 py-10 pb-[calc(2.5rem+env(safe-area-inset-bottom))] sm:px-8">
        <div className="flex w-full max-w-sm flex-col gap-7">
          <div className="flex flex-col items-center gap-3 text-center">
            {/* The mark is repeated from the aside rather than linked to it: on a
                phone there is no aside, and the logo has to be the first thing
                under the top of the screen. */}
            <span className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),#000_20%)] text-primary-foreground shadow-sm transition-transform duration-300 hover:scale-105 lg:hidden">
              <Layers className="size-6" />
            </span>
            <div className="flex flex-col gap-1.5">
              <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>

          {children}

          {footer}

          <Link
            href="/"
            className={cn(
              "text-center text-xs text-muted-foreground underline-offset-4",
              "transition-colors hover:text-foreground hover:underline"
            )}
          >
            Back to homepage
          </Link>
        </div>
      </div>
    </main>
  );
}

/**
 * The brand column.
 *
 * The feature list is deliberately short and specific — six rows, each naming
 * something the app actually does. A longer list on a sign-in page is decoration
 * pretending to be information.
 */
function BrandAside() {
  const points = [
    { icon: FolderKanban, label: "Projects", note: "Details, goals and files in one place" },
    { icon: CheckSquare, label: "Tasks", note: "Today, upcoming and everything else" },
    { icon: NotebookPen, label: "Notes", note: "Wiki, daily notes and tags" },
    { icon: AlarmClock, label: "Reminders", note: "Real notifications, even when closed" },
    { icon: BarChart3, label: "Finance", note: "Monthly reports per category" },
    { icon: Lock, label: "App lock", note: "One MPIN, works offline" },
  ];

  return (
    <aside className="relative hidden overflow-hidden bg-muted/40 lg:flex lg:flex-col lg:justify-center lg:gap-10 lg:p-12">
      {/* The glow is behind everything and never intercepts a click. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-24 size-[28rem] rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -right-16 size-[24rem] rounded-full bg-primary/8 blur-3xl"
      />

      <div className="relative flex flex-col gap-5">
        <Link href="/" className="flex w-fit items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),#000_20%)] text-primary-foreground shadow-sm transition-transform duration-300 hover:scale-105">
            <Layers className="size-5" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-lg font-semibold tracking-tight">Ownspece</span>
            <span className="mt-1 text-xs font-medium lowercase tracking-wide text-muted-foreground">
              Personal OS
            </span>
          </span>
        </Link>

        <p className="max-w-sm text-2xl font-medium leading-snug tracking-tight text-balance">
          Everything you are working on, in one place you actually open.
        </p>
      </div>

      <ul className="relative grid max-w-sm gap-1">
        {points.map((point) => (
          <li
            key={point.label}
            className="group flex items-start gap-3 rounded-lg px-2 py-2 transition-colors duration-200 hover:bg-background/70"
          >
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-all duration-200 group-hover:border-primary/40 group-hover:text-primary">
              <point.icon className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">{point.label}</span>
              <span className="truncate text-xs text-muted-foreground">{point.note}</span>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}