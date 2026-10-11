"use client";

import * as React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Per-section error boundary.
 *
 * A dashboard is assembled from many independent server fetches; this makes
 * sure one failing query degrades to a single broken card instead of taking
 * the whole page down. The stack trace is logged to the console only — the
 * user sees a plain message and a Retry that re-runs the server fetch.
 */
export class SectionErrorBoundary extends React.Component<
  { title: string; children: React.ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error) {
    console.error(`Dashboard section "${this.props.title}" failed:`, error);
  }

  override render() {
    if (this.state.failed) {
      return <SectionErrorFallback title={this.props.title} onRetry={() => this.setState({ failed: false })} />;
    }
    return this.props.children;
  }
}

function SectionErrorFallback({
  title,
  onRetry,
}: {
  title: string;
  onRetry: () => void;
}) {
  const router = useRouter();
  const [pending, startPending] = React.useTransition();

  function retry() {
    onRetry();
    // Resetting the boundary alone would replay the failed RSC payload, so
    // refresh instead — that re-runs the section's server-side query.
    startPending(() => router.refresh());
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="grid-cols-[1fr_auto]">
        <CardTitle className="flex items-center gap-2 text-sm">
          <AlertTriangle aria-hidden="true" className="size-4 text-warning" />
          <span className="truncate">{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-start gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Unable to load this section.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={retry}
            disabled={pending}
          >
            <RotateCcw className={pending ? "animate-spin" : undefined} />
            {pending ? "Retrying…" : "Retry"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
