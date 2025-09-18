/* stacked_waterfall.js
 * Looker custom viz: Stacked Waterfall
 * Query shape: Rows = stage dimension, Pivot = subcategory, Measure = count
 */
(function() {
  looker.plugins.visualizations.add({
    id: "stacked_waterfall",
    label: "Stacked Waterfall",
    options: {
      // Field configuration
      stage_dim_name: { 
        type: "string", 
        label: "Stage Dimension Name", 
        default: "",
        placeholder: "Leave blank to use first dimension"
      },
      measure_name: { 
        type: "string", 
        label: "Measure Name", 
        default: "",
        placeholder: "Leave blank to use first measure"
      },
      
      // Waterfall behavior
      start_stage_label: { 
        type: "string", 
        label: "Starting Stage Label", 
        default: "1 - did not contact",
        placeholder: "e.g., '1 - did not contact'"
      },
      negative_stages_csv: { 
        type: "string", 
        label: "Negative Stages (comma-separated)", 
        default: "",
        placeholder: "e.g., '3 - customer hangup, 4 - we hung up'"
      },
      treat_after_start_as_negative: { 
        type: "boolean", 
        label: "Treat All Stages After Start as Negative", 
        default: true 
      },
      
      // Display options
      chart_title: {
        type: "string",
        label: "Chart Title",
        default: "Call Flow Waterfall"
      },
      show_data_labels: { 
        type: "boolean", 
        label: "Show Data Labels", 
        default: true 
      },
      show_legend: {
        type: "boolean",
        label: "Show Legend",
        default: true
      },
      height_px: { 
        type: "number", 
        label: "Chart Height (pixels)", 
        default: 500,
        min: 300,
        max: 1000
      },
      
      // Colors
      positive_color: { 
        type: "string", 
        label: "Positive Movement Color", 
        default: "#52C41A" 
      },
      negative_color: { 
        type: "string", 
        label: "Negative Movement Color", 
        default: "#1890FF" 
      },
      total_color: {
        type: "string",
        label: "Total/Sum Bar Color",
        default: "#595959"
      },
      connector_color: { 
        type: "string", 
        label: "Connector Line Color", 
        default: "#999999" 
      },
      
      // Advanced
      series_opacity: { 
        type: "number", 
        label: "Bar Opacity (0-1)", 
        default: 0.85,
        min: 0.1,
        max: 1
      },
      debug_mode: { 
        type: "boolean", 
        label: "Show Debug Info (console)", 
        default: false 
      }
    },

    create: function(element, config) {
      // Create container
      element.innerHTML = `
        <div id="viz-container" style="width: 100%; height: 100%; position: relative;">
          <div id="chart-area" style="width: 100%; height: 100%;"></div>
        </div>
      `;
      
      // Load Highcharts if not already loaded
      if (typeof Highcharts === 'undefined') {
        this.loadHighcharts();
      }
    },
    
    loadHighcharts: function() {
      // Try to load Highcharts from CDN
      const scripts = [
        'https://code.highcharts.com/highcharts.js',
        'https://code.highcharts.com/modules/waterfall.js',
        'https://code.highcharts.com/modules/exporting.js'
      ];
      
      scripts.forEach(src => {
        const script = document.createElement('script');
        script.src = src;
        script.async = false;
        document.head.appendChild(script);
      });
    },

    updateAsync: function(data, element, config, queryResponse, details, done) {
      // Debug logging
      if (config.debug_mode) {
        console.log('Stacked Waterfall Debug:', {
          data: data,
          config: config,
          queryResponse: queryResponse
        });
      }
      
      // Get container
      const container = element.querySelector('#chart-area');
      
      // Validate inputs
      const dims = queryResponse.fields.dimensions || [];
      const pivots = queryResponse.fields.pivots || [];
      const measures = queryResponse.fields.measures || [];
      
      if (dims.length === 0) {
        container.innerHTML = '<div style="padding: 20px; color: #ff4444;">❌ No dimensions found. Add a stage dimension (e.g., calls.call_funnel)</div>';
        done();
        return;
      }
      
      if (pivots.length === 0) {
        container.innerHTML = '<div style="padding: 20px; color: #ff4444;">❌ No pivots found. Add a pivot for subcategories</div>';
        done();
        return;
      }
      
      if (measures.length === 0) {
        container.innerHTML = '<div style="padding: 20px; color: #ff4444;">❌ No measures found. Add a count measure</div>';
        done();
        return;
      }
      
      // Wait for Highcharts to load
      let attempts = 0;
      const checkHighcharts = () => {
        if (typeof Highcharts !== 'undefined') {
          this.renderChart(data, container, config, queryResponse);
          done();
        } else if (attempts < 20) {
          attempts++;
          setTimeout(checkHighcharts, 250);
        } else {
          this.renderFallback(data, container, config, queryResponse);
          done();
        }
      };
      
      checkHighcharts();
    },
    
    renderChart: function(data, container, config, queryResponse) {
      const dims = queryResponse.fields.dimensions || [];
      const pivots = queryResponse.fields.pivots || [];
      const measures = queryResponse.fields.measures || [];
      
      // Determine field names
      const stageDim = config.stage_dim_name || dims[0].name;
      const measureName = config.measure_name || measures[0].name;
      
      // Parse configuration
      const startStage = config.start_stage_label || '';
      const negativeStages = (config.negative_stages_csv || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const negativeSet = new Set(negativeStages);
      
      // Extract categories (stage labels)
      const categories = data.map(row => {
        const stageField = row[stageDim];
        return stageField ? String(stageField.value) : 'Unknown';
      });
      
      // Build series for each pivot
      const series = pivots.map((pivot, pivotIndex) => {
        const seriesData = data.map((row, rowIndex) => {
          const fieldKey = `${measureName}|${pivot.key}`;
          const cell = row[fieldKey];
          const rawValue = cell && cell.value !== null ? Number(cell.value) : 0;
          
          if (rawValue === 0) return null; // Skip zero values
          
          const stageName = categories[rowIndex];
          
          // Determine if this should be negative
          let isNegative = false;
          if (negativeSet.size > 0) {
            isNegative = negativeSet.has(stageName);
          } else if (config.treat_after_start_as_negative) {
            if (startStage) {
              // Find the start stage index
              const startIndex = categories.indexOf(startStage);
              isNegative = startIndex >= 0 && rowIndex > startIndex;
            } else {
              // If no start stage specified, treat everything after first as negative
              isNegative = rowIndex > 0;
            }
          }
          
          const value = isNegative ? -Math.abs(rawValue) : Math.abs(rawValue);
          
          // Create point object
          const point = {
            y: value,
            rawValue: rawValue,
            isNegative: isNegative
          };
          
          // Mark start stage as intermediate sum
          if (stageName === startStage) {
            point.isIntermediateSum = true;
          }
          
          return point;
        });
        
        return {
          type: 'waterfall',
          name: pivot.label || pivot.key,
          data: seriesData,
          color: config.positive_color,
          negativeColor: config.negative_color,
          borderWidth: 0,
          opacity: config.series_opacity
        };
      });
      
      // Create the chart
      Highcharts.chart(container, {
        chart: {
          type: 'waterfall',
          height: config.height_px || 500
        },
        title: {
          text: config.chart_title || 'Stacked Waterfall'
        },
        xAxis: {
          type: 'category',
          categories: categories,
          crosshair: true
        },
        yAxis: {
          title: {
            text: measures[0].label || 'Value'
          }
        },
        legend: {
          enabled: config.show_legend !== false
        },
        tooltip: {
          shared: true,
          formatter: function() {
            let s = '<b>' + this.x + '</b><br/>';
            this.points.forEach(point => {
              if (point.y !== 0) {
                const displayValue = Math.abs(point.point.options.rawValue || point.y);
                s += '<span style="color:' + point.color + '">●</span> ' +
                     point.series.name + ': <b>' + 
                     displayValue.toLocaleString() + '</b><br/>';
              }
            });
            return s;
          }
        },
        plotOptions: {
          waterfall: {
            stacking: 'overlap', // This enables stacked waterfall
            dataLabels: {
              enabled: config.show_data_labels,
              formatter: function() {
                return this.point.rawValue ? 
                  Math.abs(this.point.rawValue).toLocaleString() : '';
              },
              style: {
                fontSize: '11px',
                fontWeight: 'normal'
              }
            },
            lineWidth: 1,
            lineColor: config.connector_color || '#999999',
            dashStyle: 'Dot',
            upColor: config.positive_color || '#52C41A',
            color: config.negative_color || '#1890FF',
            intermediateSumColor: config.total_color || '#595959',
            opacity: config.series_opacity || 0.85
          },
          series: {
            stacking: 'overlap',
            borderWidth: 0
          }
        },
        series: series
      });
    },
    
    renderFallback: function(data, container, config, queryResponse) {
      // Simple HTML fallback if Highcharts fails to load
      container.innerHTML = `
        <div style="padding: 20px; background: #f5f5f5; border-radius: 4px;">
          <h3 style="color: #ff6600;">⚠️ Highcharts Failed to Load</h3>
          <p>The waterfall chart requires Highcharts library.</p>
          <p>Possible causes:</p>
          <ul>
            <li>Content Security Policy blocking external scripts</li>
            <li>Network connectivity issues</li>
            <li>CDN temporarily unavailable</li>
          </ul>
          <p>Data summary: ${data.length} stages, ${queryResponse.fields.pivots.length} categories</p>
        </div>
      `;
    }
  });
})();
