// Parses content/*.md (the authored speaker notes) into plain data.
//
// Format, one block per slide:
//   ## 27 Picking the AI text          slide number (or a range, 63-67) and the page title
//   title: Short page title            optional: overrides the heading as the page title
//   deck: text                         optional: the deck's own title or first words, used only to detect stale content
//   sub: line under the title          optional
//   clicks: 5                          the real number of clicks; the build checks it against the deck
//   cue: ==cue phrase==                strip of cue phrases; "cue 2:" attaches the cue to click 2
//   bridge: sentence                   bridge into the next slide
//   when: sentence                     backups only: when to reach for it
//   arrival:                           bullets said on arrival ("What it shows" on backups)
//   - bullet
//   click 1:                           bullets said after click 1, and so on
//   - bullet
// In text: ==yellow== (key phrase), __lavender__ (secondary), *italic*.
// A bullet starting with ">> " is a stage direction (grey italics); "?? " is background if asked (grey).
// Lines starting with // are comments.
import fs from 'node:fs';
import path from 'node:path';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function inline(text) {
	let t = esc(text);
	t = t.replace(/==(.+?)==/g, '<mark class="y">$1</mark>');
	t = t.replace(/__(.+?)__/g, '<span class="u">$1</span>');
	t = t.replace(/(^|[^\w*])\*(?!\s)(.+?)\*(?!\w)/g, '$1<em>$2</em>');
	return t;
}
export const plain = (text) => text.replace(/==|__/g, '').replace(/\*/g, '');

export function compileContent(dir) {
	const files = fs
		.readdirSync(dir)
		.filter((f) => f.endsWith('.md'))
		.sort();
	const slides = [];
	const problems = [];
	let cur = null;
	let block = null;
	for (const f of files) {
		const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
		lines.forEach((raw, i) => {
			const where = `${f}:${i + 1}`;
			const line = raw.replace(/\s+$/, '');
			if (!line.trim() || line.startsWith('//')) return;
			let m;
			if ((m = line.match(/^##\s+(\d+)(?:-(\d+))?\s+(.*)$/))) {
				cur = {
					n: +m[1],
					nTo: m[2] ? +m[2] : +m[1],
					heading: m[3].trim(),
					title: null,
					deck: null,
					sub: null,
					clicks: null,
					cues: [],
					bridge: null,
					when: null,
					blocks: {},
					file: f,
				};
				slides.push(cur);
				block = null;
				return;
			}
			if (!cur) {
				problems.push(`${where}: text before the first slide heading`);
				return;
			}
			if ((m = line.match(/^(arrival|click\s+(\d+)):\s*$/))) {
				block = m[1] === 'arrival' ? 0 : +m[2];
				if (cur.blocks[block]) problems.push(`${where}: duplicate block ${m[1]} on slide ${cur.n}`);
				cur.blocks[block] = cur.blocks[block] || [];
				return;
			}
			if ((m = line.match(/^- (.*)$/))) {
				if (block === null) {
					problems.push(`${where}: bullet outside arrival or click block`);
					return;
				}
				let text = m[1];
				let kind = 'say';
				if (text.startsWith('>> ')) {
					kind = 'stage';
					text = text.slice(3);
				} else if (text.startsWith('?? ')) {
					kind = 'ask';
					text = text.slice(3);
				}
				cur.blocks[block].push({ kind, html: inline(text), raw: text });
				return;
			}
			if ((m = line.match(/^(title|deck|sub|clicks|bridge|when|cue(?:\s+(\d+))?):\s*(.*)$/))) {
				const key = m[1].startsWith('cue') ? 'cue' : m[1];
				const val = m[3].trim();
				block = null;
				if (key === 'cue') cur.cues.push({ click: m[2] ? +m[2] : 0, html: inline(val.replace(/==/g, '')), raw: plain(val) });
				else if (key === 'clicks') cur.clicks = val === '' ? null : +val;
				else if (key === 'bridge' || key === 'when' || key === 'sub') cur[key + 'Html'] = inline(val), (cur[key] = val);
				else cur[key] = val;
				return;
			}
			problems.push(`${where}: cannot read line: ${line.slice(0, 60)}`);
		});
	}
	for (const s of slides) {
		s.pageTitle = s.title || s.heading;
		s.cues.sort((a, b) => a.click - b.click);
	}
	return { slides, problems };
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const here = path.dirname(new URL(import.meta.url).pathname);
	const { slides, problems } = compileContent(path.join(here, 'content'));
	console.log(slides.length, 'slide entries;', problems.length ? problems.join('\n') : 'no problems');
}
