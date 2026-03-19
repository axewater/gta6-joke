import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import {
  GRAVITY, PLAYER_SPEED, SPRINT_MULT, JUMP_FORCE,
  RADIO_STATIONS, HALF_CITY, CAR_BUILDING_DAMAGE_MIN_SPEED, CAR_BUILDING_DAMAGE_MULT,
  WORLD_SCALE
} from './constants.js';
import { collideAABB } from './physics.js';
import { randomSidewalkPos } from './city.js';
import { spawnTrafficCar } from './vehicles.js';
import { applyVehicleDamage } from './vehicle-damage.js';
import { playerBulletPool, policeBulletPool, gangBulletPool, tireSmokePool, tankShellPool, missilePool, idleSmokePool } from './object-pool.js';

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

  const corrected = collideAABB(p.x, p.z, 0.25, 0.15);
  p.x = corrected.x; p.z = corrected.z;

  // Drowning in ocean
  if (p.z > HALF_CITY + 72 * WORLD_SCALE) {
    state.health -= 30 * dt;
  }

  p.mesh.position.set(p.x, p.y, p.z);

  const curRotY = len > 0.1 ? Math.atan2(moveX, moveZ) : p.mesh.rotation.y;
  if (len > 0.1) {
    p.mesh.rotation.y = curRotY;
  }

  const isSprinting = sprint > 1;
  const isMoving = len > 0.1;

  // ── Enhanced walking/running animation ──────────────────────────────
  if (isMoving) {
    // Cancel idle
    cancelIdleAnimation(p);

    p.legPhase += dt * speed * 1.5;
    const legAmp = isSprinting ? 0.7 : 0.5;
    const swing = Math.sin(p.legPhase) * legAmp;
    p.leftLeg.rotation.x = swing;
    p.rightLeg.rotation.x = -swing;
    const armAmp = isSprinting ? 0.7 : 0.5;
    p.leftArm.rotation.x = -swing * (armAmp / legAmp) * 0.6;
    p.rightArm.rotation.x = swing * (armAmp / legAmp) * 0.6;

    // Arm spread while running
    const armSpreadZ = isSprinting ? 0.15 : 0.05;
    p.leftArm.rotation.z = armSpreadZ;
    p.rightArm.rotation.z = -armSpreadZ;

    // Body bob
    const bobAmt = isSprinting ? 0.06 : 0.03;
    p.mesh.position.y = p.y + Math.abs(Math.sin(p.legPhase * 2)) * bobAmt;

    // Sprint forward lean
    if (p.bodyGroup) {
      p.bodyGroup.rotation.x = isSprinting ? 0.12 : 0;
    }

    // Torso lean on turns
    if (p.bodyGroup) {
      if (p.prevRotY === undefined) p.prevRotY = curRotY;
      let rotDelta = curRotY - p.prevRotY;
      while (rotDelta > Math.PI) rotDelta -= 2 * Math.PI;
      while (rotDelta < -Math.PI) rotDelta += 2 * Math.PI;
      const targetLean = -Math.max(-0.15, Math.min(0.15, rotDelta * 3));
      p.bodyGroup.rotation.z += (targetLean - p.bodyGroup.rotation.z) * Math.min(1, dt * 8);
      p.prevRotY = curRotY;
    }
  } else {
    // ── Idle animation ────────────────────────────────────────────────
    p.leftLeg.rotation.x = 0; p.rightLeg.rotation.x = 0;
    p.leftArm.rotation.x = 0; p.rightArm.rotation.x = 0;
    p.leftArm.rotation.z = 0; p.rightArm.rotation.z = 0;
    if (p.bodyGroup) {
      p.bodyGroup.rotation.x = 0;
      p.bodyGroup.rotation.z = 0;
    }
    p.mesh.position.y = p.y;

    updateIdleAnimation(p, dt);
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

// ── Idle Animation System ──────────────────────────────────────────────
function cancelIdleAnimation(p) {
  if (!p.idle) return;
  const idle = p.idle;

  // Clean up cigarette
  if (idle.cigMesh) {
    idle.cigMesh.parent && idle.cigMesh.parent.remove(idle.cigMesh);
    idle.cigMesh.geometry.dispose();
    idle.cigMesh = null;
  }
  if (idle.cigGlowMesh) {
    idle.cigGlowMesh.parent && idle.cigGlowMesh.parent.remove(idle.cigGlowMesh);
    idle.cigGlowMesh.geometry.dispose();
    idle.cigGlowMesh = null;
  }

  // Clean up smoke particles
  for (const sp of idle.smokeParticles) {
    idleSmokePool.release(sp);
  }
  idle.smokeParticles = [];

  // Reset state
  idle.timer = 0;
  idle.phase = 'none';
  idle.smokePhase = 'none';
  idle.smokeTimer = 0;
  idle.loopCount = 0;
  idle.breathPhase = 0;
  idle.weightPhase = 0;
  idle.headLookTimer = 0;

  // Reset body rotations
  p.mesh.rotation.z = 0;
  if (p.bodyGroup) {
    p.bodyGroup.scale.y = 1;
    p.bodyGroup.rotation.z = 0;
  }
  if (p.neckPivot) {
    p.neckPivot.rotation.y = 0;
    p.neckPivot.rotation.x = 0;
  }
}

function updateIdleAnimation(p, dt) {
  if (!p.idle) return;
  const idle = p.idle;
  idle.timer += dt;

  // ── Layer 1: Breathing + weight shift + head look (always active) ──
  idle.breathPhase += dt * 1.5 * Math.PI * 2;
  if (p.bodyGroup) {
    p.bodyGroup.scale.y = 1 + Math.sin(idle.breathPhase) * 0.015;
  }

  idle.weightPhase += dt * 0.4;
  p.mesh.rotation.z = Math.sin(idle.weightPhase) * 0.03;

  // Head look-around
  idle.headLookTimer -= dt;
  if (idle.headLookTimer <= 0) {
    idle.headLookTimer = 2 + Math.random() * 4;
    idle.headTargetY = (Math.random() - 0.5) * 2.4;
    idle.headTargetX = Math.random() < 0.2 ? -0.15 : 0;
  }
  if (p.neckPivot) {
    p.neckPivot.rotation.y += (idle.headTargetY - p.neckPivot.rotation.y) * Math.min(1, dt * 2);
    p.neckPivot.rotation.x += (idle.headTargetX - p.neckPivot.rotation.x) * Math.min(1, dt * 2);
  }

  // ── Layer 2: Smoking sequence (starts at 15s idle) ─────────────────
  if (idle.timer < 15) return;

  if (idle.smokePhase === 'none') {
    idle.smokePhase = 'pullCig';
    idle.smokeTimer = 0;
  }

  idle.smokeTimer += dt;

  switch (idle.smokePhase) {
    case 'pullCig': {
      // Right arm reaches to pocket, cig spawns at 0.4s
      const t = Math.min(idle.smokeTimer / 0.8, 1);
      if (t < 0.5) {
        p.rightArm.rotation.x = 0.3 * (t / 0.5);
      } else {
        p.rightArm.rotation.x = 0.3 * (1 - (t - 0.5) / 0.5);
      }
      if (idle.smokeTimer >= 0.4 && !idle.cigMesh && p.rightHand) {
        const cigGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.2, 4);
        cigGeo.rotateX(Math.PI / 2);
        const cigMat = new THREE.MeshStandardMaterial({ color: 0xddccaa, roughness: 0.8 });
        idle.cigMesh = new THREE.Mesh(cigGeo, cigMat);
        idle.cigMesh.position.set(0, -0.05, 0.1);
        p.rightHand.add(idle.cigMesh);

        const glowGeo = new THREE.SphereGeometry(0.02, 4, 4);
        const glowMat = new THREE.MeshStandardMaterial({
          color: 0xff4400, emissive: 0xff4400, emissiveIntensity: 1.0
        });
        idle.cigGlowMesh = new THREE.Mesh(glowGeo, glowMat);
        idle.cigGlowMesh.position.set(0, -0.05, 0.2);
        idle.cigGlowMesh.visible = false;
        p.rightHand.add(idle.cigGlowMesh);
      }
      if (idle.smokeTimer >= 0.8) {
        idle.smokePhase = 'lightCig';
        idle.smokeTimer = 0;
      }
      break;
    }

    case 'lightCig': {
      // Left arm cups lighter, right brings cig to mouth
      const t = Math.min(idle.smokeTimer / 1.2, 1);
      p.leftArm.rotation.x = -0.8 * t;
      p.leftArm.rotation.z = 0.3 * t;
      p.rightArm.rotation.x = -1.2 * t;

      if (idle.smokeTimer >= 0.3 && idle.cigGlowMesh) {
        idle.cigGlowMesh.visible = true;
        const glowProgress = (idle.smokeTimer - 0.3) / 0.9;
        idle.cigGlowMesh.material.emissiveIntensity = 3.0 - glowProgress * 2.0;
      }
      if (idle.smokeTimer >= 1.2) {
        p.leftArm.rotation.x = 0;
        p.leftArm.rotation.z = 0;
        idle.smokePhase = 'smoking';
        idle.smokeTimer = 0;
        idle.loopCount = 0;
        idle.maxLoops = 3 + Math.floor(Math.random() * 3);
        idle.pauseDuration = 1 + Math.random();
      }
      break;
    }

    case 'smoking': {
      // Loop 3-5x, each cycle 4-6s: drag (1.5s) → exhale (2s) → pause (1-2s)
      const maxLoops = idle.maxLoops || 4;
      const cycleTime = idle.smokeTimer;

      if (cycleTime < 1.5) {
        // Drag — raise cig to mouth, brighten ember
        const t = cycleTime / 1.5;
        p.rightArm.rotation.x = -1.2 * t;
        if (idle.cigGlowMesh) {
          idle.cigGlowMesh.material.emissiveIntensity = 1.0 + t * 1.5;
        }
      } else if (cycleTime < 3.5) {
        // Exhale — arm lowers, spawn smoke
        const t = (cycleTime - 1.5) / 2.0;
        p.rightArm.rotation.x = -1.2 * (1 - t);
        if (idle.cigGlowMesh) {
          idle.cigGlowMesh.material.emissiveIntensity = 1.0;
        }

        // Spawn smoke particles (staggered)
        if (t < 0.5 && p.neckPivot) {
          const spawnInterval = 0.08;
          const spawnCount = Math.floor(t / (spawnInterval / 2.0));
          while (idle.smokeParticles.length < Math.min(spawnCount, 8)) {
            const sp = idleSmokePool.acquire();
            if (!sp) break;
            // Position at mouth
            const worldPos = new THREE.Vector3();
            p.neckPivot.getWorldPosition(worldPos);
            worldPos.y -= 0.1;
            worldPos.z += 0.2;
            sp.position.copy(worldPos);
            sp.scale.set(0.5, 0.5, 0.5);
            sp.material.opacity = 0.4;
            sp.userData = {
              vx: (Math.random() - 0.5) * 0.3,
              vy: 0.3 + Math.random() * 0.3,
              vz: (Math.random() - 0.5) * 0.3,
              life: 1.5
            };
            idle.smokeParticles.push(sp);
          }
        }
      } else {
        // Pause
        p.rightArm.rotation.x = 0;
        const pauseDuration = idle.pauseDuration || 1.5;
        if (cycleTime >= 3.5 + pauseDuration) {
          idle.smokeTimer = 0;
          idle.pauseDuration = 1 + Math.random();
          idle.loopCount++;
          if (idle.loopCount >= maxLoops) {
            idle.smokePhase = 'discardCig';
            idle.smokeTimer = 0;
          }
        }
      }
      break;
    }

    case 'discardCig': {
      // Flick motion + stomp
      const t = Math.min(idle.smokeTimer / 1.5, 1);
      if (t < 0.3) {
        // Flick
        p.rightArm.rotation.z = -0.5 * (t / 0.3);
      } else if (t < 0.4 && idle.cigMesh) {
        // Detach cig
        if (idle.cigMesh.parent) {
          idle.cigMesh.parent.remove(idle.cigMesh);
          idle.cigMesh.geometry.dispose();
          idle.cigMesh = null;
        }
        if (idle.cigGlowMesh && idle.cigGlowMesh.parent) {
          idle.cigGlowMesh.parent.remove(idle.cigGlowMesh);
          idle.cigGlowMesh.geometry.dispose();
          idle.cigGlowMesh = null;
        }
        p.rightArm.rotation.z = 0;
      }
      if (t > 0.5 && t < 0.8) {
        // Stomp
        p.rightLeg.rotation.x = -0.3 * Math.sin((t - 0.5) / 0.3 * Math.PI);
      }
      if (idle.smokeTimer >= 1.5) {
        p.rightArm.rotation.z = 0;
        p.rightLeg.rotation.x = 0;
        idle.smokePhase = 'none';
        idle.smokeTimer = 0;
        idle.timer = 0; // restart full idle cycle
      }
      break;
    }
  }

  // Update existing smoke particles
  for (let i = idle.smokeParticles.length - 1; i >= 0; i--) {
    const sp = idle.smokeParticles[i];
    const ud = sp.userData;
    sp.position.x += ud.vx * dt;
    sp.position.y += ud.vy * dt;
    sp.position.z += ud.vz * dt;
    ud.vx += (Math.random() - 0.5) * 0.5 * dt; // wander
    ud.life -= dt;
    const s = sp.scale.x + dt * 0.5;
    sp.scale.set(s, s, s);
    sp.material.opacity = Math.max(0, 0.4 * (ud.life / 1.5));
    if (ud.life <= 0) {
      idleSmokePool.release(sp);
      idle.smokeParticles.splice(i, 1);
    }
  }
}

// ── Update Vehicle ──────────────────────────────────────────────────────
export function updateVehicle(dt) {
  if (state.isDead) return;
  const v = state.currentVehicle;
  if (v.isExploded) return;
  const k = state.keys;

  // Use per-vehicle physics
  const vMaxSpeed = v.maxSpeed;
  const vAccel = v.accel;
  const vBrake = v.brake;
  const vFriction = v.friction;
  const vTurn = v.turnRate;
  const vGrip = v.grip;

  if (k['KeyW']) v.speed = Math.min(v.speed + vAccel * dt, vMaxSpeed);
  else if (k['KeyS']) v.speed = Math.max(v.speed - vBrake * dt, -vMaxSpeed * 0.4);
  else {
    if (Math.abs(v.speed) < 0.5) v.speed = 0;
    else v.speed -= Math.sign(v.speed) * vFriction * dt;
  }

  if (Math.abs(v.speed) > 0.5) {
    const turnFactor = vTurn * (v.speed / vMaxSpeed);
    if (k['KeyA']) v.rotation += turnFactor * dt;
    if (k['KeyD']) v.rotation -= turnFactor * dt;
  }

  const impactSpeed = Math.abs(v.speed);

  // Drift mechanic — velocity angle lags behind facing angle based on grip
  if (v.velocityAngle === undefined) v.velocityAngle = v.rotation;

  let angleDiff = v.rotation - v.velocityAngle;
  while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
  while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

  const gripLerp = 1 - Math.pow(1 - vGrip, dt * 10);
  v.velocityAngle += angleDiff * gripLerp;

  v.x += Math.sin(v.velocityAngle) * v.speed * dt;
  v.z += Math.cos(v.velocityAngle) * v.speed * dt;

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
  if (v.z > HALF_CITY + 72 * WORLD_SCALE) {
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

  // Tire smoke on hard braking, sharp turning, or drifting
  const isBraking = k['KeyS'] && Math.abs(v.speed) > 8;
  const isTurning = (k['KeyA'] || k['KeyD']) && Math.abs(v.speed) > 12;
  const isDrifting = Math.abs(angleDiff) > 0.15 && Math.abs(v.speed) > 10;
  if ((isBraking || isTurning || isDrifting) && !v.airborne && Math.random() < (isDrifting ? 0.6 : 0.3)) {
    const sinR = Math.sin(v.rotation);
    const cosR = Math.cos(v.rotation);
    const rearX = v.x - sinR * 2;
    const rearZ = v.z - cosR * 2;
    const p = tireSmokePool.acquire();
    if (p) {
      p.position.set(rearX + (Math.random() - 0.5) * 1.5, 0.3, rearZ + (Math.random() - 0.5) * 1.5);
      p.scale.set(1, 1, 1);
      p.material.opacity = 0.5;
      p.userData = { life: 0.8, maxLife: 0.8 };
      state.tireSmokeParticles.push(p);
    }
  }
}

// updateTireSmoke moved to tireSmokeSystem in systems.js

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
    state.camera.distance = 6;
  } else {
    let nearest = null, nearestDist = 5.5, isCarjack = false;

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
      state.camera.distance = 9;
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

  // Also check gang NPCs for punch
  let closestGang = null, closestGangDist = 2.5;
  for (const gnpc of state.gangNpcs) {
    if (gnpc.dead) continue;
    if (gnpc.ragdoll && gnpc.ragdoll.active) continue;
    const dx = gnpc.x - p.x, dz = gnpc.z - p.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > closestGangDist) continue;
    const dot = fwd.x * (dx / dist) + fwd.z * (dz / dist);
    if (dot > 0.3) { closestGangDist = dist; closestGang = gnpc; }
  }
  if (closestGang) {
    closestGang.dead = true;
    closestGang.mesh.rotation.x = Math.PI / 2;
    closestGang.respawnTimer = 15;
    registerCivilianKill();
    setTimeout(() => { closestGang.mesh.visible = false; }, 1000);
  }
}

// ── Shoot ───────────────────────────────────────────────────────────────
export function handleShoot() {
  if (state.shootCooldown > 0) return;
  state.shootCooldown = 0.25;

  const p = state.player;
  const dir = new THREE.Vector3(0, 0, -1);
  dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), state.camera.theta);

  const bullet = playerBulletPool.acquire();
  if (!bullet) return;
  bullet.position.set(p.x, p.y + 1.5, p.z);
  bullet.scale.set(1, 1, 1);

  state.playerBullets.push({
    mesh: bullet,
    x: p.x, y: p.y + 1.5, z: p.z,
    dx: dir.x * 80, dy: 0, dz: dir.z * 80,
    life: 2.0
  });
  commitCrime();
}

// updateBullets moved to playerBulletSystem + policeBulletSystem in systems.js

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
      for (const b of state.playerBullets) playerBulletPool.release(b.mesh);
      for (const b of state.policeBullets) policeBulletPool.release(b.mesh);
      for (const b of state.gangBullets) gangBulletPool.release(b.mesh);
      state.playerBullets = []; state.policeBullets = []; state.gangBullets = [];
      if (state.helicopter) {
        scene.remove(state.helicopter.mesh);
        state.helicopter = null;
      }
      for (const m of state.heliMissiles) missilePool.release(m.mesh);
      state.heliMissiles = [];
      for (const s of state.tankShells) tankShellPool.release(s.mesh);
      state.tankShells = [];
      for (const tank of state.tanks) {
        scene.remove(tank.mesh);
      }
      state.tanks = [];
      state.killCount = 0;
      state.policeKilled = 0;

      if (state.isInVehicle) { state.isInVehicle = false; state.currentVehicle = null; }
      cancelIdleAnimation(state.player);
      state.player.x = 86; state.player.y = 0; state.player.z = 86;
      state.player.mesh.rotation.set(0, 0, 0);
      state.player.mesh.visible = true;
      state.player.mesh.position.set(86, 0, 86);
      state.camera.distance = 6;
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
