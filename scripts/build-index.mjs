import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const decksDir = join(root, 'decks');
const indexPath = join(root, 'index.html');

function getDeckTitle(deckPath) {
	const indexHtml = join(deckPath, 'index.html');
	try {
		const html = readFileSync(indexHtml, 'utf8');
		const titleMatch = html.match(
			/<title>(?:<!-- PRESENTATION_TITLE -->)?([^<]+)<\/title>/i
		);
		if (titleMatch) {
			return titleMatch[1].trim();
		}
		const h1Match = html.match(
			/class="title-slide__presentation">(?:<!-- PRESENTATION_TITLE -->)?([^<]+)</i
		);
		if (h1Match) {
			return h1Match[1].trim();
		}
	} catch {
		// fall through
	}
	return null;
}

function listDecks() {
	if (!exists(decksDir)) {
		return [];
	}

	return readdirSync(decksDir)
		.filter((name) => {
			const deckPath = join(decksDir, name);
			return statSync(deckPath).isDirectory() && exists(join(deckPath, 'index.html'));
		})
		.sort()
		.reverse()
		.map((name) => ({
			name,
			title: getDeckTitle(join(decksDir, name)) ?? name,
			url: `decks/${name}/`,
		}));
}

function exists(path) {
	try {
		statSync(path);
		return true;
	} catch {
		return false;
	}
}

const decks = listDecks();

const deckItems =
	decks.length === 0
		? '      <li class="empty">No decks yet. Run <code>npm run new -- 2026-09-my-talk</code></li>'
		: decks
				.map(
					(deck) =>
						`      <li><a href="${deck.url}"><strong>${escapeHtml(deck.title)}</strong><span>${escapeHtml(deck.name)}</span></a></li>`
				)
				.join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Slidedecks</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Source+Sans+3:wght@400;600&display=swap" />
  <style>
    :root {
      color-scheme: light;
      --bg: #faf8f5;
      --text: #1c1917;
      --muted: #57534e;
      --accent: #b5341c;
      --card: #f3efe8;
      --border: #e7e0d8;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: 'Source Sans 3', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
    }

    main {
      max-width: 720px;
      margin: 0 auto;
      padding: 4rem 1.5rem;
    }

    h1 {
      margin: 0 0 0.5rem;
      font-family: 'Fraunces', Georgia, serif;
      font-size: 2.25rem;
      font-weight: 600;
      letter-spacing: -0.03em;
    }

    p {
      margin: 0 0 2rem;
      color: var(--muted);
    }

    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.75rem;
    }

    li.empty {
      padding: 1rem 1.25rem;
      border: 1px dashed var(--border);
      border-radius: 0.75rem;
      color: var(--muted);
    }

    a {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding: 1rem 1.25rem;
      border-radius: 0.75rem;
      background: var(--card);
      color: inherit;
      text-decoration: none;
      border: 1px solid var(--border);
      transition: border-color 0.15s ease, transform 0.15s ease;
    }

    a:hover {
      border-color: var(--accent);
      transform: translateY(-1px);
    }

    a strong {
      color: var(--accent);
      font-weight: 600;
    }

    a span {
      color: var(--muted);
      font-size: 0.9rem;
      font-family: 'JetBrains Mono', ui-monospace, monospace;
    }

    code {
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-size: 0.85em;
      color: var(--accent);
    }
  </style>
</head>
<body>
  <main>
    <h1>Slidedecks</h1>
    <p>Conference talks built with reveal.js and the Wouter theme.</p>
    <ul>
${deckItems}
    </ul>
  </main>
</body>
</html>
`;

writeFileSync(indexPath, html);
console.log(`Generated homepage with ${decks.length} deck(s).`);

function escapeHtml(value) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}
