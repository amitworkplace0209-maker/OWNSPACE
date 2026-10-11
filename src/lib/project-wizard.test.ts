import { describe, expect, it } from "vitest";
import {
  DRAFT_VERSION,
  WIZARD_STEPS,
  canAdvance,
  computeChecklistProgress,
  computeCountdown,
  computeNodeProgress,
  countErrors,
  countStructure,
  createEmptyDraft,
  daysBetween,
  nextStep,
  parseTags,
  previousStep,
  summarizeDraft,
  summarizeFinance,
  validateDraft,
  type DraftChecklist,
  type DraftNode,
  type ProjectDraft,
  type WizardStepId,
} from "@/lib/project-wizard";

const TODAY = "2024-06-15";

function draftWith(overrides: Partial<ProjectDraft> = {}): ProjectDraft {
  return { ...createEmptyDraft(), updatedAt: 0, ...overrides };
}

function node(overrides: Partial<DraftNode> = {}): DraftNode {
  return {
    key: "n1",
    parentKey: null,
    nodeType: "phase",
    title: "Phase 1",
    description: "",
    startDate: "",
    dueDate: "",
    status: "planned",
    priority: "none",
    notes: "",
    ...overrides,
  };
}

function checklist(overrides: Partial<DraftChecklist> = {}): DraftChecklist {
  return {
    key: "c1",
    nodeKey: null,
    taskKey: null,
    parentKey: null,
    title: "Checklist",
    description: "",
    dueDate: "",
    priority: "none",
    items: [],
    ...overrides,
  };
}

describe("step definitions", () => {
  it("has twelve steps numbered 1..12 in order", () => {
    expect(WIZARD_STEPS).toHaveLength(12);
    expect(WIZARD_STEPS.map((s) => s.step)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it("only requires step 1", () => {
    expect(WIZARD_STEPS.filter((s) => s.required).map((s) => s.id)).toEqual(["basic"]);
  });

  it("walks forward and backward without falling off either end", () => {
    expect(nextStep("basic")).toBe("dates");
    expect(nextStep("review")).toBeNull();
    expect(previousStep("basic")).toBeNull();
    expect(previousStep("dates")).toBe("basic");
  });

  it("starts and ends on the expected steps", () => {
    expect(WIZARD_STEPS[0].id).toBe("basic");
    expect(WIZARD_STEPS[11].id).toBe("review");
  });
});

describe("daysBetween", () => {
  it("counts whole days between two ISO dates", () => {
    expect(daysBetween("2024-06-01", "2024-06-15")).toBe(14);
    expect(daysBetween("2024-06-15", "2024-06-01")).toBe(-14);
    expect(daysBetween("2024-06-15", "2024-06-15")).toBe(0);
  });

  it("crosses a month and a leap day correctly", () => {
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(daysBetween("2024-02-28", "2024-02-29")).toBe(1);
  });

  it("returns 0 rather than NaN for junk input", () => {
    expect(daysBetween("nope", "2024-06-15")).toBe(0);
    expect(daysBetween("", "")).toBe(0);
  });
});

describe("computeCountdown", () => {
  it("reports no schedule when neither bound is set", () => {
    const result = computeCountdown("", "", TODAY);
    expect(result.hasSchedule).toBe(false);
    expect(result.totalDays).toBe(0);
    expect(result.isOverdue).toBe(false);
  });

  it("splits a mid-project window into elapsed and remaining", () => {
    const result = computeCountdown("2024-06-01", "2024-06-29", TODAY);

    expect(result.totalDays).toBe(28);
    expect(result.daysElapsed).toBe(14);
    expect(result.daysRemaining).toBe(14);
    expect(result.elapsedPercent).toBe(50);
    expect(result.remainingPercent).toBe(50);
    expect(result.isOverdue).toBe(false);
  });

  it("keeps elapsed and remaining summing to 100", () => {
    const early = computeCountdown("2024-06-01", "2024-07-01", TODAY);
    const late = computeCountdown("2024-06-01", "2024-07-01", "2024-06-28");

    expect(early.elapsedPercent + early.remainingPercent).toBe(100);
    expect(late.elapsedPercent + late.remainingPercent).toBe(100);
  });

  it("flags a past deadline as overdue and clamps remaining to zero", () => {
    const result = computeCountdown("2024-05-01", "2024-06-01", TODAY);

    expect(result.isOverdue).toBe(true);
    expect(result.daysRemaining).toBe(0);
    expect(result.remainingPercent).toBe(0);
  });

  it("is not overdue on the deadline day itself", () => {
    expect(computeCountdown("2024-06-01", TODAY, TODAY).isOverdue).toBe(false);
  });

  it("handles a due date with no start date", () => {
    const result = computeCountdown("", "2024-06-25", TODAY);

    expect(result.hasSchedule).toBe(true);
    expect(result.totalDays).toBe(10);
    expect(result.daysRemaining).toBe(10);
  });

  it("handles a start date with no due date", () => {
    const result = computeCountdown("2024-06-01", "", TODAY);

    expect(result.hasSchedule).toBe(true);
    expect(result.daysElapsed).toBe(14);
    expect(result.isOverdue).toBe(false);
  });

  it("does not divide by zero for a single-day project", () => {
    const result = computeCountdown(TODAY, TODAY, TODAY);
    expect(result.totalDays).toBe(0);
    expect(result.elapsedPercent).toBe(0);
    expect(result.remainingPercent).toBe(0);
    expect(Number.isNaN(result.elapsedPercent)).toBe(false);
  });
});

describe("computeChecklistProgress", () => {
  it("is the documented 12 of 20 = 60 example", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ isCompleted: i < 12 }));
    expect(computeChecklistProgress(items)).toBe(60);
  });

  it("returns 0 for an empty checklist instead of NaN", () => {
    expect(computeChecklistProgress([])).toBe(0);
  });

  it("returns 0 and 100 at the extremes", () => {
    expect(computeChecklistProgress([{ isCompleted: false }])).toBe(0);
    expect(computeChecklistProgress([{ isCompleted: true }])).toBe(100);
  });

  it("rounds rather than truncates", () => {
    const items = Array.from({ length: 3 }, (_, i) => ({ isCompleted: i < 2 }));
    expect(computeChecklistProgress(items)).toBe(67);
  });
});

describe("computeNodeProgress", () => {
  it("is fully complete when every child is complete", () => {
    const result = computeNodeProgress({
      status: "in_progress",
      children: [{ status: "completed" }, { status: "completed" }],
    });
    expect(result).toBe(100);
  });

  it("is half complete with one of two children done", () => {
    const result = computeNodeProgress({
      status: "in_progress",
      children: [{ status: "completed" }, { status: "planned" }],
    });
    expect(result).toBe(50);
  });

  it("treats a childless node as binary", () => {
    expect(computeNodeProgress({ status: "completed", children: [] })).toBe(100);
    expect(computeNodeProgress({ status: "in_progress", children: [] })).toBe(0);
  });
});

describe("countStructure", () => {
  it("counts every node type and the total", () => {
    const counts = countStructure([
      node({ key: "a", nodeType: "phase" }),
      node({ key: "b", nodeType: "chapter" }),
      node({ key: "c", nodeType: "chapter" }),
      node({ key: "d", nodeType: "lesson" }),
      node({ key: "e", nodeType: "collection" }),
    ]);

    expect(counts.total).toBe(5);
    expect(counts.phase).toBe(1);
    expect(counts.chapter).toBe(2);
    expect(counts.lesson).toBe(1);
    expect(counts.collection).toBe(1);
    expect(counts.topic).toBe(0);
  });

  it("handles an empty structure", () => {
    expect(countStructure([]).total).toBe(0);
  });
});

describe("parseTags", () => {
  it("trims, drops blanks and de-duplicates case-insensitively", () => {
    expect(parseTags(" alpha , beta ,,alpha,BETA, gamma ")).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  it("returns an empty list for empty input", () => {
    expect(parseTags("")).toEqual([]);
    expect(parseTags("   ")).toEqual([]);
  });
});

describe("validateDraft", () => {
  it("accepts an empty draft except for the missing name", () => {
    const errors = validateDraft(createEmptyDraft());
    expect(errors.basic).toEqual(["Project name is required."]);
    expect(Object.keys(errors)).toEqual(["basic"]);
  });

  it("clears once a name is supplied", () => {
    expect(validateDraft(draftWith({ name: "Ownspece" }))).toEqual({});
  });

  it("rejects an inverted project schedule", () => {
    const errors = validateDraft(
      draftWith({ name: "X", startDate: "2024-06-10", dueDate: "2024-06-01" })
    );
    expect(errors.dates?.[0]).toMatch(/on or after/);
  });

  it("flags a structure node with a due date before its start", () => {
    const errors = validateDraft(
      draftWith({
        name: "X",
        nodes: [node({ startDate: "2024-06-10", dueDate: "2024-06-01" })],
      })
    );
    expect(errors.dates?.[0]).toMatch(/due date before their start date/);
  });

  it("flags an unnamed structure node", () => {
    const errors = validateDraft(draftWith({ name: "X", nodes: [node({ title: "  " })] }));
    expect(errors.structure).toContain("Every structure item needs a name.");
  });

  it("flags a node pointing at a parent that does not exist", () => {
    const errors = validateDraft(
      draftWith({ name: "X", nodes: [node({ parentKey: "ghost" })] })
    );
    expect(errors.structure?.[0]).toMatch(/parent that no longer exists/);
  });

  it("flags a circular parent chain", () => {
    const errors = validateDraft(
      draftWith({
        name: "X",
        nodes: [
          node({ key: "a", parentKey: "b", title: "A" }),
          node({ key: "b", parentKey: "a", title: "B" }),
        ],
      })
    );
    expect(errors.structure?.some((m) => m.includes("circular"))).toBe(true);
  });

  it("accepts a legitimate deep hierarchy", () => {
    const errors = validateDraft(
      draftWith({
        name: "X",
        nodes: [
          node({ key: "a", parentKey: null, title: "Phase" }),
          node({ key: "b", parentKey: "a", title: "Chapter" }),
          node({ key: "c", parentKey: "b", title: "Lesson" }),
        ],
      })
    );
    expect(errors.structure).toBeUndefined();
  });

  it("flags an empty checklist item", () => {
    const errors = validateDraft(
      draftWith({
        name: "X",
        checklists: [checklist({ items: [{ key: "i", content: " ", description: "", dueDate: "", priority: "none", isCompleted: false, parentKey: null }] })],
      })
    );
    expect(errors.tasks?.some((m) => m.includes("empty checklist item"))).toBe(true);
  });

  it("flags a reminder with no channel", () => {
    const errors = validateDraft(
      draftWith({
        name: "X",
        reminders: [
          {
            key: "r",
            title: "Ping",
            description: "",
            nodeKey: null,
            taskKey: null,
            checklistKey: null,
            remindAt: "2024-06-15T10:00",
            repeat: "none",
            repeatInterval: "",
            repeatUntil: "",
            channels: [],
            priority: "none",
            snoozeMinutes: "",
            sound: "",
            isEnabled: true,
            advanceMinutes: "",
          },
        ],
      })
    );
    expect(errors.reminders).toContain('"Ping" has no notification channel.');
  });

  it("rejects a non-positive transaction amount", () => {
    const errors = validateDraft(
      draftWith({
        name: "X",
        transactions: [
          {
            key: "t",
            type: "expense",
            amount: "0",
            categoryName: "Hosting",
            transactionDate: "2024-06-15",
            occurredAt: "",
            description: "Hosting bill",
            paymentMethod: "card",
            reference: "",
            nodeKey: null,
          },
        ],
      })
    );
    expect(errors.finance?.some((m) => m.includes("greater than zero"))).toBe(true);
  });

  it("rejects a negative budget", () => {
    const errors = validateDraft(draftWith({ name: "X", budget: "-5" }));
    expect(errors.finance).toContain("Budget cannot be negative.");
  });

  it("requires a URL or an uploaded file for a link resource", () => {
    const errors = validateDraft(
      draftWith({
        name: "X",
        resources: [
          {
            key: "r",
            resourceType: "link",
            name: "Docs",
            description: "",
            url: "",
            tags: "",
            nodeKey: null,
            fileId: null,
            upload: null,
          },
        ],
      })
    );
    expect(errors.resources?.[0]).toMatch(/needs a URL or an uploaded file/);
  });

  it("does not require a URL for an uploaded supabase file", () => {
    const errors = validateDraft(
      draftWith({
        name: "X",
        resources: [
          {
            key: "r",
            resourceType: "supabase_file",
            name: "Spec.pdf",
            description: "",
            url: "",
            tags: "",
            nodeKey: null,
            fileId: "file-1",
            upload: null,
          },
        ],
      })
    );
    expect(errors.resources).toBeUndefined();
  });

  it("accepts a file uploaded during this wizard run as an attachment", () => {
    const errors = validateDraft(
      draftWith({
        name: "X",
        resources: [
          {
            key: "r",
            resourceType: "supabase_file",
            name: "Spec.pdf",
            description: "",
            url: "",
            tags: "",
            nodeKey: null,
            fileId: null,
            upload: {
              path: "user-1/1_spec.pdf",
              name: "spec.pdf",
              mimeType: "application/pdf",
              sizeBytes: 2048,
            },
          },
        ],
      })
    );

    // No `files` row exists yet — the upload itself is what satisfies the rule.
    expect(errors.resources).toBeUndefined();
  });

  it("still flags a link resource with neither URL nor upload", () => {
    const errors = validateDraft(
      draftWith({
        name: "X",
        resources: [
          {
            key: "r",
            resourceType: "link",
            name: "Docs",
            description: "",
            url: "   ",
            tags: "",
            nodeKey: null,
            fileId: null,
            upload: null,
          },
        ],
      })
    );
    expect(errors.resources?.[0]).toMatch(/needs a URL or an uploaded file/);
  });
});

describe("canAdvance", () => {
  it("blocks step 1 while the name is missing", () => {
    const draft = createEmptyDraft();
    expect(canAdvance("basic", draft, validateDraft(draft))).toBe(false);
  });

  it("lets the user past step 1 once the name exists", () => {
    const draft = draftWith({ name: "Ownspece" });
    expect(canAdvance("basic", draft, validateDraft(draft))).toBe(true);
  });

  it("never blocks an optional step, even with its own errors", () => {
    const draft = draftWith({ name: "X", tasks: [{ ...emptyTask(), title: "" }] });
    const errors = validateDraft(draft);
    expect(errors.tasks?.length).toBeGreaterThan(0);
    expect(canAdvance("tasks", draft, errors)).toBe(true);
  });
});

describe("summarizeFinance", () => {
  it("totals income, expense and balance", () => {
    const draft = draftWith({
      budget: "1000",
      transactions: [
        transaction({ type: "income", amount: "5000" }),
        transaction({ type: "expense", amount: "250.5" }),
        transaction({ type: "expense", amount: "249.5" }),
      ],
    });

    const summary = summarizeFinance(draft);
    expect(summary.totalIncome).toBe(5000);
    expect(summary.totalExpense).toBe(500);
    expect(summary.balance).toBe(4500);
    expect(summary.budget).toBe(1000);
    expect(summary.remainingBudget).toBe(500);
  });

  it("reports no budget when none was set", () => {
    const summary = summarizeFinance(draftWith({ budget: "" }));
    expect(summary.budget).toBeNull();
    expect(summary.remainingBudget).toBeNull();
  });

  it("ignores unparseable amounts instead of producing NaN", () => {
    const summary = summarizeFinance(
      draftWith({ transactions: [transaction({ amount: "abc" })] })
    );
    expect(Number.isNaN(summary.totalExpense)).toBe(false);
    expect(summary.totalExpense).toBe(0);
  });
});

describe("summarizeDraft", () => {
  it("reports every count the review step shows", () => {
    const draft = draftWith({
      name: "Ownspece",
      startDate: "2024-06-01",
      dueDate: "2024-06-29",
      tags: "a, b",
      details: { objective: "Ship it" },
      nodes: [
        node({ key: "p1", nodeType: "phase" }),
        node({ key: "c1", nodeType: "chapter", parentKey: "p1" }),
      ],
      tasks: [
        { ...emptyTask(), key: "t1", title: "A", status: "done" },
        { ...emptyTask(), key: "t2", title: "B" },
      ],
      checklists: [
        checklist({
          key: "c",
          items: Array.from({ length: 20 }, (_, i) => ({
            key: `i${i}`,
            content: "x",
            description: "",
            dueDate: "",
            priority: "none" as const,
            isCompleted: i < 12,
            parentKey: null,
          })),
        }),
      ],
      reminders: [{ ...emptyReminder(), key: "r1" }],
      dailyNotes: [{ ...emptyDailyNote(), key: "d1" }],
      calendarEvents: [{ ...emptyEvent(), key: "e1" }],
      milestones: [{ key: "m", title: "M", description: "", dueDate: "", status: "not_started", nodeKey: null }],
      resources: [{ key: "r", resourceType: "link", name: "R", description: "", url: "https://x", tags: "", nodeKey: null, fileId: null, upload: null }],
    });

    const summary = summarizeDraft(draft, TODAY);

    expect(summary.countdown.totalDays).toBe(28);
    expect(summary.structure.total).toBe(2);
    expect(summary.structure.phase).toBe(1);
    expect(summary.structure.chapter).toBe(1);
    expect(summary.checklistItems).toBe(20);
    expect(summary.checklistProgress).toBe(60);
    expect(summary.initialProgress).toBe(60);
    expect(summary.taskCount).toBe(2);
    expect(summary.completedTaskCount).toBe(1);
    expect(summary.reminderCount).toBe(1);
    expect(summary.dailyNoteCount).toBe(1);
    expect(summary.calendarEventCount).toBe(1);
    expect(summary.milestoneCount).toBe(1);
    expect(summary.resourceCount).toBe(1);
    expect(summary.tagCount).toBe(2);
    expect(summary.detailFieldCount).toBe(1);
  });

  it("falls back to task completion when there are no checklist items", () => {
    const draft = draftWith({
      name: "X",
      tasks: [
        { ...emptyTask(), key: "a", status: "done" },
        { ...emptyTask(), key: "b", status: "done" },
        { ...emptyTask(), key: "c", status: "todo" },
        { ...emptyTask(), key: "d", status: "todo" },
      ],
    });

    expect(summarizeDraft(draft).initialProgress).toBe(50);
  });

  it("is 0 for a brand new project with nothing ticked", () => {
    expect(summarizeDraft(draftWith({ name: "X" })).initialProgress).toBe(0);
  });
});

describe("countErrors", () => {
  it("sums every step's messages", () => {
    const errors = {
      basic: ["a", "b"],
      tasks: ["c"],
      finance: [],
    };
    expect(countErrors(errors)).toBe(3);
  });

  it("is 0 for no errors", () => {
    expect(countErrors({})).toBe(0);
  });
});

describe("createEmptyDraft", () => {
  it("starts on step 1 at the current draft version", () => {
    const draft = createEmptyDraft();
    expect(draft.step).toBe("basic" satisfies WizardStepId);
    expect(draft.version).toBe(DRAFT_VERSION);
  });

  it("defaults to enabled features and a populated options block", () => {
    const draft = createEmptyDraft();
    expect(draft.options.historyEnabled).toBe(true);
    expect(draft.options.dailyNotesEnabled).toBe(true);
    expect(draft.options.versionHistoryEnabled).toBe(false);
  });

  it("starts with empty collections rather than undefined", () => {
    const draft = createEmptyDraft();
    expect(draft.nodes).toEqual([]);
    expect(draft.tasks).toEqual([]);
    expect(draft.checklists).toEqual([]);
    expect(draft.reminders).toEqual([]);
    expect(draft.resources).toEqual([]);
  });
});

// --- helpers ---------------------------------------------------------------

function emptyTask(): ProjectDraft["tasks"][number] {
  return {
    key: "t",
    nodeKey: null,
    parentKey: null,
    title: "Task",
    description: "",
    priority: "medium",
    status: "todo",
    startDate: "",
    dueDate: "",
    tags: "",
    estimatedMinutes: "",
  };
}

function emptyReminder(): ProjectDraft["reminders"][number] {
  return {
    key: "r",
    title: "Reminder",
    description: "",
    nodeKey: null,
    taskKey: null,
    checklistKey: null,
    remindAt: "2024-06-15T10:00",
    repeat: "none",
    repeatInterval: "",
    repeatUntil: "",
    channels: ["in_app"],
    priority: "none",
    snoozeMinutes: "",
    sound: "",
    isEnabled: true,
    advanceMinutes: "",
  };
}

function emptyDailyNote(): ProjectDraft["dailyNotes"][number] {
  return {
    key: "d",
    noteDate: TODAY,
    title: "",
    content: "",
    todaysWork: "",
    completedWork: "",
    problems: "",
    ideas: "",
    nextSteps: "",
  };
}

function emptyEvent(): ProjectDraft["calendarEvents"][number] {
  return {
    key: "e",
    title: "Event",
    nodeKey: null,
    startsAt: "2024-06-15T10:00",
    endsAt: "",
    allDay: false,
    location: "",
  };
}

function transaction(
  overrides: Partial<ProjectDraft["transactions"][number]>
): ProjectDraft["transactions"][number] {
  return {
    key: "t",
    type: "expense",
    amount: "100",
    categoryName: "",
    transactionDate: TODAY,
    occurredAt: "",
    description: "",
    paymentMethod: "card",
    reference: "",
    nodeKey: null,
    ...overrides,
  };
}