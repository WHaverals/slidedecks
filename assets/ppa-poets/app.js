/* global graphology, Sigma */
// UMD loader version (no ESM imports).
// This avoids "Failed to resolve module specifier 'events'" errors caused by
// ESM builds that contain bare Node-style imports.

// PPA Poets: load GEXF + interactions (search, min-degree filter, 1-hop highlight).
//
// Note: When loading modules directly in the browser (no bundler), some CDNs /
// ESM wrappers of `graphology-gexf` end up pulling in Node-oriented dependencies
// that import bare specifiers like "events", which browsers cannot resolve.
// So we parse GEXF with the browser's native DOMParser (no extra libraries).
(function () {
  const isEmbed = !!(
    window.PPA_POETS_EMBED ||
    document.documentElement.dataset.embed === "true"
  );
  const assetBase = (window.PPA_POETS_ASSET_BASE || "./").replace(/\/?$/, "/");
  const DATA_VERSION = "20260611-ui";

  function assetUrl(file) {
    return `${assetBase}${file}?v=${DATA_VERSION}`;
  }

  function normLabel(s) {
    return (s || "").toString().trim().toLowerCase();
  }

  function setStatus(msg) {
    const el = document.getElementById("status");
    if (!el) return;
    el.hidden = false;
    el.textContent = msg || "";
  }

  function escapeHtml(s) {
    return (s ?? "")
      .toString()
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatNumber(n) {
    const x = Number(n);
    return Number.isFinite(x) ? x.toLocaleString() : "0";
  }

  function truncateText(s, maxLength = 70) {
    const text = (s ?? "").toString().trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 6)).trimEnd()} [...]`;
  }

  function inferWorkUrl(firstMention) {
    if (!firstMention || typeof firstMention !== "object") return "";
    if (firstMention.source_url) return firstMention.source_url;

    const workId = (firstMention.work_id || "").toString();
    const source = (firstMention.source || "").toString().toLowerCase();
    if (!workId) return "";

    if (source.includes("hathitrust")) {
      return `https://hdl.handle.net/2027/${encodeURIComponent(workId)}`;
    }
    if (source.includes("eebo")) {
      return `http://name.umdl.umich.edu/${encodeURIComponent(workId)}.0001.001`;
    }
    if (source.includes("gale")) {
      const docId = workId.split("-")[0];
      return `https://link.gale.com/apps/doc/${encodeURIComponent(docId)}/ECCO`;
    }
    return "";
  }

  function edgeKey(a, b) {
    const sa = String(a);
    const sb = String(b);
    return sa < sb ? `${sa}|${sb}` : `${sb}|${sa}`;
  }

  function defaultSliceIndex(slices) {
    if (!slices.length) return -1;
    return slices.length;
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  function castValue(v) {
    if (v == null) return v;
    const s = String(v);
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    return s;
  }

  async function parseGexfToGraph(GraphCtor, gexfText) {
    setStatus("Parsing GEXF…");
    await nextFrame();

    const doc = new DOMParser().parseFromString(gexfText, "application/xml");
    const parserError = doc.getElementsByTagName("parsererror")[0];
    if (parserError) throw new Error(`Invalid XML/GEXF: ${parserError.textContent || "parsererror"}`);

    // map node attribute id -> title (so we can store as human-readable keys)
    const attrIdToTitle = new Map();
    doc.querySelectorAll('attributes[class="node"] > attribute').forEach((el) => {
      const id = el.getAttribute("id");
      const title = el.getAttribute("title") || id;
      if (id) attrIdToTitle.set(id, title);
    });

    const graphEl = doc.getElementsByTagName("graph")[0];
    const defaultEdgeType = (graphEl && graphEl.getAttribute("defaultedgetype") || "undirected").toLowerCase();
    const graphType = defaultEdgeType === "directed" ? "directed" : "undirected";

    // Use multi graph to avoid failures on duplicates
    const graph = new GraphCtor({ type: graphType, multi: true });

    // Nodes
    const nodeEls = doc.getElementsByTagName("node");
    for (let i = 0; i < nodeEls.length; i++) {
      const n = nodeEls[i];
      const id = n.getAttribute("id");
      if (!id) continue;

      const attrs = {};
      const label = n.getAttribute("label");
      if (label) attrs.label = label;

      // Attributes (<attvalue for="..." value="..."/>)
      const attvalueEls = n.getElementsByTagName("attvalue");
      for (let j = 0; j < attvalueEls.length; j++) {
        const av = attvalueEls[j];
        const k = av.getAttribute("for") || av.getAttribute("id");
        const v = av.getAttribute("value");
        if (!k) continue;
        const title = attrIdToTitle.get(k) || k;
        attrs[title] = castValue(v);
        if (k === "degree") attrs.degree = castValue(v);
      }

      // VIZ module (Gephi exports these)
      const sizeEl = n.getElementsByTagName("viz:size")[0];
      if (sizeEl) {
        const v = sizeEl.getAttribute("value");
        if (v != null) attrs.size = Number(v);
      }
      const posEl = n.getElementsByTagName("viz:position")[0];
      if (posEl) {
        const x = posEl.getAttribute("x");
        const y = posEl.getAttribute("y");
        if (x != null) attrs.x = Number(x);
        if (y != null) attrs.y = Number(y);
      }
      const colorEl = n.getElementsByTagName("viz:color")[0];
      if (colorEl) {
        const r = colorEl.getAttribute("r");
        const g = colorEl.getAttribute("g");
        const b = colorEl.getAttribute("b");
        const a = colorEl.getAttribute("a");
        if (r != null && g != null && b != null) {
          attrs.color = a != null ? "rgba(" + r + "," + g + "," + b + "," + a + ")" : "rgb(" + r + "," + g + "," + b + ")";
        }
      }

      graph.addNode(id, attrs);

      if (i % 500 === 0) {
        setStatus(`Parsing nodes… ${i.toLocaleString()}/${nodeEls.length.toLocaleString()}`);
        await nextFrame();
      }
    }

    // Edges
    const edgeEls = doc.getElementsByTagName("edge");
    for (let i = 0; i < edgeEls.length; i++) {
      const e = edgeEls[i];
      const source = e.getAttribute("source");
      const target = e.getAttribute("target");
      if (!source || !target) continue;

      const type = (e.getAttribute("type") || defaultEdgeType).toLowerCase();
      const w = e.getAttribute("weight");
      const attrs = {};
      if (w != null && w !== "") attrs.weight = Number(w);

      if (type === "directed") graph.addDirectedEdge(source, target, attrs);
      else graph.addUndirectedEdge(source, target, attrs);

      if (i % 5000 === 0) {
        setStatus(`Parsing edges… ${i.toLocaleString()}/${edgeEls.length.toLocaleString()}`);
        await nextFrame();
      }
    }

    return graph;
  }

  function firstMentionHtml(firstMention) {
    if (!firstMention || typeof firstMention !== "object") return "";

    const year = firstMention.year != null ? escapeHtml(firstMention.year) : "";
    const title = truncateText(firstMention.title || firstMention.work_id || "Untitled work");
    const author = truncateText(firstMention.author || "", 48);
    const source = firstMention.source ? escapeHtml(firstMention.source) : "";
    const page = firstMention.page != null ? `p. ${escapeHtml(firstMention.page)}` : "";
    const sameYearWorks = Number(firstMention.same_year_works);
    const workUrl = inferWorkUrl(firstMention);
    const titleHtml = workUrl
      ? `<a class="detailLink" href="${escapeHtml(workUrl)}" target="_blank" rel="noreferrer">${escapeHtml(title)}</a>`
      : escapeHtml(title);
    const workLine = [
      year,
      titleHtml,
      author ? `— ${escapeHtml(author)}` : "",
    ].filter(Boolean).join(" ");
    const metaLine = [page, source].filter(Boolean).join(" · ");
    const tieLine = Number.isFinite(sameYearWorks) && sameYearWorks > 1
      ? `<div class="detailSubtle">+${formatNumber(sameYearWorks - 1)} other work${sameYearWorks === 2 ? "" : "s"} in that year</div>`
      : "";

    return `
      <div class="detailBlock">
        <div class="detailHeading">First observed PPA mention</div>
        <div>${workLine}</div>
        ${metaLine ? `<div class="detailSubtle">${metaLine}</div>` : ""}
        ${tieLine}
      </div>
    `;
  }

  function topWorkHtml(topWork) {
    if (!topWork || typeof topWork !== "object") return "";

    const year = topWork.year != null ? escapeHtml(topWork.year) : "";
    const title = truncateText(topWork.title || topWork.work_id || "Untitled work");
    const author = truncateText(topWork.author || "", 48);
    const source = topWork.source ? escapeHtml(topWork.source) : "";
    const windows = Number(topWork.windows);
    const workUrl = inferWorkUrl(topWork);
    const titleHtml = workUrl
      ? `<a class="detailLink" href="${escapeHtml(workUrl)}" target="_blank" rel="noreferrer">${escapeHtml(title)}</a>`
      : escapeHtml(title);
    const workLine = [
      year,
      titleHtml,
      author ? `— ${escapeHtml(author)}` : "",
    ].filter(Boolean).join(" ");
    const metaLine = [
      Number.isFinite(windows) ? `${formatNumber(windows)} mention-bearing window${windows === 1 ? "" : "s"}` : "",
      source,
    ].filter(Boolean).join(" · ");

    return `
      <div class="detailBlock">
        <div class="detailHeading">Most sustained PPA work</div>
        <div>${workLine}</div>
        ${metaLine ? `<div class="detailSubtle">${metaLine}</div>` : ""}
      </div>
    `;
  }

  function setDetails(node, attrs, neighborsCount, slice, nodeStats, nodeMeta, minWorks) {
    const el = document.getElementById("details");
    if (!el) return;
    if (!node) { el.innerHTML = ""; return; }

    const meta = nodeMeta || {};
    const name = meta.poet_name ?? attrs.poet_name ?? attrs.d2 ?? attrs.label ?? node;
    const birth = meta.birth_year ?? attrs.birth_year ?? attrs.d3 ?? "";
    const entry = meta.entry_year ?? attrs.entry_year ?? attrs.d5 ?? "";
    const degree = attrs.degree ?? attrs.Degree ?? "";
    const modularity = meta.modularity_class ?? attrs.modularity_class ?? "";
    const wikidataUrl = `https://www.wikidata.org/wiki/${encodeURIComponent(node)}`;
    const qidLink = `<a class="detailLink" href="${wikidataUrl}" target="_blank" rel="noreferrer">${escapeHtml(node)}</a>`;
    const topWork = topWorkHtml(meta.top_ppa_work);
    const selectedHiddenByFilter = slice && nodeStats && Number(nodeStats.works) < Number(minWorks);
    const temporalDetails = slice
      ? (
        nodeStats
          ? `<div style="margin-top:6px"><span style="opacity:.7">${escapeHtml(slice.label)}:</span> ${formatNumber(nodeStats.works)} works${nodeStats.rank ? ` · rank #${formatNumber(nodeStats.rank)}` : ""}${nodeStats.new ? " · first PPA appearance" : ""}${selectedHiddenByFilter ? " · hidden by works filter" : ""}</div>${selectedHiddenByFilter ? `<div class="detailSubtle">Showing the full ${escapeHtml(slice.label)} window instead.</div>` : ""}`
          : `<div style="margin-top:6px;opacity:.7">${escapeHtml(name)} is not active in ${escapeHtml(slice.label)}. Showing the full ${escapeHtml(slice.label)} window instead.</div>`
      )
      : "";

    el.innerHTML = `
      <div style="font-weight:700;font-size:14px;margin-bottom:6px">${escapeHtml(name)}</div>
      <div><span style="opacity:.7">QID:</span> ${qidLink}</div>
      ${birth !== "" ? `<div><span style="opacity:.7">Birth year:</span> ${escapeHtml(birth)}</div>` : ""}
      ${entry !== "" ? `<div><span style="opacity:.7">Entry year:</span> ${escapeHtml(entry)}</div>` : ""}
      ${degree !== "" ? `<div><span style="opacity:.7">Degree:</span> ${escapeHtml(degree)}</div>` : ""}
      ${modularity !== "" ? `<div><span style="opacity:.7">Modularity class:</span> ${escapeHtml(modularity)}</div>` : ""}
      ${temporalDetails}
      ${topWork}
    `;
  }

  (async function main() {
    setStatus("Fetching poets.gexf…");

    if (!window.graphology) throw new Error("Graphology did not load (window.graphology missing).");
    if (!window.Sigma) throw new Error("Sigma did not load (window.Sigma missing).");

    const GraphCtor = window.graphology.Graph || window.graphology.default || window.graphology;
    if (typeof GraphCtor !== "function") throw new Error("Could not find Graphology Graph constructor.");

    const gexfText = await fetch(assetUrl("poets.gexf")).then(r => {
      if (!r.ok) throw new Error(`Failed to load poets.gexf: ${r.status} ${r.statusText}`);
      return r.text();
    });

    setStatus("Fetching temporal_index.json…");
    const temporalIndex = await fetch(assetUrl("temporal_index.json")).then(r => {
      if (!r.ok) throw new Error(`Failed to load temporal_index.json: ${r.status} ${r.statusText}`);
      return r.json();
    }).catch((e) => {
      console.warn("Temporal index unavailable:", e);
      return null;
    });

    // Let the browser paint the status before parsing.
    await nextFrame();

    const graph = await parseGexfToGraph(GraphCtor, gexfText);

    // Ensure sigma-required node attributes exist (fallbacks only)
    graph.forEachNode((node, attrs) => {
      if (typeof attrs.x !== "number" || typeof attrs.y !== "number") {
        graph.setNodeAttribute(node, "x", (typeof attrs.x === "number") ? attrs.x : Math.random());
        graph.setNodeAttribute(node, "y", (typeof attrs.y === "number") ? attrs.y : Math.random());
      }
      if (typeof attrs.size !== "number") graph.setNodeAttribute(node, "size", 2);
      if (!attrs.color) graph.setNodeAttribute(node, "color", "#777");
      if (!attrs.label) graph.setNodeAttribute(node, "label", node);
      // Normalize numeric degree for filtering
      const rawDeg = attrs.degree ?? attrs.Degree;
      const deg = (rawDeg != null && rawDeg !== "") ? Number(rawDeg) : graph.degree(node);
      graph.setNodeAttribute(node, "degree", Number.isFinite(deg) ? deg : 0);
    });

    // Optional rendering extras (use if present in this Sigma UMD build)
    const rendering = window.Sigma && window.Sigma.rendering ? window.Sigma.rendering : null;
    const hasCurveEdges = !!(rendering && rendering.EdgeCurveProgram);
    const hasBorderProgram = !!(rendering && rendering.createNodeBorderProgram && rendering.NodeCircleProgram);

    graph.forEachEdge((edge, attrs) => {
      if (typeof attrs.size !== "number") graph.setEdgeAttribute(edge, "size", 0.5);
      if (!attrs.color) graph.setEdgeAttribute(edge, "color", "rgba(0,0,0,0.06)");
      if (hasCurveEdges) graph.setEdgeAttribute(edge, "type", "curve");
    });

    const container = document.getElementById("container");
    if (!container) throw new Error("Missing #container element");

    // Sigma settings (keep robust, enable extras when available)
    const sigmaSettings = {
      renderEdgeLabels: false,
      zIndex: true,
      // Label typography (https://www.sigmajs.org/docs/advanced/customization/)
      labelFont: "Inter",
      labelWeight: "600",
      labelSize: 14,
    };
    if (hasCurveEdges) {
      sigmaSettings.edgeProgramClasses = { curve: rendering.EdgeCurveProgram };
    }
    if (hasBorderProgram) {
      sigmaSettings.defaultNodeType = "circle";
      sigmaSettings.nodeProgramClasses = {
        circle: rendering.NodeCircleProgram,
        border: rendering.createNodeBorderProgram(),
      };
    }
    const renderer = new window.Sigma(graph, container, sigmaSettings);
    const camera = renderer.getCamera();
    const initialCameraState = camera.getState();

    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => {
        if (typeof renderer.resize === "function") renderer.resize();
        renderer.refresh();
      }).observe(container);
    }

    // Optional: WebGL contour background layer (like sigma-layer-webgl story).
    // Uses dynamic import so we can keep the rest of the app on UMD scripts.
    // https://www.sigmajs.org/storybook/?path=/story/sigma-layer-webgl--plain-contour-line
    (async () => {
      try {
        const mod = await import("https://cdn.jsdelivr.net/npm/@sigma/layer-webgl@3.0.0/+esm");
        const bindWebGLLayer = mod.bindWebGLLayer;
        const createContoursProgram = mod.createContoursProgram;
        if (typeof bindWebGLLayer !== "function" || typeof createContoursProgram !== "function") return;

        const contourOptions = {
          border: { color: "rgba(90,90,90,0.35)", thickness: 2 },
          levels: [
            { color: "#ffffff", threshold: 0.92 },
            { color: "#fbfbfb", threshold: 0.84 },
            { color: "#f6f6f6", threshold: 0.76 },
            { color: "#f1f1f1", threshold: 0.68 },
            { color: "#ececec", threshold: 0.60 },
            { color: "#e6e6e6", threshold: 0.52 },
            { color: "#dfdfdf", threshold: 0.44 },
            { color: "#d7d7d7", threshold: 0.36 },
            { color: "#cecece", threshold: 0.28 },
          ],
        };

        // Bind as a background layer (drawn behind the graph).
        // The program uses node display positions from the renderer.
        bindWebGLLayer("contours", renderer, createContoursProgram(graph.nodes(), contourOptions), {
          // Put behind edges/nodes:
          zIndex: -1,
        });
      } catch (e) {
        // Non-fatal: WebGL2 not supported or module blocked.
        console.warn("Contour layer not available:", e);
      }
    })();

    // ---- UI wiring ----
    const aboutBtn = document.getElementById("aboutBtn");
    const aboutPanel = document.getElementById("aboutPanel");
    const resetBtn = document.getElementById("resetBtn");
    const search = document.getElementById("search");
    const poetList = document.getElementById("poet-list");
    const sliceSlider = document.getElementById("sliceSlider");
    const sliceLabel = document.getElementById("sliceLabel");
    const sliceStats = document.getElementById("sliceStats");
    const highlightNewToggle = document.getElementById("highlightNewToggle");
    const minWorksSlider = document.getElementById("minWorksSlider");
    const minWorksLabel = document.getElementById("minWorksLabel");
    const minWorksNoun = document.getElementById("minWorksNoun");
    const topPoetsList = document.getElementById("topPoetsList");

    // Base style caches
    const baseNodeColor = new Map();
    const baseNodeSize = new Map();
    const fullNodeWorks = new Map();
    graph.forEachNode((n, a) => {
      baseNodeColor.set(n, a.color);
      baseNodeSize.set(n, a.size);
      const rawWorks = a.n_works_present ?? a.d1 ?? a.works ?? 0;
      const works = Number(rawWorks);
      fullNodeWorks.set(n, Number.isFinite(works) ? works : 0);
    });

    // No degree filter in click-only mode
    const minDegree = 0;

    // Temporal publication-window state. The graph/layout stays archive-wide;
    // reducers use these sets to hide nodes/edges outside the selected window.
    // The final slider position is "Full archive", with no temporal filter.
    const temporalSlices = Array.isArray(temporalIndex && temporalIndex.slices) ? temporalIndex.slices : [];
    const nodeMeta = (temporalIndex && temporalIndex.node_meta && typeof temporalIndex.node_meta === "object")
      ? temporalIndex.node_meta
      : {};
    const initialSliceIndex = defaultSliceIndex(temporalSlices);
    let activeSliceIndex = initialSliceIndex;
    let activeSlice = activeSliceIndex >= 0 ? temporalSlices[activeSliceIndex] : null;
    let activeNodes = new Set();
    let activeEdges = new Set();
    let newNodes = new Set();
    let activeNodeStats = {};
    let highlightNew = false;
    let minWorks = 1;

    function updateMinWorksLabel() {
      if (minWorksLabel) minWorksLabel.textContent = formatNumber(minWorks);
      if (minWorksNoun) minWorksNoun.textContent = minWorks === 1 ? "work" : "works";
    }

    function updateReadyStatus() {
      const fullArchive = temporalSlices.length && activeSliceIndex === temporalSlices.length;
      const showing = activeSlice ? activeSlice.label : fullArchive ? "Full archive" : "all years";
      setStatus(`Network ready. Showing ${showing}.`);
    }

    function setTemporalControlsEnabled(enabled) {
      if (!sliceSlider) return;
      sliceSlider.disabled = !enabled;
      if (enabled) {
        sliceSlider.min = "0";
        sliceSlider.max = String(Math.max(temporalSlices.length, 0));
        sliceSlider.step = "1";
      }
    }

    function passesMinWorks(node) {
      const works = activeSlice
        ? Number(activeNodeStats[node]?.works)
        : Number(fullNodeWorks.get(node));
      return Number.isFinite(works) && works >= minWorks;
    }

    function shownPoetCount() {
      if (!activeSlice) {
        let count = 0;
        graph.forEachNode((node) => {
          if (passesMinWorks(node)) count += 1;
        });
        return count;
      }
      let count = 0;
      for (const node of activeNodes) {
        if (passesMinWorks(node)) count += 1;
      }
      return count;
    }

    function shownLinkCount() {
      if (!activeSlice) {
        let count = 0;
        graph.forEachEdge((edge) => {
          const s = graph.source(edge);
          const t = graph.target(edge);
          if (passesMinWorks(s) && passesMinWorks(t)) count += 1;
        });
        return count;
      }
      let count = 0;
      for (const key of activeEdges) {
        const [s, t] = key.split("|");
        if (passesMinWorks(s) && passesMinWorks(t)) count += 1;
      }
      return count;
    }

    function updateTopPoetsPanel() {
      if (!topPoetsList) return;
      if (!activeSlice) {
        const rows = [];
        graph.forEachNode((qid) => {
          const works = Number(fullNodeWorks.get(qid)) || 0;
          if (works >= minWorks) rows.push([qid, { works }]);
        });
        rows.sort((a, b) => (Number(b[1].works) - Number(a[1].works)) || a[0].localeCompare(b[0]));
        const topRows = rows.slice(0, 10);
        if (!topRows.length) {
          topPoetsList.innerHTML = `<li><span class="topPoetMeta">No poets match the current works filter.</span></li>`;
          return;
        }
        topPoetsList.innerHTML = topRows.map(([qid, stats]) => {
          const name = nodeMeta[qid]?.poet_name || graph.getNodeAttribute(qid, "label") || qid;
          return `<li><span class="topPoetName">${escapeHtml(name)}</span> <span class="topPoetMeta">— ${formatNumber(stats.works)} works</span></li>`;
        }).join("");
        return;
      }

      const rows = Object.entries(activeNodeStats)
        .filter(([, stats]) => Number(stats.works) >= minWorks)
        .sort((a, b) => {
          const aw = Number(a[1].works) || 0;
          const bw = Number(b[1].works) || 0;
          const ar = Number(a[1].rank) || Number.MAX_SAFE_INTEGER;
          const br = Number(b[1].rank) || Number.MAX_SAFE_INTEGER;
          return (bw - aw) || (ar - br) || a[0].localeCompare(b[0]);
        })
        .slice(0, 10);

      if (!rows.length) {
        topPoetsList.innerHTML = `<li><span class="topPoetMeta">No poets match the current works filter.</span></li>`;
        return;
      }

      topPoetsList.innerHTML = rows.map(([qid, stats]) => {
        const name = nodeMeta[qid]?.poet_name || graph.getNodeAttribute(qid, "label") || qid;
        return `<li><span class="topPoetName">${escapeHtml(name)}</span> <span class="topPoetMeta">— ${formatNumber(stats.works)} works</span></li>`;
      }).join("");
    }

    function updateSliceStatsDisplay() {
      if (!sliceStats) return;

      if (!activeSlice) {
        const filterSuffix = minWorks > 1
          ? ` · showing ${formatNumber(shownPoetCount())} poets · ${formatNumber(shownLinkCount())} links`
          : "";
        sliceStats.textContent =
          `All publication years · ${formatNumber(graph.order)} poets · ${formatNumber(graph.size)} links${filterSuffix}`;
        return;
      }

      const summary = activeSlice.summary || {};
      const filterSuffix = minWorks > 1
        ? ` · showing ${formatNumber(shownPoetCount())} poets · ${formatNumber(shownLinkCount())} links`
        : "";
      sliceStats.textContent =
        `${formatNumber(summary.works)} works · ` +
        `${formatNumber(summary.active_poets)} poets · ` +
        `${formatNumber(summary.active_edges)} links · ` +
        `${formatNumber(summary.new_entries)} first PPA appearances` +
        filterSuffix;
    }

    function updateTemporalState(index) {
      if (!temporalSlices.length) {
        activeSliceIndex = -1;
        activeSlice = null;
        activeNodes = new Set();
        activeEdges = new Set();
        newNodes = new Set();
        activeNodeStats = {};
        if (sliceLabel) sliceLabel.textContent = "All years";
        if (sliceStats) sliceStats.textContent = "Temporal index not loaded.";
        setTemporalControlsEnabled(false);
        updateReadyStatus();
        return;
      }

      activeSliceIndex = Math.max(0, Math.min(Number(index) || 0, temporalSlices.length));
      const fullArchive = activeSliceIndex === temporalSlices.length;

      if (fullArchive) {
        activeSlice = null;
        activeNodes = new Set();
        activeEdges = new Set();
        newNodes = new Set();
        activeNodeStats = {};
      } else {
        activeSlice = temporalSlices[activeSliceIndex];
        activeNodes = new Set(activeSlice.nodes || []);
        activeEdges = new Set(activeSlice.edges || []);
        newNodes = new Set(activeSlice.new_nodes || activeSlice.newNodes || []);
        activeNodeStats = activeSlice.node_stats || activeSlice.nodeStats || {};
      }

      setTemporalControlsEnabled(true);
      if (sliceSlider) sliceSlider.value = String(activeSliceIndex);
      if (sliceLabel) {
        sliceLabel.textContent = fullArchive
          ? "Full archive"
          : activeSlice.label || `${activeSlice.start_year}–${activeSlice.end_year}`;
      }

      updateSliceStatsDisplay();

      if (highlightNewToggle) {
        highlightNewToggle.disabled = fullArchive;
        if (fullArchive) {
          highlightNew = false;
          highlightNewToggle.checked = false;
        }
      }

      if (minWorksSlider) minWorksSlider.disabled = false;
      updateTopPoetsPanel();
      updateReadyStatus();
    }

    updateTemporalState(activeSliceIndex);
    if (highlightNewToggle) {
      highlightNewToggle.checked = false;
      highlightNewToggle.addEventListener("change", () => {
        highlightNew = !!highlightNewToggle.checked;
        if (selectedNode) {
          setDetails(
            selectedNode,
            graph.getNodeAttributes(selectedNode),
            graph.neighbors(selectedNode).length,
            activeSlice,
            activeNodeStats[selectedNode],
            nodeMeta[selectedNode],
            minWorks,
          );
        }
        renderer.refresh();
      });
    }

    if (minWorksSlider) {
      minWorksSlider.value = String(minWorks);
      updateMinWorksLabel();
      minWorksSlider.addEventListener("input", (e) => {
        minWorks = Math.max(1, Math.min(Number(e.target.value) || 1, 100));
        updateMinWorksLabel();
        updateSliceStatsDisplay();
        updateTopPoetsPanel();
        refreshSelectedNeighborhood();
        if (selectedNode) {
          setDetails(
            selectedNode,
            graph.getNodeAttributes(selectedNode),
            graph.neighbors(selectedNode).length,
            activeSlice,
            activeNodeStats[selectedNode],
            nodeMeta[selectedNode],
            minWorks,
          );
        }
        renderer.refresh();
      });
    }

    // Search index + suggestions
    const labelToNodes = new Map(); // normalized label -> [nodeIds]
    const labels = [];
    graph.forEachNode((node, attrs) => {
      const lab = attrs.label || "";
      labels.push(lab);
      const k = normLabel(lab);
      if (!k) return;
      const arr = labelToNodes.get(k);
      if (arr) arr.push(node);
      else labelToNodes.set(k, [node]);
    });
    labels.sort((a, b) => String(a).localeCompare(String(b)));
    if (poetList) {
      poetList.innerHTML = labels.slice(0, 5000).map(l => `<option value="${escapeHtml(l)}"></option>`).join("");
    }

    // Selection state
    let selectedNode = null;
    let selectedNeighborhood = null; // Set<string> | null

    function selectedSliceNeighborhood(node) {
      if (!node) return null;

      if (!activeSlice) {
        return new Set([node, ...graph.neighbors(node)]);
      }

      if (!activeNodes.has(node) || !passesMinWorks(node)) {
        return null;
      }

      const ego = new Set([node]);
      for (const neighbor of graph.neighbors(node)) {
        if (activeNodes.has(neighbor) && passesMinWorks(neighbor) && activeEdges.has(edgeKey(node, neighbor))) {
          ego.add(neighbor);
        }
      }
      return ego;
    }

    function refreshSelectedNeighborhood() {
      selectedNeighborhood = selectedSliceNeighborhood(selectedNode);
    }

    function setSelected(node) {
      selectedNode = node;
      refreshSelectedNeighborhood();

      if (!node) setDetails(null, {}, NaN);
      else setDetails(
        node,
        graph.getNodeAttributes(node),
        graph.neighbors(node).length,
        activeSlice,
        activeNodeStats[node],
        nodeMeta[node],
        minWorks,
      );

      renderer.refresh();
    }

    function focusNode(node) {
      if (!node) return;
      // Use Sigma's display data coordinates (more reliable than raw attrs when auto-rescale is on)
      const dd = renderer.getNodeDisplayData(node);
      if (!dd) return;
      const { x, y } = dd;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;

      const current = camera.getState();
      // Zoom in a bit, but don't go crazy
      const targetRatio = Math.max(0.05, Math.min(current.ratio, 0.25));
      camera.animate({ x, y, ratio: targetRatio }, { duration: 600 });
    }

    // Reducers: degree filter + 1-hop highlight
    renderer.setSetting("nodeReducer", (node, data) => {
      const d = data.degree ?? 0;
      if (d < minDegree) return { ...data, hidden: true };

      const hasTemporalFilter = !!activeSlice;
      const activeInSlice = !hasTemporalFilter ? passesMinWorks(node) : (activeNodes.has(node) && passesMinWorks(node));
      const firstAppearance = highlightNew && hasTemporalFilter && newNodes.has(node);
      const baseColor = baseNodeColor.get(node) ?? data.color;
      const baseSize = baseNodeSize.get(node) ?? data.size;

      if (!selectedNeighborhood) {
        if (!activeInSlice) {
          return { ...data, hidden: true };
        }
        if (firstAppearance) {
          return {
            ...data,
            color: "#c0392b",
            size: baseSize * 1.35,
            hidden: false,
            zIndex: 1,
          };
        }
        return { ...data, color: baseColor, size: baseSize, hidden: false };
      }

      const inN = selectedNeighborhood.has(node);
      if (!activeInSlice) {
        return { ...data, hidden: true };
      }
      if (node === selectedNode) {
        return {
          ...data,
          // Keep original node color unless this is a first appearance; emphasize size & label
          color: firstAppearance ? "#c0392b" : baseColor,
          ...(hasBorderProgram ? { type: "border", borderColor: "#fff" } : {}),
          size: baseSize * 1.6,
          hidden: false,
          zIndex: 2,
          forceLabel: true,
        };
      }
      if (inN) {
        return {
          ...data,
          color: firstAppearance ? "#c0392b" : baseColor,
          size: baseSize * (firstAppearance ? 1.35 : 1.15),
          hidden: false,
          zIndex: 1,
        };
      }
      // Dim non-neighbors instead of hiding (hiding can blank out on some builds)
      return {
        ...data,
        color: "rgba(200,200,200,0.03)",
        size: Math.max(0.5, baseSize * 0.18),
        label: "",
        hidden: false,
        zIndex: 0,
      };
    });

    renderer.setSetting("edgeReducer", (edge, data) => {
      const s = graph.source(edge);
      const t = graph.target(edge);
      const ds = graph.getNodeAttribute(s, "degree");
      const dt = graph.getNodeAttribute(t, "degree");
      if (ds < minDegree || dt < minDegree) return { ...data, hidden: true };

      const hasTemporalFilter = !!activeSlice;
      const activeInSlice =
        !hasTemporalFilter ? (passesMinWorks(s) && passesMinWorks(t)) :
        (activeEdges.has(edgeKey(s, t)) && activeNodes.has(s) && activeNodes.has(t) && passesMinWorks(s) && passesMinWorks(t));
      if (!selectedNeighborhood) {
        if (!activeInSlice) return { ...data, hidden: true };
        return { ...data, color: "rgba(0,0,0,0.08)", hidden: false };
      }

      const keep = selectedNeighborhood.has(s) && selectedNeighborhood.has(t);
      if (keep && activeInSlice) return { ...data, color: "rgba(0,0,0,0.18)", hidden: false };
      if (keep) return { ...data, hidden: true };
      return { ...data, color: "rgba(0,0,0,0.004)", hidden: false };
    });

    // Events
    renderer.on("clickNode", ({ node }) => {
      setSelected(node);
      focusNode(node);
    });
    renderer.on("clickStage", () => setSelected(null));

    if (sliceSlider && temporalSlices.length) {
      sliceSlider.addEventListener("input", (e) => {
        updateTemporalState(e.target.value);
        refreshSelectedNeighborhood();
        if (selectedNode) {
          setDetails(
            selectedNode,
            graph.getNodeAttributes(selectedNode),
            graph.neighbors(selectedNode).length,
            activeSlice,
            activeNodeStats[selectedNode],
            nodeMeta[selectedNode],
            minWorks,
          );
        }
        renderer.refresh();
      });
    }

    function resetAll() {
      if (search) search.value = "";
      if (aboutPanel) aboutPanel.hidden = true;
      if (aboutBtn) aboutBtn.setAttribute("aria-expanded", "false");
      minWorks = 1;
      if (minWorksSlider) minWorksSlider.value = String(minWorks);
      updateMinWorksLabel();
      if (temporalSlices.length) updateTemporalState(initialSliceIndex);
      setSelected(null);
      camera.animate(initialCameraState, { duration: 500 });
      renderer.refresh();
    }

    if (resetBtn) resetBtn.addEventListener("click", () => resetAll());

    if (aboutBtn && aboutPanel) {
      aboutBtn.addEventListener("click", () => {
        const nextHidden = !aboutPanel.hidden ? true : false;
        aboutPanel.hidden = nextHidden;
        aboutBtn.setAttribute("aria-expanded", String(!nextHidden));
      });
    }

    function findNodeByQuery(qNorm, qRaw) {
      if (!qNorm && !qRaw) return null;
      // Allow searching by node id (QID)
      if (qRaw && graph.hasNode(qRaw)) return qRaw;
      // Exact label match
      const exact = labelToNodes.get(qNorm);
      if (exact && exact.length) return exact[0];
      // startsWith then includes
      for (const [lab, nodes] of labelToNodes.entries()) {
        if (lab.startsWith(qNorm)) return nodes[0];
      }
      for (const [lab, nodes] of labelToNodes.entries()) {
        if (lab.includes(qNorm)) return nodes[0];
      }
      return null;
    }

    function runSearch() {
      if (!search) return;
      const raw = (search.value || "").trim();
      const q = normLabel(raw);
      const node = findNodeByQuery(q, raw);
      if (!node) return;
      setSelected(node);
      focusNode(node);
    }

    if (search) {
      search.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        runSearch();
      });
      // Selecting an option from the datalist triggers change
      search.addEventListener("change", () => runSearch());
    }

    updateReadyStatus();
  })().catch((e) => {
    const msg = e && (e.stack || e.message) ? (e.stack || e.message) : String(e);
    console.error(e);
    setStatus(`Error:\n${msg}`);
  });
})();
