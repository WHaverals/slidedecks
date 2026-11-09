/* Swapped labels: on arrival from the "correct labels" slide, the two labels start in the
   cards they had there and trade places. The markup already holds the final state, so print,
   ?nomotion, reduced motion, backward navigation and direct jumps simply show it.

   Reveal's own auto-animate cannot do this: it measures each element against its offset
   parent, and both labels sit at the same offset inside their (positioned) cards. */
(function () {
	const noMotion =
		/print-pdf/i.test(window.location.search) ||
		/nomotion/i.test(window.location.search) ||
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (noMotion || !('animate' in Element.prototype)) return;

	const LIFT = 17; // px: one label rises and the other sinks, so they pass without touching
	const DELAY = 700; // ms: let the slide change settle first
	const DURATION = 1300;
	const EASE = 'cubic-bezier(0.5, 0, 0.2, 1)';

	function swap(slide) {
		const left = slide.querySelector('[data-id="lab-ai"]'); // ends in the left card
		const right = slide.querySelector('[data-id="lab-q"]'); // ends in the right card
		if (!left || !right) return;

		const scale = Reveal.getScale() || 1;
		const dx = (right.getBoundingClientRect().left - left.getBoundingClientRect().left) / scale;
		const timing = { duration: DURATION, delay: DELAY, easing: EASE, fill: 'backwards' };

		// each label begins in the other card's slot and ends in its own
		left.animate(
			[
				{ transform: `translate(${dx}px, 0)` },
				{ transform: `translate(${dx / 2}px, ${LIFT}px)`, offset: 0.5 },
				{ transform: 'translate(0, 0)' },
			],
			timing
		);
		right.animate(
			[
				{ transform: `translate(${-dx}px, 0)` },
				{ transform: `translate(${-dx / 2}px, ${-LIFT}px)`, offset: 0.5 },
				{ transform: 'translate(0, 0)' },
			],
			timing
		);
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
