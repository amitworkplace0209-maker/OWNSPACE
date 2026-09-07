"use client";

import { useState } from "react";
import { Download, Loader2, FileJson } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportAllDataAction } from "@/lib/actions/export";

export function ExportData() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    setDone(false);
    try {
      const res = await exportAllDataAction();
      if (res.error) {
        setError(res.error);
        return;
      }
      if (!res.json) {
        setError("Nothing was exported.");
        return;
      }
      const blob = new Blob([res.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ownspece-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setDone(true);
    } catch {
      setError("Export failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={run} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {loading ? "Preparing export…" : "Export my data"}
        </Button>
        {done ? <span className="text-sm text-emerald-600">Export downloaded.</span> : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
        <FileJson className="mt-0.5 size-4 shrink-0" />
        <p>
          Downloads a JSON document with your projects, tasks, notes, wiki, calendar, reminders,
          files metadata, time entries and more — from <strong>your</strong> account only. File data
          (uploaded attachments) is not embedded; the export lists each file&apos;s metadata but does
          not include the binary contents.
        </p>
      </div>
    </div>
  );
}