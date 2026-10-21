/**
 * Drives the "New transaction" form in a real browser and reports what happens.
 *
 * Written to answer one question — does adding a transaction work? — without
 * guessing at the cause from the code. Records every console message, every
 * failed request, and the text of any error the form shows, because the action
 * returns its error as a string rather than throwing.
 */
const puppeteer = require("puppeteer-core");
const fs = require("fs");

const BASE = process.env.OWNSPACE_BASE_URL ?? "http://localhost:3000";
const creds = JSON.parse(fs.readFileSync(".audit-credentials.json", "utf8"));

function findChrome() {
  for (const path of [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  ]) {
    if (fs.existsSync(path)) return path;
  }
  throw new Error("no chrome");
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    userDataDir: require("path").join(require("os").tmpdir(), "ownspece-console-audit"),
    args: ["--no-first-run", "--no-default-browser-check", "--disable-gpu"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });

  page.on("console", (m) => {
    const t = m.type();
    if (t === "error" || t === "warning") console.log(`  [console.${t}] ${m.text().slice(0, 400)}`);
  });
  page.on("pageerror", (e) => console.log(`  [pageerror] ${e.message.slice(0, 400)}`));
  page.on("requestfailed", (r) => console.log(`  [requestfailed] ${r.url().slice(0, 120)}`));

  page.on("response", async (response) => {
    const req = response.request();
    if (req.method() !== "POST") return;
    if (response.status() >= 400) {
      console.log(`  [http ${response.status()}] POST ${response.url().slice(0, 100)}`);
    }
  });

  // --- sign in -------------------------------------------------------------
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  if (page.url().includes("/login")) {
    // The form opens in MPIN mode; the audit account has no PIN, so switch to the
    // password form the way a real user with no PIN would have to.
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((e) =>
        e.textContent?.includes("Use my password instead")
      );
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    await page.type("#email", creds.email);
    await page.type("#password", creds.password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2" }),
      page.click('button[type="submit"]'),
    ]);
  }

  await page.goto(`${BASE}/finance?view=workspace`, { waitUntil: "networkidle2" });
  await wait(1200);

  // Dismiss the one-time MPIN setup if present.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((e) => e.textContent?.includes("Skip for now"));
    b?.click();
  });
  await wait(1000);

  // --- find the add button -------------------------------------------------
  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll("button")].map((b) => ({
      text: (b.textContent ?? "").trim().slice(0, 40),
      type: b.type,
    }))
  );
  console.log("buttons on /finance:");
  for (const b of buttons) if (b.text) console.log(`  "${b.text}" (${b.type})`);

  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((e) =>
      /add transaction/i.test(e.textContent ?? "")
    );
    if (!b) return null;
    b.click();
    return (b.textContent ?? "").trim();
  });

  console.log(`\nclicked: ${opened ?? "NOT FOUND"}`);
  await wait(1200);

  // Poll rather than assume: the click can land before hydration, in which case
  // React has not attached the handler yet and nothing happens.
  let appeared = false;
  for (let attempt = 0; attempt < 10 && !appeared; attempt += 1) {
    appeared = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"]')));
    if (!appeared) {
      if (attempt === 3) {
        // Second click, in case the first one was swallowed.
        await page.evaluate(() => {
          const b = [...document.querySelectorAll("button")].find((e) =>
            /add transaction/i.test(e.textContent ?? "")
          );
          b?.click();
        });
      }
      await wait(700);
    }
  }

  const dialogOpen = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return null;
    return {
      title: dialog.querySelector("h2, [data-slot='dialog-title']")?.textContent?.trim() ?? "",
      fields: [...dialog.querySelectorAll("input, select, textarea")].map((f) => ({
        name: f.getAttribute("name"),
        type: f.getAttribute("type"),
        required: f.hasAttribute("required"),
        tag: f.tagName.toLowerCase(),
      })),
      buttons: [...dialog.querySelectorAll("button")].map((b) => (b.textContent ?? "").trim()),
    };
  });

  console.log("\ndialog:", JSON.stringify(dialogOpen, null, 2));

  if (!dialogOpen) {
    console.log("\nNO DIALOG OPENED — cannot proceed.");
    await browser.close();
    return;
  }

  // --- fill and submit -----------------------------------------------------
  console.log("\nfilling the form…");
  const filled = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const set = (name, value) => {
      const field = dialog.querySelector(`[name="${name}"]`);
      if (!field) return `missing ${name}`;
      // Each element type has its own native setter; borrowing the input one for a
      // textarea throws "Illegal invocation".
      const proto =
        field.tagName === "SELECT"
          ? HTMLSelectElement.prototype
          : field.tagName === "TEXTAREA"
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
      return null;
    };

    const problems = [];
    for (const [name, value] of [
      ["amount", "1234.56"],
      ["description", "Audit test transaction"],
      ["transaction_date", new Date().toISOString().slice(0, 10)],
      ["reference", "INV-AUDIT-1"],
      ["tags", "audit, test"],
      ["notes", "Created by the transaction audit."],
    ]) {
      const problem = set(name, value);
      if (problem) problems.push(problem);
    }

    // Pick the first real category so the category branch is exercised too.
    const category = dialog.querySelector('[name="category_id"]');
    if (category && category.options.length > 1) {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(
        category,
        category.options[1].value
      );
      category.dispatchEvent(new Event("change", { bubbles: true }));
    }

    return problems;
  });

  if (filled.length) console.log("  field problems:", filled);

  await wait(400);

  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const submit = dialog.querySelector('button[type="submit"]');
    submit.click();
  });

  console.log("\nsubmitted, waiting…");
  await wait(5000);

  const after = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    return {
      dialogStillOpen: Boolean(dialog),
      dialogError: dialog
        ? (dialog.querySelector('[role="alert"], .text-destructive, [data-slot="form-message"]')?.textContent ?? "").trim()
        : "",
      pageText: (document.body.innerText ?? "").replace(/\s+/g, " ").slice(0, 600),
    };
  });

  console.log("\nafter submit:");
  console.log(`  dialog open: ${after.dialogStillOpen}`);
  if (after.dialogError) console.log(`  form error: "${after.dialogError}"`);
  console.log(`  page text: ${after.pageText}`);

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
