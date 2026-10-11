import {
  FileText,
  Film,
  Image as ImageIcon,
  FileArchive,
  FileCode2,
  File as FileIcon,
} from "lucide-react";

/** Icon per storage category — shared by the storage page and the dashboard. */
export const categoryIcons: Record<string, typeof FileIcon> = {
  Images: ImageIcon,
  Videos: Film,
  PDF: FileText,
  Documents: FileText,
  ZIP: FileArchive,
  "Source Code": FileCode2,
  Other: FileIcon,
};

/**
 * Hex accents per storage category.
 *
 * These are deliberately theme-independent swatches (they sit on their own
 * translucent backgrounds) so they read the same in light, dark and AMOLED.
 */
export const categoryColors: Record<string, string> = {
  Images: "#34d399",
  Videos: "#f472b6",
  PDF: "#f87171",
  Documents: "#60a5fa",
  ZIP: "#fbbf24",
  "Source Code": "#a78bfa",
  Other: "#94a3b8",
};
