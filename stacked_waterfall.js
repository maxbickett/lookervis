(function() {
  looker.plugins.visualizations.add({
    id: "basic_test_chart",
    label: "Basic Test Chart",
    options: {},
    create: function(element) {
      element.innerHTML = "";
      this._container = document.createElement("div");
      this._container.style.width = "100%";
      this._container.style.height = "100%";
      element.appendChild(this._container);
    },
    updateAsync: function(data, element, config, queryResponse, details, done) {
      // just render a rectangle as proof
      this._container.innerHTML = `
        <svg width="100%" height="200">
          <rect x="50" y="20" width="50" height="160" fill="#007BFF" />
          <text x="50" y="15" font-family="Arial" font-size="12">Test</text>
        </svg>
      `;
      done();
    }
  });
})();
