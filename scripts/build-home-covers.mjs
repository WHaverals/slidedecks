// Make the homepage cover for every listed deck: assets/home/<deck>.jpg, 640 x 480.
// The cover is the image named in scripts/homepage.json (cropped to 4:3), or else the deck's title slide.
// Local only (needs Playwright and an installed Chrome), so the covers are committed:
//   npm run build:covers            all listed decks
//   npm run build:covers -- <deck>  one deck
// then npm run build:index. Serves the repo itself, so no dev server is needed.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const decksDir = join(root, 'decks');
const outDir = join(root, 'assets', 'home');
const settings = JSON.parse(readFileSync(join(root, 'scripts', 'homepage.json'), 'utf8'));
const W = 640;
const H = 480;

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
	const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
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

const only = process.argv.slice(2);
const decks = readdirSync(decksDir)
	.filter((name) => existsSync(join(decksDir, name, 'index.html')))
	.filter((name) => !existsSync(join(decksDir, name, '.no-homepage')))
	.filter((name) => only.length === 0 || only.includes(name));

// An image cropped to W x H the way CSS object-fit: cover + object-position would, drawn from the
// first frame (so a GIF gives a stable cover), optionally enlarged around the same point.
async function imageCover(page, url, position = '50% 50%', zoom = 1) {
	const [px, py] = position.split(/\s+/).map((v) => parseFloat(v) / 100);
	await page.setContent(`<canvas width="${W}" height="${H}" style="display:block"></canvas>`);
	await page.evaluate(
		async ({ url, px, py, zoom, W, H }) => {
			const blob = await (await fetch(url)).blob();
			const bmp = await createImageBitmap(blob);
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
		const page = await browser.newPage({ viewport: { width: W, height: H } });
		await page.goto(`${base}/`); // same origin, so the canvas may fetch the deck's image
		const target = cover?.src
			? await imageCover(page, `${base}/decks/${name}/${cover.src}`, cover.position, cover.zoom)
			: await titleSlideCover(page, name);
		await target.screenshot({ path: join(outDir, `${name}.jpg`), type: 'jpeg', quality: 84 });
		await page.close();
		console.log(`cover: assets/home/${name}.jpg (${cover?.src ? cover.src : 'title slide'})`);
	}
} finally {
	await browser.close();
	server.close();
}
