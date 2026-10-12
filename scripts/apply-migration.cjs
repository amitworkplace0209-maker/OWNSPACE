/**
 * Applies pending SQL migrations to the live Supabase database.
 *
 * Usage:
 *   npm run db:migrate                       apply every pending migration, in order
 *   npm run db:migrate -- <file.sql>         apply one specific migration
 *   npm run db:migrate -- --status           list what is pending without applying
 *
 * Why this exists: the previous version only accepted a file path, so every
 * migration had to be run by hand. They were not — four tables and sixty-one
 * columns were missing in a real database, and the wizard failed with an error
 * that said nothing useful. Running the folder in order and reporting what was
 * skipped makes the failure mode impossible to hit again.
 *
 * "Already applied" is detected by probing for one distinctive object per
 * migration rather than trusting a bookkeeping table, because this database may
 * already have several migrations applied without any record of it.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

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
 * One probe per migration: a SQL statement that succeeds only if that migration
 * has already run. Keep these pointing at each file's most distinctive object so
 * a rename forces an update rather than silently re-running a migration.
 */
const PROBES = {
  "001_helpers.sql": `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname='public' and p.proname='set_updated_at'`,
  "002_core_user.sql": `select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                         where n.nspname='public' and c.relname='profiles'`,
  "003_project_hierarchy.sql": `select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                                 where n.nspname='public' and c.relname='project_tags'`,
  "004_notes_knowledge.sql": `select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                              where n.nspname='public' and c.relname='note_versions'`,
  "005_scheduling.sql": `select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                          where n.nspname='public' and c.relname='calendar_events'`,
  "006_time_activity_files.sql": `select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                                   where n.nspname='public' and c.relname='pomodoro_sessions'`,
  "007_triggers.sql": `select 1 from pg_trigger where tgname='set_updated_at' and not tgisinternal`,
  "008_rls.sql": `select 1 from pg_policy p join pg_class c on c.oid=p.polrelid
                  join pg_namespace n on n.oid=c.relnamespace
                  where n.nspname='public' and p.polname='projects_owner_all'`,
  "009_auth_profile_trigger.sql": `select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                    where n.nspname='public' and p.proname='handle_new_user'`,
  "010_files_cascade_bucket.sql": `select 1 from storage.buckets where id='ownspece-files'`,
  "011_preferences_pomodoro.sql": `select 1 from information_schema.columns
                                    where table_schema='public' and table_name='user_preferences'
                                      and column_name='focus_duration_minutes'`,
  "012_appearance_finance_gdrive.sql": `select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                                         where n.nspname='public' and c.relname='finance_categories'`,
  "013_amoled_theme.sql": `select 1 from pg_constraint where conname='user_preferences_theme_check'
                            and pg_get_constraintdef(oid) like '%amoled%'`,
  "014_realtime_publication.sql": `select 1 from pg_publication_tables
                                    where pubname='supabase_realtime' and tablename='tasks'`,
  "015_flexible_project_structure.sql": `select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                                          where n.nspname='public' and c.relname='project_nodes'`,
  "016_appearance_palettes.sql": `select 1 from pg_constraint where conname='user_preferences_accent_color_check'
                                   and pg_get_constraintdef(oid) like '%lime%'`,
  "017_project_wizard.sql": `select 1 from information_schema.columns
                              where table_schema='public' and table_name='projects'
                                and column_name='details'`,
  // Without a probe a migration re-runs on every `npm run db:migrate`, because
  // the safe default is "assume it has not run". That is harmless for an
  // entirely `if not exists` migration and fatal for one that drops a
  // constraint, so every file added here needs its own probe.
  "018_reminder_scheduling.sql": `select 1 from information_schema.columns
                                    where table_schema='public' and table_name='reminders'
                                      and column_name='snoozed_until'`,
  "019_gdrive_multi_account.sql": `select 1 from information_schema.columns
                                    where table_schema='public' and table_name='gdrive_connections'
                                      and column_name='account_email'`,
  "020_finance_advanced.sql": `select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                                where n.nspname='public' and c.relname='finance_budgets'`,
  "021_recurring_reminder_dedupe.sql": `select 1 from information_schema.columns
                                         where table_schema='public' and table_name='finance_recurring'
                                           and column_name='last_reminded_for'`,
"022_wizard_backend_fixes.sql": `select 1 from information_schema.columns
                                     where table_schema='public' and table_name='milestones'
                                       and column_name='node_id'`,
  // Probes for something the migration *creates*, never for something it
  // removes: `isApplied` returns true when rows come back, so probing the
  // dropped `files_scope` constraint would report the migration as already run
  // and skip it forever.
  "023_workspace_resources.sql": `select 1 from pg_constraint where conname='project_resources_needs_target'`,
  // A `create or replace function`, so re-running it is harmless — but without a
  // probe it was reported as pending on every single migrate, which trains
  // people to ignore the pending list.
  "023_storage_report.sql": `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                               where n.nspname='public' and p.proname='storage_report'`,
  "024_daily_journal_realtime.sql": `select 1 from pg_publication_tables
                                      where pubname='supabase_realtime'
                                        and tablename='planning_entries'`,
  // Probed on the table this migration creates, not on the columns it adds to
  // `finance_categories` — that table already existed from 012, so probing it
  // would report this migration as applied and skip it forever.
  "025_push_subscriptions.sql": `select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                                  where n.nspname='public' and c.relname='push_subscriptions'`,
  "026_finance_category_kinds.sql": `select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                                      where n.nspname='public' and c.relname='finance_accounts'`,
  "027_category_pins.sql": `select 1 from information_schema.columns
                              where table_schema='public' and table_name='finance_categories'
                                and column_name='is_pinned'`,
  // Probed on `webauthn_challenges`, the last table this migration creates.
  // Probing an earlier one would report the file as applied and skip the
  // challenge table on a database that already had the credentials table —
  // which is exactly what happened when this probe was first written against
  // `webauthn_credentials` and the challenge table was added afterwards.
  "028_security_mpin_biometric.sql": `select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                                      where n.nspname='public' and c.relname='webauthn_challenges'`,
};

async function isApplied(client, file) {
  const probe = PROBES[file];
  // No probe means we cannot prove it ran; applying is the safe default.
  if (!probe) return false;
  try {
    // A probe SELECT with no matching rows still succeeds — it just returns
    // nothing. So the check is "did a row come back", not "did it throw".
    const result = await client.query(probe);
    return Array.isArray(result.rows) && result.rows.length > 0;
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const statusOnly = args.includes("--status");

  const env = { ...loadEnv(path.join(process.cwd(), ".env.local")), ...process.env };
  const connector = env.SUPABASE_DB_URL || env.DATABASE_URL;
  if (!connector) {
    console.error("SUPABASE_DB_URL (or DATABASE_URL) is not set in .env.local");
    process.exit(1);
  }

  const client = new Client({ connectionString: connector, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const explicit = args.filter((a) => !a.startsWith("--"));
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const pending = [];
    for (const file of files) {
      if (explicit.length > 0 && !explicit.includes(file)) continue;
      if (await isApplied(client, file)) continue;
      pending.push(file);
    }

    if (pending.length === 0) {
      console.log("Database is up to date — nothing to apply.");
      return;
    }

    console.log(
      `${statusOnly ? "Pending" : "Applying"} ${pending.length} migration(s):\n  ${pending.join("\n  ")}\n`
    );

    if (statusOnly) return;

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      try {
        // Each file already contains its own begin/commit; running it as a
        // single query keeps it atomic exactly as the file intends.
        await client.query(sql);
        console.log(`  applied  ${file}`);
      } catch (err) {
        console.error(`\n  FAILED   ${file}`);
        console.error(`  ${err.message}`);
        console.error("\nStopped. Fix the failing migration and re-run; applied ones are skipped.");
        process.exit(1);
      }
    }

    console.log("\nDone. Run `npm run db:verify` to confirm.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});