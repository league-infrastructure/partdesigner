interface STLMesh {
	/** Triangle corners, 9 numbers per triangle: v1x, v1y, v1z, v2x, v2y, v2z, v3x, v3y, v3z. */
	vertices: Float32Array;
	triangleCount: number;
}

class STLLoader {
	public static parse(buffer: ArrayBuffer): STLMesh {
		let mesh = STLLoader.isBinary(buffer) ? STLLoader.parseBinary(buffer) : STLLoader.parseAscii(buffer);
		if (mesh.triangleCount == 0) {
			throw new Error("This STL file doesn't contain any triangles.");
		}
		return mesh;
	}

	// Binary STL files have no reliable magic number, but their length is fully determined by the
	// triangle count in the header. ASCII files won't match that by chance.
	private static isBinary(buffer: ArrayBuffer): boolean {
		if (buffer.byteLength < 84) {
			return false;
		}
		return 84 + new DataView(buffer).getUint32(80, true) * 50 == buffer.byteLength;
	}

	private static parseBinary(buffer: ArrayBuffer): STLMesh {
		let view = new DataView(buffer);
		let triangleCount = view.getUint32(80, true);
		let vertices = new Float32Array(triangleCount * 9);

		var offset = 84;
		for (var i = 0; i < triangleCount; i++) {
			// The face normal stored in the file is skipped, normals are computed from the vertices instead.
			offset += 12;
			for (var j = 0; j < 9; j++) {
				vertices[i * 9 + j] = view.getFloat32(offset, true);
				offset += 4;
			}
			offset += 2;
		}

		return { vertices: vertices, triangleCount: triangleCount };
	}

	private static parseAscii(buffer: ArrayBuffer): STLMesh {
		let text = new TextDecoder().decode(buffer);
		let vertexPattern = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
		var values: number[] = [];

		var match = vertexPattern.exec(text);
		while (match != null) {
			values.push(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
			match = vertexPattern.exec(text);
		}

		if (values.length == 0 || values.length % 9 != 0) {
			throw new Error("This file is not a valid STL file.");
		}

		return { vertices: new Float32Array(values), triangleCount: values.length / 9 };
	}
}
