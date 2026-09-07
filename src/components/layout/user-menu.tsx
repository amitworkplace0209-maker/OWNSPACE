"use client";

import { Settings, LogOut, User } from "lucide-react";
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
import { signOutAction } from "@/lib/auth/actions";
import type { AppUser } from "@/types";

function initialsOf(user: AppUser): string {
  const fromName = user.displayName?.trim();
  if (fromName) {
    return fromName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }
  return (user.email[0] ?? "U").toUpperCase();
}

export function UserMenu({ user }: { user: AppUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-full justify-start gap-2 px-2"
            aria-label="User menu"
          >
            <Avatar size="sm" className="size-6">
              <AvatarFallback className="text-xs">
                {initialsOf(user)}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate text-left text-sm">
              {user.displayName ?? user.email}
            </span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>My Account</DropdownMenuLabel>
          <DropdownMenuItem
            render={
              <Link href="/profile">
                <User /> Profile
              </Link>
            }
          />
          <DropdownMenuItem
            render={
              <Link href="/settings">
                <Settings /> Settings
              </Link>
            }
          />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            void signOutAction();
          }}
        >
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}