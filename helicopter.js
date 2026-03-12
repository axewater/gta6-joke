import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';

// ── Helicopter Model ────────────────────────────────────────────────────
function createHelicopterMesh() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a3a2a, roughness: 0.7, metalness: 0.3 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x88aacc, transparent: true, opacity: 0.5, roughness: 0.1 });
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
  const skidMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5, metalness: 0.5 });

  // Main body
  const body = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 6), bodyMat);
  group.add(body);

  // Cockpit glass
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 1.8), glassMat);
  cockpit.position.set(0, 0.1, 2.5);
  group.add(cockpit);

  // Tail boom
  const tailBoom = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 3.5), bodyMat);
  tailBoom.position.set(0, 0.1, -4.5);
  group.add(tailBoom);

  // Tail fin
  const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.8), bodyMat);
  tailFin.position.set(0, 0.6, -6.2);
  group.add(tailFin);

  // Main rotor hub
  const rotorHub = new THREE.Group();
  rotorHub.position.set(0, 0.8, 0);
  group.add(rotorHub);

  const blade1 = new THREE.Mesh(new THREE.BoxGeometry(14, 0.08, 0.6), bladeMat);
  rotorHub.add(blade1);
  const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 14), bladeMat);
  rotorHub.add(blade2);

  // Tail rotor hub
  const tailRotorHub = new THREE.Group();
  tailRotorHub.position.set(0.3, 0.5, -6.2);
  group.add(tailRotorHub);

  const tBlade1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2, 0.2), bladeMat);
  tailRotorHub.add(tBlade1);
  const tBlade2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 2), bladeMat);
  tailRotorHub.add(tBlade2);

  // Skids
  const skid1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 5), skidMat);
  skid1.position.set(-1.2, -0.6, 0);
  group.add(skid1);
  const skid2 = skid1.clone();
  skid2.position.x = 1.2;
  group.add(skid2);

  // Skid struts
  const strutGeo = new THREE.BoxGeometry(0.1, 0.5, 0.1);
  for (const sx of [-1.2, 1.2]) {
    for (const sz of [-1.5, 1.5]) {
      const strut = new THREE.Mesh(strutGeo, skidMat);
      strut.position.set(sx, -0.35, sz);
      group.add(strut);
    }
  }

  return { group, rotorHub, tailRotorHub };
}

// ── Spawn Helicopter ────────────────────────────────────────────────────
function spawnHelicopter() {
  const { group, rotorHub, tailRotorHub } = createHelicopterMesh();
  const playerX = state.isInVehicle ? state.currentVehicle.x : state.player.x;
  const playerZ = state.isInVehicle ? state.currentVehicle.z : state.player.z;
  group.position.set(playerX + 30, 45, playerZ);
  scene.add(group);

  return {
    mesh: group,
    rotorHub,
    tailRotorHub,
    x: playerX + 30,
    y: 45,
    z: playerZ,
    orbitAngle: Math.random() * Math.PI * 2,
    shootTimer: 2.0,
    missiles: []
  };
}

// ── Update Helicopter ───────────────────────────────────────────────────
export function updateHelicopter(dt) {
  // Spawn / despawn
  if (state.wantedLevel >= 3 && !state.helicopter) {
    state.helicopter = spawnHelicopter();
  }
  if (state.wantedLevel < 3 && state.helicopter) {
    scene.remove(state.helicopter.mesh);
    for (const m of state.helicopter.missiles) scene.remove(m.mesh);
    state.helicopter = null;
    return;
  }
  if (!state.helicopter) return;

  const heli = state.helicopter;
  const playerX = state.isInVehicle ? state.currentVehicle.x : state.player.x;
  const playerZ = state.isInVehicle ? state.currentVehicle.z : state.player.z;

  // Orbit player
  heli.orbitAngle += dt * 0.5;
  const targetX = playerX + Math.cos(heli.orbitAngle) * 25;
  const targetZ = playerZ + Math.sin(heli.orbitAngle) * 25;

  heli.x += (targetX - heli.x) * dt * 2;
  heli.y += (45 - heli.y) * dt * 2;
  heli.z += (targetZ - heli.z) * dt * 2;
  heli.mesh.position.set(heli.x, heli.y, heli.z);

  // Face player
  const dxP = playerX - heli.x, dzP = playerZ - heli.z;
  heli.mesh.rotation.y = Math.atan2(dxP, dzP);

  // Spin rotors
  heli.rotorHub.rotation.y += dt * 15;
  heli.tailRotorHub.rotation.x += dt * 20;

  // Weapons
  heli.shootTimer -= dt;
  if (heli.shootTimer <= 0) {
    if (state.wantedLevel >= 4) {
      heli.shootTimer = 4 + Math.random() * 2;
      fireMissile(heli, playerX, playerZ);
    } else {
      heli.shootTimer = 1.5;
      fireBullet(heli, playerX, playerZ);
    }
  }

  updateMissiles(heli, dt);
}

function fireBullet(heli, playerX, playerZ) {
  const geo = new THREE.SphereGeometry(0.08, 4, 4);
  const mat = new THREE.MeshBasicMaterial({ color: 0xFF6600 });
  const bullet = new THREE.Mesh(geo, mat);
  bullet.position.set(heli.x, heli.y, heli.z);
  scene.add(bullet);

  const dx = playerX - heli.x;
  const dy = -heli.y;
  const dz = playerZ - heli.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

  state.policeBullets.push({
    mesh: bullet,
    x: heli.x, y: heli.y, z: heli.z,
    dx: (dx / len + (Math.random() - 0.5) * 0.12) * 50,
    dy: (dy / len) * 50,
    dz: (dz / len + (Math.random() - 0.5) * 0.12) * 50,
    life: 2.0
  });
}

function fireMissile(heli, playerX, playerZ) {
  const geo = new THREE.SphereGeometry(0.3, 6, 6);
  const mat = new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff1100, emissiveIntensity: 1.0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(heli.x, heli.y, heli.z);
  scene.add(mesh);

  const dx = playerX - heli.x;
  const dy = -heli.y;
  const dz = playerZ - heli.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

  heli.missiles.push({
    mesh,
    x: heli.x, y: heli.y, z: heli.z,
    dx: (dx / len) * 30,
    dy: (dy / len) * 30,
    dz: (dz / len) * 30,
    life: 5.0
  });
}

function updateMissiles(heli, dt) {
  const playerX = state.isInVehicle ? state.currentVehicle.x : state.player.x;
  const playerZ = state.isInVehicle ? state.currentVehicle.z : state.player.z;
  const playerY = state.player.y + 1;

  for (let i = heli.missiles.length - 1; i >= 0; i--) {
    const m = heli.missiles[i];
    m.x += m.dx * dt;
    m.y += m.dy * dt;
    m.z += m.dz * dt;
    m.life -= dt;
    m.mesh.position.set(m.x, m.y, m.z);

    const expired = m.life <= 0 || m.y <= 0;
    const dx = playerX - m.x, dz = playerZ - m.z, dy = playerY - m.y;
    const hitPlayer = (dx * dx + dy * dy + dz * dz < 36); // radius 6

    if (expired || hitPlayer) {
      if (hitPlayer && !state.isDead) {
        state.health -= 40;
        state.cameraShake.intensity = 1.2;
        state.cameraShake.timer = 0.6;
      }
      scene.remove(m.mesh);
      heli.missiles.splice(i, 1);
    }
  }
}
