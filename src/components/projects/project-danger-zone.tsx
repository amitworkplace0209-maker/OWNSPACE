"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StepSection } from "@/components/project-creator/wizard-field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteProjectAction, setProjectStatusAction } from "@/lib/actions/projects";
import type { ProjectStatus } from "@/types";

/**
 * Destructive and status actions for a project.
 *
 * Archive is offered as the reversible option and delete is behind an explicit
 * confirmation that names the project — deleting cascades to every task, note,
 * file, node and transaction inside it.
 */
export function ProjectDangerZone({
  projectId,
  projectName,
  currentStatus,
}: {
  projectId: string;
  projectName: string;
  currentStatus: ProjectStatus;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function changeStatus(status: ProjectStatus) {
    startTransition(async () => {
      const result = await setProjectStatusAction(projectId, status);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Project marked as ${status.replace("_", " ")}.`);
      router.refresh();
    });
  }

  return (
    <StepSection
      title="Archive or delete"
      description="Archiving is reversible. Deleting removes everything inside this project permanently."
    >
      <div className="flex flex-wrap items-center gap-2">
        {currentStatus !== "archived" ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => changeStatus("archived")}
          >
            Archive project
          </Button>
        ) : (
          <Button variant="outline" disabled={pending} onClick={() => changeStatus("active")}>
            Restore from archive
          </Button>
        )}

        <Button
          variant="destructive"
          disabled={pending}
          onClick={() => setConfirming(true)}
        >
          <Trash2 /> Delete project
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete "${projectName}"?`}
        description="This permanently removes the project along with its tasks, notes, files, structure, checklists, reminders and transactions. This cannot be undone."
        confirmLabel="Delete permanently"
        onConfirm={async () => {
          const result = await deleteProjectAction(projectId);
          setConfirming(false);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("Project deleted.");
          router.push("/projects");
          router.refresh();
        }}
      />
    </StepSection>
  );
}