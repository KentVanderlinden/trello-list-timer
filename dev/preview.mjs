// Screenshots the Power-Up pages with a fake Trello (dev/mock-trello.js).
// Usage: node dev/preview.mjs [outDir]   (needs Playwright + Chromium)
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// require() so a globally installed Playwright is found too.
const { chromium } = createRequire(import.meta.url)('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(root, 'dev', 'shots'));
fs.mkdirSync(out, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

// Real API key format so the "missing key" banner doesn't show in previews.
const configSrc = fs.readFileSync(path.join(root, 'js/config.js'), 'utf8')
  .replace(/API_KEY = '[^']*'/, "API_KEY = '0123456789abcdef0123456789abcdef'");

const browser = await chromium.launch();
const shots = [
  ['settings', '/settings.html', 304],
  ['settings-schedule', '/settings.html?mode=schedule', 304],
  ['settings-unauth', '/settings.html?state=unauth', 304],
  ['card', '/card-section.html', 560],
  ['card-schedule', '/card-section.html?mode=schedule', 560],
  ['card-unauth', '/card-section.html?state=unauth', 560],
  ['card-empty', '/card-section.html?state=empty', 560],
  ['card-narrow', '/card-section.html', 320],
];
const errors = [];
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 560, height: 900 } });
  await ctx.route('https://p.trellocdn.com/power-up.min.js', (r) => r.fulfill({ path: path.join(root, 'dev/mock-trello.js'), contentType: 'text/javascript' }));
  await ctx.route('**/js/config.js', (r) => r.fulfill({ body: configSrc, contentType: 'text/javascript' }));
  for (const [name, url, width] of shots) {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + url);
    await page.waitForTimeout(400);
    const bg = scheme === 'dark' ? (name.startsWith('card') ? '#22272b' : '#282e33') : '#ffffff';
    await page.evaluate((c) => { document.body.style.background = c; document.body.style.padding = '12px'; }, bg);
    const h = await page.evaluate(() => document.getElementById('root').getBoundingClientRect().height + 24);
    await page.setViewportSize({ width, height: Math.ceil(h) });
    await page.screenshot({ path: path.join(out, `${name}-${scheme}.png`) });
    await page.close();
  }
  // Connector: evaluate the badges the way Trello would.
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`connector: ${e.message}`));
  await page.goto(base + '/index.html');
  await page.waitForFunction(() => window.__caps);
  const badges = await page.evaluate(async () => {
    const t = window.__t;
    const front = await window.__caps['card-badges'](t);
    const resolved = await Promise.all(front.map((b) => b.dynamic()));
    const detail = await window.__caps['card-detail-badges'](t);
    const detailResolved = await Promise.all(detail.map((b) => b.dynamic()));
    return { front: resolved, detail: detailResolved };
  });
  if (scheme === 'light') console.log(JSON.stringify(badges, null, 1));
  await ctx.close();
}
await browser.close();
server.close();
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');
console.log(`screenshots in ${out}`);
