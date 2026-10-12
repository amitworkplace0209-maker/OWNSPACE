/**
 * Spot-check that the audit is not fooling itself.
 *
 * A sweep that visits twenty routes and finds nothing is only meaningful if the
 * pages actually rendered. This asserts that specific, data-dependent text made it
 * into the DOM on the pages where the finance work lives — the ones most likely to
 * silently render an empty shell without logging an error.
 */
const puppeteer = require("puppeteer-core");
const fs = require("fs");

const BASE = process.env.OWNSPACE_BASE_URL ?? "http://localhost:3000";

function findChrome() {
  for (const path of [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  ]) {
    if (fs.existsSync(path)) return path;
  }
  return null;
}

/**
 * What each page must contain for the audit to mean anything.
 *
 * Only text that is genuinely on screen counts. "Credit Card" is deliberately
 * absent from the report check: the report opens with the two cards the user has
 * chosen (trend and spending), and an account-category card is not among them —
 * its absence from the visible text is the picker working, not a rendering fault.
 */
const EXPECTATIONS = [
  { route: "/finance", needles: ["Salary", "Groceries"] },
  { route: "/finance/report", needles: ["Income vs expenses", "Where the money went"] },
  { route: "/finance/categories", needles: ["HDFC Savings"] },
  { route: "/tasks", needles: ["Ownspece rebuild"] },
  { route: "/projects", needles: ["Ownspece rebuild"] },
  { route: "/reminders", needles: ["Weekly", "Tomorrow"] },
  { route: "/notifications", needles: [] },
  { route: "/timeline", needles: ["Ownspece rebuild"] },
  { route: "/analytics", needles: [] },
  { route: "/notes", needles: ["Welcome"] },
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    userDataDir: require("path").join(require("os").tmpdir(), "ownspece-console-audit"),
    args: ["--no-first-run", "--no-default-browser-check", "--disable-gpu"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });

  if (page.url().includes("/login")) {
    const creds = JSON.parse(fs.readFileSync(".audit-credentials.json", "utf8"));
    await page.type("#email", creds.email);
    await page.type("#password", creds.password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2" }),
      page.click('button[type="submit"]'),
    ]);
  }

  let failures = 0;

  for (const { route, needles } of EXPECTATIONS) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 1500));

    // Dismiss the one-time MPIN setup if it is up.
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((element) =>
        element.textContent?.includes("Skip for now")
      );
      button?.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));

    // The sidebar alone is ~120 characters, so anything near that means the page
    // body rendered nothing at all.
    const missing = needles.filter((needle) => !text.includes(needle));
    const tooShort = text.length < 250;

    if (missing.length === 0 && !tooShort) {
      console.log(`ok    ${route}  (${text.length} chars)`);
    } else {
      failures += 1;
      console.log(`FAIL  ${route}  (${text.length} chars)`);
      if (tooShort) console.log("      page body is essentially empty");
      for (const needle of missing) console.log(`      missing: "${needle}"`);
      console.log(`      FULL TEXT: ${text}`);
    }
  }

  console.log(failures === 0 ? "\nAll pages rendered their content." : `\n${failures} page(s) did not.`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});