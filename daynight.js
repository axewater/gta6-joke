import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { BLOOM_STRENGTH_DAY, BLOOM_STRENGTH_NIGHT, CITY_SIZE, WORLD_SCALE } from './constants.js';

export function updateDayNight(dt) {
  // 60 real seconds = 1 game day
  state.gameTime += dt / 60;
  if (state.gameTime >= 1) state.gameTime -= 1;

  const t = state.gameTime;

  // Sun orbit
  const sunAngle = t * Math.PI * 2 - Math.PI / 2;
  const sunY = Math.sin(sunAngle) * 120 * WORLD_SCALE;
  const sunXZ = Math.cos(sunAngle) * 150 * WORLD_SCALE;
  state.sun.position.set(sunXZ, Math.max(sunY, -20), 80 * WORLD_SCALE);
  state.sun.intensity = Math.max(0, Math.min(1.5, sunY / (60 * WORLD_SCALE)));

  const nightColor = new THREE.Color(0x05030f);
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

  scene.fog.color = skyColor;

  const isNight = (t < 0.2 || t > 0.8);

  // ── Sky Dome ──────────────────────────────────────────────────────────
  if (state.skyDomeMaterial) {
    state.skyDomeMaterial.uniforms.horizonColor.value.copy(skyColor);

    const nightZenith = new THREE.Color(0x020108);
    const sunsetZenith = new THREE.Color(0x6B3A7A);
    const dayZenith = new THREE.Color(0x1a4a8a);

    let zenithColor;
    if (t < 0.2 || t > 0.8) {
      zenithColor = nightZenith;
    } else if (t < 0.3) {
      const f = (t - 0.2) / 0.1;
      zenithColor = nightZenith.clone().lerp(sunsetZenith, f);
    } else if (t < 0.4) {
      const f = (t - 0.3) / 0.1;
      zenithColor = sunsetZenith.clone().lerp(dayZenith, f);
    } else if (t < 0.6) {
      zenithColor = dayZenith.clone();
    } else if (t < 0.7) {
      const f = (t - 0.6) / 0.1;
      zenithColor = dayZenith.clone().lerp(sunsetZenith, f);
    } else {
      const f = (t - 0.7) / 0.1;
      zenithColor = sunsetZenith.clone().lerp(nightZenith, f);
    }

    state.skyDomeMaterial.uniforms.zenithColor.value.copy(zenithColor);
  }

  // ── Stars ─────────────────────────────────────────────────────────────
  if (state.starMaterial) {
    const starTarget = isNight ? 0.8 : 0;
    state.starMaterial.opacity += (starTarget - state.starMaterial.opacity) * dt * 2;
  }

  // ── Sun Mesh ──────────────────────────────────────────────────────────
  if (state.sunMesh) {
    const sunNorm = state.sun.position.clone().normalize();
    state.sunMesh.position.copy(sunNorm).multiplyScalar(400 * WORLD_SCALE);
    state.sunMesh.visible = state.sun.intensity > 0.1;
  }

  // ── Moon Mesh ─────────────────────────────────────────────────────────
  if (state.moonMesh) {
    const sunNorm = state.sun.position.clone().normalize();
    state.moonMesh.position.copy(sunNorm).multiplyScalar(-400 * WORLD_SCALE);
    state.moonMesh.visible = isNight;
  }

  // ── Environment Map ───────────────────────────────────────────────────
  if (state.envCanvases && state.envCubeTexture) {
    const topCanvas = state.envCanvases[2];
    const ctx = topCanvas.getContext('2d');
    const r = Math.floor(skyColor.r * 255);
    const g = Math.floor(skyColor.g * 255);
    const b = Math.floor(skyColor.b * 255);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, 64, 64);
    state.envCubeTexture.needsUpdate = true;
  }

  // ── Cinematic Pass ────────────────────────────────────────────────────
  if (state.cinematicPass) {
    state.cinematicPass.uniforms.time.value = state.elapsedTime;
    const grainTarget = isNight ? 0.06 : 0.03;
    const vignetteTarget = isNight ? 0.6 : 0.4;
    state.cinematicPass.uniforms.grainIntensity.value +=
      (grainTarget - state.cinematicPass.uniforms.grainIntensity.value) * dt * 2;
    state.cinematicPass.uniforms.vignetteStrength.value +=
      (vignetteTarget - state.cinematicPass.uniforms.vignetteStrength.value) * dt * 2;
  }

  // ── Ocean Water ───────────────────────────────────────────────────────
  if (state.oceanMaterial) {
    state.oceanMaterial.uniforms.skyColor.value.copy(skyColor);
    const sunNorm = state.sun.position.clone().normalize();
    state.oceanMaterial.uniforms.sunDirection.value.copy(sunNorm);
  }

  // ── Ambient ───────────────────────────────────────────────────────────
  const ambientTarget = isNight ? 0.08 : 0.6;
  state.ambient.intensity += (ambientTarget - state.ambient.intensity) * dt * 2;

  // ── Bloom ─────────────────────────────────────────────────────────────
  if (state.bloomPass) {
    const bloomTarget = isNight ? BLOOM_STRENGTH_NIGHT : BLOOM_STRENGTH_DAY;
    state.bloomPass.strength += (bloomTarget - state.bloomPass.strength) * dt * 1.5;
  }

  // ── Street lights ─────────────────────────────────────────────────────
  const lightTarget = isNight ? 1.0 : 0.2;
  for (const sl of state.streetLights) {
    sl.pointLight.intensity += (lightTarget - sl.pointLight.intensity) * dt * 2;
    sl.bulb.material.emissiveIntensity += (lightTarget - sl.bulb.material.emissiveIntensity) * dt * 2;
  }

  // ── Neon ──────────────────────────────────────────────────────────────
  const neonIntensity = isNight
    ? 3.5 + Math.sin(state.elapsedTime * 3) * 0.5
    : 0.5;
  for (const pl of state.neonPointLights) {
    pl.intensity += (neonIntensity - pl.intensity) * dt * 4;
  }

  // ── Building window glow ──────────────────────────────────────────────
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
  const t = state.gameTime;
  const isNight = (t < 0.2 || t > 0.8);

  let cloudColor;
  if (isNight) {
    cloudColor = new THREE.Color(0x1a1a2a);
  } else if (t < 0.3 || t > 0.7) {
    cloudColor = new THREE.Color(0xFFAA77);
  } else {
    cloudColor = new THREE.Color(0xFFEEDD);
  }

  for (const cloud of state.clouds) {
    cloud.mesh.position.x += cloud.speed * dt;
    if (cloud.mesh.position.x > CITY_SIZE) {
      cloud.mesh.position.x = -CITY_SIZE;
    }
    if (cloud.material) {
      cloud.material.color.lerp(cloudColor, dt * 2);
    }
  }
}
