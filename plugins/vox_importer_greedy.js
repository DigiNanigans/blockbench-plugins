/// <reference path="../types/index.d.ts" />

(function() {

let import_vox_action;
let vox = {};

BBPlugin.register('vox_importer_greedy', {
	title: 'Voxel Importer - Greedy',
	icon: 'view_module',
	author: 'DigiNanigans',
	description: 'Import MagicaVoxel .vox files and convert them to a hollow mesh using greedy meshing',
	version: '0.0.1',
	variant: 'both',
	onload() {

		import_vox_action = new Action({
			id: 'import_vox',
			name: 'Import Vox',
			icon: 'view_module',
			category: 'file',
			condition: () => Project instanceof ModelProject,
			click: function(ev) {

				function importVoxFile(cb) {
					Blockbench.import({
						extensions: ['vox'],
						type: 'Vox Model',
						readtype: 'binary',
					}, (files) => {
						console.log(files);
						vox.mainParser.parseUint8Array(new Uint8Array(files[0].content), cb)
					})
				}
		
				importVoxFile(function(a, data) {
					if (a) throw a
					console.log(data)

                    const { x: sx, y: sy, z: sz } = data.size;

                    function placeFaceUVInTexture(meshFace, vox) {

                        let u0, u1, v0, v1;

                        if (vox.axis === 'z') {
                            u0 = Math.round(vox.x);
                            u1 = Math.round(vox.x + vox.w);
                            v0 = Math.round(vox.y);
                            v1 = Math.round(vox.y + vox.h);
                        } else if (vox.axis === 'y' && vox.dir === 1 || vox.axis === 'x' && vox.dir === -1) {
                            u0 = Math.round(vox.x);
                            u1 = Math.round(vox.x + vox.w);
                            v0 = Math.round(sx * 2 - vox.y);
                            v1 = Math.round(sx * 2 - vox.y - vox.h);
                        } else {
                            u0 = Math.round(sx - vox.x);
                            u1 = Math.round(sx - vox.x - vox.w);
                            v1 = Math.round(sx * 2 - vox.y);
                            v0 = Math.round(sx * 2 - vox.y - vox.h);
                        }

                        const corners = vox.axis === 'y' ? [
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

                        const keys = meshFace.vertices;
                        for (let i = 0; i < keys.length; i++) {
                            const uvx = Math.round(corners[i][0]);
                            const uvy = Math.round(corners[i][1]);
                            meshFace.uv[keys[i]] = [uvx, uvy];
                        }
                    }

                    function greedyMesh2D(grid, width, height) {
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

                    function collectQuadVerts(axis, sliceIndex, quad, dir) {

                        const vsize = 1;
                        const xOff = - (sx * vsize) / 2;
                        const yOff = 0;
                        const zOff = - (sy * vsize) / 2;

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

                    function deduplicateVertices(vertices, faceDefs) {
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
		
					function processVoxels() {
                        let voxels = new Map();

                        data.voxels.forEach(({ x, y, z }) => {
                            voxels.set(`${x},${y},${z}`, 1);
                        });

                        let vertices = [];
                        let faceDefs = [];

                        // Sweep along X
                        for (let x = 0; x < sx; x++) {
                            for (let dir of [-1, 1]) {
                                if ((dir === -1 && x === 0) || (dir === 1 && x === sx - 1)) continue;

                                let grid = Array.from({ length: sz }, () => Array(sy).fill(null));
                                for (let y = 0; y < sy; y++) {
                                    for (let z = 0; z < sz; z++) {
                                        const c = voxels.get(`${x},${y},${z}`);
                                        const neighbor = voxels.get(`${x + dir},${y},${z}`);
                                        if (c && !neighbor) grid[z][y] = c;
                                    }
                                }
                                let quads = greedyMesh2D(grid, sy, sz);
                                quads.forEach(q => {
                                    const vox = {
                                        ...q,
                                        dir,
                                        axis: 'x',
                                    };

                                    const { faceVerts, faceName } = collectQuadVerts('x', x, q, dir);
                                    const baseIndex = vertices.length;
                                    vertices.push(...faceVerts);

                                    faceDefs.push({
                                        indices: [baseIndex, baseIndex + 1, baseIndex + 2, baseIndex + 3],
                                        faceName,
                                        vox
                                    });
                                });
                            }
                        }

                        // Sweep along Y
                        for (let y = 0; y < sy; y++) {
                            for (let dir of [1, -1]) {
                                if ((dir === -1 && y === 0) || (dir === 1 && y === sy - 1)) continue;

                                let grid = Array.from({ length: sz }, () => Array(sx).fill(null));
                                for (let x = 0; x < sx; x++) {
                                    for (let z = 0; z < sz; z++) {
                                        const c = voxels.get(`${x},${y},${z}`);
                                        const neighbor = voxels.get(`${x},${y + dir},${z}`);
                                        if (c && !neighbor) grid[z][x] = c;
                                    }
                                }
                                let quads = greedyMesh2D(grid, sx, sz);
                                quads.forEach(q => {
                                    const vox = {
                                        ...q,
                                        dir,
                                        axis: 'y',
                                    };

                                    const { faceVerts, faceName } = collectQuadVerts('y', y, q, dir);
                                    const baseIndex = vertices.length;
                                    vertices.push(...faceVerts);

                                    faceDefs.push({
                                        indices: [baseIndex, baseIndex + 1, baseIndex + 2, baseIndex + 3],
                                        faceName,
                                        vox
                                    });
                                });
                            }
                        }

                        // Sweep along Z
                        for (let z = 0; z < sz; z++) {
                            for (let dir of [1]) {
                                let grid = Array.from({ length: sy }, () => Array(sx).fill(null));
                                for (let x = 0; x < sx; x++) {
                                    for (let y = 0; y < sy; y++) {
                                        const c = voxels.get(`${x},${y},${z}`);
                                        const neighbor = voxels.get(`${x},${y},${z + dir}`);
                                        if (c && !neighbor) grid[y][x] = c;
                                    }
                                }
                                let quads = greedyMesh2D(grid, sx, sy);
                                quads.forEach(q => {
                                    const vox = {
                                        ...q,
                                        dir,
                                        axis: 'z',
                                    };

                                    const { faceVerts, faceName } = collectQuadVerts('z', z, q, dir);
                                    const baseIndex = vertices.length;
                                    vertices.push(...faceVerts);

                                    faceDefs.push({
                                        indices: [baseIndex, baseIndex + 1, baseIndex + 2, baseIndex + 3],
                                        faceName,
                                        vox
                                    });
                                });
                            }
                        }

                        let mesh = new Mesh({ name: "VoxMesh" });
                        if (Group.all.length === 0) new Group({ name: "Vox Import" }).init();
                        mesh.addTo(Group.all[0]);
                        mesh.init();

                        const dedupedVertices = deduplicateVertices(vertices, faceDefs);

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

                                placeFaceUVInTexture(mf, def.vox);

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

                    processVoxels();

				})
			}
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
