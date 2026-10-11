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
  sm: "size-6 text-base",
  md: "size-10 text-xl",
  lg: "size-14 text-2xl",
  xl: "size-20 text-4xl",
};

export function IconPreview({ icon, color, size = "md", className }: IconPreviewProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg border overflow-hidden",
        previewSizes[size],
        className
      )}
      style={{ backgroundColor: color ?? "var(--muted)", color: color ? "white" : "inherit" }}
      aria-label={icon ? `Icon: ${icon}` : "No icon selected"}
    >
      {icon ? (
        <span className="select-none" role="img" aria-hidden="true">
          {icon.length <= 2 ? icon : icon.slice(0, 2)}
        </span>
      ) : (
        <span className="text-muted-foreground">?</span>
      )}
    </div>
  );
}