import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene } from './renderer.js';
import { HALF_CITY, CELL } from './constants.js';

const CHUNK_SIZE = CELL * 2;
// material → chunkKey → geometry[]
const buckets = new Map();
const originals = [];

export function registerStaticMesh(mesh, material) {
  if (!material) material = mesh.material;
  originals.push(mesh);

  mesh.updateWorldMatrix(true, false);
  const pos = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
  const ck = chunkKey(pos.x, pos.z);

  if (!buckets.has(material)) buckets.set(material, new Map());
  const matBuckets = buckets.get(material);
  if (!matBuckets.has(ck)) matBuckets.set(ck, []);

  const geo = mesh.geometry.clone();
  geo.applyMatrix4(mesh.matrixWorld);
  matBuckets.get(ck).push(geo);
}

function chunkKey(x, z) {
  const cx = Math.floor((x + HALF_CITY + CHUNK_SIZE) / CHUNK_SIZE);
  const cz = Math.floor((z + HALF_CITY + CHUNK_SIZE) / CHUNK_SIZE);
  return `${cx},${cz}`;
}

export function finalizeStaticMeshes() {
  const merged = [];

  for (const [material, matBuckets] of buckets) {
    for (const [, geometries] of matBuckets) {
      if (geometries.length === 0) continue;

      let geo;
      if (geometries.length === 1) {
        geo = geometries[0];
      } else {
        geo = mergeGeometries(geometries, false);
        if (geo) for (const g of geometries) g.dispose();
      }
      if (!geo) continue;

      const m = new THREE.Mesh(geo, material);
      m.frustumCulled = true;
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      merged.push(m);
    }
  }

  // Remove originals from scene, track affected parents
  const affectedParents = new Set();
  for (const mesh of originals) {
    if (mesh.parent && mesh.parent !== scene) affectedParents.add(mesh.parent);
    if (mesh.parent) mesh.parent.remove(mesh);
    mesh.geometry.dispose();
  }

  // Remove groups left empty after merging their children
  for (const parent of affectedParents) {
    if (parent.children.length === 0 && parent.parent) {
      parent.parent.remove(parent);
    }
  }

  buckets.clear();
  originals.length = 0;

  return merged;
}
