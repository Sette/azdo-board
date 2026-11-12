// Regenerates docs/images/*.png and docs/images/drag.gif from demo mode (fictional data).
//   npm run screenshots              builds the web app, starts the demo API on :3101, captures, stops it
//   SCREENSHOTS_URL=http://... npm run screenshots   uses a demo server you started yourself
// Needs Chrome/Chromium: /usr/bin/google-chrome by default, or set CHROME_PATH.
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import gifenc from 'gifenc';
import pngjs from 'pngjs';
import { chromium } from 'playwright-core';
  const { GIFEncoder, applyPalette, quantize } = gifenc; const { PNG } = pngjs;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs/images');
const PORT = 3101;
const chrome = process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!chrome) throw new Error('Chrome not found: set CHROME_PATH');
fs.mkdirSync(out, { recursive: true });

let server;
let base = process.env.SCREENSHOTS_URL;
if (!base) {
  console.log('building web…');
  execSync('npm run build', { cwd: root, stdio: 'inherit' });
  server = spawn(process.execPath, ['server/src/demo.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), APP_LANG: 'en' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (d) => String(d).includes('[api]') && resolve());
    server.on('exit', (code) => reject(new Error(`demo server exited (${code})`)));
  });
  base = `http://127.0.0.1:${PORT}`;
}

const browser = await chromium.launch({ executablePath: chrome });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'en-US', colorScheme: 'light' });
const page = await context.newPage();
page.on('pageerror', (err) => console.error('[page error]', err.message));

const settle = () => page.waitForTimeout(400);
const NARROW = { width: 1440, height: 900 };
async function open(url, size = NARROW) {
  await page.setViewportSize(size);
  await page.goto(`${base}${url}`);
  await page.waitForLoadState('networkidle');
  await settle();
}
const see = async (text) => {
  await page.getByText(text).first().waitFor();
  await settle();
};
// Pages start with "Only my issues" on; screenshots look better with the whole team.
async function everyone(label = 'Only my issues') {
  await page.getByRole('button', { name: label }).click();
  await settle();
}
async function shot(name) {
  await page.screenshot({ path: path.join(out, name) });
  console.log(`✓ ${name}`);
}
const center = async (locator) => {
  const b = await locator.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + Math.min(b.height / 2, 40) };
};

try {
  // Wide enough for every column of the board.
  await open('/board?mode=items&group=none', { width: 1990, height: 760 });
  await everyone();
  await see('Search suggestions while typing');
  await shot('board.png');

  await open('/board?mode=tasks&group=parent', { width: 1720, height: 1000 });
  await everyone();
  await see('Suggestions endpoint');
  await shot('board-tasks.png');

  await open('/backlog');
  await everyone();
  await see('Gift cards');
  await shot('backlog.png');

  await open('/board?mode=items&group=none&item=201');
  await see('Great, I will pair');
  await shot('issue.png');

  await open('/board?mode=items&group=none');
  await page.getByRole('button', { name: '＋ Create' }).click();
  await page.locator('[data-create-modal]').waitFor();
  await page.locator('[data-create-modal] input').first().fill('Remember the last used payment method');
  await settle();
  await shot('create.png');
  await page.keyboard.press('Escape');

  // Drag GIF: a task from In Progress to the Validation column.
  await open('/board?mode=tasks&group=none', { width: 1720, height: 900 });
  await everyone();
  await see('Tokenize cards with the payment provider');
  await gif('drag.gif', page.getByText('Tokenize cards with the payment provider').first(), page.locator('[aria-label="Validation"]'));

  // Moving a task to Done asks for the hours (process rule) before saving.
  await drag(page.getByText('Email token service').first(), page.locator('[aria-label="Done"]'));
  await page.locator('[data-required-dialog]').waitFor();
  await settle();
  await shot('done-dialog.png');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await open('/blocked');
  await everyone();
  await see('Suggestions endpoint');
  await shot('blocked.png');

  await open('/validation');
  await everyone();
  await see('Show the delivery estimate');
  await shot('validation.png');

  await open('/issues');
  await see('Email token service');
  await shot('issues.png');

  await open('/board?mode=tasks&group=parent', { width: 1720, height: 1000 });
  await page.getByRole('button', { name: 'PT', exact: true }).click();
  await everyone('Só meus itens');
  await see('Suggestions endpoint');
  await shot('board-pt.png');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
} finally {
  await browser.close();
  server?.kill();
}

async function drag(from, to, onStep) {
  const a = await center(from);
  const b = await center(to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 10, a.y + 4, { steps: 2 }); // past the 6px activation distance
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    await page.mouse.move(a.x + (b.x - a.x) * ease, a.y + (b.y - a.y) * ease);
    if (onStep) await onStep();
  }
  await page.mouse.up();
}

async function gif(name, from, to) {
  const clip = { x: 240, y: 190, width: 1480, height: 600 };
  const scale = 0.6; // keep the file small
  const frames = [];
  const grab = async () => frames.push(await page.screenshot({ clip }));
  for (let i = 0; i < 4; i++) await grab();
  await drag(from, to, grab);
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(150);
    await grab();
  }
  const w = Math.round(clip.width * scale);
  const h = Math.round(clip.height * scale);
  const enc = GIFEncoder();
  frames.forEach((buf, i) => {
    const rgba = downscale(PNG.sync.read(buf), w, h);
    const palette = quantize(rgba, 256);
    const delay = i < 4 ? 250 : i >= frames.length - 6 ? (i === frames.length - 1 ? 1800 : 150) : 70;
    enc.writeFrame(applyPalette(rgba, palette), w, h, { palette, delay });
  });
  enc.finish();
  fs.writeFileSync(path.join(out, name), enc.bytes());
  console.log(`✓ ${name} (${frames.length} frames, ${Math.round(enc.bytes().length / 1024)} KB)`);
}

// Box-filter downscale of an RGBA PNG.
function downscale(png, w, h) {
  const out = new Uint8Array(w * h * 4);
  const sx = png.width / w;
  const sy = png.height / h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const acc = [0, 0, 0, 0];
      let n = 0;
      for (let yy = Math.floor(y * sy); yy < Math.min(png.height, Math.floor((y + 1) * sy)); yy++) {
        for (let xx = Math.floor(x * sx); xx < Math.min(png.width, Math.floor((x + 1) * sx)); xx++) {
          const i = (yy * png.width + xx) * 4;
          for (let c = 0; c < 4; c++) acc[c] += png.data[i + c];
          n++;
        }
      }
      for (let c = 0; c < 4; c++) out[(y * w + x) * 4 + c] = acc[c] / (n || 1);
    }
  }
  return out;
}
