const { Client } = require("pg");
const fs = require("fs");

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}

(async () => {
  const c = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const u = await c.query(
    "select id from auth.users where email = 'ownspece-console-audit@invalid.local'"
  );
  const id = u.rows[0]?.id;
  if (!id) {
    console.log("no audit user");
    await c.end();
    return;
  }

  const rows = await c.query(
    `select amount, description, transaction_date, reference, tags, notes, category_id is not null as has_category
     from finance_transactions where user_id=$1 order by created_at desc limit 3`,
    [id]
  );
  console.log("latest transactions:");
  console.table(rows.rows);

  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
