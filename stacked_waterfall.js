/* stacked_waterfall.js
 * Looker custom viz: Stacked Waterfall with robust diagnostics and a no-lib SVG fallback.
 * Query shape required: Rows = stage (e.g., calls.call_funnel), Pivot = subcategory, Measure = count
 */
(function() {
  // ---------- Utilities ----------
  function now() { return new Date().toLocaleString(); }
  function htmlEscape(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // Promise loader for external scripts
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load: ' + src));
      document.head.appendChild(s);
    });
  }

  // ---------- Faux SVG waterfall (fallback) ----------
  function renderFauxWaterfall(host, rows, pivots, measureName, opts) {
    // Compute signed totals and bases
    const W = host.clientWidth || 800, H = opts.height_px || 420;
    const padL=60, padR=20, padT=24, padB=48;
    const plotW = Math.max(120, W-padL-padR);
    const plotH = Math.max(160, H-padT-padB);
    const n = rows.length;
    const gap = 10;
    const barW = Math.max(8, (plotW - gap*(n-1))/Math.max(1,n));

    const negSet = new Set((opts.negative_stages_csv||"").split(",").map(s=>s.trim()).filter(Boolean));
    const startStage = (opts.start_stage_label||"").trim();

    const totals = rows.map(r => pivots.reduce((s,p) => s + (+((r[measureName+"|"+p.key]||{}).value||0)), 0));
    const stageLabels = rows.map(r => String((r[opts.stage_dim_name]||{}).value ?? ""));

    // Signed totals
    const signedTotals = totals.map((t,i)=>{
      let sign=1;
      if (negSet.size) sign = negSet.has(stageLabels[i]) ? -1 : 1;
      else if (opts.treat_after_start_as_negative && startStage) sign = (stageLabels[i] === startStage) ? 1 : -1;
      else if (opts.treat_after_start_as_negative && !startStage) sign = (i===0) ? 1 : -1;
      return sign * t;
    });

    // Bases (cumulative prior)
    const bases = [];
    let run = 0;
    for (let i=0;i<n;i++) { bases.push(run); run += signedTotals[i]; }

    const minY = Math.min(0, ...bases, ...bases.map((b,i)=>b+signedTotals[i]));
    const maxY = Math.max(0, ...bases, ...bases.map((b,i)=>b+signedTotals[i]));
    const y = (v)=> padT + (maxY - v) * (plotH / Math.max(1,(maxY-minY)));
    const x = (i)=> padL + i*(barW+gap);

    const palette = ["#3578e5","#15af15","#ff7f50","#aa66cc","#f5a623","#50e3c2","#b8e986","#bd10e0","#7ed321","#f8e71c"];
    const colorOf = (idx)=> palette[idx % palette.length];

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS,"svg");
    svg.setAttribute("width","100%");
    svg.setAttribute("height", String(H));
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    function line(x1,y1,x2,y2,stroke) {
      const e = document.createElementNS(svgNS,"line");
      e.setAttribute("x1",x1); e.setAttribute("y1",y1);
      e.setAttribute("x2",x2); e.setAttribute("y2",y2);
      e.setAttribute("stroke",stroke);
      return e;
    }
    function rect(x,y,w,h,fill) {
      const e = document.createElementNS(svgNS,"rect");
      e.setAttribute("x",x); e.setAttribute("y",y);
      e.setAttribute("width",w); e.setAttribute("height",h);
      e.setAttribute("fill",fill);
      return e;
    }
    function text(x,y,str,size,color,anchor) {
      const e = document.createElementNS(svgNS,"text");
      e.setAttribute("x",x); e.setAttribute("y",y);
      e.setAttribute("font-size",size); e.setAttribute("fill",color||"#222");
      if (anchor) e.setAttribute("text-anchor",anchor);
      e.appendChild(document.createTextNode(str));
      return e;
    }

    // axes
    svg.appendChild(line(padL, y(0), W-padR, y(0), "#999"));
    svg.appendChild(line(padL, padT, padL, H-padB, "#999"));

    // stacked bars on base
    rows.forEach((row, i) => {
      const base = bases[i];
      let acc = base;

      pivots.forEach((p, pi) => {
        const vRaw = +(((row[measureName+"|"+p.key]||{}).value) || 0);
        if (!vRaw) return;

        let sign=1;
        if (negSet.size) sign = negSet.has(stageLabels[i]) ? -1 : 1;
        else if (startStage) sign = (stageLabels[i]===startStage) ? 1 : -1;
        else sign = (i===0) ? 1 : -1;

        const v = sign * vRaw;
        const yTop = y(acc + v);
        const yBot = y(acc);
        const h = Math.max(0.5, yBot - yTop);

        svg.appendChild(rect(x(i), yTop, barW, h, colorOf(pi)));
        if (h > 14 && opts.show_data_labels) {
          svg.appendChild(text(x(i)+barW/2, yTop+12, String(vRaw), 11, "#fff", "middle"));
        }
        acc += v;
      });

      svg.appendChild(text(x(i)+barW/2, H-padB+12, stageLabels[i], 11, "#444", "middle"));
    });

    svg.appendChild(text(padL, 16, "Stacked Waterfall (SVG fallback)", 13, "#333"));
    host.innerHTML = "";
    host.appendChild(svg);
  }

  // ---------- Looker viz ----------
  looker.plugins.visualizations.add({
    id: "stacked_waterfall_hybrid",
    label: "Stacked Waterfall",
    options: {
      // Field resolution
      stage_dim_name:      { type: "string", label: "Stage dimension name (defaults to first dim)", default: "" },
      measure_name:        { type: "string", label: "Measure name (defaults to first measure)",    default: "" },
      order_field_name:    { type: "string", label: "Optional sort field name (view.field)",        default: "" },

      // Waterfall semantics
      start_stage_label:   { type: "string", label: "Start stage label", default: "" },
      negative_stages_csv: { type: "string", label: "Negative stages (CSV)", default: "" },
      treat_after_start_as_negative: { type: "boolean", label: "Treat all stages after start as negative", default: true },

      // Appearance
      show_data_labels:    { type: "boolean", label: "Show data labels", default: true },
      decimals:            { type: "number",  label: "Label decimals", default: 0 },
      height_px:           { type: "number",  label: "Height (px)", default: 420 },
      up_color:            { type: "string",  label: "Up color (Highcharts)", default: "#15af15" },
      down_color:          { type: "string",  label: "Down color (Highcharts)", default: "#0088ff" },
      connector_color:     { type: "string",  label: "Connector color (Highcharts)", default: "#999999" },
      series_opacity:      { type: "number",  label: "Series opacity (0–1, Highcharts)", default: 0.9 },

      // Vendor loading (so you can self-host Highcharts to avoid CSP)
      vendor_base_url:     { type: "string", label: "Highcharts base URL (leave blank to try code.highcharts.com)", default: "" },

      // Debug
      debug_mode:          { type: "boolean", label: "Show debug panel", default: true }
    },

    create: function(element) {
      this._root = document.createElement("div");
      this._root.style.width = "100%";
      this._root.style.height = "100%";
      this._root.style.display = "flex";
      this._root.style.flexDirection = "column";

      this._alert = document.createElement("div");
      this._alert.style.cssText = "font:12px system-ui;padding:8px 12px;display:none;background:#fff3cd;color:#7a5d00;border-bottom:1px solid #f1e2a6";
      this._root.appendChild(this._alert);

      this._viz = document.createElement("div");
      this._viz.style.cssText = "flex:1 1 auto; width:100%; height:100%;";
      this._root.appendChild(this._viz);

      element.appendChild(this._root);
    },

    updateAsync: async function(data, element, config, queryResponse, details, done) {
      const showDebug = !!config.debug_mode;
      const alertBox = this._alert;
      const host = this._viz;
      function showWarn(msg) { alertBox.innerHTML = htmlEscape(msg); alertBox.style.display = "block"; }
      function hideWarn() { alertBox.style.display = "none"; alertBox.innerHTML = ""; }

      try {
        hideWarn();

        const dims = queryResponse.fields.dimensions || [];
        const pivs = queryResponse.fields.pivots || [];
        const meas = queryResponse.fields.measures || [];

        // Debug panel (field counts)
        if (showDebug) {
          showWarn(`DEBUG ${now()} — dims=${dims.length}, pivots=${pivs.length}, measures=${meas.length}`);
        }

        // Validate query shape
        if (!dims.length) {
          host.innerHTML = "<div style='padding:12px;color:#a00'>Need a stage dimension (e.g., calls.call_funnel).</div>";
          return done();
        }
        if (!pivs.length) {
          host.innerHTML = "<div style='padding:12px;color:#a00'>Pivot by subcategory to stack breakdowns.</div>";
          return done();
        }
        if (!meas.length) {
          host.innerHTML = "<div style='padding:12px;color:#a00'>Need a measure (count or equivalent).</div>";
          return done();
        }

        // Resolve field names
        const stageDimName =
          (config.stage_dim_name && dims.find(d => d.name === config.stage_dim_name)?.name) ||
          dims[0].name;

        const measureName =
          (config.measure_name && meas.find(m => m.name === config.measure_name)?.name) ||
          meas[0].name;

        // Sort rows if order_field present
        let rows = data.slice();
        if (config.order_field_name) {
          const key = config.order_field_name;
          rows.sort((a,b) => {
            const av = a[key]?.value, bv = b[key]?.value;
            const an = Number(av), bn = Number(bv);
            if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
            return String(av).localeCompare(String(bv));
          });
        }

        // Try Highcharts first
        const needHC = (typeof window.Highcharts === "undefined");
        if (needHC) {
          // Decide source
          const base = (config.vendor_base_url || "").trim();
          try {
            if (base) {
              await loadScript(base.replace(/\/+$/,"") + "/highcharts.js");
              await loadScript(base.replace(/\/+$/,"") + "/modules/waterfall.js");
            } else {
              // Try the public CDN; if CSP blocks it, we'll fall back to SVG.
              await loadScript("https://code.highcharts.com/highcharts.js");
              await loadScript("https://code.highcharts.com/modules/waterfall.js");
            }
          } catch (e) {
            // Could not load; we’ll fall back.
          }
        }

        // If HC is present, render true stacked-waterfall
        if (typeof window.Highcharts !== "undefined") {
          try {
            const categories = rows.map(r => String((r[stageDimName]?.value) ?? ""));
            const negSet = new Set((config.negative_stages_csv||"").split(",").map(s=>s.trim()).filter(Boolean));
            const startStage = (config.start_stage_label||"").trim();

            const series = pivs.map(p => {
              const pts = rows.map((r,i) => {
                const cell = r[`${measureName}|${p.key}`];
                const raw = (cell && cell.value!=null) ? +cell.value : 0;
                const stage = String((r[stageDimName]?.value) ?? "");
                let sign = 1;
                if (negSet.size) sign = negSet.has(stage) ? -1 : 1;
                else if (config.treat_after_start_as_negative && startStage) sign = (stage === startStage) ? 1 : -1;
                else if (config.treat_after_start_as_negative && !startStage) sign = (i===0) ? 1 : -1;
                const pt = { y: sign * raw };
                if (startStage && stage === startStage) pt.isSum = true;
                return pt;
              });
              return { type: "waterfall", name: p.label || p.key, data: pts, dataLabels: { enabled: !!config.show_data_labels } };
            });

            const HC = window.Highcharts;
            const decimals = (typeof config.decimals === "number") ? config.decimals : 0;
            const fmt = (v) => Number(v).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

            HC.chart(host, {
              chart: { type: "waterfall", height: config.height_px || 420 },
              title: { text: "Stacked Waterfall" },
              xAxis: { categories, tickmarkPlacement: "on" },
              yAxis: { title: { text: (meas[0]?.label) || "Value" } },
              tooltip: { shared: true, pointFormatter: function(){ return `<span style="color:${this.color}">●</span> ${this.series.name}: <b>${fmt(this.y)}</b><br/>`; } },
              plotOptions: {
                series: {
                  stacking: "overlap", // key for stacked waterfall
                  borderWidth: 0,
                  opacity: (typeof config.series_opacity === "number") ? config.series_opacity : 0.9
                },
                waterfall: {
                  upColor: config.up_color || "#15af15",
                  color:   config.down_color || "#0088ff",
                  lineColor: config.connector_color || "#999999",
                  lineWidth: 1,
                  dataLabels: { enabled: !!config.show_data_labels, formatter: function(){ return fmt(this.y); } }
                }
              },
              series
            });

            // Success, hide warnings
            if (showDebug) showWarn(`DEBUG ${now()} — Highcharts render OK`);
            return done();
          } catch (hcErr) {
            // If HC rendering failed, report and fall through to fallback
            showWarn(`Highcharts error: ${hcErr && hcErr.message ? hcErr.message : String(hcErr)} — falling back to SVG.`);
          }
        } else {
          // No Highcharts globally available
          showWarn("Highcharts not available (CSP or URL). Rendering SVG fallback.");
        }

        // SVG fallback
        renderFauxWaterfall(host, rows, pivs, measureName, {
          stage_dim_name: stageDimName,
          start_stage_label: config.start_stage_label,
          negative_stages_csv: config.negative_stages_csv,
          treat_after_start_as_negative: !!config.treat_after_start_as_negative,
          show_data_labels: !!config.show_data_labels,
          height_px: config.height_px || 420
        });

        return done();
      } catch (e) {
        this._viz.innerHTML = `<div style="padding:12px;color:#a00">Viz error: ${htmlEscape(e && e.message ? e.message : String(e))}</div>`;
        return done();
      }
    }
  });
})();
