import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  CalendarDays,
  AlarmClock,
  BellRing,
  NotebookPen,
  SunIcon,
  HardDrive,
  Database,
  Wallet,
  Paperclip,
  GitCommitHorizontal,
  Tag,
  FlaskConical,
  BarChart3,
  Activity,
  Search,
  Archive,
  Settings,
  TimerIcon,
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
    label: "Main",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "Projects", href: "/projects", icon: FolderKanban },
      { title: "Tasks", href: "/tasks", icon: CheckSquare },
      { title: "Calendar", href: "/calendar", icon: CalendarDays },
      { title: "Reminders", href: "/reminders", icon: AlarmClock },
      { title: "Notifications", href: "/notifications", icon: BellRing },
    ],
  },
  {
    label: "Workspace",
    items: [
      { title: "Notes", href: "/notes", icon: NotebookPen },
      { title: "Daily Notes", href: "/daily", icon: SunIcon },
      { title: "G Drive", href: "/gdrive", icon: HardDrive },
      { title: "Storage", href: "/storage", icon: Database },
      { title: "Finance", href: "/finance", icon: Wallet },
      { title: "Resources", href: "/resources", icon: Paperclip },
      { title: "Tags", href: "/tags", icon: Tag },
      { title: "Timeline", href: "/timeline", icon: GitCommitHorizontal },
    ],
  },
  {
    label: "Tools",
    items: [
      { title: "Lab", href: "/lab", icon: FlaskConical },
      { title: "Time", href: "/time", icon: TimerIcon },
      { title: "Analytics", href: "/analytics", icon: BarChart3 },
      { title: "Activity", href: "/activity", icon: Activity },
      { title: "Search", href: "/search", icon: Search },
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

export const allNavItems: NavItem[] = sidebarNav.flatMap((group) => group.items);