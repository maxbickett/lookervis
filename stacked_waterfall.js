/**
 * Stacked Waterfall for Looker - Fixed Module Loading
 */

(function() {
  // Track loading state globally
  window.waterfallModuleLoaded = window.waterfallModuleLoaded || false;
  
  looker.plugins.visualizations.add({
    id: "waterfall_fixed",
    label: "Waterfall Chart (Fixed)",
    
    options: {
      chart_title: {
        type: "string",
        label: "Chart Title",
        default: "Waterfall Analysis"
      },
      show_labels: {
        type: "boolean",
        label: "Show Data Labels",
        default: true
      },
      height_px: {
        type: "number",
        label: "Height (px)",
        default: 500
      },
      positive_color: {
        type: "string",
        label: "Positive Color",
        default: "#52C41A"
      },
      negative_color: {
        type: "string",
        label: "Negative Color", 
        default: "#1890FF"
      }
    },

    create: function(element, config) {
      element.innerHTML = `
        <div id="waterfall-container" style="width:100%; height:100%; position:relative;">
          <div id="loading-msg" style="padding:20px; text-align:center; color:#666;">
            Initializing waterfall chart...
          </div>
          <div id="chart-area" style="width:100%; height:100%; display:none;"></div>
        </div>
      `;
      
      // Start loading libraries if needed
      this.ensureLibrariesLoaded();
    },
    
    ensureLibrariesLoaded: function() {
      if (typeof window.Highcharts === 'undefined') {
        console.log('[Waterfall] Loading Highcharts...');
        
        const script1 = document.createElement('script');
        script1.src = 'https://code.highcharts.com/highcharts.js';
        script1.onload = () => {
          console.log('[Waterfall] Highcharts core loaded');
          this.loadWaterfallModule();
        };
        script1.onerror = () => {
          console.error('[Waterfall] Failed to load Highcharts');
        };
        document.head.appendChild(script1);
      } else if (!window.waterfallModuleLoaded) {
        console.log('[Waterfall] Highcharts found, loading waterfall module...');
        this.loadWaterfallModule();
      }
    },
    
    loadWaterfallModule: function() {
      // Check if waterfall is already available
      if (window.Highcharts && window.Highcharts.seriesTypes && window.Highcharts.seriesTypes.waterfall) {
        console.log('[Waterfall] Waterfall module already loaded');
        window.waterfallModuleLoaded = true;
        return;
      }
      
      const script2 = document.createElement('script');
      script2.src = 'https://code.highcharts.com/modules/waterfall.js';
      script2.onload = () => {
        console.log('[Waterfall] Waterfall module loaded');
        window.waterfallModuleLoaded = true;
      };
      script2.onerror = () => {
        console.error('[Waterfall] Failed to load waterfall module');
      };
      document.head.appendChild(script2);
    },

    updateAsync: function(data, element, config, queryResponse, details, done) {
      console.log('[Waterfall] updateAsync called with', data.length, 'rows');
      
      const loadingMsg = document.getElementById('loading-msg');
      const chartArea = document.getElementById('chart-area');
      
      // Validate data
      const dims = queryResponse.fields.dimensions || [];
      const pivots = queryResponse.fields.pivots || [];
      const measures = queryResponse.fields.measures || [];
      
      if (dims.length === 0 || measures.length === 0) {
        if (loadingMsg) {
          loadingMsg.innerHTML = '<span style="color:red;">Missing required dimensions or measures</span>';
        }
        done();
        return;
      }
      
      // Wait for libraries with explicit check
      let attempts = 0;
      const maxAttempts = 20;
      
      const checkAndRender = () => {
        const highchartsReady = typeof window.Highcharts !== 'undefined';
        const waterfallReady = highchartsReady && 
          window.Highcharts.seriesTypes && 
          window.Highcharts.seriesTypes.waterfall;
        
        console.log('[Waterfall] Check attempt', attempts, 
          '- Highcharts:', highchartsReady, 
          '- Waterfall:', waterfallReady);
        
        if (waterfallReady) {
          // Libraries ready, render the chart
          if (loadingMsg) loadingMsg.style.display = 'none';
          if (chartArea) chartArea.style.display = 'block';
          
          this.renderChart(data, chartArea, config, queryResponse);
          done();
        } else if (attempts < maxAttempts) {
          // Keep trying
          attempts++;
          
          if (loadingMsg) {
            loadingMsg.innerHTML = `Loading chart libraries... (${attempts}/${maxAttempts})`;
          }
          
          // Re-attempt loading if needed
          if (!highchartsReady && attempts === 5) {
            this.ensureLibrariesLoaded();
          } else if (highchartsReady && !waterfallReady && attempts === 10) {
            this.loadWaterfallModule();
          }
          
          setTimeout(checkAndRender, 500);
        } else {
          // Give up and show error
          if (loadingMsg) {
            loadingMsg.innerHTML = `
              <div style="color:red;">
                <p>Failed to load chart libraries</p>
                <p style="font-size:12px;">CSP may be blocking external scripts</p>
                <p style="font-size:12px;">Highcharts: ${highchartsReady ? 'Loaded' : 'Failed'}</p>
                <p style="font-size:12px;">Waterfall Module: ${waterfallReady ? 'Loaded' : 'Failed'}</p>
              </div>
            `;
          }
          done();
        }
      };
      
      checkAndRender();
    },
    
    renderChart: function(data, container, config, queryResponse) {
      console.log('[Waterfall] Starting chart render');
      
      try {
        const dims = queryResponse.fields.dimensions || [];
        const pivots = queryResponse.fields.pivots || [];
        const measures = queryResponse.fields.measures || [];
        
        const stageDim = dims[0].name;
        const measureName = measures[0].name;
        
        // Extract categories
        const categories = data.map(row => {
          return row[stageDim] ? String(row[stageDim].value) : 'Unknown';
        });
        
        console.log('[Waterfall] Categories:', categories);
        
        let series = [];
        
        if (pivots.length > 0) {
          // Stacked waterfall with pivots
          console.log('[Waterfall] Creating stacked series for', pivots.length, 'pivots');
          
          series = pivots.map((pivot, pidx) => {
            const seriesData = data.map((row, idx) => {
              const fieldKey = measureName + '|' + pivot.key;
              const cell = row[fieldKey];
              const rawValue = cell && cell.value != null ? Number(cell.value) : 0;
              
              // First stage positive, rest negative for waterfall flow
              const value = idx === 0 ? rawValue : -rawValue;
              
              return {
                y: value,
                color: value >= 0 ? config.positive_color : config.negative_color
              };
            });
            
            return {
              type: 'waterfall',
              name: pivot.label || pivot.key,
              data: seriesData
            };
          });
        } else {
          // Single series waterfall
          console.log('[Waterfall] Creating single series');
          
          const seriesData = data.map((row, idx) => {
            const cell = row[measureName];
            const rawValue = cell && cell.value != null ? Number(cell.value) : 0;
            const value = idx === 0 ? rawValue : -rawValue;
            
            return {
              y: value,
              color: value >= 0 ? config.positive_color : config.negative_color
            };
          });
          
          series = [{
            type: 'waterfall',
            name: measures[0].label || 'Value',
            data: seriesData
          }];
        }
        
        // Create unique container ID
        const chartId = 'wf-chart-' + Date.now();
        container.innerHTML = `<div id="${chartId}" style="width:100%; height:${config.height_px || 500}px;"></div>`;
        
        // Render with Highcharts
        const chart = Highcharts.chart(chartId, {
          chart: {
            type: 'waterfall'
          },
          title: {
            text: config.chart_title || 'Waterfall Chart'
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
          tooltip: {
            shared: true,
            pointFormat: '<span style="color:{point.color}">●</span> {series.name}: <b>{point.y:,.0f}</b><br/>'
          },
          plotOptions: {
            waterfall: {
              stacking: pivots.length > 0 ? 'overlap' : undefined,
              dataLabels: {
                enabled: config.show_labels !== false,
                formatter: function() {
                  return Math.abs(this.y).toLocaleString();
                }
              },
              lineWidth: 1,
              lineColor: '#999',
              dashStyle: 'Dot',
              upColor: config.positive_color || '#52C41A',
              color: config.negative_color || '#1890FF'
            },
            series: {
              stacking: pivots.length > 0 ? 'overlap' : undefined
            }
          },
          legend: {
            enabled: pivots.length > 1
          },
          series: series
        });
        
        console.log('[Waterfall] Chart rendered successfully');
        
      } catch (error) {
        console.error('[Waterfall] Render error:', error);
        container.innerHTML = `<div style="padding:20px; color:red;">Chart render error: ${error.message}</div>`;
      }
    }
  });
})();
