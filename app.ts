let gl: WebGLRenderingContext;

var editor: Editor;
var catalog: Catalog;

function applyUiConfig() {
	const catalogSection = document.getElementById("catalog");
	if (catalogSection && APP_CONFIG && APP_CONFIG.showCatalog === false) {
		catalogSection.style.display = "none";
	}

	const measurementsSection = document.getElementById("measurements");
	if (measurementsSection && APP_CONFIG && APP_CONFIG.showMeasurements === false) {
		measurementsSection.style.display = "none";
	}
}

window.onload = () => {
	applyUiConfig();
	catalog = new Catalog();
	editor = new Editor();
};

window.onpopstate = function(event: PopStateEvent){
    if (event.state) {
		var url = new URL(document.URL);
		if (url.searchParams.has("part")) {
			editor.part = Part.fromString(url.searchParams.get("part"));
			editor.updateMesh(true);
		}
    }
};