"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { cn } from "cn";
import { Search, X } from "lucide-react";
import {
  // Development
  Code, Terminal, GitBranch, Database, Server, Cloud, Container, Layers,
  // Business
  Briefcase, Building, Factory, Store, TrendingUp, BarChart, PieChart, Target,
  // Finance
  DollarSign, CreditCard, Wallet, Receipt, Banknote, PiggyBank, Coins, Calculator,
  // Education
  BookOpen, GraduationCap, Library, School, Brain, Lamp, Award, BadgeCheck,
  // Personal
  Heart, Home, User, Users, Coffee, Music, Gamepad2, Camera,
  // Design
  Palette, PenTool, Frame, Paintbrush, Image, Layers as LayersIcon, Scissors, Ruler,
  // Technology
  Cpu, HardDrive, MemoryStick, Monitor, Smartphone, Tablet, Watch, Headphones,
  // Files
  FileText, FileCode, FileImage, FileVideo, FileAudio, FileSpreadsheet, FileJson, FileArchive,
  // Calendar
  Calendar, CalendarDays, CalendarRange, Clock, Timer, AlarmClock, Hourglass, Sun,
  // Tasks
  CheckSquare, ListTodo, Kanban, ClipboardList, Flag, Check, CheckCircle, Square,
  // Other
  Star, Sparkles, Zap, Shield, Key, Lock, Unlock, Globe, Mail, MessageSquare,
} from "lucide-react";

const ICON_CATEGORIES = [
  {
    name: "Development",
    icons: [
      { name: "Code", component: Code },
      { name: "Terminal", component: Terminal },
      { name: "GitBranch", component: GitBranch },
      { name: "Database", component: Database },
      { name: "Server", component: Server },
      { name: "Cloud", component: Cloud },
      { name: "Container", component: Container },
      { name: "Layers", component: Layers },
    ],
  },
  {
    name: "Business",
    icons: [
      { name: "Briefcase", component: Briefcase },
      { name: "Building", component: Building },
      { name: "Factory", component: Factory },
      { name: "Store", component: Store },
      { name: "TrendingUp", component: TrendingUp },
      { name: "BarChart", component: BarChart },
      { name: "PieChart", component: PieChart },
      { name: "Target", component: Target },
    ],
  },
  {
    name: "Finance",
    icons: [
      { name: "DollarSign", component: DollarSign },
      { name: "CreditCard", component: CreditCard },
      { name: "Wallet", component: Wallet },
      { name: "Receipt", component: Receipt },
      { name: "Banknote", component: Banknote },
      { name: "PiggyBank", component: PiggyBank },
      { name: "Coins", component: Coins },
      { name: "Calculator", component: Calculator },
    ],
  },
  {
    name: "Education",
    icons: [
      { name: "BookOpen", component: BookOpen },
      { name: "GraduationCap", component: GraduationCap },
      { name: "Library", component: Library },
      { name: "School", component: School },
      { name: "Brain", component: Brain },
      { name: "Lamp", component: Lamp },
      { name: "Award", component: Award },
      { name: "Badge", component: BadgeCheck },
    ],
  },
  {
    name: "Personal",
    icons: [
      { name: "Heart", component: Heart },
      { name: "Home", component: Home },
      { name: "User", component: User },
      { name: "Users", component: Users },
      { name: "Coffee", component: Coffee },
      { name: "Music", component: Music },
      { name: "Gamepad2", component: Gamepad2 },
      { name: "Camera", component: Camera },
    ],
  },
  {
    name: "Design",
    icons: [
      { name: "Palette", component: Palette },
      { name: "PenTool", component: PenTool },
      { name: "Frame", component: Frame },
      { name: "Paintbrush", component: Paintbrush },
      { name: "Image", component: Image },
      { name: "Layers", component: LayersIcon },
      { name: "Scissors", component: Scissors },
      { name: "Ruler", component: Ruler },
    ],
  },
  {
    name: "Technology",
    icons: [
      { name: "Cpu", component: Cpu },
      { name: "HardDrive", component: HardDrive },
      { name: "MemoryStick", component: MemoryStick },
      { name: "Monitor", component: Monitor },
      { name: "Smartphone", component: Smartphone },
      { name: "Tablet", component: Tablet },
      { name: "Watch", component: Watch },
      { name: "Headphones", component: Headphones },
    ],
  },
  {
    name: "Files",
    icons: [
      { name: "FileText", component: FileText },
      { name: "FileCode", component: FileCode },
      { name: "FileImage", component: FileImage },
      { name: "FileVideo", component: FileVideo },
      { name: "FileAudio", component: FileAudio },
      { name: "FileSpreadsheet", component: FileSpreadsheet },
      { name: "FileJson", component: FileJson },
      { name: "FileArchive", component: FileArchive },
    ],
  },
  {
    name: "Calendar",
    icons: [
      { name: "Calendar", component: Calendar },
      { name: "CalendarDays", component: CalendarDays },
      { name: "CalendarRange", component: CalendarRange },
      { name: "Clock", component: Clock },
      { name: "Timer", component: Timer },
      { name: "AlarmClock", component: AlarmClock },
      { name: "Hourglass", component: Hourglass },
      { name: "Sun", component: Sun },
    ],
  },
  {
    name: "Tasks",
    icons: [
      { name: "CheckSquare", component: CheckSquare },
      { name: "ListTodo", component: ListTodo },
      { name: "Kanban", component: Kanban },
      { name: "ClipboardList", component: ClipboardList },
      { name: "Flag", component: Flag },
      { name: "Check", component: Check },
      { name: "CheckCircle", component: CheckCircle },
      { name: "Square", component: Square },
    ],
  },
  {
    name: "Other",
    icons: [
      { name: "Star", component: Star },
      { name: "Sparkles", component: Sparkles },
      { name: "Zap", component: Zap },
      { name: "Shield", component: Shield },
      { name: "Key", component: Key },
      { name: "Lock", component: Lock },
      { name: "Unlock", component: Unlock },
      { name: "Globe", component: Globe },
      { name: "Mail", component: Mail },
      { name: "MessageSquare", component: MessageSquare },
    ],
  },
] as const;

type IconCategory = typeof ICON_CATEGORIES[number];

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  showSearch?: boolean;
}

interface IconItem {
  name: string;
  component: React.ComponentType<{ className?: string }>;
  category: string;
}

function getAllIcons(): IconItem[] {
  const icons: IconItem[] = [];
  for (const category of ICON_CATEGORIES) {
    for (const icon of category.icons) {
      icons.push({ ...icon, category: category.name });
    }
  }
  return icons;
}

/**
 * Icon name -> component, for rendering and for the preview.
 *
 * Built once at module load rather than per render: it walks ninety entries, and
 * a preview that re-derives the map on every keystroke is work spent on nothing.
 *
 * Lower-cased keys, because the name reaches us from a database column that
 * nothing constrains to a case — a project saved as "rocket" has to render the
 * same as one saved as "Rocket", or the icon silently vanishes for that project
 * and only that project.
 *
 * Exported so the render path indexes it directly. React's static-components rule
 * is right to reject `const Icon = someFunction(name)` followed by `<Icon />`: a
 * component obtained through a call has no stable identity, so React cannot tell
 * it from a new element type and throws its state away on every render. A plain
 * property read has the same answer every time.
 */
export const ICON_BY_NAME: Record<
  string,
  React.ComponentType<{ className?: string }>
> = Object.fromEntries(
  ICON_CATEGORIES.flatMap((category) =>
    category.icons.map((icon) => [icon.name.toLowerCase(), icon.component])
  )
);

/**
 * The component for an icon name, or null when the name is not in the catalogue.
 *
 * For logic and tests. Rendering code should read `ICON_BY_NAME` directly —
 * see the note on that map.
 */
export function resolveIcon(name: string | null | undefined): React.ComponentType<{
  className?: string;
}> | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return ICON_BY_NAME[trimmed.toLowerCase()] ?? null;
}

/** True when the value is short enough to be an emoji rather than an icon name. */
function looksLikeEmoji(value: string): boolean {
  // Two characters covers 👨‍👩‍👧 and most flags; the catalogue's shortest name,
  // "Zap", is longer. A stricter check would need an emoji table to ship.
  return Array.from(value).length <= 2;
}

/**
 * A project's icon, as a glyph.
 *
 * Every surface that shows a project — the card, the list, the detail header,
 * the archive — renders the icon through this. They all used to print the raw
 * `icon` column, so choosing "Rocket" displayed the word *Rocket* next to the
 * project's name, everywhere, which reads as a bug and is one: the column holds
 * a name, and only the catalogue can turn it back into a shape.
 *
 * Falls back in three steps, so there is no state where a project shows nothing
 * where its icon should be: the catalogue glyph, then a custom emoji, then the
 * first letter of its name.
 */
export function ProjectIcon({
  name,
  fallbackName,
  className,
  /** Fills the glyph with `currentColor` so it picks up the tile's colour. */
  filled = true,
}: {
  name?: string | null;
  /** Used when there is no usable icon. Usually the project name. */
  fallbackName?: string | null;
  className?: string;
  filled?: boolean;
}) {
  const trimmed = name?.trim() ?? "";
  // A direct map read, not `resolveIcon(...)` — see the note on ICON_BY_NAME.
  const Glyph = trimmed ? ICON_BY_NAME[trimmed.toLowerCase()] : undefined;

  if (Glyph) {
    return <Glyph className={cn(filled && "fill-current", className)} aria-hidden="true" />;
  }

  if (trimmed && looksLikeEmoji(trimmed)) {
    return (
      <span className={cn("select-none leading-none", className)} role="img">
        {trimmed}
      </span>
    );
  }

  // No icon, or a name this build does not ship: the project's initial, which is
  // the same fallback a project created without an icon has always used.
  return (
    <span className={cn("font-bold", className)} aria-hidden="true">
      {(fallbackName ?? trimmed).trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function IconPicker({
  value,
  onChange,
  label = "Icon",
  placeholder = "Select an icon",
  className,
  showSearch = true,
}: IconPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [openCategory, setOpenCategory] = useState<string | null>(ICON_CATEGORIES[0].name);
  const [showCustomEmoji, setShowCustomEmoji] = useState(false);
  const [customEmoji, setCustomEmoji] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const allIcons = useMemo(() => getAllIcons(), []);

  const filteredIcons = useMemo(() => {
    if (!searchQuery.trim()) return allIcons;
    const query = searchQuery.toLowerCase();
    return allIcons.filter((icon) => icon.name.toLowerCase().includes(query));
  }, [allIcons, searchQuery]);

  const iconsByCategory = useMemo(() => {
    const grouped: Record<string, IconItem[]> = {};
    for (const icon of filteredIcons) {
      if (!grouped[icon.category]) grouped[icon.category] = [];
      grouped[icon.category].push(icon);
    }
    return grouped;
  }, [filteredIcons]);

  const handleIconClick = (iconName: string) => {
    onChange(iconName);
  };

  const handleCustomEmojiSubmit = () => {
    if (customEmoji.trim()) {
      onChange(customEmoji.trim());
      setShowCustomEmoji(false);
      setCustomEmoji("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setShowCustomEmoji(false);
      setCustomEmoji("");
    }
    if (e.key === "Enter" && showCustomEmoji) {
      handleCustomEmojiSubmit();
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCustomEmoji(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={cn("space-y-2", className)} ref={dropdownRef} onKeyDown={handleKeyDown}>
      <label className="block text-sm font-medium">{label}</label>
      <div className="relative">
        <div className="flex items-center gap-2">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-input bg-muted text-foreground"
            role="button"
            tabIndex={0}
            onClick={() => searchInputRef.current?.focus()}
          >
            {value ? (
              <span className="text-lg" role="img" aria-label={value}>
                {value.length <= 2 ? value : <span className="text-sm font-bold">{value.slice(0, 2)}</span>}
              </span>
            ) : (
              <span className="text-muted-foreground text-sm">Select</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            {showSearch && (
              <div className="relative">
                <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={placeholder}
                  className="h-8 w-full pl-9 pr-8 rounded-lg border border-input bg-transparent text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                  aria-label="Search icons"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 max-h-80 overflow-auto rounded-lg border border-input bg-popover p-2 shadow-lg">
          {showSearch && searchQuery ? (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1">
              {filteredIcons.map((icon) => (
                <button
                  key={icon.name}
                  type="button"
                  onClick={() => handleIconClick(icon.name)}
                  className={cn(
                    "flex size-10 items-center justify-center rounded-lg transition-colors",
                    "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    value === icon.name && "bg-primary text-primary-foreground"
                  )}
                  aria-label={icon.name}
                  aria-pressed={value === icon.name}
                >
                  <icon.component className="size-5" aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : (
            <>
              {ICON_CATEGORIES.map((category) => {
                const categoryIcons = iconsByCategory[category.name] ?? [];
                const isOpen = openCategory === category.name;
                return (
                  <div key={category.name} className="mb-2">
                    <button
                      type="button"
                      onClick={() => setOpenCategory(isOpen ? null : category.name)}
                      className={cn(
                        "flex w-full items-center justify-between px-2 py-1.5 text-sm font-medium text-muted-foreground",
                        "hover:text-foreground rounded transition-colors"
                      )}
                      aria-expanded={isOpen}
                    >
                      <span>{category.name}</span>
                      <span className="text-xs text-muted-foreground/70">{categoryIcons.length}</span>
                    </button>
                    {isOpen && (
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-1 mt-1 ml-2">
                        {categoryIcons.map((icon) => (
                          <button
                            key={icon.name}
                            type="button"
                            onClick={() => handleIconClick(icon.name)}
                            className={cn(
                              "flex size-10 items-center justify-center rounded-lg transition-colors",
                              "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              value === icon.name && "bg-primary text-primary-foreground"
                            )}
                            aria-label={icon.name}
                            aria-pressed={value === icon.name}
                          >
                            <icon.component className="size-5" aria-hidden="true" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="pt-2 border-t border-border/50">
                <button
                  type="button"
                  onClick={() => setShowCustomEmoji(!showCustomEmoji)}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground rounded transition-colors"
                >
                  <span className="text-lg">✨</span>
                  <span>Custom Emoji</span>
                </button>
                {showCustomEmoji && (
                  <div className="flex gap-2 mt-2">
                    <input
                      type="text"
                      value={customEmoji}
                      onChange={(e) => setCustomEmoji(e.target.value)}
                      placeholder="Paste emoji here…"
                      maxLength={10}
                      className="h-8 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-lg outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                      aria-label="Custom emoji"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleCustomEmojiSubmit}
                      className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface IconPreviewProps {
  // Optional: a project can be created before an icon is chosen, and the
  // component already renders a no-icon state for it.
  icon?: string;
  color?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const previewSizes = {
  sm: "size-6",
  md: "size-10",
  lg: "size-14",
  xl: "size-20",
};

export function IconPreview({ icon, color, size = "md", className }: IconPreviewProps) {
  const trimmed = icon?.trim() ?? "";
  // A direct map read, not `resolveIcon(...)` — see the note on ICON_BY_NAME.
  const Glyph = trimmed ? ICON_BY_NAME[trimmed.toLowerCase()] : undefined;
  const isEmoji = trimmed.length > 0 && !Glyph && looksLikeEmoji(trimmed);

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg border overflow-hidden",
        previewSizes[size],
        className
      )}
      // Only tint the tile for a real icon. An emoji already carries its own
      // colours, and painting the box behind one fights with it.
      style={Glyph || !isEmoji ? { backgroundColor: color ?? "var(--muted)" } : undefined}
      aria-label={trimmed ? `Icon: ${trimmed}` : "No icon selected"}
    >
      {Glyph ? (
        // `fill-current` so a monochrome lucide glyph actually takes the tile's
        // colour instead of inheriting `currentColor` from the page text.
        <Glyph className="size-1/2 fill-current" aria-hidden="true" />
      ) : isEmoji ? (
        <span className="select-none text-[inherit] leading-none" role="img">
          {trimmed}
        </span>
      ) : trimmed ? (
        // A name we do not recognise. Showing the name is honest and lets the
        // user see which project is affected; showing nothing looks like a
        // rendering bug.
        <span
          className="max-w-full truncate px-1 text-[9px] font-medium uppercase opacity-80"
          title={`Unknown icon: ${trimmed}`}
        >
          {trimmed.slice(0, 3)}
        </span>
      ) : (
        <span className="text-muted-foreground">?</span>
      )}
    </div>
  );
}