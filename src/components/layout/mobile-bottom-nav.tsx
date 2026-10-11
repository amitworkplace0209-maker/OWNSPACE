"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { bottomNav } from "@/config/navigation";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "cn";

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }
  return pathname.startsWith(href);
}

/**
 * Mobile bottom navigation.
 *
 * Sits above the home indicator (`safe-b`) and above the frosted page chrome,
 * so the last tab is never half-hidden behind the iOS gesture bar. The active
 * item gets a gradient pill rather than just a colour change, which is the only
 * reliable active-state signal at that size.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  return (
    <nav
      aria-label="Bottom navigation"
      className="chrome-blur fixed inset-x-0 bottom-0 z-40 border-t md:hidden"
    >
      <div className="safe-b">
        <ul className="flex h-15 items-stretch justify-around">
          {bottomNav.map((item) => {
            const active = item.title === "More" ? false : isActivePath(pathname, item.href);

            const content = (
              <>
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-8 min-w-14 items-center justify-center rounded-xl transition-colors",
                    active && "nav-pill-active"
                  )}
                >
                  <item.icon className="size-5" />
                </span>
                <span className="text-[10px] leading-none font-medium">{item.title}</span>
              </>
            );

            const className = cn(
              "flex flex-1 flex-col items-center justify-center gap-1 pt-1.5 pb-1.5 transition-colors",
              active ? "text-primary" : "text-muted-foreground"
            );

            return (
              <li key={item.title} className="flex flex-1">
                {item.title === "More" ? (
                  <button
                    type="button"
                    onClick={() => setOpenMobile(true)}
                    aria-label="Open navigation menu"
                    className={cn(className, "w-full")}
                  >
                    {content}
                  </button>
                ) : (
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(className, "w-full")}
                  >
                    {content}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}