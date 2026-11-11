/* Title slide: a slow sliding puzzle.
   The collage of Queneau (twelve cut photographs) is split into its twelve pieces, the piece
   with no face in it (bottom right, dark cloth) is taken out, and the others slide one at a time
   into the gap, the way a shuffle puzzle works. One move every few seconds, no more.

   Print, ?nomotion and reduced motion get a fixed, partly shuffled arrangement and no timer. */
(function () {
	const IMG = 'figures/queneau-collage.jpg';
	const IW = 1400;
	const IH = 1876;
	const COLS = 4;
	const ROWS = 3;
	const CW = 330; // one cell in image pixels
	const CH = 650;
	const GAP = 12;
	const BOX_W = COLS * CW + (COLS - 1) * GAP;
	const BOX_H = ROWS * CH + (ROWS - 1) * GAP;

	// Where each piece sits in the photograph: the top of its source window per row, and the
	// centre of the piece per cell. Windows end inside the paper gap, so no neighbour shows.
	const ROW_Y = [-52, 600, 1260];
	const CX = [
		[190, 523, 868.5, 1202],
		[195.5, 533, 869, 1197.5],
		[193, 527, 860, 1198],
	];
	const MISSING = 11; // bottom right: dark cloth, no face

	const FIRST_MOVE_MS = 3600;
	const EVERY_MS = 2800;
	const SLIDE_MS = 1200;

	const NS = 'http://www.w3.org/2000/svg';
	const noMotion =
		/print-pdf/i.test(window.location.search) ||
		/nomotion/i.test(window.location.search) ||
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	function seeded(seed) {
		return function () {
			seed |= 0;
			seed = (seed + 0x6d2b79f5) | 0;
			let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	function mount(box) {
		const tiles = []; // tile i is the piece whose home cell is i
		const tileAt = new Array(COLS * ROWS).fill(-1);
		let blank = MISSING;
		let last = -1;
		let timer = null;

		box.style.setProperty('--sp-slide-ms', SLIDE_MS + 'ms');
		box.classList.add('is-static'); // no transitions while the pieces are first laid out

		for (let cell = 0; cell < COLS * ROWS; cell++) {
			if (cell === MISSING) continue;
			const col = cell % COLS;
			const row = Math.floor(cell / COLS);
			const svg = document.createElementNS(NS, 'svg');
			svg.setAttribute('class', 'pz-tile');
			svg.setAttribute('viewBox', `${CX[row][col] - CW / 2} ${ROW_Y[row]} ${CW} ${CH}`);
			svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
			const img = document.createElementNS(NS, 'image');
			img.setAttribute('href', IMG);
			img.setAttribute('width', IW);
			img.setAttribute('height', IH);
			svg.appendChild(img);
			box.appendChild(svg);
			tiles[cell] = svg;
			tileAt[cell] = cell;
			place(cell, cell);
		}

		function place(tile, cell) {
			const col = cell % COLS;
			const row = Math.floor(cell / COLS);
			const el = tiles[tile];
			el.style.left = ((col * (CW + GAP)) / BOX_W) * 100 + '%';
			el.style.top = ((row * (CH + GAP)) / BOX_H) * 100 + '%';
		}

		function neighbours(cell) {
			const col = cell % COLS;
			const row = Math.floor(cell / COLS);
			const out = [];
			if (col > 0) out.push(cell - 1);
			if (col < COLS - 1) out.push(cell + 1);
			if (row > 0) out.push(cell - COLS);
			if (row < ROWS - 1) out.push(cell + COLS);
			return out;
		}

		// one move: a piece next to the gap slides into it (never straight back where it came from)
		function step(rand) {
			const options = neighbours(blank).filter((c) => tileAt[c] !== last);
			const from = options[Math.floor(rand() * options.length)];
			const tile = tileAt[from];
			tileAt[blank] = tile;
			tileAt[from] = -1;
			place(tile, blank);
			blank = from;
			last = tile;
		}

		const rand = noMotion ? seeded(7) : Math.random;
		if (noMotion) {
			for (let i = 0; i < 46; i++) step(rand);
		}
		// let the first layout settle, then allow transitions
		requestAnimationFrame(() => requestAnimationFrame(() => box.classList.remove('is-static')));

		function tick() {
			step(rand);
			timer = setTimeout(tick, EVERY_MS);
		}

		return {
			play() {
				if (noMotion || timer) return;
				timer = setTimeout(tick, FIRST_MOVE_MS);
			},
			pause() {
				clearTimeout(timer);
				timer = null;
			},
		};
	}

	window.QueneauPuzzle = { mount };
})();
