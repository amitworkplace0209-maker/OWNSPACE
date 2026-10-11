const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function loadEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return env;
}

/**
 * Columns the project wizard writes to, added by migrations 012, 015 and 017.
 *
 * This is the exact list `wizardSchemaProblem()` probes at runtime. Keeping the
 * two in step is what makes `npm run db:verify` a useful preflight instead of a
 * curiosity — the wizard's most common failure is simply "these migrations have
 * not been run".
 */
const WIZARD_COLUMNS = {
  projects: [
    "title", "category", "project_type", "is_favorite", "is_pinned",
    "timezone", "currency", "budget", "card_style", "banner_path",
    "logo_path", "details", "options",
  ],
  project_nodes: ["notes", "parent_id", "node_type", "sort_order"],
  tasks: ["node_id", "start_date", "estimated_minutes", "parent_task_id"],
  checklists: ["node_id", "task_id", "parent_checklist_id", "due_date", "priority", "sort_order"],
  checklist_items: ["parent_item_id", "due_date", "priority", "description", "is_completed"],
  reminders: [
    "node_id", "checklist_id", "note_id", "description", "priority",
    "repeat_rule", "repeat_interval", "repeat_until",
    "notification_channels", "snooze_minutes", "sound", "is_enabled",
    "advance_minutes",
  ],
  daily_notes: ["title", "todays_work", "completed_work", "problems", "ideas", "next_steps"],
  calendar_events: ["node_id"],
  finance_transactions: ["occurred_at", "reference", "file_id", "node_id"],
  project_resources: ["node_id", "storage_path", "tags"],
  project_history: ["entity_type", "entity_id", "action", "old_value", "new_value"],
};

async function main() {
  const env = { ...loadEnv(path.join(process.cwd(), ".env.local")), ...process.env };
  const connector = env.SUPABASE_DB_URL || env.DATABASE_URL;

  if (!connector) {
    console.error("No SUPABASE_DB_URL or DATABASE_URL found in .env.local or the environment.");
    process.exit(1);
  }

  const client = new Client({ connectionString: connector, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    // --- 1. user_preferences detail (existing behaviour) -------------------
    const cols = await client.query(
      `select column_name, data_type, column_default
       from information_schema.columns
       where table_schema = 'public' and table_name = 'user_preferences'
       order by ordinal_position`
    );
    console.table(cols.rows);

    const rls = await client.query(
      `select c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'user_preferences'`
    );
    console.log("RLS state:", rls.rows[0]);

    const policies = await client.query(
      `select polname as policy, pg_get_expr(polqual, polrelid) as using_expr
       from pg_policy p
       join pg_class c on c.oid = p.polrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'user_preferences'`
    );
    console.table(policies.rows);

    // --- 2. Project wizard schema preflight --------------------------------
    console.log("\n=== Project wizard schema ===");

    const { rows: existing } = await client.query(
      `select table_name, column_name
       from information_schema.columns
       where table_schema = 'public'
         and table_name = any($1)`,
      [Object.keys(WIZARD_COLUMNS)]
    );

    const have = new Set(existing.map((r) => `${r.table_name}.${r.column_name}`));
    const missing = [];

    for (const [table, columns] of Object.entries(WIZARD_COLUMNS)) {
      for (const column of columns) {
        if (!have.has(`${table}.${column}`)) missing.push(`${table}.${column}`);
      }
    }

    const missingTables = Object.keys(WIZARD_COLUMNS).filter(
      (table) => !existing.some((r) => r.table_name === table)
    );

    if (missingTables.length === 0 && missing.length === 0) {
      console.log("OK — every wizard column is present.");
    } else {
      if (missingTables.length > 0) {
        console.error(`Missing tables: ${missingTables.join(", ")}`);
      }
      if (missing.length > 0) {
        console.error(`Missing columns (${missing.length}):`);
        console.error("  " + missing.join("\n  "));
      }
      console.error("\nThe project wizard cannot save until these exist.");
      console.error("Run:  npm run db:migrate");
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});