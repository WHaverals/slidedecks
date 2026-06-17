'use strict';

/**
 * Floating verse slips for animated title slides (Matter.js).
 * Call FloatingVerses.start(zoneEl) when the slide is active; stop() on leave.
 */
window.FloatingVerses = (function () {
	const CONFIG = {
		frictionAir: 0.055,
		restitution: 0.15,
		lift: -0.00006,
		swayAmp: 0.000022,
		swayPeriod: 4200,
		maxActive: 6,
		streamCadence: 3200,
		minVerticalGap: 105,
		maxStreamGap: 200,
		fragSeparation: 0.000045,
		// Right lane only — title sits left of laneEdge; slips may nudge across slightly.
		laneEdge: 0.58,
		laneCrossMax: 0.52,
		spawnMin: 0.58,
		laneRepulsion: 0.0001,
	};

	// Famous, instantly recognizable lines; max two verse lines per slip.
	// Attribution: poet name only — translations as "Virgil (transl. Dryden)";
	// the King James Bible is the one exception (book + source).
	const LINES = [
		{ text: 'Hope is the thing with feathers —<br>That perches in the soul —', attr: 'Emily Dickinson', size: 17 },
		{ text: 'I wandered lonely as a cloud<br>That floats on high o&rsquo;er vales and hills', attr: 'William Wordsworth', size: 16 },
		{ text: 'To be, or not to be,<br>that is the question', attr: 'William Shakespeare', size: 18 },
		{ text: 'Tyger Tyger, burning bright,<br>In the forests of the night', attr: 'William Blake', size: 16 },
		{ text: 'The curfew tolls the knell of parting day,<br>The lowing herd wind slowly o&rsquo;er the lea', attr: 'Thomas Gray', size: 14 },
		{ text: 'Things fall apart;<br>the centre cannot hold', attr: 'W.&thinsp;B. Yeats', size: 17 },
		{ text: 'Water, water, every where,<br>Nor any drop to drink', attr: 'S.&thinsp;T. Coleridge', size: 16 },
		{ text: 'Season of mists and mellow fruitfulness,<br>Close bosom-friend of the maturing sun', attr: 'John Keats', size: 14 },
		{ text: 'The mind is its own place, and in itself<br>Can make a Heav&rsquo;n of Hell, a Hell of Heav&rsquo;n', attr: 'John Milton', size: 14 },
		{ text: 'One day I wrote her name upon the strand,<br>But came the waves and washed it away', attr: 'Edmund Spenser', size: 14 },
		{ text: 'To err is human, to forgive, divine', attr: 'Alexander Pope', size: 17 },
		{ text: 'She walks in beauty, like the night<br>Of cloudless climes and starry skies', attr: 'Lord Byron', size: 16 },
		{ text: 'Arms, and the man I sing, who, forc&rsquo;d by fate,<br>And haughty Juno&rsquo;s unrelenting hate', attr: 'Virgil (transl. Dryden)', size: 14 },
		{ text: 'Achilles&rsquo; wrath, to Greece the direful spring<br>Of woes unnumber&rsquo;d, heavenly goddess, sing!', attr: 'Homer (transl. Pope)', size: 14 },
		{ text: 'Immodest words admit of no defence,<br>For want of decency is want of sense', attr: 'Earl of Roscommon', size: 15 },
		{ text: 'Who has seen the wind?<br>Neither I nor you', attr: 'Christina Rossetti', size: 17 },
		{ text: 'O my Luve&rsquo;s like a red, red rose,<br>That&rsquo;s newly sprung in June', attr: 'Robert Burns', size: 16 },
		{ text: 'Fair Daffodils, we weep to see<br>You haste away so soon', attr: 'Robert Herrick', size: 17 },
		{ text: 'Whan that Aprille with his shoures soote,<br>The droghte of March hath perced to the roote', attr: 'Geoffrey Chaucer', size: 14 },
		{ text: 'How do I love thee? Let me count the ways.<br>I love thee to the depth and breadth and height', attr: 'Elizabeth Barrett Browning', size: 14 },
	];

	// verse plus an epigraph-style attribution line
	function fragMarkup(cfg) {
		let html = cfg.text;
		if (cfg.attr) {
			html += '<span class="floating-frag__attr">&mdash;&nbsp;' + cfg.attr + '</span>';
		}
		return html;
	}

	// PPA logo tricolor, assigned per slip — never the same hue twice in a row
	const TINTS = ['ppa-blue', 'ppa-teal', 'ppa-coral'];
	let lastTint = -1;
	function nextTint() {
		let i;
		do {
			i = Math.floor(Math.random() * TINTS.length);
		} while (i === lastTint);
		lastTint = i;
		return TINTS[i];
	}

	function prefersReducedMotion() {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	function isPrintPdf() {
		return /print-pdf/gi.test(window.location.search);
	}

	function staticLayout(zone) {
		const W = zone.clientWidth;
		const H = zone.clientHeight;
		const spots = [
			[0.96, 0.1, -5],
			[0.78, 0.26, 4],
			[0.9, 0.42, -3],
			[0.68, 0.58, 6],
			[0.88, 0.74, 3],
			[0.72, 0.9, -6],
			[0.94, 0.34, 2],
			[0.66, 0.5, -4],
			[0.82, 0.66, 5],
			[0.74, 0.82, -2],
		];

		// static view shows only as many slips as there are layout spots
		LINES.slice(0, spots.length).forEach((cfg, i) => {
			const el = document.createElement('div');
			el.className = 'floating-frag floating-frag--' + TINTS[i % TINTS.length];
			el.style.fontSize = cfg.size + 'px';
			el.innerHTML = fragMarkup(cfg);
			zone.appendChild(el);
			const [px, py, deg] = spots[i];
			el.style.transform =
				'translate(' + px * W + 'px,' + py * H + 'px) rotate(' + deg + 'deg)';
		});

		return { stop() {} };
	}

	function startPhysics(zone) {
		const { Engine, Bodies, Body, Composite } = Matter;

		const engine = Engine.create();
		engine.gravity.y = 0;

		let W = zone.clientWidth;
		let H = zone.clientHeight;
		let walls = [];
		const frags = [];
		const timeouts = [];
		let queue = shuffle([...LINES]);
		let running = true;
		let rafId = 0;
		let last = performance.now();
		let lastGapCheck = 0;
		let spawnPending = false;

		const CAT_LINE = 0x0001;
		const CAT_WALL = 0x0004;

		function buildWalls() {
			walls.forEach((w) => Composite.remove(engine.world, w));
			const opts = {
				isStatic: true,
				collisionFilter: { category: CAT_WALL, mask: CAT_LINE },
			};
			walls = [
				Bodies.rectangle(-30, 0, 60, H * 6, opts),
				Bodies.rectangle(W + 30, 0, 60, H * 6, opts),
			];
			Composite.add(engine.world, walls);
		}

		function onResize() {
			W = zone.clientWidth;
			H = zone.clientHeight;
			buildWalls();
		}

		function schedule(fn, delay) {
			const id = window.setTimeout(fn, delay);
			timeouts.push(id);
			return id;
		}

		function shuffle(arr) {
			for (let i = arr.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[arr[i], arr[j]] = [arr[j], arr[i]];
			}
			return arr;
		}

		function nextCfg() {
			if (!queue.length) queue = shuffle([...LINES]);
			return queue.shift();
		}

		function spawnBounds(w, width) {
			const margin = w / 2 + 8;
			const min = width * CONFIG.spawnMin;
			const max = width - margin;
			return { min, max };
		}

		function spawnPosition(w, width) {
			const { min, max } = spawnBounds(w, width);
			return min + Math.random() * Math.max(1, max - min);
		}

		function findSpawnY(x, w, h) {
			// Just below the frame — enters view within ~1s, not stacked on screen
			let y = H + h * 0.2 + Math.random() * 35;

			for (const other of frags) {
				const dx = Math.abs(other.body.position.x - x);
				if (dx > (w + other.w) * 0.65) continue;

				const needed = (h + other.h) / 2 + CONFIG.minVerticalGap;
				if (Math.abs(other.body.position.y - y) < needed) {
					y = Math.max(y, other.body.position.y + needed);
				}
			}

			return y;
		}

		function trySpawn() {
			if (!running || frags.length >= CONFIG.maxActive) return false;
			spawnLine(nextCfg());
			return true;
		}

		function scheduleSpawn(delay) {
			if (spawnPending) return;
			spawnPending = true;
			schedule(() => {
				spawnPending = false;
				trySpawn();
			}, delay);
		}

		function measure(el) {
			el.style.visibility = 'hidden';
			zone.appendChild(el);
			const r = { w: el.offsetWidth, h: el.offsetHeight };
			el.style.visibility = '';
			return r;
		}

		function removeFrag(frag) {
			Composite.remove(engine.world, frag.body);
			frag.el.remove();
			const i = frags.indexOf(frag);
			if (i >= 0) frags.splice(i, 1);
		}

		function spawnSoon(delay) {
			scheduleSpawn(delay);
		}

		function applyFragmentSeparation() {
			for (let i = 0; i < frags.length; i++) {
				for (let j = i + 1; j < frags.length; j++) {
					const a = frags[i];
					const b = frags[j];
					const dx = b.body.position.x - a.body.position.x;
					if (Math.abs(dx) > (a.w + b.w) * 0.65) continue;

					const dy = b.body.position.y - a.body.position.y;
					const needed = (a.h + b.h) / 2 + CONFIG.minVerticalGap;
					const overlap = needed - Math.abs(dy);
					if (overlap <= 0) continue;

					const push = CONFIG.fragSeparation * overlap * Math.min(1, overlap / 50);
					const sign = dy >= 0 ? 1 : -1;
					a.body.force.y -= a.body.mass * push * sign;
					b.body.force.y += b.body.mass * push * sign;
				}
			}
		}

		function checkStreamGaps(now) {
			if (now - lastGapCheck < 1200) return;
			lastGapCheck = now;
			if (frags.length >= CONFIG.maxActive || spawnPending) return;

			const visible = frags
				.filter((f) => f.body.position.y > -f.h && f.body.position.y < H + f.h)
				.sort((a, b) => a.body.position.y - b.body.position.y);

			if (!visible.length) {
				scheduleSpawn(200);
				return;
			}

			const topEdge = visible[0].body.position.y - visible[0].h / 2;
			if (topEdge > CONFIG.maxStreamGap) {
				scheduleSpawn(300);
				return;
			}

			for (let i = 0; i < visible.length - 1; i++) {
				const lowerEdge = visible[i].body.position.y + visible[i].h / 2;
				const upperEdge = visible[i + 1].body.position.y - visible[i + 1].h / 2;
				if (upperEdge - lowerEdge > CONFIG.maxStreamGap) {
					scheduleSpawn(400);
					return;
				}
			}

			const bottomEdge =
				visible[visible.length - 1].body.position.y +
				visible[visible.length - 1].h / 2;
			if (H - bottomEdge > CONFIG.maxStreamGap * 1.4) {
				scheduleSpawn(500);
			}
		}

		function spawnLine(cfg) {
			const el = document.createElement('div');
			el.className = 'floating-frag floating-frag--' + nextTint();
			el.style.fontSize = cfg.size + 'px';
			el.innerHTML = fragMarkup(cfg);
			const { w, h } = measure(el);

			const x = spawnPosition(w, W);
			const tilt = (Math.random() - 0.5) * 0.34;
			const ySpawn = findSpawnY(x, w, h);
			const body = Bodies.rectangle(x, ySpawn, w, h, {
				frictionAir: CONFIG.frictionAir,
				restitution: CONFIG.restitution,
				friction: 0,
				chamfer: { radius: 6 },
				collisionFilter: { category: CAT_LINE, mask: CAT_WALL },
			});
			Body.setInertia(body, body.inertia * 6);
			Body.setAngle(body, tilt);

			const liftScale = 0.88 + Math.random() * 0.14;
			Body.setVelocity(body, {
				x: (Math.random() - 0.5) * 0.1,
				y: -(0.28 + Math.random() * 0.08) * liftScale,
			});
			Composite.add(engine.world, body);

			el.style.transform =
				'translate(' +
				(x - w / 2) +
				'px,' +
				(body.position.y - h / 2) +
				'px) rotate(' +
				body.angle +
				'rad)';

			frags.push({
				cfg,
				el,
				body,
				w,
				h,
				bobPhase: Math.random() * Math.PI * 2,
				swayPeriod: CONFIG.swayPeriod * (0.7 + Math.random() * 0.8),
				liftScale,
				restAngle: tilt + (Math.random() - 0.5) * 0.12,
			});
		}

		function applyLateralForces(frag, m, now) {
			const { body } = frag;
			const x = body.position.x;
			const edge = W * CONFIG.laneEdge;
			const crossMax = W * CONFIG.laneCrossMax;

			// Nudge back right when drifting into the title lane — soft near the edge,
			// firmer if they cross too far left.
			if (x < edge) {
				if (x < crossMax) {
					const depth = Math.min(1, (crossMax - x) / (crossMax * 0.35));
					body.force.x += m * CONFIG.laneRepulsion * 1.5 * depth;
				} else {
					const depth = (edge - x) / (edge - crossMax);
					body.force.x += m * CONFIG.laneRepulsion * depth * depth;
				}
			}

			body.force.x += m * CONFIG.swayAmp * Math.sin(now / frag.swayPeriod + frag.bobPhase);
		}

		function tick(now) {
			applyFragmentSeparation();
			checkStreamGaps(now);

			for (const frag of [...frags]) {
				const { body } = frag;
				const m = body.mass;

				body.torque += (frag.restAngle - body.angle) * body.inertia * 0.00006;
				Body.setAngularVelocity(body, body.angularVelocity * 0.985);
				body.force.y += m * CONFIG.lift * frag.liftScale;
				applyLateralForces(frag, m, now);

				if (body.position.y < -frag.h * 2) {
					removeFrag(frag);
					scheduleSpawn(CONFIG.streamCadence * 0.35);
				}
			}
		}

		function render() {
			for (const f of frags) {
				f.el.style.transform =
					'translate(' +
					(f.body.position.x - f.w / 2) +
					'px,' +
					(f.body.position.y - f.h / 2) +
					'px) rotate(' +
					f.body.angle +
					'rad)';
			}
		}

		function loop(now) {
			if (running) {
				tick(now);
				Engine.update(engine, Math.min(32, now - last));
				render();
			}
			last = now;
			rafId = requestAnimationFrame(loop);
		}

		function onVisibilityChange() {
			running = !document.hidden;
		}

		buildWalls();
		window.addEventListener('resize', onResize);
		document.addEventListener('visibilitychange', onVisibilityChange);

		// First slips rise in from below right away — no on-screen pre-seed
		trySpawn();
		schedule(() => trySpawn(), 2600);

		function pumpStream() {
			if (!running) return;
			if (frags.length < CONFIG.maxActive) trySpawn();
			schedule(pumpStream, CONFIG.streamCadence);
		}
		schedule(pumpStream, CONFIG.streamCadence);

		rafId = requestAnimationFrame(loop);

		return {
			stop() {
				running = false;
				cancelAnimationFrame(rafId);
				timeouts.forEach((id) => clearTimeout(id));
				window.removeEventListener('resize', onResize);
				document.removeEventListener('visibilitychange', onVisibilityChange);
				frags.forEach((frag) => {
					Composite.remove(engine.world, frag.body);
					frag.el.remove();
				});
				frags.length = 0;
				walls.forEach((w) => Composite.remove(engine.world, w));
				Engine.clear(engine);
				// no wholesale zone wipe here: stop() can run delayed, after a
				// newer instance has already started rendering into the zone
			},
		};
	}

	function start(zone) {
		if (!zone) return { stop() {} };
		zone.innerHTML = '';

		if (prefersReducedMotion() || isPrintPdf() || typeof Matter === 'undefined') {
			return staticLayout(zone);
		}

		return startPhysics(zone);
	}

	return { start };
})();
