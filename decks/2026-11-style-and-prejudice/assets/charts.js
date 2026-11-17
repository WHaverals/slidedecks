'use strict';

/**
 * Deck charts for Style and Prejudice, drawn with d3 and driven by Reveal
 * fragments (rates, styles) or slide entry (bias, forest, criteria).
 * Numbers are transcribed from the manuscript and its SI; CIs are 95%.
 *   rates, bias, forest: manuscript Figs. 2 and 3; study2: manuscript Fig. 5;
 *   matrix: the 14 x 14 evaluator-by-creator grid behind it (see the comment at DATA.matrix)
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
		// Study 2, 14 evaluators (rows) by 14 creators (columns), in the same model order:
		// bias in percentage points = share choosing the AI text under swapped labels minus
		// under correct labels, from about 30 judgments per condition and cell. Recomputed from
		// the raw responses with the authors' response-quality filter, which gives the 17,596
		// valid responses of the paper (cell mean +25.8, range -6.7 to +70.0, 7 cells at or below
		// zero); the margins match SI Fig. S17 (evaluators +9.4 to +54.8, creators +19.1 to +30.5).
		matrix: {
			names: ['Claude 3.5 Haiku', 'Claude Sonnet 4', 'Command R', 'DeepSeek R1', 'DeepSeek Chat v3', 'Gemini 2.5 Flash', 'Llama 3.3 70B', 'Llama 4 Maverick', 'Mistral Medium', 'Mistral Nemo', 'GPT-3.5 Turbo', 'GPT-4', 'GPT-4o Mini', 'Qwen 2.5 72B'],
			v: [
				[26.67, 36.67, 6.67, 23.33, 23.33, 13.33, 23.33, 33.33, 30, 26.67, 13.33, 30, 13.33, 23.33],
				[46.67, 40, 16.67, 40, 53.33, 33.33, 33.33, 26.67, 30, 26.67, 13.33, 30, 36.67, 20],
				[56.67, 60, 56.67, 40, 46.67, 56.67, 70, 66.67, 46.67, 56.67, 46.67, 60, 63.33, 40],
				[-2.38, 23.33, 19.54, 20, 3.45, 16.67, 35.52, 24.14, 15.06, 18.16, 23.33, 17.88, 15.06, 11.38],
				[31.38, 33.1, 22.87, 33.33, 19.66, 35.06, 31.03, 23.33, 33.33, 26.67, 23.33, 16.67, 50, 48.28],
				[38.85, 26.67, 26.67, 33.33, 26.67, 30, 26.67, 33.33, 38.51, 26.67, 10.57, 26.67, 30, 23.33],
				[29.77, 30, 30, 30, 30, 20, 33.33, 40, 16.67, 23.33, 13.33, 21.84, 20, 26.67],
				[16.67, 26.67, 16.67, 6.67, 6.67, 20, 26.67, 16.67, 3.33, 16.67, 6.67, 28.39, 6.67, 16.67],
				[53.33, 40, 23.33, 43.33, 46.67, 36.67, 53.33, 60, 46.67, 40, 23.33, 60, 36.67, 33.33],
				[13.33, 6.67, 33.33, -3.33, 26.67, 6.67, -6.67, 10, 3.33, 16.67, 0, 20, 3.33, 6.67],
				[10, 26.67, 16.67, 23.33, 13.33, 20, 36.67, 23.33, 36.67, 26.67, 43.33, 33.33, 21.49, 23.33],
				[6.67, 6.67, 23.33, 3.33, 10, 16.67, 0, 16.67, 3.33, 12.07, 10, 13.33, 10, 0],
				[26.67, 23.33, 30, 26.67, 3.33, 13.33, 23.33, 20, 16.67, 33.33, 13.33, 30, 36.67, -3.33],
				[13.33, 20, 40, 10, 20, 26.67, 40, 23.33, 33.33, 36.67, 26.67, 30, 20, 20],
			],
		},
		// SI Fig. S11: Cohen's h (95% CI) for three comparisons of label conditions, people and models.
		// Penalty: blind against correct labels. Halo: blind against swapped labels. Bias: correct
		// against swapped labels. Recomputed from the pooled rates (people 55.3, 47.8, 61.5; models
		// 49.4, 29.8, 64.1), which gives 0.15, 0.13, 0.28 and 0.40, 0.30, 0.70.
		penalty: [
			{ name: 'Penalty', sub: 'AI label against no label', human: [0.15, 0.06, 0.24], ai: [0.4, 0.32, 0.49] },
			{ name: 'Halo', sub: 'human label against no label', human: [0.13, 0.04, 0.22], ai: [0.3, 0.22, 0.38] },
			{ name: 'Bias', sub: 'human label against AI label', human: [0.28, 0.19, 0.37], ai: [0.7, 0.62, 0.78] },
		],
		// Study 1, share of AI-text choices by model: [model, blind, correct labels, swapped labels],
		// from the 3,488 raw responses (85 to 90 per model and condition); same order as the forest plot.
		modelRates: [
			['GPT-3.5 Turbo', 66.7, 24.4, 91.1],
			['Claude Sonnet 4', 26.7, 4.4, 46.7],
			['Qwen 2.5 72B', 60.0, 24.4, 72.2],
			['Mistral Medium', 52.2, 24.4, 65.6],
			['Gemini 2.5 Flash', 44.9, 22.2, 53.9],
			['GPT-4o Mini', 61.1, 45.6, 76.7],
			['Command R', 52.2, 38.9, 70.0],
			['DeepSeek R1', 47.1, 28.1, 58.0],
			['DeepSeek Chat v3', 44.4, 34.4, 63.3],
			['Llama 3.3 70B', 44.4, 33.3, 60.0],
			['Mistral Nemo', 47.7, 41.2, 66.7],
			['Claude 3.5 Haiku', 47.8, 32.6, 55.6],
			['Llama 4 Maverick', 46.7, 33.7, 53.3],
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
		stylesKey: ['Cockney', 'Lipogram', 'Science Fiction'],
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

	/* ---------------- Study 2: the 14 x 14 grid (beats 1 to 3 of the same slide) ----------------
	   Beat 1 shows every evaluator-creator pair in provider order, beat 2 sorts the evaluators
	   by their average and adds it, beat 3 does the same for the creators. Warm greys only:
	   orange and blue mean AI and human in this deck, so neither appears here. */

	const heat = { built: false, beat: -1 };
	// Six steps rather than a continuous ramp: a smooth ramp passes through mid-greys where
	// neither ink nor paper type is easy to read, and every cell carries its number anyway.
	const HEAT_STEPS = [
		{ from: 55, fill: '#2a2420', text: '#faf8f5' },
		{ from: 40, fill: '#5e544b', text: '#faf8f5' },
		{ from: 30, fill: '#a39686', text: '#1c1917' },
		{ from: 20, fill: '#c4b8a8', text: '#1c1917' },
		{ from: 10, fill: '#ddd4c7', text: '#1c1917' },
		{ from: -Infinity, fill: '#efe9df', text: '#1c1917' },
	];
	const MINUS = '−';

	function buildHeat() {
		const box = svgIn('#study2-heat');
		if (!box) return;
		const names = DATA.matrix.names;
		const val = DATA.matrix.v;
		const n = names.length;
		const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
		const rowMean = val.map(mean);
		const colMean = names.map((_, c) => mean(val.map((r) => r[c])));

		const labelW = 158;
		const meanGap = 14;
		const meanW = 58;
		const top = 102;
		const avgGap = 10;
		const cw = Math.min(46, Math.floor((box.w - labelW - meanGap - meanW) / n));
		const ph = Math.floor((box.h - top - avgGap) / (n + 1));
		const used = labelW + n * cw + meanGap + meanW;
		const x0 = Math.max(0, Math.round((box.w - used) / 2)) + labelW;
		const meanX = x0 + n * cw + meanGap + meanW / 2;

		const step = (v) => HEAT_STEPS.find((st) => v >= st.from);
		const fmt = (v) => {
			const r = Math.round(v);
			return r < 0 ? MINUS + Math.abs(r) : String(r);
		};

		const order = (vals) =>
			vals
				.map((v, i) => [v, i])
				.sort((a, b) => b[0] - a[0] || a[1] - b[1])
				.map((p) => p[1]);
		const rankOf = (idx) => {
			const rank = [];
			idx.forEach((i, pos) => (rank[i] = pos));
			return rank;
		};
		heat.rowRank = [rankOf(d3.range(n)), rankOf(order(rowMean))];
		heat.colRank = [rankOf(d3.range(n)), rankOf(order(colMean))];
		heat.ph = ph;
		heat.cw = cw;
		heat.top = top;
		heat.x0 = x0;

		const g = box.svg.append('g');

		// the average column and its header
		heat.avgHead = g
			.append('text')
			.attr('x', meanX)
			.attr('y', top - 9)
			.attr('text-anchor', 'middle')
			.attr('class', 'chart-tick chart-tick--dim')
			.attr('opacity', 0)
			.text('Average');

		heat.rows = names.map((nm, e) => {
			const rg = g.append('g').attr('transform', `translate(0,${top + heat.rowRank[0][e] * ph})`);
			rg.append('text')
				.attr('x', x0 - 12)
				.attr('y', ph / 2 + 6)
				.attr('text-anchor', 'end')
				.attr('class', 'chart-tick chart-tick--row')
				.text(nm);
			const cells = val[e].map((v, c) => {
				const out = v <= 0;
				const st = step(Math.round(v));
				const fill = out ? 'none' : st.fill;
				const cg = rg.append('g').attr('transform', `translate(${x0 + heat.colRank[0][c] * cw},0)`);
				cg.append('rect')
					.attr('x', 1)
					.attr('y', 1)
					.attr('width', cw - 2)
					.attr('height', ph - 2)
					.attr('rx', 2)
					.attr('fill', fill)
					.attr('stroke', out ? C.ink : 'none')
					.attr('stroke-width', out ? 1.4 : 0);
				cg.append('text')
					.attr('x', cw / 2)
					.attr('y', ph / 2 + 5)
					.attr('text-anchor', 'middle')
					.attr('class', 'chart-cell')
					.attr('fill', out ? C.ink : st.text)
					.text(fmt(v));
				return cg;
			});
			const avg = rg
				.append('text')
				.attr('x', meanX)
				.attr('y', ph / 2 + 6)
				.attr('text-anchor', 'middle')
				.attr('class', 'chart-value chart-value--row')
				.attr('fill', C.ink)
				.attr('opacity', 0)
				.text(fmt(rowMean[e]));
			return { rg, cells, avg };
		});

		// the creator names, slanted over their columns
		heat.cols = names.map((nm, c) => {
			const cg = g
				.append('g')
				.attr('transform', `translate(${x0 + heat.colRank[0][c] * cw + cw / 2 + 4},${top - 9})`);
			cg.append('text').attr('transform', 'rotate(-45)').attr('class', 'chart-tick chart-tick--col').text(nm);
			return cg;
		});

		// the creator averages under the grid
		const avgY = top + n * ph + avgGap;
		heat.avgLabel = g
			.append('text')
			.attr('x', x0 - 12)
			.attr('y', avgY + ph / 2 + 6)
			.attr('text-anchor', 'end')
			.attr('class', 'chart-tick chart-tick--row chart-tick--grey')
			.attr('opacity', 0)
			.text('Average');
		heat.colAvg = names.map((nm, c) =>
			g
				.append('text')
				.attr('x', x0 + heat.colRank[0][c] * cw + cw / 2)
				.attr('y', avgY + ph / 2 + 6)
				.attr('text-anchor', 'middle')
				.attr('class', 'chart-value chart-value--row')
				.attr('fill', C.ink)
				.attr('opacity', 0)
				.text(fmt(colMean[c]))
		);
	}

	function heatApply(beat) {
		if (!heat.built) return;
		const first = heat.beat < 0;
		if (beat === heat.beat) return;
		heat.beat = beat;
		// the first call only sets the state: nothing animates from an unseen starting point
		const mv = (sel, delay, ms) => (first ? sel : go(sel, delay, ms));
		const r = beat >= 2 ? 1 : 0;
		const c = beat >= 3 ? 1 : 0;
		heat.rows.forEach((row, e) => {
			mv(row.rg, heat.rowRank[r][e] * 28, 900).attr('transform', `translate(0,${heat.top + heat.rowRank[r][e] * heat.ph})`);
			row.cells.forEach((cg, col) => {
				mv(cg, heat.colRank[c][col] * 28, 900).attr('transform', `translate(${heat.x0 + heat.colRank[c][col] * heat.cw},0)`);
			});
			mv(row.avg, r ? 800 : 0, 380).attr('opacity', r);
		});
		heat.cols.forEach((cg, col) => {
			mv(cg, heat.colRank[c][col] * 28, 900).attr(
				'transform',
				`translate(${heat.x0 + heat.colRank[c][col] * heat.cw + heat.cw / 2 + 4},${heat.top - 9})`
			);
		});
		heat.colAvg.forEach((t, col) => {
			mv(t, c ? 800 : 0, 380)
				.attr('x', heat.x0 + heat.colRank[c][col] * heat.cw + heat.cw / 2)
				.attr('opacity', c);
		});
		mv(heat.avgHead, r ? 800 : 0, 380).attr('opacity', r);
		mv(heat.avgLabel, c ? 800 : 0, 380).attr('opacity', c);
	}

	// beat 0 is the bar chart; beats 1 to 3 swap in the grid. CSS reads data-s2 on the slide.
	function study2Apply(beat) {
		const slide = document.getElementById('study2-slide');
		if (slide) slide.dataset.s2 = String(beat);
		if (beat >= 1 || heat.built) {
			ensure(heat, buildHeat);
			heatApply(beat);
		}
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

	/* ---------------- backup: penalty and halo (SI Fig. S11) ---------------- */

	const penalty = { built: false };

	function buildPenalty() {
		const box = svgIn('#penalty-chart');
		if (!box) return;
		const m = { top: 44, right: 78, bottom: 56, left: 292 };
		const iw = box.w - m.left - m.right;
		const ih = box.h - m.top - m.bottom;
		const g = box.svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
		const x = d3.scaleLinear().domain([0, 0.9]).range([0, iw]);
		const y = d3.scaleBand().domain(DATA.penalty.map((d) => d.name)).range([0, ih]).paddingInner(0.2);

		g.append('g')
			.selectAll('line')
			.data([0, 0.2, 0.4, 0.6, 0.8])
			.join('line')
			.attr('x1', (d) => x(d))
			.attr('x2', (d) => x(d))
			.attr('y1', 0)
			.attr('y2', ih)
			.attr('stroke', (d) => (d === 0 ? 'rgba(28,25,23,0.45)' : C.hair))
			.attr('stroke-dasharray', (d) => (d === 0 ? null : '2 5'));
		const ax = g.append('g').attr('transform', `translate(0,${ih})`);
		ax.selectAll('text')
			.data([0, 0.2, 0.4, 0.6, 0.8])
			.join('text')
			.attr('x', (d) => x(d))
			.attr('y', 26)
			.attr('text-anchor', 'middle')
			.attr('class', 'chart-tick')
			.text((d) => d.toFixed(1));
		g.append('text')
			.attr('x', iw / 2)
			.attr('y', ih + 50)
			.attr('text-anchor', 'middle')
			.attr('class', 'chart-axis-label')
			.text('Cohen’s h, with 95% confidence intervals');

		const legend = box.svg.append('g').attr('transform', `translate(${m.left},22)`);
		[
			['People', C.human, 0],
			['Models', C.ai, 120],
		].forEach(([label, col, dx]) => {
			legend.append('circle').attr('cx', dx + 7).attr('cy', -5).attr('r', 7).attr('fill', col);
			legend.append('text').attr('x', dx + 22).attr('y', 1).attr('class', 'chart-tick chart-tick--row').text(label);
		});

		DATA.penalty.forEach((d) => {
			const cy = y(d.name) + y.bandwidth() / 2;
			g.append('text')
				.attr('x', -22)
				.attr('y', cy - 2)
				.attr('text-anchor', 'end')
				.attr('class', 'chart-tick chart-tick--cat')
				.text(d.name);
			g.append('text')
				.attr('x', -22)
				.attr('y', cy + 20)
				.attr('text-anchor', 'end')
				.attr('class', 'chart-tick chart-tick--dim')
				.text(d.sub);
			[
				[d.human, C.human, -15],
				[d.ai, C.ai, 15],
			].forEach(([[v, lo, hi], col, dy]) => {
				g.append('line')
					.attr('x1', x(lo))
					.attr('x2', x(hi))
					.attr('y1', cy + dy)
					.attr('y2', cy + dy)
					.attr('stroke', col)
					.attr('stroke-width', 2.4)
					.attr('stroke-linecap', 'round');
				g.append('circle').attr('cx', x(v)).attr('cy', cy + dy).attr('r', 7.5).attr('fill', col);
				g.append('text')
					.attr('x', x(hi) + 12)
					.attr('y', cy + dy + 6)
					.attr('class', 'chart-value chart-value--row')
					.attr('fill', col)
					.text(v.toFixed(2));
			});
		});
	}

	/* ---------------- backup: rates for each model (SI Fig. S12) ---------------- */

	const modelRates = { built: false };

	function buildModelRates() {
		const box = svgIn('#models-chart');
		if (!box) return;
		const m = { top: 40, right: 54, bottom: 34, left: 190 };
		const iw = box.w - m.left - m.right;
		const ih = box.h - m.top - m.bottom;
		const g = box.svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
		const rows = DATA.modelRates;
		const x = d3.scaleLinear().domain([0, 100]).range([0, iw]);
		const y = d3.scalePoint().domain(rows.map((r) => r[0])).range([0, ih]).padding(0.5);

		g.append('g')
			.selectAll('line')
			.data([0, 25, 50, 75, 100])
			.join('line')
			.attr('x1', (d) => x(d))
			.attr('x2', (d) => x(d))
			.attr('y1', 0)
			.attr('y2', ih)
			.attr('stroke', (d) => (d === 50 ? 'rgba(28,25,23,0.45)' : C.hair))
			.attr('stroke-dasharray', (d) => (d === 50 ? '5 4' : '2 5'));
		g.append('g')
			.selectAll('text')
			.data([0, 25, 50, 75, 100])
			.join('text')
			.attr('x', (d) => x(d))
			.attr('y', ih + 26)
			.attr('text-anchor', 'middle')
			.attr('class', 'chart-tick')
			.text((d) => d + '%');

		const legend = box.svg.append('g').attr('transform', `translate(${m.left},22)`);
		legend.append('circle').attr('cx', 7).attr('cy', -5).attr('r', 6.5).attr('fill', C.ai);
		legend.append('text').attr('x', 22).attr('y', 1).attr('class', 'chart-tick').text('Correct labels');
		legend.append('circle').attr('cx', 196).attr('cy', -5).attr('r', 6.5).attr('fill', '#faf8f5').attr('stroke', C.ai).attr('stroke-width', 2.5);
		legend.append('text').attr('x', 211).attr('y', 1).attr('class', 'chart-tick').text('Swapped labels');
		legend.append('line').attr('x1', 394).attr('x2', 394).attr('y1', -13).attr('y2', 3).attr('stroke', C.ink).attr('stroke-width', 2.4).attr('opacity', 0.6);
		legend.append('text').attr('x', 406).attr('y', 1).attr('class', 'chart-tick').text('Blind');

		rows.forEach(([name, blind, open, swapped]) => {
			const cy = y(name);
			g.append('text')
				.attr('x', -16)
				.attr('y', cy + 6)
				.attr('text-anchor', 'end')
				.attr('class', 'chart-tick chart-tick--row')
				.text(name);
			g.append('line')
				.attr('x1', x(open))
				.attr('x2', x(swapped))
				.attr('y1', cy)
				.attr('y2', cy)
				.attr('stroke', C.ai)
				.attr('stroke-opacity', 0.32)
				.attr('stroke-width', 9)
				.attr('stroke-linecap', 'round');
			g.append('line')
				.attr('x1', x(blind))
				.attr('x2', x(blind))
				.attr('y1', cy - 8)
				.attr('y2', cy + 8)
				.attr('stroke', C.ink)
				.attr('stroke-width', 2.4)
				.attr('opacity', 0.6);
			g.append('circle').attr('cx', x(open)).attr('cy', cy).attr('r', 6.5).attr('fill', C.ai);
			g.append('circle')
				.attr('cx', x(swapped))
				.attr('cy', cy)
				.attr('r', 6.5)
				.attr('fill', '#faf8f5')
				.attr('stroke', C.ai)
				.attr('stroke-width', 2.5);
			g.append('text')
				.attr('x', x(open) - 14)
				.attr('y', cy + 6)
				.attr('text-anchor', 'end')
				.attr('class', 'chart-value chart-value--row')
				.attr('fill', C.ink)
				.text(Math.round(open));
			g.append('text')
				.attr('x', x(swapped) + 14)
				.attr('y', cy + 6)
				.attr('class', 'chart-value chart-value--row')
				.attr('fill', C.ink)
				.text(Math.round(swapped));
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
			study2Apply(isPrint ? 3 : currentBeat(document.getElementById('study2-slide')));
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
		if (host('penalty-slide')) ensure(penalty, buildPenalty);
		if (host('models-slide')) ensure(modelRates, buildModelRates);
	}

	function init() {
		loadColors();
		const counts = document.getElementById('styles-counts');
		if (counts) {
			counts.textContent = `Models lean toward the human label in ${aiPos} of 30 styles, people in ${huPos} of 30. Bias is the change in the share choosing the AI text from correct to swapped labels, in percentage points. Bold marks the three styles we look at next.`;
		}

		if (isPrint) {
			ensure(rates, buildRates);
			ensure(bias, buildBias);
			ensure(forest, buildForest);
			ensure(study2, buildStudy2);
			ensure(styles, buildStyles);
			ensure(criteria, buildCriteria);
			ensure(penalty, buildPenalty);
			ensure(modelRates, buildModelRates);
			ratesApply(3);
			biasPlay();
			forestPlay();
			study2Play();
			study2Apply(3);
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
			if (f.closest('#study2-slide')) {
				ensure(study2, buildStudy2);
				study2Apply(currentBeat(document.getElementById('study2-slide')));
			}
		});
		Reveal.on('fragmenthidden', (e) => {
			const f = e.fragment;
			if (!f.dataset.beat) return;
			if (f.closest('#rates-slide')) ratesApply(+f.dataset.beat - 1);
			if (f.closest('#styles-slide')) stylesApply(+f.dataset.beat - 1);
			if (f.closest('#study2-slide')) study2Apply(currentBeat(document.getElementById('study2-slide')));
		});
		onSlide(Reveal.getCurrentSlide());
	}

	// Printing: the page layout only exists once reveal has built it, and the charts measure
	// their boxes, so build them then, not when the window happens to be some other width.
	if (isPrint) {
		Reveal.on('pdf-ready', init);
	} else if (Reveal.isReady()) {
		init();
	} else {
		Reveal.on('ready', init);
	}
})();
