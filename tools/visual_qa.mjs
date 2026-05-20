import { chromium, devices } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'qa-artifacts');
const port = Number(process.env.KWR_QA_PORT || 8123);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.gltf': 'model/gltf+json',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream'
};

const desktop = { width: 1920, height: 1080 };
const laptop = { width: 1366, height: 768 };

const WORLD_PRESETS = [
  { name: 'desktop-f1-lobby', viewport: desktop, view: { floor: 1, x: -18.4, z: -8.8, lookAt: [-15.5, -11.0], label: 'F1 Lobby' } },
  { name: 'desktop-f1-lift-front', viewport: desktop, view: { floor: 1, x: 0.0, z: 12.6, lookAt: [0.0, 16.4], label: 'F1 Lift Front' } },
  { name: 'desktop-f1-lift-inside', viewport: desktop, view: { floor: 1, x: 0.0, z: 16.35, lookAt: [1.9, 16.45], label: 'F1 Lift Interior Buttons' } },
  { name: 'desktop-f1-open-workspace', viewport: desktop, view: { floor: 1, x: 1.8, z: -7.8, lookAt: [5.2, -13.2], label: 'F1 Open Workspace' } },
  { name: 'desktop-f1-warroom-whiteboard', viewport: desktop, view: { floor: 1, x: 16.2, z: -9.8, lookAt: [21.4, -10.4], label: 'F1 War Room Whiteboard' } },
  { name: 'desktop-f1-data-lab', viewport: desktop, view: { floor: 1, x: -17.5, z: 5.8, lookAt: [-12.0, 5.8], label: 'F1 Data Lab' } },
  { name: 'desktop-f1-model-lab', viewport: desktop, view: { floor: 1, x: 0.4, z: 4.2, lookAt: [5.2, 8.5], label: 'F1 Model Lab' } },
  { name: 'desktop-f2-review', viewport: desktop, view: { floor: 2, x: -17.5, z: -8.8, lookAt: [-12.0, -10.5], label: 'F2 Review Room' } },
  { name: 'desktop-f2-command', viewport: desktop, view: { floor: 2, x: 1.5, z: -8.6, lookAt: [7.5, -14.5], label: 'F2 Command Room' } },
  { name: 'desktop-f3-lobby', viewport: desktop, view: { floor: 3, x: 0.0, z: 12.4, lookAt: [0.0, 17.2], label: 'F3 Recharge Lobby' } },
  { name: 'desktop-f3-arcade', viewport: desktop, view: { floor: 3, x: 0.6, z: -5.5, lookAt: [0.6, -10.2], label: 'F3 Arcade' } },
  { name: 'desktop-f3-coffee-bar', viewport: desktop, view: { floor: 3, x: -12.2, z: 11.4, lookAt: [-19.0, 13.0], label: 'F3 Coffee Bar' } },
  { name: 'laptop-f1-lift-front', viewport: laptop, view: { floor: 1, x: 0.0, z: 12.6, lookAt: [0.0, 16.4], label: 'Laptop Lift Front' } },
  { name: 'laptop-f3-lobby', viewport: laptop, view: { floor: 3, x: 0.0, z: 12.4, lookAt: [0.0, 17.2], label: 'Laptop F3 Lobby' } }
];

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const requested = decoded === '/' ? '/index.html' : decoded;
  const resolved = path.resolve(root, `.${requested}`);
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

function startServer() {
  const server = createServer(async (req, res) => {
    const filePath = safePath(req.url || '/');
    if (!filePath || !existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    try {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      res.end(await readFile(filePath));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(String(error));
    }
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function collectConsole(page) {
  const messages = [];
  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) messages.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (error) => messages.push(`[pageerror] ${error.message}`));
  return messages;
}

async function canvasInfo(page) {
  return page.locator('#worldCanvas').evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      display: getComputedStyle(canvas).display,
      visible: rect.width > 0 && rect.height > 0
    };
  });
}

async function captureViewport(browser, name, viewport, options = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, ...options });
  const page = await context.newPage();
  const messages = collectConsole(page);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#worldCanvas', { state: 'visible', timeout: 30000 });
  await page.waitForTimeout(4500);
  const info = await canvasInfo(page);
  const screenshotPath = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await context.close();
  return { name, screenshotPath, canvasInfo: info, messages };
}

async function captureWorldPreset(browser, preset) {
  const context = await browser.newContext({ viewport: preset.viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const messages = collectConsole(page);
  await page.goto(`http://127.0.0.1:${port}/?qaWorld=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#worldCanvas', { state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => window.kwrWorld && typeof window.kwrWorld.setQACamera === 'function', null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.evaluate((view) => {
    window.kwrWorld.setCollisionDebugEnabled?.(false);
    window.kwrWorld.setQACamera(view);
  }, preset.view);
  await page.waitForTimeout(900);
  const info = await canvasInfo(page);
  const screenshotPath = path.join(outDir, `${preset.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await context.close();
  return { name: preset.name, preset: preset.view, screenshotPath, canvasInfo: info, messages };
}

async function captureWorldPresetSequence(browser, viewport, presets) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const messages = collectConsole(page);
  await page.goto(`http://127.0.0.1:${port}/?qaWorld=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#worldCanvas', { state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => window.kwrWorld && typeof window.kwrWorld.setQACamera === 'function', null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const results = [];
  for (const preset of presets) {
    const before = messages.length;
    await page.evaluate((view) => {
      window.kwrWorld.setCollisionDebugEnabled?.(false);
      window.kwrWorld.setQACamera(view);
    }, preset.view);
    await page.waitForTimeout(650);
    const info = await canvasInfo(page);
    const screenshotPath = path.join(outDir, `${preset.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    results.push({
      name: preset.name,
      preset: preset.view,
      screenshotPath,
      canvasInfo: info,
      messages: messages.slice(before)
    });
  }
  await context.close();
  return results;
}
async function main() {
  mkdirSync(outDir, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    results.push(await captureViewport(browser, 'desktop-1920x1080', desktop));
    results.push(await captureViewport(browser, 'laptop-1366x768', laptop));
    results.push(await captureViewport(browser, 'mobile-390x844', devices['iPhone 13'].viewport, { isMobile: true, hasTouch: true }));
    const desktopPresets = WORLD_PRESETS.filter(preset => preset.viewport.width === desktop.width && preset.viewport.height === desktop.height);
    const laptopPresets = WORLD_PRESETS.filter(preset => preset.viewport.width === laptop.width && preset.viewport.height === laptop.height);
    results.push(...await captureWorldPresetSequence(browser, desktop, desktopPresets));
    results.push(...await captureWorldPresetSequence(browser, laptop, laptopPresets));
  } finally {
    await browser.close();
    server.close();
  }
  const report = {
    generatedAt: new Date().toISOString(),
    root,
    url: `http://127.0.0.1:${port}/`,
    results
  };
  const reportPath = path.join(outDir, 'visual-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  const errors = results.flatMap((result) => result.messages.filter((line) => line.includes('[error]') || line.includes('[pageerror]')));
  console.log(`Visual QA screenshots saved to ${outDir}`);
  console.log(`Report: ${reportPath}`);
  for (const result of results) console.log(`${result.name}: canvas ${result.canvasInfo.width}x${result.canvasInfo.height}, messages=${result.messages.length}`);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

