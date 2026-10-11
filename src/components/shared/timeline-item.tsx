import { cn } from "cn";
import { Clock } from "lucide-react";
import type { Activity } from "@/types";

interface TimelineItemProps {
  activity: Activity;
  className?: string;
}

const iconMap: Record<string, string> = {
  project: "bg-indigo-500 text-white",
  task: "bg-sky-500 text-white",
  note: "bg-amber-500 text-white",
  file: "bg-rose-500 text-white",
  reminder: "bg-red-500 text-white",
  calendar: "bg-blue-500 text-white",
  system: "bg-violet-500 text-white",
  milestone: "bg-fuchsia-500 text-white",
  time: "bg-cyan-500 text-white",
  wiki: "bg-orange-500 text-white",
};

export function TimelineItem({ activity, className }: TimelineItemProps) {
  const iconClass = iconMap[activity.activity_type] ?? "bg-muted text-muted-foreground";

  return (
    <li className={cn("relative flex gap-3 pb-4 pl-8", className)}>
      <div className={`absolute left-0 top-1 flex size-6 items-center justify-center rounded-full ${iconClass}`}>
        <span className="sr-only">{activity.activity_type}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm">{activity.summary ?? "Activity"}</p>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="size-3" />
          <time>{activity.created_at}</time>
        </div>
      </div>
    </li>
  );
}
