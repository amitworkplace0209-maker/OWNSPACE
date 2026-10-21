"use client";

import { Settings, LogOut, User, Palette } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutOnDevice } from "@/lib/auth/sign-out.client";
import { initials } from "@/lib/utils";
import type { AppUser } from "@/types";

/**
 * Account menu, in two shapes: `full` for the sidebar footer, `compact` for the
 * topbar where the avatar has to sit on its own.
 */
export function UserMenu({
  user,
  compact = false,
}: {
  user: AppUser;
  compact?: boolean;
}) {
  const avatar = (
    <Avatar size="sm" className="size-7">
      <AvatarFallback className="text-xs font-medium">
        {initials(user.displayName, user.email)}
      </AvatarFallback>
    </Avatar>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          compact ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              aria-label="Account menu"
            >
              {avatar}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-full justify-start gap-2 px-2"
              aria-label="Account menu"
            >
              {avatar}
              <span className="min-w-0 flex-1 truncate text-left text-sm">
                {user.displayName ?? user.email}
              </span>
            </Button>
          )
        }
      />
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <span className="flex min-w-0 items-center gap-2">
              {avatar}
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {user.displayName ?? "Account"}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {user.email}
                </span>
              </span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/profile" />}>
            <User /> Profile
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/settings" />}>
            <Settings /> Settings
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/settings#appearance" />}>
            <Palette /> Appearance
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            // The device's own copy of the account is wiped here, in the
            // browser, before the session goes — a server action has no
            // IndexedDB and no localStorage to wipe.
            void signOutOnDevice(user.id);
          }}
        >
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}