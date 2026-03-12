import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { VEH_MAX_HEALTH, EXPLOSION_DURATION } from './constants.js';

// Track active explosions, smoke emitters, and collision sparks
const activeExplosions = [];
const activeSmokeEmitters = [];
const activeCollisionSparks = [];

// ── Pre-allocated Particle Pools ────────────────────────────────────────
// All meshes created once at init; reused via visible toggle.
// Eliminates runtime geometry/material/shader-compile stalls.

const POOL_FIRE = 10;
const POOL_SPARK = 15;
const POOL_DEBRIS = 8;
const POOL_SMOKE = 16;
const POOL_LIGHT = 2;

const pool = { fire: [], spark: [], debris: [], smoke: [], light: [] };

export function initExplosionPool() {
  const fireGeo = new THREE.SphereGeometry(1, 6, 6);
  const sparkGeo = new THREE.SphereGeometry(1, 4, 4);
  const debrisGeo = new THREE.BoxGeometry(1, 1, 1);
  const smokeGeo = new THREE.SphereGeometry(0.15, 4, 4);

  for (let i = 0; i < POOL_FIRE; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xFF8800, transparent: true, opacity: 0 });
    const mesh = new THREE.Mesh(fireGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    pool.fire.push(mesh);
  }

  for (let i = 0; i < POOL_SPARK; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xFFAA00, transparent: true, opacity: 0 });
    const mesh = new THREE.Mesh(sparkGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    pool.spark.push(mesh);
  }

  for (let i = 0; i < POOL_DEBRIS; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xFF4400, transparent: true, opacity: 0 });
    const mesh = new THREE.Mesh(debrisGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    pool.debris.push(mesh);
  }

  for (let i = 0; i < POOL_SMOKE; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x444444, transparent: true, opacity: 0 });
    const mesh = new THREE.Mesh(smokeGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    pool.smoke.push(mesh);
  }

  for (let i = 0; i < POOL_LIGHT; i++) {
    const light = new THREE.PointLight(0xFF6600, 0, 30);
    // MUST stay visible at all times — toggling PointLight visibility
    // changes the light count, forcing every MeshStandardMaterial shader
    // in the scene to recompile (causes multi-second hang).
    // Toggle intensity instead.
    light._free = true;
    scene.add(light);
    pool.light.push(light);
  }
}

function acquire(arr) {
  for (const m of arr) {
    if (!m.visible) { m.visible = true; return m; }
  }
  return null; // pool exhausted, skip particle
}

function release(mesh) {
  mesh.visible = false;
  mesh.material.opacity = 0;
  mesh.scale.set(1, 1, 1);
  mesh.rotation.set(0, 0, 0);
}

// ── Apply Damage ────────────────────────────────────────────────────────
export function applyVehicleDamage(car, amount) {
  if (car.isExploded) return;

  car.health = Math.max(0, car.health - amount);

  const oldLevel = car.damageLevel;
  if (car.health <= 25) car.damageLevel = 3;
  else if (car.health <= 50) car.damageLevel = 2;
  else if (car.health <= 75) car.damageLevel = 1;
  else car.damageLevel = 0;

  if (car.damageLevel !== oldLevel) {
    updateDamageVisuals(car);
  }

  // Collision sparks on significant damage
  if (amount > 5) {
    spawnCollisionSparks(car);
  }

  if (car.health <= 0) {
    explodeVehicle(car);
  }
}

// ── Collision Sparks (pooled) ───────────────────────────────────────────
function spawnCollisionSparks(car) {
  for (let i = 0; i < 4; i++) {
    const s = acquire(pool.spark);
    if (!s) break;
    s.scale.set(0.06, 0.06, 0.06);
    s.material.color.set(Math.random() > 0.5 ? 0xFFAA00 : 0xFFDD44);
    s.material.opacity = 1;
    s.position.copy(car.mesh.position);
    s.position.y += 0.8;
    s.position.x += (Math.random() - 0.5) * 2;
    s.position.z += (Math.random() - 0.5) * 2;
    s.userData = {
      vx: (Math.random() - 0.5) * 15,
      vy: 3 + Math.random() * 8,
      vz: (Math.random() - 0.5) * 15,
      life: 0.3 + Math.random() * 0.2
    };
    activeCollisionSparks.push(s);
  }
}

// ── Visual Degradation ──────────────────────────────────────────────────
function updateDamageVisuals(car) {
  const level = car.damageLevel;
  const origColor = new THREE.Color(car.originalColor);

  if (level >= 1) {
    const darken = 1 - level * 0.2;
    car.bodyMaterial.color.set(origColor).multiplyScalar(darken);
  }

  if (level >= 2) {
    detachPart(car, 'fBumper');
    detachPart(car, 'lMirror');
  }

  if (level >= 3) {
    detachPart(car, 'rBumper');
    detachPart(car, 'rMirror');
    detachPart(car, 'antenna');

    if (!car.smokeEmitter) {
      startSmoke(car);
    }
  }
}

// ── Detach Part ─────────────────────────────────────────────────────────
function detachPart(car, partName) {
  const part = car.detachableParts[partName];
  if (!part || !part.parent) return;
  part.parent.remove(part);
}

// ── Smoke System (pooled) ────────────────────────────────────────────────
function startSmoke(car) {
  const particles = [];
  for (let i = 0; i < 8; i++) {
    const p = acquire(pool.smoke);
    if (!p) break;
    p.material.color.set(0x444444);
    p.material.opacity = 0.6;
    p.scale.set(1, 1, 1);
    p.userData = {
      offsetX: (Math.random() - 0.5) * 0.8,
      offsetZ: 1.5 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
      speed: 1 + Math.random() * 2,
      t: Math.random()
    };
    particles.push(p);
  }
  car.smokeEmitter = { particles };
  activeSmokeEmitters.push(car);
}

function updateSmoke(car, dt) {
  if (!car.smokeEmitter) return;

  const carPos = car.mesh.position;
  for (const p of car.smokeEmitter.particles) {
    const d = p.userData;
    d.t += dt * d.speed;
    if (d.t > 1) d.t -= 1;

    const sinR = Math.sin(car.rotation || 0);
    const cosR = Math.cos(car.rotation || 0);
    const worldX = carPos.x + d.offsetX * cosR - d.offsetZ * sinR;
    const worldZ = carPos.z + d.offsetX * sinR + d.offsetZ * cosR;

    p.position.set(
      worldX + Math.sin(d.phase + d.t * 4) * 0.3,
      carPos.y + 1.5 + d.t * 3,
      worldZ + Math.cos(d.phase + d.t * 4) * 0.3
    );

    const scale = 0.3 + d.t * 1.5;
    p.scale.set(scale, scale, scale);
    p.material.opacity = 0.5 * (1 - d.t);
  }
}

// ── Explode Vehicle (pooled particles) ──────────────────────────────────
export function explodeVehicle(car) {
  if (car.isExploded) return;
  car.isExploded = true;
  car.speed = 0;
  car.health = 0;

  car.bodyMaterial.color.set(0x111111);

  // Fire cluster — pooled spheres, varied via scale + color
  const fireParticles = [];
  const fireColors = [0xFFDD44, 0xFF8800, 0xFF4400];
  for (let i = 0; i < 4; i++) {
    const p = acquire(pool.fire);
    if (!p) break;
    const r = 0.4 + Math.random() * 0.4;
    p.scale.set(r, r, r);
    p.material.color.set(fireColors[i % fireColors.length]);
    p.material.opacity = 0.9;
    p.position.copy(car.mesh.position);
    p.position.y += 1 + Math.random() * 1;
    p.position.x += (Math.random() - 0.5) * 1.5;
    p.position.z += (Math.random() - 0.5) * 1.5;
    p.userData = {
      vx: (Math.random() - 0.5) * 6,
      vy: 3 + Math.random() * 5,
      vz: (Math.random() - 0.5) * 6,
      growRate: 1.5 + Math.random() * 1.5,
      fadeDelay: Math.random() * 0.2
    };
    fireParticles.push(p);
  }

  // Explosion sparks — pooled
  const sparks = [];
  for (let i = 0; i < 5; i++) {
    const s = acquire(pool.spark);
    if (!s) break;
    s.scale.set(0.08, 0.08, 0.08);
    s.material.color.set(Math.random() > 0.5 ? 0xFFAA00 : 0xFFDD44);
    s.material.opacity = 1;
    s.position.copy(car.mesh.position);
    s.position.y += 1;
    s.userData = {
      vx: (Math.random() - 0.5) * 18,
      vy: 4 + Math.random() * 10,
      vz: (Math.random() - 0.5) * 18,
      life: 0.3 + Math.random() * 0.2
    };
    sparks.push(s);
  }

  // Debris — pooled boxes
  const debris = [];
  for (let i = 0; i < 3; i++) {
    const d = acquire(pool.debris);
    if (!d) break;
    const sx = 0.2 + Math.random() * 0.2;
    const sy = 0.1 + Math.random() * 0.15;
    const sz = 0.2 + Math.random() * 0.2;
    d.scale.set(sx, sy, sz);
    d.material.color.set(Math.random() > 0.5 ? 0xFF4400 : 0x333333);
    d.material.opacity = 1;
    d.rotation.set(0, 0, 0);
    d.position.copy(car.mesh.position);
    d.position.y += 1;
    d.userData = {
      vx: (Math.random() - 0.5) * 14,
      vy: 6 + Math.random() * 8,
      vz: (Math.random() - 0.5) * 14,
      rotX: (Math.random() - 0.5) * 8,
      rotZ: (Math.random() - 0.5) * 8
    };
    debris.push(d);
  }

  // Point light flash — pooled (never toggle visible, only intensity)
  let light = null;
  for (const l of pool.light) {
    if (l._free) {
      light = l;
      l._free = false;
      l.intensity = 5;
      l.position.copy(car.mesh.position);
      l.position.y += 2;
      break;
    }
  }

  const explosion = { fireParticles, debris, sparks, light, timer: EXPLOSION_DURATION, car };
  car.explosion = explosion;
  activeExplosions.push(explosion);

  // Camera shake
  state.cameraShake.intensity = 2.5;
  state.cameraShake.timer = 2.0;

  // If player's car, eject
  if (state.isInVehicle && state.currentVehicle === car) {
    ejectPlayerFromVehicle(car);
  }
}

// ── Eject Player ────────────────────────────────────────────────────────
function ejectPlayerFromVehicle(car) {
  const ejectAngle = car.rotation + Math.PI / 2;
  state.player.x = car.x + Math.sin(ejectAngle) * 4;
  state.player.z = car.z + Math.cos(ejectAngle) * 4;
  state.player.y = 0;
  state.player.mesh.visible = true;
  state.player.mesh.position.set(state.player.x, 0, state.player.z);
  state.isInVehicle = false;
  state.currentVehicle = null;
  state.camera.distance = 10;

  const { triggerRagdoll } = require_triggerRagdoll();
  const awayX = Math.sin(ejectAngle) * 12;
  const awayZ = Math.cos(ejectAngle) * 12;
  triggerRagdoll(awayX, 0, awayZ, false);
  state.health -= 30;
}

// Lazy import to avoid circular dependency
let _triggerRagdoll = null;
function require_triggerRagdoll() {
  if (!_triggerRagdoll) {
    // Will be set via setter
  }
  return { triggerRagdoll: _triggerRagdoll };
}

export function setTriggerRagdoll(fn) {
  _triggerRagdoll = fn;
}

// ── Update All Explosions, Smoke & Sparks ───────────────────────────────
export function updateExplosions(dt) {
  const GRAVITY = -30;

  // Update explosions
  for (let i = activeExplosions.length - 1; i >= 0; i--) {
    const e = activeExplosions[i];
    e.timer -= dt;

    const progress = 1 - (e.timer / EXPLOSION_DURATION);

    // Fire particles
    if (e.fireParticles) {
      for (let j = e.fireParticles.length - 1; j >= 0; j--) {
        const p = e.fireParticles[j];
        const ud = p.userData;
        p.position.x += ud.vx * dt;
        p.position.y += ud.vy * dt;
        p.position.z += ud.vz * dt;
        ud.vy -= 5 * dt;

        const s = p.scale.x * (1 + progress * ud.growRate * dt * 2);
        p.scale.set(s, s, s);

        const fadeStart = ud.fadeDelay / EXPLOSION_DURATION;
        const fadeProgress = Math.max(0, progress - fadeStart) / (1 - fadeStart);
        p.material.opacity = Math.max(0, 0.9 - fadeProgress * 1.2);

        if (p.material.opacity <= 0) {
          release(p);
          e.fireParticles.splice(j, 1);
        }
      }
    }

    // Explosion sparks
    if (e.sparks) {
      for (let j = e.sparks.length - 1; j >= 0; j--) {
        const s = e.sparks[j];
        const ud = s.userData;
        s.position.x += ud.vx * dt;
        s.position.y += ud.vy * dt;
        s.position.z += ud.vz * dt;
        ud.vy += GRAVITY * dt;
        ud.life -= dt;
        s.material.opacity = Math.max(0, ud.life / 0.5);

        if (ud.life <= 0 || s.position.y < 0) {
          release(s);
          e.sparks.splice(j, 1);
        }
      }
    }

    // Debris physics
    for (let j = e.debris.length - 1; j >= 0; j--) {
      const d = e.debris[j];
      const ud = d.userData;
      d.position.x += ud.vx * dt;
      d.position.y += ud.vy * dt;
      d.position.z += ud.vz * dt;
      ud.vy += GRAVITY * dt;
      d.rotation.x += ud.rotX * dt;
      d.rotation.z += ud.rotZ * dt;

      if (d.position.y < 0) {
        d.position.y = 0;
        ud.vy = Math.abs(ud.vy) * 0.2;
        ud.vx *= 0.5;
        ud.vz *= 0.5;
      }

      d.material.opacity = Math.max(0, 1 - progress * 1.2);
      if (d.material.opacity <= 0) {
        release(d);
        e.debris.splice(j, 1);
      }
    }

    // Light decay
    if (e.light) {
      e.light.intensity = Math.max(0, 5 * (1 - progress * 2));
      if (e.light.intensity <= 0) {
        e.light._free = true;
        e.light = null;
      }
    }

    // Cleanup finished explosion
    if (e.timer <= 0) {
      if (e.fireParticles) for (const p of e.fireParticles) release(p);
      if (e.sparks) for (const s of e.sparks) release(s);
      if (e.light) { e.light.intensity = 0; e.light._free = true; e.light = null; }
      for (const d of e.debris) release(d);
      // Release smoke particles
      if (e.car.smokeEmitter) {
        for (const p of e.car.smokeEmitter.particles) release(p);
        e.car.smokeEmitter = null;
        const idx = activeSmokeEmitters.indexOf(e.car);
        if (idx >= 0) activeSmokeEmitters.splice(idx, 1);
      }
      activeExplosions.splice(i, 1);
    }
  }

  // Update collision sparks
  for (let i = activeCollisionSparks.length - 1; i >= 0; i--) {
    const s = activeCollisionSparks[i];
    const ud = s.userData;
    s.position.x += ud.vx * dt;
    s.position.y += ud.vy * dt;
    s.position.z += ud.vz * dt;
    ud.vy += GRAVITY * dt;
    ud.life -= dt;
    s.material.opacity = Math.max(0, ud.life / 0.5);

    if (ud.life <= 0 || s.position.y < 0) {
      release(s);
      activeCollisionSparks.splice(i, 1);
    }
  }

  // Update smoke emitters
  for (const car of activeSmokeEmitters) {
    updateSmoke(car, dt);
  }
}
