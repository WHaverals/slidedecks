import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '_site');

const pathsToCopy = ['reveal', 'plugins', 'theme', 'assets', 'decks', 'template', 'index.html'];

if (existsSync(outDir)) {
	rmSync(outDir, { recursive: true, force: true });
}

mkdirSync(outDir, { recursive: true });

for (const path of pathsToCopy) {
	const source = join(root, path);
	if (!existsSync(source)) {
		continue;
	}
	cpSync(source, join(outDir, path), { recursive: true });
}

// Raw brand archives (assets/brand) aren't referenced by any deck — keep the deploy lean
rmSync(join(outDir, 'assets', 'brand'), { recursive: true, force: true });

console.log(`Prepared static site in ${outDir}`);
