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

/**
 * Two lists, not one long one.
 *
 * Twenty-four items in four labelled groups is a wall on a phone: reaching
 * Settings means scrolling past fifteen things you did not come for, every time,
 * and the section headers cost vertical space without helping anyone decide
 * where to look.
 *
 * So the split is by *frequency*, not by subject. "Main" is what gets opened
 * daily and sits visible; everything else lives under "More", collapsed, with
 * the active page revealing itself there automatically — so the one time you
 * need a buried item, it is already open rather than hidden behind a click you
 * did not know to make.
 *
 * Subjects still order the "More" list, which is why the groups below are
 * flattened in a sensible reading order rather than alphabetised.
 */
export const primaryNav: NavGroup = {
  label: "Main",
  items: [
    { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { title: "Projects", href: "/projects", icon: FolderKanban },
    { title: "Tasks", href: "/tasks", icon: CheckSquare },
    { title: "Reminders", href: "/reminders", icon: AlarmClock },
    { title: "Notifications", href: "/notifications", icon: BellRing },
  ],
};

export const secondaryNav: NavGroup = {
  label: "More",
  items: [
    // Workspace
    { title: "Calendar", href: "/calendar", icon: CalendarDays },
    { title: "Notes", href: "/notes", icon: NotebookPen },
    { title: "Daily Notes", href: "/daily", icon: SunIcon },
    { title: "Finance", href: "/finance", icon: Wallet },
    { title: "Resources", href: "/resources", icon: Paperclip },
    { title: "Tags", href: "/tags", icon: Tag },
    { title: "Timeline", href: "/timeline", icon: GitCommitHorizontal },
    // Files
    { title: "G Drive", href: "/gdrive", icon: HardDrive },
    { title: "Storage", href: "/storage", icon: Database },
    // Tools
    { title: "Analytics", href: "/analytics", icon: BarChart3 },
    { title: "Activity", href: "/activity", icon: Activity },
    { title: "Time", href: "/time", icon: TimerIcon },
    { title: "Lab", href: "/lab", icon: FlaskConical },
    // System
    { title: "Archive", href: "/archive", icon: Archive },
    { title: "Settings", href: "/settings", icon: Settings },
  ],
};

/**
 * Every item, for the command palette and anywhere else that navigates by name.
 *
 * Derived from the two lists so adding a page in one place cannot leave it out
 * of the palette — which is how a route ends up reachable from the sidebar and
 * from nowhere else.
 */
export const sidebarNav: NavGroup[] = [primaryNav, secondaryNav];

export const bottomNav: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Projects", href: "/projects", icon: FolderKanban },
  { title: "Tasks", href: "/tasks", icon: CheckSquare },
  { title: "Reminders", href: "/reminders", icon: AlarmClock },
  { title: "More", href: "/settings", icon: Settings },
];

export const allNavItems: NavItem[] = [...primaryNav.items, ...secondaryNav.items];
