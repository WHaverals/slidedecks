/* Swapped labels: on arrival from the "correct labels" slide, the two labels start in the
   cards they had there and trade places. The markup already holds the final state, so print,
   ?nomotion, reduced motion, backward navigation and direct jumps simply show it.

   The slide has no data-auto-animate and cuts in instantly (data-transition="none"): the two
   condition slides look the same on arrival except for the heading. Reveal's auto-animate
   would also fight this: it moves nothing here (it measures each label against its offset
   parent, and both sit at the same offset inside their cards), but while it runs it makes each
   card its own stacking layer, so the label leaving the left card slides under the right one
   and vanishes for the first second. */
(function () {
	const noMotion =
		/print-pdf/i.test(window.location.search) ||
		/nomotion/i.test(window.location.search) ||
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (noMotion || !('animate' in Element.prototype)) return;

	const LIFT = 17; // px: one label rises and the other sinks, so they pass without touching
	const DELAY = 450; // ms: a beat of the unchanged slide, then the swap
	const DURATION = 1500;
	const STEPS = 20;

	const smooth = (t) => {
		const c = Math.min(1, Math.max(0, t));
		return c * c * (3 - 2 * c);
	};
	// slow start, slow landing
	const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

	// Keyframes baked from two curves: the sideways travel follows `ease`, while the lift
	// is complete by a quarter of the way, so the labels are on separate lines before
	// they come level with each other, and stay apart until the last quarter.
	function path(dx, side) {
		const frames = [];
		for (let i = 0; i <= STEPS; i++) {
			const p = i / STEPS;
			const x = dx * (1 - ease(p));
			const y = side * LIFT * smooth(p / 0.25) * smooth((1 - p) / 0.25);
			frames.push({ transform: `translate(${x}px, ${y}px)`, offset: p });
		}
		return frames;
	}

	function swap(slide) {
		const left = slide.querySelector('[data-id="lab-ai"]'); // ends in the left card
		const right = slide.querySelector('[data-id="lab-q"]'); // ends in the right card
		if (!left || !right) return;

		const scale = Reveal.getScale() || 1;
		const dx = (right.getBoundingClientRect().left - left.getBoundingClientRect().left) / scale;
		const timing = { duration: DURATION, delay: DELAY, easing: 'linear', fill: 'backwards' };

		// each label begins in the other card's slot and ends in its own
		left.animate(path(dx, 1), timing); // the left label sinks on its way across
		right.animate(path(-dx, -1), timing); // the right label rises
	}

	function init() {
		Reveal.on('slidechanged', (e) => {
			const from = e.previousSlide;
			const to = e.currentSlide;
			if (from && to && from.id === 'cond-correct' && to.id === 'cond-swapped') swap(to);
		});
	}

	if (Reveal.isReady()) {
		init();
	} else {
		Reveal.on('ready', init);
	}
})();
