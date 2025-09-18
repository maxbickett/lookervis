/* visualizations/stacked_waterfall.js */
(function() {
  // ---- tiny loader for external scripts
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  let libsReady = false;
  async function ensureHighcharts() {
    if (libsReady) return;
    // Highcharts core + Waterfall module
    await loadScript('https://code.highcharts.com/highcharts.js');
    await loadScript('https://code.highcharts.com/modules/waterfall.js');
    // If you later want hatch/pattern fills: uncomment below
    // await loadScript('https://code.highcharts.com/modules/pattern-fill.js');
    libsReady = true;
  }

  // Register the visualization with Looker (custom viz API)
  // Ref: Looker custom viz builder docs show data/updateAsync plumbing. :contentReference[oaicite:3]{index=3}
  looker.plugins.visualizations.add({
    id: 'stacked_waterfall_highcharts',
    label: 'Stacked Waterfall (Highcharts)',
    // User-configurable options (appear in the tile sidebar)
    options: {
      stage_dim_name: {
        type: 'string',
        label: 'Stage dimension (defaults to first dimension)',
        display: 'text',
        default: ''
      },
      measure_name: {
        type: 'string',
        label: 'Measure name (defaults to first measure)',
        display: 'text',
        default: ''
      },
      order_field_name: {
        type: 'string',
        label: 'Optional sort field name (view.field)',
        display: 'text',
        default: ''
      },
      start_stage_label: {
        type: 'string',
        label: 'Start stage label (big positive bar)',
        display: 'text',
        default: ''
      },
      end_stage_label: {
        type: 'string',
        label: 'End stage label (sum/total)',
        display: 'text',
        default: ''
      },
      negative_stages_csv: {
        type: 'string',
        label: 'Negative stages (CSV)',
        display: 'text',
        default: ''
      },
      treat_after_start_as_negative: {
        type: 'boolean',
        label: 'Treat all stages after start as negative',
        default: true
      },
      show_data_labels: {
        type: 'boolean',
        label: 'Show data labels',
        default: true
      },
      decimals: {
        type: 'number',
        label: 'Label decimals',
        default: 0
      },
      height_px: {
        type: 'number',
        label: 'Chart height (px)',
        default: 420
      },
      up_color: {
        type: 'string',
        label: 'Up color',
        default: '#15af15'
      },
      down_color: {
        type: 'string',
        label: 'Down color',
        default: '#0088ff'
      },
      connector_color: {
        type: 'string',
        label: 'Connector/line color',
        default: '#999999'
      },
      series_opacity: {
        type: 'number',
        label: 'Series opacity (0–1)',
        default: 0.9
      },
      title_text: {
        type: 'string',
        label: 'Title',
        default: 'Stacked Waterfall'
      }
    },

    create: function(element) {
      this._container = document.createElement('div');
      this._container.style.width = '100%';
      this._container.style.height = '100%';
      element.appendChild(this._container);
    },

    updateAsync: async function(data, element, config, queryResponse, details, done) {
      try {
        await ensureHighcharts();

        // Validate fields presence
        const dims = queryResponse.fields.dimensions || [];
        const pivots = queryResponse.fields.pivots || [];
        const measures = queryResponse.fields.measures || [];

        if (!dims.length) {
          this._container.innerHTML = '<div style="padding:12px;color:#a00">Need at least one dimension (stages). Add your call_funnel dimension.</div>';
          return done();
        }
        if (!pivots.length) {
          this._container.innerHTML = '<div style="padding:12px;color:#a00">Pivot by subcategory to stack breakdowns.</div>';
          return done();
        }
        if (!measures.length) {
          this._container.innerHTML = '<div style="padding:12px;color:#a00">Need at least one measure (count or similar).</div>';
          return done();
        }

        // Resolve names from config or defaults
        const stageDimName = config.stage_dim_name && dims.find(d => d.name === config.stage_dim_name)
          ? config.stage_dim_name
          : dims[0].name;

        const measureName = config.measure_name && measures.find(m => m.name === config.measure_name)
          ? config.measure_name
          : measures[0].name;

        // Shallow copy of rows for optional sorting
        let rows = data.slice();
        if (config.order_field_name) {
          const key = config.order_field_name;
          rows.sort((a, b) => {
            const av = a[key]?.value;
            const bv = b[key]?.value;
            const an = Number(av), bn = Number(bv);
            if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
            return String(av).localeCompare(String(bv));
          });
        }

        // X-axis categories in row order
        const categories = rows.map(r => (r[stageDimName]?.value ?? ''));

        // Determine which stages are negative (drop-offs)
        const negSet = new Set(
          (config.negative_stages_csv || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
        );
        const startStage = (config.start_stage_label || '').trim();
        const endStage   = (config.end_stage_label || '').trim();

        // Build series per pivot (subcategory)
        const series = pivots.map(p => {
          const pKey   = p.key;               // used to address pivoted cells
          const pLabel = p.label || p.key;

          const points = rows.map((r, i) => {
            const cell = r[`${measureName}|${pKey}`];
            const raw  = (cell && cell.value != null) ? Number(cell.value) : 0;
            const stage = r[stageDimName]?.value ?? '';

            // Decide sign for waterfall
            // Highcharts waterfall supports overlap stacking explicitly. :contentReference[oaicite:4]{index=4}
            let sign = 1;
            if (negSet.size) {
              sign = negSet.has(stage) ? -1 : 1;
            } else if (config.treat_after_start_as_negative && startStage) {
              sign = (stage === startStage) ? 1 : -1;
            } else if (config.treat_after_start_as_negative && !startStage) {
              sign = (i === 0) ? 1 : -1;
            }

            const point = { y: sign * raw };
            // Optionally mark sum bars
            if (startStage && stage === startStage) point.isSum = true;
            if (endStage && stage === endStage)     point.isSum = true;
            return point;
          });

          return {
            type: 'waterfall',
            name: pLabel,
            data: points,
            dataLabels: { enabled: !!config.show_data_labels }
          };
        });

        // Render chart
        const Highcharts = window.Highcharts;
        const decimals = (typeof config.decimals === 'number') ? config.decimals : 0;
        const fmt = (v) => Number(v).toLocaleString(undefined, {
          minimumFractionDigits: decimals, maximumFractionDigits: decimals
        });

        Highcharts.chart(this._container, {
          chart: { type: 'waterfall', height: config.height_px || 420 },
          title: { text: config.title_text || 'Stacked Waterfall' },
          xAxis: { categories, tickmarkPlacement: 'on' },
          yAxis: { title: { text: (measures[0] && measures[0].label) || 'Value' } },
          tooltip: {
            shared: true,
            pointFormatter: function() {
              return `<span style="color:${this.color}">●</span> ${this.series.name}: <b>${fmt(this.y)}</b><br/>`;
            }
          },
          plotOptions: {
            series: {
              stacking: 'overlap',     // key Highcharts setting for stacked waterfall :contentReference[oaicite:5]{index=5}
              borderWidth: 0,
              opacity: (typeof config.series_opacity === 'number') ? config.series_opacity : 0.9
            },
            waterfall: {
              upColor:     config.up_color   || '#15af15',
              color:       config.down_color || '#0088ff',
              lineColor:   config.connector_color || '#999999',
              lineWidth:   1,
              dataLabels: {
                enabled: !!config.show_data_labels,
                formatter: function() { return fmt(this.y); }
              }
            }
          },
          series
        });

        done();
      } catch (err) {
        this._container.innerHTML =
          `<div style="padding:12px;color:#a00;font-family:system-ui">
            ${String(err && err.message ? err.message : err)}
           </div>`;
        done();
      }
    }
  });
})();
