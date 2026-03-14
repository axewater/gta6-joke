import * as THREE from 'three';
import { HALF_CITY, CELL } from './constants.js';

const GRID_CELLS = 12;
const CELL_SIZE = CELL;
const ORIGIN = -HALF_CITY - CELL;
const MAX_DIST_SQ = (1000 + CELL_SIZE) * (1000 + CELL_SIZE); // fog far + cell

export class SpatialGrid {
  constructor() {
    this.cells = new Array(GRID_CELLS * GRID_CELLS);
    this.cellAABBs = new Array(GRID_CELLS * GRID_CELLS);
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] = [];
      const row = Math.floor(i / GRID_CELLS);
      const col = i % GRID_CELLS;
      const minX = ORIGIN + col * CELL_SIZE;
      const minZ = ORIGIN + row * CELL_SIZE;
      this.cellAABBs[i] = new THREE.Box3(
        new THREE.Vector3(minX, -100, minZ),
        new THREE.Vector3(minX + CELL_SIZE, 600, minZ + CELL_SIZE)
      );
    }
    this.objectCells = new Map();
    this.frustum = new THREE.Frustum();
    this.projMatrix = new THREE.Matrix4();
  }

  _cellIndex(x, z) {
    const col = Math.floor((x - ORIGIN) / CELL_SIZE);
    const row = Math.floor((z - ORIGIN) / CELL_SIZE);
    if (col < 0 || col >= GRID_CELLS || row < 0 || row >= GRID_CELLS) return -1;
    return row * GRID_CELLS + col;
  }

  insert(object, x, z) {
    const idx = this._cellIndex(x, z);
    if (idx < 0) return;
    this.cells[idx].push(object);
    this.objectCells.set(object, idx);
  }

  move(object, x, z) {
    const newIdx = this._cellIndex(x, z);
    const oldIdx = this.objectCells.get(object);
    if (newIdx < 0 || oldIdx === newIdx) return;

    if (oldIdx !== undefined) {
      const cell = this.cells[oldIdx];
      const i = cell.indexOf(object);
      if (i >= 0) { cell[i] = cell[cell.length - 1]; cell.pop(); }
    }

    this.cells[newIdx].push(object);
    this.objectCells.set(object, newIdx);
  }

  update(camera) {
    this.projMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projMatrix);

    const camX = camera.position.x;
    const camZ = camera.position.z;

    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i];
      if (cell.length === 0) continue;

      const aabb = this.cellAABBs[i];
      const cx = (aabb.min.x + aabb.max.x) * 0.5;
      const cz = (aabb.min.z + aabb.max.z) * 0.5;
      const dx = cx - camX, dz = cz - camZ;
      const distSq = dx * dx + dz * dz;

      const visible = distSq <= MAX_DIST_SQ && this.frustum.intersectsBox(aabb);

      for (let j = 0; j < cell.length; j++) {
        cell[j].visible = visible;
      }
    }
  }
}
