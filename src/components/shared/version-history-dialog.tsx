"use client";

import { useState } from "react";
import { History, ChevronDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatDateTime } from "@/lib/format";
import { cn } from "cn";

export type VersionItem = {
  id: string;
  created_at: string;
  content: string;
};

export function VersionHistoryDialog({
  open,
  onOpenChange,
  versions,
  onRestore,
  title = "Version history",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versions: VersionItem[];
  onRestore?: (versionId: string) => Promise<void> | void;
  title?: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<VersionItem | null>(null);

  if (versions.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="size-4" /> {title}
            </DialogTitle>
            <DialogDescription>No saved versions yet. Versions are recorded each time you save a change.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="size-4" /> {title}
            </DialogTitle>
            <DialogDescription>
              {versions.length} snapshot{versions.length === 1 ? "" : "s"} — preview any version and restore it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1">
            {versions.map((version, index) => {
              const expanded = expandedId === version.id;
              return (
                <div key={version.id} className="flex flex-col rounded-xl border bg-card">
                  <div className="flex items-center justify-between gap-2 p-3">
                    <button
                      type="button"
                      className="flex min-w-0 items-center gap-2 text-left"
                      onClick={() => setExpandedId(expanded ? null : version.id)}
                    >
                      <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Version {index + 1}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(version.created_at)}</p>
                      </div>
                    </button>
                    {onRestore ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRestoring(version)}
                        disabled={restoring?.id === version.id}
                      >
                        <RotateCcw className="size-3.5" /> Restore
                      </Button>
                    ) : null}
                  </div>
                  {expanded ? (
                    <div className="border-t px-3 pb-3 pt-2">
                      <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-xs leading-relaxed">
                        {version.content.trim() ? version.content : "(empty content)"}
                      </pre>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(restoring)}
        onOpenChange={(open) => {
          if (!open) setRestoring(null);
        }}
        destructive={false}
        title="Restore this version?"
        description="This replaces the current content with the selected version. The current content is saved as a new version first."
        confirmLabel="Restore version"
        onConfirm={async () => {
          if (!restoring || !onRestore) return;
          await onRestore(restoring.id);
          setRestoring(null);
          setExpandedId(null);
          onOpenChange(false);
        }}
      />
    </>
  );
}