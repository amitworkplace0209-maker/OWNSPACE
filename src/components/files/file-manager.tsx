"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2, FileText, UploadCloud, Image as ImageIcon, FileArchive, File as FileIcon, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { uploadFileAction, deleteFileAction, getSignedUrlAction } from "@/lib/actions/files";
import { formatDateShort, formatFileSize } from "@/lib/format";
import type { StoredFile } from "@/types";

type FileFormState = { error?: string; data?: { id: string; url: string } };

function fileIcon(mime: string | null) {
  if (!mime) return <FileIcon className="size-4" />;
  if (mime.startsWith("image/")) return <ImageIcon className="size-4 text-emerald-500" />;
  if (mime.startsWith("text/") || mime.includes("json") || mime.includes("pdf")) {
    return <FileText className="size-4 text-sky-500" />;
  }
  if (mime.includes("zip") || mime.includes("compressed")) return <FileArchive className="size-4 text-amber-500" />;
  return <FileIcon className="size-4 text-muted-foreground" />;
}

export function FileManager({
  projectId,
  taskId,
  files,
  readOnly = false,
}: {
  projectId?: string | null;
  taskId?: string | null;
  files: StoredFile[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState<StoredFile | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const action = uploadFileAction.bind(null, projectId ?? null, taskId ?? null);
  const [state, formAction, pending] = useActionState<FileFormState, FormData>(action, {});

  useEffect(() => {
    if (state.data) {
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    }
  }, [state.data, router]);

  const visibleFiles = query.trim()
    ? files.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase()))
    : files;

  async function download(file: StoredFile) {
    setDownloadError(null);
    const res = await getSignedUrlAction(file.id);
    if (res.error || !res.url) {
      setDownloadError(res.error ?? "Could not generate download link.");
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col gap-4">
      {state.error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
      ) : null}
      {downloadError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{downloadError}</p>
      ) : null}
      {deleteError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{deleteError}</p>
      ) : null}
      {!readOnly || files.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2">
          {!readOnly ? (
            <form action={formAction} className="flex flex-1 items-end gap-2">
              <div className="flex-1">
                <Input
                  ref={inputRef}
                  type="file"
                  name="file"
                  aria-label="Choose a file to upload"
                  required
                  disabled={pending}
                />
                {state.error ? <p className="mt-1 text-sm text-destructive">{state.error}</p> : null}
              </div>
              <Button type="submit" disabled={pending}>
                <UploadCloud /> {pending ? "Uploading…" : "Upload"}
              </Button>
            </form>
          ) : null}
          {files.length > 0 ? (
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search files…"
                aria-label="Search files"
                className="pl-8"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {files.length === 0 ? (
        <EmptyState
          icon={UploadCloud}
          title="No files"
          description="Files you upload here are stored securely in your private storage."
        />
      ) : visibleFiles.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching files"
          description={`No files match “${query.trim()}”.`}
        />
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
          {visibleFiles.map((f) => (
            <li
              key={f.id}
              className="group flex items-center gap-3 border-b border-border/50 px-4 py-3 last:border-0 hover:bg-accent/30"
            >
              {fileIcon(f.mime_type)}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{f.name}</p>
                <p className="text-xs text-muted-foreground">
                  {f.size_bytes != null ? formatFileSize(f.size_bytes) : null}
                  {f.created_at ? <> · {formatDateShort(f.created_at)}</> : null}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                <Button variant="ghost" size="icon-sm" aria-label={`Download ${f.name}`} onClick={() => download(f)}>
                  <Download className="size-4" />
                </Button>
                {!readOnly ? (
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${f.name}`} onClick={() => setDeleting(f)}>
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => { if (!open) setDeleting(null); }}
        title={`Delete "${deleting?.name ?? ""}"?`}
        description="The file is permanently removed from your storage."
        confirmLabel="Delete file"
        onConfirm={async () => {
          if (!deleting) return;
          setDeleteError(null);
          const res = await deleteFileAction(deleting.id);
          if (res.error) setDeleteError(res.error);
          setDeleting(null);
          router.refresh();
        }}
      />
    </div>
  );
}