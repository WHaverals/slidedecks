import { chromium } from 'playwright';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

const root = path.resolve('.');
const pageUrl =
	'file://' + path.join(root, 'decks/2026-06-poetic-canon/assets/_race-export.html');
const outDir = path.join(root, 'decks/2026-06-poetic-canon/assets/_vid');
mkdirSync(outDir, { recursive: true });

const W = 1920;
const H = 960;

const browser = await chromium.launch();
const ctx = await browser.newContext({
	viewport: { width: W, height: H },
	deviceScaleFactor: 2, // crisper text in the captured frames
	recordVideo: { dir: outDir, size: { width: W, height: H } },
});
const page = await ctx.newPage();

await page.goto(pageUrl, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.KEYFRAME_COUNT > 0, { timeout: 30000 });
await page.evaluate(() => document.fonts.ready);

// settle on the first frame, hold a beat, then run the race
await page.evaluate(() => window.renderInstant(0));
await page.waitForTimeout(700);
await page.evaluate(() => window.raceControl.play());

// wait for the race to finish
await page.waitForFunction(() => !window.raceControl.isPlaying(), {
	timeout: 90000,
	polling: 150,
});
await page.waitForTimeout(1100); // hold the final 1930s frame

const video = page.video();
await ctx.close(); // finalizes the .webm
const vp = await video.path();
console.log('VIDEO=' + vp);
await browser.close();
