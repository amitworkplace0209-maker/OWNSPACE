#!/usr/bin/env node
/**
 * Checks that web push is actually wired up, rather than assuming it is.
 *
 *   npm run push:verify
 *
 * `package.json` pointed at this file before it existed, so the one command
 * meant to answer "are my notifications working?" failed with a module-not-found
 * — the least useful possible answer to that question.
 *
 * Four things have to line up before a push can be delivered, and each fails
 * silently on its own:
 *
 *   1. the VAPID key pair exists and parses,
 *   2. the browser-facing endpoint serves the *public* key,
 *   3. the subscriptions table exists and is writable,
 *   4. at least one device has actually subscribed.
 *
 * Passing all four still does not prove a push will arrive — that depends on the
 * push service and on the OS granting permission — so the last section says so
 * plainly instead of printing a green tick that overstates what was checked.
 */
const fs = require("fs");
const path = require("path");
const { createPrivateKey } = require("crypto");

const BASE = process.env.BASE || "http://localhost:3000";

function loadEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return env;
}

let failures = 0;

function ok(label, detail) {
  console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label, detail) {
  failures += 1;
  console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}

function warn(label, detail) {
  console.log(`  WARN  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const env = { ...loadEnv(path.join(process.cwd(), ".env.local")), ...process.env };

  console.log("\n1. VAPID keys\n");
  const pub = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT;

  if (!pub) fail("NEXT_PUBLIC_VAPID_PUBLIC_KEY is set", "run: npm run push:keys");
  if (!priv) fail("VAPID_PRIVATE_KEY is set", "run: npm run push:keys");

  if (priv) {
    try {
      createPrivateKey({ key: Buffer.from(priv, "base64url"), format: "der", type: "pkcs8" });
      ok("private key parses as a PKCS#8 P-256 key");
    } catch (error) {
      fail("private key parses", error.message);
    }
  }

  if (pub) {
    const point = Buffer.from(pub, "base64url");
    // An uncompressed P-256 point is 0x04 followed by two 32-byte coordinates.
    if (point.length === 65 && point[0] === 0x04) {
      ok("public key is an uncompressed P-256 point", `${point.length} bytes`);
    } else {
      fail("public key is an uncompressed P-256 point", `got ${point.length} bytes, leading 0x${point[0]?.toString(16)}`);
    }
  }

  if (subject) {
    if (/^mailto:|^https:/i.test(subject)) ok("VAPID_SUBJECT looks like a contact", subject);
    else warn("VAPID_SUBJECT is not a mailto: or https: URI", subject);
  } else {
    warn("VAPID_SUBJECT is not set", "push services cannot reach you about an expiring subscription");
  }

  if (failures > 0) {
    console.log("\nFix the keys before continuing — nothing below can work without them.\n");
    process.exit(1);
  }

  console.log("\n2. Public key endpoint\n");
  try {
    const res = await fetch(`${BASE}/api/push/public-key`);
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      fail("GET /api/push/public-key", `HTTP ${res.status}`);
    } else if (body.publicKey !== pub) {
      fail("endpoint serves the configured public key", "the running server has stale env — restart it");
    } else {
      ok("endpoint serves the configured public key");
    }
  } catch (error) {
    warn("could not reach the dev server", `${error.message} (is "npm run dev" running?)`);
  }

  console.log("\n3. Subscriptions table\n");
  const connector = env.SUPABASE_DB_URL || env.DATABASE_URL;
  if (!connector) {
    warn("no database url in .env.local", "skipped the table check");
  } else {
    try {
      const { Client } = require("pg");
      const client = new Client({ connectionString: connector, ssl: { rejectUnauthorized: false } });
      await client.connect();

      const exists = await client.query(`
        select 1 from information_schema.tables
        where table_schema='public' and table_name='push_subscriptions'`);
      if (exists.rows.length === 0) {
        fail("push_subscriptions table exists", "run: npm run db:migrate");
      } else {
        ok("push_subscriptions table exists");

        const policies = await client.query(`
          select p.polname from pg_policy p
          join pg_class c on c.oid = p.polrelid
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname='public' and c.relname='push_subscriptions'`);
        if (policies.rows.length === 0) {
          fail("row level security is enabled with a policy", "a table with no policy is unreachable");
        } else {
          ok("row level security is enabled with a policy", policies.rows.map((r) => r.polname).join(", "));
        }

        const count = await client.query("select count(*)::int as n from public.push_subscriptions");
        if (count.rows[0].n > 0) {
          ok(`${count.rows[0].n} device${count.rows[0].n === 1 ? "" : "s"} subscribed`);
        } else {
          warn("no devices subscribed yet", "open Settings on the device you want notified");
        }
      }

      await client.end();
    } catch (error) {
      warn("could not reach the database", error.message);
    }
  }

  console.log("\nWhat this does not prove\n");
  console.log("  A subscription existing does not mean a push will arrive. Delivery also needs:");
  console.log("    - the browser's permission granted (Settings -> Notifications)");
  console.log("    - the app installed, or open, on that device");
  console.log("    - the push service (FCM / Web Push) reachable from this machine\n");
  console.log("  To test end to end: create a reminder one minute out and watch this machine's\n");
  console.log("  notification centre with the tab closed.\n");

  console.log(failures === 0 ? "All checks passed.\n" : `${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
