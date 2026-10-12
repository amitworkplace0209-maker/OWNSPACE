/**
 * Console-error sweep.
 *
 * Walks a list of routes in a real browser and records everything that goes to
 * the console, plus uncaught exceptions and failed network requests. Written as a
 * standalone script rather than a test because what it is checking is the *app*,
 * not a function — and because a browser has to be involved, which vitest does
 * not provide.
 *
 * Credentials come from the environment so they never end up in the repo:
 *     OWNSPACE_EMAIL=…  OWNSPACE_PASSWORD=…  node scripts/console-audit.cjs
 * With no credentials it still audits everything reachable signed-out, which
 * covers the auth screens and the redirect behaviour.
 *
 * Usage:
 *   node scripts/console-audit.cjs                 # default route list
 *   node scripts/console-audit.cjs /a /b /c        # explicit routes
 *   OWNSPACE_HEADFUL=1 node scripts/console-audit.cjs
 */
const puppeteer = require("puppeteer-core");

const BASE = process.env.OWNSPACE_BASE_URL ?? "http://localhost:3000";

/**
 * Credentials, from the environment or from the file `audit-account.cjs create`
 * writes. Reading them from a file rather than a command-line argument keeps the
 * password out of the shell history, and the file is gitignored.
 */
function readCredentials() {
  if (process.env.OWNSPACE_EMAIL) {
    return { email: process.env.OWNSPACE_EMAIL, password: process.env.OWNSPACE_PASSWORD };
  }
  try {
    const fs = require("fs");
    if (!fs.existsSync(".audit-credentials.json")) return null;
    return JSON.parse(fs.readFileSync(".audit-credentials.json", "utf8"));
  } catch {
    return null;
  }
}

const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

function findChrome() {
  for (const path of CHROME_PATHS) {
    try {
      if (require("fs").existsSync(path)) return path;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

/**
 * The signed-in routes.
 *
 * Deliberately the top-level pages a person actually visits. Project and task
 * detail pages need an id that does not exist until something is created, and a
 * 404 for a missing id is a correct response, not a bug to chase.
 */
const DEFAULT_ROUTES = [
  "/dashboard",
  "/projects",
  "/tasks",
  "/calendar",
  "/reminders",
  "/notifications",
  "/notes",
  "/daily",
  "/finance",
  "/finance/report",
  "/finance/categories",
  "/gdrive",
  "/storage",
  "/tags",
  "/timeline",
  "/analytics",
  "/activity",
  "/time",
  "/lab",
  "/archive",
  "/settings",
  "/resources",
  "/wiki",
];

const SIGNED_OUT_ROUTES = ["/login", "/signup", "/forgot-password", "/"];

/** Console messages that are noise rather than defects. */
const IGNORED = [
  // Next's dev overlay chatter and the favicon 404 on first run.
  /Download the React DevTools/i,
  /favicon/i,
  // The browser logs this for every `preload` hint it cannot act on.
  /preload/i,
  // Dev-only: Turbopack's HMR socket announcing itself on every page load, plus
  // the Fast Refresh rebuild log from compiling a route on first request.
  // Neither happens in a production build, and both would otherwise appear on all
  // twenty-odd routes and bury the findings.
  /^\[HMR\]/i,
  /^\[Fast Refresh\]/i,

  // Next's own dev-server compression middleware creates a Gzip per request
  // (`next/dist/server/lib/router-server.js`) and accumulates drain listeners on
  // it, so this fires after roughly ten requests and then on most pages. It is
  // emitted by the server process and reaches the browser only because the dev
  // overlay forwards server logs — no application code is involved, and it does
  // not happen in a production build. Next ships `releaseCompressionStream` to
  // manage the same streams.
  //
  // Filtered rather than silenced in the app on purpose: raising `maxListeners`
  // to hide it would also hide a genuine listener leak, and turning `compress`
  // off would ship the app uncompressed. Neither is worth a quiet console.
  /MaxListenersExceededWarning/,
];

function shouldIgnore(text) {
  return IGNORED.some((pattern) => pattern.test(text));
}

(async () => {
  const executablePath = findChrome();
  if (!executablePath) {
    console.error("No Chrome found. Set CHROME_PATH to a Chrome or Edge binary.");
    process.exit(1);
  }

  const routes = process.argv.slice(2);
  const credentials = readCredentials();
  const signedOutRoutes = !credentials?.email || !credentials?.password;

  const browser = await puppeteer.launch({
    executablePath,
    headless: process.env.OWNSPACE_HEADFUL !== "1",
    // An isolated profile: never touch the browser the user is actually using,
    // and never inherit their logged-in cookies as a shortcut.
    userDataDir: require("path").join(require("os").tmpdir(), "ownspece-console-audit"),
    args: ["--no-first-run", "--no-default-browser-check", "--disable-gpu"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  /** Everything collected for the route currently being loaded. */
  let current = null;

  function record(bucket, entry) {
    if (!current || shouldIgnore(entry.text)) return;
    current.entries.push({ bucket, ...entry });
  }

  page.on("console", (message) => {
    const type = message.type();
    // "info" and "debug" are not problems. "log" is included because a library
    // logging a warning through console.log would otherwise slip past.
    if (type !== "error" && type !== "warning" && type !== "log") return;
    record(type, { text: message.text(), location: describe(message.location()) });
  });

  page.on("pageerror", (error) => {
    record("pageerror", { text: error.message, location: `${error.name}` });
  });

  page.on("requestfailed", (request) => {
    const failure = request.failure();
    // A navigation the test itself aborted shows up here and is not a defect.
    if (failure && /net::ERR_ABORTED/.test(failure.errorText)) return;
    record("requestfailed", {
      text: `${request.failure()?.errorText ?? "failed"} ${request.method()} ${request.url()}`,
      location: request.resourceType(),
    });
  });

  page.on("response", (response) => {
    if (response.status() < 400) return;
    const url = response.url();
    // Document responses are checked separately; a 500 on a route is worth
    // recording, but so is a 404 for an icon the page asked for optimistically.
    record("http", { text: `${response.status()} ${url}`, location: response.request().resourceType() });
  });

  function describe(location) {
    if (!location || !location.url) return "";
    const file = location.url.split("/").pop() || location.url;
    return location.lineNumber ? `${file}:${location.lineNumber}` : file;
  }

  /**
 * Dismisses the one-time MPIN setup if it is standing in the way.
 *
 * A new account has never chosen a PIN, and the setup screen deliberately does
 * not render the app behind it — which means a sweep run against a fresh account
 * reports every route as "clean" while having executed none of them. That is the
 * worst failure mode an audit can have, so this is checked on *every* navigation
 * rather than once after sign-in: each `goto` is a full load, and the setup
 * requirement is re-read from the server every time.
 */
async function dismissBlockingScreen() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const skipped = await page
      .evaluate(() => {
        const field = document.querySelector("#setup-mpin");
        if (!field) return false;
        const button = [...document.querySelectorAll("button")].find((element) =>
          element.textContent?.includes("Skip for now")
        );
        if (!button) return false;
        button.click();
        return true;
      })
      .catch(() => false);

    if (!skipped) return true;
    // The app unmounting and re-rendering behind the dismissal needs a beat.
    await new Promise((resolve) => setTimeout(resolve, 900));
  }
  return false;
}

async function visit(route) {
    current = { route, entries: [] };
    try {
      const response = await page.goto(`${BASE}${route}`, {
        waitUntil: "networkidle2",
        timeout: 45_000,
      });
      current.status = response ? response.status() : null;
      // Give hydration and any effect-driven console output a moment to land.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await dismissBlockingScreen();
    } catch (error) {
      current.entries.push({
        bucket: "navigation",
        text: `${error.name}: ${error.message}`,
        location: "",
      });
    }

    // A page that renders nothing useful produces no console output either, so a
    // silent sweep can report "clean" over a wall of lock screens. Asking what is
    // actually on screen turns that from a guess into a fact.
    const shape = await page
      .evaluate(() => {
        const text = (document.body.innerText ?? "").replace(/\s+/g, " ").trim();
        return {
          isLockScreen: document.querySelector("#setup-mpin") !== null,
          isLogin: Boolean(document.querySelector("#password")),
          chars: text.length,
          heading: document.querySelector("h1")?.textContent?.trim() ?? "",
          snippet: text.slice(0, 90),
        };
      })
      .catch(() => null);

    if (shape?.isLockScreen) {
      current.entries.push({
        bucket: "blocked",
        text: "the MPIN setup screen is covering this page, so nothing behind it ran",
        location: "",
      });
    } else if (shape?.isLogin) {
      current.entries.push({
        bucket: "blocked",
        text: "redirected to the sign-in page — not signed in",
        location: "",
      });
    } else if (shape && shape.chars < 40) {
      current.entries.push({
        bucket: "blocked",
        text: `page rendered almost nothing (${shape.chars} chars)`,
        location: "",
      });
    }

    const entries = current.entries;
    if (entries.length === 0) {
      console.log(`  ok    ${route}  — "${shape?.snippet ?? ""}"`);
    } else {
      console.log(`  ${entries.length} issue(s)  ${route}`);
      for (const entry of entries) {
        console.log(`        [${entry.bucket}] ${entry.text}`);
        if (entry.location) console.log(`                 at ${entry.location}`);
      }
    }
    return entries.length;
  }

  if (signedOutRoutes) {
    console.log("No OWNSPACE_EMAIL / OWNSPACE_PASSWORD set — auditing signed-out routes only.\n");
    console.log("Signed out:");
    for (const route of SIGNED_OUT_ROUTES) await visit(route);
  } else {
    console.log(`Signing in as ${credentials.email}…\n`);
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });

    // The profile is reused between runs, so a session cookie from the last one
    // can still be valid — in which case /login has already bounced to the
    // dashboard and there is nothing to type into. Forcing a sign-out first
    // would also make the run deterministic, which matters because a signed-in
    // and a signed-out page render different trees and can error differently.
    if (page.url().includes("/login")) {
      await page.type("#email", credentials.email);
      await page.type("#password", credentials.password);
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2", timeout: 45_000 }),
        page.click('button[type="submit"]'),
      ]);

      if (page.url().includes("/login")) {
        console.error("Still on /login after submitting — credentials rejected.");
        await browser.close();
        process.exit(1);
      }
      console.log("(signed in)");
    } else {
      console.log("(already had a session)");
    }

    // The one-time MPIN setup screen stands in front of every route, so a sweep
    // run without dismissing it would report the same blank page thirty times.
    // `visit` re-checks on every navigation too, since each one is a fresh load.
    await dismissBlockingScreen();

    console.log(`Signed in as ${credentials.email}\n`);
    let total = 0;

    for (const route of routes.length > 0 ? routes : DEFAULT_ROUTES) {
      total += await visit(route);
    }

    // Detail pages, taken from whatever actually exists. A sweep of top-level
    // routes misses the places where a single record's shape breaks rendering —
    // and those are exactly the pages that error only for some users, because
    // only some of their records have the awkward value in them.
    const detailRoutes = await collectDetailRoutes(credentials.email);
    if (detailRoutes.length > 0) {
      console.log(`\nDetail pages (${detailRoutes.length} discovered):`);
      for (const route of detailRoutes) total += await visit(route);
    }

    console.log(
      `\n${total} issue(s) across ${routes.length || DEFAULT_ROUTES.length} + ${detailRoutes.length} routes.`
    );
  }

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * Finds real detail-page URLs by reading the database, not by scraping links.
 *
 * Scraping was tried first and found nothing: the list rows navigate with a
 * router push rather than an anchor, so there are no hrefs to read. Hard-coding
 * an id is worse — ids differ per database, so a made-up one 404s and the sweep
 * reports a problem that is really a missing fixture.
 *
 * Reading the ids straight from the database guarantees every page visited
 * belongs to a record that exists, and covers a record of each kind rather than
 * the first one, so a field only some rows carry still gets exercised.
 */
async function collectDetailRoutes(email) {
  let supabase;
  try {
    const env = {};
    for (const line of require("fs").readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (match) env[match[1]] = match[2].replace(/^"(.*)"$/, "$1");
    }
    const { createClient } = require("@supabase/supabase-js");
    supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  } catch {
    return [];
  }

  const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const user = users?.users.find((candidate) => candidate.email === email);
  if (!user) return [];

  const routes = new Set();

  const [projects, tasks, notes] = await Promise.all([
    supabase.from("projects").select("id").eq("user_id", user.id).limit(3),
    supabase.from("tasks").select("id, project_id").eq("user_id", user.id).limit(3),
    supabase.from("notes").select("id").eq("user_id", user.id).limit(2),
  ]);

  for (const project of projects.data ?? []) {
    routes.add(`/projects/${project.id}`);
    // The tabbed sub-pages are where a project's own components live, and they
    // each query differently.
    for (const tab of ["tasks", "notes", "activity", "checklist", "files", "finance", "settings"]) {
      routes.add(`/projects/${project.id}/${tab}`);
    }
  }
  for (const task of tasks.data ?? []) routes.add(`/tasks/${task.id}`);
  for (const note of notes.data ?? []) routes.add(`/notes/${note.id}`);

  // A category page needs a finance category id, which is the newest part of the
  // app and the one with the least coverage anywhere else.
  const { data: categories } = await supabase
    .from("finance_categories")
    .select("id")
    .eq("user_id", user.id)
    .limit(2);
  for (const category of categories ?? []) routes.add(`/finance/category/${category.id}`);

  return [...routes];
}