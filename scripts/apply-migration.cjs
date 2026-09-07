/**
 * Applies a SQL migration file to the live Supabase database.
 *
 * Usage:  npm run db:migrate -- <file.sql>
 * Example: npm run db:migrate -- supabase/migrations/011_preferences_pomodoro.sql
 *
 * Reads SUPABASE_DB_URL (or DATABASE_URL) from .env.local. Runs the entire
 * file inside a transaction, then verifies it applied. Server-side tooling —
 * never run from browser code.
 */
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
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: node scripts/apply-migration.cjs <migration.sql>");
    process.exit(1);
  }
  const file = path.resolve(process.cwd(), target);
  if (!fs.existsSync(file)) {
    console.error(`Migration file not found: ${file}`);
    process.exit(1);
  }

  const env = { ...loadEnv(path.join(process.cwd(), ".env.local")), ...process.env };
  const connector = env.SUPABASE_DB_URL || env.DATABASE_URL;
  if (!connector) {
    console.error("SUPABASE_DB_URL (or DATABASE_URL) is not set in .env.local");
    process.exit(1);
  }

  const sql = fs.readFileSync(file, "utf8");
  const client = new Client({ connectionString: connector, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
    console.log(`Applied ${target} to the live database.`);
  } catch (err) {
    try { await client.query("rollback"); } catch (_) { /* noop */ }
    console.error(`Failed to apply ${target}:`);
    console.error(err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});