import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const templateDir = join(root, 'template');
const decksDir = join(root, 'decks');

const deckName = process.argv[2];

if (!deckName) {
	console.error('Usage: npm run new -- <deck-name>');
	console.error('Example: npm run new -- 2026-09-my-conf-talk');
	process.exit(1);
}

if (!/^[a-z0-9][a-z0-9-]*$/.test(deckName)) {
	console.error('Deck name must be lowercase letters, numbers, and hyphens only.');
	process.exit(1);
}

const targetDir = join(decksDir, deckName);

if (existsSync(targetDir)) {
	console.error(`Deck already exists: ${targetDir}`);
	process.exit(1);
}

if (!existsSync(templateDir)) {
	console.error('Template directory not found.');
	process.exit(1);
}

mkdirSync(decksDir, { recursive: true });
cpSync(templateDir, targetDir, { recursive: true });

const port = process.env.DEV_PORT ?? '8080';

console.log(`Created deck: decks/${deckName}/`);
console.log(`Edit title slide fields in decks/${deckName}/index.html`);
console.log(`Open: http://127.0.0.1:${port}/decks/${deckName}/`);
