import { describe, expect, it } from "vitest";
import {
  parseForm,
  calendarEventSchema,
  financeRecurringSchema,
  planningEntrySchema,
  projectSchema,
  reminderSchema,
  taskSchema,
  tagSchema,
} from "./schemas";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

describe("taskSchema", () => {
  it("accepts a valid task and normalizes empty dates to null", () => {
    const data = {
      title: "Ship the landing page",
      description: "Details",
      status: "todo",
      priority: "high",
      due_date: "",
      reminder_at: "",
      project_id: PROJECT_ID,
      phase_id: "",
    };
    const result = parseForm(taskSchema, form(data));
    expect(result.error).toBeUndefined();
    expect(result.data).toMatchObject({
      title: "Ship the landing page",
      due_date: null,
      reminder_at: null,
      phase_id: null,
      project_id: PROJECT_ID,
      progress: 0,
    });
  });

  it("keeps a valid datetime reminder", () => {
    const result = parseForm(
      taskSchema,
      form({
        title: "Remind me",
        description: "",
        status: "todo",
        priority: "none",
        due_date: "2026-09-10",
        reminder_at: "2026-09-09T08:00:00.000Z",
        project_id: PROJECT_ID,
      })
    );
    expect(result.error).toBeUndefined();
    expect(result.data?.reminder_at).toBe("2026-09-09T08:00:00.000Z");
    expect(result.data?.due_date).toBe("2026-09-10");
  });

  it("rejects a malformed reminder datetime", () => {
    const result = parseForm(
      taskSchema,
      form({
        title: "Remind me",
        description: "",
        status: "todo",
        priority: "none",
        reminder_at: "not-a-date",
        project_id: PROJECT_ID,
      })
    );
    expect(result.error).toContain("reminder at: Enter a valid date and time");
  });
});

describe("calendarEventSchema", () => {
  it("accepts an all-day event with no end time", () => {
    const result = parseForm(
      calendarEventSchema,
      form({
        title: "All day",
        description: "",
        event_type: "event",
        starts_at: "2026-09-07T00:00:00.000Z",
        ends_at: "",
        all_day: "true",
        project_id: "",
      })
    );
    expect(result.error).toBeUndefined();
    expect(result.data).toMatchObject({
      starts_at: "2026-09-07T00:00:00.000Z",
      ends_at: null,
      all_day: true,
      project_id: null,
    });
  });

  it("rejects an end time before the start time", () => {
    const result = parseForm(
      calendarEventSchema,
      form({
        title: "Backwards",
        description: "",
        event_type: "event",
        starts_at: "2026-09-07T10:00:00.000Z",
        ends_at: "2026-09-07T09:00:00.000Z",
        project_id: "",
      })
    );
    expect(result.error).toContain("End time must be after start time");
  });
});

describe("projectSchema", () => {
  it("rejects a due date before the start date", () => {
    const result = parseForm(
      projectSchema,
      form({
        name: "Build",
        description: "",
        status: "active",
        priority: "medium",
        start_date: "2026-09-10",
        due_date: "2026-09-01",
      })
    );
    expect(result.error).toContain("Due date must be on or after the start date");
  });
});

describe("planningEntrySchema", () => {
  it("rejects an end time before the start time", () => {
    const result = parseForm(
      planningEntrySchema,
      form({
        plan_date: "2026-09-07",
        project_id: PROJECT_ID,
        start_time: "14:00",
        end_time: "13:00",
        note: "",
      })
    );
    expect(result.error).toContain("End time must be after start time");
  });

  it("accepts open-ended entries and nulls empty times", () => {
    const result = parseForm(
      planningEntrySchema,
      form({ plan_date: "2026-09-07", project_id: PROJECT_ID, start_time: "", end_time: "", note: "" })
    );
    expect(result.error).toBeUndefined();
    expect(result.data).toMatchObject({ start_time: null, end_time: null, note: null });
  });
});

describe("tagSchema", () => {
  it("accepts a name and color", () => {
    const fd = form({ name: "Design", color: "#8b5cf6" });
    const result = parseForm(tagSchema, fd);
    expect(result.error).toBeUndefined();
    expect(result.data).toEqual({ name: "Design", color: "#8b5cf6" });
  });

  it("stores an empty color as null", () => {
    const result = parseForm(tagSchema, form({ name: "Plain", color: "" }));
    expect(result.data).toEqual({ name: "Plain", color: null });
  });
});
// ---------------------------------------------------------------------------
// Fields the browser never submits
// ---------------------------------------------------------------------------

/**
 * Builds form data the way a browser actually does: a conditionally rendered
 * input leaves no key behind at all, which is not the same as an empty value.
 */
function formWithout(omit: string[], entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (omit.includes(key)) continue;
    fd.set(key, value);
  }
  return fd;
}

const REMINDER_BASE = {
  title: "Pay the rent",
  remind_at: "2026-03-05T09:00:00.000Z",
  repeat_rule: "monthly",
  priority: "high",
  is_enabled: "on",
  advance_minutes: "0",
  snooze_minutes: "",
  notification_channels: "in_app",
};

describe("reminderSchema with a hidden repeat interval", () => {
  it("accepts a form that never rendered the interval box", () => {
    // "does not repeat" hides the input, so no key is submitted. The union used
    // to reject the missing value and report "repeat interval: Invalid input"
    // against a field the user could not see.
    const result = parseForm(
      reminderSchema,
      formWithout(["repeat_interval"], { ...REMINDER_BASE, repeat_rule: "none" })
    );
    expect(result.error).toBeUndefined();
    expect(result.data).toMatchObject({ repeat_rule: "none", repeat_interval: null });
  });

  it("accepts a custom-weekday repeat, which also hides the interval box", () => {
    const result = parseForm(
      reminderSchema,
      formWithout(["repeat_interval"], {
        ...REMINDER_BASE,
        repeat_rule: "custom",
        repeat_days: "1",
      })
    );
    expect(result.error).toBeUndefined();
    expect(result.data).toMatchObject({ repeat_rule: "custom", repeat_interval: null });
  });

  it("keeps every ticked weekday, not just the last one", () => {
    // Three inputs share the name `repeat_days`. `Object.fromEntries` used to
    // keep only the final one, so the array schema failed and `.catch([])`
    // reported "pick at least one day" to somebody who had just ticked three.
    const fd = formWithout(["repeat_interval"], {
      ...REMINDER_BASE,
      repeat_rule: "custom",
      repeat_days: "1",
    });
    fd.append("repeat_days", "3");
    fd.append("repeat_days", "5");

    const result = parseForm(reminderSchema, fd);
    expect(result.error).toBeUndefined();
    expect(result.data?.repeat_days).toEqual([1, 3, 5]);
  });

  it("still reads an interval that was submitted", () => {
    const result = parseForm(
      reminderSchema,
      form({ ...REMINDER_BASE, repeat_interval: "3" })
    );
    expect(result.error).toBeUndefined();
    expect(result.data?.repeat_interval).toBe(3);
  });

  it("treats a rendered-but-blank interval as no interval", () => {
    const result = parseForm(
      reminderSchema,
      form({ ...REMINDER_BASE, repeat_interval: "" })
    );
    expect(result.error).toBeUndefined();
    expect(result.data?.repeat_interval).toBeNull();
  });

  it("still rejects a zero interval that was actually typed", () => {
    // Absent is fine; a real zero is a mistake worth reporting.
    const result = parseForm(
      reminderSchema,
      form({ ...REMINDER_BASE, repeat_interval: "0" })
    );
    expect(result.error).toMatch(/repeat interval/i);
  });
});

describe("financeRecurringSchema with a hidden repeat interval", () => {
  const RECURRING_BASE = {
    name: "Salary",
    type: "income",
    amount: "50000",
    next_due_on: "2026-04-01",
    repeat_rule: "monthly",
    is_enabled: "on",
    remind_days_before: "3",
    category_id: "",
    project_id: "",
    payment_method: "",
    description: "",
    notes: "",
    repeat_until: "",
  };

  it("accepts a custom rule with no interval box rendered", () => {
    const result = parseForm(
      financeRecurringSchema,
      formWithout(["repeat_interval", "repeat_until"], {
        ...RECURRING_BASE,
        repeat_rule: "custom",
        repeat_days: "1",
      })
    );
    expect(result.error).toBeUndefined();
    expect(result.data?.repeat_rule).toBe("custom");
  });

  it("defaults the interval to 1 when the box was never rendered", () => {
    const fd = formWithout(["repeat_interval"], {
      ...RECURRING_BASE,
      repeat_rule: "custom",
    });
    fd.append("repeat_days", "2");
    fd.append("repeat_days", "4");

    const result = parseForm(financeRecurringSchema, fd);
    expect(result.error).toBeUndefined();
    expect(result.data?.repeat_interval).toBe(1);
    expect(result.data?.repeat_days).toEqual([2, 4]);
  });

  it("still reads an interval that was submitted", () => {
    const result = parseForm(
      financeRecurringSchema,
      form({ ...RECURRING_BASE, repeat_interval: "2" })
    );
    expect(result.error).toBeUndefined();
    expect(result.data?.repeat_interval).toBe(2);
  });
});
