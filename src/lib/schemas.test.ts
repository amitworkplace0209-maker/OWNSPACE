import { describe, expect, it } from "vitest";
import {
  parseForm,
  calendarEventSchema,
  planningEntrySchema,
  projectSchema,
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