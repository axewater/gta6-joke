import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { CELL, HALF_CITY, ROAD, BLOCK, NEON_COLORS } from './constants.js';
import { makeSignTexture, makeScrollingSignTexture, BRAND_NAMES, AD_TEXTS, HOTEL_NAMES, BUSINESS_NAMES, TICKER_TEXTS, pick } from './city-helpers.js';
import { registerStaticMesh } from './geometry-merger.js';
import { createPoliceOfficer } from './characters.js';

// ── Times Square grid cells (center-most downtown blocks) ─────────────
const TS_CELLS = [[3, 4], [3, 5], [4, 4], [4, 5]];

// Color palettes for sign backgrounds and text
const WARM_SIGN_COLORS = ['#cc0000', '#ff4400', '#ff8800', '#ffaa00', '#ff1493', '#ff3366'];
const COOL_SIGN_COLORS = ['#00ccff', '#0066ff', '#8800ff', '#00ff88', '#00ffcc', '#6600cc'];
const SIGN_TEXT_COLORS = ['#ffffff', '#ffff00', '#00ffff', '#ff00ff', '#ff4444', '#44ff44'];

function pickSignColors() {
  const isWarm = Math.random() < 0.5;
  const bgArr = isWarm ? WARM_SIGN_COLORS : COOL_SIGN_COLORS;
  const bg = bgArr[Math.floor(Math.random() * bgArr.length)];
  const text = SIGN_TEXT_COLORS[Math.floor(Math.random() * SIGN_TEXT_COLORS.length)];
  return { bg, text };
}

function pickNeonHex() {
  return NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)];
}

function lerp(a, b, t) { return a + (b - a) * t; }

const yieldFrame = () => new Promise(r => requestAnimationFrame(r));

// ── Find buildings whose AABB center falls within a given block ───────
function getBuildingsInBlock(blockCenterX, blockCenterZ) {
  const halfBlock = BLOCK / 2;
  const minX = blockCenterX - halfBlock;
  const maxX = blockCenterX + halfBlock;
  const minZ = blockCenterZ - halfBlock;
  const maxZ = blockCenterZ + halfBlock;
  const results = [];
  for (const b of state.buildings) {
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    if (cx >= minX && cx <= maxX && cz >= minZ && cz <= maxZ) {
      results.push(b);
    }
  }
  return results;
}

// ── Place a sign on a building face ───────────────────────────────────
// face: 0=+Z, 1=-Z, 2=+X, 3=-X
function placeSignOnFace(bldg, face, signW, signH, heightFrac) {
  const cx = (bldg.minX + bldg.maxX) / 2;
  const cz = (bldg.minZ + bldg.maxZ) / 2;
  const bw = bldg.maxX - bldg.minX;
  const bd = bldg.maxZ - bldg.minZ;
  const y = bldg.height * heightFrac;
  const offset = 0.15;
  let x, z, rotY;
  switch (face) {
    case 0: // +Z face
      x = cx + (Math.random() - 0.5) * (bw - signW) * 0.6;
      z = bldg.maxZ + offset;
      rotY = 0;
      break;
    case 1: // -Z face
      x = cx + (Math.random() - 0.5) * (bw - signW) * 0.6;
      z = bldg.minZ - offset;
      rotY = Math.PI;
      break;
    case 2: // +X face
      x = bldg.maxX + offset;
      z = cz + (Math.random() - 0.5) * (bd - signW) * 0.6;
      rotY = Math.PI / 2;
      break;
    case 3: // -X face
      x = bldg.minX - offset;
      z = cz + (Math.random() - 0.5) * (bd - signW) * 0.6;
      rotY = -Math.PI / 2;
      break;
  }
  return { x, y, z, rotY };
}

// Get the width of a building face
function faceWidth(bldg, face) {
  if (face === 0 || face === 1) return bldg.maxX - bldg.minX;
  return bldg.maxZ - bldg.minZ;
}

// Pick the widest face index for a building
function widestFace(bldg) {
  const bw = bldg.maxX - bldg.minX;
  const bd = bldg.maxZ - bldg.minZ;
  if (bw >= bd) return Math.random() < 0.5 ? 0 : 1;
  return Math.random() < 0.5 ? 2 : 3;
}

// ── Main creation function ────────────────────────────────────────────
export async function createTimesSquare() {
  if (!state.scrollingSigns) state.scrollingSigns = [];
  if (!state.flashingSigns) state.flashingSigns = [];

  let signCount = 0;

  for (const [gi, gj] of TS_CELLS) {
    const blockCenterX = -HALF_CITY + gj * CELL + ROAD / 2 + BLOCK / 2;
    const blockCenterZ = -HALF_CITY + gi * CELL + ROAD / 2 + BLOCK / 2;

    const buildings = getBuildingsInBlock(blockCenterX, blockCenterZ);
    if (buildings.length === 0) continue;

    // ── (a) Large LED ad panels: 6-10 per block ────────────────────
    const ledCount = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < ledCount; i++) {
      const bldg = buildings[Math.floor(Math.random() * buildings.length)];
      if (bldg.height < 8) continue;
      const signW = 8 + Math.random() * 7;   // 8-15 wide
      const signH = 4 + Math.random() * 4;   // 4-8 tall
      const face = Math.floor(Math.random() * 4);
      if (faceWidth(bldg, face) < signW + 2) continue;
      const heightFrac = 0.3 + Math.random() * 0.5;  // 30-80%
      const pos = placeSignOnFace(bldg, face, signW, signH, heightFrac);

      const { bg, text } = pickSignColors();
      const signText = pick([...BRAND_NAMES, ...AD_TEXTS]);
      const tex = makeSignTexture(signText, bg, text, 512, 128);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        emissive: 0xffffff,
        emissiveIntensity: 1.5,
        emissiveMap: tex,
        side: THREE.DoubleSide
      });
      const geo = new THREE.PlaneGeometry(signW, signH);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.rotation.y = pos.rotY;
      mesh.castShadow = false;
      scene.add(mesh);
      // LED panels are static (not animated), register for merging
      // Note: can't merge multi-material with unique textures, just add to scene
      signCount++;
    }

    // ── (b) Hotel/business name signs: 4-6 per block ──────────────
    const hotelCount = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < hotelCount; i++) {
      const bldg = buildings[Math.floor(Math.random() * buildings.length)];
      if (bldg.height < 10) continue;
      // Some vertical (taller than wide), some horizontal
      const isVertical = Math.random() < 0.4;
      let signW, signH;
      if (isVertical) {
        signW = 2 + Math.random();          // 2-3 wide
        signH = 6 + Math.random() * 4;      // 6-10 tall
      } else {
        signW = 6 + Math.random() * 4;      // 6-10 wide
        signH = 2 + Math.random();           // 2-3 tall
      }
      const face = Math.floor(Math.random() * 4);
      if (faceWidth(bldg, face) < (isVertical ? signW : signW) + 2) continue;
      const heightFrac = 0.85 + Math.random() * 0.1;  // 85-95%
      const pos = placeSignOnFace(bldg, face, isVertical ? signW : signW, signH, heightFrac);

      const { bg, text } = pickSignColors();
      const nameText = pick([...HOTEL_NAMES, ...BUSINESS_NAMES]);
      const texW = isVertical ? 64 : 256;
      const texH = isVertical ? 256 : 64;
      const tex = makeSignTexture(nameText, bg, text, texW, texH);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        emissive: 0xffffff,
        emissiveIntensity: 1.5,
        emissiveMap: tex,
        side: THREE.DoubleSide
      });
      const geo = new THREE.PlaneGeometry(signW, signH);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.rotation.y = pos.rotY;
      mesh.castShadow = false;
      scene.add(mesh);
      signCount++;
    }

    // ── (c) Scrolling LED tickers: 2-3 per block ─────────────────
    const tickerCount = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < tickerCount; i++) {
      const bldg = buildings[Math.floor(Math.random() * buildings.length)];
      if (bldg.height < 12) continue;
      const face = widestFace(bldg);
      const fw = faceWidth(bldg, face);
      const signW = Math.min(20 + Math.random() * 10, fw - 2);  // 20-30, clamped
      if (signW < 10) continue;
      const signH = 1.5;
      const heightFrac = 0.4 + Math.random() * 0.2;  // mid-height
      const pos = placeSignOnFace(bldg, face, signW, signH, heightFrac);

      const tickerColors = ['#0ff', '#ff0', '#0f0', '#f0f', '#fff'];
      const textColor = tickerColors[Math.floor(Math.random() * tickerColors.length)];
      const tickerText = pick(TICKER_TEXTS);
      const tex = makeScrollingSignTexture(tickerText, '#000', textColor);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        emissive: 0xffffff,
        emissiveIntensity: 1.5,
        emissiveMap: tex,
        side: THREE.DoubleSide
      });
      const geo = new THREE.PlaneGeometry(signW, signH);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.rotation.y = pos.rotY;
      mesh.castShadow = false;
      scene.add(mesh);

      // Store for animation — do NOT register as static
      state.scrollingSigns.push({
        mesh,
        texture: tex,
        speed: 0.15 + Math.random() * 0.15
      });
      signCount++;
    }

    // ── (d) Flashing signs: 4-8 per block ─────────────────────────
    const flashCount = 4 + Math.floor(Math.random() * 5);
    for (let i = 0; i < flashCount; i++) {
      const bldg = buildings[Math.floor(Math.random() * buildings.length)];
      if (bldg.height < 6) continue;
      const signW = 4 + Math.random() * 4;   // 4-8 wide
      const signH = 3 + Math.random() * 3;   // 3-6 tall
      const face = Math.floor(Math.random() * 4);
      if (faceWidth(bldg, face) < signW + 2) continue;
      const heightFrac = 0.3 + Math.random() * 0.5;
      const pos = placeSignOnFace(bldg, face, signW, signH, heightFrac);

      const neonColor = pickNeonHex();
      const baseIntensity = 2 + Math.random() * 2;  // 2-4
      const mat = new THREE.MeshStandardMaterial({
        color: neonColor,
        emissive: neonColor,
        emissiveIntensity: baseIntensity,
        side: THREE.DoubleSide
      });
      const geo = new THREE.PlaneGeometry(signW, signH);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.rotation.y = pos.rotY;
      mesh.castShadow = false;
      scene.add(mesh);

      // Store for animation — do NOT register as static
      state.flashingSigns.push({
        mesh,
        material: mat,
        baseIntensity,
        frequency: 1 + Math.random() * 3  // 1-4 Hz
      });
      signCount++;
    }

    // ── (e) Ground-level billboard stands: 3-5 per block ──────────
    const billboardCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < billboardCount; i++) {
      // Position near block edges on sidewalks
      const edgeSide = Math.floor(Math.random() * 4);
      const halfBlock = BLOCK / 2;
      let bx, bz;
      const along = (Math.random() - 0.5) * BLOCK * 0.8;
      switch (edgeSide) {
        case 0: // +Z edge
          bx = blockCenterX + along;
          bz = blockCenterZ + halfBlock + ROAD * 0.15;
          break;
        case 1: // -Z edge
          bx = blockCenterX + along;
          bz = blockCenterZ - halfBlock - ROAD * 0.15;
          break;
        case 2: // +X edge
          bx = blockCenterX + halfBlock + ROAD * 0.15;
          bz = blockCenterZ + along;
          break;
        case 3: // -X edge
          bx = blockCenterX - halfBlock - ROAD * 0.15;
          bz = blockCenterZ + along;
          break;
      }

      // Pole
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
      const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 4, 6);
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(bx, 2, bz);
      pole.castShadow = false;
      scene.add(pole);
      registerStaticMesh(pole, poleMat);

      // Sign on top of pole
      const { bg, text } = pickSignColors();
      const signText = pick(AD_TEXTS);
      const tex = makeSignTexture(signText, bg, text, 256, 192);
      const signMat = new THREE.MeshStandardMaterial({
        map: tex,
        emissive: 0xffffff,
        emissiveIntensity: 1.5,
        emissiveMap: tex,
        side: THREE.DoubleSide
      });
      const signGeo = new THREE.PlaneGeometry(4, 3);
      const signMesh = new THREE.Mesh(signGeo, signMat);
      signMesh.position.set(bx, 5, bz);
      // Face the sign toward the road
      if (edgeSide === 2 || edgeSide === 3) {
        signMesh.rotation.y = Math.PI / 2;
      }
      signMesh.castShadow = false;
      scene.add(signMesh);
      signCount++;
    }

    // ── (f) Permanent police: 2-3 officers per block ──────────────
    const policeCount = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < policeCount; i++) {
      // Position at block edges near roads
      const edgeSide = Math.floor(Math.random() * 4);
      const halfBlock = BLOCK / 2;
      const along = (Math.random() - 0.5) * BLOCK * 0.6;
      let px, pz;
      switch (edgeSide) {
        case 0:
          px = blockCenterX + along;
          pz = blockCenterZ + halfBlock + ROAD * 0.2;
          break;
        case 1:
          px = blockCenterX + along;
          pz = blockCenterZ - halfBlock - ROAD * 0.2;
          break;
        case 2:
          px = blockCenterX + halfBlock + ROAD * 0.2;
          pz = blockCenterZ + along;
          break;
        case 3:
          px = blockCenterX - halfBlock - ROAD * 0.2;
          pz = blockCenterZ + along;
          break;
      }

      const officer = createPoliceOfficer(px, pz);
      officer.speed = 0;  // Stand still until player gets wanted
      state.policeOfficers.push(officer);
    }

    // Yield a frame between blocks to avoid long frame stalls
    await yieldFrame();
    signCount++;
  }
}

// ── Animation update (called every frame) ─────────────────────────────
export function updateTimesSquareSigns(dt) {
  // Scroll UV offset on scrolling signs
  if (state.scrollingSigns) {
    for (const s of state.scrollingSigns) {
      s.texture.offset.x += s.speed * dt;
      if (s.texture.offset.x > 1) s.texture.offset.x -= 1;
    }
  }
  // Flash signs by oscillating emissive intensity
  if (state.flashingSigns) {
    const t = performance.now() / 1000;
    for (const s of state.flashingSigns) {
      // Mix of sine waves for organic flashing
      const flash = 0.5 + 0.5 * Math.sin(t * s.frequency * Math.PI * 2);
      s.material.emissiveIntensity = s.baseIntensity * (0.3 + 0.7 * flash);
    }
  }
}
