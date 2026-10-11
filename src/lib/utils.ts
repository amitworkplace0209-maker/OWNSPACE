export { cn } from "cn";

export function initials(displayName: string | null | undefined, email: string): string {
  const name = displayName?.trim();
  if (name) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("");
  }
  return (email[0] ?? "U").toUpperCase();
}
