"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";

export function AccountSettings() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Your account, projects and files stay on Ownspece. Signing out does not delete anything.
      </p>
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => void signOutAction()}>
          <LogOut /> Log out
        </Button>
      </div>
    </div>
  );
}