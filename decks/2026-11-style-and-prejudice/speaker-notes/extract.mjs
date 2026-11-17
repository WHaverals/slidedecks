// Reads the live deck: structure, real click counts, notes, and final-state thumbnails.
// Used by build.mjs; can also be run alone: node extract.mjs <baseUrl> <outDir>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const require = createRequire(path.join(repo, 'package.json'));
const { chromium } = require('playwright');

export async function extractDeck(baseUrl, outDir, { thumbs = true } = {}) {
	fs.mkdirSync(path.join(outDir, 'thumbs'), { recursive: true });
	const browser = await chromium.launch({ channel: 'chrome', headless: true });
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
	await page.goto(baseUrl + '?transition=none&nomotion=1', { waitUntil: 'load' });
	await page.waitForFunction(() => window.Reveal && Reveal.isReady && Reveal.isReady());

	const slides = await page.evaluate(async () => {
		const leaves = [...document.querySelectorAll('.slides section')].filter(
			(s) => !s.querySelector('section') && !s.closest('.backgrounds'),
		);
		const out = [];
		for (let i = 0; i < leaves.length; i++) {
			const s = leaves[i];
			const idx = Reveal.getIndices(s);
			const lis = [...s.querySelectorAll('aside.notes li')];
			let zone = 'spoken';
			const notes = [];
			for (const l of lis) {
				if (l.innerHTML.trim() === '<em>Reference</em>') {
					zone = 'reference';
					continue;
				}
				const marked = l.innerHTML.replace(/<mark[^>]*>([\s\S]*?)<\/mark>/g, '==$1==').replace(/<[^>]+>/g, '');
				const tmp = document.createElement('textarea');
				tmp.innerHTML = marked;
				notes.push({ zone, text: l.textContent.replace(/\s+/g, ' ').trim(), marked: tmp.value.replace(/\s+/g, ' ').trim() });
			}
			const html = s.innerHTML.replace(/<aside class="notes"[\s\S]*?<\/aside>/g, ' ');
			const t = document.createElement('template');
			t.innerHTML = html;
			const text = t.content.textContent.replace(/\s+/g, ' ').trim();
			const h2 = s.querySelector('h2');
			// Real clicks: walk the slide with the reveal fragment API and record what each click shows.
			Reveal.slide(idx.h, idx.v, -1, 0);
			await new Promise((r) => setTimeout(r, 30));
			const steps = [];
			let guard = 0;
			const visibleSet = () =>
				new Set([...s.querySelectorAll('.fragment.visible')]);
			let before = visibleSet();
			while (guard++ < 40) {
				const shown = Reveal.nextFragment();
				if (!shown) break;
				await new Promise((r) => setTimeout(r, 15));
				const now = visibleSet();
				const added = [...now].filter((e) => !before.has(e));
				steps.push(
					added.map((e) => ({
						cls: e.className.replace(/\b(fragment|visible|current-fragment)\b/g, '').trim(),
						text: e.textContent.replace(/\s+/g, ' ').trim().slice(0, 140),
					})),
				);
				before = now;
			}
			out.push({
				n: i + 1,
				h: idx.h,
				v: idx.v,
				title: h2 ? h2.textContent.replace(/\s+/g, ' ').trim() : '',
				cls: s.className.replace(/\b(future|past|present)\b/g, '').replace(/\s+/g, ' ').trim(),
				id: s.id || '',
				backup: s.classList.contains('backup-slide'),
				clicks: steps.length,
				steps,
				text,
				notes,
			});
		}
		Reveal.slide(0, 0, 0, 0);
		return out;
	});
	await page.close();

	if (thumbs) {
		const q = await browser.newPage({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 1 });
		await q.goto(baseUrl + '?print-pdf&nomotion=1', { waitUntil: 'load' });
		await q.waitForSelector('.pdf-page', { timeout: 30000 });
		await q.waitForTimeout(4000);
		const pages = await q.$$('.pdf-page');
		for (let i = 0; i < pages.length; i++) {
			await pages[i].screenshot({
				path: path.join(outDir, 'thumbs', String(i + 1).padStart(2, '0') + '.jpg'),
				type: 'jpeg',
				quality: 82,
			});
		}
		slides.pdfPages = pages.length;
		slides.printText = await q.evaluate(() =>
			[...document.querySelectorAll('.pdf-page')].map((pg) => {
				const c = pg.cloneNode(true);
				c.querySelectorAll('aside.notes').forEach((a) => a.remove());
				return c.textContent.replace(/\s+/g, ' ').trim();
			}),
		);
		await q.close();
	}
	await browser.close();
	fs.writeFileSync(path.join(outDir, 'structure.json'), JSON.stringify({ slides: [...slides], printText: slides.printText || null }, null, 1));
	return slides;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const base = process.argv[2] || 'http://127.0.0.1:8921/decks/2026-11-style-and-prejudice/index.html';
	const out = process.argv[3] || path.join(here, 'build');
	const s = await extractDeck(base, out);
	console.log('slides', s.length, 'thumb pages', s.pdfPages);
}
