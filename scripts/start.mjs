import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.DEV_PORT ?? process.env.PORT ?? '8080';
const host = '127.0.0.1';

execSync('npm run build', { cwd: root, stdio: 'inherit' });

console.log('');
console.log('Slidedecks dev server');
console.log(`  Homepage:  http://${host}:${port}/`);
console.log(`  Decks:     http://${host}:${port}/decks/<deck-name>/`);
console.log('');
console.log(`Using port ${port}. Set DEV_PORT to override.`);
console.log('');

const server = spawn(
	'npx',
	[
		'live-server',
		'--port=' + port,
		'--host=' + host,
		'--no-browser',
		'--watch=theme/wouter.css,decks,template,index.html',
	],
	{ cwd: root, stdio: 'inherit', shell: true }
);

server.on('exit', (code) => process.exit(code ?? 0));
