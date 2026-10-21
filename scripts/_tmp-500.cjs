const puppeteer = require("puppeteer-core");
const fs = require("fs");

const BASE = "http://localhost:3000";

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

(async () => {
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    userDataDir: require("path").join(require("os").tmpdir(), "ownspece-console-audit"),
    args: ["--no-first-run", "--no-default-browser-check"],
  });

  const page = await browser.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`[console.error] ${m.text().slice(0, 300)}`);
  });

  console.log("cookies before:", (await page.cookies()).map((c) => c.name).join(", "));

  const response = await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  console.log("status:", response.status());
  console.log("url:", page.url());

  const body = await page.evaluate(() => document.body.innerText);
  console.log("--- body ---");
  console.log(body.slice(0, 2000));

  // The error overlay carries the real message; the plain body often just says
  // "Application error".
  const html = await page.content();
  const match = html.match(/<title>([^<]*)<\/title>/);
  console.log("--- title ---", match?.[1]);

  await browser.close();
})();
