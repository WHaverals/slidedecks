/* Browser-side layout for the speaker notes. Reads window.BOOK (written by build.mjs), builds one
   .page per notes page, paginates long slides by bullet, and fills every page number afterwards. */
(function () {
	const B = window.BOOK;
	const S = B.slides;
	const root = document.getElementById('root');
	const issues = [];
	const droppedRepeat = [];
	const total = S.length;

	const el = (tag, cls, html) => {
		const e = document.createElement(tag);
		if (cls) e.className = cls;
		if (html != null) e.innerHTML = html;
		return e;
	};
	const byN = {};
	S.forEach((s) => (byN[s.n] = s));
	const at = (h, v) => S.find((s) => s.h === h && (s.v || 0) === (v || 0));
	const mains = S.filter((s) => !s.isBackup);
	const backups = S.filter((s) => s.isBackup && !s.isRef);
	const refs = S.filter((s) => s.isRef);
	const firstSlideOfPage = {}; // slide n -> id used by links
	const ordinal = (k) => (k === 1 ? '' : k === 2 ? ' twice' : k === 3 ? ' three times' : ` ${k} times`);
	const clicksLabel = (c) => (c === 0 ? 'no clicks' : c === 1 ? '1 click' : `${c} clicks`);
	const pgLink = (n, text) => `<a class="pg" href="#s${n}" data-slide="${n}">${text || 'p. 0'}</a>`;

	const pages = []; // all .page elements in order
	function newPage(cls) {
		const p = el('section', 'page ' + (cls || ''));
		root.appendChild(p);
		pages.push(p);
		return p;
	}

	/* ---------- front matter placeholders (filled after pagination) ---------- */
	const front = [newPage('front cover'), newPage('front'), newPage('front')];

	/* ---------- slide pages ---------- */
	const slideFirstPage = {};
	const slidePages = {}; // n -> [page elements]

	function headBlock(s) {
		const head = el('div', 'head');
		const left = el('div', 'headl');
		const sect = s.isBackup
			? el('div', 'sect bk', s.backupTag)
			: el('div', 'sect', (s.section.num ? s.section.num + ' ' : '') + s.section.label);
		left.appendChild(sect);
		left.appendChild(el('div', 'numrow', `<span class="num">${s.n}</span><span class="tot">/${total}</span>`));
		left.appendChild(el('h1', '', s.pageTitleHtml));
		if (s.subHtml) left.appendChild(el('div', 'sub', s.subHtml));
		if (s.isBackup && s.reach) left.appendChild(el('div', 'reach', s.reach));
		left.appendChild(el('div', 'clk', clicksLabel(s.clicks) + (s.clicksNote ? `, ${s.clicksNote}` : '')));
		head.appendChild(left);
		const th = el('div', 'thumb');
		if (s.thumb) th.innerHTML = `<img src="${s.thumb}" alt="" />`;
		head.appendChild(th);
		return head;
	}
	function cueStrip(s) {
		if (!s.cues.length) return null;
		const wrap = el('div', 'cues');
		s.cues.forEach((c) => {
			const row = el('div', 'cue');
			const gut = el('div', 'gut', c.click ? `<span class="clickc">${c.click}</span>` : '');
			row.appendChild(gut);
			row.appendChild(el('div', 'tx', `<span>${c.html}</span>`));
			wrap.appendChild(row);
		});
		return wrap;
	}
	function contHead(s, n) {
		return el('div', 'chead', `<span class="num">${s.n}</span><span class="tot">/${total}</span><span class="t">${s.pageTitleHtml}, continued</span>`);
	}

	function blockLabel(s, key, continued) {
		if (key === 'bridge') return { cls: 'lbl bridge', html: continued ? 'Bridge, continued' : 'Bridge' };
		if (key === 'when') return { cls: 'lbl', html: continued ? 'Reach for it, continued' : 'Reach for it' };
		if (key === 0) {
			const base = s.isBackup ? 'What it shows' : 'On arrival';
			return { cls: 'lbl', html: continued ? base + ', continued' : base };
		}
		const n = key;
		return { cls: 'lbl click', html: `<span class="clickc">${n}</span><span class="w">${continued ? 'Click, continued' : 'Click'}</span>` };
	}
	function bulletEl(b) {
		const li = el('li', b.kind);
		if (b.kind === 'stage') li.innerHTML = '[' + b.html + ']';
		else if (b.kind === 'ask') li.innerHTML = '<span class="askl">If asked:</span> ' + b.html;
		else if (b.kind === 'bridge') {
			li.className = 'bridgeli';
			li.innerHTML = b.html;
		} else if (b.kind === 'when') {
			li.className = 'whenli';
			li.innerHTML = b.html;
		} else li.innerHTML = b.html;
		return li;
	}

	function footBlock(s, repeat) {
		if (repeat === undefined) repeat = true;
		const foot = el('div', 'foot');
		const row = (k, v) => foot.appendChild(el('div', 'frow', `<div class="k">${k}</div><div class="v">${v}</div>`));
		const fbHtml = (s2) => (repeat && s2 && B.repeatBridgeInNext && s2.bridgeHtml ? `<span class="fb">${s2.bridgeHtml}</span>` : '');
		const entry = (t) => `<b>${t.n}</b> ${t.pageTitleHtml} ${pgLink(t.n)}`;
		if (!s.isBackup) {
			const below = S.filter((x) => x.h === s.h && (x.v || 0) > 0);
			const nextMain = mains[mains.indexOf(s) + 1];
			if (below.length) {
				const shown = below.length > 3 ? 2 : below.length;
				below.slice(0, shown).forEach((b, i) => {
					row(i === 0 ? 'Down' : 'Down' + ordinal(i + 1), `${entry(b)}<span class="only">, only if asked</span>`);
				});
				if (below.length > shown) {
					const rest = below.slice(shown);
					row(
						'More',
						`<b>${rest[0].n}</b> to <b>${rest[rest.length - 1].n}</b>, ${rest.length} more backups, listed ${pgLink('idx', 'p. 0')}<span class="only">, only if asked</span>`,
					);
				}
				if (nextMain) row('Right', `${entry(nextMain)}<span class="only">, skipping the stack (the clicker goes Down)</span>${fbHtml(s)}`);
			} else if (nextMain) {
				row('Next', `${entry(nextMain)}${fbHtml(s)}`);
			} else {
				row('For questions', `Backups ${pgLink('idx')}`);
				row('', `The reference slides ${pgLink('refs')}`);
			}
		} else {
			const top = at(s.h, 0);
			const down = at(s.h, (s.v || 0) + 1);
			const up = (s.v || 0) > 0 ? at(s.h, (s.v || 0) - 1) : null;
			const right = at(s.h + 1, 0);
			if (down) row('Down', `${entry(down)}`);
			if (right) {
				const back = right.isBackup ? '' : ', back on the main line';
				row('Right', `${entry(right)}<span class="only">${back}</span>`);
			}
			if (up) row('Up', `${entry(up)}`);
			if (!down && !right && !up) row('Right', 'end of the deck');
		}
		return foot;
	}

	function pageOverflows(page) {
		const body = page.querySelector('.body');
		return body.scrollHeight > body.clientHeight + 1;
	}

	function buildSlide(s) {
		// every bullet is one unit; a page break only falls between bullets
		const units = [];
		Object.keys(s.blocks)
			.map(Number)
			.sort((x, y) => x - y)
			.forEach((k) => s.blocks[k].forEach((b) => units.push({ key: k, b })));
		if (!s.isBackup && s.bridgeHtml) units.push({ key: 'bridge', b: { kind: 'bridge', html: s.bridgeHtml } });
		if (s.isBackup && s.whenHtml) units.push({ key: 'when', b: { kind: 'when', html: s.whenHtml } });

		const mine = [];
		slidePages[s.n] = mine;
		let page = null;
		let body = null;
		let curBlk = null;
		let curKey = null;
		const startPage = (isFirst) => {
			page = newPage('slide' + (s.isBackup ? ' backup' : ''));
			mine.push(page);
			if (isFirst) {
				page.id = 's' + s.n;
				slideFirstPage[s.n] = page;
				page.appendChild(headBlock(s));
				page.appendChild(el('hr', 'head-rule'));
				const cs = cueStrip(s);
				if (cs) page.appendChild(cs);
			} else {
				page.appendChild(contHead(s));
			}
			body = el('div', 'body');
			page.appendChild(body);
			page.appendChild(el('div', 'cont', 'Continues on the next page'));
			page.appendChild(el('div', 'pfoot'));
			curBlk = null;
			curKey = null;
		};
		const place = (u, continued) => {
			if (!curBlk || curKey !== u.key) {
				curKey = u.key;
				curBlk = el('div', 'blk');
				const lab = blockLabel(s, u.key, continued);
				curBlk.appendChild(el('div', lab.cls, lab.html));
				curBlk.appendChild(el('ul', 'say'));
				body.appendChild(curBlk);
			}
			curBlk.querySelector('ul').appendChild(bulletEl(u.b));
		};
		// take the last bullet off the current page; returns true when its block still has bullets here
		const popLast = () => {
			const blks = body.querySelectorAll('.blk');
			const lb = blks[blks.length - 1];
			const ul = lb.querySelector('ul');
			ul.removeChild(ul.lastElementChild);
			const stays = ul.children.length > 0;
			if (!stays) lb.remove();
			return stays;
		};
		startPage(true);
		units.forEach((u) => {
			place(u, false);
			if (pageOverflows(page)) {
				if (body.querySelectorAll('li').length <= 1) issues.push(`slide ${s.n}: one bullet is taller than a page`);
				const stays = popLast();
				startPage(false);
				place(u, stays);
				if (pageOverflows(page)) issues.push(`slide ${s.n}: a bullet does not fit on a fresh page`);
			}
		});
		// the real foot goes on the last page; if it does not fit, the last bullet moves down with it
		let foot = footBlock(s);
		page.replaceChild(foot, page.querySelector('.cont'));
		if (pageOverflows(page) && B.repeatBridgeInNext) {
			// the repeated bridge line in the Next row is the first thing to give way
			const lean = footBlock(s, false);
			page.replaceChild(lean, foot);
			if (pageOverflows(page)) {
				page.replaceChild(foot, lean);
			} else {
				foot = lean;
				droppedRepeat.push(s.n);
			}
		}
		if (pageOverflows(page)) {
			if (body.querySelectorAll('li').length > 1) {
				const last = units[units.length - 1];
				page.replaceChild(el('div', 'cont', 'Continues on the next page'), foot);
				const stays = popLast();
				startPage(false);
				place(last, stays);
				page.replaceChild(footBlock(s), page.querySelector('.cont'));
			}
			if (pageOverflows(page)) issues.push(`slide ${s.n}: the foot does not fit on the last page`);
		}
	}

	/* main line */
	mains.forEach(buildSlide);

	/* ---------- backups index ---------- */
	const idxPages = [];
	function buildIndex() {
		const rows = backups.map((b) => ({ s: b }));
		let page = null;
		let bodyEl = null;
		const start = (first) => {
			page = newPage('list idx');
			idxPages.push(page);
			if (first) {
				page.id = 'sidx';
				page.appendChild(el('h1', 'page-title', 'Backups for questions'));
				page.appendChild(
					el(
						'p',
						'lead',
						`Each sits in a stack below its main slide: press Down until you reach it. From any of them, Right goes back to the main line. Slides ${B.afterClose.firstSlide} to ${total} come after the closing slide: press Right from slide ${mains[mains.length - 1].n}.`,
					),
				);
			} else {
				page.appendChild(el('div', 'chead', `<span class="t">Backups for questions, continued</span>`));
			}
			page.appendChild(el('div', 'idx-head', '<div>Slide</div><div>Backup</div><div class="c">Page</div>'));
			bodyEl = el('div', 'body');
			page.appendChild(bodyEl);
			page.appendChild(el('div', 'pfoot'));
		};
		start(true);
		rows.forEach(({ s }) => {
			const r = el(
				'div',
				'idx-row',
				`<div class="a">${s.n}</div><div class="b">${s.pageTitleHtml}<small>${s.reachLong}</small></div><div class="c">${pgLink(s.n)}</div>`,
			);
			bodyEl.appendChild(r);
			if (bodyEl.scrollHeight > bodyEl.clientHeight + 1) {
				bodyEl.removeChild(r);
				start(false);
				bodyEl.appendChild(r);
			}
		});
		// the reference slides in one row at the end
		if (refs.length) {
			const r = el(
				'div',
				'idx-row',
				`<div class="a">${refs[0].n} to ${refs[refs.length - 1].n}</div><div class="b">The reference slides<small>Right three times from slide 59, then Down through the five. ${refs.map((x) => x.deckTitle).join('; ')}.</small></div><div class="c">${pgLink('refs')}</div>`,
			);
			bodyEl.appendChild(r);
			if (bodyEl.scrollHeight > bodyEl.clientHeight + 1) {
				bodyEl.removeChild(r);
				start(false);
				bodyEl.appendChild(r);
			}
		}
	}
	buildIndex();

	/* ---------- backup pages ---------- */
	backups.forEach(buildSlide);

	/* ---------- reference slides page ---------- */
	let refsPage = null;
	if (refs.length) {
		refsPage = newPage('list refs');
		refsPage.id = 'srefs';
		refsPage.appendChild(el('div', 'sect bk', 'Appendix, after the closing slide'));
		refsPage.appendChild(el('h1', 'page-title', 'The reference slides'));
		const c = B.refsContent;
		refsPage.appendChild(el('p', 'lead', c ? c.lead : ''));
		refsPage.appendChild(el('div', 'idx-head', '<div>Slide</div><div>Title</div><div class="c">Reach</div>'));
		const bodyEl = el('div', 'body');
		refsPage.appendChild(bodyEl);
		refs.forEach((r, i) => {
			bodyEl.appendChild(
				el(
					'div',
					'idx-row',
					`<div class="a">${r.n}</div><div class="b">${r.deckTitle}</div><div class="c">${i === 0 ? 'Right ' + (r.h - mains[mains.length - 1].h) + ' times' : 'Down'}</div>`,
				),
			);
		});
		if (c && c.bullets) {
			const ul = el('ul', 'say');
			ul.style.marginTop = '16px';
			c.bullets.forEach((b) => ul.appendChild(bulletEl(b)));
			bodyEl.appendChild(ul);
		}
		refsPage.appendChild(el('div', 'pfoot'));
		if (bodyEl.scrollHeight > bodyEl.clientHeight + 1) issues.push('reference page overflows');
	}

	/* ---------- page numbers ---------- */
	const pageNo = (p) => pages.indexOf(p) + 1;
	const pn = {};
	S.forEach((s) => {
		if (s.isRef) pn[s.n] = refsPage ? pageNo(refsPage) : 0;
		else if (slideFirstPage[s.n]) pn[s.n] = pageNo(slideFirstPage[s.n]);
	});
	pn.idx = pageNo(idxPages[0]);
	pn.refs = refsPage ? pageNo(refsPage) : 0;
	/* ---------- front matter ---------- */
	const sectionOf = (s) => B.sections.find((x) => s.n >= x.slides[0] && s.n <= x.slides[1]);
	// page 1: run sheet
	{
		const p = front[0];
		p.appendChild(el('h1', '', B.title));
		p.appendChild(el('div', 'subtitle', B.subtitle));
		p.appendChild(el('div', 'authors', B.authors));
		p.appendChild(el('h2', 'sec', 'Run sheet'));
		let rows = '';
		B.sections.forEach((sec) => {
			const mainIn = mains.filter((s) => s.n >= sec.slides[0] && s.n <= sec.slides[1]);
			const bk = backups.filter((s) => s.n >= sec.slides[0] && s.n <= sec.slides[1]);
			const first = mainIn[0];
			const sl = sec.slides[0] === sec.slides[1] ? `${sec.slides[0]}` : `${sec.slides[0]}–${sec.slides[1]}`;
			const bkNote = bk.length ? `<small>backups below: ${compressRange(bk.map((x) => x.n))}</small>` : '';
			rows += `<tr><td class="n">${sec.num}</td><td class="sec">${sec.label}${bkNote}</td><td class="sl">${sl}</td><td class="pg">${first ? pgLink(first.n) : ''}</td><td class="who"></td><td class="time"></td></tr>`;
		});
		rows += `<tr><td class="n"></td><td class="sec">Backups for questions<small>slides ${compressRange(backups.map((x) => x.n))}</small></td><td class="sl"></td><td class="pg">${pgLink('idx')}</td><td class="who"></td><td class="time"></td></tr>`;
		if (refs.length) rows += `<tr><td class="n"></td><td class="sec">Appendix: the reference slides</td><td class="sl">${refs[0].n}–${refs[refs.length - 1].n}</td><td class="pg">${pgLink('refs')}</td><td class="who"></td><td class="time"></td></tr>`;
		p.appendChild(
			el(
				'table',
				'run',
				`<thead><tr><th></th><th>Section</th><th>Slides</th><th>Page</th><th>Who</th><th>Time</th></tr></thead><tbody>${rows}</tbody>`,
			),
		);
		p.appendChild(el('div', 'pfoot'));
	}
	// page 2: grid and keys
	{
		const p = front[1];
		p.appendChild(el('h2', 'sec', 'Slide to page'));
		p.firstChild.style.marginTop = '0';
		p.appendChild(el('p', 'lead', 'Slide number in bold, page beside it. Grey: a backup for questions (at the back). Green outline: a section divider.'));
		const g = el('div', 'grid');
		S.forEach((s) => {
			const isDiv = !s.isBackup && /section-slide/.test(s.cls);
			const a = el('a', (s.isBackup ? 'bk ' : '') + (isDiv ? 'dv' : ''), `<b>${s.n}</b><span style="border:0;padding:0;background:none;display:inline">${pn[s.n]}</span>`);
			a.setAttribute('href', '#' + (s.isRef ? 'srefs' : 's' + s.n));
			g.appendChild(a);
		});
		p.appendChild(g);
		p.appendChild(el('h2', 'sec', 'Keys'));
		p.appendChild(el('dl', 'keys', B.keys.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')));
		p.appendChild(el('div', 'pfoot'));
	}
	// page 3: legend
	{
		const p = front[2];
		p.appendChild(el('h2', 'sec', 'How each page reads'));
		p.firstChild.style.marginTop = '0';
		const L = [
			['<span class="numrow"><span class="num" style="font-size:30px">27</span><span class="tot">/' + total + '</span></span>', 'The slide number, as the slide counter shows it (current / ' + total + '). The picture is the slide after its last click.'],
			['<mark class="y">Yellow</mark>', 'Cue phrases, the lines to say. The strip under the header repeats them in large type; a number in front says at which click.'],
			['<span class="u">Lavender</span>', 'A second-level phrase inside a bullet. Yellow inside a bullet marks the key phrase of that bullet.'],
			['<span class="clickc">1</span> <b>Click</b>', 'What to say after each click. The header gives the slide’s real number of clicks, counted from the deck itself.'],
			['<i style="color:var(--grey)">[Grey italics]</i>', 'Stage directions, only where the deck’s notes carry them.'],
			['<span style="color:var(--grey)"><b style="font-size:13px">If asked:</b> grey</span>', 'Background from the deck’s notes for questions. Not part of the talk.'],
			['<b style="color:var(--accent)">Bridge</b>', 'One sentence into the next slide. It is repeated, in grey, on the Next line at the foot.'],
			['<span class="sect bk" style="margin:0"><b>Backup</b></span>', 'A slide for questions, collected at the back. The header says which main slide leads Down into it.'],
			['<b>Next</b>', 'The foot of each page says where Right and Down go, with the page number. Page numbers and the grid are links.'],
			['<span style="color:var(--grey)">Who, Time</span>', 'The empty columns of the run sheet are for pen notes.'],
		];
		const grid = el('div', 'legend');
		L.forEach(([l, d]) => {
			grid.appendChild(el('div', 'l', l));
			grid.appendChild(el('p', '', d));
		});
		p.appendChild(grid);
		p.appendChild(el('div', 'pfoot'));
	}

	function compressRange(arr) {
		arr = arr.slice().sort((a, b) => a - b);
		const out = [];
		let i = 0;
		while (i < arr.length) {
			let j = i;
			while (j + 1 < arr.length && arr[j + 1] === arr[j] + 1) j++;
			out.push(j === i ? `${arr[i]}` : j === i + 1 ? `${arr[i]}, ${arr[j]}` : `${arr[i]} to ${arr[j]}`);
			i = j + 1;
		}
		return out.join(', ');
	}

	document.querySelectorAll('a.pg').forEach((a) => {
		const key = a.dataset.slide;
		a.setAttribute('href', '#' + (key === 'idx' ? 'sidx' : key === 'refs' ? 'srefs' : 's' + key));
		a.textContent = 'p. ' + (pn[key] || '?');
	});

	/* ---------- page footers ---------- */
	const N = pages.length;
	pages.forEach((p, i) => {
		const f = p.querySelector('.pfoot');
		if (f) f.innerHTML = `<span>${B.footer}</span><span><b>page ${i + 1} of ${N}</b></span>`;
	});

	/* ---------- checks ---------- */
	const overflow = [];
	pages.forEach((p, i) => {
		const body = p.querySelector('.body');
		if (body && body.scrollHeight > body.clientHeight + 1) overflow.push(i + 1);
		else if (!body && p.scrollHeight > p.clientHeight + 1) overflow.push(i + 1);
	});
	const spill = {};
	Object.entries(slidePages).forEach(([n, ps]) => {
		if (ps.length < 2) return;
		const b = ps[ps.length - 1].querySelector('.body');
		const last = b.lastElementChild;
		spill[n] = last ? Math.round(last.getBoundingClientRect().bottom - b.getBoundingClientRect().top) : 0;
	});
	const wide = [];
	pages.forEach((p, i) => {
		const pr = p.getBoundingClientRect();
		p.querySelectorAll('*').forEach((e) => {
			const r = e.getBoundingClientRect();
			if (r.width && (r.right > pr.right - 30 || r.left < pr.left + 30)) wide.push(`${i + 1}:${e.tagName.toLowerCase()}.${e.className}`);
		});
		const h1 = p.querySelector('.head h1');
		if (h1) {
			const lines = Math.round(h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight));
			if (lines > 2) wide.push(`${i + 1}: title on ${lines} lines`);
		}
		const hd = p.querySelector('.head');
		if (hd && hd.scrollHeight > hd.clientHeight + 40) wide.push(`${i + 1}: header taller than planned`);
	});
	window.__result = { droppedRepeat, wide: wide.slice(0, 30), spill, pages: N, issues, overflow, pn, slidePages: Object.fromEntries(Object.entries(slidePages).map(([k, v]) => [k, v.length])) };
	window.__done = true;
})();
