export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    // A div, not a <main>: the shell renders its own main landmark, and two of
    // them break the landmark outline for anyone navigating by heading or region.
    // The safe-area padding matters here more than anywhere else — the sign-in
    // form is often the first thing a phone user sees after installing the PWA,
    // and it is exactly where a notch or a home indicator would clip it.
    <div className="min-h-svh pb-[env(safe-area-inset-bottom)]">{children}</div>
  );
}