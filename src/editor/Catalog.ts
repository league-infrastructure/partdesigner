/// <reference path="./catalogData.ts" />
class Catalog {
	private container: HTMLElement;

	private initialized: boolean = false;
	public items: CatalogItem[];

	constructor() {
		this.container = document.getElementById("catalog");
		this.createCatalogItems();
		document.getElementById("catalog").addEventListener("toggle", (event: MouseEvent) => this.onToggleCatalog(event));
	}

	private onToggleCatalog(event: MouseEvent) {
		if ((event.srcElement as HTMLDetailsElement).open && !this.initialized) {
			this.createCatalogUI();
		}
	}

	private createCatalogUI() {
		var oldRenderingContext = gl;
		var canvas = document.createElement("canvas");
		canvas.style.height = "64px";
		canvas.style.width = "64px";
		this.container.appendChild(canvas);

		var camera = new Camera(canvas, 2);
		camera.clearColor = new Vector3(0.859, 0.859, 0.859);
		var partRenderer = new MeshRenderer();
		partRenderer.color = new Vector3(0.67, 0.7, 0.71);
		var partNormalDepthRenderer = new NormalDepthRenderer();
		camera.renderers.push(partRenderer);
		camera.renderers.push(partNormalDepthRenderer);
		camera.renderers.push(new ContourPostEffect());
		var measurements = new Measurements();
		
		for (var item of this.items) {
			var catalogLink: HTMLAnchorElement = document.createElement("a");
			catalogLink.className = "catalogItem";
			catalogLink.href = "?part=" + item.string + "&name=" + encodeURIComponent(item.name);
			catalogLink.title = item.name;
			this.container.appendChild(catalogLink);
			var itemCanvas = document.createElement("canvas");
			catalogLink.appendChild(itemCanvas);
			itemCanvas.style.height = "64px";
			itemCanvas.style.width = "64px";
			var mesh = new PartMeshGenerator(item.part, measurements).getMesh();
			partRenderer.setMesh(mesh);
			partNormalDepthRenderer.setMesh(mesh);
			camera.size = (item.part.getSize() + 2) * 0.41;
			camera.transform = Matrix4.getTranslation(item.part.getCenter().times(-0.5))
				.times(Matrix4.getRotation(new Vector3(0, 45, -30))
				.times(Matrix4.getTranslation(new Vector3(-0.1, 0, 0))));
			camera.render();
			var context = itemCanvas.getContext("2d");
			context.canvas.width = gl.canvas.width;
			context.canvas.height = gl.canvas.height;
			context.drawImage(canvas, 0, 0);

			let itemCopy = item;
			catalogLink.addEventListener("click", (event: MouseEvent) => this.onSelectPart(itemCopy, event));
		}
		gl = oldRenderingContext;
		this.initialized = true;
		this.container.removeChild(canvas);
	}

	private createCatalogItems() {		
		if (typeof GENERATED_CATALOG !== 'undefined' && GENERATED_CATALOG.length > 0) {
			this.items = GENERATED_CATALOG.map((entry, index) => new CatalogItem(entry.id || index + 1, entry.name, entry.partString));
		} else {
			this.items = [];
		}
	}

	private onSelectPart(item: CatalogItem, event: MouseEvent) {
		editor.part = Part.fromString(item.string);
		editor.updateMesh(true);
		window.history.pushState({}, document.title, "?part=" + item.string + "&name=" + encodeURIComponent(item.name));
		event.preventDefault();
		editor.setName(item.name);
	}
}