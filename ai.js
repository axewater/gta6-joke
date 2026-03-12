import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { GRID, CELL, HALF_CITY, ROAD } from './constants.js';
import { collideAABB, triggerRagdoll } from './physics.js';
import { createPoliceOfficer } from './characters.js';
import { createPoliceCar } from './vehicles.js';
import { randomSidewalkPos } from './city.js';

// ── NPC AI ────────────────────────────────────────────────────────────
export function updateNPCs(dt) {
  for (const npc of state.npcs) {
    if (!npc.alive) {
      if (npc.ragdoll && npc.ragdoll.active) continue; // ragdoll handles movement
      npc.respawnTimer -= dt;
      if (npc.respawnTimer <= 0) {
        npc.alive = true;
        npc.aggressive = false;
        npc.mesh.visible = true;
        npc.mesh.rotation.x = 0;
        const pos = randomSidewalkPos();
        npc.x = pos.x; npc.z = pos.z;
        npc.mesh.position.set(npc.x, 0, npc.z);
      }
      continue;
    }

    if (npc.aggressive) {
      npc.aggroTimer -= dt;
      if (npc.aggroTimer <= 0) { npc.aggressive = false; continue; }

      const px = state.player.x, pz = state.player.z;
      const dx = px - npc.x, dz = pz - npc.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > 1.5) {
        const chaseSpeed = npc.speed * 2.5;
        npc.x += (dx / dist) * chaseSpeed * dt;
        npc.z += (dz / dist) * chaseSpeed * dt;
        const c = collideAABB(npc.x, npc.z, 0.4, 0.3);
        npc.x = c.x; npc.z = c.z;
        npc.mesh.rotation.y = Math.atan2(dx, dz);
      } else if (!state.isInVehicle && !state.ragdoll.active) {
        state.health -= 8 * dt;
      }
    } else {
      const fx = -Math.sin(npc.direction) * npc.speed * dt;
      const fz = -Math.cos(npc.direction) * npc.speed * dt;
      npc.x += fx; npc.z += fz;
      npc.waypointDist += npc.speed * dt;

      if (npc.waypointDist >= npc.waypointMax) {
        npc.waypointDist = 0;
        npc.waypointMax = 30 + Math.random() * 30;
        if (Math.random() < 0.3) {
          npc.direction += (Math.random() > 0.5 ? 1 : -1) * Math.PI / 2;
        }
      }

      const c = collideAABB(npc.x, npc.z, 0.4, 0.3);
      npc.x = c.x; npc.z = c.z;
      npc.mesh.rotation.y = npc.direction;
    }

    // Wrap
    if (npc.x < -HALF_CITY - 10) npc.x = HALF_CITY + 5;
    if (npc.x > HALF_CITY + 10) npc.x = -HALF_CITY - 5;
    if (npc.z < -HALF_CITY - 10) npc.z = HALF_CITY + 5;
    if (npc.z > HALF_CITY + 10) npc.z = -HALF_CITY - 5;

    npc.mesh.position.set(npc.x, 0, npc.z);

    npc.legPhase += dt * npc.speed * 2;
    const swing = Math.sin(npc.legPhase) * 0.4;
    npc.leftLeg.rotation.x = swing;
    npc.rightLeg.rotation.x = -swing;
  }
}

// ── Traffic Car AI ────────────────────────────────────────────────────
export function updateTrafficCars(dt) {
  for (const car of state.trafficCars) {
    const fx = Math.sin(car.rotation) * car.speed * dt;
    const fz = Math.cos(car.rotation) * car.speed * dt;
    car.x += fx; car.z += fz;
    car.waypointDist += car.speed * dt;

    if (car.waypointDist >= car.waypointMax) {
      car.waypointDist = 0;
      car.waypointMax = 40 + Math.random() * 40;
      const r = Math.random();
      if (r < 0.2) car.rotation += Math.PI / 2;
      else if (r < 0.4) car.rotation -= Math.PI / 2;
    }

    let slowDown = false;
    for (const other of state.trafficCars) {
      if (other === car) continue;
      const dx = other.x - car.x, dz = other.z - car.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 8) {
        const dot = (dx * Math.sin(car.rotation) + dz * Math.cos(car.rotation)) / dist;
        if (dot > 0.5) slowDown = true;
      }
    }
    const targetSpeed = slowDown ? 3 : (10 + Math.random() * 0.1);
    car.speed += (targetSpeed - car.speed) * dt * 2;

    const c = collideAABB(car.x, car.z, car.halfW, car.halfD);
    if (c.x !== car.x || c.z !== car.z) {
      car.x = c.x; car.z = c.z;
      car.rotation += Math.PI / 2;
      car.waypointDist = 0;
    }

    // Wrap
    if (car.x < -HALF_CITY - 20) car.x = HALF_CITY + 10;
    if (car.x > HALF_CITY + 20) car.x = -HALF_CITY - 10;
    if (car.z < -HALF_CITY - 20) car.z = HALF_CITY + 10;
    if (car.z > HALF_CITY + 20) car.z = -HALF_CITY - 10;

    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.rotation;
  }
}

// ── Police Car AI ─────────────────────────────────────────────────────
export function updatePolice(dt) {
  const wl = state.wantedLevel;
  let maxCops = 0;
  if (wl >= 1) maxCops = 1;
  if (wl >= 2) maxCops = 2;
  if (wl >= 3) maxCops = 3;
  if (wl >= 4) maxCops = 4;

  while (state.policeCars.length < maxCops) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * 40;
    const bx = (state.isInVehicle ? state.currentVehicle.x : state.player.x) + Math.cos(angle) * dist;
    const bz = (state.isInVehicle ? state.currentVehicle.z : state.player.z) + Math.sin(angle) * dist;
    state.policeCars.push(createPoliceCar(bx, bz, Math.random() * Math.PI * 2));
  }
  while (state.policeCars.length > maxCops) {
    const cop = state.policeCars.pop();
    scene.remove(cop.mesh);
  }

  const playerX = state.isInVehicle ? state.currentVehicle.x : state.player.x;
  const playerZ = state.isInVehicle ? state.currentVehicle.z : state.player.z;

  for (const cop of state.policeCars) {
    const dx = playerX - cop.x, dz = playerZ - cop.z;
    const targetAngle = Math.atan2(dx, dz);

    let angleDiff = targetAngle - cop.rotation;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    cop.rotation += angleDiff * dt * 3;

    cop.x += Math.sin(cop.rotation) * cop.speed * dt;
    cop.z += Math.cos(cop.rotation) * cop.speed * dt;

    const c = collideAABB(cop.x, cop.z, cop.halfW, cop.halfD);
    cop.x = c.x; cop.z = c.z;

    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = cop.rotation;

    // Flash lights
    cop.flashTimer += dt;
    if (cop.flashTimer > 0.3) {
      cop.flashTimer = 0;
      const redOn = cop.redLight.material.emissiveIntensity > 1;
      cop.redLight.material.emissiveIntensity = redOn ? 0.1 : 2.0;
      cop.blueLight.material.emissiveIntensity = redOn ? 2.0 : 0.1;
    }

    // Contact damage/ragdoll (on foot only — car-car handled by collision.js)
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 3 && !state.isInVehicle && !state.ragdoll.active && !state.isDead) {
      triggerRagdoll(
        Math.sin(cop.rotation) * cop.speed * 1.2,
        0,
        Math.cos(cop.rotation) * cop.speed * 1.2,
        cop.speed > 10
      );
    }
  }
}

// ── Police Officers (on foot) ─────────────────────────────────────────
export function updatePoliceOfficers(dt) {
  const wl = state.wantedLevel;
  let maxOfficers = 0;
  if (wl >= 1) maxOfficers = 2;
  if (wl >= 2) maxOfficers = 4;
  if (wl >= 3) maxOfficers = 6;
  if (wl >= 4) maxOfficers = 8;
  if (wl >= 5) maxOfficers = 10;

  while (state.policeOfficers.length < maxOfficers) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * 30;
    const bx = (state.isInVehicle ? state.currentVehicle.x : state.player.x) + Math.cos(angle) * dist;
    const bz = (state.isInVehicle ? state.currentVehicle.z : state.player.z) + Math.sin(angle) * dist;
    state.policeOfficers.push(createPoliceOfficer(bx, bz));
  }
  while (state.policeOfficers.length > maxOfficers) {
    const cop = state.policeOfficers.pop();
    scene.remove(cop.mesh);
  }

  const playerX = state.isInVehicle ? state.currentVehicle.x : state.player.x;
  const playerZ = state.isInVehicle ? state.currentVehicle.z : state.player.z;

  for (const cop of state.policeOfficers) {
    if (cop.ragdoll && cop.ragdoll.active) continue;
    if (cop.dead) continue;

    const dx = playerX - cop.x, dz = playerZ - cop.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 3) {
      const nx = dx / dist, nz = dz / dist;
      cop.x += nx * cop.speed * dt;
      cop.z += nz * cop.speed * dt;
      const c = collideAABB(cop.x, cop.z, 0.4, 0.3);
      cop.x = c.x; cop.z = c.z;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = Math.atan2(dx, dz);

      cop.legPhase += dt * cop.speed * 2;
      const swing = Math.sin(cop.legPhase) * 0.4;
      cop.leftLeg.rotation.x = swing;
      cop.rightLeg.rotation.x = -swing;
    } else {
      cop.leftLeg.rotation.x = 0;
      cop.rightLeg.rotation.x = 0;
      if (!state.isInVehicle && !state.ragdoll.active) {
        state.health -= 10 * dt;
      }
    }

    // Shoot at player
    cop.shootTimer -= dt;
    if (cop.shootTimer <= 0 && dist < 40 && dist > 5) {
      cop.shootTimer = 0.8 + Math.random() * 0.5;

      const bulletGeo = new THREE.SphereGeometry(0.08, 4, 4);
      const bulletMat = new THREE.MeshBasicMaterial({ color: 0xFF6600 });
      const bullet = new THREE.Mesh(bulletGeo, bulletMat);
      bullet.position.set(cop.x, 1.3, cop.z);
      scene.add(bullet);

      const bDir = { x: dx / dist + (Math.random() - 0.5) * 0.15, z: dz / dist + (Math.random() - 0.5) * 0.15 };
      state.policeBullets.push({
        mesh: bullet,
        x: cop.x, y: 1.3, z: cop.z,
        dx: bDir.x * 50, dy: 0, dz: bDir.z * 50,
        life: 1.5
      });
    }
  }
}
