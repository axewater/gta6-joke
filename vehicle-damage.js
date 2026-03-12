import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { VEH_MAX_HEALTH, EXPLOSION_DURATION } from './constants.js';

// Track active explosions and smoke emitters globally
const activeExplosions = [];
const activeSmokeEmitters = [];

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

  if (car.health <= 0) {
    explodeVehicle(car);
  }
}

// ── Visual Degradation ──────────────────────────────────────────────────
function updateDamageVisuals(car) {
  const level = car.damageLevel;
  const origColor = new THREE.Color(car.originalColor);

  if (level >= 1) {
    // Darken body 20%
    const darken = 1 - level * 0.2;
    car.bodyMaterial.color.set(origColor).multiplyScalar(darken);
  }

  if (level >= 2) {
    // Detach front bumper + left mirror
    detachPart(car, 'fBumper');
    detachPart(car, 'lMirror');
  }

  if (level >= 3) {
    // Detach remaining parts
    detachPart(car, 'rBumper');
    detachPart(car, 'rMirror');
    detachPart(car, 'antenna');

    // Start smoke if not already
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

// ── Smoke System ────────────────────────────────────────────────────────
function startSmoke(car) {
  const particles = [];
  for (let i = 0; i < 8; i++) {
    const geo = new THREE.SphereGeometry(0.15, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.6 });
    const p = new THREE.Mesh(geo, mat);
    p.userData = {
      offsetX: (Math.random() - 0.5) * 0.8,
      offsetZ: 1.5 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
      speed: 1 + Math.random() * 2,
      t: Math.random()  // stagger start
    };
    scene.add(p);
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

    // Rise from hood area
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

// ── Explode Vehicle ─────────────────────────────────────────────────────
export function explodeVehicle(car) {
  if (car.isExploded) return;
  car.isExploded = true;
  car.speed = 0;
  car.health = 0;

  // Char car body to black
  car.bodyMaterial.color.set(0x111111);

  // Explosion sphere
  const sphereGeo = new THREE.SphereGeometry(1, 8, 8);
  const sphereMat = new THREE.MeshBasicMaterial({ color: 0xFF6600, transparent: true, opacity: 0.9 });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  sphere.position.copy(car.mesh.position);
  sphere.position.y += 1.5;
  scene.add(sphere);

  // Debris particles
  const debris = [];
  for (let i = 0; i < 15; i++) {
    const dGeo = new THREE.BoxGeometry(0.2 + Math.random() * 0.3, 0.1 + Math.random() * 0.2, 0.2 + Math.random() * 0.3);
    const dMat = new THREE.MeshBasicMaterial({
      color: Math.random() > 0.5 ? 0xFF4400 : 0x333333,
      transparent: true, opacity: 1
    });
    const d = new THREE.Mesh(dGeo, dMat);
    d.position.copy(car.mesh.position);
    d.position.y += 1;
    d.userData = {
      vx: (Math.random() - 0.5) * 20,
      vy: 8 + Math.random() * 12,
      vz: (Math.random() - 0.5) * 20,
      rotX: (Math.random() - 0.5) * 10,
      rotZ: (Math.random() - 0.5) * 10
    };
    scene.add(d);
    debris.push(d);
  }

  // Point light flash
  const light = new THREE.PointLight(0xFF6600, 5, 30);
  light.position.copy(car.mesh.position);
  light.position.y += 2;
  scene.add(light);

  const explosion = { sphere, debris, light, timer: EXPLOSION_DURATION, car };
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
  // Place player beside car
  const ejectAngle = car.rotation + Math.PI / 2;
  state.player.x = car.x + Math.sin(ejectAngle) * 4;
  state.player.z = car.z + Math.cos(ejectAngle) * 4;
  state.player.y = 0;
  state.player.mesh.visible = true;
  state.player.mesh.position.set(state.player.x, 0, state.player.z);
  state.isInVehicle = false;
  state.currentVehicle = null;
  state.camera.distance = 10;

  // Trigger player ragdoll away from explosion
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

// ── Update All Explosions & Smoke ───────────────────────────────────────
export function updateExplosions(dt) {
  const GRAVITY = -30;

  // Update explosions
  for (let i = activeExplosions.length - 1; i >= 0; i--) {
    const e = activeExplosions[i];
    e.timer -= dt;

    const progress = 1 - (e.timer / EXPLOSION_DURATION);

    // Expand sphere then fade
    if (e.sphere) {
      const s = 1 + progress * 6;
      e.sphere.scale.set(s, s, s);
      e.sphere.material.opacity = Math.max(0, 0.9 - progress * 1.5);
      if (e.sphere.material.opacity <= 0) {
        scene.remove(e.sphere);
        e.sphere = null;
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
        scene.remove(d);
        e.debris.splice(j, 1);
      }
    }

    // Light decay
    if (e.light) {
      e.light.intensity = Math.max(0, 5 * (1 - progress * 2));
      if (e.light.intensity <= 0) {
        scene.remove(e.light);
        e.light = null;
      }
    }

    // Cleanup finished explosion
    if (e.timer <= 0) {
      if (e.sphere) scene.remove(e.sphere);
      if (e.light) scene.remove(e.light);
      for (const d of e.debris) scene.remove(d);
      activeExplosions.splice(i, 1);
    }
  }

  // Update smoke emitters
  for (const car of activeSmokeEmitters) {
    updateSmoke(car, dt);
  }
}
