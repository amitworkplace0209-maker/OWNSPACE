/**
 * Fills the throwaway audit account with enough data to exercise the pages that
 * an empty account never reaches.
 *
 * This exists because "no console errors on an empty dashboard" is a much weaker
 * statement than it sounds. Empty states are the easy case: no chart to size, no
 * list to group, no date to format, no division by zero. Every console error this
 * audit has found so far has been in code that only runs once there is something
 * to render — which is also most of the code.
 *
 * The data is deliberately awkward, not tidy: a transaction with no category, a
 * project with no tasks, a reminder that already fired, amounts that round to
 * zero. Tidy fixtures hide the edge cases; these surface them.
 *
 * Everything is written as the audit user, so removing the account removes all of
 * it — the finance rows cascade from `auth.users`, and nothing else is left over.
 *
 *   node scripts/audit-seed.cjs
 */
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const AUDIT_EMAIL = "ownspece-console-audit@invalid.local";

function readEnv() {
  const env = {};
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2].replace(/^"(.*)"$/, "$1");
  }
  return env;
}

/** A stable pseudo-random generator, so a re-run produces the same fixtures. */
function makeRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const random = makeRandom(20261013);
const pick = (list) => list[Math.floor(random() * list.length)];

const EMAIL = process.env.OWNSPACE_AUDIT_EMAIL ?? "ownspece-console-audit@invalid.local";

/**
 * Removes anything a previous run managed to insert before it failed.
 *
 * Not optional. The seed inserts into eight tables in sequence, and the first
 * constraint it meets that disagrees with an assumption stops it halfway — so
 * without this, a re-run would double the tags and then fail again on a
 * different duplicate, and the fixture would quietly grow with every attempt.
 */
async function clearExisting(supabase, userId) {
  for (const table of [
    "finance_transactions",
    "finance_accounts",
    "finance_categories",
    "reminders",
    "tasks",
    "notes",
    "resources",
    "projects",
    "tags",
  ]) {
    // `resources` is absent on some deployments; a missing table is not a reason
    // to abandon a re-seed, so it is skipped rather than thrown on.
    const { error } = await supabase.from(table).delete().eq("user_id", userId);
    if (error && !/does not exist|schema cache/i.test(error.message)) {
      throw new Error(`${table}: ${error.message}`);
    }
  }
}

function daysAgo(n) {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

function isoDaysFromNow(n, hour = 9) {
  const date = new Date(Date.now() + n * 86_400_000);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

(async () => {
  const env = readEnv();
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: users, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;

  const user = users.users.find((candidate) => candidate.email === AUDIT_EMAIL);
  if (!user) {
    console.error(`No ${AUDIT_EMAIL}. Run: node scripts/audit-account.cjs create`);
    process.exit(1);
  }

  const userId = user.id;
  const supabase = admin;

  await clearExisting(supabase, userId);
  console.log("cleared any previous fixtures");

  // --- Tags ---------------------------------------------------------------
  const tagRows = ["Deep work", "Admin", "Health", "Learning", "Urgent"].map((name, index) => ({
    user_id: userId,
    name,
    color: ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6"][index],
  }));
  const { data: tags, error: tagError } = await supabase
    .from("tags")
    .insert(tagRows)
    .select("id");
  if (tagError) throw tagError;
  console.log(`tags: ${tags.length}`);

  // --- Finance categories -------------------------------------------------
  // Kinds are set explicitly so the category board, the report and the charts all
  // take their non-default branches: accounts (opening balances), investments
  // (cumulative values), liabilities (credit), and plain income/expense.
  const categoryRows = [
    { name: "Salary", type: "income", kind: "income", color: "#10b981", is_system: true, is_pinned: true },
    { name: "Freelance", type: "income", kind: "income", color: "#059669", is_system: false, is_pinned: true },
    { name: "HDFC Savings", type: "account", kind: "cash_bank", color: "#3b82f6", is_system: false, is_pinned: true },
    { name: "Cash", type: "account", kind: "cash_bank", color: "#84cc16", is_system: false, is_pinned: true },
    { name: "Rent", type: "expense", kind: "household", color: "#ef4444", is_system: true, is_pinned: true },
    { name: "Groceries", type: "expense", kind: "expense", color: "#f59e0b", is_system: false, is_pinned: true },
    { name: "Transport", type: "expense", kind: "expense", color: "#06b6d4", is_system: false, is_pinned: true },
    { name: "Mutual Funds", type: "expense", kind: "investment", color: "#8b5cf6", is_system: false, is_pinned: true },
    { name: "Credit Card", type: "account", kind: "liability", color: "#dc2626", is_system: false, is_pinned: false },
    { name: "Subscriptions", type: "expense", kind: "expense", color: "#64748b", is_system: false, is_pinned: false },
  ].map((row) => ({ ...row, user_id: userId }));

  const { data: categories, error: categoryError } = await supabase
    .from("finance_categories")
    .insert(categoryRows)
    .select("id,name,kind");
  if (categoryError) throw categoryError;
  console.log(`categories: ${categories.length}`);

  const byName = Object.fromEntries(categories.map((c) => [c.name, c.id]));

  // --- Accounts, with opening balances ------------------------------------
  await supabase.from("finance_accounts").insert([
    {
      user_id: userId,
      category_id: byName["HDFC Savings"],
      opening_balance: 45000,
      opening_month: daysAgo(120).slice(0, 7),
      currency: "INR",
      notes: "Primary account",
    },
    {
      user_id: userId,
      category_id: byName["Cash"],
      opening_balance: 1500,
      opening_month: daysAgo(120).slice(0, 7),
      currency: "INR",
    },
    {
      user_id: userId,
      category_id: byName["Credit Card"],
      // A liability with a negative opening balance — the sign convention the
      // report has to get right, and the case a tidy fixture would skip.
      opening_balance: -8200,
      opening_month: daysAgo(120).slice(0, 7),
      currency: "INR",
      notes: "Card balance carried from last year",
    },
  ]);

  // --- Projects -----------------------------------------------------------
  // Statuses and icons are taken from the table's own CHECK constraint and the
  // icon catalogue rather than from memory: a value the database rejects stops the
  // seed halfway and leaves a fixture that is half-populated and quietly wrong.
  const projectRows = [
    { name: "Ownspece rebuild", status: "active", priority: "high", progress: 62, icon: "Target" },
    { name: "Q4 tax filing", status: "active", priority: "urgent", progress: 0, icon: "Briefcase" },
    { name: "Reading list", status: "active", priority: "low", progress: 30, icon: "BookOpen" },
    // A finished project, one on hold, and one with no dates — between them they
    // cover the shapes of "empty" a progress bar and a date chip have to handle.
    { name: "Old migration", status: "completed", priority: "medium", progress: 100, icon: "CheckCircle" },
    { name: "Paused idea", status: "on_hold", priority: "none", progress: 0, icon: "Home" },
    { name: "Undated idea", status: "active", priority: "low", progress: 0, icon: "Home" },
  ].map((row) => ({
    user_id: userId,
    ...row,
    description: `${row.name} — seeded by the console audit.`,
    start_date: row.name === "Undated idea" ? null : daysAgo(40),
    due_date: row.name === "Undated idea" ? null : daysAgo(-20),
  }));

  const { data: projects, error: projectError } = await supabase
    .from("projects")
    .insert(projectRows)
    .select("id,name");
  if (projectError) throw projectError;
  console.log(`projects: ${projects.length}`);

  // --- Tasks --------------------------------------------------------------
  const projectByName = Object.fromEntries(projects.map((p) => [p.name, p.id]));
  const taskRows = [];
  for (const [index, project] of projects.entries()) {
    for (let n = 0; n < 3; n += 1) {
      taskRows.push({
        user_id: userId,
        project_id: project.id,
        title: `${project.name} — step ${n + 1}`,
        description: n === 0 ? null : "Seeded fixture.",
        status: ["todo", "in_progress", "done", "backlog", "cancelled"][(index + n) % 5],
        priority: ["low", "medium", "high", "urgent", "none"][(index + n) % 5],
        progress: n === 2 ? 100 : 0,
        // One task with no due date at all.
        due_date: n === 0 && index === 4 ? null : daysAgo(n * 3 - 1),
        estimated_minutes: n === 0 ? null : 30,
      });
    }
  }
  const { data: tasks, error: taskError } = await supabase
    .from("tasks")
    .insert(taskRows)
    .select("id");
  if (taskError) throw taskError;
  console.log(`tasks: ${tasks.length}`);

  // --- Notes --------------------------------------------------------------
  // `sort_order`, `is_pinned` and `is_favorited` are NOT NULL with no database
  // default, so an insert that omits them fails outright — and a failed insert
  // that is not checked is how a seed script reports rows it never wrote.
  const { error: noteError, data: noteRows } = await supabase
    .from("notes")
    .insert([
      {
        user_id: userId,
        title: "Welcome",
        content: "# Welcome\n\nSeeded note.",
        is_pinned: true,
        is_favorited: true,
        sort_order: 0,
      },
      {
        user_id: userId,
        title: "Empty note",
        content: "",
        is_pinned: false,
        is_favorited: false,
        sort_order: 1,
      },
      {
        user_id: userId,
        project_id: projectByName["Ownspece rebuild"],
        title: "Architecture",
        content: "# Architecture\n\n- finance-logic.ts holds the arithmetic\n- charts read from it",
        is_pinned: false,
        is_favorited: false,
        sort_order: 2,
      },
    ])
    .select("id");
  if (noteError) throw noteError;
  console.log(`notes: ${noteRows.length}`);

  // --- Reminders ----------------------------------------------------------
  // NOT NULL with no default: `priority`, `repeat_rule`, `notification_channels`,
  // `repeat_days`, `advance_minutes`, `is_enabled`. All set explicitly rather
  // than left to the database, because "it worked last time" is not a reason to
  // keep omitting them.
  const reminderBase = {
    user_id: userId,
    priority: "none",
    repeat_rule: "none",
    notification_channels: ["in_app", "push"],
    repeat_days: [],
    advance_minutes: 0,
    is_enabled: true,
  };

  const { error: reminderError, data: reminderRows } = await supabase
    .from("reminders")
    .insert([
      // Already fired, so the "overdue" styling and the sweep both have work.
      { ...reminderBase, title: "Already fired", remind_at: isoDaysFromNow(-1, 10), status: "triggered" },
      { ...reminderBase, title: "In two minutes", remind_at: isoDaysFromNow(0, new Date().getHours()), status: "pending" },
      { ...reminderBase, title: "Snoozed one", remind_at: isoDaysFromNow(-1, 11), status: "snoozed" },
      { ...reminderBase, title: "Dismissed one", remind_at: isoDaysFromNow(-2, 9), status: "dismissed" },
      { ...reminderBase, title: "Tomorrow", remind_at: isoDaysFromNow(1, 9), status: "pending" },
      {
        ...reminderBase,
        title: "Weekly",
        remind_at: isoDaysFromNow(2, 8),
        status: "pending",
        repeat_rule: "weekly",
        repeat_interval: 1,
      },
      {
        ...reminderBase,
        title: "Weekdays only",
        remind_at: isoDaysFromNow(3, 8),
        status: "pending",
        repeat_rule: "custom",
        repeat_interval: 1,
        repeat_days: [1, 2, 3, 4, 5],
      },
    ])
    .select("id");
  if (reminderError) throw reminderError;
  console.log(`reminders: ${reminderRows.length}`);

  // --- Finance transactions ------------------------------------------------
  // Five months of history so the yearly chart, the carry-forward balance and
  // the month-vs-month trend all have something to plot.
  const transactions = [];
  const incomeSources = ["Salary", "Freelance"];
  const expenseSources = ["Rent", "Groceries", "Transport", "Mutual Funds", "Subscriptions"];

  for (let monthsBack = 4; monthsBack >= 0; monthsBack -= 1) {
    const base = new Date();
    base.setMonth(base.getMonth() - monthsBack, 1);

    for (const source of incomeSources) {
      // A month with no income at all, so the chart's zero-gap path runs.
      if (source === "Freelance" && monthsBack === 2) continue;
      transactions.push({
        user_id: userId,
        category_id: byName[source],
        type: "income",
        // A round number, a fractional number, and a very small one: all three
        // break naive formatting or rounding somewhere in the report.
        amount: source === "Salary" ? 85000 : monthsBack === 0 ? 12450.75 : 9000 + Math.round(random() * 4000),
        description: `${source} — ${base.toISOString().slice(0, 7)}`,
        transaction_date: new Date(base.getFullYear(), base.getMonth(), 2).toISOString().slice(0, 10),
        source: "manual",
      });
    }

    for (const source of expenseSources) {
      const count = source === "Groceries" ? 4 : source === "Transport" ? 5 : 1;
      for (let n = 0; n < count; n += 1) {
        transactions.push({
          user_id: userId,
          category_id: byName[source],
          type: "expense",
          amount:
            source === "Rent"
              ? 18000
              : source === "Mutual Funds"
                ? 5000
                : source === "Subscriptions"
                  ? // A value small enough to round to zero at rupee precision in
                    // a per-day average, and a fractional one, because the two
                    // break naive rounding and naive division respectively.
                    0.5
                  : Math.round(200 + random() * 3000),
          description: source === "Groceries" ? `Groceries ${n + 1}` : source,
          transaction_date: new Date(
            base.getFullYear(),
            base.getMonth(),
            3 + n * 5
          )
            .toISOString()
            .slice(0, 10),
          source: "manual",
        });
      }
    }
  }

  // One with no category at all — the report must not crash or silently vanish.
  transactions.push({
    user_id: userId,
    category_id: null,
    type: "expense",
    amount: 999,
    description: "Uncategorised",
    transaction_date: daysAgo(15),
    source: "manual",
  });

  const { error: transactionError } = await supabase.from("finance_transactions").insert(transactions);
  if (transactionError) throw transactionError;
  console.log(`transactions: ${transactions.length}`);

  console.log("\nSeeded. Run: node scripts/console-audit.cjs");
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});