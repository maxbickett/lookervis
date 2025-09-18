/**
 * Debug version - Stacked Waterfall for Looker
 * This version has extensive console logging to identify where things break
 */

(function() {
  console.log('[WATERFALL] Script loaded');
  
  looker.plugins.visualizations.add({
    id: "waterfall_debug",
    label: "Waterfall Debug",
    
    options: {
      chart_title: {
        type: "string",
        label: "Chart Title",
        default: "Debug Waterfall"
      }
    },

    create: function(element, config) {
      console.log('[WATERFALL] create() called', {element, config});
      
      // Create a visible div to confirm rendering
      element.innerHTML = `
        <div id="waterfall-debug" style="width:100%; height:100%; background:#f0f0f0; padding:20px; box-sizing:border-box;">
          <h3>Waterfall Viz Loading...</h3>
          <div id="debug-info"></div>
          <div id="chart-container" style="width:100%; height:400px; background:white; margin-top:20px;"></div>
        </div>
      `;
      
      console.log('[WATERFALL] create() completed');
    },

    updateAsync: function(data, element, config, queryResponse, details, done) {
      console.log('[WATERFALL] updateAsync() called with:', {
        dataLength: data ? data.length : 0,
        config,
        queryResponse,
        details
      });
      
      const debugDiv = document.getElementById('debug-info');
      const chartDiv = document.getElementById('chart-container');
      
      if (!debugDiv || !chartDiv) {
        console.error('[WATERFALL] Container divs not found!');
        element.innerHTML = '<div style="color:red; padding:20px;">ERROR: Container not found</div>';
        done();
        return;
      }
      
      // Display debug info
      try {
        const dims = queryResponse.fields.dimensions || [];
        const pivots = queryResponse.fields.pivots || [];
        const measures = queryResponse.fields.measures || [];
        
        let debugHtml = `
          <p><strong>Data Check:</strong></p>
          <ul>
            <li>Dimensions: ${dims.length} - ${dims.map(d => d.name).join(', ')}</li>
            <li>Pivots: ${pivots.length} - ${pivots.map(p => p.key).join(', ')}</li>
            <li>Measures: ${measures.length} - ${measures.map(m => m.name).join(', ')}</li>
            <li>Data rows: ${data.length}</li>
          </ul>
        `;
        
        if (data.length > 0) {
          debugHtml += `
            <p><strong>First row sample:</strong></p>
            <pre style="background:#fff; padding:10px; overflow:auto; max-height:200px;">
${JSON.stringify(data[0], null, 2)}
            </pre>
          `;
        }
        
        debugDiv.innerHTML = debugHtml;
        
        console.log('[WATERFALL] Debug info displayed');
        
        // Validate minimum requirements
        if (dims.length === 0 || measures.length === 0) {
          chartDiv.innerHTML = '<p style="color:red;">Missing required dimensions or measures</p>';
          console.error('[WATERFALL] Missing dims or measures');
          done();
          return;
        }
        
        // Try to render something simple first
        this.renderSimpleChart(data, chartDiv, config, queryResponse);
        
        console.log('[WATERFALL] Render attempt complete');
        
      } catch (error) {
        console.error('[WATERFALL] Error in updateAsync:', error);
        debugDiv.innerHTML = `<p style="color:red;">Error: ${error.message}</p>`;
      }
      
      done();
    },
    
    update: function(data, element, config, queryResponse) {
      console.log('[WATERFALL] update() called (fallback)');
      // Same as updateAsync but synchronous
      this.updateAsync(data, element, config, queryResponse, {}, function() {
        console.log('[WATERFALL] update() done callback');
      });
    },
    
    renderSimpleChart: function(data, container, config, queryResponse) {
      console.log('[WATERFALL] renderSimpleChart() called');
      
      const dims = queryResponse.fields.dimensions || [];
      const measures = queryResponse.fields.measures || [];
      const pivots = queryResponse.fields.pivots || [];
      
      // Create a simple bar chart using just HTML/CSS to verify data
      let html = '<div style="padding:10px;">';
      html += '<h4>' + (config.chart_title || 'Data Visualization') + '</h4>';
      
      // Create bars
      data.forEach((row, idx) => {
        const label = row[dims[0].name] ? row[dims[0].name].value : `Row ${idx}`;
        
        let value = 0;
        if (pivots.length > 0) {
          // Sum all pivot values
          pivots.forEach(p => {
            const fieldKey = measures[0].name + '|' + p.key;
            if (row[fieldKey] && row[fieldKey].value) {
              value += Number(row[fieldKey].value);
            }
          });
        } else {
          // Direct measure value
          if (row[measures[0].name] && row[measures[0].name].value) {
            value = Number(row[measures[0].name].value);
          }
        }
        
        const barWidth = Math.min(300, Math.max(10, value / 100));
        
        html += `
          <div style="margin: 10px 0;">
            <div style="display:inline-block; width:150px;">${label}:</div>
            <div style="display:inline-block; background:#4285f4; height:20px; width:${barWidth}px;"></div>
            <span style="margin-left:10px;">${value}</span>
          </div>
        `;
      });
      
      html += '</div>';
      container.innerHTML = html;
      
      console.log('[WATERFALL] Simple chart rendered');
      
      // Now try Highcharts
      this.tryHighcharts(data, container, config, queryResponse);
    },
    
    tryHighcharts: function(data, container, config, queryResponse) {
      console.log('[WATERFALL] Checking for Highcharts...');
      console.log('[WATERFALL] window.Highcharts =', typeof window.Highcharts);
      
      if (typeof window.Highcharts === 'undefined') {
        console.log('[WATERFALL] Highcharts not found, attempting to load...');
        
        // Try to load Highcharts
        const script = document.createElement('script');
        script.src = 'https://code.highcharts.com/highcharts.js';
        script.onload = () => {
          console.log('[WATERFALL] Highcharts loaded successfully');
          
          const script2 = document.createElement('script');
          script2.src = 'https://code.highcharts.com/modules/waterfall.js';
          script2.onload = () => {
            console.log('[WATERFALL] Waterfall module loaded');
            this.renderHighchart(data, container, config, queryResponse);
          };
          script2.onerror = (e) => {
            console.error('[WATERFALL] Failed to load waterfall module:', e);
          };
          document.head.appendChild(script2);
        };
        script.onerror = (e) => {
          console.error('[WATERFALL] Failed to load Highcharts:', e);
          container.innerHTML += '<p style="color:orange;">Note: Highcharts could not be loaded (likely CSP)</p>';
        };
        document.head.appendChild(script);
      } else {
        console.log('[WATERFALL] Highcharts already available');
        this.renderHighchart(data, container, config, queryResponse);
      }
    },
    
    renderHighchart: function(data, container, config, queryResponse) {
      console.log('[WATERFALL] renderHighchart() called');
      
      try {
        // Create simple waterfall data
        const categories = data.map((row, idx) => {
          const dims = queryResponse.fields.dimensions || [];
          return row[dims[0].name] ? String(row[dims[0].name].value) : `Item ${idx}`;
        });
        
        const seriesData = data.map((row, idx) => {
          const measures = queryResponse.fields.measures || [];
          const val = row[measures[0].name] ? Number(row[measures[0].name].value) : 0;
          // Make all except first negative for waterfall effect
          return idx === 0 ? val : -val;
        });
        
        console.log('[WATERFALL] Chart data prepared:', {categories, seriesData});
        
        // Clear container and create chart
        container.innerHTML = '<div id="hc-chart" style="width:100%; height:400px;"></div>';
        
        Highcharts.chart('hc-chart', {
          chart: {
            type: 'waterfall'
          },
          title: {
            text: config.chart_title || 'Waterfall Chart'
          },
          xAxis: {
            type: 'category',
            categories: categories
          },
          yAxis: {
            title: {
              text: 'Values'
            }
          },
          series: [{
            type: 'waterfall',
            name: 'Flow',
            data: seriesData
          }]
        });
        
        console.log('[WATERFALL] Highcharts render complete');
        
      } catch (error) {
        console.error('[WATERFALL] Highcharts render error:', error);
        container.innerHTML += `<p style="color:red;">Highcharts error: ${error.message}</p>`;
      }
    }
  });
  
  console.log('[WATERFALL] Viz registered');
})();
