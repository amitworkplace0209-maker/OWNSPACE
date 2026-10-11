"use client";

import * as React from "react";
import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  Cloud,
  Database,
  FileUp,
  FolderTree,
  Link2,
  Loader2,
  Paperclip,
  UploadCloud,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/form-field";
import { DriveFilePicker, type PickedDriveFile } from "@/components/resources/drive-file-picker";
import { createResourceAction, type ResourceFormState } from "@/lib/actions/resources";
import { formatFileSize } from "@/lib/format";
import {
  KINDS_BY_SOURCE,
  kindLabel,
  kindNeedsUrl,
  MAX_UPLOAD_BYTES,
  validateUploadSize,
  type ResourceKind,
  type ResourceSource,
} from "@/lib/resources-logic";
import { cn } from "cn";
import type { GDriveConnection } from "@/types";

const DESTINATIONS: Array<{
  value: ResourceSource;
  label: string;
  description: string;
  icon: typeof Cloud;
}> = [
  {
    value: "supabase",
    label: "Upload",
    description: "Send a file from this device into your private storage.",
    icon: UploadCloud,
  },
  {
    value: "drive",
    label: "Google Drive",
    description: "Reference a file that already lives in one of your Drives.",
    icon: Cloud,
  },
  {
    value: "link",
    label: "Link",
    description: "Save a URL — a repo, docs, a video, an API reference.",
    icon: Link2,
  },
];

/**
 * Add-resource dialog.
 *
 * The form is destination-first: picking where the thing lives decides both the
 * type list and which inputs appear. An upload asks for a file, a Drive link
 * asks for an account and a file, and a link asks for a URL. Nothing that does
 * not apply is rendered, so there is no disabled field to wonder about.
 *
 * The server re-derives the same rules from the submitted source, so a
 * hand-edited form cannot create an upload with a Drive file id.
 */
export function AddResourceDialog({
  open,
  onOpenChange,
  projects,
  tasks,
  driveAccounts,
  defaultProjectId,
  defaultSource = "supabase",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Array<{ id: string; name: string; color: string | null }>;
  tasks: Array<{ id: string; title: string; project_id: string | null }>;
  driveAccounts: GDriveConnection[];
  defaultProjectId?: string | null;
  defaultSource?: ResourceSource;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [source, setSource] = React.useState<ResourceSource>(defaultSource);
  const [kind, setKind] = React.useState<ResourceKind>(KINDS_BY_SOURCE[defaultSource][0]);
  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [projectId, setProjectId] = React.useState(defaultProjectId ?? "");
  const [taskId, setTaskId] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [drive, setDrive] = React.useState<{
    connectionId: string | null;
    file: PickedDriveFile | null;
  }>({ connectionId: null, file: null });

  const [state, formAction, pending] = useActionState<ResourceFormState, FormData>(
    createResourceAction,
    {}
  );

  // Reset when the dialog closes rather than when it opens. Doing it during
  // render would be a ref write mid-render, and doing it in an effect would be
  // a second render after the fields briefly showed the last submission.
  const reset = React.useCallback(() => {
    setSource(defaultSource);
    setKind(KINDS_BY_SOURCE[defaultSource][0]);
    setName("");
    setUrl("");
    setDescription("");
    setTags("");
    setProjectId(defaultProjectId ?? "");
    setTaskId("");
    setFile(null);
    setDragging(false);
    setDrive({ connectionId: null, file: null });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [defaultProjectId, defaultSource]);

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) reset();
      onOpenChange(next);
    },
    [onOpenChange, reset]
  );

  useEffect(() => {
    if (!state.data || pending) return;
    toast.success("Resource added.");
    // Deferred a frame: closing the dialog resets the local fields, and doing
    // that inside the effect body would be a synchronous cascade of renders.
    const id = window.requestAnimationFrame(() => {
      handleOpenChange(false);
      router.refresh();
    });
    return () => window.cancelAnimationFrame(id);
  }, [state.data, pending, handleOpenChange, router]);

  const kinds = KINDS_BY_SOURCE[source];
  const needsFile = source === "supabase";
  const needsDriveFile = source === "drive";
  const needsUrl = source === "link" && kindNeedsUrl(kind);

  const taskOptions = taskId ? tasks : tasks.filter((task) => !projectId || task.project_id === projectId);

  function pickFile(next: File | null) {
    if (!next) return;
    const validation = validateUploadSize(next.size);
    if (!validation.ok) {
      toast.error(validation.error);
      return;
    }
    setFile(next);
    if (!name) setName(next.name);
  }

  function changeSource(next: ResourceSource) {
    setSource(next);
    setKind(KINDS_BY_SOURCE[next][0]);
  }

  const canSubmit = !pending && (
    source === "supabase" ? Boolean(file) : source === "drive" ? Boolean(drive.file) : true
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a resource</DialogTitle>
          <DialogDescription>
            Pick where it lives. Everything else follows from that choice.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-5">
          <input type="hidden" name="source" value={source} />
          <input type="hidden" name="kind" value={kind} />
          <input
            type="hidden"
            name="connection_id"
            value={drive.connectionId ?? ""}
          />
          <input type="hidden" name="drive_file_id" value={drive.file?.id ?? ""} />
          <input type="hidden" name="drive_name" value={drive.file?.name ?? ""} />
          <input type="hidden" name="drive_mime_type" value={drive.file?.mimeType ?? ""} />
          <input type="hidden" name="drive_size" value={drive.file?.size ?? ""} />
          <input type="hidden" name="drive_web_link" value={drive.file?.webLink ?? ""} />

          {/* --- Destination --- */}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Where does it live?</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {DESTINATIONS.map((destination) => {
                const Icon = destination.icon;
                const active = source === destination.value;
                const disabled =
                  destination.value === "drive" &&
                  driveAccounts.filter((account) => account.status === "active").length === 0;

                return (
                  <button
                    key={destination.value}
                    type="button"
                    disabled={disabled}
                    title={
                      disabled
                        ? "Connect a Google Drive account first"
                        : destination.description
                    }
                    aria-pressed={active}
                    onClick={() => changeSource(destination.value)}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition",
                      active
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "hover:border-primary/40 hover:bg-accent/40",
                      disabled && "cursor-not-allowed opacity-50 hover:border-border hover:bg-transparent"
                    )}
                  >
                    <Icon className={cn("size-4", active ? "text-primary" : "text-muted-foreground")} />
                    <span className="text-sm font-medium">{destination.label}</span>
                    <span className="text-xs text-muted-foreground">{destination.description}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* --- Type --- */}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">What kind of resource?</legend>
            <div className="flex flex-wrap gap-1.5">
              {kinds.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={kind === option}
                  onClick={() => setKind(option)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition",
                    kind === option
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  )}
                >
                  {kindLabel(option)}
                </button>
              ))}
            </div>
          </fieldset>

          {/* --- Destination-specific input --- */}
          {needsFile ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">File</span>
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  pickFile(event.dataTransfer.files?.[0] ?? null);
                }}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition",
                  dragging
                    ? "border-primary bg-primary/10"
                    : file
                      ? "border-success/50 bg-success/5"
                      : "border-border hover:border-primary/40"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  name="file"
                  className="sr-only"
                  onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
                />
                {file ? (
                  <>
                    <CheckCircle2 className="size-6 text-success" />
                    <span className="max-w-full truncate text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                      {file.type ? ` · ${file.type}` : ""}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                    >
                      Choose a different file
                    </Button>
                  </>
                ) : (
                  <>
                    <FileUp className="size-6 text-muted-foreground" />
                    <p className="text-sm font-medium">Drop a file here</p>
                    <p className="text-xs text-muted-foreground">
                      or pick one from your device — up to{" "}
                      {Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Browse files
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : null}

          {needsDriveFile ? (
            <FormField
              label="File"
              hint="Folders are drilled into; search runs against Drive itself."
            >
              <DriveFilePicker
                accounts={driveAccounts}
                connectionId={drive.connectionId}
                pickedFileId={drive.file?.id}
                onChange={setDrive}
              />
              {drive.file ? (
                <p className="mt-1.5 text-sm font-medium">{drive.file.name}</p>
              ) : null}
            </FormField>
          ) : null}

          {needsUrl ? (
            <FormField label="URL" htmlFor="resource-url">
              <Input
                id="resource-url"
                name="url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder={
                  kind === "repository"
                    ? "https://github.com/you/project"
                    : kind === "api"
                      ? "https://api.example.com/docs"
                      : "https://example.com/page"
                }
                required
              />
            </FormField>
          ) : null}

          {/* --- Shared metadata --- */}
          <FormField label="Name" hint="Leave blank to use the file or link name.">
            <Input
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="What is this?"
              maxLength={300}
            />
          </FormField>

          <FormField label="Description" htmlFor="resource-description">
            <Textarea
              id="resource-description"
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              placeholder="Optional notes about this resource."
            />
          </FormField>

          <FormField label="Tags" hint="Comma separated, up to twelve.">
            <Input
              name="tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="design, client, spec"
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Project" hint="Optional — leave empty for a workspace-wide resource.">
              <select
                name="project_id"
                value={projectId}
                onChange={(event) => {
                  setProjectId(event.target.value);
                  setTaskId("");
                }}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
              >
                <option value="">No project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Task" hint="Optional — attach to one task.">
              <select
                name="task_id"
                value={taskId}
                onChange={(event) => setTaskId(event.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
              >
                <option value="">No task</option>
                {taskOptions.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          {state.error ? (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {pending ? (
                <>
                  <Loader2 className="animate-spin" /> Adding…
                </>
              ) : (
                <>
                  <Paperclip /> Add resource
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Icons for the resource cards, keyed by type. */
export const KIND_ICONS: Record<ResourceKind, typeof Paperclip> = {
  link: Link2,
  file: FileUp,
  google_drive: Cloud,
  supabase_file: Database,
  note: FileUp,
  document: FileUp,
  repository: FolderTree,
  api: FolderTree,
  video: FileUp,
  image: FileUp,
  custom: Paperclip,
};