// Render the title slide of every deck listed on the homepage to assets/home/<deck>.jpg.
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
	let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
	let file = normalize(join(root, path));
	if (!file.startsWith(root + sep) && file !== root) {
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

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
	for (const name of decks) {
		// 640 x 467 keeps the 960 x 700 slide ratio; shown at about 300 CSS px, so sharp on 2x screens.
		const page = await browser.newPage({ viewport: { width: 640, height: 467 } });
		await page.goto(`${base}/decks/${name}/?transition=none&nomotion=1`, { waitUntil: 'networkidle' });
		await page.addStyleTag({
			content: '.reveal .controls, .reveal .progress, .reveal .slide-number, .reveal .slide-menu-button { display: none !important; } *, *::before, *::after { transition: none !important; animation-play-state: paused !important; }',
		});
		await page.evaluate(async () => {
			await document.fonts.ready;
			if (window.Reveal?.isReady && !window.Reveal.isReady()) {
				await new Promise((resolve) => window.Reveal.on('ready', resolve));
			}
			window.Reveal?.slide?.(0, 0, 0);
		});
		await page.waitForTimeout(800);
		await page.screenshot({ path: join(outDir, `${name}.jpg`), type: 'jpeg', quality: 86 });
		await page.close();
		console.log(`cover: assets/home/${name}.jpg`);
	}
} finally {
	await browser.close();
	server.close();
}
