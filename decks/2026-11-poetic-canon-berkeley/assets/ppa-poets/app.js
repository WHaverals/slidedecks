/* global graphology, Sigma */
// PPA Poets. Loads data/network.json + data/time.json (built by tools/ppa_poets/build_data.py),
// keeps the archive-wide Gephi layout, and recomputes node/edge styles from one `state` object.
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const yearStr = (y) => (y == null ? "" : y < 0 ? `${-y} BCE` : String(y));

  const DATA_VERSION = "20261019"; // bump when data/*.json is rebuilt
  // Berkeley deck copy: data comes from the published site; embed.html sets both globals.
  const BASE = String(window.PPA_POETS_ASSET_BASE || "./").replace(/\/?$/, "/");
  const query = new URLSearchParams(location.search);
  const EMBED = query.get("embed") === "1" || !!window.PPA_POETS_EMBED;
  if (EMBED) document.body.classList.add("embed");

  const DEFAULTS = { mode: "all", w: 27, links: 3, size: "links", color: "group", hideAbsent: false, markNew: false };
  const state = { ...DEFAULTS, isolate: new Set(), selected: -1, sort: "assoc", showAllNb: false };

  function setStatus(msg) { $("status").textContent = msg || ""; }

  async function getJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status} ${r.statusText}`);
    return r.json();
  }

  function darken(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c * (1 - f)));
    return `rgb(${ch.join(",")})`;
  }

  (async function main() {
    const [net, time] = await Promise.all([getJSON(`${BASE}data/network.json?v=${DATA_VERSION}`), getJSON(`${BASE}data/time.json?v=${DATA_VERSION}`)]);
    setStatus("Building the map…");
    // Berkeley deck copy: per-community colour overrides set in embed.html (the published data stays as is).
    const recolor = window.PPA_POETS_GROUP_COLORS || {};
    for (const g of net.groups) if (recolor[g.id]) g.color = recolor[g.id];

    const ND = net.nodes;
    const ED = net.edges;
    const N = ND.qid.length;
    const E = ED.s.length;
    const WINS = time.windows;
    const qidIndex = new Map(ND.qid.map((q, i) => [q, i]));
    const adj = Array.from({ length: N }, () => []);
    for (let e = 0; e < E; e++) { adj[ED.s[e]].push(e); adj[ED.t[e]].push(e); }
    const maxDeg = Math.max(...ND.deg);
    const maxWorks = Math.max(...ND.works);
    let maxAssoc = 0;
    for (let e = 0; e < E; e++) if (ED.a[e] > maxAssoc) maxAssoc = ED.a[e];
    const other = (e, i) => (ED.s[e] === i ? ED.t[e] : ED.s[e]);

    const cats = {
      group: { list: net.groups, of: (i) => ND.group[i] },
      period: { list: net.periods, of: (i) => ND.period[i] },
    };
    const catOf = (i) => cats[state.color].of(i);
    const catColor = (i) => cats[state.color].list[catOf(i)].color;

    // ---------- per-window derived data (cached) ----------
    const winCache = new Map();
    function windowData(w) {
      if (winCache.has(w)) return winCache.get(w);
      const src = time.edges[w];
      const works = new Int32Array(E);
      const assoc = new Float32Array(E);
      const deg = new Int32Array(N);
      const perNode = Array.from({ length: N }, () => []);
      let maxA = 0;
      for (let k = 0; k < src.e.length; k++) {
        const e = src.e[k];
        works[e] = src.w[k] || 1;
        assoc[e] = src.a[k];
        if (src.a[k] > maxA) maxA = src.a[k];
        deg[ED.s[e]]++; deg[ED.t[e]]++;
        perNode[ED.s[e]].push(e); perNode[ED.t[e]].push(e);
      }
      const rank = new Int32Array(E).fill(1e9);
      for (const list of perNode) {
        list.sort((a, b) => assoc[b] - assoc[a]);
        list.forEach((e, r) => { if (r + 1 < rank[e]) rank[e] = r + 1; });
      }
      const present = time.nodeWorks[w];
      const win = WINS[w];
      const lastDecade = win.end - 9;
      const isNew = new Uint8Array(N);
      let nNew = 0;
      let maxDegW = 0;
      let maxWorksW = 0;
      let nPresent = 0;
      for (let i = 0; i < N; i++) {
        if (present[i] > 0) {
          nPresent++;
          if (present[i] > maxWorksW) maxWorksW = present[i];
          if (ND.entry[i] != null && ND.entry[i] >= lastDecade && ND.entry[i] <= win.end) { isNew[i] = 1; nNew++; }
        }
        if (deg[i] > maxDegW) maxDegW = deg[i];
      }
      const d = { works, assoc, deg, rank, present, isNew, nNew, maxA: maxA || 1, maxDeg: maxDegW || 1, maxWorks: maxWorksW || 1, nPresent, nLinks: src.e.length, lastDecade };
      winCache.set(w, d);
      return d;
    }
    const curWin = () => (state.mode === "window" ? windowData(state.w) : null);

    // ---------- graph + renderer ----------
    const GraphCtor = graphology.Graph || graphology;
    const graph = new GraphCtor({ type: "undirected", multi: false });
    for (let i = 0; i < N; i++) graph.addNode(String(i), { x: ND.x[i], y: ND.y[i], size: 3, label: ND.short[i], color: "#999" });
    for (let e = 0; e < E; e++) graph.addUndirectedEdgeWithKey(String(e), String(ED.s[e]), String(ED.t[e]), { size: 1, color: "#ccc" });

    // Style arrays, filled by computeStyles(); prefilled so Sigma's first render has valid values.
    const nColor = new Array(N).fill("#999999");
    const nSize = new Float32Array(N).fill(3);
    const nBorder = new Float32Array(N);
    const nBorderColor = new Array(N).fill("#ffffff");
    const nLabel = new Array(N).fill("");
    const nForce = new Uint8Array(N);
    const nZ = new Int8Array(N);
    const nHidden = new Uint8Array(N);
    const eShow = new Uint8Array(E);
    const eColor = new Array(E).fill("#cccccc");
    const eSize = new Float32Array(E);

    // Labels are drawn by our own collision-checked layer (drawLabels below), so Sigma's
    // label pass is a no-op and its hover pass only draws a ring.
    function drawLabel() {}
    function drawHover(ctx, data) {
      ctx.beginPath();
      ctx.arc(data.x, data.y, data.size + 2.5, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#1d1d1f";
      ctx.stroke();
    }

    const BorderProgram = Sigma.rendering.createNodeBorderProgram({
      borders: [
        { size: { attribute: "borderSize", defaultValue: 0 }, color: { attribute: "borderColor" } },
        { size: { fill: true }, color: { attribute: "color" } },
      ],
      drawLabel,
      drawHover,
    });

    const renderer = new Sigma(graph, $("graph"), {
      defaultNodeType: "bordered",
      nodeProgramClasses: { bordered: BorderProgram },
      defaultEdgeType: "line",
      labelFont: "Inter, system-ui, sans-serif",
      labelWeight: "600",
      labelSize: 12,
      renderLabels: false,
      defaultDrawNodeLabel: drawLabel,
      defaultDrawNodeHover: drawHover,
      minEdgeThickness: 0.6,
      zIndex: true,
      stagePadding: 24,
      allowInvalidContainer: true, // the page may load in a hidden or zero-size frame

      hideEdgesOnMove: false,
      nodeReducer: (key, data) => {
        const i = +key;
        return {
          ...data,
          color: nColor[i], size: nSize[i], borderSize: nBorder[i], borderColor: nBorderColor[i],
          label: nLabel[i], hoverLabel: ND.short[i], forceLabel: !!nForce[i], zIndex: nZ[i], hidden: !!nHidden[i],
        };
      },
      edgeReducer: (key, data) => {
        const e = +key;
        if (!eShow[e]) return { ...data, hidden: true };
        return { ...data, hidden: false, color: eColor[e], size: eSize[e] };
      },
    });
    const camera = renderer.getCamera();

    // ---------- styles ----------
    const sizeFor = (v, m) => (m > 0 ? 2.4 + 19 * Math.sqrt(Math.max(v, 0) / m) : 2.4);
    let ego = null;
    let egoEdges = null;

    function egoList(i, win) {
      const list = [];
      for (const e of adj[i]) {
        if (win && !win.works[e]) continue;
        const j = other(e, i);
        const a = win ? win.assoc[e] : ED.a[e];
        const w = win ? win.works[e] : ED.w[e];
        list.push({ e, j, a, w, x: w - a });
      }
      return list;
    }

    function computeStyles() {
      const win = curWin();
      const iso = state.isolate.size > 0;
      const sel = state.selected;
      let top = null;
      ego = null;
      egoEdges = null;
      if (sel >= 0) {
        const list = egoList(sel, win).sort((a, b) => b.a - a.a);
        ego = new Set([sel, ...list.map((d) => d.j)]);
        egoEdges = new Set(list.map((d) => d.e));
        top = new Set(list.slice(0, 14).map((d) => d.j));
      }
      for (let i = 0; i < N; i++) {
        const present = !win || win.present[i] > 0;
        const linked = !win || win.deg[i] > 0;
        let color = catColor(i);
        let size;
        if (state.size === "links") size = win ? sizeFor(win.deg[i], win.maxDeg) : sizeFor(ND.deg[i], maxDeg);
        else size = win ? sizeFor(win.present[i], win.maxWorks) : sizeFor(ND.works[i], maxWorks);
        let border = 0.1;
        let borderColor = "#ffffff";
        let label = ND.short[i];
        let force = 0;
        let z = 1;
        let hidden = 0;
        // Node colours must be opaque: Sigma's node shader does not premultiply alpha,
        // so translucent fills render as near-white blotches.
        if (!present) {
          color = "#d2d2cd";
          size = 1.9;
          border = 0;
          borderColor = color;
          label = "";
          z = 0;
          if (state.hideAbsent && i !== sel) hidden = 1;
        } else if (!linked) {
          borderColor = color;
          color = "#ffffff";
          border = 0.36;
          size = Math.max(size, 3.4);
        }
        if (win && present && state.markNew && win.isNew[i]) {
          borderColor = "#111111";
          border = 0.34;
          size = Math.max(size * 1.15, 4.5);
          z = 2;
        }
        if (iso && present && !state.isolate.has(catOf(i))) {
          color = "#e2e2de";
          border = 0;
          borderColor = color;
          size = Math.min(size * 0.6, 4);
          label = "";
          z = 0;
        }
        if (ego) {
          if (i === sel) {
            border = 0.3;
            borderColor = "#111111";
            size = Math.max(size * 1.2, 8);
            force = 1;
            z = 4;
            if (!present) { color = "#bbbbbb"; label = ND.short[i]; }
          } else if (ego.has(i)) {
            z = 3;
            if (top.has(i)) force = 1;
          } else {
            if (present) { color = "#e4e4e0"; border = 0; borderColor = color; size = Math.min(size * 0.5, 2.4); }
            label = "";
            z = 0;
          }
        }
        nColor[i] = color; nSize[i] = size; nBorder[i] = border; nBorderColor[i] = borderColor;
        nLabel[i] = label; nForce[i] = force; nZ[i] = z; nHidden[i] = hidden;
      }

      const k = state.links || Infinity;
      const maxA = win ? win.maxA : maxAssoc;
      const logMax = Math.log1p(maxA);
      let shown = 0;
      for (let e = 0; e < E; e++) {
        let show = 0;
        let a = 0;
        if (ego) {
          if (egoEdges.has(e)) { show = 1; a = win ? win.assoc[e] : ED.a[e]; }
        } else if (win) {
          if (win.works[e] && win.rank[e] <= k) { show = 1; a = win.assoc[e]; }
        } else if (ED.r[e] <= k) {
          show = 1; a = ED.a[e];
        }
        if (show && iso && !ego && (!state.isolate.has(catOf(ED.s[e])) || !state.isolate.has(catOf(ED.t[e])))) show = 0;
        eShow[e] = show;
        if (show) {
          shown++;
          const t = Math.log1p(Math.max(a, 0)) / logMax;
          if (ego) { eColor[e] = `rgba(25,25,35,${(0.2 + 0.6 * t).toFixed(3)})`; eSize[e] = 0.7 + 2.6 * t; }
          else { eColor[e] = `rgba(45,45,55,${(0.05 + 0.42 * t).toFixed(3)})`; eSize[e] = 0.45 + 1.9 * t; }
        }
      }
      const hideOnMove = shown > 12000;
      if (renderer.getSetting("hideEdgesOnMove") !== hideOnMove) renderer.setSetting("hideEdgesOnMove", hideOnMove);
      return shown;
    }

    function refresh() {
      const shown = computeStyles();
      renderer.refresh();
      updateEncodingNote(shown);
    }

    // ---------- camera ----------
    function availableRect() {
      const W = innerWidth;
      const H = innerHeight;
      let left = 0, right = W, top = 0, bottom = H;
      const panel = $("panel").getBoundingClientRect();
      const drawerOpen = !$("drawer").hidden;
      if (W > 720) {
        // A collapsed panel is a short bar: it only takes space at the top.
        if ($("panel").classList.contains("collapsed")) top = panel.bottom + 4;
        else left = panel.right + 8;
        if (drawerOpen) right = $("drawer").getBoundingClientRect().left - 8;
        right -= Math.min(90, 0.2 * (right - left)); // room for labels, which extend to the right of their node
      } else {
        top = panel.bottom + 4;
        if (drawerOpen) bottom = $("drawer").getBoundingClientRect().top - 4;
      }
      if (right - left < 220) { left = 0; right = W; }
      if (bottom - top < 160) { top = 0; bottom = H; }
      return { left, right, top, bottom };
    }

    function fitTo(indices, { duration = 550, pad = 1.18, minRatio = 0.035, maxRatio = 1.4, minBox = 0.04 } = {}) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const i of indices) {
        const d = renderer.getNodeDisplayData(String(i));
        if (!d) continue;
        x0 = Math.min(x0, d.x); x1 = Math.max(x1, d.x); y0 = Math.min(y0, d.y); y1 = Math.max(y1, d.y);
      }
      if (!Number.isFinite(x0)) return;
      const W = innerWidth;
      const H = innerHeight;
      const st = camera.getState();
      const p0 = renderer.viewportToFramedGraph({ x: 0, y: 0 });
      const p1 = renderer.viewportToFramedGraph({ x: W, y: H });
      const sx = (p1.x - p0.x) / W;
      const sy = (p1.y - p0.y) / H;
      const r = availableRect();
      const aw = r.right - r.left;
      const ah = r.bottom - r.top;
      const bw = Math.max(x1 - x0, minBox);
      const bh = Math.max(y1 - y0, minBox);
      let k = Math.max(bw / (aw * Math.abs(sx)), bh / (ah * Math.abs(sy))) * pad;
      const ratio = Math.min(maxRatio, Math.max(minRatio, st.ratio * k));
      k = ratio / st.ratio;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const target = {
        x: cx - ((r.left + r.right) / 2 - W / 2) * sx * k,
        y: cy - ((r.top + r.bottom) / 2 - H / 2) * sy * k,
        ratio,
        angle: 0,
      };
      if (duration > 0) camera.animate(target, { duration });
      else camera.setState(target);
    }
    const ALL = Array.from({ length: N }, (_, i) => i);
    const fitAll = (duration = 550) => fitTo(ALL, { duration, pad: 1.04 });

    // ---------- label layer: community names + collision-checked poet names ----------
    const labelCanvas = document.createElement("canvas");
    labelCanvas.id = "labelLayer";
    labelCanvas.setAttribute("aria-hidden", "true");
    document.body.insertBefore(labelCanvas, $("panel"));
    const lctx = labelCanvas.getContext("2d");
    const FONT = "Inter, system-ui, sans-serif";
    const widthCache = new Map();
    function textWidth(text, font, spacing = "0px") {
      const key = `${font}|${spacing}|${text}`;
      let w = widthCache.get(key);
      if (w == null) {
        lctx.font = font;
        if ("letterSpacing" in lctx) lctx.letterSpacing = spacing;
        w = lctx.measureText(text).width;
        widthCache.set(key, w);
      }
      return w;
    }

    // Each community name sits toward the outer edge of its group, where nodes are small and unlabelled.
    let gcx = 0, gcy = 0;
    for (let i = 0; i < N; i++) { gcx += ND.x[i]; gcy += ND.y[i]; }
    gcx /= N; gcy /= N;
    const regions = net.groups.map((g, gi) => {
      const members = [];
      let sx = 0, sy = 0, sw = 0;
      for (let i = 0; i < N; i++) if (ND.group[i] === gi) { members.push(i); const w = ND.deg[i]; sx += ND.x[i] * w; sy += ND.y[i] * w; sw += w; }
      let dx = sx / sw - gcx, dy = sy / sw - gcy;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const s = members.map((i) => (ND.x[i] - gcx) * dx + (ND.y[i] - gcy) * dy).sort((a, b) => a - b);
      const t = members.map((i) => -(ND.x[i] - gcx) * dy + (ND.y[i] - gcy) * dx).sort((a, b) => a - b);
      const sv = s[Math.floor(0.82 * (s.length - 1))];
      const tv = t[Math.floor(0.5 * (t.length - 1))];
      return { gi, members, name: g.name.toUpperCase(), color: darken(g.color, 0.32), x: gcx + sv * dx - tv * dy, y: gcy + sv * dy + tv * dx };
    });

    let hovered = -1;
    function drawLabels() {
      const dpr = window.devicePixelRatio || 1;
      const W = innerWidth;
      const H = innerHeight;
      if (labelCanvas.width !== Math.round(W * dpr) || labelCanvas.height !== Math.round(H * dpr)) {
        labelCanvas.width = Math.round(W * dpr);
        labelCanvas.height = Math.round(H * dpr);
      }
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.clearRect(0, 0, W, H);
      lctx.lineJoin = "round";
      lctx.textBaseline = "middle";
      const placed = [];
      for (const el of [$("panel"), $("drawer")]) {
        if (el.hidden) continue;
        const r = el.getBoundingClientRect();
        placed.push([r.left, r.top, r.right, r.bottom]);
      }
      const hits = (b) => placed.some((p) => b[0] < p[2] && b[2] > p[0] && b[1] < p[3] && b[3] > p[1]);
      const ratio = camera.getState().ratio;
      const win = curWin();

      if (state.color === "group" && state.selected < 0 && ratio > 0.28) {
        const font = `700 11px ${FONT}`;
        const shares = regions.map((r) => (win ? r.members.filter((i) => win.present[i] > 0).length / r.members.length : 1));
        const maxShare = Math.max(...shares) || 1;
        regions.forEach((r, k) => {
          const vp = renderer.graphToViewport({ x: r.x, y: r.y });
          const w = textWidth(r.name, font, "1px");
          const box = [vp.x - w / 2 - 4, vp.y - 8, vp.x + w / 2 + 4, vp.y + 8];
          if (hits(box)) return;
          let alpha = win ? 0.3 + 0.7 * (shares[k] / maxShare) : 1;
          if (state.isolate.size && !state.isolate.has(r.gi)) alpha = 0.25;
          lctx.globalAlpha = alpha;
          lctx.font = font;
          if ("letterSpacing" in lctx) lctx.letterSpacing = "1px";
          lctx.textAlign = "center";
          lctx.lineWidth = 5;
          lctx.strokeStyle = "rgba(251,251,249,0.96)";
          lctx.strokeText(r.name, vp.x, vp.y);
          lctx.fillStyle = r.color;
          lctx.fillText(r.name, vp.x, vp.y);
          placed.push(box);
        });
        lctx.globalAlpha = 1;
        if ("letterSpacing" in lctx) lctx.letterSpacing = "0px";
      }

      lctx.textAlign = "left";
      const cand = [];
      for (let i = 0; i < N; i++) {
        if (nHidden[i] || (!nLabel[i] && i !== hovered)) continue;
        const d = renderer.getNodeDisplayData(String(i));
        if (!d) continue;
        const r = renderer.scaleSize ? renderer.scaleSize(d.size) : d.size / Math.sqrt(ratio);
        const pri = i === hovered ? 1e7 : i === state.selected ? 1e6 : (nForce[i] ? 1e5 : 0) + r;
        if (pri < 1e5 && r < 7.5) continue;
        const vp = renderer.framedGraphToViewport(d);
        if (vp.x < -60 || vp.y < -20 || vp.x > W + 10 || vp.y > H + 20) continue;
        cand.push([pri, i, vp.x, vp.y, r]);
      }
      cand.sort((a, b) => b[0] - a[0]);
      let count = 0;
      for (const [pri, i, x, y, r] of cand) {
        const strong = pri >= 1e5;
        const font = `${strong ? 700 : 600} ${i === hovered ? 13 : 12}px ${FONT}`;
        const text = ND.short[i];
        const w = textWidth(text, font);
        const lx = x + r + 3;
        const box = [lx - 2, y - 8, lx + w + 2, y + 8];
        if (i !== hovered && hits(box)) continue;
        lctx.font = font;
        lctx.lineWidth = 4;
        lctx.strokeStyle = "rgba(251,251,249,0.96)";
        lctx.strokeText(text, lx, y);
        lctx.fillStyle = "#1d1d1f";
        lctx.fillText(text, lx, y);
        placed.push(box);
        if (++count >= 120) break;
      }
    }
    renderer.on("afterRender", drawLabels);
    addEventListener("resize", () => requestAnimationFrame(drawLabels));

    // ---------- tooltip ----------
    const tip = $("tooltip");
    renderer.on("enterNode", ({ node, event }) => {
      const i = +node;
      const win = curWin();
      const cat = cats.group.list[ND.group[i]];
      let html = `<div class="tName">${esc(ND.label[i])}</div>`;
      html += `<div class="tSub">${ND.birth[i] != null ? `born ${yearStr(ND.birth[i])} · ` : ""}${esc(cat.name)}</div>`;
      if (win) {
        const w = WINS[state.w];
        html += win.present[i] > 0
          ? `<div>${w.label}: named in ${fmt(win.present[i])} work${win.present[i] === 1 ? "" : "s"} · ${fmt(win.deg[i])} link${win.deg[i] === 1 ? "" : "s"} here</div>`
          : `<div class="tSub">Not named in ${w.label}</div>`;
      } else {
        html += `<div>Named in ${fmt(ND.works[i])} works · linked to ${fmt(ND.deg[i])} poets</div>`;
      }
      tip.innerHTML = html;
      tip.hidden = false;
      const x = Math.min(event.x + 14, innerWidth - tip.offsetWidth - 8);
      const y = Math.min(event.y + 14, innerHeight - tip.offsetHeight - 8);
      tip.style.left = `${x}px`;
      tip.style.top = `${y}px`;
      $("graph").style.cursor = "pointer";
      hovered = i;
      drawLabels();
    });
    renderer.on("leaveNode", () => {
      tip.hidden = true;
      $("graph").style.cursor = "";
      hovered = -1;
      drawLabels();
    });
    camera.on("updated", () => { tip.hidden = true; });

    // ---------- selection + drawer ----------
    renderer.on("clickNode", ({ node }) => select(+node));
    renderer.on("clickStage", () => { if (state.selected >= 0) select(-1); });

    function select(i, { fit = true } = {}) {
      state.selected = i;
      state.showAllNb = false;
      // On mid-size screens the controls and the poet card don't both fit beside the map.
      if (i >= 0 && innerWidth > 720 && innerWidth < 1200) setCollapsed(true);
      renderDrawer();
      refresh();
      if (i >= 0 && fit) {
        const win = curWin();
        const list = egoList(i, win).sort((a, b) => b.a - a.a).slice(0, 20);
        fitTo([i, ...list.map((d) => d.j)], { minBox: list.length ? 0.04 : 0.12, minRatio: 0.12 });
      }
      syncURL();
    }

    function workLine(w, gloss) {
      if (!w) return "";
      const [year, title, author, url, extra] = w;
      const t = esc(title || "Untitled work");
      const titleHtml = url ? `<a href="${esc(url)}" target="_blank" rel="noreferrer">${t}</a>` : t;
      const auth = author ? `<span class="sub">${esc(author)}${gloss ? ` · ${gloss(extra)}` : ""}</span>` : (gloss ? `<span class="sub">${gloss(extra)}</span>` : "");
      return `<div class="workLine"><span class="yr">${esc(year)}</span>${titleHtml}${auth}</div>`;
    }

    function sparkSVG(i) {
      const Wd = 348, Hh = 58, top = 6, base = 44;
      const vals = time.nodeWorks.map((arr) => arr[i]);
      const mx = Math.max(1, ...vals);
      const bw = Wd / WINS.length;
      const color = catColor(i);
      let s = `<svg viewBox="0 0 ${Wd} ${Hh}" role="img" aria-label="Works naming the poet in each 30-year window">`;
      s += `<defs><pattern id="hatchS" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" fill="#e4e5e9"/></pattern></defs>`;
      WINS.forEach((w, k) => {
        const x = k * bw;
        if (w.thin) s += `<rect x="${x}" y="${top}" width="${bw - 1}" height="${base - top}" fill="url(#hatchS)"/>`;
        const h = vals[k] > 0 ? Math.max(1.5, (base - top) * Math.sqrt(vals[k] / mx)) : 0;
        if (h) s += `<rect class="bar" data-w="${k}" x="${x}" y="${base - h}" width="${bw - 1}" height="${h}" fill="${color}"><title>${w.label}: ${vals[k]} works</title></rect>`;
        if (state.mode === "window" && k === state.w) s += `<rect x="${x - 0.5}" y="${top - 2}" width="${bw}" height="${base - top + 4}" fill="none" stroke="#1d1d1f" stroke-width="1.2"/>`;
      });
      const elig = ND.elig[i];
      if (elig != null && elig > 1559) {
        const k = WINS.findIndex((w) => w.end >= elig);
        if (k >= 0) {
          const x = k * bw;
          s += `<line x1="${x}" x2="${x}" y1="${top - 4}" y2="${base}" stroke="#74747c" stroke-dasharray="2,2"/>`;
          s += `<text x="${x + 2}" y="${top + 4}">eligible ${elig}</text>`;
        }
      }
      s += `<line x1="0" x2="${Wd}" y1="${base}" y2="${base}" stroke="#c9cbd1"/>`;
      [0, 10, 20, 30].forEach((k) => { s += `<text x="${k * bw}" y="${Hh - 2}">${WINS[k].start}</text>`; });
      s += `<text x="${Wd}" y="${Hh - 2}" text-anchor="end">1929</text>`;
      return s + "</svg>";
    }

    function heatSVG(i, rows) {
      const nameW = 112, Wd = 348, rowH = 15, top = 4;
      const cw = (Wd - nameW) / WINS.length;
      const Hh = top + rows.length * rowH + 16;
      const cells = rows.map((d) => WINS.map((_, w) => {
        const wd = windowData(w);
        return wd.works[d.e] || 0;
      }));
      const mx = Math.max(1, ...cells.flat());
      let s = `<svg viewBox="0 0 ${Wd} ${Hh}" role="img" aria-label="Co-mentions over time">`;
      rows.forEach((d, r) => {
        const y = top + r * rowH;
        const name = ND.short[d.j].length > 19 ? `${ND.short[d.j].slice(0, 18)}…` : ND.short[d.j];
        s += `<text class="rowName" data-i="${d.j}" x="0" y="${y + 10.5}">${esc(name)}<title>${esc(ND.label[d.j])}</title></text>`;
        cells[r].forEach((v, w) => {
          const x = nameW + w * cw;
          const fill = v > 0 ? `rgba(29,29,31,${(0.12 + 0.88 * Math.sqrt(v / mx)).toFixed(3)})` : "#f1f2f4";
          s += `<rect x="${x}" y="${y}" width="${cw - 1}" height="${rowH - 2}" fill="${fill}"><title>${WINS[w].label}: ${v ? `${v} works name both` : "no link attested"}</title></rect>`;
        });
      });
      if (state.mode === "window") {
        const x = nameW + state.w * cw;
        s += `<rect x="${x - 0.6}" y="${top - 2}" width="${cw + 0.2}" height="${rows.length * rowH + 2}" fill="none" stroke="#2f6fd6" stroke-width="1.3"/>`;
      }
      const yA = top + rows.length * rowH + 11;
      [0, 10, 20, 30].forEach((k) => { s += `<g class="axis"><text x="${nameW + k * cw}" y="${yA}">${WINS[k].start}</text></g>`; });
      return s + "</svg>";
    }

    function renderDrawer() {
      const i = state.selected;
      const drawer = $("drawer");
      if (i < 0) {
        drawer.hidden = true;
        document.body.classList.remove("drawerOpen");
        return;
      }
      drawer.hidden = false;
      document.body.classList.add("drawerOpen");
      const win = curWin();
      const wl = win ? WINS[state.w].label : "";
      const g = cats.group.list[ND.group[i]];
      const p = cats.period.list[ND.period[i]];
      let h = `<h2 class="pName">${esc(ND.label[i])}</h2>`;
      h += `<div class="pSub"><a href="https://www.wikidata.org/wiki/${esc(ND.qid[i])}" target="_blank" rel="noreferrer">${esc(ND.qid[i])} ↗</a>`;
      h += ND.birth[i] != null ? ` · born ${yearStr(ND.birth[i])}` : " · birth year unknown";
      h += `</div><div class="chips"><span class="chip"><span class="dot" style="background:${g.color}"></span>${esc(g.name)}</span>`;
      h += `<span class="chip"><span class="dot" style="background:${p.color}"></span>${esc(p.name)}${p.range ? ` <span class="muted">${esc(p.range)}</span>` : ""}</span></div>`;

      if (win) {
        h += `<div class="stats"><div class="stat"><div class="v">${fmt(win.present[i])}</div><div class="k">works naming them, ${wl}</div></div>`;
        h += `<div class="stat"><div class="v">${fmt(win.deg[i])}</div><div class="k">links attested, ${wl}</div></div></div>`;
        h += `<div class="small muted">Across all years: named in ${fmt(ND.works[i])} works, linked to ${fmt(ND.deg[i])} poets.</div>`;
        if (!win.present[i]) h += `<div class="notice">Not named in any work published ${wl}.</div>`;
        else if (!win.deg[i]) h += `<div class="notice">Named in ${wl}, but no link passes the test inside this window.</div>`;
      } else {
        h += `<div class="stats"><div class="stat"><div class="v">${fmt(ND.works[i])}</div><div class="k">works naming them</div></div>`;
        h += `<div class="stat"><div class="v">${fmt(ND.deg[i])}</div><div class="k">linked poets</div></div></div>`;
      }

      h += `<div class="dSection"><h3>In the archive</h3>`;
      if (ND.first[i]) h += `<div class="gloss">First observed mention${ND.first[i][4] ? ` (p. ${esc(ND.first[i][4])})` : ""}</div>${workLine(ND.first[i])}`;
      if (ND.top[i]) h += `<div class="gloss" style="margin-top:8px">Work with the most pages naming them</div>${workLine(ND.top[i], (n) => (n ? `${fmt(n)} five-page windows` : ""))}`;
      h += `</div>`;

      h += `<div class="dSection spark"><h3>Works naming ${esc(ND.short[i])}, by 30-year window</h3>${sparkSVG(i)}</div>`;

      const list = egoList(i, win);
      list.sort(state.sort === "assoc" ? (a, b) => b.a - a.a : (a, b) => b.w - a.w);
      const shownList = state.showAllNb ? list : list.slice(0, 12);
      const barMax = Math.max(1e-9, ...list.map((d) => (state.sort === "assoc" ? d.a : d.w)));
      h += `<div class="dSection"><div class="dHead"><h3>Named together with</h3>`;
      h += `<div class="seg sortSeg" role="radiogroup" aria-label="Sort"><button type="button" role="radio" data-sort="assoc" aria-checked="${state.sort === "assoc"}" title="Sort by excess over expected">Distinctive</button><button type="button" role="radio" data-sort="works" aria-checked="${state.sort === "works"}" title="Sort by number of shared works">Shared</button></div></div>`;
      h += `<div class="gloss">${win ? `Works from ${wl} naming both within five pages,` : "Works naming both within five pages,"} and how many you would expect if the two names were independent.</div>`;
      if (!list.length) h += `<div class="notice">${win ? `No links attested in ${wl}.` : "No links."}</div>`;
      h += `<ul class="nbList">`;
      for (const d of shownList) {
        const v = state.sort === "assoc" ? d.a : d.w;
        h += `<li data-i="${d.j}" title="${esc(ND.label[d.j])}"><span class="dot" style="background:${catColor(d.j)}"></span><span class="nm">${esc(ND.short[d.j])}</span>`;
        h += `<span class="barWrap"><span class="barFill" style="width:${(100 * Math.max(v, 0) / barMax).toFixed(1)}%"></span></span>`;
        h += `<span class="ev">${fmt(d.w)} works together (expected ${d.x < 10 ? d.x.toFixed(1) : fmt(Math.round(d.x))})</span></li>`;
      }
      h += `</ul>`;
      if (list.length > 12) h += `<button type="button" class="linkBtn" id="nbMore">${state.showAllNb ? "Show fewer" : `Show all ${fmt(list.length)}`}</button>`;
      h += `</div>`;

      const heatRows = egoList(i, null).sort((a, b) => b.a - a.a).slice(0, 10);
      if (heatRows.length) {
        h += `<div class="dSection heat"><h3>Who travels with ${esc(ND.short[i])} over time</h3>`;
        h += `<div class="gloss">Their ${heatRows.length} most distinctive partners (all years). Darker = more works naming both in that window; light grey = no link attested in that window.</div>`;
        h += heatSVG(i, heatRows) + `</div>`;
      }
      $("drawerBody").innerHTML = h;
    }

    $("drawerBody").addEventListener("click", (ev) => {
      const t = ev.target.closest("[data-i],[data-sort],#nbMore,.bar");
      if (!t) return;
      if (t.id === "nbMore") { state.showAllNb = !state.showAllNb; renderDrawer(); return; }
      if (t.dataset.sort) { state.sort = t.dataset.sort; renderDrawer(); return; }
      if (t.classList.contains("bar") && t.dataset.w != null) { setMode("window", +t.dataset.w); return; }
      if (t.dataset.i != null) select(+t.dataset.i);
    });
    $("drawerClose").addEventListener("click", () => select(-1));

    // ---------- years ----------
    function windowChartSVG() {
      const Wd = 312, Hh = 58, base = 44, top = 4;
      const bw = Wd / WINS.length;
      const mx = Math.max(...WINS.map((w) => w.works));
      let s = `<svg viewBox="0 0 ${Wd} ${Hh}" role="img" aria-label="Works per 30-year window">`;
      s += `<defs><pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" fill="#9a9ca3"/></pattern></defs>`;
      WINS.forEach((w, k) => {
        const h = Math.max(2, (base - top) * Math.sqrt(w.works / mx));
        const sel = state.mode === "window" && k === state.w;
        const fill = sel ? "#1d1d1f" : w.thin ? "url(#hatch)" : "#b7bac2";
        s += `<rect class="bar" data-w="${k}" x="${k * bw}" y="${base - h}" width="${bw - 1}" height="${h}" fill="${fill}"><title>${w.label}: ${fmt(w.works)} works${w.thin ? " (thin)" : ""}</title></rect>`;
        s += `<rect class="bar" data-w="${k}" x="${k * bw}" y="${top}" width="${bw}" height="${base - top}" fill="transparent"/>`;
      });
      s += `<line x1="0" x2="${Wd}" y1="${base}" y2="${base}" stroke="#c9cbd1"/>`;
      [0, 10, 20, 30].forEach((k) => { s += `<text x="${k * bw}" y="${Hh - 2}">${WINS[k].start}</text>`; });
      s += `<text x="${Wd}" y="${Hh - 2}" text-anchor="end">1929</text>`;
      return s + "</svg>";
    }
    $("windowChart").addEventListener("click", (ev) => {
      const t = ev.target.closest(".bar");
      if (t) setMode("window", +t.dataset.w);
    });

    function topNamed(w, n = 3) {
      const arr = time.nodeWorks[w];
      return Array.from(arr.keys()).sort((a, b) => arr[b] - arr[a]).slice(0, n).filter((i) => arr[i] > 0);
    }

    function updateYearsUI() {
      const isWin = state.mode === "window";
      document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.mode === state.mode)));
      $("windowControls").hidden = !isWin;
      $("allYearsNote").hidden = isWin;
      $("windowChart").innerHTML = windowChartSVG();
      if (!isWin) return;
      const w = WINS[state.w];
      const wd = windowData(state.w);
      $("windowSlider").value = String(state.w);
      $("windowSlider").setAttribute("aria-valuetext", `${w.label}, ${w.works} works`);
      const tops = topNamed(state.w).map((i) => `${esc(ND.short[i])} (${fmt(time.nodeWorks[state.w][i])})`).join(", ");
      $("windowSummary").innerHTML = `<strong>${w.label}</strong> · ${fmt(w.works)} works · ${fmt(wd.nPresent)} poets named · ${fmt(wd.nLinks)} links attested` +
        (tops ? `<div class="muted small">Most named: ${tops}</div>` : "");
      const warn = [];
      if (w.thin) warn.push(`Only ${w.works} works in this window (fewer than 50). Read it as a list of names, not as structure.`);
      if (!wd.nLinks) warn.push("No links pass the test in this window.");
      if (state.markNew && w.start < 1620) warn.push("The archive starts in 1559, so early “first mentions” include long-established poets.");
      $("windowWarning").hidden = !warn.length;
      $("windowWarning").innerHTML = warn.map(esc).join("<br>");
      $("markNewLabel").textContent = `Ring poets first named in ${wd.lastDecade}–${w.end} (${fmt(wd.nNew)})`;
    }

    function setMode(mode, w) {
      state.mode = mode;
      if (w != null) state.w = w;
      updateYearsUI();
      renderLegend();
      if (state.selected >= 0) renderDrawer();
      refresh();
      syncURL();
    }
    document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
    $("windowSlider").addEventListener("input", (ev) => setMode("window", +ev.target.value));
    $("markNew").addEventListener("change", (ev) => { state.markNew = ev.target.checked; updateYearsUI(); refresh(); syncURL(); });
    $("hideAbsent").addEventListener("change", (ev) => { state.hideAbsent = ev.target.checked; refresh(); syncURL(); });

    // ---------- show controls ----------
    function bindSeg(attr, key, parse = (v) => v) {
      document.querySelectorAll(`[data-${attr}]`).forEach((b) => b.addEventListener("click", () => {
        state[key] = parse(b.dataset[attr]);
        if (key === "color") state.isolate.clear();
        syncSegs();
        renderLegend();
        if (state.selected >= 0) renderDrawer();
        refresh();
        syncURL();
      }));
    }
    function syncSegs() {
      document.querySelectorAll("[data-links]").forEach((b) => b.setAttribute("aria-checked", String(+b.dataset.links === state.links)));
      document.querySelectorAll("[data-size]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.size === state.size)));
      document.querySelectorAll("[data-color]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.color === state.color)));
      $("markNew").checked = state.markNew;
      $("hideAbsent").checked = state.hideAbsent;
    }
    bindSeg("links", "links", (v) => +v);
    bindSeg("size", "size");
    bindSeg("color", "color");

    function updateEncodingNote(shown) {
      const win = curWin();
      const wl = win ? ` attested in ${WINS[state.w].label}` : "";
      let linkTxt;
      if (state.selected >= 0) linkTxt = `Showing the selected poet's links${wl}.`;
      else if (state.links) linkTxt = `Showing each poet's ${state.links} strongest links${wl} (${fmt(shown)} of ${fmt(win ? win.nLinks : E)}).`;
      else linkTxt = `Showing all ${fmt(shown)} links${wl}.`;
      const sizeTxt = state.size === "links"
        ? (win ? "Size: poets linked in this window." : "Size: number of linked poets (as in the article's Figure 7).")
        : (win ? "Size: works naming the poet in this window." : "Size: works naming the poet.");
      const colorTxt = state.color === "group" ? "Colour: Gephi community." : "Colour: period, by birth year + 20.";
      $("encodingNote").textContent = `${linkTxt} Darker lines carry more excess co-mention. ${sizeTxt} ${colorTxt}`;
    }

    // ---------- legend ----------
    function renderLegend() {
      const c = cats[state.color];
      const win = curWin();
      const counts = new Array(c.list.length).fill(0);
      for (let i = 0; i < N; i++) if (!win || win.present[i] > 0) counts[c.of(i)]++;
      const ul = $("legend");
      ul.classList.toggle("isolating", state.isolate.size > 0);
      ul.innerHTML = c.list.map((it, k) => {
        if (!counts[k] && !win) return "";
        const on = state.isolate.has(k) ? " on" : "";
        const sub = state.color === "group"
          ? it.anchors.slice(0, 4).map((j) => esc(ND.short[j])).join(", ")
          : esc(it.range || "");
        return `<li class="${on.trim()}" data-cat="${k}" role="button" tabindex="0" aria-pressed="${!!on}" title="${esc(it.desc || it.name)}">` +
          `<span class="dot" style="background:${it.color}"></span><span class="name">${esc(it.name)}</span>` +
          `<span class="count">${fmt(counts[k])}</span>${sub ? `<span class="anchors">${sub}</span>` : ""}</li>`;
      }).join("");
      $("legendClear").hidden = state.isolate.size === 0;
      $("legendHint").textContent = win
        ? "Counts are poets named in this window. Click a row to isolate it."
        : "Click a row to isolate it; click more rows to add them.";
    }
    function toggleCat(k) {
      if (state.isolate.has(k)) state.isolate.delete(k); else state.isolate.add(k);
      renderLegend();
      refresh();
      syncURL();
    }
    $("legend").addEventListener("click", (ev) => { const li = ev.target.closest("[data-cat]"); if (li) toggleCat(+li.dataset.cat); });
    $("legend").addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const li = ev.target.closest("[data-cat]");
      if (li) { ev.preventDefault(); toggleCat(+li.dataset.cat); }
    });
    $("legendClear").addEventListener("click", () => { state.isolate.clear(); renderLegend(); refresh(); syncURL(); });

    // ---------- search ----------
    const searchIndex = ND.label.map((l, i) => {
      const n = norm(l);
      return { i, n, words: n.split(/[\s,.'’()-]+/).filter(Boolean) };
    });
    function searchMatches(q) {
      const raw = q.trim();
      if (/^q\d+$/i.test(raw)) { const i = qidIndex.get(raw.toUpperCase()); return i != null ? [i] : []; }
      const qn = norm(raw);
      if (!qn) return [];
      const scored = [];
      for (const it of searchIndex) {
        let score = -1;
        if (it.n === qn) score = 0;
        else if (it.words.some((w) => w.startsWith(qn)) || it.n.startsWith(qn)) score = 1;
        else if (it.n.includes(qn)) score = 2;
        if (score >= 0) scored.push([score, -ND.works[it.i], it.i]);
      }
      scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      return scored.slice(0, 8).map((d) => d[2]);
    }
    const sInput = $("search");
    const sList = $("searchResults");
    let sItems = [];
    let sActive = 0;
    function renderResults() {
      const q = sInput.value;
      if (!q.trim()) { sList.hidden = true; sInput.setAttribute("aria-expanded", "false"); return; }
      sItems = searchMatches(q);
      sActive = 0;
      sList.innerHTML = sItems.length
        ? sItems.map((i, k) => `<li role="option" data-i="${i}" aria-selected="${k === 0}"><span class="dot" style="background:${catColor(i)}"></span><span>${esc(ND.label[i])}</span><span class="meta">${ND.birth[i] != null ? `b. ${yearStr(ND.birth[i])} · ` : ""}${fmt(ND.works[i])} works</span></li>`).join("")
        : `<li class="empty">No poet in the network matches “${esc(q.trim())}”.</li>`;
      sList.hidden = false;
      sInput.setAttribute("aria-expanded", "true");
    }
    function chooseResult(i) {
      sList.hidden = true;
      sInput.value = ND.label[i];
      sInput.blur();
      select(i);
    }
    sInput.addEventListener("input", renderResults);
    sInput.addEventListener("focus", () => { if (sInput.value.trim()) renderResults(); });
    sInput.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        if (!sItems.length) return;
        ev.preventDefault();
        sActive = (sActive + (ev.key === "ArrowDown" ? 1 : -1) + sItems.length) % sItems.length;
        sList.querySelectorAll("li").forEach((li, k) => li.setAttribute("aria-selected", String(k === sActive)));
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        if (sItems.length && !sList.hidden) chooseResult(sItems[sActive]);
      } else if (ev.key === "Escape") {
        sList.hidden = true;
      }
    });
    sList.addEventListener("mousedown", (ev) => {
      const li = ev.target.closest("li[data-i]");
      if (li) { ev.preventDefault(); chooseResult(+li.dataset.i); }
    });
    sInput.addEventListener("blur", () => setTimeout(() => { sList.hidden = true; }, 120));

    // ---------- panel, about, reset, keys ----------
    function setCollapsed(c) {
      $("panel").classList.toggle("collapsed", c);
      $("collapseBtn").setAttribute("aria-expanded", String(!c));
      $("collapseBtn").textContent = c ? "+" : "–";
      $("collapseBtn").title = c ? "Show controls" : "Hide controls";
    }
    $("collapseBtn").addEventListener("click", () => setCollapsed(!$("panel").classList.contains("collapsed")));
    $("aboutBtn").addEventListener("click", () => { $("about").hidden = false; $("aboutClose").focus(); });
    $("aboutClose").addEventListener("click", () => { $("about").hidden = true; });
    $("about").addEventListener("click", (ev) => { if (ev.target === $("about")) $("about").hidden = true; });

    function resetAll() {
      Object.assign(state, DEFAULTS, { selected: -1, sort: "assoc", showAllNb: false });
      state.isolate.clear();
      sInput.value = "";
      syncSegs();
      updateYearsUI();
      renderLegend();
      renderDrawer();
      refresh();
      fitAll();
      syncURL();
    }
    $("resetBtn").addEventListener("click", resetAll);

    document.addEventListener("keydown", (ev) => {
      const inField = ev.target.matches("input, textarea, select");
      if (ev.key === "/" && !inField) { ev.preventDefault(); sInput.focus(); return; }
      if (ev.key === "Escape") {
        if (!$("about").hidden) { $("about").hidden = true; return; }
        if (!inField && state.selected >= 0) select(-1);
      }
    });

    // ---------- URL state ----------
    function syncURL() {
      const p = new URLSearchParams();
      if (state.selected >= 0) p.set("poet", ND.qid[state.selected]);
      if (state.mode === "window") p.set("w", String(WINS[state.w].start));
      if (state.links !== DEFAULTS.links) p.set("links", state.links ? String(state.links) : "all");
      if (state.size !== DEFAULTS.size) p.set("size", state.size);
      if (state.color !== DEFAULTS.color) p.set("color", state.color);
      if (state.isolate.size) p.set("only", [...state.isolate].map((k) => cats[state.color].list[k].id).join(","));
      if (state.hideAbsent) p.set("hide", "1");
      if (state.markNew) p.set("new", "1");
      const hash = p.toString();
      history.replaceState(null, "", `${location.pathname}${location.search}${hash ? `#${hash}` : ""}`);
    }
    function readURL() {
      const p = new URLSearchParams(location.hash.slice(1));
      if (p.has("w")) {
        const k = WINS.findIndex((w) => String(w.start) === p.get("w"));
        if (k >= 0) { state.mode = "window"; state.w = k; }
      }
      if (p.has("links")) state.links = p.get("links") === "all" ? 0 : (+p.get("links") || DEFAULTS.links);
      if (p.get("size") === "works") state.size = "works";
      if (p.get("color") === "period") state.color = "period";
      if (p.has("only")) {
        const ids = p.get("only").split(",");
        cats[state.color].list.forEach((it, k) => { if (ids.includes(it.id)) state.isolate.add(k); });
      }
      state.hideAbsent = p.get("hide") === "1";
      state.markNew = p.get("new") === "1";
      const q = p.get("poet");
      return q && qidIndex.has(q) ? qidIndex.get(q) : -1;
    }

    // ---------- start ----------
    const startPoet = readURL();
    if (innerWidth <= 720 || EMBED) setCollapsed(true);
    syncSegs();
    updateYearsUI();
    renderLegend();
    refresh();
    // Fit and open the start poet only once the container has a real size.
    let started = false;
    function start() {
      const r = $("graph").getBoundingClientRect();
      if (started || !r.width || !r.height) return;
      started = true;
      fitAll(0);
      if (startPoet >= 0) select(startPoet);
    }
    new ResizeObserver(() => {
      renderer.resize();
      renderer.refresh();
      start();
    }).observe($("graph"));
    start();
    setStatus("");
  })().catch((err) => {
    console.error(err);
    setStatus(`Could not load the network: ${err.message}`);
  });
})();
