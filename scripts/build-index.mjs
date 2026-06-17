import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const decksDir = join(root, 'decks');
const indexPath = join(root, 'index.html');

function decodeEntities(value) {
	return value
		.replaceAll('&ndash;', '–')
		.replaceAll('&mdash;', '—')
		.replaceAll('&nbsp;', ' ')
		.replaceAll('&middot;', '·')
		.replaceAll('&hellip;', '…')
		.replaceAll('&rsquo;', '’')
		.replaceAll('&lsquo;', '‘')
		.replaceAll('&ldquo;', '“')
		.replaceAll('&rdquo;', '”')
		.replaceAll('&amp;', '&');
}

// strip any inline tags, decode the handful of entities the decks use, collapse space
function clean(value) {
	return decodeEntities(value.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

// Pull what we need for a homepage card straight from the deck's title slide:
// the headline, the conference name, and the venue/date line.
function getDeckMeta(deckPath) {
	let html;
	try {
		html = readFileSync(join(deckPath, 'index.html'), 'utf8');
	} catch {
		return { title: null, event: null, meta: null };
	}

	// headline: prefer the title-slide H1, fall back to <title>
	let title = null;
	const h1Match = html.match(
		/class="title-slide__presentation">(?:<!-- PRESENTATION_TITLE -->)?([\s\S]*?)<\/h1>/i
	);
	if (h1Match) {
		title = clean(h1Match[1]);
	}
	if (!title) {
		const titleMatch = html.match(
			/<title>(?:<!-- PRESENTATION_TITLE -->)?([^<]+)<\/title>/i
		);
		if (titleMatch) {
			title = clean(titleMatch[1]);
		}
	}

	// conference + venue/date from the eyebrow spans
	const eventMatch = html.match(/class="title-slide__event"[^>]*>([\s\S]*?)<\/span>/i);
	const event = eventMatch ? clean(eventMatch[1]) : null;
	const dates = [...html.matchAll(/class="title-slide__date"[^>]*>([\s\S]*?)<\/span>/gi)]
		.map((m) => clean(m[1]))
		.filter(Boolean);
	const meta = dates.length ? dates.join(' · ') : null;

	return { title, event, meta };
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
		.map((name) => {
			const { title, event, meta } = getDeckMeta(join(decksDir, name));
			return {
				name,
				title: title ?? name,
				event,
				meta,
				url: `decks/${name}/`,
			};
		});
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

function renderCard(deck) {
	const eyebrow = deck.event
		? `<span class="card-event">${escapeHtml(deck.event)}</span>`
		: '';
	// real conference metadata if we have it; otherwise fall back to the slug
	const metaLine = escapeHtml(deck.meta ?? deck.name);
	return `      <li><a href="${deck.url}">${eyebrow}<strong class="card-title">${escapeHtml(deck.title)}</strong><span class="card-meta">${metaLine}</span></a></li>`;
}

const deckItems =
	decks.length === 0
		? '      <li class="empty">No decks yet. Run <code>npm run new -- 2026-09-my-talk</code></li>'
		: decks.map(renderCard).join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Slidedecks</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Source+Sans+3:wght@400;600&family=JetBrains+Mono:wght@400;500&display=swap" />
  <style>
    :root {
      color-scheme: light;
      --bg: #faf8f5;
      --text: #1c1917;
      --muted: #6f675b;
      --accent: #3c6e7a;       /* muted petrol — calm and editorial */
      --card: #f5f1ea;
      --border: #e8e1d8;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: 'Source Sans 3', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    main {
      max-width: 760px;
      margin: 0 auto;
      padding: 5rem 1.5rem 6rem;
    }

    .masthead {
      margin: 0 0 3rem;
    }

    .masthead h1 {
      margin: 0;
      font-family: 'Fraunces', Georgia, serif;
      font-size: 2.6rem;
      font-weight: 700;
      letter-spacing: -0.03em;
    }

    .masthead h1::after {
      content: "";
      display: block;
      width: 2.4rem;
      height: 3px;
      margin-top: 0.9rem;
      background: var(--accent);
      border-radius: 2px;
    }

    .masthead p {
      margin: 1.1rem 0 0;
      color: var(--muted);
      font-size: 1.05rem;
    }

    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 1rem;
    }

    li.empty {
      padding: 1.25rem 1.5rem;
      border: 1px dashed var(--border);
      border-radius: 0.9rem;
      color: var(--muted);
    }

    a {
      display: grid;
      gap: 0.5rem;
      padding: 1.5rem 1.75rem;
      border-radius: 0.9rem;
      background: var(--card);
      color: inherit;
      text-decoration: none;
      border: 1px solid var(--border);
      transition: border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
    }

    a:hover {
      border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
      transform: translateY(-2px);
      box-shadow: 0 14px 32px -20px rgba(28, 25, 23, 0.45);
    }

    .card-event {
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--accent);
    }

    .card-title {
      font-family: 'Fraunces', Georgia, serif;
      font-size: 1.4rem;
      font-weight: 600;
      line-height: 1.2;
      letter-spacing: -0.01em;
      color: var(--text);
      transition: color 0.18s ease;
    }

    a:hover .card-title {
      color: var(--accent);
    }

    .card-meta {
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-size: 0.82rem;
      color: var(--muted);
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
    <header class="masthead">
      <h1>Slidedecks</h1>
      <p>Talks and lectures by Wouter Haverals.</p>
    </header>
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
