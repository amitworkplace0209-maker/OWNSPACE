"use client";

import * as React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary for the authenticated app shell. Catches
 * unexpected errors in pages below (app)/layout.tsx so the shell survives and
 * the user gets a friendly retry instead of a hard crash.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("Ownspece page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="size-6 text-destructive" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          This page hit an unexpected error. Your data is safe — try again, or
          head back to the dashboard.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>
          <RotateCcw /> Try again
        </Button>
        <Button render={<a href="/dashboard" />} variant="outline">
          Go to dashboard
        </Button>
      </div>
    </div>
  );
}