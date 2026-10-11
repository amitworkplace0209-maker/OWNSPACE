"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Trash2, Mail, MailOpen, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "cn";
import {
  clearReadNotificationsAction,
  deleteNotificationAction,
  deleteNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  markNotificationUnreadAction,
  markNotificationsReadAction,
} from "@/lib/actions/notifications";
import { formatRelativeTime } from "@/lib/format";
import type { AppNotification, NotificationType } from "@/types";

const typeBadge: Record<NotificationType, string> = {
  reminder: "Reminder",
  task: "Task",
  project: "Project",
  system: "System",
};

const filters = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "read", label: "Read" },
] as const;

const typeOptions: Array<{ id: NotificationType | "all"; label: string }> = [
  { id: "all", label: "All types" },
  { id: "reminder", label: "Reminders" },
  { id: "task", label: "Tasks" },
  { id: "project", label: "Projects" },
  { id: "system", label: "System" },
];

export function NotificationsWorkspace({
  notifications,
  filter,
  type,
  unreadCount,
  totalCount,
}: {
  notifications: AppNotification[];
  filter: "all" | "unread" | "read";
  type: NotificationType | "all";
  unreadCount: number;
  totalCount: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const selectedVisible = notifications.filter((n) => selected.has(n.id));
  const allSelected = notifications.length > 0 && selectedVisible.length === notifications.length;
  const readCount = totalCount - unreadCount;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(notifications.map((n) => n.id)));
  }

  function pushParam(nextFilter: string, nextType: string) {
    const params = new URLSearchParams();
    if (nextFilter !== "all") params.set("filter", nextFilter);
    if (nextType !== "all") params.set("type", nextType);
    const qs = params.toString();
    router.push(qs ? `/notifications?${qs}` : "/notifications");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((f) => {
            const active = filter === f.id;
            return (
              <Button
                key={f.id}
                variant={active ? "default" : "outline"}
                size="sm"
                onClick={() => pushParam(f.id, type)}
              >
                {f.label}
                <Badge
                  variant={active ? "secondary" : "ghost"}
                  className={cn("h-4 min-w-4 justify-center px-1 text-[10px]")}
                >
                  {f.id === "unread"
                    ? unreadCount
                    : f.id === "all"
                      ? totalCount
                      : totalCount - unreadCount}
                </Badge>
              </Button>
            );
          })}
        </div>
        <select
          aria-label="Filter by type"
          value={type}
          onChange={(e) => pushParam(filter, e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          {typeOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {notifications.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2">
          <Checkbox checked={allSelected} onCheckedChange={() => toggleAll()} aria-label="Select all notifications" />
          <span className="text-sm text-muted-foreground">
            {selectedVisible.length > 0 ? `${selectedVisible.length} selected` : "Select all"}
          </span>
          {selectedVisible.length > 0 ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await markNotificationsReadAction(selectedVisible.map((n) => n.id));
                  setSelected(new Set());
                  router.refresh();
                }}
              >
                Mark read
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await deleteNotificationsAction(selectedVisible.map((n) => n.id));
                  setSelected(new Set());
                  router.refresh();
                }}
              >
                <Trash2 className="size-3.5" /> Delete
              </Button>
            </>
          ) : null}
          {readCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-muted-foreground"
              onClick={async () => {
                await clearReadNotificationsAction();
                setSelected(new Set());
                router.refresh();
              }}
            >
              Clear read
            </Button>
          ) : null}
        </div>
      ) : null}

      {notifications.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="Inbox zero"
          description={
            totalCount === 0
              ? "Notifications from your reminders, tasks and projects will appear here."
              : "No notifications match this filter."
          }
        />
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
          {notifications.map((n) => {
            const unread = n.read_at === null;
            return (
              <li
                key={n.id}
                className={cn(
                  "flex items-start gap-3 border-b border-border/50 px-4 py-3 last:border-0",
                  unread && "bg-accent/30"
                )}
              >
                <Checkbox
                  checked={selected.has(n.id)}
                  onCheckedChange={() => toggle(n.id)}
                  aria-label={`Select ${n.title}`}
                  className="mt-1"
                />
                <div
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                    unread ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                  )}
                >
                  {unread ? <Mail className="size-4" /> : <MailOpen className="size-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{n.title}</p>
                    <Badge variant="outline" className="h-4 text-[10px] capitalize">
                      {typeBadge[n.type] ?? n.type}
                    </Badge>
                  </div>
                  {n.body ? <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p> : null}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatRelativeTime(n.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 [li:hover_&]:opacity-100">
                  {unread ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Mark as read"
                      onClick={async () => {
                        await markNotificationReadAction(n.id);
                        router.refresh();
                      }}
                    >
                      <Check className="size-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Mark as unread"
                      onClick={async () => {
                        await markNotificationUnreadAction(n.id);
                        router.refresh();
                      }}
                    >
                      <Undo2 className="size-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete notification"
                    onClick={async () => {
                      await deleteNotificationAction(n.id);
                      router.refresh();
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {unreadCount > 0 ? (
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await markAllNotificationsReadAction();
              router.refresh();
            }}
          >
            Mark all as read
          </Button>
        </div>
      ) : null}
    </div>
  );
}