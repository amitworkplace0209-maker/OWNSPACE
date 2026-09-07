const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
function loadEnv(f) {
  const e = {};
  if (!fs.existsSync(f)) return e;
  for (const l of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = l.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) e[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return e;
}
(async () => {
  const env = { ...loadEnv(path.join(process.cwd(), ".env.local")), ...process.env };
  const c = new Client({ connectionString: env.SUPABASE_DB_URL || env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const r = await c.query(
      `select p.id, p.username, p.display_name, p.created_at, u.email, u.created_at as auth_created
       from public.profiles p join auth.users u on u.id = p.id`
    );
    console.log(JSON.stringify(r.rows, null, 2));
  } finally {
    await c.end();
  }
})().catch((e) => { console.error(e); process.exit(1); });
