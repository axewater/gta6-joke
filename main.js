import * as THREE from 'three';
import { initRenderer, renderer, scene, camera, composer } from './renderer.js';
import { state } from './state.js';
import { setupLighting, createCity, createRamps, createOceanAndBeach, createPalmTrees, createClouds, createSkyDome, createMoneyPickups, createGunStore, createTrafficLights, updateTrafficLights, createMountains } from './city.js';
import { createPlayer, createNPCs, createGangNPCs } from './characters.js';
import { spawnVehicles, createTrafficCars } from './vehicles.js';
import { updateRagdoll, checkVehiclePlayerCollision, triggerRagdoll } from './physics.js';
import { updateNPCs, updateTrafficCars, updatePolice, updatePoliceOfficers, updateTanks, updateGangNPCs } from './ai.js';
import { updatePlayer, updateVehicle, handleVehicleToggle, handlePunch, handleShoot, updateMoneyPickups, updateWanted, updateDeath } from './player.js';
import { createRain, updateRain } from './weather.js';
import { updateCamera } from './camera.js';
import { initHUD, updateHUD, updateMinimap } from './hud.js';
import { updateDayNight, updateClouds } from './daynight.js';
import { checkPlayerCarNpcCollision, checkCarCarCollisions, checkStreetLightCollision, updateFallingLights } from './collision.js';
import { updateNpcRagdolls } from './npc-ragdoll.js';
import { updateExplosions, setTriggerRagdoll, initExplosionPool } from './vehicle-damage.js';
import { updateHelicopter } from './helicopter.js';
import { finalizeStaticMeshes } from './geometry-merger.js';
import { SpatialGrid } from './spatial-grid.js';
import { playerBulletPool, policeBulletPool, gangBulletPool, tireSmokePool, tankShellPool, missilePool } from './object-pool.js';
import { registerSystem, runSystems, playerBulletSystem, policeBulletSystem, gangBulletSystem, tankShellSystem, missileSystem, tireSmokeSystem } from './systems.js';

let clock;

function yieldFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

async function init() {
  clock = new THREE.Clock();

  const bar = document.getElementById('loading-bar-inner');
  const status = document.getElementById('loading-status');

  const steps = [
    { fn: initRenderer, label: 'Initializing renderer...' },
    { fn: setupLighting, label: 'Setting up lighting...' },
    { fn: createCity, label: 'Building city...' },
    { fn: createRamps, label: 'Placing ramps...' },
    { fn: createOceanAndBeach, label: 'Creating ocean...' },
    { fn: createMountains, label: 'Building mountains...' },
    { fn: createPalmTrees, label: 'Planting trees...' },
    { fn: createClouds, label: 'Generating clouds...' },
    { fn: createSkyDome, label: 'Building sky...' },
    { fn: createRain, label: 'Setting up weather...' },
    { fn: () => {
      playerBulletPool.init();
      policeBulletPool.init();
      gangBulletPool.init();
      tireSmokePool.init();
      tankShellPool.init();
      missilePool.init();
    }, label: 'Pre-allocating pools...' },
    { fn: initExplosionPool, label: 'Loading effects...' },
    { fn: createPlayer, label: 'Creating player...' },
    { fn: spawnVehicles, label: 'Spawning vehicles...' },
    { fn: createNPCs, label: 'Populating city...' },
    { fn: createGangNPCs, label: 'Spawning gangs...' },
    { fn: createTrafficCars, label: 'Adding traffic...' },
    { fn: createTrafficLights, label: 'Installing traffic lights...' },
    { fn: createMoneyPickups, label: 'Placing pickups...' },
    { fn: createGunStore, label: 'Opening stores...' },
    { fn: initHUD, label: 'Setting up HUD...' },
    { fn: () => {
      state.mergedMeshes = finalizeStaticMeshes();
    }, label: 'Optimizing geometry...' },
    { fn: () => {
      const grid = new SpatialGrid();
      // Merged chunk meshes are NOT inserted — Three.js frustum culling
      // handles them fine since they're already chunked (~25 per material).
      // Insert remaining individual building meshes (windowed, still in scene)
      for (const m of state.buildingMeshes) {
        if (m.parent) grid.insert(m, m.position.x, m.position.z);
      }
      // Insert NPCs
      for (const npc of state.npcs) {
        if (npc.mesh) grid.insert(npc.mesh, npc.x, npc.z);
      }
      // Insert traffic cars
      for (const car of state.trafficCars) {
        if (car.mesh) grid.insert(car.mesh, car.x, car.z);
      }
      // Insert gang NPCs
      for (const gnpc of state.gangNpcs) {
        if (gnpc.mesh) grid.insert(gnpc.mesh, gnpc.x, gnpc.z);
      }
      state.spatialGrid = grid;
    }, label: 'Building spatial grid...' },
  ];

  // +2 for the async compile and first-render steps below (geometry merge & spatial grid are already in steps)
  const total = steps.length + 2;

  for (let i = 0; i < steps.length; i++) {
    status.textContent = steps[i].label;
    bar.style.width = Math.round((i / total) * 100) + '%';
    await yieldFrame();
    await steps[i].fn();
  }

  // Batched async shader compilation with progress
  const allMeshes = [];
  scene.traverse(obj => {
    if (obj.isMesh || obj.isPoints || obj.isLine) {
      allMeshes.push(obj);
      obj.visible = false;
    }
  });

  const BATCH = 100;
  const baseWidth = steps.length / total;
  const nextWidth = (steps.length + 1) / total;

  for (let i = 0; i < allMeshes.length; i += BATCH) {
    const end = Math.min(i + BATCH, allMeshes.length);
    for (let j = i; j < end; j++) allMeshes[j].visible = true;

    const progress = Math.min(end / allMeshes.length, 1);
    status.textContent = `Compiling shaders... ${Math.round(progress * 100)}%`;
    bar.style.width = Math.round((baseWidth + progress * (nextWidth - baseWidth)) * 100) + '%';
    await yieldFrame();
    await renderer.compileAsync(scene, camera);
  }

  // First render — shaders already compiled, should be fast
  status.textContent = 'Starting engine...';
  bar.style.width = Math.round(((steps.length + 1) / total) * 100) + '%';
  await yieldFrame();
  composer.render();

  bar.style.width = '100%';
  status.textContent = 'Ready!';
  await yieldFrame();

  // Wire up triggerRagdoll for vehicle-damage.js (avoids circular import)
  setTriggerRagdoll(triggerRagdoll);

  // Input
  document.addEventListener('keydown', e => { state.keys[e.code] = true; });
  document.addEventListener('keyup', e => { state.keys[e.code] = false; });
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement) {
      state.mouse.dx += e.movementX;
      state.mouse.dy += e.movementY;
    }
  });

  document.addEventListener('mousedown', e => {
    if (e.button === 0 && document.pointerLockElement && !state.isInVehicle && !state.isDead) {
      if (state.hasGun) handleShoot();
      else handlePunch();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.code === 'KeyF' && !state.isDead && !state.isInVehicle && state.gunStore && !state.hasGun) {
      const gs = state.gunStore;
      const dx = gs.x - state.player.x, dz = gs.z - state.player.z;
      if (dx * dx + dz * dz < 25) {
        if (state.money >= 200) {
          state.money -= 200;
          state.hasGun = true;
          document.getElementById('weapon').innerHTML = '&#128299; PISTOL';
        }
      }
    }
  });

  document.addEventListener('keydown', e => {
    if (e.code === 'KeyE' && !state.isDead) handleVehicleToggle();
  });

  // Switch from loading screen to "Click to Play"
  document.getElementById('loading-container').style.display = 'none';
  document.getElementById('play-text').style.display = '';

  // Pointer lock
  const overlay = document.getElementById('click-overlay');
  overlay.addEventListener('click', () => {
    document.querySelector('#gameCanvas').requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    overlay.style.display = document.pointerLockElement ? 'none' : 'flex';
  });

  // Fade controls hint
  setTimeout(() => {
    const hint = document.getElementById('controls-hint');
    if (hint) hint.style.opacity = '0';
  }, 5000);

  // ── Register all systems ──────────────────────────────────────────────
  // Priority 0: Player movement
  registerSystem('playerMovement', (dt) => {
    if (state.isInVehicle) {
      updateVehicle(dt);
      checkPlayerCarNpcCollision();
      checkCarCarCollisions();
      checkStreetLightCollision();
    } else {
      updatePlayer(dt);
      updateRagdoll(dt);
    }
  });

  // Priority 1: Physics & collisions
  registerSystem('vehicleCollision', (dt) => checkVehiclePlayerCollision());
  registerSystem('fallingLights', (dt) => updateFallingLights(dt));
  registerSystem('npcRagdolls', (dt) => updateNpcRagdolls(dt));
  registerSystem('explosions', (dt) => updateExplosions(dt));

  // Priority 2: Camera & game state
  registerSystem('camera', (dt) => updateCamera(dt));
  registerSystem('death', (dt) => updateDeath(dt));
  registerSystem('wanted', (dt) => updateWanted(dt));
  registerSystem('moneyPickups', (dt) => updateMoneyPickups(dt));
  registerSystem('dayNight', (dt) => updateDayNight(dt));
  registerSystem('clouds', (dt) => updateClouds(dt));

  // Priority 3: AI systems (every 2 frames)
  registerSystem('npcAI', (dt) => updateNPCs(dt), 2);
  registerSystem('trafficAI', (dt) => updateTrafficCars(dt), 2);
  registerSystem('trafficLights', (dt) => updateTrafficLights(dt), 2);
  registerSystem('gangAI', (dt) => updateGangNPCs(dt), 2);
  registerSystem('spatialGrid', () => {
    if (state.spatialGrid) {
      for (const npc of state.npcs) {
        if (npc.mesh) state.spatialGrid.move(npc.mesh, npc.x, npc.z);
      }
      for (const car of state.trafficCars) {
        if (car.mesh) state.spatialGrid.move(car.mesh, car.x, car.z);
      }
      for (const gnpc of state.gangNpcs) {
        if (gnpc.mesh) state.spatialGrid.move(gnpc.mesh, gnpc.x, gnpc.z);
      }
      state.spatialGrid.update(camera);
    }
  }, 2);

  // Priority 4: Law enforcement AI
  registerSystem('policeCars', (dt) => updatePolice(dt));
  registerSystem('policeOfficers', (dt) => updatePoliceOfficers(dt));
  registerSystem('helicopter', (dt) => updateHelicopter(dt));
  registerSystem('tanks', (dt) => updateTanks(dt));

  // Priority 5: Projectile systems (tight loops with swap-and-pop)
  registerSystem('playerBullets', playerBulletSystem);
  registerSystem('policeBullets', policeBulletSystem);
  registerSystem('gangBullets', gangBulletSystem);
  registerSystem('tankShells', tankShellSystem);
  registerSystem('missiles', missileSystem);

  // Priority 6: Particles & effects
  registerSystem('tireSmoke', tireSmokeSystem);
  registerSystem('rain', (dt) => updateRain(dt));

  // Priority 7: HUD
  registerSystem('hud', () => updateHUD());
  registerSystem('minimap', () => updateMinimap(), 3);

  gameLoop();
}

function gameLoop() {
  requestAnimationFrame(gameLoop);

  let dt = clock.getDelta();
  if (dt > 0.05) dt = 0.05;
  state.elapsedTime += dt;

  runSystems(dt, state.frameCount);

  if (state.shootCooldown > 0) state.shootCooldown -= dt;

  if (state.gunStore && state.gunStore.icon) {
    state.gunStore.icon.rotation.y += dt * 2;
    state.gunStore.icon.position.y = 6 + Math.sin(state.elapsedTime * 2) * 0.3;
  }

  if (state.oceanMaterial) {
    state.oceanMaterial.uniforms.time.value = state.elapsedTime;
  }

  state.frameCount++;
  state.mouse.dx = 0;
  state.mouse.dy = 0;

  composer.render();
}

init();
