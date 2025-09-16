/// <reference path="../types/index.d.ts" />

(function() {

let import_vox_action;
let vox = {};
let config = {
	merge_colors: true,
	remove_bottom_faces: true,
	remove_side_edges: true,
	remove_top_edge: true
}

BBPlugin.register('vox_importer_greedy', {
	title: 'Voxel Importer - Greedy',
	icon: 'view_module',
	author: 'DigiNanigans',
	description: 'Import MagicaVoxel .vox files and convert them to a hollow mesh using greedy meshing',
	version: '0.0.1',
	variant: 'both',
	onload() {

		try {
			config = {
				...config,
				...JSON.parse(localStorage.getItem('tool_config.import_vox'))
			};
		} catch (err) {
			console.error("Unable to load config", err);
		}

		import_vox_action = new Action({
			id: 'import_vox',
			name: 'Import Vox',
			icon: 'view_module',
			category: 'file',
			condition: () => Project instanceof ModelProject,
			click: function(ev) {
				Blockbench.import({
					extensions: ['vox'],
					type: 'Vox Model',
					readtype: 'binary',
				}, (files) => {
					console.log(files);
					const meshName = files[0].name.split('.')[0];
					vox.mainParser.parseUint8Array(new Uint8Array(files[0].content), (err, data) => {
						if (err) throw err;
						console.log(data)
						vox.ProcessVoxels(meshName, data);
					});
				});
			},
			tool_config: new ToolConfig('import_vox', {
				id: 'import_vox',
				title: 'Vox Import Settings',
				buttons: ['dialog.ok'],
				resizable: false,
				form: {
					merge_colors: { label: 'Merge colors', type: 'checkbox', value: true },
					remove_bottom_faces: { label: 'Remove all -Y oriented faces', type: 'checkbox', value: true },
					remove_side_edges: { label: 'Remove side faces at edge of voxel bounds', type: 'checkbox', value: true },
					remove_top_edge: { label: 'Remove top face if at edge of voxel bounds', type: 'checkbox', value: true }
				},
				onFormChange(formConfig) {
					config = formConfig
				}
			})
		})
		MenuBar.addAction(import_vox_action, 'file.import')
	},
	onunload() {
		import_vox_action.delete();
	}
})

"use strict";

/**
 * @namespace
 */

(function() {
	if (typeof(window) !== "undefined") {
		vox.global = window;
		vox.global.vox = vox;
	} else {
		vox.global = global;
	}

	if (typeof(module) !== "undefined") {
		module.exports = vox;
	}

})();

(function() {

	/**
	 * @param {string} name
	 * @param {Object} data
	 * @param {Array} data.voxels [{x, y, z}...]
	 * @param {Object} data.size {x, y, z}
	 */
	vox.ProcessVoxels = function(name, {voxels, size}) {
		let voxMap = new Map();

		voxels.forEach(({ x, y, z }) => {
			voxMap.set(`${x},${y},${z}`, 1);
		});

		let vertices = [];
		let faceDefs = [];

		// Sweep along X
		for (let x = 0; x < size.x; x++) {
			for (let dir of [-1, 1]) {
				const isSideEdge = (dir === -1 && x === 0) || (dir === 1 && x === size.x - 1);
				if (config.remove_side_edges && isSideEdge) continue;

				let grid = Array.from({ length: size.z }, () => Array(size.y).fill(null));
				for (let y = 0; y < size.y; y++) {
					for (let z = 0; z < size.z; z++) {
						const c = voxMap.get(`${x},${y},${z}`);
						const neighbor = voxMap.get(`${x + dir},${y},${z}`);
						if (c && !neighbor) grid[z][y] = c;
					}
				}
				let quads = vox.GreedyMesh2D(grid, size.y, size.z);
				quads.forEach(q => {
					const { faceVerts, faceName } = vox.CollectQuadVerts(size, 'x', x, q, dir);
					const baseIndex = vertices.length;
					vertices.push(...faceVerts);

					faceDefs.push({
						indices: [baseIndex, baseIndex + 1, baseIndex + 2, baseIndex + 3],
						faceName,
						vox: {
							...q,
							dir,
							axis: 'x',
						}
					});
				});
			}
		}

		// Sweep along Y
		for (let y = 0; y < size.y; y++) {
			for (let dir of [1, -1]) {
				const isSideEdge = (dir === -1 && y === 0) || (dir === 1 && y === size.y - 1);
				if (config.remove_side_edges && isSideEdge) continue;

				let grid = Array.from({ length: size.z }, () => Array(size.x).fill(null));
				for (let x = 0; x < size.x; x++) {
					for (let z = 0; z < size.z; z++) {
						const c = voxMap.get(`${x},${y},${z}`);
						const neighbor = voxMap.get(`${x},${y + dir},${z}`);
						if (c && !neighbor) grid[z][x] = c;
					}
				}
				let quads = vox.GreedyMesh2D(grid, size.x, size.z);
				quads.forEach(q => {
					const { faceVerts, faceName } = vox.CollectQuadVerts(size, 'y', y, q, dir);
					const baseIndex = vertices.length;
					vertices.push(...faceVerts);

					faceDefs.push({
						indices: [baseIndex, baseIndex + 1, baseIndex + 2, baseIndex + 3],
						faceName,
						vox: {
							...q,
							dir,
							axis: 'y',
						}
					});
				});
			}
		}

		// Sweep along Z
		for (let z = 0; z < size.z; z++) {
			const dirs = config.remove_bottom_faces ? [1] : [1, -1];
			for (let dir of dirs) {
				const isTopEdge = (dir === 1 && z === size.z - 1) || (dir === -1 && z === 0);
				if (config.remove_top_edge && isTopEdge) continue;

				let grid = Array.from({ length: size.y }, () => Array(size.x).fill(null));
				for (let x = 0; x < size.x; x++) {
					for (let y = 0; y < size.y; y++) {
						const c = voxMap.get(`${x},${y},${z}`);
						const neighbor = voxMap.get(`${x},${y},${z + dir}`);
						if (c && !neighbor) grid[y][x] = c;
					}
				}
				let quads = vox.GreedyMesh2D(grid, size.x, size.y);
				quads.forEach(q => {
					const { faceVerts, faceName } = vox.CollectQuadVerts(size, 'z', z, q, dir);
					const baseIndex = vertices.length;
					vertices.push(...faceVerts);

					faceDefs.push({
						indices: [baseIndex, baseIndex + 1, baseIndex + 2, baseIndex + 3],
						faceName,
						vox: {
							...q,
							dir,
							axis: 'z',
						}
					});
				});
			}
		}

		let mesh = new Mesh({ name });
		mesh.init();

		const dedupedVertices = vox.DeduplicateVertices(vertices, faceDefs);

		mesh.vertices = {};
		dedupedVertices.forEach((v, i) => {
			mesh.vertices[String(i)] = v;
		});

		let facesObj = {};
		let createdFaces = 0;

		faceDefs.forEach((def, i) => {
			if (!def.indices || def.indices.length !== 4) return;

			const vertexKeys = def.indices.map(idx => String(idx));

			try {
				const mf = new MeshFace(mesh, {
					vertices: vertexKeys,
					uv: [[0,0],[1,0],[1,1],[0,1]],
					texture: null,
				});

				vox.MapUvs(mf, def.vox);

				facesObj['f' + i] = mf;
				createdFaces++;
			} catch (err) {
				console.error("Failed to create MeshFace for", i, err);
			}
		});

		mesh.faces = facesObj;
		console.log("MeshFaces created:", createdFaces);

		Canvas.updateAll();
	}

	/**
	 * @param {MeshFace} face
	 * @param {Array<string>} face.vertices
	 * @param {{[vertex: string]: ArrayVector2}} face.uv
	 * @param {Object} voxel {x, y, z, w, h, dir, axis}
	 */
	vox.MapUvs = function({uv, vertices}, voxel) {
		let u0, u1, v0, v1;
		const {texture_height, texture_width} = Project;

		if (voxel.axis === 'z') {
			u0 = Math.round(voxel.x);
			u1 = Math.round(voxel.x + voxel.w);
			v0 = Math.round(voxel.y);
			v1 = Math.round(voxel.y + voxel.h);
		} else if (voxel.axis === 'y' && voxel.dir === 1 || voxel.axis === 'x' && voxel.dir === -1) {
			u0 = Math.round(voxel.x);
			u1 = Math.round(voxel.x + voxel.w);
			v0 = Math.round(texture_height - voxel.y);
			v1 = Math.round(texture_height - voxel.y - voxel.h);
		} else {
			u0 = Math.round(texture_width - voxel.x);
			u1 = Math.round(texture_width - voxel.x - voxel.w);
			v0 = Math.round(texture_height - voxel.y);
			v1 = Math.round(texture_height - voxel.y - voxel.h);
		}

		const corners = voxel.axis === 'y' ? [
			[u0, v0],
			[u1, v0],
			[u1, v1],
			[u0, v1],
		] : [
			[u0, v0],
			[u0, v1],
			[u1, v1],
			[u1, v0],
		];

		for (let i = 0; i < vertices.length; i++) {
			const uvx = Math.round(corners[i][0]);
			const uvy = Math.round(corners[i][1]);
			uv[vertices[i]] = [uvx, uvy];
		}
	}

	/**
	 * @param {Array<Array<number>>} grid
	 * @param {number} width
	 * @param {number} height
	 * @returns {Array<{x: number, y: number, w: number, h: number}>}
	 */
	vox.GreedyMesh2D = function(grid, width, height) {
		let quads = [];
		let used = Array.from({ length: height }, () => Array(width).fill(false));
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				if (used[y][x] || grid[y][x] == null) continue;
				let color = grid[y][x];

				let w = 1;
				while (x + w < width && !used[y][x + w] && grid[y][x + w] === color) w++;

				let h = 1, expand = true;
				while (y + h < height && expand) {
					for (let k = 0; k < w; k++) {
						if (used[y + h][x + k] || grid[y + h][x + k] !== color) { expand = false; break; }
					}
					if (expand) h++;
				}

				for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) used[y + dy][x + dx] = true;

				quads.push({ x, y, w, h });
			}
		}
		return quads;
	}

	/**
	 * @param {Object} bounds {x, y, z}
	 * @param {string} axis 'x' | 'y' | 'z'
	 * @param {number} sliceIndex
	 * @param {Object} quad {x, y, w, h}
	 * @param {number} dir
	 * @returns {Object} {faceVerts: Array<Array<number>>, faceName: string}
	 */
	vox.CollectQuadVerts = function(bounds, axis, sliceIndex, quad, dir) {

		const vsize = 1;
		const xOff = - (bounds.x * vsize) / 2;
		const yOff = 0;
		const zOff = - (bounds.y * vsize) / 2;

		let faceVerts = [];
		let faceName;

		if (axis === 'x') {

			const vx = sliceIndex, vy = quad.x, vz = quad.y;
			const X = vx * vsize;
			const Y1 = vz * vsize, Y2 = (vz + quad.h) * vsize;
			const Z1 = vy * vsize, Z2 = (vy + quad.w) * vsize;

			if (dir === -1) {
				faceVerts = [[X, Y1, Z2], [X, Y2, Z2], [X, Y2, Z1], [X, Y1, Z1]];
				faceName = 'west';
			} else {
				faceVerts = [[X+vsize, Y1, Z1], [X+vsize, Y2, Z1], [X+vsize, Y2, Z2], [X+vsize, Y1, Z2]];
				faceName = 'east';
			}

			faceVerts = faceVerts.map(([X,Y,Z]) => [X + xOff, Y + yOff, Z + zOff]);

		} else if (axis === 'y') {

			const vy = sliceIndex, vx = quad.x, vz = quad.y;
			const X1 = vx*vsize, X2 = (vx+quad.w)*vsize;
			const Y = vy*vsize, Z1 = vz*vsize, Z2 = (vz+quad.h)*vsize;

			if (dir === -1) {
				faceVerts = [[X1, Y, Z2], [X2, Y, Z2], [X2, Y, Z1], [X1, Y, Z1]];
				faceName = 'down';
			} else {
				faceVerts = [[X1, Y+vsize, Z1], [X2, Y+vsize, Z1], [X2, Y+vsize, Z2], [X1, Y+vsize, Z2]];
				faceName = 'up';
			}

			faceVerts = faceVerts.map(([X,Y,Z]) => [X + xOff, Z + yOff, Y + zOff]);

		} else {

			const vz = sliceIndex, vx = quad.x, vy = quad.y;
			const X1 = vx*vsize, X2 = (vx+quad.w)*vsize;
			const Y1 = vy*vsize, Y2 = (vy+quad.h)*vsize;
			const Z = vz*vsize;

			if (dir === -1) {
				faceVerts = [[X1,Y1,Z],[X2,Y1,Z],[X2,Y2,Z],[X1,Y2,Z]];
				faceName = 'north';
			} else {
				faceVerts = [[X1,Y1,Z+vsize],[X1,Y2,Z+vsize],[X2,Y2,Z+vsize],[X2,Y1,Z+vsize]];
				faceName = 'south';
			}

			faceVerts = faceVerts.map(([X,Y,Z]) => [X + xOff, Z + yOff, Y + zOff]);
		}

		return { faceVerts, faceName };
	}

	/**
	 * @param {Array<Array<number>>} vertices
	 * @param {Array<{indices: Array<number>}>} faceDefs
	 * @returns {Array<Array<number>>}
	 */
	vox.DeduplicateVertices = function(vertices, faceDefs) {
		const vertexMap = new Map();
		const newVertices = [];
		
		faceDefs.forEach(def => {
			def.indices = def.indices.map(oldIdx => {
				const v = vertices[oldIdx];
				const key = `${v[0]},${v[1]},${v[2]}`;
				if (vertexMap.has(key)) {
					return vertexMap.get(key);
				} else {
					const newIndex = newVertices.length;
					newVertices.push(v);
					vertexMap.set(key, newIndex);
					return newIndex;
				}
			});
		});

		return newVertices;
	}

})();

(function() {

	/**
	 * @constructor
	 * @property {Object} size {x, y, z}
	 * @property {Array} voxels [{x, y, z, colorIndex}...]
	 * @property {Array} palette [{r, g, b, a}...]
	 */
	vox.VoxelData = function() {
		this.size = null;
		this.voxels = [];
		this.palette = [];
		
		this.anim = [{
			size: null,
			voxels: [],
		}];
	};
	
})();

(function() {
	
	/** 
	 * @constructor
	 */
	vox.Parser = function() {};
	
	/**
	 * @param {Uint8Array} uint8Array
	 * @param {function} callback
	 */
	vox.Parser.prototype.parseUint8Array = function(uint8Array, callback) {
		var dataHolder = new DataHolder(uint8Array);
		try {
			root(dataHolder);
			dataHolder.data.size = dataHolder.data.anim[0].size;
			dataHolder.data.voxels = dataHolder.data.anim[0].voxels;
			if (dataHolder.data.palette.length === 0) {
				// console.debug("(use default palette)");
				dataHolder.data.palette = vox.defaultPalette;
			} else {
				dataHolder.data.palette.unshift(dataHolder.data.palette[0]);
				dataHolder.data.palette.pop();
			}

			callback(null, dataHolder.data);
		} catch (e) {
			callback(e);
		}
	};
	
	var DataHolder = function(uint8Array) {
		this.uint8Array = uint8Array;
		this.cursor = 0;
		this.data = new vox.VoxelData();
		
		this._currentChunkId = null;
		this._currentChunkSize = 0;
	};
	DataHolder.prototype.next = function() {
		if (this.uint8Array.byteLength <= this.cursor) {
			throw new Error("uint8Array index out of bounds: " + this.uint8Array.byteLength);
		}
		return this.uint8Array[this.cursor++];
	};
	DataHolder.prototype.hasNext = function() {
		return this.cursor < this.uint8Array.byteLength;
	};
	
	var root = function(dataHolder) {
		magicNumber(dataHolder);
		versionNumber(dataHolder);
		chunk(dataHolder); // main chunk
	};
	
	var magicNumber = function(dataHolder) {
		var str = "";
		for (var i = 0; i < 4; i++) {
			str += String.fromCharCode(dataHolder.next());
		}
		
		if (str !== "VOX ") {
			throw new Error("invalid magic number '" + str + "'");
		}
	};
	
	var versionNumber = function(dataHolder) {
		var ver = 0;
		for (var i = 0; i < 4; i++) {
			ver += dataHolder.next() * Math.pow(256, i);
		}
		console.info(".vox format version " + ver);
	};
	
	var chunk = function(dataHolder) {
		if (!dataHolder.hasNext()) return false;

		chunkId(dataHolder);
		sizeOfChunkContents(dataHolder);
		totalSizeOfChildrenChunks(dataHolder);
		contents(dataHolder);
		while (chunk(dataHolder));
		return dataHolder.hasNext();
	};
	
	var chunkId = function(dataHolder) {
		var id = "";
		for (var i = 0; i < 4; i++) {
			id += String.fromCharCode(dataHolder.next());
		}
		dataHolder._currentChunkId = id;
		dataHolder._currentChunkSize = 0;
		
		// console.debug("chunk id = " + id);
	};
	
	var sizeOfChunkContents = function(dataHolder) {
		var size = 0;
		for (var i = 0; i < 4; i++) {
			size += dataHolder.next() * Math.pow(256, i);
		}
		dataHolder._currentChunkSize = size;
		
		// console.debug("  size of chunk = " + size);
	};
	
	var totalSizeOfChildrenChunks = function(dataHolder) {
		var size = 0;
		for (var i = 0; i < 4; i++) {
			size += dataHolder.next() * Math.pow(256, i);
		}
		
		// console.debug("  total size of children chunks = " + size);
	};
	
	var contents = function(dataHolder) {
		switch (dataHolder._currentChunkId) {
		case "PACK":
			contentsOfPackChunk(dataHolder);
			break;
		case "SIZE":
			contentsOfSizeChunk(dataHolder);
			break;
		case "XYZI":
			contentsOfVoxelChunk(dataHolder);
			break;
		case "RGBA":
			contentsOfPaletteChunk(dataHolder);
			break;
		case "MATT":
			contentsOfMaterialChunk(dataHolder);
			break;
		default:
			contentsOfUnknownChunk(dataHolder);
			break;
		}
	};

	var contentsOfUnknownChunk = function(dataHolder) {
		for (var i = 0; i < dataHolder._currentChunkSize; i++) {
			dataHolder.next();
		}
	}
	
	var contentsOfPackChunk = function(dataHolder) {
		var size = 0;
		for (var i = 0; i < 4; i++) {
			size += dataHolder.next() * Math.pow(256, i);
		}
		
		// console.debug("  num of SIZE and XYZI chunks = " + size);
	};
	
	var contentsOfSizeChunk = function(dataHolder) {
		var x = 0;
		for (var i = 0; i < 4; i++) {
			x += dataHolder.next() * Math.pow(256, i);
		}
		var y = 0;
		for (var i = 0; i < 4; i++) {
			y += dataHolder.next() * Math.pow(256, i);
		}
		var z = 0;
		for (var i = 0; i < 4; i++) {
			z += dataHolder.next() * Math.pow(256, i);
		}
		// console.debug("  bounding box size = " + x + ", " + y + ", " + z);

		var data = dataHolder.data.anim[dataHolder.data.anim.length - 1];
		if (data.size) {
			data = { size: null, voxels: [] };
			dataHolder.data.anim.push(data);
		}
		data.size = {
			x: x,
			y: y,
			z: z,
		};
	};
	
	var contentsOfVoxelChunk = function(dataHolder) {
		var num = 0;
		for (var i = 0; i < 4; i++) {
			num += dataHolder.next() * Math.pow(256, i);
		}
		// console.debug("  voxel size = " + num);

		var data = dataHolder.data.anim[dataHolder.data.anim.length - 1];
		if (data.voxels.length) {
			data = { size: null, voxels: [] };
			dataHolder.data.anim.push(data);
		}
		for (var i = 0; i < num; i++) {
			data.voxels.push({
				x: dataHolder.next(),
				y: dataHolder.next(),
				z: dataHolder.next(),
				colorIndex: dataHolder.next(),
			});
		}
	};

	var contentsOfPaletteChunk = function(dataHolder) {
		// console.debug("  palette");
		for (var i = 0; i < 256; i++) {
			var p = {
				r: dataHolder.next(),
				g: dataHolder.next(),
				b: dataHolder.next(),
				a: dataHolder.next(),
			};
			dataHolder.data.palette.push(p);
		}
	};
	
	var contentsOfMaterialChunk = function(dataHolder) {
		// console.debug("  material");
		var id = 0;
		for (var i = 0; i < 4; i++) {
			id += dataHolder.next() * Math.pow(256, i);
		}
		// console.debug("	id = " + id);

		var type = 0;
		for (var i = 0; i < 4; i++) {
			type += dataHolder.next() * Math.pow(256, i);
		}
		// console.debug("	type = " + type + " (0:diffuse 1:metal 2:glass 3:emissive)");

		var weight = 0;
		for (var i = 0; i < 4; i++) {
			weight += dataHolder.next() * Math.pow(256, i);
		}
		// console.debug("	weight = " + parseFloat(weight));

		var propertyBits = 0;
		for (var i = 0; i < 4; i++) {
			propertyBits += dataHolder.next() * Math.pow(256, i);
		}
		// console.debug("	property bits = " + propertyBits.toString(2));
		var plastic = !!(propertyBits & 1);
		var roughness = !!(propertyBits & 2);
		var specular = !!(propertyBits & 4);
		var ior = !!(propertyBits & 8);
		var attenuation = !!(propertyBits & 16);
		var power = !!(propertyBits & 32);
		var glow = !!(propertyBits & 64);
		var isTotalPower = !!(propertyBits & 128);
		// console.debug("	  Plastic = " + plastic);
		// console.debug("	  Roughness = " + roughness);
		// console.debug("	  Specular = " + specular);
		// console.debug("	  IOR = " + ior);
		// console.debug("	  Attenuation = " + attenuation);
		// console.debug("	  Power = " + power);
		// console.debug("	  Glow = " + glow);
		// console.debug("	  isTotalPower = " + isTotalPower);

		var valueNum = 0;
		if (plastic) valueNum += 1;
		if (roughness) valueNum += 1;
		if (specular) valueNum += 1;
		if (ior) valueNum += 1;
		if (attenuation) valueNum += 1;
		if (power) valueNum += 1;
		if (glow) valueNum += 1;
		// isTotalPower is no value
		
		var values = [];
		for (var j = 0; j < valueNum; j++) {
			values[j] = 0;
			for (var i = 0; i < 4; i++) {
				values[j] += dataHolder.next() * Math.pow(256, i);
			}
			// console.debug("	normalized property value = " + parseFloat(values[j]));
		}
	};

})();

vox.mainParser = new vox.Parser()

})();
