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

async function main() {
  const env = { ...loadEnv(path.join(process.cwd(), ".env.local")), ...process.env };
  const connector = env.SUPABASE_DB_URL || env.DATABASE_URL;
  const client = new Client({ connectionString: connector, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const expTables = {
      profiles: "uuid", user_preferences: "uuid", tags: "uuid", projects: "uuid",
      project_tags: "uuid", project_phases: "uuid", milestones: "uuid", tasks: "uuid",
      task_dependencies: "uuid", task_tags: "uuid", task_comments: "uuid", checklists: "uuid",
      checklist_items: "uuid", notes: "uuid", note_versions: "uuid", note_tags: "uuid",
      daily_notes: "uuid", planning_entries: "uuid", wiki_pages: "uuid", wiki_versions: "uuid",
      wiki_tags: "uuid", calendar_events: "uuid", reminders: "uuid", notifications: "uuid",
      activities: "uuid", time_entries: "uuid", pomodoro_sessions: "uuid", files: "uuid",
    };

    console.log("\n=== TABLES + RLS + ROW COUNTS ===");
    const tables = await client.query(
      `select c.relname as table_name,
              c.relrowsecurity as rls,
              c.relforcerowsecurity as force_rls
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
       order by c.relname`
    );
    const present = {};
    for (const t of tables.rows) present[t.table_name] = t;
    const missing = Object.keys(expTables).filter((k) => !present[k]);
    console.log("MISSING TABLES:", missing.length ? missing.join(", ") : "none");

    for (const t of tables.rows) {
      let count = "(n/a)";
      if (t.table_name in expTables || t.table_name === "migrations") {
        const c = await client.query(`select count(*)::int as n from public.${t.table_name}`);
        count = c.rows[0].n;
      }
      console.log(`  ${t.table_name.padEnd(22)} RLS=${t.rls} force=${t.force_rls} rows=${count}`);
    }

    console.log("\n=== FOREIGN KEYS (public schema, our tables) ===");
    const fks = await client.query(
      `select tc.table_name, kcu.column_name, ccu.table_name as ref_table, rc.delete_rule
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
       join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name
       join information_schema.referential_constraints rc on tc.constraint_name = rc.constraint_name
       where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
       order by tc.table_name, kcu.column_name`
    );
    for (const f of fks.rows) console.log(`  ${f.table_name}.${f.column_name} -> ${f.ref_table} (${f.delete_rule})`);

    console.log("\n=== INDEXES ===");
    const idxs = await client.query(
      `select tablename, indexname
       from pg_indexes where schemaname = 'public'
       order by tablename, indexname`
    );
    for (const i of idxs.rows) console.log(`  ${i.tablename}.${i.indexname}`);

    console.log("\n=== TRIGGERS ===");
    const trigs = await client.query(
      `select event_object_table as tbl, trigger_name from information_schema.triggers
       where trigger_schema = 'public' order by event_object_table`
    );
    for (const t of trigs.rows) console.log(`  ${t.tbl}.${t.trigger_name}`);

    console.log("\n=== RLS-PROTECTED TABLES WITHOUT POLICIES ===");
    const noPol = await client.query(
      `select c.relname
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       left join pg_policy p on p.polrelid = c.oid
       where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = true
         and p.oid is null`
    );
    console.log(noPol.rows.length ? noPol.rows.map((r) => r.relname).join(", ") : "none");

    console.log("\n=== STORAGE POLICIES for ownspece-files ===");
    const sp = await client.query(
      `select p.polname,
              pg_get_expr(p.polqual, p.polrelid) as using_expr,
              pg_get_expr(p.polwithcheck, p.polrelid) as with_check,
              p.polpermissive as permissive,
              array(select unnest(polroles)::text) as roles,
              p.polcmd as cmd
       from pg_policy p
       join pg_class c on c.oid = p.polrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'storage' and c.relname = 'objects'
       order by p.polname`
    );
    for (const p of sp.rows) console.log(`  ${p.polname} cmd=${p.cmd} permissive=${p.permissive} roles=${p.roles.join(",")} using=${p.using_expr} check=${p.with_check}`);

    console.log("\n=== BUCKETS ===");
    const buckets = await client.query(`select id, name, public, file_size_limit from storage.buckets order by name`);
    for (const b of buckets.rows) console.log(`  ${b.name} public=${b.public} limit=${b.file_size_limit}`);

    console.log("\n=== MIGRATIONS APPLIED (from migrations table if exists) ===");
    const migExists = await client.query(
      `select to_regclass('public.migrations') as t`
    );
    if (migExists.rows[0].t) {
      const migs = await client.query(`select * from public.migrations order by version`);
      for (const m of migs.rows) console.log(`  v${m.version} ${m.name} applied=${m.applied_at}`);
    } else {
      console.log("  no migrations table present");
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
