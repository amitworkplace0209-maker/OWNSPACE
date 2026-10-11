"use client";

import { cn } from "cn";
import { Check } from "lucide-react";

export const PRESET_COLORS = [
  { name: "Indigo", value: "#6366f1", className: "bg-indigo-500" },
  { name: "Violet", value: "#8b5cf6", className: "bg-violet-500" },
  { name: "Blue", value: "#3b82f6", className: "bg-blue-500" },
  { name: "Cyan", value: "#06b6d4", className: "bg-cyan-500" },
  { name: "Emerald", value: "#10b981", className: "bg-emerald-500" },
  { name: "Teal", value: "#14b8a6", className: "bg-teal-500" },
  { name: "Rose", value: "#f43f5e", className: "bg-rose-500" },
  { name: "Orange", value: "#f97316", className: "bg-orange-500" },
  { name: "Amber", value: "#f59e0b", className: "bg-amber-500" },
  { name: "Red", value: "#ef4444", className: "bg-red-500" },
] as const;

export type PresetColor = (typeof PRESET_COLORS)[number];

interface ColorSelectorProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
  required?: boolean;
  error?: string;
  className?: string;
}

export function ColorSelector({
  value,
  onChange,
  label = "Color",
  required = false,
  error,
  className,
}: ColorSelectorProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <label className="block text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
        {PRESET_COLORS.map((color) => {
          const isSelected = value === color.value;
          return (
            <button
              key={color.name}
              type="button"
              onClick={() => onChange(color.value)}
              className={cn(
                "relative size-10 rounded-full border-2 transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "hover:scale-110 active:scale-95",
                isSelected
                  ? "border-foreground shadow-lg"
                  : "border-transparent hover:border-muted-foreground/50"
              )}
              style={{ backgroundColor: color.value }}
              aria-label={color.name}
              aria-pressed={isSelected}
            >
              {isSelected && (
                <Check className="absolute inset-0 m-auto size-5 text-white" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-10 rounded-lg border border-input cursor-pointer"
          aria-label="Custom color"
        />
        <span className="text-sm text-muted-foreground font-mono">{value}</span>
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
}

interface ColorPreviewProps {
  color: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "size-6",
  md: "size-10",
  lg: "size-14",
};

export function ColorPreview({ color, size = "md", className }: ColorPreviewProps) {
  return (
    <div
      className={cn(
        "rounded-lg border flex items-center justify-center overflow-hidden",
        sizeClasses[size],
        className
      )}
      style={{ backgroundColor: color }}
      aria-label={`Color preview: ${color}`}
    >
      {color && <span className="sr-only">{color}</span>}
    </div>
  );
}