// Make the homepage cover for every listed deck: assets/home/<deck>.jpg, 960 x 720.
// The cover is, per scripts/homepage.json: a designed page ("html", a 960 x 720 file such as
// scripts/covers/*.html, path from the repo root), an image inside the deck ("src", cropped to 4:3),
// or else the deck's title slide; "cover": false means no cover. Local only (needs Playwright and an installed Chrome), so the
// covers are committed:
//   npm run build:covers            all listed decks
//   npm run build:covers -- <deck>  one or more decks
// then npm run build:index. Serves the repo itself, so no dev server is needed.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const decksDir = join(root, 'decks');
const outDir = join(root, 'assets', 'home');
const settingsPath = join(root, 'scripts', 'homepage.json');
const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, 'utf8')) : {};
const W = 960;
const H = 720;

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css',
	'.js': 'text/javascript',
	'.mjs': 'text/javascript',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.woff2': 'font/woff2',
	'.woff': 'font/woff',
	'.ttf': 'font/ttf',
};

const server = createServer((req, res) => {
	let path;
	try {
		path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
	} catch {
		res.writeHead(400).end();
		return;
	}
	if (path === '/__blank') {
		res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>cover</title>');
		return;
	}
	let file = normalize(join(root, path));
	if (file !== root && !file.startsWith(root + sep)) {
		res.writeHead(403).end();
		return;
	}
	if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
	if (!existsSync(file)) {
		res.writeHead(404).end();
		return;
	}
	res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' });
	res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const listed = readdirSync(decksDir)
	.filter((name) => existsSync(join(decksDir, name, 'index.html')))
	.filter((name) => !existsSync(join(decksDir, name, '.no-homepage')));
const only = process.argv.slice(2);
for (const name of only) {
	if (!listed.includes(name)) console.warn(`${name}: not a listed deck, skipped`);
}
const decks = only.length ? listed.filter((name) => only.includes(name)) : listed;

// CSS object-position, as fractions: one or two values, percentages or left/center/right/top/bottom.
function parsePosition(position = '50% 50%') {
	const words = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 };
	const parts = String(position).trim().split(/\s+/);
	const value = (part) => (part in words ? words[part] : parseFloat(part) / 100);
	let [x, y] = [value(parts[0]), parts.length > 1 ? value(parts[1]) : 0.5];
	if (parts.length === 1 && (parts[0] === 'top' || parts[0] === 'bottom')) [x, y] = [0.5, value(parts[0])];
	if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`cannot read cover position "${position}"`);
	return [x, y];
}

// An image cropped to W x H the way object-fit: cover + object-position would, drawn from its first
// frame (so a GIF gives a stable cover), optionally enlarged around the same point.
async function imageCover(page, url, position, zoom = 1) {
	const [px, py] = parsePosition(position);
	await page.goto(`${base}/__blank`); // same origin, so the canvas may fetch the deck's image
	await page.setContent(`<canvas width="${W}" height="${H}" style="display:block"></canvas>`);
	await page.evaluate(
		async ({ url, px, py, zoom, W, H }) => {
			const res = await fetch(url);
			if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
			const bmp = await createImageBitmap(await res.blob());
			const scale = Math.max(W / bmp.width, H / bmp.height) * zoom;
			const dw = bmp.width * scale;
			const dh = bmp.height * scale;
			const ctx = document.querySelector('canvas').getContext('2d');
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(bmp, (W - dw) * px, (H - dh) * py, dw, dh);
		},
		{ url, px, py, zoom, W, H }
	);
	return page.locator('canvas');
}

// A cover designed as its own 960 x 720 page (scripts/covers/*.html), with motion switched off.
async function htmlCover(page, path) {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(`${base}/${path}`, { waitUntil: 'networkidle' });
	await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
	await page.evaluate(async () => {
		await document.fonts.ready;
		await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
	});
	await page.waitForTimeout(300);
	return page;
}

async function titleSlideCover(page, name) {
	await page.goto(`${base}/decks/${name}/?transition=none&nomotion=1`, { waitUntil: 'networkidle' });
	await page.addStyleTag({
		content:
			'.reveal .controls, .reveal .progress, .reveal .slide-number { display: none !important; } *, *::before, *::after { transition: none !important; animation-play-state: paused !important; }',
	});
	await page.evaluate(async () => {
		await document.fonts.ready;
		if (window.Reveal?.isReady && !window.Reveal.isReady()) {
			await new Promise((resolve) => window.Reveal.on('ready', resolve));
		}
		window.Reveal?.slide?.(0, 0, 0);
	});
	await page.waitForTimeout(800);
	return page;
}

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
	for (const name of decks) {
		const cover = settings[name]?.cover;
		const out = join(outDir, `${name}.jpg`);
		if (cover === false) {
			rmSync(out, { force: true });
			console.log(`${name}: no cover`);
			continue;
		}
		const page = await browser.newPage({ viewport: { width: W, height: H } });
		try {
			let target;
			if (cover?.html) {
				if (!existsSync(join(root, cover.html))) throw new Error(`cover page not found: ${cover.html}`);
				target = await htmlCover(page, cover.html);
			} else if (cover?.src) {
				if (!existsSync(join(decksDir, name, cover.src))) throw new Error(`cover image not found: decks/${name}/${cover.src}`);
				target = await imageCover(page, `${base}/decks/${name}/${cover.src}`, cover.position, cover.zoom ?? 1);
			} else {
				target = await titleSlideCover(page, name);
			}
			await target.screenshot({ path: out, type: 'jpeg', quality: 84 });
			console.log(`${name}: assets/home/${name}.jpg (${cover?.html ?? cover?.src ?? 'title slide'})`);
		} catch (err) {
			console.error(`${name}: ${err.message}`);
			process.exitCode = 1;
		} finally {
			await page.close();
		}
	}
} finally {
	await browser.close();
	server.close();
}
