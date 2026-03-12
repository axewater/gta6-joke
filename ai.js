import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { GRID, CELL, HALF_CITY, ROAD } from './constants.js';
import { collideAABB, triggerRagdoll } from './physics.js';
import { createPoliceOfficer } from './characters.js';
import { createPoliceCar, createTank } from './vehicles.js';
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
const PI = Math.PI;
const TWO_PI = PI * 2;

function isRedForDirection(tl, isNS) {
  // NS red when phase 2 or 3; EW red when phase 0 or 1
  if (isNS) return tl.phase === 2 || tl.phase === 3;
  return tl.phase === 0 || tl.phase === 1;
}

export function updateTrafficCars(dt) {
  for (const car of state.trafficCars) {
    // Move forward
    car.x += Math.sin(car.rotation) * car.speed * dt;
    car.z += Math.cos(car.rotation) * car.speed * dt;

    // Find nearest intersection
    const col = Math.round((car.x + HALF_CITY) / CELL);
    const row = Math.round((car.z + HALF_CITY) / CELL);
    const ix = -HALF_CITY + col * CELL;
    const iz = -HALF_CITY + row * CELL;
    const dix = car.x - ix, diz = car.z - iz;
    const distToCenter = Math.sqrt(dix * dix + diz * diz);

    // Turn only at intersections (replace old waypoint turning)
    if (distToCenter < 4 && !car.atIntersection) {
      car.atIntersection = true;
      const r = Math.random();
      if (r < 0.25) car.rotation += PI / 2;
      else if (r < 0.5) car.rotation -= PI / 2;
    }
    if (distToCenter > 12) car.atIntersection = false;

    // ── Traffic light check ──
    let shouldStopForLight = false;
    if (state.trafficLightGrid && col >= 1 && col < GRID && row >= 1 && row < GRID) {
      const tl = state.trafficLightGrid[row][col];
      if (tl) {
        const tdx = ix - car.x, tdz = iz - car.z;
        const tdist = Math.sqrt(tdx * tdx + tdz * tdz);

        if (tdist > 4 && tdist < 22) {
          // Check heading toward intersection
          const dot = (Math.sin(car.rotation) * tdx + Math.cos(car.rotation) * tdz) / tdist;
          if (dot > 0.4) {
            // Determine NS vs EW heading
            const heading = ((car.rotation % TWO_PI) + TWO_PI) % TWO_PI;
            const isNS = (heading < PI / 4) ||
                         (heading > 3 * PI / 4 && heading < 5 * PI / 4) ||
                         (heading > 7 * PI / 4);
            if (isRedForDirection(tl, isNS)) shouldStopForLight = true;
          }
        }
      }
    }

    // ── Collision avoidance with other traffic ──
    let slowForTraffic = false;
    for (const other of state.trafficCars) {
      if (other === car) continue;
      const odx = other.x - car.x, odz = other.z - car.z;
      const odist = Math.sqrt(odx * odx + odz * odz);
      if (odist < 8) {
        const dot = (odx * Math.sin(car.rotation) + odz * Math.cos(car.rotation)) / odist;
        if (dot > 0.5) slowForTraffic = true;
      }
    }

    // Speed control
    let targetSpeed;
    if (shouldStopForLight) targetSpeed = 0;
    else if (slowForTraffic) targetSpeed = 3;
    else targetSpeed = 10 + Math.random() * 0.1;

    car.speed += (targetSpeed - car.speed) * dt * 2;
    if (shouldStopForLight && car.speed < 0.5) car.speed = 0;

    // Building collision
    const c = collideAABB(car.x, car.z, car.halfW, car.halfD);
    if (c.x !== car.x || c.z !== car.z) {
      car.x = c.x; car.z = c.z;
      car.rotation += PI / 2;
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

// ── Army Tanks ────────────────────────────────────────────────────────
export function updateTanks(dt) {
  const targetCount = state.wantedLevel >= 5 ? 3 : 0;

  while (state.tanks.length < targetCount) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 100 + Math.random() * 50;
    const px = state.isInVehicle ? state.currentVehicle.x : state.player.x;
    const pz = state.isInVehicle ? state.currentVehicle.z : state.player.z;
    state.tanks.push(createTank(px + Math.cos(angle) * dist, pz + Math.sin(angle) * dist));
  }
  while (state.tanks.length > targetCount) {
    const tank = state.tanks.pop();
    for (const s of tank.shells) scene.remove(s.mesh);
    scene.remove(tank.mesh);
  }

  const playerX = state.isInVehicle ? state.currentVehicle.x : state.player.x;
  const playerZ = state.isInVehicle ? state.currentVehicle.z : state.player.z;

  for (const tank of state.tanks) {
    const dx = playerX - tank.x, dz = playerZ - tank.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 8) {
      const targetAngle = Math.atan2(dx, dz);
      let angleDiff = targetAngle - tank.rotation;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      tank.rotation += angleDiff * dt * 2;
      tank.x += Math.sin(tank.rotation) * 6 * dt;
      tank.z += Math.cos(tank.rotation) * 6 * dt;
    }

    // Turret independently tracks player
    tank.turretGroup.rotation.y = Math.atan2(dx, dz) - tank.rotation;
    tank.mesh.position.set(tank.x, 0, tank.z);
    tank.mesh.rotation.y = tank.rotation;

    // Fire cannon shell
    tank.shootTimer -= dt;
    if (tank.shootTimer <= 0 && dist < 150) {
      tank.shootTimer = 4 + Math.random() * 2;
      const shellGeo = new THREE.SphereGeometry(0.3, 6, 6);
      const shellMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7, metalness: 0.4 });
      const shellMesh = new THREE.Mesh(shellGeo, shellMat);
      shellMesh.position.set(tank.x, 1.8, tank.z);
      scene.add(shellMesh);
      const dxN = dx / dist, dzN = dz / dist;
      tank.shells.push({
        mesh: shellMesh,
        x: tank.x, y: 1.8, z: tank.z,
        dx: dxN * 40, dy: 0.5, dz: dzN * 40,
        life: 5.0
      });
    }

    // Update shells
    for (let i = tank.shells.length - 1; i >= 0; i--) {
      const s = tank.shells[i];
      s.x += s.dx * dt;
      s.y += s.dy * dt;
      s.z += s.dz * dt;
      s.dy -= 15 * dt;
      s.life -= dt;
      s.mesh.position.set(s.x, s.y, s.z);

      const px2 = state.isInVehicle ? state.currentVehicle.x : state.player.x;
      const pz2 = state.isInVehicle ? state.currentVehicle.z : state.player.z;
      const ddx = px2 - s.x, ddz = pz2 - s.z;
      const hitPlayer = (ddx * ddx + ddz * ddz < 64); // radius 8 AOE

      if (s.life <= 0 || s.y <= 0 || hitPlayer) {
        if (hitPlayer && !state.isDead) {
          state.health -= 60;
          state.cameraShake.intensity = 1.5;
          state.cameraShake.timer = 0.8;
        }
        scene.remove(s.mesh);
        tank.shells.splice(i, 1);
      }
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
