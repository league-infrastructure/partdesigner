interface VoxelizerOptions {
	/**
	 * The size one cell should have, in the units of the STL file. STL files for 3D printing are in
	 * millimeters, so passing the technic unit converts the model at its original size.
	 */
	cellSize: number;
	/** Index of the axis of the STL file's coordinate system that points up: 0 for X, 1 for Y, 2 for Z. */
	upAxis: number;
	rounded: boolean;
}

interface VoxelizerResult {
	part: Part;
	/** Size of the part in cells. The empty margin around it is not counted. */
	partSize: Vector3;
	/** Cells that are visible from the outside and got a pin hole. */
	pinHoleCells: number;
	/** Cells that are hidden inside the model and got a solid block. */
	solidCells: number;
	/**
	 * Size of the part relative to the model in the file. This is 1 unless the model was too large to
	 * convert at its original size and had to be shrunk to stay within MAX_CELLS_PER_AXIS.
	 */
	scale: number;
}

/**
 * The largest model that is converted at its original size. Beyond this the model is scaled down,
 * because both the mesh generator and the STL exporter get slow with tens of thousands of blocks.
 */
const MAX_CELLS_PER_AXIS = 48;

/**
 * One empty cell is kept around the model. This is not a design choice that shows up in the part, since
 * empty cells produce no blocks. It just guarantees that the flood fill that finds the inside of the
 * model has somewhere to start, even for a model that fills its bounding box completely.
 */
const GRID_MARGIN = 1;

/**
 * The cells are made a hair larger than needed, so that the model ends up strictly inside them. Without
 * this, a face of the model that lands exactly on the boundary between two cells counts as touching both
 * of them and adds a layer of cells that contains nothing. This happens whenever the size of the model
 * is a whole multiple of the cell size, which is common for models built in CAD.
 *
 * The trade-off is that the model is shifted by a fraction of a cell, so a model whose interior faces
 * also line up with the grid can register a sliver in the cell below an overhang and gain a block there.
 * Erring this way is deliberate: rejecting slivers instead would delete surfaces that lie on a cell
 * boundary, and a plate one cell thick consists of nothing else.
 */
const CELL_SIZE_SLACK = 1.0001;

/**
 * Turns a triangle mesh into a Part by filling every cell of a regular grid that the mesh touches.
 * Cells on the surface of the model become pin holes oriented along the axis that is closest to the
 * surface normal, cells that are completely surrounded by other cells become solid blocks.
 */
class Voxelizer {
	public static createPart(mesh: STLMesh, options: VoxelizerOptions): VoxelizerResult {
		let vertices = Voxelizer.toPartCoordinates(mesh, options.upAxis);

		var minX = Infinity, minY = Infinity, minZ = Infinity;
		var maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
		for (var i = 0; i < vertices.length; i += 3) {
			minX = Math.min(minX, vertices[i]);
			maxX = Math.max(maxX, vertices[i]);
			minY = Math.min(minY, vertices[i + 1]);
			maxY = Math.max(maxY, vertices[i + 1]);
			minZ = Math.min(minZ, vertices[i + 2]);
			maxZ = Math.max(maxZ, vertices[i + 2]);
		}

		let extentX = maxX - minX, extentY = maxY - minY, extentZ = maxZ - minZ;
		let longestExtent = Math.max(extentX, extentY, extentZ);
		if (!(longestExtent > 0) || !(options.cellSize > 0)) {
			throw new Error("The model in this STL file has no size.");
		}

		// One cell per technic unit keeps the part the same size as the model. Only a model that would
		// end up with more cells than we can handle is scaled down, by making its cells larger.
		let cellSize = Math.max(options.cellSize, longestExtent / MAX_CELLS_PER_AXIS) * CELL_SIZE_SLACK;

		// Number of cells the model itself occupies, before the margin is added.
		let modelCellsX = Math.max(1, Math.ceil(extentX / cellSize));
		let modelCellsY = Math.max(1, Math.ceil(extentY / cellSize));
		let modelCellsZ = Math.max(1, Math.ceil(extentZ / cellSize));

		// The model is centered in the grid horizontally, with the same margin on both sides. Vertically
		// it rests on the bottom of the grid, so the whole margin ends up above the model.
		let sizeX = modelCellsX + 2 * GRID_MARGIN;
		let sizeY = modelCellsY + GRID_MARGIN;
		let sizeZ = modelCellsZ + 2 * GRID_MARGIN;

		// Position of the corner of cell (0, 0, 0) in the coordinate system of the model.
		let originX = minX - GRID_MARGIN * cellSize - (modelCellsX * cellSize - extentX) / 2;
		let originY = minY;
		let originZ = minZ - GRID_MARGIN * cellSize - (modelCellsZ * cellSize - extentZ) / 2;

		// From here on, the mesh is in grid coordinates, where one unit is the edge length of a cell and
		// cell (x, y, z) covers the box from (x, y, z) to (x + 1, y + 1, z + 1).
		for (var i = 0; i < vertices.length; i += 3) {
			vertices[i] = (vertices[i] - originX) / cellSize;
			vertices[i + 1] = (vertices[i + 1] - originY) / cellSize;
			vertices[i + 2] = (vertices[i + 2] - originZ) / cellSize;
		}

		let grid = new VoxelGrid(sizeX, sizeY, sizeZ);
		grid.addMesh(vertices, mesh.triangleCount);
		grid.fillInterior();

		let part = grid.createPart(options.rounded);

		return {
			part: part,
			partSize: new Vector3(modelCellsX, modelCellsY, modelCellsZ),
			pinHoleCells: grid.pinHoleCellCount,
			solidCells: grid.solidCellCount,
			scale: options.cellSize / cellSize
		};
	}

	/**
	 * Copies the mesh into the coordinate system of the editor, where Y points up. The axes are rotated
	 * rather than swapped so that the model doesn't end up mirrored. The default (Z up in the file)
	 * matches the axes used by the STL exporter, so exported parts can be imported again unchanged.
	 */
	private static toPartCoordinates(mesh: STLMesh, upAxis: number): Float32Array {
		let axis = upAxis == 0 || upAxis == 1 ? upAxis : 2;
		let sourceX = (axis + 2) % 3;
		let sourceY = axis;
		let sourceZ = (axis + 1) % 3;

		let result = new Float32Array(mesh.vertices.length);
		for (var i = 0; i < result.length; i += 3) {
			result[i] = mesh.vertices[i + sourceX];
			result[i + 1] = mesh.vertices[i + sourceY];
			result[i + 2] = mesh.vertices[i + sourceZ];
		}
		return result;
	}
}

class VoxelGrid {
	private readonly sizeX: number;
	private readonly sizeY: number;
	private readonly sizeZ: number;

	/** 1 for cells that are touched by a triangle of the mesh. */
	private readonly surface: Uint8Array;
	/** 1 for cells that are part of the model, including its interior. */
	private readonly filled: Uint8Array;
	/**
	 * Per cell and axis, the sum over all triangles in that cell of the triangle area times the squared
	 * component of the unit normal along that axis. The largest of the three values belongs to the axis
	 * that is closest to the surface normal. Squaring makes this independent of the winding order.
	 */
	private readonly normalWeights: Float32Array;

	/** Set by createPart(): how many cells ended up with a pin hole and how many with a solid block. */
	public pinHoleCellCount = 0;
	public solidCellCount = 0;

	constructor(sizeX: number, sizeY: number, sizeZ: number) {
		this.sizeX = sizeX;
		this.sizeY = sizeY;
		this.sizeZ = sizeZ;

		let cellCount = sizeX * sizeY * sizeZ;
		this.surface = new Uint8Array(cellCount);
		this.filled = new Uint8Array(cellCount);
		this.normalWeights = new Float32Array(cellCount * 3);
	}

	private index(x: number, y: number, z: number): number {
		return (x * this.sizeY + y) * this.sizeZ + z;
	}

	private isFilled(x: number, y: number, z: number): boolean {
		if (x < 0 || y < 0 || z < 0 || x >= this.sizeX || y >= this.sizeY || z >= this.sizeZ) {
			return false;
		}
		return this.filled[this.index(x, y, z)] != 0;
	}

	/** Marks every cell that is touched by a triangle and accumulates the surface normals of those cells. */
	public addMesh(vertices: Float32Array, triangleCount: number) {
		// The cells of the triangle that is currently being added, reused to avoid allocating per triangle.
		var touched: number[] = [];

		for (var triangle = 0; triangle < triangleCount; triangle++) {
			let i = triangle * 9;
			let ax = vertices[i], ay = vertices[i + 1], az = vertices[i + 2];
			let bx = vertices[i + 3], by = vertices[i + 4], bz = vertices[i + 5];
			let cx = vertices[i + 6], cy = vertices[i + 7], cz = vertices[i + 8];

			let ux = bx - ax, uy = by - ay, uz = bz - az;
			let vx = cx - ax, vy = cy - ay, vz = cz - az;
			let normalX = uy * vz - uz * vy;
			let normalY = uz * vx - ux * vz;
			let normalZ = ux * vy - uy * vx;
			let doubleArea = Math.sqrt(normalX * normalX + normalY * normalY + normalZ * normalZ);
			if (doubleArea == 0) {
				continue;
			}
			// Up to a constant factor, this is area * squaredNormalComponent.
			let totalWeightX = normalX * normalX / doubleArea;
			let totalWeightY = normalY * normalY / doubleArea;
			let totalWeightZ = normalZ * normalZ / doubleArea;

			let fromX = clamp(0, this.sizeX - 1, Math.floor(Math.min(ax, bx, cx)));
			let toX = clamp(0, this.sizeX - 1, Math.floor(Math.max(ax, bx, cx)));
			let fromY = clamp(0, this.sizeY - 1, Math.floor(Math.min(ay, by, cy)));
			let toY = clamp(0, this.sizeY - 1, Math.floor(Math.max(ay, by, cy)));
			let fromZ = clamp(0, this.sizeZ - 1, Math.floor(Math.min(az, bz, cz)));
			let toZ = clamp(0, this.sizeZ - 1, Math.floor(Math.max(az, bz, cz)));

			touched.length = 0;
			for (var x = fromX; x <= toX; x++) {
				for (var y = fromY; y <= toY; y++) {
					for (var z = fromZ; z <= toZ; z++) {
						if (!triangleIntersectsCell(x + 0.5, y + 0.5, z + 0.5, ax, ay, az, bx, by, bz, cx, cy, cz)) {
							continue;
						}
						let index = this.index(x, y, z);
						this.surface[index] = 1;
						touched.push(index);
					}
				}
			}

			// The weight of the triangle is split evenly between the cells it covers. Without this, one
			// large triangle would outweigh many small ones in a cell that they share, even if the large
			// triangle barely reaches into it.
			let share = 1 / touched.length;
			for (let index of touched) {
				this.normalWeights[index * 3] += totalWeightX * share;
				this.normalWeights[index * 3 + 1] += totalWeightY * share;
				this.normalWeights[index * 3 + 2] += totalWeightZ * share;
			}
		}
	}

	/**
	 * Flood fills the empty space that is connected to the border of the grid. Every cell that is neither
	 * part of the surface nor reachable from the outside lies inside the model. If the mesh isn't closed,
	 * the fill leaks into the model and only the surface cells remain.
	 */
	public fillInterior() {
		let outside = new Uint8Array(this.surface.length);
		var stack: number[] = [];

		let visit = (x: number, y: number, z: number) => {
			if (x < 0 || y < 0 || z < 0 || x >= this.sizeX || y >= this.sizeY || z >= this.sizeZ) {
				return;
			}
			let index = this.index(x, y, z);
			if (this.surface[index] != 0 || outside[index] != 0) {
				return;
			}
			outside[index] = 1;
			stack.push(index);
		};

		for (var x = 0; x < this.sizeX; x++) {
			for (var y = 0; y < this.sizeY; y++) {
				visit(x, y, 0);
				visit(x, y, this.sizeZ - 1);
			}
			for (var z = 0; z < this.sizeZ; z++) {
				visit(x, 0, z);
				visit(x, this.sizeY - 1, z);
			}
		}
		for (var y = 0; y < this.sizeY; y++) {
			for (var z = 0; z < this.sizeZ; z++) {
				visit(0, y, z);
				visit(this.sizeX - 1, y, z);
			}
		}

		while (stack.length != 0) {
			let current = stack.pop();
			let currentZ = current % this.sizeZ;
			let currentY = Math.floor(current / this.sizeZ) % this.sizeY;
			let currentX = Math.floor(current / (this.sizeZ * this.sizeY));
			visit(currentX - 1, currentY, currentZ);
			visit(currentX + 1, currentY, currentZ);
			visit(currentX, currentY - 1, currentZ);
			visit(currentX, currentY + 1, currentZ);
			visit(currentX, currentY, currentZ - 1);
			visit(currentX, currentY, currentZ + 1);
		}

		for (var index = 0; index < this.filled.length; index++) {
			if (this.surface[index] != 0 || outside[index] == 0) {
				this.filled[index] = 1;
			}
		}
	}

	public createPart(rounded: boolean): Part {
		let part = new Part();
		this.pinHoleCellCount = 0;
		this.solidCellCount = 0;

		for (var x = 0; x < this.sizeX; x++) {
			for (var y = 0; y < this.sizeY; y++) {
				for (var z = 0; z < this.sizeZ; z++) {
					if (!this.isFilled(x, y, z)) {
						continue;
					}
					let orientation = this.getOrientation(x, y, z);
					let enclosed = this.isEnclosed(x, y, z);
					let type = enclosed ? BlockType.Solid : BlockType.PinHole;
					if (enclosed) {
						this.solidCellCount++;
					} else {
						this.pinHoleCellCount++;
					}

					// One cell is a full size block, which consists of two blocks in the part, one at the
					// position and one in front of it. Cell (x, y, z) covers the block positions
					// 2x, 2x+1 and so on, so neighboring cells never overlap.
					let position = new Vector3(x * 2, y * 2, z * 2);
					part.blocks.set(position, new Block(orientation, type, rounded));
					part.blocks.set(position.plus(FORWARD[orientation]), new Block(orientation, type, rounded));
				}
			}
		}

		return part;
	}

	/** True if all six neighbors of the cell are filled, meaning the cell is not visible from the outside. */
	private isEnclosed(x: number, y: number, z: number): boolean {
		return this.isFilled(x - 1, y, z) && this.isFilled(x + 1, y, z)
			&& this.isFilled(x, y - 1, z) && this.isFilled(x, y + 1, z)
			&& this.isFilled(x, y, z - 1) && this.isFilled(x, y, z + 1);
	}

	/** Picks the axis that is closest to the surface normal of the model in this cell. */
	private getOrientation(x: number, y: number, z: number): Orientation {
		let index = this.index(x, y, z) * 3;
		var weightX = this.normalWeights[index];
		var weightY = this.normalWeights[index + 1];
		var weightZ = this.normalWeights[index + 2];

		if (weightX == 0 && weightY == 0 && weightZ == 0) {
			// No triangle passes through this cell, so the shape of the surrounding cells is used instead.
			// The surface points towards the empty neighbors.
			weightX = (this.isFilled(x - 1, y, z) ? 0 : 1) + (this.isFilled(x + 1, y, z) ? 0 : 1);
			weightY = (this.isFilled(x, y - 1, z) ? 0 : 1) + (this.isFilled(x, y + 1, z) ? 0 : 1);
			weightZ = (this.isFilled(x, y, z - 1) ? 0 : 1) + (this.isFilled(x, y, z + 1) ? 0 : 1);
		}

		if (weightX >= weightY && weightX >= weightZ) {
			return Orientation.X;
		} else if (weightY >= weightZ) {
			return Orientation.Y;
		} else {
			return Orientation.Z;
		}
	}
}

/**
 * Tests a triangle against an axis aligned cube with an edge length of 1, using the separating axis
 * theorem as described by Akenine-Möller, "Fast 3D Triangle-Box Overlap Testing".
 */
function triangleIntersectsCell(
	centerX: number, centerY: number, centerZ: number,
	ax: number, ay: number, az: number,
	bx: number, by: number, bz: number,
	cx: number, cy: number, cz: number): boolean {

	const radius = 0.5;

	let v0x = ax - centerX, v0y = ay - centerY, v0z = az - centerZ;
	let v1x = bx - centerX, v1y = by - centerY, v1z = bz - centerZ;
	let v2x = cx - centerX, v2y = cy - centerY, v2z = cz - centerZ;

	// The three face normals of the cube.
	if (isSeparated(Math.min(v0x, v1x, v2x), Math.max(v0x, v1x, v2x), radius)) return false;
	if (isSeparated(Math.min(v0y, v1y, v2y), Math.max(v0y, v1y, v2y), radius)) return false;
	if (isSeparated(Math.min(v0z, v1z, v2z), Math.max(v0z, v1z, v2z), radius)) return false;

	let e0x = v1x - v0x, e0y = v1y - v0y, e0z = v1z - v0z;
	let e1x = v2x - v1x, e1y = v2y - v1y, e1z = v2z - v1z;
	let e2x = v0x - v2x, e2y = v0y - v2y, e2z = v0z - v2z;

	// The normal of the triangle.
	let normalX = e0y * e1z - e0z * e1y;
	let normalY = e0z * e1x - e0x * e1z;
	let normalZ = e0x * e1y - e0y * e1x;
	let distance = normalX * v0x + normalY * v0y + normalZ * v0z;
	if (Math.abs(distance) > radius * (Math.abs(normalX) + Math.abs(normalY) + Math.abs(normalZ))) return false;

	// The nine cross products of a triangle edge and a cube edge.
	if (isSeparated(e0z * v0y - e0y * v0z, e0z * v2y - e0y * v2z, radius * (Math.abs(e0z) + Math.abs(e0y)))) return false;
	if (isSeparated(e0x * v0z - e0z * v0x, e0x * v2z - e0z * v2x, radius * (Math.abs(e0z) + Math.abs(e0x)))) return false;
	if (isSeparated(e0y * v1x - e0x * v1y, e0y * v2x - e0x * v2y, radius * (Math.abs(e0y) + Math.abs(e0x)))) return false;

	if (isSeparated(e1z * v0y - e1y * v0z, e1z * v2y - e1y * v2z, radius * (Math.abs(e1z) + Math.abs(e1y)))) return false;
	if (isSeparated(e1x * v0z - e1z * v0x, e1x * v2z - e1z * v2x, radius * (Math.abs(e1z) + Math.abs(e1x)))) return false;
	if (isSeparated(e1y * v0x - e1x * v0y, e1y * v1x - e1x * v1y, radius * (Math.abs(e1y) + Math.abs(e1x)))) return false;

	if (isSeparated(e2z * v0y - e2y * v0z, e2z * v1y - e2y * v1z, radius * (Math.abs(e2z) + Math.abs(e2y)))) return false;
	if (isSeparated(e2x * v0z - e2z * v0x, e2x * v1z - e2z * v1x, radius * (Math.abs(e2z) + Math.abs(e2x)))) return false;
	if (isSeparated(e2y * v1x - e2x * v1y, e2y * v2x - e2x * v2y, radius * (Math.abs(e2y) + Math.abs(e2x)))) return false;

	return true;
}

/** True if the interval spanned by the two projected points lies completely outside [-radius, radius]. */
function isSeparated(a: number, b: number, radius: number): boolean {
	if (a < b) {
		return a > radius || b < -radius;
	} else {
		return b > radius || a < -radius;
	}
}
