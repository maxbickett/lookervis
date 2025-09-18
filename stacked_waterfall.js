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
