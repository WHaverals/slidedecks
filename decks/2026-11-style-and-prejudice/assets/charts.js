'use strict';

/**
 * Deck charts for Style and Prejudice, drawn with d3 and driven by Reveal
 * fragments (rates, styles) or slide entry (bias, forest, criteria).
 * Numbers are transcribed from the manuscript and its SI; CIs are 95%.
 *   rates, bias, forest: manuscript Figs. 2 and 3; study2: manuscript Fig. 5
 *   styles: SI Table S17 (attribution bias per style, percentage points)
 *   criteria: SI Table S12
 */
(function () {
	const DATA = {
		rates: {
			conditions: ['Blind', 'Correct labels', 'Swapped labels'],
			human: [
				{ v: 55.3, lo: 52.1, hi: 58.5 },
				{ v: 47.8, lo: 44.6, hi: 51.0 },
				{ v: 61.5, lo: 58.4, hi: 64.6 },
			],
			ai: [
				{ v: 49.4, lo: 46.5, hi: 52.3 },
				{ v: 29.8, lo: 27.1, hi: 32.4 },
				{ v: 64.1, lo: 61.3, hi: 66.8 },
			],
		},
		study2: [
			{ cond: 'Blind', v: 54.5, lo: 53.2, hi: 55.8 },
			{ cond: 'Correct labels', v: 39.9, lo: 38.6, hi: 41.1 },
			{ cond: 'Swapped labels', v: 65.7, lo: 64.5, hi: 66.9 },
		],
		bias: [
			{ who: 'Human evaluators', v: 13.7, calc: '61.5 − 47.8', kind: 'human' },
			{ who: 'AI evaluators', v: 34.3, calc: '64.1 − 29.8', kind: 'ai' },
		],
		forest: [
			{ model: 'GPT-3.5 Turbo', h: 1.5 },
			{ model: 'Claude Sonnet 4', h: 1.08 },
			{ model: 'Qwen 2.5 72B', h: 1.0 },
			{ model: 'Mistral Medium', h: 0.85 },
			{ model: 'Gemini 2.5 Flash', h: 0.67 },
			{ model: 'GPT-4o Mini', h: 0.65 },
			{ model: 'Command R', h: 0.64 },
			{ model: 'DeepSeek R1', h: 0.61 },
			{ model: 'DeepSeek Chat v3', h: 0.59 },
			{ model: 'Llama 3.3 70B', h: 0.54 },
			{ model: 'Mistral Nemo', h: 0.52 },
			{ model: 'Claude 3.5 Haiku', h: 0.47 },
			{ model: 'Llama 4 Maverick', h: 0.4 },
		],
		forestCi: 0.21,
		humanBaseline: 0.28,
		humanCi: [0.19, 0.37],
		criteria: [
			{ code: 'Lexical and phonetic cues', v: 31.4 },
			{ code: 'Constraint and structure', v: 30.1 },
			{ code: 'Genre and style fit', v: 28.6 },
			{ code: 'Voice and naturalness', v: 25.4 },
			{ code: 'Novelty versus convention', v: 13.1 },
			{ code: 'Clarity and coherence', v: 9.0 },
		],
		// [style, humans, AI evaluators], attribution bias in percentage points
		styles: [
			['Lipogram', -20.5, 34.9],
			['Cockney', 11.6, 66.7],
			['Science Fiction', -6.7, 38.5],
			['Abusive', 21.5, 66.5],
			['Retrograde', 5.7, 42.4],
			['Synchysis', 14.9, 48.7],
			['Spoonerisms', 11.2, 43.6],
			['Mathematical', 22.0, 53.8],
			['Apocope', 22.0, 53.2],
			['Noble', 22.5, 53.2],
			['For ze Frrensh', 14.1, 43.6],
			['Alexandrines', 5.2, 33.3],
			['Rhyming slang', 28.9, 55.3],
			['Animism', 24.1, 48.7],
			['Free Verse', -13.8, 10.3],
			['Logical Analysis', -3.9, 17.9],
			['Dream', 19.8, 41.0],
			['Dog Latin', 24.4, 41.0],
			['The Rainbow', 31.2, 46.2],
			['Tactile', 32.9, 47.6],
			['Haiku', 9.4, 18.0],
			['Telegraphic', 10.0, 18.0],
			['Sonnet', 11.3, 15.4],
			['Philosophic', 11.9, 15.4],
			['Hesitation', -2.7, -0.3],
			['Onomatopoeia', 13.5, 15.3],
			['Metaphorically', 24.2, 23.1],
			['West Indian', 30.5, 28.2],
			['Exclamations', 17.3, 5.1],
			['Feminine', 20.8, 7.7],
		],
		stylesKey: [
			'Cockney',
			'Abusive',
			'Rhyming slang',
			'Tactile',
			'The Rainbow',
			'West Indian',
			'Lipogram',
			'Science Fiction',
		],
	};

	const isPrint = /print-pdf/gi.test(window.location.search);
	const noMotion =
		isPrint ||
		/nomotion/gi.test(window.location.search) ||
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	function cssVar(name, fallback) {
		const v = getComputedStyle(document.body).getPropertyValue(name).trim();
		return v || fallback;
	}

	const C = {};
	function loadColors() {
		C.human = cssVar('--sp-human', '#2e4fa3');
		C.ai = cssVar('--sp-ai', '#c25e2a');
		C.ink = cssVar('--sp-ink', '#1c1917');
		C.grey = cssVar('--sp-grey', '#57534e');
		C.hair = 'rgba(28, 25, 23, 0.16)';
	}

	function dur(ms) {
		return noMotion ? 0 : ms;
	}

	// In noMotion mode attributes are applied synchronously: d3 transitions tick on
	// requestAnimationFrame, which a hidden or printing page may never run.
	function go(sel, delay, duration) {
		if (noMotion) return sel;
		return sel.transition().delay(delay || 0).duration(duration).ease(d3.easeCubicOut);
	}

	function svgIn(sel) {
		const el = document.querySelector(sel);
		if (!el) return null;
		const w = el.clientWidth;
		const h = el.clientHeight;
		const svg = d3
			.select(el)
			.append('svg')
			.attr('viewBox', `0 0 ${w} ${h}`)
			.attr('width', '100%')
			.attr('height', '100%');
		return { el, svg, w, h };
	}

	/* ---------------- rates chart (fragment beats 0-3) ---------------- */

	const rates = { built: false, beat: -1 };

	function buildRates() {
		const box = svgIn('#rates-chart');
		if (!box) return;
		const m = { top: 54, right: 118, bottom: 58, left: 80 };
		const iw = box.w - m.left - m.right;
		const ih = box.h - m.top - m.bottom;
		const g = box.svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

		const x = d3
			.scaleBand()
			.domain(DATA.rates.conditions)
			.range([0, iw])
			.paddingInner(0.3)
			.paddingOuter(0.12);
		const xi = d3.scaleBand().domain(['human', 'ai']).range([0, x.bandwidth()]).paddingInner(0.12);
		const y = d3.scaleLinear().domain([0, 75]).range([ih, 0]);

		rates.y = y;
		rates.ih = ih;

		g.append('g')
			.selectAll('line')
			.data([25, 50, 75])
			.join('line')
			.attr('x1', 0)
			.attr('x2', iw)
			.attr('y1', (d) => y(d))
			.attr('y2', (d) => y(d))
			.attr('stroke', C.hair)
			.attr('stroke-dasharray', (d) => (d === 50 ? '5 4' : null))
			.attr('stroke-width', (d) => (d === 50 ? 1.6 : 1));

		g.append('text')
			.attr('x', iw + 10)
			.attr('y', y(50) + 5)
			.attr('class', 'chart-hint')
			.text('no preference');

		const ax = g
			.append('g')
			.attr('transform', `translate(0,${ih})`)
			.call(d3.axisBottom(x).tickSize(0).tickPadding(14));
		ax.select('.domain').attr('stroke', C.hair);
		ax.selectAll('text').attr('class', 'chart-tick chart-tick--cat');

		const ay = g.append('g').call(d3.axisLeft(y).tickValues([0, 25, 50, 75]).tickSize(0).tickPadding(10));
		ay.select('.domain').remove();
		ay.selectAll('text').attr('class', 'chart-tick');

		g.append('text')
			.attr('transform', 'rotate(-90)')
			.attr('x', -ih / 2)
			.attr('y', -52)
			.attr('text-anchor', 'middle')
			.attr('class', 'chart-axis-label')
			.text('Chose the AI-written text (%)');

		const legend = box.svg.append('g').attr('transform', `translate(${m.left},24)`);
		rates.legend = legend;
		[
			{ key: 'human', label: 'Human evaluators', color: C.human, dx: 0 },
			{ key: 'ai', label: 'AI evaluators', color: C.ai, dx: 230 },
		].forEach((it) => {
			const gi = legend
				.append('g')
				.attr('class', `rates-legend rates-legend--${it.key}`)
				.attr('transform', `translate(${it.dx},0)`)
				.attr('opacity', it.key === 'human' ? 1 : 0);
			gi.append('rect').attr('x', 0).attr('y', -13).attr('width', 16).attr('height', 16).attr('rx', 3).attr('fill', it.color);
			gi.append('text').attr('x', 24).attr('y', 1).attr('class', 'chart-tick').text(it.label);
		});

		rates.bars = {};
		['human', 'ai'].forEach((series) => {
			DATA.rates[series].forEach((d, i) => {
				const cond = DATA.rates.conditions[i];
				const bg = g.append('g').attr('transform', `translate(${x(cond) + xi(series)},0)`);
				const rect = bg
					.append('rect')
					.attr('x', 0)
					.attr('y', ih)
					.attr('width', xi.bandwidth())
					.attr('height', 0)
					.attr('rx', 3)
					.attr('fill', series === 'human' ? C.human : C.ai)
					.attr('fill-opacity', 0.82);
				const ci = bg
					.append('line')
					.attr('x1', xi.bandwidth() / 2)
					.attr('x2', xi.bandwidth() / 2)
					.attr('y1', y(d.lo))
					.attr('y2', y(d.hi))
					.attr('stroke', C.ink)
					.attr('stroke-width', 1.8)
					.attr('opacity', 0);
				const label = bg
					.append('text')
					.attr('x', xi.bandwidth() / 2)
					.attr('y', y(d.hi) - 9)
					.attr('text-anchor', 'middle')
					.attr('class', 'chart-value')
					.attr('fill', series === 'human' ? C.human : C.ai)
					.attr('opacity', 0)
					.text(d.v.toFixed(1));
				rates.bars[`${series}-${i}`] = { rect, ci, label, d };
			});
		});
	}

	function showBar(key, delay) {
		const b = rates.bars[key];
		if (!b) return;
		go(b.rect, delay, 650).attr('y', rates.y(b.d.v)).attr('height', rates.ih - rates.y(b.d.v));
		go(b.ci, (delay || 0) + 420, 250).attr('opacity', 0.75);
		go(b.label, (delay || 0) + 380, 250).attr('opacity', 1);
	}

	function hideBar(key) {
		const b = rates.bars[key];
		if (!b) return;
		go(b.rect, 0, 300).attr('y', rates.ih).attr('height', 0);
		go(b.ci, 0, 150).attr('opacity', 0);
		go(b.label, 0, 150).attr('opacity', 0);
	}

	function showOrHide(key, on, delay) {
		const b = rates.bars[key];
		if (!b) return;
		const isUp = +b.rect.attr('y') < rates.ih - 1;
		if (on && !isUp) showBar(key, delay);
		if (!on && isUp) hideBar(key);
	}

	function ratesApply(beat) {
		if (!rates.built || beat === rates.beat) return;
		rates.beat = beat;
		const lines = document.getElementById('rates-lines');
		if (lines) lines.dataset.beat = String(Math.max(0, beat));
		showOrHide('human-0', beat >= 0, 0);
		showOrHide('human-1', beat >= 1, 0);
		showOrHide('human-2', beat >= 2, 0);
		['ai-0', 'ai-1', 'ai-2'].forEach((k, i) => showOrHide(k, beat >= 3, i * dur(170)));
		go(rates.legend.select('.rates-legend--ai'), 0, 250).attr('opacity', beat >= 3 ? 1 : 0);
	}

	/* ---------------- bias chart (slide entry) ---------------- */

	const bias = { built: false };

	function buildBias() {
		const box = svgIn('#bias-chart');
		if (!box) return;
		const m = { top: 56, right: 24, bottom: 92, left: 84 };
		const iw = box.w - m.left - m.right;
		const ih = box.h - m.top - m.bottom;
		const g = box.svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

		const x = d3
			.scaleBand()
			.domain(DATA.bias.map((d) => d.who))
			.range([0, iw])
			.paddingInner(0.42)
			.paddingOuter(0.18);
		const y = d3.scaleLinear().domain([0, 40]).range([ih, 0]);

		g.append('g')
			.selectAll('line')
			.data([10, 20, 30, 40])
			.join('line')
			.attr('x1', 0)
			.attr('x2', iw)
			.attr('y1', (d) => y(d))
			.attr('y2', (d) => y(d))
			.attr('stroke', C.hair);

		const ax = g
			.append('g')
			.attr('transform', `translate(0,${ih})`)
			.call(d3.axisBottom(x).tickSize(0).tickPadding(14));
		ax.select('.domain').attr('stroke', C.hair);
		ax.selectAll('text').attr('class', 'chart-tick chart-tick--cat');

		DATA.bias.forEach((d) => {
			g.append('text')
				.attr('x', x(d.who) + x.bandwidth() / 2)
				.attr('y', ih + 58)
				.attr('text-anchor', 'middle')
				.attr('class', 'chart-sub')
				.text(d.calc);
		});

		const ay = g
			.append('g')
			.call(
				d3
					.axisLeft(y)
					.tickValues([0, 10, 20, 30, 40])
					.tickFormat((d) => (d === 0 ? '0' : '+' + d))
					.tickSize(0)
					.tickPadding(10)
			);
		ay.select('.domain').remove();
		ay.selectAll('text').attr('class', 'chart-tick');

		g.append('text')
			.attr('transform', 'rotate(-90)')
			.attr('x', -ih / 2)
			.attr('y', -56)
			.attr('text-anchor', 'middle')
			.attr('class', 'chart-axis-label')
			.text('Attribution bias (points)');

		bias.parts = DATA.bias.map((d) => {
			const bg = g.append('g');
			const rect = bg
				.append('rect')
				.attr('x', x(d.who))
				.attr('y', ih)
				.attr('width', x.bandwidth())
				.attr('height', 0)
				.attr('rx', 4)
				.attr('fill', d.kind === 'human' ? C.human : C.ai)
				.attr('fill-opacity', 0.82);
			const label = bg
				.append('text')
				.attr('x', x(d.who) + x.bandwidth() / 2)
				.attr('y', y(d.v) - 14)
				.attr('text-anchor', 'middle')
				.attr('class', 'chart-value chart-value--big')
				.attr('fill', d.kind === 'human' ? C.human : C.ai)
				.attr('opacity', 0)
				.text('+' + d.v.toFixed(1));
			return { rect, label, d };
		});

		// the 2.5x annotation: an arc from the human bar to the AI bar
		const x1 = x(DATA.bias[0].who) + x.bandwidth() / 2;
		const x2 = x(DATA.bias[1].who) + x.bandwidth() / 2;
		const y1 = y(13.7) - 50;
		const y2 = y(34.3) - 30;
		bias.arc = g
			.append('path')
			.attr(
				'd',
				`M ${x1 + 34} ${y1} C ${x1 + (x2 - x1) * 0.45} ${y1 - 44}, ${x2 - (x2 - x1) * 0.35} ${y2 + 12}, ${x2 - 58} ${y2 + 6}`
			)
			.attr('fill', 'none')
			.attr('stroke', C.ink)
			.attr('stroke-width', 2)
			.attr('marker-end', 'url(#sp-arrow)')
			.attr('opacity', 0);
		bias.note = g
			.append('text')
			.attr('x', (x1 + x2) / 2 - 30)
			.attr('y', y(40) - 22)
			.attr('text-anchor', 'middle')
			.attr('class', 'chart-note')
			.attr('opacity', 0)
			.text('2.5 times the human bias');

		box.svg
			.append('defs')
			.append('marker')
			.attr('id', 'sp-arrow')
			.attr('viewBox', '0 0 10 10')
			.attr('refX', 8)
			.attr('refY', 5)
			.attr('markerWidth', 7)
			.attr('markerHeight', 7)
			.attr('orient', 'auto-start-reverse')
			.append('path')
			.attr('d', 'M 0 0 L 10 5 L 0 10 z')
			.attr('fill', C.ink);

		bias.y = y;
		bias.ih = ih;
	}

	function biasPlay() {
		if (!bias.parts) return;
		bias.parts.forEach((p, i) => {
			go(p.rect, i * 500, 700).attr('y', bias.y(p.d.v)).attr('height', bias.ih - bias.y(p.d.v));
			go(p.label, i * 500 + 420, 250).attr('opacity', 1);
		});
		go(bias.arc, 1350, 450).attr('opacity', 0.85);
		go(bias.note, 1500, 350).attr('opacity', 1);
	}

	/* ---------------- forest plot (slide entry) ---------------- */

	const forest = { built: false };

	function buildForest() {
		const box = svgIn('#forest-chart');
		if (!box) return;
		const m = { top: 40, right: 64, bottom: 60, left: 220 };
		const iw = box.w - m.left - m.right;
		const ih = box.h - m.top - m.bottom;
		const g = box.svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

		const x = d3.scaleLinear().domain([0, 1.8]).range([0, iw]);
		const y = d3
			.scalePoint()
			.domain(DATA.forest.map((d) => d.model))
			.range([0, ih])
			.padding(0.6);

		// human estimate: its 95% CI as a band, the point estimate as a dashed line
		forest.base = g.append('g').attr('opacity', 0);
		forest.base
			.append('rect')
			.attr('x', x(DATA.humanCi[0]))
			.attr('y', 0)
			.attr('width', x(DATA.humanCi[1]) - x(DATA.humanCi[0]))
			.attr('height', ih)
			.attr('fill', C.human)
			.attr('fill-opacity', 0.12);
		forest.base
			.append('line')
			.attr('x1', x(DATA.humanBaseline))
			.attr('x2', x(DATA.humanBaseline))
			.attr('y1', 0)
			.attr('y2', ih)
			.attr('stroke', C.human)
			.attr('stroke-width', 2)
			.attr('stroke-dasharray', '7 5');
		forest.base
			.append('text')
			.attr('x', x(DATA.humanBaseline))
			.attr('y', -12)
			.attr('text-anchor', 'middle')
			.attr('class', 'chart-note chart-note--human')
			.text('humans');

		g.append('line')
			.attr('x1', x(0))
			.attr('x2', x(0))
			.attr('y1', 0)
			.attr('y2', ih)
			.attr('stroke', 'rgba(28,25,23,0.45)')
			.attr('stroke-width', 1.6);
		g.append('text')
			.attr('x', x(0) + 8)
			.attr('y', -12)
			.attr('class', 'chart-hint')
			.text('no bias');

		g.append('g')
			.selectAll('line')
			.data([0.5, 1.0, 1.5])
			.join('line')
			.attr('x1', (d) => x(d))
			.attr('x2', (d) => x(d))
			.attr('y1', 0)
			.attr('y2', ih)
			.attr('stroke', C.hair)
			.attr('stroke-dasharray', '2 5');

		const ax = g
			.append('g')
			.attr('transform', `translate(0,${ih})`)
			.call(d3.axisBottom(x).tickValues([0, 0.5, 1.0, 1.5]).tickFormat(d3.format('.1f')).tickSize(0).tickPadding(12));
		ax.select('.domain').attr('stroke', C.hair);
		ax.selectAll('text').attr('class', 'chart-tick');

		g.append('text')
			.attr('x', iw / 2)
			.attr('y', ih + 50)
			.attr('text-anchor', 'middle')
			.attr('class', 'chart-axis-label')
			.text('Attribution bias, Cohen’s h');

		forest.rows = DATA.forest.map((d) => {
			const row = g.append('g').attr('opacity', 0);
			row.append('text')
				.attr('x', -16)
				.attr('y', y(d.model) + 6)
				.attr('text-anchor', 'end')
				.attr('class', 'chart-tick chart-tick--row')
				.text(d.model);
			row.append('line')
				.attr('x1', x(Math.max(0, d.h - DATA.forestCi)))
				.attr('x2', x(d.h + DATA.forestCi))
				.attr('y1', y(d.model))
				.attr('y2', y(d.model))
				.attr('stroke', C.ai)
				.attr('stroke-width', 3.5)
				.attr('stroke-linecap', 'round')
				.attr('opacity', 0.45);
			row.append('circle').attr('cx', x(d.h)).attr('cy', y(d.model)).attr('r', 7).attr('fill', C.ai);
			row.append('text')
				.attr('x', x(d.h + DATA.forestCi) + 12)
				.attr('y', y(d.model) + 6)
				.attr('class', 'chart-value chart-value--row')
				.attr('fill', C.ink)
				.text(d.h.toFixed(2));
			return row;
		});
	}

	function forestPlay() {
		if (!forest.rows) return;
		go(forest.base, 0, 500).attr('opacity', 1);
		forest.rows.forEach((row, i) => go(row, 500 + i * 110, 320).attr('opacity', 1));
	}

	/* ---------------- styles: bias per style, two panels (fragment beat 1) ---------------- */

	const styles = { built: false, beat: -1 };

	const sortedStyles = DATA.styles.slice().sort((a, b) => b[2] - a[2] || b[1] - a[1]);
	const aiPos = DATA.styles.filter((s) => s[2] > 0).length;
	const huPos = DATA.styles.filter((s) => s[1] > 0).length;

	function buildStyles() {
		const box = svgIn('#styles-chart');
		if (!box) return;
		const W = box.w;
		const H = box.h;
		const gap = 44;
		const panelW = (W - gap) / 2;
		const labelW = 156;
		const top = 48;
		const bottom = 58;
		const ih = H - top - bottom;
		const perPanel = sortedStyles.length / 2;
		const rowH = ih / perPanel;
		const x = d3.scaleLinear().domain([-25, 70]).range([0, panelW - labelW - 10]);
		const key = new Set(DATA.stylesKey);
		const ticks = [-20, 0, 20, 40, 60];

		const legend = box.svg.append('g').attr('transform', 'translate(0,22)');
		[
			{ label: 'Human evaluators', color: C.human, dx: 0 },
			{ label: 'AI evaluators', color: C.ai, dx: 230 },
		].forEach((it) => {
			const gi = legend.append('g').attr('transform', `translate(${it.dx},0)`);
			gi.append('circle').attr('cx', 8).attr('cy', -5).attr('r', 7).attr('fill', it.color);
			gi.append('text').attr('x', 24).attr('y', 1).attr('class', 'chart-tick').text(it.label);
		});

		styles.models = [];
		styles.humans = [];
		styles.links = [];

		[0, 1].forEach((p) => {
			const g = box.svg.append('g').attr('transform', `translate(${p * (panelW + gap) + labelW},${top})`);

			g.append('g')
				.selectAll('line')
				.data(ticks)
				.join('line')
				.attr('x1', (d) => x(d))
				.attr('x2', (d) => x(d))
				.attr('y1', 0)
				.attr('y2', ih)
				.attr('stroke', (d) => (d === 0 ? 'rgba(28,25,23,0.45)' : C.hair))
				.attr('stroke-width', (d) => (d === 0 ? 1.6 : 1))
				.attr('stroke-dasharray', (d) => (d === 0 ? null : '2 5'));

			g.append('g')
				.selectAll('text')
				.data(ticks)
				.join('text')
				.attr('x', (d) => x(d))
				.attr('y', ih + 26)
				.attr('text-anchor', 'middle')
				.attr('class', 'chart-tick chart-tick--dim')
				.text((d) => (d === 0 ? '0' : d > 0 ? '+' + d : '−' + Math.abs(d)));

			g.append('text')
				.attr('x', x(0) + (x(70) - x(0)) / 2)
				.attr('y', ih + 50)
				.attr('text-anchor', 'middle')
				.attr('class', 'chart-axis-label')
				.text('Attribution bias, points');

			sortedStyles.slice(p * perPanel, (p + 1) * perPanel).forEach((s, i) => {
				const yy = rowH * (i + 0.5);
				const isKey = key.has(s[0]);
				g.append('text')
					.attr('x', -14)
					.attr('y', yy + 6)
					.attr('text-anchor', 'end')
					.attr('class', 'chart-tick ' + (isKey ? 'chart-tick--key' : 'chart-tick--dim'))
					.text(s[0]);
				const link = g
					.append('line')
					.attr('x1', x(Math.min(s[1], s[2])))
					.attr('x2', x(Math.max(s[1], s[2])))
					.attr('y1', yy)
					.attr('y2', yy)
					.attr('stroke', 'rgba(28,25,23,0.3)')
					.attr('stroke-width', 2.5)
					.attr('opacity', 0);
				const hu = g.append('circle').attr('cx', x(s[1])).attr('cy', yy).attr('r', 6.5).attr('fill', C.human).attr('opacity', 0);
				const ai = g.append('circle').attr('cx', x(s[2])).attr('cy', yy).attr('r', 6.5).attr('fill', C.ai).attr('opacity', 0);
				styles.links.push(link);
				styles.humans.push(hu);
				styles.models.push({ ai, order: p * perPanel + i });
			});
		});
	}

	function stylesPlayModels() {
		if (!styles.models) return;
		styles.models.forEach((m) => go(m.ai, m.order * 45, 260).attr('opacity', 1));
	}

	function stylesApply(beat) {
		if (!styles.built || beat === styles.beat) return;
		styles.beat = beat;
		const on = beat >= 1;
		styles.links.forEach((l, i) => go(l, on ? i * 30 : 0, 260).attr('opacity', on ? 1 : 0));
		styles.humans.forEach((h, i) => go(h, on ? i * 30 : 0, 260).attr('opacity', on ? 1 : 0));
	}

	/* ---------------- Study 2: AI evaluators, any creator (slide entry) ---------------- */

	const study2 = { built: false };

	function buildStudy2() {
		const box = svgIn('#study2-chart');
		if (!box) return;
		const m = { top: 46, right: 118, bottom: 54, left: 80 };
		const iw = box.w - m.left - m.right;
		const ih = box.h - m.top - m.bottom;
		const g = box.svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

		const x = d3
			.scaleBand()
			.domain(DATA.study2.map((d) => d.cond))
			.range([0, iw])
			.paddingInner(0.5)
			.paddingOuter(0.25);
		const y = d3.scaleLinear().domain([0, 75]).range([ih, 0]);

		g.append('g')
			.selectAll('line')
			.data([25, 50, 75])
			.join('line')
			.attr('x1', 0)
			.attr('x2', iw)
			.attr('y1', (d) => y(d))
			.attr('y2', (d) => y(d))
			.attr('stroke', C.hair)
			.attr('stroke-dasharray', (d) => (d === 50 ? '5 4' : null))
			.attr('stroke-width', (d) => (d === 50 ? 1.6 : 1));
		g.append('text').attr('x', iw + 10).attr('y', y(50) + 5).attr('class', 'chart-hint').text('no preference');

		const ax = g.append('g').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).tickSize(0).tickPadding(14));
		ax.select('.domain').attr('stroke', C.hair);
		ax.selectAll('text').attr('class', 'chart-tick chart-tick--cat');
		const ay = g.append('g').call(d3.axisLeft(y).tickValues([0, 25, 50, 75]).tickSize(0).tickPadding(10));
		ay.select('.domain').remove();
		ay.selectAll('text').attr('class', 'chart-tick');
		g.append('text')
			.attr('transform', 'rotate(-90)')
			.attr('x', -ih / 2)
			.attr('y', -52)
			.attr('text-anchor', 'middle')
			.attr('class', 'chart-axis-label')
			.text('Chose the AI-written text (%)');

		const legend = box.svg.append('g').attr('transform', `translate(${m.left},22)`);
		legend.append('rect').attr('x', 0).attr('y', -13).attr('width', 16).attr('height', 16).attr('rx', 3).attr('fill', C.ai);
		legend.append('text').attr('x', 24).attr('y', 1).attr('class', 'chart-tick').text('AI evaluators');

		study2.parts = DATA.study2.map((d) => {
			const bg = g.append('g').attr('transform', `translate(${x(d.cond)},0)`);
			const rect = bg
				.append('rect')
				.attr('x', 0)
				.attr('y', ih)
				.attr('width', x.bandwidth())
				.attr('height', 0)
				.attr('rx', 3)
				.attr('fill', C.ai)
				.attr('fill-opacity', 0.82);
			const ci = bg
				.append('line')
				.attr('x1', x.bandwidth() / 2)
				.attr('x2', x.bandwidth() / 2)
				.attr('y1', y(d.lo))
				.attr('y2', y(d.hi))
				.attr('stroke', C.ink)
				.attr('stroke-width', 1.8)
				.attr('opacity', 0);
			const label = bg
				.append('text')
				.attr('x', x.bandwidth() / 2)
				.attr('y', y(d.hi) - 9)
				.attr('text-anchor', 'middle')
				.attr('class', 'chart-value')
				.attr('fill', C.ai)
				.attr('opacity', 0)
				.text(d.v.toFixed(1));
			return { rect, ci, label, d };
		});
		study2.y = y;
		study2.ih = ih;
	}

	function study2Play() {
		if (!study2.parts) return;
		study2.parts.forEach((p, i) => {
			go(p.rect, i * 350, 650).attr('y', study2.y(p.d.v)).attr('height', study2.ih - study2.y(p.d.v));
			go(p.ci, i * 350 + 420, 250).attr('opacity', 0.75);
			go(p.label, i * 350 + 380, 250).attr('opacity', 1);
		});
	}

	/* ---------------- criteria bars (slide entry) ---------------- */

	const criteria = { built: false };

	function buildCriteria() {
		const box = svgIn('#criteria-chart');
		if (!box) return;
		const m = { top: 38, right: 80, bottom: 10, left: 270 };
		const iw = box.w - m.left - m.right;
		const ih = box.h - m.top - m.bottom;
		const g = box.svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

		const x = d3.scaleLinear().domain([0, 35]).range([0, iw]);
		const y = d3
			.scaleBand()
			.domain(DATA.criteria.map((d) => d.code))
			.range([0, ih])
			.paddingInner(0.4);

		box.svg
			.append('text')
			.attr('x', m.left)
			.attr('y', 20)
			.attr('class', 'chart-axis-label')
			.text('Share of eligible pairs where the criterion switches sides');

		criteria.rows = DATA.criteria.map((d) => {
			const row = g.append('g');
			row.append('text')
				.attr('x', -14)
				.attr('y', y(d.code) + y.bandwidth() / 2 + 6)
				.attr('text-anchor', 'end')
				.attr('class', 'chart-tick chart-tick--row')
				.text(d.code);
			const bar = row
				.append('rect')
				.attr('x', 0)
				.attr('y', y(d.code))
				.attr('width', 0)
				.attr('height', y.bandwidth())
				.attr('rx', 3)
				.attr('fill', C.ai)
				.attr('fill-opacity', 0.82);
			const val = row
				.append('text')
				.attr('x', x(d.v) + 12)
				.attr('y', y(d.code) + y.bandwidth() / 2 + 6)
				.attr('class', 'chart-value chart-value--row')
				.attr('fill', C.ink)
				.attr('opacity', 0)
				.text(d.v.toFixed(1) + '%');
			return { bar, val, d };
		});
		criteria.x = x;
	}

	function criteriaPlay() {
		if (!criteria.rows) return;
		criteria.rows.forEach((r, i) => {
			go(r.bar, i * 100, 520).attr('width', criteria.x(r.d.v));
			go(r.val, i * 100 + 330, 220).attr('opacity', 1);
		});
	}

	/* ---------------- wiring ----------------
	   Hidden reveal slides measure zero width, so each chart is built lazily, the
	   first time its slide becomes current (or up front when printing, where every
	   slide is laid out). */

	function currentBeat(root) {
		let beat = 0;
		if (!root) return beat;
		root.querySelectorAll('.fragment.visible[data-beat]').forEach((f) => {
			beat = Math.max(beat, +f.dataset.beat);
		});
		return beat;
	}

	function ensure(chart, build) {
		if (!chart.built) {
			build();
			chart.built = true;
		}
	}

	function onSlide(slide) {
		if (!slide) return;
		const host = (id) => slide.id === id || !!slide.closest('#' + id);
		if (host('rates-slide')) {
			ensure(rates, buildRates);
			ratesApply(isPrint ? 3 : currentBeat(document.getElementById('rates-slide')));
		}
		if (host('bias-slide')) {
			ensure(bias, buildBias);
			biasPlay();
		}
		if (host('forest-slide')) {
			ensure(forest, buildForest);
			forestPlay();
		}
		if (host('study2-slide')) {
			ensure(study2, buildStudy2);
			study2Play();
		}
		if (host('styles-slide')) {
			ensure(styles, buildStyles);
			stylesPlayModels();
			stylesApply(isPrint ? 1 : currentBeat(document.getElementById('styles-slide')));
		}
		if (host('onethree-slide')) {
			ensure(criteria, buildCriteria);
			criteriaPlay();
		}
	}

	function init() {
		loadColors();
		const counts = document.getElementById('styles-counts');
		if (counts) {
			counts.textContent = `Models lean toward the human label in ${aiPos} of 30 styles, people in ${huPos} of 30. Bias is the swing in the share choosing the AI text, in percentage points.`;
		}

		if (isPrint) {
			ensure(rates, buildRates);
			ensure(bias, buildBias);
			ensure(forest, buildForest);
			ensure(study2, buildStudy2);
			ensure(styles, buildStyles);
			ensure(criteria, buildCriteria);
			ratesApply(3);
			biasPlay();
			forestPlay();
			study2Play();
			stylesPlayModels();
			stylesApply(1);
			criteriaPlay();
			return;
		}

		Reveal.on('slidechanged', (e) => onSlide(e.currentSlide));
		Reveal.on('fragmentshown', (e) => {
			const f = e.fragment;
			if (!f.dataset.beat) return;
			if (f.closest('#rates-slide')) {
				ensure(rates, buildRates);
				ratesApply(+f.dataset.beat);
			}
			if (f.closest('#styles-slide')) {
				ensure(styles, buildStyles);
				stylesApply(+f.dataset.beat);
			}
		});
		Reveal.on('fragmenthidden', (e) => {
			const f = e.fragment;
			if (!f.dataset.beat) return;
			if (f.closest('#rates-slide')) ratesApply(+f.dataset.beat - 1);
			if (f.closest('#styles-slide')) stylesApply(+f.dataset.beat - 1);
		});
		onSlide(Reveal.getCurrentSlide());
	}

	if (Reveal.isReady()) {
		init();
	} else {
		Reveal.on('ready', init);
	}
})();
