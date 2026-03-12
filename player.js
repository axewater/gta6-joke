import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import {
  GRAVITY, PLAYER_SPEED, SPRINT_MULT, JUMP_FORCE,
  CAR_MAX_SPEED, CAR_ACCEL, CAR_BRAKE, CAR_FRICTION, CAR_TURN,
  RADIO_STATIONS, HALF_CITY, CAR_BUILDING_DAMAGE_MIN_SPEED, CAR_BUILDING_DAMAGE_MULT
} from './constants.js';
import { collideAABB } from './physics.js';
import { randomSidewalkPos } from './city.js';
import { spawnTrafficCar } from './vehicles.js';
import { applyVehicleDamage } from './vehicle-damage.js';

// ── Crime System ────────────────────────────────────────────────────────
export function commitCrime() {
  state.wantedLevel = Math.min(state.wantedLevel + 1, 5);
  state.wantedDecayTimer = 0;
  state.lastCrimeTime = state.elapsedTime;
}

export function registerCivilianKill() {
  state.killCount++;
  state.wantedDecayTimer = 0;
  state.lastCrimeTime = state.elapsedTime;
  recalcWanted();
}

export function registerPoliceKill() {
  state.policeKilled++;
  state.wantedDecayTimer = 0;
  state.lastCrimeTime = state.elapsedTime;
  recalcWanted();
}

function recalcWanted() {
  let minLevel = 0;
  if (state.killCount >= 1) minLevel = Math.max(minLevel, 1);
  if (state.killCount >= 2) minLevel = Math.max(minLevel, 2);
  if (state.killCount >= 5) minLevel = Math.max(minLevel, 4);
  if (state.killCount >= 8) minLevel = Math.max(minLevel, 5);
  if (state.policeKilled >= 1) minLevel = Math.max(minLevel, 3);
  state.wantedLevel = Math.max(state.wantedLevel, minLevel);
}

// ── Update Player on Foot ───────────────────────────────────────────────
export function updatePlayer(dt) {
  if (state.isDead) return;
  if (state.ragdoll.active) return; // ragdoll handles movement

  const p = state.player;
  const k = state.keys;

  let moveX = 0, moveZ = 0;
  const theta = state.camera.theta;
  const forward = { x: -Math.sin(theta), z: -Math.cos(theta) };
  const right = { x: Math.cos(theta), z: -Math.sin(theta) };

  if (k['KeyW']) { moveX += forward.x; moveZ += forward.z; }
  if (k['KeyS']) { moveX -= forward.x; moveZ -= forward.z; }
  if (k['KeyA']) { moveX -= right.x; moveZ -= right.z; }
  if (k['KeyD']) { moveX += right.x; moveZ += right.z; }

  const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
  if (len > 0) { moveX /= len; moveZ /= len; }

  const sprint = (k['ShiftLeft'] || k['ShiftRight']) ? SPRINT_MULT : 1;
  const speed = PLAYER_SPEED * sprint;

  p.x += moveX * speed * dt;
  p.z += moveZ * speed * dt;

  if (k['Space'] && p.y <= 0.01) {
    state.playerVelocityY = JUMP_FORCE;
  }

  state.playerVelocityY += GRAVITY * dt;
  p.y += state.playerVelocityY * dt;
  if (p.y < 0) { p.y = 0; state.playerVelocityY = 0; }

  const corrected = collideAABB(p.x, p.z, 0.5, 0.3);
  p.x = corrected.x; p.z = corrected.z;

  // Drowning in ocean
  if (p.z > HALF_CITY + 72) {
    state.health -= 30 * dt;
  }

  p.mesh.position.set(p.x, p.y, p.z);

  if (len > 0.1) {
    p.mesh.rotation.y = Math.atan2(moveX, moveZ);
  }

  // Leg animation
  if (len > 0.1) {
    p.legPhase += dt * speed * 1.5;
    const swing = Math.sin(p.legPhase) * 0.5;
    p.leftLeg.rotation.x = swing;
    p.rightLeg.rotation.x = -swing;
    p.leftArm.rotation.x = -swing * 0.6;
    p.rightArm.rotation.x = swing * 0.6;
  } else {
    p.leftLeg.rotation.x = 0; p.rightLeg.rotation.x = 0;
    p.leftArm.rotation.x = 0; p.rightArm.rotation.x = 0;
  }

  // Punch animation
  if (state.isPunching) {
    state.punchTimer -= dt;
    p.rightArm.rotation.x = -Math.PI / 2 * Math.max(0, state.punchTimer / 0.3);
    if (state.punchTimer <= 0) {
      state.isPunching = false;
      p.rightArm.rotation.x = 0;
    }
  }
}

// ── Update Vehicle ──────────────────────────────────────────────────────
export function updateVehicle(dt) {
  if (state.isDead) return;
  const v = state.currentVehicle;
  if (v.isExploded) return;
  const k = state.keys;

  if (k['KeyW']) v.speed = Math.min(v.speed + CAR_ACCEL * dt, CAR_MAX_SPEED);
  else if (k['KeyS']) v.speed = Math.max(v.speed - CAR_BRAKE * dt, -CAR_MAX_SPEED * 0.4);
  else {
    if (Math.abs(v.speed) < 0.5) v.speed = 0;
    else v.speed -= Math.sign(v.speed) * CAR_FRICTION * dt;
  }

  if (Math.abs(v.speed) > 0.5) {
    const turnFactor = CAR_TURN * (v.speed / CAR_MAX_SPEED);
    if (k['KeyA']) v.rotation += turnFactor * dt;
    if (k['KeyD']) v.rotation -= turnFactor * dt;
  }

  const impactSpeed = Math.abs(v.speed);

  v.x += Math.sin(v.rotation) * v.speed * dt;
  v.z += Math.cos(v.rotation) * v.speed * dt;

  // Player vehicle skips ramp AABBs (drives over them)
  const corrected = collideAABB(v.x, v.z, v.halfW, v.halfD, true);
  if (corrected.x !== v.x || corrected.z !== v.z) {
    // Building collision damage
    if (impactSpeed > CAR_BUILDING_DAMAGE_MIN_SPEED) {
      applyVehicleDamage(v, impactSpeed * CAR_BUILDING_DAMAGE_MULT);
      state.cameraShake.intensity = 0.6;
      state.cameraShake.timer = 0.3;
    }
    v.speed *= -0.3;
    v.x = corrected.x; v.z = corrected.z;
  }

  // ── Ramp physics ──────────────────────────────────────────────────
  if (v.vehicleY === undefined) v.vehicleY = 0;
  if (v.launchVY === undefined) v.launchVY = 0;
  if (v.airborne === undefined) v.airborne = false;
  if (v.pitchAngle === undefined) v.pitchAngle = 0;
  if (v.mesh.rotation.order !== 'YXZ') v.mesh.rotation.order = 'YXZ';

  let onRamp = false;
  let targetPitch = 0;

  // Skip ramp grounding when airborne — otherwise the ramp AABB
  // immediately cancels the launch on the next frame
  if (!v.airborne) {
    for (const ramp of state.ramps) {
      const overlapX = Math.min(v.x + v.halfW, ramp.maxX) - Math.max(v.x - v.halfW, ramp.minX);
      const overlapZ = Math.min(v.z + v.halfD, ramp.maxZ) - Math.max(v.z - v.halfD, ramp.minZ);
      if (overlapX > 0 && overlapZ > 0) {
        onRamp = true;
        // Calculate progress along ramp direction (0=bottom, 1=top)
        const cosR = Math.cos(ramp.rotY), sinR = Math.sin(ramp.rotY);
        const localZ = -(v.x - ramp.x) * sinR + (v.z - ramp.z) * cosR;
        const progress = 1 - (localZ + ramp.length / 2) / ramp.length;
        const clampedProgress = Math.max(0, Math.min(1, progress));
        v.vehicleY = clampedProgress * ramp.height;

        // Pitch the car to match the ramp slope
        // rampAngle = slope angle, projected onto the car's forward direction
        const rampAngle = Math.atan2(ramp.height, ramp.length);
        targetPitch = rampAngle * Math.cos(v.rotation - ramp.rotY);

        // Launch at top edge
        if (clampedProgress > 0.95 && Math.abs(v.speed) > 2) {
          v.airborne = true;
          v.launchVY = Math.abs(v.speed) * 0.4 + 3;
          v.vehicleY = ramp.height;
          v.pitchAngle = targetPitch;
        }
        break;
      }
    }
  }

  if (v.airborne) {
    v.launchVY -= 30 * dt; // gravity
    v.vehicleY += v.launchVY * dt;

    // Gradually pitch back toward level while airborne
    v.pitchAngle += (0 - v.pitchAngle) * dt * 2;

    if (v.vehicleY <= 0) {
      v.vehicleY = 0;
      v.airborne = false;
      v.launchVY = 0;
      v.pitchAngle = 0;
      // Landing camera shake
      state.cameraShake.intensity = 1.0;
      state.cameraShake.timer = 0.5;
    }
  } else if (onRamp) {
    // Smoothly interpolate pitch while on ramp
    v.pitchAngle += (targetPitch - v.pitchAngle) * dt * 10;
  } else {
    // Smoothly return to level off-ramp
    v.pitchAngle += (0 - v.pitchAngle) * dt * 8;
    v.vehicleY = 0;
  }

  // Drowning in ocean
  if (v.z > HALF_CITY + 72) {
    state.health -= 30 * dt;
    v.speed *= 0.85; // drag
  }

  v.mesh.position.set(v.x, v.vehicleY, v.z);
  v.mesh.rotation.y = v.rotation;
  v.mesh.rotation.x = v.pitchAngle;

  const wheelSpin = v.speed * dt * 3;
  if (v.wheels) {
    for (const w of v.wheels) w.rotation.x += wheelSpin;
  }

  // Tire smoke on hard braking or sharp turning
  const isBraking = k['KeyS'] && Math.abs(v.speed) > 8;
  const isTurning = (k['KeyA'] || k['KeyD']) && Math.abs(v.speed) > 12;
  if ((isBraking || isTurning) && !v.airborne && Math.random() < 0.3) {
    const sinR = Math.sin(v.rotation);
    const cosR = Math.cos(v.rotation);
    const rearX = v.x - sinR * 2;
    const rearZ = v.z - cosR * 2;
    const geo = new THREE.SphereGeometry(0.2, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xCCCCCC, transparent: true, opacity: 0.5 });
    const p = new THREE.Mesh(geo, mat);
    p.position.set(rearX + (Math.random() - 0.5) * 1.5, 0.3, rearZ + (Math.random() - 0.5) * 1.5);
    p.userData = { life: 0.8, maxLife: 0.8 };
    scene.add(p);
    state.tireSmokeParticles.push(p);
  }
}

// ── Tire Smoke Update ───────────────────────────────────────────────────
export function updateTireSmoke(dt) {
  for (let i = state.tireSmokeParticles.length - 1; i >= 0; i--) {
    const p = state.tireSmokeParticles[i];
    p.userData.life -= dt;
    const progress = 1 - p.userData.life / p.userData.maxLife;
    p.position.y += dt * 2;
    const s = 1 + progress * 3;
    p.scale.set(s, s, s);
    p.material.opacity = 0.5 * (1 - progress);
    if (p.userData.life <= 0) {
      scene.remove(p);
      state.tireSmokeParticles.splice(i, 1);
    }
  }
}

// ── Vehicle Enter/Exit ──────────────────────────────────────────────────
export function handleVehicleToggle() {
  if (state.isInVehicle) {
    const v = state.currentVehicle;
    const perpX = Math.cos(v.rotation);
    const perpZ = -Math.sin(v.rotation);
    state.player.x = v.x + perpX * 3;
    state.player.z = v.z + perpZ * 3;
    state.player.y = 0;
    state.player.mesh.visible = true;
    state.player.mesh.position.set(state.player.x, 0, state.player.z);
    state.isInVehicle = false;
    state.currentVehicle = null;
    state.camera.distance = 10;
  } else {
    let nearest = null, nearestDist = 4, isCarjack = false;

    for (const v of state.vehicles) {
      if (v.isExploded) continue;
      const dx = v.x - state.player.x, dz = v.z - state.player.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < nearestDist) { nearestDist = dist; nearest = v; }
    }
    for (const v of state.trafficCars) {
      if (v.isExploded) continue;
      const dx = v.x - state.player.x, dz = v.z - state.player.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < nearestDist) { nearestDist = dist; nearest = v; isCarjack = true; }
    }

    if (nearest) {
      if (isCarjack) {
        const idx = state.trafficCars.indexOf(nearest);
        if (idx >= 0) state.trafficCars.splice(idx, 1);
        nearest.isTraffic = false;
        nearest.speed = 0;
        if (!nearest.wheels) nearest.wheels = [];
        state.vehicles.push(nearest);
        commitCrime();
        setTimeout(() => {
          state.trafficCars.push(spawnTrafficCar());
        }, 20000);
      }
      state.isInVehicle = true;
      state.currentVehicle = nearest;
      state.player.mesh.visible = false;
      state.camera.distance = 14;
      showRadioPopup();
    }
  }
}

// ── Punch ───────────────────────────────────────────────────────────────
export function handlePunch() {
  if (state.isPunching) return;
  state.isPunching = true;
  state.punchTimer = 0.3;

  const p = state.player;
  const fwd = { x: -Math.sin(p.mesh.rotation.y), z: -Math.cos(p.mesh.rotation.y) };

  let closest = null, closestDist = 2.5;
  for (const npc of state.npcs) {
    if (!npc.alive) continue;
    const dx = npc.x - p.x, dz = npc.z - p.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > closestDist) continue;
    const dot = fwd.x * (dx / dist) + fwd.z * (dz / dist);
    if (dot > 0.3) { closestDist = dist; closest = npc; }
  }

  if (closest) {
    closest.alive = false;
    closest.mesh.rotation.x = Math.PI / 2;
    closest.respawnTimer = 15;
    registerCivilianKill();
    setTimeout(() => { closest.mesh.visible = false; }, 1000);

    for (const npc of state.npcs) {
      if (!npc.alive || npc === closest) continue;
      const dx = npc.x - p.x, dz = npc.z - p.z;
      if (dx * dx + dz * dz < 225) {
        npc.aggressive = true;
        npc.aggroTimer = 10 + Math.random() * 5;
      }
    }
  }
}

// ── Shoot ───────────────────────────────────────────────────────────────
export function handleShoot() {
  if (state.shootCooldown > 0) return;
  state.shootCooldown = 0.25;

  const p = state.player;
  const dir = new THREE.Vector3(0, 0, -1);
  dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), state.camera.theta);

  const bulletGeo = new THREE.SphereGeometry(0.1, 4, 4);
  const bulletMat = new THREE.MeshBasicMaterial({ color: 0xFFFF00 });
  const bullet = new THREE.Mesh(bulletGeo, bulletMat);
  bullet.position.set(p.x, p.y + 1.5, p.z);
  scene.add(bullet);

  state.playerBullets.push({
    mesh: bullet,
    x: p.x, y: p.y + 1.5, z: p.z,
    dx: dir.x * 80, dy: 0, dz: dir.z * 80,
    life: 2.0
  });
  commitCrime();
}

// ── Bullets Update ──────────────────────────────────────────────────────
export function updateBullets(dt) {
  // Player bullets
  for (let i = state.playerBullets.length - 1; i >= 0; i--) {
    const b = state.playerBullets[i];
    b.x += b.dx * dt; b.y += b.dy * dt; b.z += b.dz * dt;
    b.life -= dt;
    b.mesh.position.set(b.x, b.y, b.z);

    if (b.life <= 0) { scene.remove(b.mesh); state.playerBullets.splice(i, 1); continue; }

    for (const npc of state.npcs) {
      if (!npc.alive) continue;
      const dx = npc.x - b.x, dz = npc.z - b.z;
      if (dx * dx + dz * dz < 2) {
        npc.alive = false;
        npc.mesh.rotation.x = Math.PI / 2;
        npc.respawnTimer = 15;
        npc.aggressive = false;
        setTimeout(() => { npc.mesh.visible = false; }, 1000);
        scene.remove(b.mesh); state.playerBullets.splice(i, 1);
        registerCivilianKill(); break;
      }
    }

    for (let j = state.policeOfficers.length - 1; j >= 0; j--) {
      const cop = state.policeOfficers[j];
      const dx = cop.x - b.x, dz = cop.z - b.z;
      if (dx * dx + dz * dz < 2) {
        scene.remove(cop.mesh); state.policeOfficers.splice(j, 1);
        scene.remove(b.mesh); state.playerBullets.splice(i, 1);
        registerPoliceKill(); break;
      }
    }
  }

  // Police bullets
  for (let i = state.policeBullets.length - 1; i >= 0; i--) {
    const b = state.policeBullets[i];
    b.x += b.dx * dt; b.y += b.dy * dt; b.z += b.dz * dt;
    b.life -= dt;
    b.mesh.position.set(b.x, b.y, b.z);

    if (b.life <= 0) { scene.remove(b.mesh); state.policeBullets.splice(i, 1); continue; }

    const dx = state.player.x - b.x, dz = state.player.z - b.z;
    if (dx * dx + dz * dz < 2 && !state.isInVehicle) {
      state.health -= 15;
      scene.remove(b.mesh); state.policeBullets.splice(i, 1);
    }
  }
}

// ── Money Pickups Update ────────────────────────────────────────────────
export function updateMoneyPickups(dt) {
  const px = state.isInVehicle ? state.currentVehicle.x : state.player.x;
  const pz = state.isInVehicle ? state.currentVehicle.z : state.player.z;

  for (const pickup of state.moneyPickups) {
    if (!pickup.active) {
      pickup.respawnTimer -= dt;
      if (pickup.respawnTimer <= 0) {
        pickup.active = true;
        const pos = randomSidewalkPos();
        pickup.x = pos.x; pickup.z = pos.z;
        pickup.mesh.position.set(pos.x, 0.8, pos.z);
        pickup.mesh.visible = true;
      }
      continue;
    }
    pickup.mesh.rotation.y += dt * 2;
    pickup.mesh.position.y = 0.8 + Math.sin(state.elapsedTime * 3 + pickup.x) * 0.15;

    const dx = pickup.x - px, dz = pickup.z - pz;
    if (dx * dx + dz * dz < 4) {
      state.money += pickup.value;
      pickup.active = false;
      pickup.mesh.visible = false;
      pickup.respawnTimer = 30;
    }
  }
}

// ── Wanted Decay ────────────────────────────────────────────────────────
export function updateWanted(dt) {
  if (state.wantedLevel > 0) {
    state.wantedDecayTimer += dt;
    if (state.wantedDecayTimer >= 15) {
      state.wantedLevel = Math.max(0, state.wantedLevel - 1);
      state.wantedDecayTimer = 0;
    }
  }
}

// ── Death / WASTED ──────────────────────────────────────────────────────
export function updateDeath(dt) {
  if (state.isDead) {
    state.deathTimer -= dt;
    if (state.deathTimer <= 0) {
      state.isDead = false;
      state.health = 100;
      state.wantedLevel = 0;
      state.wantedDecayTimer = 0;
      state.money = Math.max(0, state.money - 100);
      state.hasGun = false;
      state.ragdoll.active = false;
      document.getElementById('weapon').innerHTML = '&#9994; FIST';
      document.getElementById('wasted-overlay').style.display = 'none';

      for (const cop of state.policeOfficers) scene.remove(cop.mesh);
      state.policeOfficers = [];
      for (const b of state.playerBullets) scene.remove(b.mesh);
      for (const b of state.policeBullets) scene.remove(b.mesh);
      state.playerBullets = []; state.policeBullets = [];
      if (state.helicopter) {
        scene.remove(state.helicopter.mesh);
        for (const m of state.helicopter.missiles) scene.remove(m.mesh);
        state.helicopter = null;
      }
      for (const tank of state.tanks) {
        for (const s of tank.shells) scene.remove(s.mesh);
        scene.remove(tank.mesh);
      }
      state.tanks = [];
      state.killCount = 0;
      state.policeKilled = 0;

      if (state.isInVehicle) { state.isInVehicle = false; state.currentVehicle = null; }
      state.player.x = 0; state.player.y = 0; state.player.z = 0;
      state.player.mesh.rotation.set(0, 0, 0);
      state.player.mesh.visible = true;
      state.player.mesh.position.set(0, 0, 0);
      state.camera.distance = 10;
    }
    return;
  }

  if (state.health <= 0) {
    state.health = 0;
    state.isDead = true;
    state.deathTimer = 3;
    document.getElementById('wasted-overlay').style.display = 'flex';
  }
}

// ── Radio Popup ─────────────────────────────────────────────────────────
export function showRadioPopup() {
  const station = RADIO_STATIONS[Math.floor(Math.random() * RADIO_STATIONS.length)];
  const popup = document.getElementById('radio-popup');
  popup.textContent = '📻 ' + station;
  popup.classList.add('show');
  state.radioVisible = true;
  state.radioTimer = 3;
}
