import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { BLOCK, NEON_COLORS, GRID, CELL, HALF_CITY, ROAD, CITY_SIZE } from './constants.js';
import { registerStaticMesh } from './geometry-merger.js';

export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export function makeWindowTexture(w, h, darkenFactor = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  // Base wall color — slightly varied by darkenFactor (0 = normal, 0.15 = side, 0.25 = back)
  const base = Math.max(0, Math.round(85 - darkenFactor * 255));
  ctx.fillStyle = `rgb(${base},${base},${base})`;
  ctx.fillRect(0, 0, 64, 128);
  const cols = 4, rows = 8, winW = 10, winH = 10;
  const gapX = (64 - cols * winW) / (cols + 1);
  const gapY = (128 - rows * winH) / (rows + 1);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = Math.random() > 0.35;
      ctx.fillStyle = lit ? '#ffeeaa' : '#222';
      ctx.fillRect(gapX + c * (winW + gapX), gapY + r * (winH + gapY), winW, winH);
    }
  }
  // Vertical gradient — darken bottom 40% for ambient occlusion effect
  const grad = ctx.createLinearGradient(0, 128, 0, 128 * 0.6);
  grad.addColorStop(0, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 128 * 0.6, 64, 128 * 0.4);
  // Subtle top highlight
  const topGrad = ctx.createLinearGradient(0, 0, 0, 128 * 0.15);
  topGrad.addColorStop(0, 'rgba(255,255,255,0.08)');
  topGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, 64, 128 * 0.15);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(w / 20, h / 30);
  return tex;
}

export function makeGarageTexture(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#666';
  ctx.fillRect(0, 0, 64, 128);
  // Horizontal floor-line stripes
  const floors = Math.floor(h / 3);
  for (let f = 0; f < floors; f++) {
    const y = (f / floors) * 128;
    ctx.fillStyle = '#888';
    ctx.fillRect(0, y, 64, 2);
    // openings between pillars
    ctx.fillStyle = '#333';
    ctx.fillRect(8, y + 4, 20, 128 / floors - 8);
    ctx.fillRect(36, y + 4, 20, 128 / floors - 8);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(w / 12, h / 15);
  return tex;
}

// Sign text pools for city signage
export const HOTEL_NAMES = ['GRAND HOTEL', 'RITZ', 'PALM PLAZA', 'OCEAN VIEW', 'VICE TOWER', 'ROYALE', 'SUNSET INN', 'THE MARINA'];
export const BRAND_NAMES = ['SPRUNK', 'eCOLA', 'CLUCKIN BELL', 'BURGER SHOT', 'PISSWASSER', 'REDWOOD', 'WHIZ', 'FACADE'];
export const AD_TEXTS = ['BUY NOW!', 'SALE 70% OFF', 'OPEN 24/7', 'VIP LOUNGE', 'LIVE TONIGHT', 'FREE WiFi', 'NEW SEASON', 'HOT DEALS'];
export const BUSINESS_NAMES = ['CASINO', 'BANK OF VICE', 'NEWS 7', 'ELECTRONICS', 'FASHION', 'NIGHTCLUB', 'SPA & GYM', 'INSURANCE'];
export const TICKER_TEXTS = [
  'STOCKS UP 420% >>> VICE CITY WEATHER: HOT >>> BREAKING NEWS: BANK ROBBERY IN PROGRESS >>> ',
  'SPRUNK: THE TASTE OF A NEW GENERATION >>> LIVE CONCERT TONIGHT >>> TRAFFIC ALERT: AVOID DOWNTOWN >>> ',
  'eCOLA: DELICIOUSLY INFECTIOUS >>> VICE CITY PD: CRIME DOWN 0.1% >>> LOTTERY JACKPOT: $69M >>> ',
];

export function makeSignTexture(text, bgColor = '#111', textColor = '#fff', width = 256, height = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);
  // Border glow
  ctx.strokeStyle = textColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, width - 4, height - 4);
  // Text
  const fontSize = Math.min(height * 0.55, width / (text.length * 0.55));
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

export function makeScrollingSignTexture(text, bgColor = '#111', textColor = '#0ff') {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 1024, 64);
  ctx.font = 'bold 40px Arial, sans-serif';
  ctx.fillStyle = textColor;
  ctx.textBaseline = 'middle';
  // Repeat text across the full width for seamless scrolling
  const fullText = (text + '     ').repeat(6);
  ctx.fillText(fullText, 10, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function clampToBlock(bx, bz, bw, bd, blockCenterX, blockCenterZ) {
  const minX = Math.max(bx - bw / 2, blockCenterX - BLOCK / 2 + 1);
  const maxX = Math.min(bx + bw / 2, blockCenterX + BLOCK / 2 - 1);
  const minZ = Math.max(bz - bd / 2, blockCenterZ - BLOCK / 2 + 1);
  const maxZ = Math.min(bz + bd / 2, blockCenterZ + BLOCK / 2 - 1);
  return { minX, maxX, minZ, maxZ };
}

// Material pool for non-windowed buildings — keyed by color hex
const buildingMatPool = new Map();
function getPooledBuildingMat(color) {
  const key = typeof color === 'number' ? color : color;
  if (!buildingMatPool.has(key)) {
    buildingMatPool.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
  }
  return buildingMatPool.get(key);
}

// Edge highlight material (shared, subtle bright strip for building corners)
const edgeMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.5, metalness: 0.2 });

// Helper: darken a hex color by a factor (0-1)
function darkenColor(color, factor) {
  const r = Math.max(0, ((color >> 16) & 0xff) * (1 - factor)) | 0;
  const g = Math.max(0, ((color >> 8) & 0xff) * (1 - factor)) | 0;
  const b = Math.max(0, (color & 0xff) * (1 - factor)) | 0;
  return (r << 16) | (g << 8) | b;
}

// Door materials (module-scope, shared across all buildings)
const doorDarkMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 });
const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.6 });
const doorGlassMat = new THREE.MeshStandardMaterial({
  color: 0x88ccff, emissive: 0x88ccff, emissiveIntensity: 0.3,
  metalness: 0.5, roughness: 0.2
});
const awningColors = [0xcc3333, 0x3366cc, 0x33aa55, 0xccaa33, 0x9933cc];

export function addBuilding(cx, cz, w, h, d, color, useWindows, castSh) {
  let mats;
  if (useWindows) {
    // Per-face variation: front (lit), sides (medium shadow), back (deep shadow)
    const frontMat = new THREE.MeshStandardMaterial({ color, map: makeWindowTexture(w, h, 0), roughness: 0.8 });
    const sideMat = new THREE.MeshStandardMaterial({ color: darkenColor(color, 0.15), map: makeWindowTexture(w, h, 0.12), roughness: 0.82 });
    const backMat = new THREE.MeshStandardMaterial({ color: darkenColor(color, 0.25), map: makeWindowTexture(w, h, 0.2), roughness: 0.85 });
    const roofMat = new THREE.MeshStandardMaterial({ color: darkenColor(color, 0.1), roughness: 0.9 });
    // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
    mats = [sideMat, sideMat, roofMat, roofMat, frontMat, backMat];
  } else {
    // Non-windowed: per-face color variation for depth
    const frontMat = getPooledBuildingMat(color);
    const sideColor = darkenColor(color, 0.12);
    const sideMat = getPooledBuildingMat(sideColor);
    const backColor = darkenColor(color, 0.2);
    const backMat = getPooledBuildingMat(backColor);
    const roofColor = darkenColor(color, 0.08);
    const roofMat = getPooledBuildingMat(roofColor);
    mats = [sideMat, sideMat, roofMat, roofMat, frontMat, backMat];
  }
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, mats);
  mesh.position.set(cx, h / 2, cz);
  mesh.castShadow = castSh !== false;
  mesh.receiveShadow = true;
  scene.add(mesh);
  state.buildingMeshes.push(mesh);

  // Note: multi-material buildings (both windowed and non-windowed) cannot be
  // merged via registerStaticMesh, but they benefit from per-face shading.

  // Edge/corner highlights — thin bright strips along vertical edges
  if (h > 10) {
    const stripW = 0.15;
    const stripGeo = new THREE.BoxGeometry(stripW, h, stripW);
    const corners = [
      [cx - w / 2, cz - d / 2],
      [cx + w / 2, cz - d / 2],
      [cx - w / 2, cz + d / 2],
      [cx + w / 2, cz + d / 2],
    ];
    for (const [ex, ez] of corners) {
      const strip = new THREE.Mesh(stripGeo, edgeMat);
      strip.position.set(ex, h / 2, ez);
      scene.add(strip);
      registerStaticMesh(strip, edgeMat);
    }
  }

  // ── Door at ground level on +Z face ──────────────────────────────────
  if ((useWindows || h > 6) && w >= 4 && d >= 4) {
    const doorW = Math.min(3.0, w * 0.2);
    const doorH = Math.min(4.0, h * 0.3);
    const doorZ = cz + d / 2 + 0.06;
    const roll = Math.random();

    if (roll < 0.4) {
      // Style 1: Simple dark rectangle (40%)
      const doorGeo = new THREE.PlaneGeometry(doorW, doorH);
      const door = new THREE.Mesh(doorGeo, doorDarkMat);
      door.position.set(cx, doorH / 2, doorZ);
      scene.add(door);
      registerStaticMesh(door, doorDarkMat);
    } else if (roll < 0.7) {
      // Style 2: Detailed door with frame + awning (30%)
      const doorGeo = new THREE.PlaneGeometry(doorW, doorH);
      const door = new THREE.Mesh(doorGeo, doorDarkMat);
      door.position.set(cx, doorH / 2, doorZ);
      scene.add(door);
      registerStaticMesh(door, doorDarkMat);

      const frameThick = 0.15;
      // Top frame
      const topGeo = new THREE.BoxGeometry(doorW + frameThick * 2, frameThick, frameThick);
      const topFrame = new THREE.Mesh(topGeo, doorFrameMat);
      topFrame.position.set(cx, doorH + frameThick / 2, doorZ);
      scene.add(topFrame);
      registerStaticMesh(topFrame, doorFrameMat);

      // Left frame
      const sideGeo = new THREE.BoxGeometry(frameThick, doorH, frameThick);
      const leftFrame = new THREE.Mesh(sideGeo, doorFrameMat);
      leftFrame.position.set(cx - doorW / 2 - frameThick / 2, doorH / 2, doorZ);
      scene.add(leftFrame);
      registerStaticMesh(leftFrame, doorFrameMat);

      // Right frame
      const rightFrame = new THREE.Mesh(sideGeo, doorFrameMat);
      rightFrame.position.set(cx + doorW / 2 + frameThick / 2, doorH / 2, doorZ);
      scene.add(rightFrame);
      registerStaticMesh(rightFrame, doorFrameMat);

      // Awning/overhang
      const awningColor = awningColors[Math.floor(Math.random() * awningColors.length)];
      const awningMat = new THREE.MeshStandardMaterial({ color: awningColor, roughness: 0.7 });
      const awningGeo = new THREE.BoxGeometry(doorW + 1.5, 0.2, 1.2);
      const awning = new THREE.Mesh(awningGeo, awningMat);
      awning.position.set(cx, doorH + 0.5, doorZ + 0.5);
      scene.add(awning);
      registerStaticMesh(awning, awningMat);
    } else {
      // Style 3: Glass entrance (30%, only for tall buildings)
      if (h > 15) {
        const glassDoorW = doorW * 1.3;
        const doorGeo = new THREE.PlaneGeometry(glassDoorW, doorH);
        const door = new THREE.Mesh(doorGeo, doorGlassMat);
        door.position.set(cx, doorH / 2, doorZ);
        scene.add(door);
        registerStaticMesh(door, doorGlassMat);
      } else {
        // Fallback to simple dark door for short buildings
        const doorGeo = new THREE.PlaneGeometry(doorW, doorH);
        const door = new THREE.Mesh(doorGeo, doorDarkMat);
        door.position.set(cx, doorH / 2, doorZ);
        scene.add(door);
        registerStaticMesh(door, doorDarkMat);
      }
    }
  }

  return mesh;
}

export function pushAABB(cx, cz, w, d, height) {
  const minX = cx - w / 2, maxX = cx + w / 2;
  const minZ = cz - d / 2, maxZ = cz + d / 2;
  state.buildings.push({ minX, maxX, minZ, maxZ, height });
  return { minX, maxX, minZ, maxZ };
}

// ── Neon sign helper ────────────────────────────────────────────────────

const neonMats = NEON_COLORS.map(c => new THREE.MeshStandardMaterial({
  color: c, emissive: c, emissiveIntensity: 4.0
}));

export function addNeonSign(cx, cz, w, d, height, bounds, chance) {
  if (Math.random() >= chance) return;
  const neonIdx = Math.floor(Math.random() * NEON_COLORS.length);
  const neonColor = NEON_COLORS[neonIdx];
  const neonGeo = new THREE.PlaneGeometry(w * 0.4, 1.5);
  const neonMat = neonMats[neonIdx];
  const neon = new THREE.Mesh(neonGeo, neonMat);
  const neonY = height * 0.6;
  const face = Math.floor(Math.random() * 4);
  let nx = cx, nz = cz;
  if (face === 0) { nz = bounds.maxZ + 0.05; }
  else if (face === 1) { nz = bounds.minZ - 0.05; }
  else if (face === 2) { nx = bounds.maxX + 0.05; neon.rotation.y = Math.PI / 2; }
  else { nx = bounds.minX - 0.05; neon.rotation.y = Math.PI / 2; }
  neon.position.set(nx, neonY, nz);
  neon.castShadow = false;
  scene.add(neon);
  state.neonSigns.push(neon);

  const pl = new THREE.PointLight(neonColor, 3.5, 25);
  pl.position.set(nx, neonY, nz);
  pl.castShadow = false;
  scene.add(pl);
  state.neonPointLights.push(pl);
}

export function randomSidewalkPos() {
  const roadIdx = Math.floor(Math.random() * (GRID + 1));
  const horizontal = Math.random() > 0.5;
  let x, z;
  if (horizontal) {
    z = -HALF_CITY + roadIdx * CELL + (Math.random() > 0.5 ? 1 : -1) * (ROAD / 2 + 1);
    x = -HALF_CITY + Math.random() * CITY_SIZE;
  } else {
    x = -HALF_CITY + roadIdx * CELL + (Math.random() > 0.5 ? 1 : -1) * (ROAD / 2 + 1);
    z = -HALF_CITY + Math.random() * CITY_SIZE;
  }
  z = Math.min(z, HALF_CITY - 2);
  return { x, z };
}
