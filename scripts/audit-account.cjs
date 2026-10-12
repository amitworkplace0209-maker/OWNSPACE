/**
 * Creates (and removes) a throwaway account for the console audit.
 *
 * Written as a script rather than done by hand so the account can be deleted by
 * the same code that made it, and so the credentials never have to be typed into
 * a shell that keeps them in its history.
 *
 *   node scripts/audit-account.cjs create
 *   node scripts/console-audit.cjs          # reads the credentials back
 *   node scripts/audit-account.cjs remove
 *
 * Uses the service-role key, which bypasses RLS — that is why the email is
 * deliberately something no real address can be, and why the account is removed
 * in the same session rather than left behind.
 */
const fs = require("fs");

const email = process.env.OWNSPACE_AUDIT_EMAIL ?? "ownspece-console-audit@invalid.local";
const password = process.env.OWNSPACE_AUDIT_PASSWORD ?? "Audit-" + Math.random().toString(36).slice(2, 10) + "-9x";

function readEnv() {
  const env = {};
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2].replace(/^"(.*)"$/, "$1");
  }
  return env;
}

(async () => {
  const env = readEnv();
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const url = env.NEXT_PUBLIC_SUPABASE_URL;

  if (!key || !url) {
    console.error("SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing.");
    process.exit(1);
  }

  const { createClient } = require("@supabase/supabase-js");
  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const command = process.argv[2];

  if (command === "create") {
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: "Console Audit" },
    });

    if (error) {
      // A leftover account from an earlier run is not a failure; take it over
      // rather than making the user guess which command to run.
      if (/already been registered|already exists/i.test(error.message)) {
        const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
        const existing = data.users.find((user) => user.email === email);
        if (existing) {
          await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
        }
        console.log(`reused ${email}`);
      } else {
        console.error(error.message);
        process.exit(1);
      }
    } else {
      console.log(`created ${email}`);
    }

    // Written to a gitignored file so console-audit.cjs can read it back without
    // the password being passed on a command line, where it would sit in the
    // shell history.
    fs.writeFileSync(".audit-credentials.json", JSON.stringify({ email, password }, null, 2));
    console.log("credentials written to .audit-credentials.json (gitignored)");
    return;
  }

  if (command === "remove") {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) {
      console.error(error.message);
      process.exit(1);
    }

    const found = data.users.find((user) => user.email === email);
    if (!found) {
      console.log(`${email} does not exist — nothing to remove.`);
    } else {
      const { error: deleteError } = await admin.auth.admin.deleteUser(found.id);
      if (deleteError) {
        console.error(deleteError.message);
        process.exit(1);
      }
      console.log(`removed ${email}`);
    }

    if (fs.existsSync(".audit-credentials.json")) {
      fs.rmSync(".audit-credentials.json");
      console.log("credentials file removed");
    }
    return;
  }

  console.error("Usage: node scripts/audit-account.cjs create|remove");
  process.exit(1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});