import * as THREE from 'three';
import { initRenderer, renderer, scene, camera, composer } from './renderer.js';
import { state } from './state.js';
import { setupLighting, createCity, createRamps, createOceanAndBeach, createPalmTrees, createClouds, createSkyDome, createMoneyPickups, createGunStore } from './city.js';
import { createPlayer, createNPCs } from './characters.js';
import { spawnVehicles, createTrafficCars } from './vehicles.js';
import { updateRagdoll, checkVehiclePlayerCollision, triggerRagdoll } from './physics.js';
import { updateNPCs, updateTrafficCars, updatePolice, updatePoliceOfficers } from './ai.js';
import { updatePlayer, updateVehicle, updateTireSmoke, handleVehicleToggle, handlePunch, handleShoot, updateBullets, updateMoneyPickups, updateWanted, updateDeath, commitCrime } from './player.js';
import { createRain, updateRain } from './weather.js';
import { updateCamera } from './camera.js';
import { initHUD, updateHUD, updateMinimap } from './hud.js';
import { updateDayNight, updateClouds } from './daynight.js';
import { checkPlayerCarNpcCollision, checkCarCarCollisions } from './collision.js';
import { updateNpcRagdolls } from './npc-ragdoll.js';
import { updateExplosions, setTriggerRagdoll, initExplosionPool } from './vehicle-damage.js';

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
    { fn: createPalmTrees, label: 'Planting trees...' },
    { fn: createClouds, label: 'Generating clouds...' },
    { fn: createSkyDome, label: 'Building sky...' },
    { fn: createRain, label: 'Setting up weather...' },
    { fn: initExplosionPool, label: 'Loading effects...' },
    { fn: createPlayer, label: 'Creating player...' },
    { fn: spawnVehicles, label: 'Spawning vehicles...' },
    { fn: createNPCs, label: 'Populating city...' },
    { fn: createTrafficCars, label: 'Adding traffic...' },
    { fn: createMoneyPickups, label: 'Placing pickups...' },
    { fn: createGunStore, label: 'Opening stores...' },
    { fn: initHUD, label: 'Setting up HUD...' },
    { fn: () => renderer.compile(scene, camera), label: 'Compiling shaders...' },
  ];

  for (let i = 0; i < steps.length; i++) {
    status.textContent = steps[i].label;
    bar.style.width = Math.round((i / steps.length) * 100) + '%';
    await yieldFrame();
    steps[i].fn();
  }

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

  gameLoop();
}

function gameLoop() {
  requestAnimationFrame(gameLoop);

  let dt = clock.getDelta();
  if (dt > 0.05) dt = 0.05;
  state.elapsedTime += dt;

  if (state.isInVehicle) {
    updateVehicle(dt);
    checkPlayerCarNpcCollision();
    checkCarCarCollisions();
  } else {
    updatePlayer(dt);
    updateRagdoll(dt);
  }

  checkVehiclePlayerCollision();
  updateNpcRagdolls(dt);
  updateExplosions(dt);
  updateCamera(dt);
  updateDeath(dt);
  updateWanted(dt);
  updateMoneyPickups(dt);
  updateDayNight(dt);
  updateClouds(dt);

  if (state.frameCount % 2 === 0) {
    updateNPCs(dt * 2);
    updateTrafficCars(dt * 2);
  }

  updatePolice(dt);
  updatePoliceOfficers(dt);
  updateBullets(dt);

  if (state.shootCooldown > 0) state.shootCooldown -= dt;

  // Gun store icon spin
  if (state.gunStore && state.gunStore.icon) {
    state.gunStore.icon.rotation.y += dt * 2;
    state.gunStore.icon.position.y = 6 + Math.sin(state.elapsedTime * 2) * 0.3;
  }

  updateHUD();

  // Update ocean shader time uniform
  if (state.oceanMaterial) {
    state.oceanMaterial.uniforms.time.value = state.elapsedTime;
  }

  updateRain(dt);
  updateTireSmoke(dt);

  state.frameCount++;
  if (state.frameCount % 3 === 0) updateMinimap();

  state.mouse.dx = 0;
  state.mouse.dy = 0;

  composer.render();
}

init();
