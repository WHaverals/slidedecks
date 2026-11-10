import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const decksDir = join(root, 'decks');
const indexPath = join(root, 'index.html');

// Per-deck homepage settings (text overrides and covers); see the "_about" note in the file.
const SETTINGS = JSON.parse(readFileSync(join(root, 'scripts', 'homepage.json'), 'utf8'));

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

// strip inline tags and comments, decode the entities the decks use, collapse space
function clean(value) {
	return decodeEntities(value.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ''))
		.replace(/\s+/g, ' ')
		.trim();
}

// Read the deck's title slide: headline, subtitle, conference name, and the venue/date spans.
function getDeckMeta(deckPath) {
	let html;
	try {
		html = readFileSync(join(deckPath, 'index.html'), 'utf8');
	} catch {
		return {};
	}
	const pick = (re) => {
		const m = html.match(re);
		return m ? clean(m[1]) || null : null;
	};
	const title =
		pick(/class="title-slide__presentation"[^>]*>([\s\S]*?)<\/h1>/i) ?? pick(/<title>([\s\S]*?)<\/title>/i);
	const subtitle = pick(/class="title-slide__subtitle"[^>]*>([\s\S]*?)<\/p>/i);
	const event = pick(/class="title-slide__event"[^>]*>([\s\S]*?)<\/span>/i);
	const dates = [...html.matchAll(/class="title-slide__date[^"]*"[^>]*>([\s\S]*?)<\/span>/gi)]
		.map((m) => clean(m[1]))
		.filter(Boolean);
	return { title, subtitle, event, meta: dates.length ? dates.join(', ') : null };
}

// A field set in homepage.json wins, including an explicit null (which hides it).
function field(override, fromSlide, key) {
	if (Object.hasOwn(override, key)) return override[key] || null;
	return fromSlide[key] || null;
}

function exists(path) {
	try {
		statSync(path);
		return true;
	} catch {
		return false;
	}
}

function listDecks() {
	if (!exists(decksDir)) return [];
	return readdirSync(decksDir)
		.filter((name) => {
			const deckPath = join(decksDir, name);
			if (!statSync(deckPath).isDirectory() || !exists(join(deckPath, 'index.html'))) return false;
			// Decks with .no-homepage stay deployable but off the public index.
			return !exists(join(deckPath, '.no-homepage'));
		})
		.sort()
		.reverse()
		.map((name) => {
			const fromSlide = getDeckMeta(join(decksDir, name));
			const override = SETTINGS[name] ?? {};
			return {
				name,
				year: /^\d{4}/.test(name) ? name.slice(0, 4) : '',
				title: field(override, fromSlide, 'title') || name,
				subtitle: field(override, fromSlide, 'subtitle'),
				event: field(override, fromSlide, 'event'),
				meta: field(override, fromSlide, 'meta'),
				url: `decks/${encodeURIComponent(name)}/`,
				cover: exists(join(root, 'assets', 'home', `${name}.jpg`)) ? `assets/home/${encodeURIComponent(name)}.jpg` : null,
			};
		});
}

for (const key of Object.keys(SETTINGS)) {
	if (!key.startsWith('_') && !exists(join(decksDir, key, 'index.html'))) {
		console.warn(`homepage.json: no deck folder named ${key}`);
	}
}

// One entry per talk: decks with the same title and subtitle are the same talk given more than once.
// Entries keep the order of their most recent delivery and sit under that delivery's year.
const decks = listDecks();
const talks = [];
for (const deck of decks) {
	const key = `${deck.title}\u0000${deck.subtitle ?? ''}`;
	let talk = talks.find((t) => t.key === key);
	if (!talk) {
		talk = { key, title: deck.title, subtitle: deck.subtitle, year: deck.year, url: deck.url, cover: null, deliveries: [] };
		talks.push(talk);
	}
	talk.cover ??= deck.cover;
	talk.deliveries.push(deck);
}
const years = [];
for (const talk of talks) {
	let group = years.find((y) => y.year === talk.year);
	if (!group) years.push((group = { year: talk.year, talks: [] }));
	group.talks.push(talk);
}

function renderDelivery(deck) {
	const label = deck.event ?? deck.meta ?? deck.title;
	const sub = deck.event && deck.meta ? `\n              <span class="talk-when">${escapeHtml(deck.meta)}</span>` : '';
	return `            <li>
              <a href="${escapeHtml(deck.url)}">${escapeHtml(label)}</a>${sub}
            </li>`;
}

function renderTalk(talk) {
	const cover = talk.cover
		? `        <a class="talk-cover" href="${escapeHtml(talk.url)}" tabindex="-1" aria-hidden="true"><img src="${escapeHtml(talk.cover)}" alt="" width="640" height="480" loading="lazy" /></a>\n`
		: '';
	const subtitle = talk.subtitle ? `\n          <p class="talk-subtitle">${escapeHtml(talk.subtitle)}</p>` : '';
	return `      <li class="talk${talk.cover ? '' : ' talk--no-cover'}">
${cover}        <div class="talk-text">
          <h3 class="talk-title"><a href="${escapeHtml(talk.url)}">${escapeHtml(talk.title)}</a></h3>${subtitle}
          <ul class="talk-deliveries">
${talk.deliveries.map(renderDelivery).join('\n')}
          </ul>
        </div>
      </li>`;
}

function renderYear(group) {
	const id = `year-${group.year || 'undated'}`;
	return `    <section class="year" aria-labelledby="${id}">
      <h2 id="${id}">${escapeHtml(group.year || 'Undated')}</h2>
      <ul class="talks">
${group.talks.map(renderTalk).join('\n')}
      </ul>
    </section>`;
}

const body =
	years.length === 0
		? '    <p class="empty">No public decks yet. Create one with <code>npm run new -- 2026-09-my-talk</code>, then delete its <code>.no-homepage</code> file.</p>'
		: years.map(renderYear).join('\n');

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
      --line: rgba(28, 25, 23, 0.14);
      --accent: #b5341c;  /* rubric, links on hover only */
      --year: 7rem;
      --gap: 2.5rem;
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
      max-width: 1080px;
      margin: 0 auto;
      padding: 5.5rem 2.5rem 7rem;
    }

    .masthead {
      margin: 0 0 4.5rem calc(var(--year) + var(--gap));
    }

    .masthead h1 {
      margin: 0;
      font-family: 'Alegreya', Georgia, serif;
      font-size: 3.25rem;
      font-weight: 600;
      line-height: 1.05;
    }

    .masthead p {
      margin: 0.85rem 0 0;
      color: var(--soft);
    }

    .year {
      display: grid;
      grid-template-columns: var(--year) 1fr;
      column-gap: var(--gap);
    }

    .year + .year {
      margin-top: 5rem;
    }

    .year h2 {
      position: sticky;
      top: 1.5rem;
      align-self: start;
      margin: 0;
      font-family: 'Alegreya', Georgia, serif;
      font-size: 1.75rem;
      font-weight: 500;
      line-height: 1.2;
      color: var(--muted);
    }

    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .talks {
      display: grid;
      gap: 4rem;
    }

    .talk {
      display: grid;
      grid-template-columns: minmax(0, 18rem) minmax(0, 1fr);
      column-gap: var(--gap);
      align-items: start;
    }

    .talk--no-cover .talk-text {
      grid-column: 2;
    }

    .talk-cover {
      display: block;
    }

    .talk-cover img {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 4 / 3;
      object-fit: cover;
      border: 1px solid var(--line);
    }

    .talk-title {
      margin: -0.2rem 0 0;
      font-family: 'Alegreya', Georgia, serif;
      font-size: 1.9rem;
      font-weight: 500;
      line-height: 1.15;
      text-wrap: balance;
    }

    .talk-title a {
      color: var(--text);
      text-decoration: none;
    }

    .talk-subtitle {
      margin: 0.4rem 0 0;
      font-size: 1.1rem;
      color: var(--soft);
      text-wrap: pretty;
    }

    .talk-deliveries {
      display: grid;
      gap: 0.8rem;
      margin-top: 1.25rem;
    }

    .talk-deliveries a {
      color: var(--soft);
      text-decoration: underline;
      text-decoration-color: var(--line);
      text-decoration-thickness: 1px;
      text-underline-offset: 0.22em;
    }

    .talk-when {
      display: block;
      color: var(--muted);
    }

    .talk-title a:hover,
    .talk-deliveries a:hover,
    a:focus-visible {
      color: var(--accent);
      text-decoration: underline;
      text-decoration-color: currentColor;
      text-decoration-thickness: 1px;
      text-underline-offset: 0.2em;
    }

    a:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 3px;
    }

    .empty {
      color: var(--muted);
    }

    code {
      font-family: ui-monospace, monospace;
      font-size: 0.9em;
    }

    @media (max-width: 860px) {
      :root { --year: 0rem; --gap: 1.5rem; }
      main { padding: 3.5rem 1.25rem 5rem; }
      .masthead { margin: 0 0 3rem; }
      .masthead h1 { font-size: 2.5rem; }
      .year { display: block; }
      .year h2 { position: static; margin-bottom: 1.5rem; }
      .talks { gap: 3rem; }
      .talk { grid-template-columns: minmax(0, 1fr); row-gap: 1.1rem; }
      .talk--no-cover .talk-text { grid-column: 1; }
      .talk-cover img { aspect-ratio: 16 / 9; }
      .talk-title { margin-top: 0; font-size: 1.5rem; }
      .talk-subtitle { font-size: 1rem; }
      .talk-deliveries { margin-top: 0.8rem; }
    }
  </style>
</head>
<body>
  <main>
    <header class="masthead">
      <h1>Slidedecks</h1>
      <p>Oh, hello, you found my secret stash of slidedecks! ;-)</p>
    </header>
${body}
  </main>
</body>
</html>
`;

writeFileSync(indexPath, html);
console.log(`Generated homepage with ${talks.length} talk(s) from ${decks.length} deck(s).`);

function escapeHtml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}
