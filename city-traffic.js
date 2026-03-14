import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { GRID, CELL, HALF_CITY, ROAD, TRAFFIC_GREEN_TIME, TRAFFIC_YELLOW_TIME } from './constants.js';

const yieldFrame = () => new Promise(r => requestAnimationFrame(r));

// Shared materials (swapped onto meshes each frame)
const matRedOn = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2.0 });
const matRedOff = new THREE.MeshStandardMaterial({ color: 0x330000, roughness: 0.9 });
const matYellowOn = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xffcc00, emissiveIntensity: 2.0 });
const matYellowOff = new THREE.MeshStandardMaterial({ color: 0x332200, roughness: 0.9 });
const matGreenOn = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 2.0 });
const matGreenOff = new THREE.MeshStandardMaterial({ color: 0x003300, roughness: 0.9 });

export async function createTrafficLights() {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 7, 6);
  const housingGeo = new THREE.BoxGeometry(0.5, 1.4, 0.5);
  const bulbGeo = new THREE.SphereGeometry(0.12, 6, 6);

  // Build 2D grid for quick lookup
  state.trafficLightGrid = [];
  for (let r = 0; r <= GRID; r++) state.trafficLightGrid[r] = new Array(GRID + 1).fill(null);

  let tlCount = 0;
  for (let row = 1; row < GRID; row++) {
    for (let col = 1; col < GRID; col++) {
      if (tlCount > 0 && tlCount % 10 === 0) await yieldFrame();
      tlCount++;
      const ix = -HALF_CITY + col * CELL;
      const iz = -HALF_CITY + row * CELL;

      // Place pole on NE corner of intersection (on sidewalk edge)
      const px = ix + ROAD / 2 + 0.5;
      const pz = iz - ROAD / 2 - 0.5;

      const group = new THREE.Group();

      // Pole
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(0, 3.5, 0);
      group.add(pole);

      // Housing at top
      const housing = new THREE.Mesh(housingGeo, housingMat);
      housing.position.set(0, 7.5, 0);
      group.add(housing);

      // NS lights (z faces — visible to traffic heading north/south)
      const nsRed = new THREE.Mesh(bulbGeo, matRedOff);
      nsRed.position.set(0, 7.9, -0.26);
      group.add(nsRed);
      const nsYellow = new THREE.Mesh(bulbGeo, matYellowOff);
      nsYellow.position.set(0, 7.5, -0.26);
      group.add(nsYellow);
      const nsGreen = new THREE.Mesh(bulbGeo, matGreenOn);
      nsGreen.position.set(0, 7.1, -0.26);
      group.add(nsGreen);

      // NS back face
      const nsRedB = new THREE.Mesh(bulbGeo, matRedOff);
      nsRedB.position.set(0, 7.9, 0.26);
      group.add(nsRedB);
      const nsYellowB = new THREE.Mesh(bulbGeo, matYellowOff);
      nsYellowB.position.set(0, 7.5, 0.26);
      group.add(nsYellowB);
      const nsGreenB = new THREE.Mesh(bulbGeo, matGreenOn);
      nsGreenB.position.set(0, 7.1, 0.26);
      group.add(nsGreenB);

      // EW lights (x faces — visible to traffic heading east/west)
      const ewRed = new THREE.Mesh(bulbGeo, matRedOn);
      ewRed.position.set(-0.26, 7.9, 0);
      group.add(ewRed);
      const ewYellow = new THREE.Mesh(bulbGeo, matYellowOff);
      ewYellow.position.set(-0.26, 7.5, 0);
      group.add(ewYellow);
      const ewGreen = new THREE.Mesh(bulbGeo, matGreenOff);
      ewGreen.position.set(-0.26, 7.1, 0);
      group.add(ewGreen);

      // EW back face
      const ewRedB = new THREE.Mesh(bulbGeo, matRedOn);
      ewRedB.position.set(0.26, 7.9, 0);
      group.add(ewRedB);
      const ewYellowB = new THREE.Mesh(bulbGeo, matYellowOff);
      ewYellowB.position.set(0.26, 7.5, 0);
      group.add(ewYellowB);
      const ewGreenB = new THREE.Mesh(bulbGeo, matGreenOff);
      ewGreenB.position.set(0.26, 7.1, 0);
      group.add(ewGreenB);

      group.position.set(px, 0, pz);
      scene.add(group);

      // Stagger initial phase so not all lights change at once
      const initialPhase = ((row + col) % 2 === 0) ? 0 : 2;
      const initialTimer = ((row * 3 + col * 7) % 10) / 10 * TRAFFIC_GREEN_TIME;

      const tl = {
        row, col, x: ix, z: iz,
        phase: initialPhase, // 0=NS green, 1=NS yellow, 2=EW green, 3=EW yellow
        timer: initialTimer,
        nsRed: [nsRed, nsRedB],
        nsYellow: [nsYellow, nsYellowB],
        nsGreen: [nsGreen, nsGreenB],
        ewRed: [ewRed, ewRedB],
        ewYellow: [ewYellow, ewYellowB],
        ewGreen: [ewGreen, ewGreenB],
      };

      state.trafficLights.push(tl);
      state.trafficLightGrid[row][col] = tl;
    }
  }
}

export function updateTrafficLights(dt) {
  for (const tl of state.trafficLights) {
    tl.timer += dt;

    const phaseDur = (tl.phase === 0 || tl.phase === 2) ? TRAFFIC_GREEN_TIME : TRAFFIC_YELLOW_TIME;
    if (tl.timer >= phaseDur) {
      tl.timer -= phaseDur;
      tl.phase = (tl.phase + 1) % 4;
    }

    // NS state: green=phase0, yellow=phase1, red=phase2|3
    const nsS = tl.phase === 0 ? 'green' : tl.phase === 1 ? 'yellow' : 'red';
    for (const m of tl.nsRed) m.material = nsS === 'red' ? matRedOn : matRedOff;
    for (const m of tl.nsYellow) m.material = nsS === 'yellow' ? matYellowOn : matYellowOff;
    for (const m of tl.nsGreen) m.material = nsS === 'green' ? matGreenOn : matGreenOff;

    // EW state: green=phase2, yellow=phase3, red=phase0|1
    const ewS = tl.phase === 2 ? 'green' : tl.phase === 3 ? 'yellow' : 'red';
    for (const m of tl.ewRed) m.material = ewS === 'red' ? matRedOn : matRedOff;
    for (const m of tl.ewYellow) m.material = ewS === 'yellow' ? matYellowOn : matYellowOff;
    for (const m of tl.ewGreen) m.material = ewS === 'green' ? matGreenOn : matGreenOff;
  }
}
