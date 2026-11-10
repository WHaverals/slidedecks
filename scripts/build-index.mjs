import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const decksDir = join(root, 'decks');
const indexPath = join(root, 'index.html');

// Per-deck homepage settings (text overrides, dates, covers); see the "_about" note in the file.
const settingsPath = join(root, 'scripts', 'homepage.json');
const SETTINGS = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, 'utf8')) : {};

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

// strip comments and tags (a line break counts as a space), decode entities, collapse space
function clean(value) {
	return decodeEntities(
		value
			.replace(/<!--[\s\S]*?-->/g, '')
			.replace(/<br\s*\/?>/gi, ' ')
			.replace(/<[^>]+>/g, '')
	)
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
	const pick = (re, group = 1) => {
		const m = html.match(re);
		return m ? clean(m[group]) || null : null;
	};
	const title =
		pick(/class="title-slide__presentation"[^>]*>([\s\S]*?)<\/h1>/i) ?? pick(/<title>([\s\S]*?)<\/title>/i);
	const subtitle = pick(/<(\w+)[^>]*class="title-slide__subtitle"[^>]*>([\s\S]*?)<\/\1>/i, 2);
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

function isDir(path) {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

function listDecks() {
	if (!isDir(decksDir)) return [];
	return readdirSync(decksDir)
		.filter((name) => {
			const deckPath = join(decksDir, name);
			if (!isDir(deckPath) || !existsSync(join(deckPath, 'index.html'))) return false;
			// Decks with .no-homepage stay deployable but off the public index.
			return !existsSync(join(deckPath, '.no-homepage'));
		})
		.map((name) => {
			const fromSlide = getDeckMeta(join(decksDir, name));
			const override = SETTINGS[name] ?? {};
			const date = typeof override.date === 'string' ? override.date : null;
			const year = (date ?? name).match(/^\d{4}/)?.[0] ?? '';
			const deck = {
				name,
				sortKey: date ?? name,
				year,
				title: field(override, fromSlide, 'title') || name,
				subtitle: field(override, fromSlide, 'subtitle'),
				event: field(override, fromSlide, 'event'),
				meta: field(override, fromSlide, 'meta'),
				url: `decks/${encodeURIComponent(name)}/`,
				cover: existsSync(join(root, 'assets', 'home', `${name}.jpg`))
					? `assets/home/${encodeURIComponent(name)}.jpg`
					: null,
			};
			if (deck.title === 'Your Talk Title' || deck.event === 'Conference Name') {
				console.warn(`${name}: title slide still has the template placeholders`);
			}
			return deck;
		})
		// newest first; undated folders (no leading year) last
		.sort((a, b) => (!a.year - !b.year) || b.sortKey.localeCompare(a.sortKey) || b.name.localeCompare(a.name));
}

for (const key of Object.keys(SETTINGS)) {
	if (!key.startsWith('_') && !existsSync(join(decksDir, key, 'index.html'))) {
		console.warn(`homepage.json: no deck folder named ${key}`);
	}
}

// One entry per talk: decks with the same title and subtitle are the same talk given more than once.
// A talk sits under the year of its most recent delivery, in the order of that delivery.
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

// Each delivery links to its own deck. A single delivery with no event shows its place and date as
// plain text, since the title already links to the deck.
function renderDelivery(deck, talk) {
	const when = deck.meta ? `<span class="talk-when">${escapeHtml(deck.meta)}</span>` : '';
	if (deck.event) {
		return `            <li><a href="${escapeHtml(deck.url)}">${escapeHtml(deck.event)}</a>${when}</li>`;
	}
	if (talk.deliveries.length > 1) {
		const label = deck.meta ?? deck.name;
		return `            <li><a class="talk-when" href="${escapeHtml(deck.url)}">${escapeHtml(label)}</a></li>`;
	}
	return when ? `            <li>${when}</li>` : '';
}

let coverCount = 0;
function renderTalk(talk) {
	// the first cover is above the fold at every width, so it is not lazy-loaded
	const loading = coverCount++ === 0 ? '' : ' loading="lazy"';
	const cover = talk.cover
		? `        <a class="talk-cover" href="${escapeHtml(talk.url)}" tabindex="-1" aria-hidden="true"><img src="${escapeHtml(talk.cover)}" alt="" width="960" height="720"${loading} /></a>\n`
		: '';
	if (!talk.cover) coverCount--;
	const subtitle = talk.subtitle ? `\n          <p class="talk-subtitle">${escapeHtml(talk.subtitle)}</p>` : '';
	const deliveries = talk.deliveries.map((d) => renderDelivery(d, talk)).filter(Boolean);
	const list = deliveries.length
		? `\n          <ul class="talk-deliveries">\n${deliveries.join('\n')}\n          </ul>`
		: '';
	return `      <li class="talk${talk.cover ? '' : ' talk--no-cover'}">
${cover}        <div class="talk-text">
          <h3 class="talk-title"><a href="${escapeHtml(talk.url)}">${escapeHtml(talk.title)}</a></h3>${subtitle}${list}
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
      --cover: 26rem;
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
      max-width: 1240px;
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
      grid-template-columns: var(--year) minmax(0, 1fr);
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
      gap: 4.5rem;
    }

    .talk {
      display: grid;
      grid-template-columns: minmax(0, var(--cover)) minmax(0, 1fr);
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
      margin: -0.25rem 0 0;
      font-family: 'Alegreya', Georgia, serif;
      font-size: 2.1rem;
      font-weight: 500;
      line-height: 1.12;
      text-wrap: balance;
    }

    .talk-title a {
      color: var(--text);
      text-decoration: none;
    }

    .talk-subtitle {
      margin: 0.45rem 0 0;
      font-size: 1.25rem;
      line-height: 1.35;
      color: var(--text);
      text-wrap: pretty;
    }

    .talk-deliveries {
      display: grid;
      gap: 0.85rem;
      margin-top: 1.5rem;
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

    .talk-deliveries a.talk-when {
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

    /* Narrower screens: the year moves above the list; cover and text stay side by side. */
    @media (max-width: 1060px) {
      :root { --year: 0rem; --gap: 2rem; --cover: 1fr; }
      main { padding: 4rem 2rem 6rem; }
      .masthead { margin: 0 0 3.5rem; }
      .year { display: block; }
      .year h2 { position: static; margin-bottom: 2rem; }
      .talk { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
      .talk-title { font-size: 1.75rem; }
      .talk-subtitle { font-size: 1.15rem; }
    }

    /* Phones: cover above the text. */
    @media (max-width: 600px) {
      :root { --gap: 1.25rem; }
      main { padding: 3rem 1.25rem 4.5rem; }
      .masthead { margin-bottom: 2.75rem; }
      .masthead h1 { font-size: 2.5rem; }
      .talks { gap: 3.25rem; }
      .talk { grid-template-columns: minmax(0, 1fr); row-gap: 1.1rem; }
      .talk--no-cover .talk-text { grid-column: 1; }
      .talk-title { margin-top: 0; font-size: 1.55rem; }
      .talk-subtitle { font-size: 1.05rem; }
      .talk-deliveries { margin-top: 1rem; }
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
