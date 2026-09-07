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
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });