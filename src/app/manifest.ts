import type { MetadataRoute } from "next";

/**
 * Web app manifest.
 *
 * `background_color` is what the splash screen paints before the first frame,
 * so a hardcoded white meant every AMOLED user got a white flash on launch.
 * Near-black matches the dark default and reads as intentional on a light
 * install too; the in-app `ThemeChromeSync` then takes over the real colour.
 *
 * `display_override` lets a browser that supports `window-controls-overlay`
 * (desktop Chrome/Edge) float the topbar into the OS title bar, while standalone
 * and browser both remain valid fallbacks.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "Ownspece — Personal Project Operating System",
    short_name: "Ownspece",
    description:
      "A personal project operating system for organizing projects, tasks, notes, files and time.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "browser"],
    orientation: "any",
    background_color: "#0a0c11",
    theme_color: "#0a0c11",
    categories: ["productivity", "utilities"],
    prefer_related_applications: false,
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Long-press shortcuts on the installed icon. `start_url` keeps each one
    // inside the scope, and `?new=1` is the query each workspace reads to open
    // its create form directly.
    shortcuts: [
      {
        name: "New task",
        short_name: "Task",
        description: "Create a task",
        url: "/tasks?new=1",
        icons: [{ src: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "New note",
        short_name: "Note",
        description: "Write a note",
        url: "/notes?new=1",
        icons: [{ src: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "New project",
        short_name: "Project",
        description: "Start a project",
        url: "/projects?new=1",
        icons: [{ src: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Focus timer",
        short_name: "Focus",
        description: "Start a focus session",
        url: "/time",
        icons: [{ src: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}