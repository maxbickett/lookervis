(function(){
  looker.plugins.visualizations.add({
    id:"diag_fill",
    label:"Diag Fill",
    options:{},
    create(el){
      this._el = document.createElement("div");
      // Make it obvious if we rendered at all
      this._el.style.cssText = "width:100%;height:100%;min-height:320px;"+ 
        "display:flex;align-items:center;justify-content:center;"+
        "background:repeating-linear-gradient(45deg,#111,#111 10px,#222 10px,#222 20px);"+
        "color:#fff;font:600 18px/1.4 system-ui,Segoe UI,Helvetica,Arial;padding:16px;"+
        "text-shadow:0 1px 2px rgba(0,0,0,.6)";
      el.appendChild(this._el);
      this._el.innerText = "create() ran";
      console.log("diag_fill: create() ran");
    },
    updateAsync(data, el, config, qr, details, done){
      try{
        const dims = (qr.fields.dimensions||[]).length;
        const pivs = (qr.fields.pivots||[]).length;
        const meas = (qr.fields.measures||[]).length;
        const ts = new Date().toLocaleString();
        this._el.innerHTML = `
          <div style="text-align:center">
            <div style="font-size:22px;margin-bottom:8px">Diag Fill</div>
            <div style="font-size:18px">updateAsync() ran</div>
            <div style="opacity:.85;margin-top:6px">dims=${dims} · pivots=${pivs} · measures=${meas}</div>
            <div style="opacity:.7;margin-top:10px">${ts}</div>
            <div style="margin-top:12px;font-size:14px;opacity:.8">(If you see this, the viz is rendering)</div>
          </div>`;
        console.log("diag_fill: updateAsync() ran", {dims,pivs,meas});
      }catch(e){
        this._el.innerHTML = `<div style="color:#ff8080">Viz error: ${String(e)}</div>`;
        console.error("diag_fill error", e);
      }
      done();
    }
  });
})();
