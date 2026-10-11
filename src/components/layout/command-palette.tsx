"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, FolderKanban, CheckSquare, NotebookPen, CalendarDays, AlarmClock, ArrowUpRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { allNavItems } from "@/config/navigation";
import { cn } from "cn";

const quickActions = [
  { label: "Create project", href: "/projects?new=1", icon: FolderKanban },
  { label: "Create task", href: "/tasks?new=1", icon: CheckSquare },
  { label: "Create note", href: "/notes?new=1", icon: NotebookPen },
  { label: "Add calendar event", href: "/calendar?new=1", icon: CalendarDays },
  { label: "Add reminder", href: "/reminders?new=1", icon: AlarmClock },
];

const PALETTE_EVENT = "ownspece:open-command-palette";

/** Opens the global command palette from any client component. */
export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(PALETTE_EVENT));
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) setQuery("");
        setOpen(!open);
      }
    }
    function onOpen() {
      setQuery("");
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(PALETTE_EVENT, onOpen);
    };
  }, [open]);

  React.useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  const q = query.trim().toLowerCase();
  const navResults = q
    ? allNavItems.filter((item) => item.title.toLowerCase().includes(q))
    : allNavItems.slice(0, 8);
  const actionResults = q
    ? quickActions.filter((a) => a.label.toLowerCase().includes(q))
    : quickActions;

  function go(href: string) {
    setQuery("");
    setOpen(false);
    router.push(href);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery(""); }}>
      <DialogContent
        showCloseButton={false}
        className="top-[18vh] max-w-md p-0 sm:max-w-md"
      >
        <DialogHeader className="px-3 pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pages and quick actions…"
              aria-label="Search pages"
              className="h-10 bg-muted/40 pl-9 pr-4"
              onKeyDown={(e) => {
                if (e.key === "Enter" && navResults[0]) go(navResults[0].href);
              }}
            />
          </div>
        </DialogHeader>
        <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto px-3 pb-3">
          <div>
            <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">Navigate</p>
            <ul className="flex flex-col">
              {navResults.length === 0 ? (
                <li className="px-1 py-3 text-sm text-muted-foreground">No matching pages.</li>
              ) : (
                navResults.map((item) => (
                  <li key={item.href}>
                    <button
                      type="button"
                      onClick={() => go(item.href)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-accent"
                    >
                      <item.icon className="size-4 text-muted-foreground" />
                      {item.title}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div>
            <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">Quick create</p>
            <ul className="flex flex-col">
              {actionResults.map((action) => (
                <li key={action.href}>
                  <button
                    type="button"
                    onClick={() => go(action.href)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-accent"
                  >
                    <action.icon className="size-4 text-muted-foreground" />
                    {action.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {q ? (
            <button
              type="button"
              onClick={() => go(`/search?q=${encodeURIComponent(q)}`)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border border-dashed px-2 py-2 text-left text-sm text-muted-foreground transition hover:border-primary/40 hover:text-primary"
              )}
            >
              <ArrowUpRight className="size-4" />
              Search workspace for &quot;{query.trim()}&quot;
            </button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}