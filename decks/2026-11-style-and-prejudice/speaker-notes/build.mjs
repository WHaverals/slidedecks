// Builds speaker-notes-style-and-prejudice.pdf from the live deck plus the authored content.
//
//   node decks/2026-11-style-and-prejudice/speaker-notes/build.mjs            full build
//   ... --no-extract     reuse build/structure.json and build/thumbs from the last extraction
//   ... --accept         record the deck's current notes as reconciled (see notes-hashes.json)
//   ... --preview        also write build/preview/page-NN.png with pdftoppm
//
// Needs: the repo's node_modules (playwright), Chrome, and a network connection for Google Fonts.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { extractDeck } from './extract.mjs';
import { compileContent, inline, plain } from './compile.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const require = createRequire(path.join(repo, 'package.json'));
const { chromium } = require('playwright');
const args = new Set(process.argv.slice(2));
const buildDir = path.join(here, 'build');
const outPdf = path.join(here, 'speaker-notes-style-and-prejudice.pdf');
const PORT = 8921;
const book = JSON.parse(fs.readFileSync(path.join(here, 'book.json'), 'utf8'));
fs.mkdirSync(buildDir, { recursive: true });

/* ---------- static server for the deck (repo root) ---------- */
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mjs': 'text/javascript', '.csv': 'text/csv' };
async function startServer() {
	const server = http.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		const f = path.join(repo, u);
		if (!f.startsWith(repo)) return res.writeHead(403).end();
		fs.stat(f, (err, st) => {
			if (err || !st.isFile()) return res.writeHead(404).end();
			res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' });
			fs.createReadStream(f).pipe(res);
		});
	});
	return new Promise((resolve) => {
		server.on('error', (e) => {
			if (e.code === 'EADDRINUSE') resolve(null); // something is already serving on the port; use it
			else throw e;
		});
		server.listen(PORT, '127.0.0.1', () => resolve(server));
	});
}

const norm = (t) => (t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const warnings = [];
const warn = (m) => warnings.push(m);

const server = await startServer();
const baseUrl = `http://127.0.0.1:${PORT}${book.deckUrlPath}`;

/* ---------- 1. the deck ---------- */
let structure;
if (args.has('--no-extract') && fs.existsSync(path.join(buildDir, 'structure.json'))) {
	const saved = JSON.parse(fs.readFileSync(path.join(buildDir, 'structure.json'), 'utf8'));
	structure = saved.slides;
	structure.printText = saved.printText;
} else {
	structure = await extractDeck(baseUrl, buildDir);
}
if (server) server.close();
const deckSlides = structure.map((s) => ({ ...s, v: s.v || 0 }));
if (structure.printText) {
	if (structure.printText.length !== deckSlides.length) warn(`thumbnails: ${structure.printText.length} print pages for ${deckSlides.length} slides`);
	deckSlides.forEach((d, i) => {
		const a = norm(structure.printText[i] || '');
		const b = norm(d.text).slice(0, 14);
		if (!a.startsWith(b)) warn(`thumbnail ${d.n} may show the wrong slide (print page starts "${(structure.printText[i] || '').slice(0, 30)}", slide text starts "${d.text.slice(0, 30)}")`);
	});
}

/* ---------- 2. the authored content ---------- */
const { slides: entries, problems } = compileContent(path.join(here, 'content'));
problems.forEach((p) => warn('content: ' + p));
const entryFor = {};
entries.forEach((e) => {
	for (let n = e.n; n <= e.nTo; n++) {
		if (entryFor[n]) warn(`content: slide ${n} is written twice`);
		entryFor[n] = e;
	}
});

/* ---------- 3. notes fingerprints: which slides' notes changed since the last reconcile ---------- */
const hashFile = path.join(here, 'notes-hashes.json');
const hashOf = (s) => crypto.createHash('sha1').update(JSON.stringify([s.title, s.clicks, s.notes])).digest('hex').slice(0, 10);
const nowHashes = Object.fromEntries(deckSlides.map((s) => [s.n, hashOf(s)]));
let oldHashes = null;
if (fs.existsSync(hashFile)) oldHashes = JSON.parse(fs.readFileSync(hashFile, 'utf8'));
if (args.has('--accept') || !oldHashes) {
	fs.writeFileSync(hashFile, JSON.stringify(nowHashes, null, 1));
	if (!oldHashes) console.log('notes-hashes.json created: the current deck notes count as reconciled.');
	else console.log('notes-hashes.json updated: the current deck notes count as reconciled.');
	oldHashes = nowHashes;
}
const changed = deckSlides.filter((s) => oldHashes[s.n] !== nowHashes[s.n]).map((s) => s.n);
const missingHash = deckSlides.filter((s) => !(s.n in oldHashes)).map((s) => s.n);

/* ---------- 4. merge ---------- */
const sectionFor = (n) => book.sections.find((x) => n >= x.slides[0] && n <= x.slides[1]) || null;
const lastMain = book.sections[book.sections.length - 1].slides[1];
const lastMainSlide = deckSlides.find((s) => s.n === lastMain);
const ord = (k) => (k === 1 ? '' : k === 2 ? ' twice' : k === 3 ? ' three times' : ` ${k} times`);
const merged = [];
for (const d of deckSlides) {
	const e = entryFor[d.n];
	const isRef = d.n >= book.afterClose.referencesFrom && d.n <= book.afterClose.referencesTo;
	const isBackup = d.backup || d.n >= book.afterClose.firstSlide;
	const m = {
		n: d.n,
		h: d.h,
		v: d.v,
		cls: d.cls,
		isBackup,
		isRef,
		deckTitle: d.title || d.text.slice(0, 40),
		clicks: d.clicks,
		cues: [],
		blocks: {},
		thumb: fs.existsSync(path.join(buildDir, 'thumbs', String(d.n).padStart(2, '0') + '.jpg')) ? `thumbs/${String(d.n).padStart(2, '0')}.jpg` : null,
		section: sectionFor(d.n),
	};
	if (!e) {
		if (!isRef) warn(`slide ${d.n} (${m.deckTitle}) has no content entry`);
		m.pageTitleHtml = inline(m.deckTitle);
		merged.push(m);
		continue;
	}
	// stale-content checks
	const expected = e.deck !== null && e.deck !== '' ? e.deck : e.title || e.deck === '' ? '' : e.heading;
	if (!isRef && expected) {
		const have = norm(d.title || d.text);
		if (!have.startsWith(norm(expected).slice(0, 28))) warn(`slide ${d.n}: the deck now says "${(d.title || d.text).slice(0, 50)}" but the content was written for "${expected.slice(0, 50)}"`);
	}
	if (!isRef) {
		if (e.clicks === null) warn(`slide ${d.n}: content has no clicks: line (deck has ${d.clicks})`);
		else if (e.clicks !== d.clicks) warn(`slide ${d.n}: content was written for ${e.clicks} clicks, the deck has ${d.clicks}`);
		for (let k = 1; k <= d.clicks; k++) if (!e.blocks[k]) warn(`slide ${d.n}: no "click ${k}:" block, the deck has ${d.clicks} clicks`);
		Object.keys(e.blocks).forEach((k) => {
			if (+k > d.clicks) warn(`slide ${d.n}: "click ${k}:" block but the deck has only ${d.clicks} clicks`);
		});
		e.cues.forEach((c) => {
			if (c.click > d.clicks) warn(`slide ${d.n}: cue for click ${c.click} but the deck has ${d.clicks} clicks`);
		});
		if (!e.cues.length) warn(`slide ${d.n}: no cue phrase`);
		if (!isBackup && !e.bridge && d.n !== lastMain) warn(`slide ${d.n}: main-line slide without a bridge`);
	}
	m.pageTitleHtml = inline(e.pageTitle);
	m.subHtml = e.subHtml || null;
	m.bridgeHtml = e.bridgeHtml || null;
	m.whenHtml = e.whenHtml || null;
	m.cues = e.cues.map((c) => ({ click: c.click, html: c.html }));
	m.blocks = Object.fromEntries(Object.entries(e.blocks).map(([k, v]) => [k, v.map((b) => ({ kind: b.kind, html: b.html }))]));
	merged.push(m);
}
Object.keys(entryFor).forEach((n) => {
	if (!deckSlides.find((d) => d.n === +n)) warn(`content for slide ${n}, which the deck does not have`);
});

// navigation text for backups
for (const m of merged) {
	if (!m.isBackup) continue;
	const top = merged.find((x) => x.h === m.h && x.v === 0);
	if (m.v > 0 && top) {
		m.backupTag = `Backup, below slide ${top.n}`;
		m.reach = `Down${ord(m.v)} from ${top.n}`;
	} else {
		const k = m.h - lastMainSlide.h;
		m.backupTag = 'Backup, after the closing slide';
		m.reach = `Right${ord(k)} from ${lastMain}`;
	}
	const e = entryFor[m.n];
	m.reachLong = `${m.reach}.` + (e && e.when ? ' ' + e.when : '');
}

// reference slides: one compact page
const refEntry = entryFor[book.afterClose.referencesFrom];
const refsContent = refEntry
	? { lead: (refEntry.blocks[0] || []).map((b) => b.raw).join(' '), bullets: [] }
	: null;

const data = { ...book, slides: merged, refsContent };
fs.writeFileSync(path.join(buildDir, 'data.json'), JSON.stringify(data, null, 1));

/* ---------- 5. render ---------- */
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${book.title}: speaker notes</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400;1,600&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="../page.css" />
</head><body><div id="root"></div>
<script>window.BOOK = ${JSON.stringify(data).replace(/</g, '\\u003c')};</script>
</body></html>`;
const htmlPath = path.join(buildDir, 'book.html');
fs.writeFileSync(htmlPath, html);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 679, height: 905 } });
await page.goto('file://' + htmlPath, { waitUntil: 'load' });
await page.evaluate(async () => {
	const faces = ['400 16px "Source Sans 3"', '600 16px "Source Sans 3"', '700 16px "Source Sans 3"', 'italic 400 16px "Source Sans 3"', '400 16px "Libre Caslon Text"', '700 16px "Libre Caslon Text"', 'italic 400 16px "Libre Caslon Text"'];
	await Promise.all(faces.map((f) => document.fonts.load(f)));
	await document.fonts.ready;
});
const fontsOk = await page.evaluate(() => ['700 20px "Libre Caslon Text"', '400 16px "Source Sans 3"'].every((f) => document.fonts.check(f)));
if (!fontsOk) warn('web fonts did not load (no network?): the layout will differ from the intended one');
await page.addScriptTag({ path: path.join(here, 'render.js') });
await page.waitForFunction(() => window.__done === true, null, { timeout: 60000 });
await page.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? 1 : new Promise((r) => (i.onload = i.onerror = r))))));
const result = await page.evaluate(() => window.__result);
await page.pdf({ path: outPdf, width: '7.07in', height: '9.43in', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
await browser.close();

/* ---------- 6. report ---------- */
if (args.has('--preview')) {
	const dir = path.join(buildDir, 'preview');
	fs.rmSync(dir, { recursive: true, force: true });
	fs.mkdirSync(dir, { recursive: true });
	execFileSync('pdftoppm', ['-r', '110', '-png', outPdf, path.join(dir, 'page')]);
}
console.log(`\nWrote ${path.relative(repo, outPdf)}: ${result.pages} pages`);
const multi = Object.entries(result.slidePages).filter(([, c]) => c > 1).map(([n, c]) => `${n} (${c})`);
console.log('slides on more than one page:', multi.join(', ') || 'none');
console.log('height of the last page (px, capacity about 560):', Object.entries(result.spill).map(([n, h]) => `${n}:${h}`).join(' '));
if (result.overflow.length) console.log('PAGES WITH OVERFLOW:', result.overflow.join(', '));
if (result.droppedRepeat.length) console.log('bridge not repeated on the Next line (no room) on the pages of slides:', result.droppedRepeat.join(', '));
if (result.wide.length) console.log('WIDE OR LONG:', result.wide.join(' | '));
result.issues.forEach((i) => console.log('LAYOUT:', i));
if (changed.length) console.log(`\nDeck notes changed since the last reconcile (re-read these slides, then run with --accept): ${changed.join(', ')}`);
if (missingHash.length) console.log('Slides without a stored fingerprint:', missingHash.join(', '));
if (warnings.length) {
	console.log('\nWARNINGS');
	warnings.forEach((w) => console.log(' -', w));
} else console.log('\nNo content warnings.');
