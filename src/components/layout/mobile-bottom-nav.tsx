"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { bottomNav } from "@/config/navigation";

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }
  return pathname.startsWith(href);
}

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Bottom navigation"
      className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch justify-around border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
    >
      {bottomNav.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.title}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
              active
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <item.icon className="size-5" />
            <span>{item.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}