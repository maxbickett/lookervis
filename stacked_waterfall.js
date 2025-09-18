(function(){
  function el(tag, attrs={}, children=[]){
    const e=document.createElementNS("http://www.w3.org/2000/svg", tag);
    for(const k in attrs) e.setAttribute(k, attrs[k]);
    children.forEach(c=>e.appendChild(typeof c==="string"?document.createTextNode(c):c));
    return e;
  }

  looker.plugins.visualizations.add({
    id:"stacked_faux_waterfall",
    label:"Faux Waterfall (No Libs)",
    options:{
      start_stage:{type:"string",label:"Start stage (exact label)",default:""},
      negative_stages:{type:"string",label:"Negative stages (CSV)",default:""},
      height:{type:"number",label:"Height (px)",default:360}
    },
    create(container){
      this._host = document.createElement("div");
      this._host.style.cssText="width:100%;height:100%;";
      container.appendChild(this._host);
    },
    updateAsync(data, element, config, qr, details, done){
      try{
        const dims = qr.fields.dimensions||[];
        const pivs = qr.fields.pivots||[];
        const meas = qr.fields.measures||[];
        if(!dims.length){ this._host.innerHTML="<div style='padding:12px;color:#a00'>Need a stage dimension (e.g., call_funnel).</div>"; return done(); }
        if(!pivs.length){ this._host.innerHTML="<div style='padding:12px;color:#a00'>Pivot by subcategory to stack the breakdown.</div>"; return done(); }
        if(!meas.length){ this._host.innerHTML="<div style='padding:12px;color:#a00'>Need a measure (count).</div>"; return done(); }

        const stageDim = dims[0].name;
        const measure  = meas[0].name;
        const negSet = new Set((config.negative_stages||"").split(",").map(s=>s.trim()).filter(Boolean));
        const startStage = (config.start_stage||"").trim();

        // Build rows -> {stage, values per pivot, total}
        const stages = data.map(row=>{
          const stage = String(row[stageDim]?.value ?? "");
          let total = 0;
          const vals = pivs.map(p=>{
            const cell = row[`${measure}|${p.key}`];
            const v = cell && cell.value!=null ? +cell.value : 0;
            total += v;
            return v;
          });
          return {stage, vals, total};
        });

        // Waterfall base: cumulative prior signed totals
        // sign rule: start positive, others negative unless overridden via negative_stages
        const signedTotals = stages.map((r,i)=>{
          let sign = 1;
          if(negSet.size) sign = negSet.has(r.stage)? -1: 1;
          else if(startStage) sign = (r.stage===startStage)? 1 : -1;
          else sign = (i===0)? 1 : -1;
          return sign * r.total;
        });
        const bases = [];
        let running = 0;
        for(let i=0;i<signedTotals.length;i++){
          bases.push(running);
          running += signedTotals[i];
        }

        // Drawing
        const W = element.clientWidth || 800;
        const H = +config.height || 360;
        const padL=60, padR=20, padT=20, padB=40;
        const plotW = Math.max(100, W - padL - padR);
        const plotH = Math.max(100, H - padT - padB);
        const n = stages.length;
        const barGap = 10;
        const barW = Math.max(8, (plotW - barGap*(n-1))/Math.max(1,n));

        // y scale domain from min(base) and max(base+signedTotal)
        const minY = Math.min(0, ...bases, ...bases.map((b,i)=>b+signedTotals[i]));
        const maxY = Math.max(0, ...bases, ...bases.map((b,i)=>b+signedTotals[i]));
        const y = (v)=> padT + (maxY - v) * (plotH / Math.max(1, (maxY - minY)));
        const x = (i)=> padL + i*(barW+barGap);

        // Colors per pivot (deterministic)
        const palette = ["#3578e5","#15af15","#ff7f50","#aa66cc","#f5a623","#50e3c2","#b8e986","#bd10e0","#7ed321","#f8e71c"];
        const colorOf = (idx)=> palette[idx % palette.length];

        const svg = el("svg",{width:"100%",height:String(H),viewBox:`0 0 ${W} ${H}`});
        // axes
        svg.appendChild(el("line",{x1:padL,y1:y(0),x2:W-padR,y2:y(0),stroke:"#999"}));
        svg.appendChild(el("line",{x1:padL,y1:padT,x2:padL,y2:H-padB,stroke:"#999"}));

        // Draw each stage as stacked blocks on top of its base
        stages.forEach((stg,i)=>{
          const base = bases[i];
          let acc = base;
          // stack each pivot chunk
          pivs.forEach((p,pi)=>{
            const raw = stg.vals[pi] || 0;
            // sign each chunk the same as stage sign
            let sign=1;
            if(negSet.size) sign = negSet.has(stg.stage)? -1: 1;
            else if(startStage) sign = (stg.stage===startStage)? 1 : -1;
            else sign = (i===0)? 1 : -1;

            const v = sign * raw;
            if(v===0) return;

            const yTop = y(acc + v);
            const yBot = y(acc);
            const h = Math.max(0.5, yBot - yTop);
            const rect = el("rect",{x:x(i), y:yTop, width:barW, height:h, fill:colorOf(pi)});
            svg.appendChild(rect);

            // value label if tall enough
            if(h>14){
              svg.appendChild(el("text",{
                x:x(i)+barW/2, y:yTop+12, "text-anchor":"middle",
                "font-size":"11", fill:"#fff"
              }, [String(raw)]));
            }
            acc += v;
          });

          // stage label
          const lbl = el("text",{
            x:x(i)+barW/2, y:H-padB+12, "text-anchor":"middle", "font-size":"11", fill:"#444"
          }, [stg.stage]);
          svg.appendChild(lbl);
        });

        // Title
        svg.appendChild(el("text",{x:padL,y:16,"font-size":"13","font-weight":"600",fill:"#333"},["Faux Waterfall (No Libs)"]));

        this._host.innerHTML="";
        this._host.appendChild(svg);
      }catch(e){
        this._host.innerHTML = `<div style="padding:12px;color:#a00">Viz error: ${String(e)}</div>`;
      }
      done();
    }
  });
})();
