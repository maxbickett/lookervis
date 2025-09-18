(function(){
  looker.plugins.visualizations.add({
    id: "basic_test_chart",
    label: "Basic Test Chart",
    options: {},
    create: function(el){
      this._el = document.createElement("div");
      this._el.style.cssText = "width:100%;height:100%;font:12px system-ui;padding:12px";
      el.appendChild(this._el);
      // Prove execution during create
      this._el.innerHTML = "<div>create() ran</div>";
      if (typeof console !== "undefined") console.log("basic_test create ran");
    },
    updateAsync: function(data, element, config, qr, details, done){
      try {
        // Prove execution during update
        this._el.innerHTML += "<div>updateAsync() ran</div>";
        this._el.innerHTML += `<pre style="white-space:pre-wrap">dims=${(qr.fields.dimensions||[]).length}, pivots=${(qr.fields.pivots||[]).length}, measures=${(qr.fields.measures||[]).length}</pre>`;
      } catch(e){
        this._el.innerHTML = '<div style="color:#a00">Viz error: '+ String(e) +'</div>';
      }
      done();
    }
  });
})();
