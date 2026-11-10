import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const decksDir = join(root, 'decks');
const indexPath = join(root, 'index.html');

// Homepage text for decks whose title slide does not split the event and the place/date the way the
// list wants (their title slides put everything in one event line). Published decks are frozen, so
// their homepage lines are set here rather than in the deck. Keys are deck folder names; any of
// title, event, meta may be given. Keep an entry in step with its deck if that deck is still edited.
const HOMEPAGE_META = {
	'2026-11-poetic-canon-stanford': {
		event: 'CESTA Lunch Seminar Series, Stanford University',
		meta: 'Stanford, November 19, 2026',
	},
	'2026-11-poetic-canon-berkeley': {
		event: 'Cultural Analytics Series, UC Berkeley',
		meta: 'Berkeley, November 9, 2026',
	},
	'2026-07-publishing-digital-edition': {
		meta: 'Antwerp, July 3, 2026',
	},
};

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
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&#39;', "'")
		.replace(/&#(x?)([0-9a-f]+);/gi, (_, hex, n) => String.fromCodePoint(parseInt(n, hex ? 16 : 10)))
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
	const dates = [...html.matchAll(/class="title-slide__date[^"]*"[^>]*>([\s\S]*?)<\/span>/gi)]
		.map((m) => clean(m[1]))
		.filter(Boolean);
	const meta = dates.length ? dates.join(', ') : null;

	return { title, event, meta };
}

function listDecks() {
	if (!exists(decksDir)) {
		return [];
	}

	return readdirSync(decksDir)
		.filter((name) => {
			const deckPath = join(decksDir, name);
			if (!statSync(deckPath).isDirectory() || !exists(join(deckPath, 'index.html'))) {
				return false;
			}
			// Decks with .no-homepage stay deployable but off the public index.
			return !exists(join(deckPath, '.no-homepage'));
		})
		.sort()
		.reverse()
		.map((name) => {
			const fromSlide = getDeckMeta(join(decksDir, name));
			const override = HOMEPAGE_META[name] ?? {};
			return {
				name,
				title: override.title || fromSlide.title || name,
				event: override.event || fromSlide.event || null,
				meta: override.meta || fromSlide.meta || null,
				url: `decks/${encodeURIComponent(name)}/`,
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

for (const key of Object.keys(HOMEPAGE_META)) {
	if (!exists(join(decksDir, key, 'index.html'))) {
		console.warn(`HOMEPAGE_META: no deck folder named ${key}`);
	}
}

function renderCard(deck, index) {
	const eventId = `deck-${index}-event`;
	const describedBy = deck.event ? ` aria-describedby="${eventId}"` : '';
	const lines = [
		`        <a class="deck-title" href="${escapeHtml(deck.url)}"${describedBy}>${escapeHtml(deck.title)}</a>`,
		deck.event ? `        <span class="deck-event" id="${eventId}">${escapeHtml(deck.event)}</span>` : '',
		deck.meta ? `        <span class="deck-meta">${escapeHtml(deck.meta)}</span>` : '',
	].filter(Boolean);
	return `      <li>\n${lines.join('\n')}\n      </li>`;
}

const deckItems =
	decks.length === 0
		? '      <li class="empty">No public decks yet. Create one with <code>npm run new -- 2026-09-my-talk</code>, then delete its <code>.no-homepage</code> file.</li>'
		: decks.map(renderCard).join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Slidedecks</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alegreya:wght@500;600&family=Source+Sans+3:wght@400&display=swap" />
  <style>
    :root {
      color-scheme: light;
      --bg: #faf8f5;      /* paper */
      --text: #1c1917;    /* ink */
      --soft: #45403b;
      --muted: #6b655f;
      --accent: #b5341c;  /* rubric, hover only */
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: 'Source Sans 3', system-ui, sans-serif;
      font-size: 17px;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    main {
      max-width: 680px;
      margin: 0 auto;
      padding: 5.5rem 1.5rem 6rem;
    }

    .masthead {
      margin: 0 0 3.5rem;
    }

    .masthead h1 {
      margin: 0;
      font-family: 'Alegreya', Georgia, serif;
      font-size: 2.75rem;
      font-weight: 600;
      line-height: 1.1;
    }

    .masthead p {
      margin: 0.75rem 0 0;
      color: var(--soft);
    }

    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 2.25rem;
    }

    li {
      display: grid;
      gap: 0.15rem;
    }

    .deck-title {
      justify-self: start;
      font-family: 'Alegreya', Georgia, serif;
      font-size: 1.6rem;
      font-weight: 500;
      line-height: 1.2;
      color: var(--text);
      text-decoration: none;
      text-wrap: balance;
    }

    .deck-title:hover,
    .deck-title:focus-visible {
      color: var(--accent);
      text-decoration: underline;
      text-decoration-thickness: 1px;
      text-underline-offset: 0.2em;
    }

    .deck-title:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 3px;
    }

    .deck-event {
      margin-top: 0.3rem;
      color: var(--soft);
    }

    .deck-meta {
      color: var(--muted);
    }

    li.empty {
      display: block;
      color: var(--muted);
    }

    code {
      font-family: ui-monospace, monospace;
      font-size: 0.9em;
    }

    @media (max-width: 520px) {
      main { padding: 3.5rem 1.25rem 4rem; }
      .masthead h1 { font-size: 2.3rem; }
      .deck-title { font-size: 1.4rem; }
    }
  </style>
</head>
<body>
  <main>
    <header class="masthead">
      <h1>Slidedecks</h1>
      <p>Oh, hello, you found my secret stash of slidedecks! ;-)</p>
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
