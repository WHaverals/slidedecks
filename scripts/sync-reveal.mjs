import { cpSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', 'reveal.js', 'dist');
const target = join(root, 'reveal', 'dist');

if (!existsSync(source)) {
	console.error('reveal.js is not installed. Run: npm install');
	process.exit(1);
}

if (existsSync(target)) {
	rmSync(target, { recursive: true, force: true });
}

cpSync(source, target, { recursive: true });
console.log(`Synced reveal.js dist -> ${target}`);
