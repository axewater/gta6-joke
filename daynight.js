import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { BLOOM_STRENGTH_DAY, BLOOM_STRENGTH_NIGHT, CITY_SIZE } from './constants.js';

export function updateDayNight(dt) {
  // 60 real seconds = 1 game day
  state.gameTime += dt / 60;
  if (state.gameTime >= 1) state.gameTime -= 1;

  const t = state.gameTime;

  // Sun orbit
  const sunAngle = t * Math.PI * 2 - Math.PI / 2;
  const sunY = Math.sin(sunAngle) * 120;
  const sunXZ = Math.cos(sunAngle) * 150;
  state.sun.position.set(sunXZ, Math.max(sunY, -20), 80);
  state.sun.intensity = Math.max(0, Math.min(1.5, sunY / 60));

  const nightColor = new THREE.Color(0x05030f);  // deep purple night
  const sunsetColor = new THREE.Color(0xFFA062);
  const dayColor = new THREE.Color(0x87ceeb);

  let skyColor;
  if (t < 0.2 || t > 0.8) {
    skyColor = nightColor.clone();
  } else if (t < 0.3) {
    const f = (t - 0.2) / 0.1;
    skyColor = nightColor.clone().lerp(sunsetColor, f);
  } else if (t < 0.4) {
    const f = (t - 0.3) / 0.1;
    skyColor = sunsetColor.clone().lerp(dayColor, f);
  } else if (t < 0.6) {
    skyColor = dayColor.clone();
  } else if (t < 0.7) {
    const f = (t - 0.6) / 0.1;
    skyColor = dayColor.clone().lerp(sunsetColor, f);
  } else {
    const f = (t - 0.7) / 0.1;
    skyColor = sunsetColor.clone().lerp(nightColor, f);
  }

  scene.background = skyColor;
  scene.fog.color = skyColor;

  const isNight = (t < 0.2 || t > 0.8);

  // Ambient
  const ambientTarget = isNight ? 0.08 : 0.6;
  state.ambient.intensity += (ambientTarget - state.ambient.intensity) * dt * 2;

  // Bloom strength lerp
  if (state.bloomPass) {
    const bloomTarget = isNight ? BLOOM_STRENGTH_NIGHT : BLOOM_STRENGTH_DAY;
    state.bloomPass.strength += (bloomTarget - state.bloomPass.strength) * dt * 1.5;
  }

  // Street lights
  const lightTarget = isNight ? 1.0 : 0.2;
  for (const sl of state.streetLights) {
    sl.pointLight.intensity += (lightTarget - sl.pointLight.intensity) * dt * 2;
    sl.bulb.material.emissiveIntensity += (lightTarget - sl.bulb.material.emissiveIntensity) * dt * 2;
  }

  // Neon point lights pulse at night
  const neonIntensity = isNight
    ? 3.5 + Math.sin(state.elapsedTime * 3) * 0.5
    : 0.5;
  for (const pl of state.neonPointLights) {
    pl.intensity += (neonIntensity - pl.intensity) * dt * 4;
  }

  // Building window glow at night
  const glowTarget = isNight ? 0.3 : 0;
  for (const mesh of state.buildingMeshes) {
    if (Array.isArray(mesh.material)) {
      for (const mat of mesh.material) {
        if (mat.emissiveIntensity !== undefined) {
          mat.emissiveIntensity += (glowTarget - mat.emissiveIntensity) * dt;
        }
      }
    }
  }
}

export function updateClouds(dt) {
  for (const cloud of state.clouds) {
    cloud.mesh.position.x += cloud.speed * dt;
    if (cloud.mesh.position.x > CITY_SIZE) {
      cloud.mesh.position.x = -CITY_SIZE;
    }
  }
}
