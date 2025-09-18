/**
 * Stacked Waterfall (single-flight loader, self-host friendly, loud debug)
 * Query shape: Rows = stage (e.g., calls.call_funnel), Pivot = subcategory (optional), Measure = count
 */
(function() {
  // ---------- helpers ----------
  function loadScriptOnce(src) {
    if (!loadScriptOnce._map) loadScriptOnce._map = new Map();
    if (loadScriptOnce._map.has(src)) return loadScriptOnce._map.get(src);
    const p = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
    loadScriptOnce._map.set(src, p);
    return p;
  }
  function now() { return new Date().toLocaleString(); }
  function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // Global single-flight for Highcharts boot
  let HC_BOOT = null;
  async function ensureHighcharts(vendorBase, useCDNFallback) {
    if (window.Highcharts && window.Highcharts.seriesTypes && window.Highcharts.seriesTypes.waterfall) {
      return; // already loaded fully
    }
    if (!HC_BOOT) {
      HC_BOOT = (async () => {
        const base = (vendorBase || '').replace(/\/+$/, '');
        const useBase = base || (useCDNFallback ? 'https://code.highcharts.com' : '');
        if (!useBase) throw new Error('No vendor_base_url provided and CDN fallback disabled');

        // load core then module
        await loadScriptOnce(`${useBase}/highcharts.js`);
        await loadScriptOnce(`${useBase}/modules/waterfall.js`);

        if (!(window.Highcharts && window.Highcharts.seriesTypes && window.Highcharts.seriesTypes.waterfall)) {
          throw new Error('Highcharts waterfall not available after load');
        }
      })();
    }
    return HC_BOOT;
  }

  looker.plugins.visualizations.add({
    id: "stacked_waterfall_sf",
    label: "Stacked Waterfall (SF)",
    options: {
      // Data resolution
      stage_dim_name:   { type: "string", label: "Stage dimension (defaults to first dim)", default: "" },
      measure_name:     { type: "string", label: "Measure (defaults to first measure)", default: "" },
      order_field_name: { type: "string", label: "Optional sort field (view.field)", default: "" },

      // Semantics
      start_stage_label:   { type: "string", label: "Start stage label", default: "" },
      negative_stages_csv: { type: "string", label: "Negative stages (CSV)", default: "" },
      treat_after_start_as_negative: { type: "boolean", label: "Treat all after start as negative", default: true },

      // Appearance
      chart_title:    { type: "string",  label: "Title", default: "Waterfall Analysis" },
      show_labels:    { type: "boolean", label: "Show data labels", default: true },
      height_px:      { type: "number",  label: "Height (px)", default: 500 },
      positive_color: { type: "string",  label: "Positive color", default: "#52C41A" },
      negative_color: { type: "string",  label: "Negative color", default: "#1890FF" },
      connector_color:{ type: "string",  label: "Connector color", default: "#999" },

      // Vendor loading
      vendor_base_url:  { type: "string", label: "Vendor base URL (e.g., https://cdn.jsdelivr.net/gh/.../vendor)", default: "" },
      allow_cdn_fallback: { type: "boolean", label: "Allow fallback to code.highcharts.com", default: false },

      // Debug
      debug_mode: { type: "boolean", label: "Show debug panel", default: true }
    },

    create: function(element) {
      // Shell
      element.innerHTML = `
        <div class="wf-root" style="display:flex;flex-direction:column;width:100%;height:100%;">
          <div class="wf-alert" style="display:none;padding:8px 12px;font:12px system-ui;background:#fff3cd;color:#7a5d00;border-bottom:1px solid #f1e2a6"></div>
          <div class="wf-host" style="flex:1 1 auto;width:100%;height:100%;"></div>
        </div>
      `;
      this._alert = element.querySelector(".wf-alert");
      this._host  = element.querySelector(".wf-host");
    },

    updateAsync: async function(data, element, config, queryResponse, details, done) {
      const host = this._host;
      const alertBox = this._alert;
      const showDebug = !!config.debug_mode;
      const warn = (msg) => { alertBox.style.display = "block"; alertBox.innerHTML = esc(msg); };
      const clearWarn = () => { alertBox.style.display = "none"; alertBox.innerHTML = ""; };

      try {
        clearWarn();
        const dims = queryResponse.fields.dimensions || [];
        const pivs = queryResponse.fields.pivots || [];
        const meas = queryResponse.fields.measures || [];

        if (showDebug) warn(`DEBUG ${now()} — dims=${dims.length}, pivots=${pivs.length}, measures=${meas.length}`);

        if (!dims.length) { host.innerHTML = `<div style="padding:12px;color:#a00">Need a stage dimension.</div>`; return done(); }
        if (!meas.length) { host.innerHTML = `<div style="padding:12px;color:#a00">Need a measure.</div>`; return done(); }

        // Resolve fields
        const stageDim =
          (config.stage_dim_name && dims.find(d => d.name === config.stage_dim_name)?.name) ||
          dims[0].name;

        const measure =
          (config.measure_name && meas.find(m => m.name === config.measure_name)?.name) ||
          meas[0].name;

        // Optional sort
        let rows = data.slice();
        if (config.order_field_name) {
          const k = config.order_field_name;
          rows.sort((a,b)=>{
            const av=a[k]?.value, bv=b[k]?.value;
            const an=Number(av), bn=Number(bv);
            if (!Number.isNaN(an) && !Number.isNaN(bn)) return an-bn;
            return String(av).localeCompare(String(bv));
          });
        }

        // Prep categories and series
        const categories = rows.map(r => String((r[stageDim]?.value) ?? "Unknown"));
        const negSet = new Set((config.negative_stages_csv||"").split(",").map(s=>s.trim()).filter(Boolean));
        const startStage = (config.start_stage_label||"").trim();

        // Build Highcharts series (one per pivot if any, else single series)
        let series;
        if (pivs.length > 0) {
          series = pivs.map(p => {
            const dataPts = rows.map((r,i) => {
              const cell = r[`${measure}|${p.key}`];
              const raw = (cell && cell.value!=null) ? +cell.value : 0;

              // sign: start positive, others negative; override via negative list
              let sign = 1;
              const stage = String((r[stageDim]?.value) ?? "");
              if (negSet.size) sign = negSet.has(stage) ? -1 : 1;
              else if (startStage) sign = (stage===startStage) ? 1 : -1;
              else sign = (i===0) ? 1 : -1;

              return { y: sign * raw };
            });
            return { type: 'waterfall', name: p.label || p.key, data: dataPts };
          });
        } else {
          // Single-series waterfall
          const dataPts = rows.map((r,i)=>{
            const cell = r[measure];
            const raw = (cell && cell.value!=null) ? +cell.value : 0;
            let sign = (i===0) ? 1 : -1;
            return { y: sign * raw };
          });
          series = [{ type: 'waterfall', name: (meas[0].label || 'Value'), data: dataPts }];
        }

        // Load Highcharts once (self-host preferred)
        try {
          await ensureHighcharts(config.vendor_base_url, !!config.allow_cdn_fallback);
        } catch (e) {
          warn(`Highcharts load failed: ${e.message}. You likely need to self-host vendor files and set Vendor base URL.`);
          host.innerHTML = `<div style="padding:12px">Could not load Highcharts. Try setting <b>Vendor base URL</b> to your repo (e.g., https://cdn.jsdelivr.net/gh/maxbickett/lookervis@main/vendor).</div>`;
          return done();
        }

        const HC = window.Highcharts;
        // container
        const chartId = 'wf_' + Math.random().toString(36).slice(2);
        host.innerHTML = `<div id="${chartId}" style="width:100%;height:${config.height_px||500}px"></div>`;

        HC.chart(chartId, {
          chart: { type: 'waterfall', height: config.height_px || 500 },
          title: { text: config.chart_title || 'Waterfall' },
          xAxis: { categories, type: 'category', crosshair: true },
          yAxis: { title: { text: (meas[0]?.label) || 'Value' } },
          tooltip: {
            shared: true,
            pointFormatter: function(){
              const v = Math.abs(this.y).toLocaleString();
              return `<span style="color:${this.color}">●</span> ${this.series.name}: <b>${v}</b><br/>`;
            }
          },
          plotOptions: {
            series: { stacking: (pivs.length>0 ? 'overlap' : undefined) },
            waterfall: {
              stacking: (pivs.length>0 ? 'overlap' : undefined),
              dataLabels: {
                enabled: config.show_labels !== false,
                formatter: function(){ return Math.abs(this.y).toLocaleString(); }
              },
              lineWidth: 1,
              lineColor: config.connector_color || '#999',
              dashStyle: 'Dot',
              upColor: config.positive_color || '#52C41A',
              color:   config.negative_color || '#1890FF'
            }
          },
          legend: { enabled: pivs.length > 1 },
          series
        });

        if (showDebug) warn(`DEBUG ${now()} — Highcharts render OK`);
        return done();
      } catch (err) {
        this._host.innerHTML = `<div style="padding:12px;color:#a00">Viz error: ${esc(err && err.message ? err.message : String(err))}</div>`;
        return done();
      }
    }
  });
})();
