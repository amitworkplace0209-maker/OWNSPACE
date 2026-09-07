import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  CalendarDays,
  NotebookPen,
  HardDrive,
  GitCommitHorizontal,
  Bell,
  BookOpen,
  BarChart3,
  Activity,
  Archive,
  Settings,
  TimerIcon,
  SunIcon,
  Tag,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const sidebarNav: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "Projects", href: "/projects", icon: FolderKanban },
      { title: "Tasks", href: "/tasks", icon: CheckSquare },
      { title: "Calendar", href: "/calendar", icon: CalendarDays },
      { title: "Daily", href: "/daily", icon: SunIcon },
      { title: "Notes", href: "/notes", icon: NotebookPen },
      { title: "Files", href: "/files", icon: HardDrive },
      { title: "Timeline", href: "/timeline", icon: GitCommitHorizontal },
      { title: "Reminders", href: "/reminders", icon: Bell },
      { title: "Time", href: "/time", icon: TimerIcon },
      { title: "Wiki", href: "/wiki", icon: BookOpen },
      { title: "Tags", href: "/tags", icon: Tag },
    ],
  },
  {
    label: "Insights",
    items: [
      { title: "Analytics", href: "/analytics", icon: BarChart3 },
      { title: "Activity", href: "/activity", icon: Activity },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Archive", href: "/archive", icon: Archive },
      { title: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export const bottomNav: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Projects", href: "/projects", icon: FolderKanban },
  { title: "Tasks", href: "/tasks", icon: CheckSquare },
  { title: "Notes", href: "/notes", icon: NotebookPen },
  { title: "More", href: "/settings", icon: Settings },
];
