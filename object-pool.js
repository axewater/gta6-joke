import * as THREE from 'three';
import { scene } from './renderer.js';

class MeshPool {
  constructor(createFn, size) {
    this._createFn = createFn;
    this._size = size;
    this.free = [];
    this._initialized = false;
  }

  _init() {
    if (this._initialized) return;
    this._initialized = true;
    for (let i = 0; i < this._size; i++) {
      const mesh = this._createFn();
      mesh.visible = false;
      scene.add(mesh);
      this.free.push(mesh);
    }
  }

  init() {
    this._init();
  }

  acquire() {
    if (!this._initialized) this._init();
    const mesh = this.free.pop();
    if (!mesh) return null;
    mesh.visible = true;
    return mesh;
  }

  release(mesh) {
    mesh.visible = false;
    this.free.push(mesh);
  }
}

// ── Pre-configured pools ──────────────────────────────────────────────

export const playerBulletPool = new MeshPool(
  () => new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 4, 4),
    new THREE.MeshBasicMaterial({ color: 0xFFFF00 })
  ), 20
);

const policeBulletMat = new THREE.MeshBasicMaterial({ color: 0xFF6600 });
const policeBulletGeo = new THREE.SphereGeometry(0.08, 4, 4);
export const policeBulletPool = new MeshPool(
  () => new THREE.Mesh(policeBulletGeo, policeBulletMat), 40
);

const gangBulletMat = new THREE.MeshBasicMaterial({ color: 0xFF4400 });
const gangBulletGeo = new THREE.SphereGeometry(0.08, 4, 4);
export const gangBulletPool = new MeshPool(
  () => new THREE.Mesh(gangBulletGeo, gangBulletMat), 20
);

const smokeMat = new THREE.MeshBasicMaterial({ color: 0xCCCCCC, transparent: true, opacity: 0.5 });
const smokeGeo = new THREE.SphereGeometry(0.2, 4, 4);
export const tireSmokePool = new MeshPool(
  () => new THREE.Mesh(smokeGeo, smokeMat), 50
);

export const tankShellPool = new MeshPool(
  () => new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7, metalness: 0.4 })
  ), 10
);

export const missilePool = new MeshPool(
  () => new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff1100, emissiveIntensity: 1.0 })
  ), 8
);
