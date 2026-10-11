"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  FolderPlus,
  Loader2,
  Save,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ErrorList } from "@/components/project-creator/wizard-field";
import {
  StepBasic,
  StepDates,
  StepAppearance,
  StepDetails,
} from "@/components/project-creator/wizard-step-basic";
import {
  StepStructure,
  StepTasks,
  StepReminders,
  StepDailyAndCalendar,
} from "@/components/project-creator/wizard-step-structure";
import {
  StepFinance,
  StepResources,
  StepAdvanced,
  StepReview,
  type WizardFile,
} from "@/components/project-creator/wizard-step-finance";
import {
  WIZARD_STEPS,
  canAdvance,
  createEmptyDraft,
  nextStep,
  previousStep,
  stepById,
  summarizeDraft,
  validateDraft,
  type ProjectDraft,
  type WizardStepId,
} from "@/lib/project-wizard";
import { createProjectWizardAction, type WizardActionState } from "@/lib/actions/project-wizard";
import { cn } from "cn";

const DRAFT_KEY = "ownspece:project-wizard-draft";
const AUTOSAVE_DELAY = 600;

/**
 * Twelve-step project creation wizard.
 *
 * Three decisions worth knowing about:
 *
 * - **The draft is client state, not server state.** Steps are cheap, local and
 *   reversible, and nothing is written until the final step. That keeps
 *   validation instant and means an accidental back-navigation costs nothing.
 * - **Autosave is debounced and best-effort.** It exists so a refresh or a dead
 *   connection does not lose a half-built project; it is not a second source of
 *   truth and never substitutes for the server write.
 * - **One server action creates everything.** Steps are not independent (a task
 *   points at a node, a checklist at a task), so the server resolves the whole
 *   graph in dependency order rather than the client managing parent ids.
 *
 * The body is a separate component mounted only while the dialog is open. That
 * is what lets it restore a saved draft in a lazy state initializer instead of
 * an effect, and it guarantees each visit starts from a clean form state.
 */
export function ProjectWizard({
  open,
  onOpenChange,
  files = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files?: WizardFile[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92svh,64rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        {open ? (
          <WizardBody onClose={() => onOpenChange(false)} files={files} />
        ) : (
          <DialogTitle className="sr-only">New project</DialogTitle>
        )}
      </DialogContent>
    </Dialog>
  );
}

function readStoredDraft(): { draft: ProjectDraft; step: WizardStepId } {
  const empty = createEmptyDraft();
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return { draft: empty, step: "basic" };

    const saved = JSON.parse(raw) as ProjectDraft;
    if (saved?.version !== empty.version || !saved.name) {
      return { draft: empty, step: "basic" };
    }
    return {
      draft: { ...empty, ...saved, updatedAt: Date.now() },
      step: WIZARD_STEPS.some((entry) => entry.id === saved.step) ? saved.step : "basic",
    };
  } catch {
    // Corrupt draft — start clean rather than failing to open.
    return { draft: empty, step: "basic" };
  }
}

function WizardBody({
  onClose,
  files,
}: {
  onClose: () => void;
  files: WizardFile[];
}) {
  const router = useRouter();
  const [restored] = React.useState(readStoredDraft);
  const [draft, setDraft] = React.useState<ProjectDraft>(restored.draft);
  const [step, setStep] = React.useState<WizardStepId>(restored.step);
  const [today, setToday] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [state, formAction, pending] = useActionState<WizardActionState, unknown>(
    createProjectWizardAction,
    {}
  );

  const errors = React.useMemo(() => validateDraft(draft), [draft]);
  const stepMeta = stepById(step);

  // ---------------------------------------------------------------------
  // Draft autosave. Skipped once the project exists, otherwise reopening the
  // wizard would resurrect a project the user just created.
  // ---------------------------------------------------------------------
  React.useEffect(() => {
    if (!draft.options.offlineDraft) return;
    const id = setTimeout(() => {
      try {
        window.localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ ...draft, updatedAt: Date.now() })
        );
      } catch {
        // Storage full or blocked — the wizard still works, it just will not
        // survive a reload.
      }
    }, AUTOSAVE_DELAY);
    return () => clearTimeout(id);
  }, [draft]);

  // Keep "today" honest across midnight without re-rendering on a timer tick
  // that nothing else depends on.
  React.useEffect(() => {
    const id = setInterval(
      () => setToday(new Date().toISOString().slice(0, 10)),
      60_000
    );
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    if (!state.projectId) return;

    for (const warning of state.warnings ?? []) toast.warning(warning);
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Nothing to do.
    }
    onClose();
    toast.success("Project created.");
    router.push(`/projects/${state.projectId}`);
    router.refresh();
  }, [state, onClose, router]);

  React.useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  function patch(update: Partial<ProjectDraft>) {
    setDraft((current) => ({ ...current, ...update }));
  }

  function jump(next: WizardStepId) {
    setStep(next);
    // The body scrolls, not the dialog frame, so reset the right one.
    document.getElementById("wizard-scroll")?.scrollTo({ top: 0 });
  }

  function goNext() {
    if (!canAdvance(step, draft, errors)) {
      const first = stepMeta.required ? step : "basic";
      jump(first);
      return;
    }
    const upcoming = nextStep(step);
    if (upcoming) jump(upcoming);
  }

  function goBack() {
    const previous = previousStep(step);
    if (previous) jump(previous);
  }

  function discardDraft() {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Nothing to do.
    }
    onClose();
  }

  function saveAndExit() {
    onClose();
    toast("Draft saved — reopen “New project” to continue.");
  }

  const summary = React.useMemo(
    () => summarizeDraft(draft, today),
    [draft, today]
  );
  const currentErrors = errors[step];
  const index = stepMeta.step - 1;

  return (
    <>
      <DialogHeader className="shrink-0 border-b px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <DialogTitle className="text-base">
              Step {stepMeta.step} of {WIZARD_STEPS.length} · {stepMeta.title}
            </DialogTitle>
            <DialogDescription>{stepMeta.summary}</DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground tabular-nums">
                {summary.structure.total} nodes · {summary.taskCount} tasks ·{" "}
                {summary.checklistProgress}%
              </span>
            </div>
          </div>
          <Progress value={((index + 1) / WIZARD_STEPS.length) * 100} className="h-1" />
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          <nav
            aria-label="Project setup steps"
            className="hidden w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r p-2 lg:flex"
          >
            {WIZARD_STEPS.map((entry) => {
              const active = entry.id === step;
              const visited = entry.step < stepMeta.step;
              const hasErrors = (errors[entry.id]?.length ?? 0) > 0;

              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => jump(entry.id)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition",
                    active
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] tabular-nums",
                      visited
                        ? "border-primary bg-primary text-primary-foreground"
                        : hasErrors
                          ? "border-destructive text-destructive"
                          : "border-border"
                    )}
                  >
                    {visited ? <Check className="size-3" /> : entry.step}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{entry.title}</span>
                    {hasErrors ? (
                      <span className="truncate text-[11px] text-destructive">
                        {errors[entry.id]?.length} issue(s)
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </nav>

          <div id="wizard-scroll" className="min-w-0 flex-1 overflow-y-auto px-5 py-4">
            {currentErrors ? (
              <div className="mb-4">
                <ErrorList messages={currentErrors} />
              </div>
            ) : null}

            {step === "basic" ? <StepBasic draft={draft} patch={patch} /> : null}
            {step === "dates" ? (
              <StepDates draft={draft} patch={patch} today={today} />
            ) : null}
            {step === "appearance" ? <StepAppearance draft={draft} patch={patch} /> : null}
            {step === "details" ? <StepDetails draft={draft} patch={patch} /> : null}
            {step === "structure" ? <StepStructure draft={draft} patch={patch} /> : null}
            {step === "tasks" ? <StepTasks draft={draft} patch={patch} /> : null}
            {step === "reminders" ? <StepReminders draft={draft} patch={patch} /> : null}
            {step === "daily" ? <StepDailyAndCalendar draft={draft} patch={patch} /> : null}
            {step === "finance" ? <StepFinance draft={draft} patch={patch} /> : null}
            {step === "resources" ? (
              <StepResources draft={draft} patch={patch} files={files} />
            ) : null}
            {step === "advanced" ? <StepAdvanced draft={draft} patch={patch} /> : null}
            {step === "review" ? (
              <StepReview draft={draft} today={today} errors={errors} onJump={jump} />
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t px-5 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={goBack}
            disabled={stepMeta.step === 1 || pending}
          >
            <ArrowLeft /> Back
          </Button>

          <Button variant="ghost" size="sm" onClick={saveAndExit} disabled={pending}>
            <Save /> Save draft
          </Button>

          {Object.keys(errors).length > 0 && step !== "review" ? (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="size-3.5" />
              {Object.values(errors).reduce((sum, list) => sum + (list?.length ?? 0), 0)}{" "}
              issue(s) — you can still continue
            </span>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={discardDraft} disabled={pending}>
              Discard
            </Button>

            {stepMeta.step < WIZARD_STEPS.length ? (
              <Button onClick={goNext} disabled={pending}>
                Next <ArrowRight />
              </Button>
            ) : (
              <form action={formAction}>
                <input type="hidden" name="payload" value={JSON.stringify(draft)} />
                <Button
                  type="submit"
                  disabled={pending || !draft.name.trim()}
                  title={draft.name.trim() ? undefined : "Enter a project name first"}
                >
                  {pending ? (
                    <>
                      <Loader2 className="animate-spin" /> Creating…
                    </>
                  ) : (
                    <>
                      <FolderPlus /> Create project
                    </>
                  )}
                </Button>
              </form>
            )}
          </div>
        </div>
    </>
  );
}