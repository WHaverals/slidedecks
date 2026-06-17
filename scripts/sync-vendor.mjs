import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Plugin libraries served from npm. Files fetched from GitHub/GitLab
// (railroad, reveald3, wordcloud) are committed directly in plugins/.
const copies = [
	['node_modules/chart.js/dist/chart.umd.js', 'plugins/chartjs/chart.umd.js'],
	['node_modules/d3/dist/d3.min.js', 'plugins/d3/d3.min.js'],
	[
		'node_modules/reveal.js-mermaid-plugin/plugin/mermaid/mermaid.js',
		'plugins/mermaid/mermaid.js',
	],
	['node_modules/matter-js/build/matter.min.js', 'plugins/matter/matter.min.js'],
];

for (const [from, to] of copies) {
	const source = join(root, from);
	if (!existsSync(source)) {
		console.error(`Missing ${from} — run npm install first.`);
		process.exit(1);
	}
	const target = join(root, to);
	mkdirSync(dirname(target), { recursive: true });
	copyFileSync(source, target);
}

console.log(`Synced ${copies.length} vendor file(s) into plugins/.`);
