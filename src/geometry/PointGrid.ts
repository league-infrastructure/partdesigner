///<reference path="Vector3.ts" />

/** If a query covers more cells than this, looking up the cells costs more than checking all points. */
const POINT_GRID_MAX_CELLS = 512;

/** Boxes are grown by at least this much, so that points just outside of them are still found. */
const POINT_GRID_TOLERANCE = 0.002;

/**
 * A uniform grid of points that answers "which points are in this box" without checking every point.
 */
class PointGrid {
	private readonly cellSize: number;
	private readonly cellMargin: number;
	private readonly points: Vector3[];
	private readonly cells: Map<string, Vector3[]> = new Map<string, Vector3[]>();

	constructor(points: Vector3[], cellSize: number) {
		this.cellSize = cellSize;
		this.cellMargin = Math.max(1, Math.ceil(POINT_GRID_TOLERANCE / cellSize));
		this.points = points;

		for (let point of points) {
			let key = this.getKey(this.getIndex(point.x), this.getIndex(point.y), this.getIndex(point.z));
			let cell = this.cells.get(key);
			if (cell === undefined) {
				this.cells.set(key, [point]);
			} else {
				cell.push(point);
			}
		}
	}

	private getIndex(coordinate: number): number {
		return Math.floor(coordinate / this.cellSize);
	}

	private getKey(x: number, y: number, z: number): string {
		return x + "/" + y + "/" + z;
	}

	/**
	 * Returns all points in the given box and some of the points around it. The result is a superset of
	 * what is asked for, callers are expected to check the points they get.
	 */
	public getInBox(minimum: Vector3, maximum: Vector3): Vector3[] {
		let margin = this.cellMargin;
		let fromX = this.getIndex(minimum.x) - margin, toX = this.getIndex(maximum.x) + margin;
		let fromY = this.getIndex(minimum.y) - margin, toY = this.getIndex(maximum.y) + margin;
		let fromZ = this.getIndex(minimum.z) - margin, toZ = this.getIndex(maximum.z) + margin;

		if ((toX - fromX + 1) * (toY - fromY + 1) * (toZ - fromZ + 1) > POINT_GRID_MAX_CELLS) {
			return this.points;
		}

		var result: Vector3[] = [];
		for (var x = fromX; x <= toX; x++) {
			for (var y = fromY; y <= toY; y++) {
				for (var z = fromZ; z <= toZ; z++) {
					let cell = this.cells.get(this.getKey(x, y, z));
					if (cell === undefined) {
						continue;
					}
					for (let point of cell) {
						result.push(point);
					}
				}
			}
		}
		return result;
	}
}
