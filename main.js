import * as THREE from 'three';
import { initRenderer, scene, composer } from './renderer.js';
import { state } from './state.js';
import { setupLighting, createCity, createRamps, createOceanAndBeach, createPalmTrees, createClouds, createMoneyPickups, createGunStore } from './city.js';
import { createPlayer, createNPCs } from './characters.js';
import { spawnVehicles, createTrafficCars } from './vehicles.js';
import { updateRagdoll, checkVehiclePlayerCollision, triggerRagdoll } from './physics.js';
import { updateNPCs, updateTrafficCars, updatePolice, updatePoliceOfficers } from './ai.js';
import { updatePlayer, updateVehicle, handleVehicleToggle, handlePunch, handleShoot, updateBullets, updateMoneyPickups, updateWanted, updateDeath, commitCrime } from './player.js';
import { updateCamera } from './camera.js';
import { initHUD, updateHUD, updateMinimap } from './hud.js';
import { updateDayNight, updateClouds } from './daynight.js';
import { checkPlayerCarNpcCollision, checkCarCarCollisions } from './collision.js';
import { updateNpcRagdolls } from './npc-ragdoll.js';
import { updateExplosions, setTriggerRagdoll } from './vehicle-damage.js';

let clock;

function init() {
  clock = new THREE.Clock();

  initRenderer();

  setupLighting();
  createCity();
  createRamps();
  createOceanAndBeach();
  createPalmTrees();
  createClouds();
  createPlayer();
  spawnVehicles();
  createNPCs();
  createTrafficCars();
  createMoneyPickups();
  createGunStore();

  initHUD();

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

  // Pointer lock
  const overlay = document.getElementById('click-overlay');
  overlay.addEventListener('click', () => {
    // renderer.domElement is the canvas prepended to body
    document.querySelector('#gameCanvas').requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    overlay.style.display = document.pointerLockElement ? 'none' : 'flex';
  });

  document.addEventListener('keydown', e => {
    if (e.code === 'KeyE' && !state.isDead) handleVehicleToggle();
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

  if (state.ocean) {
    state.ocean.position.y = -0.3 + Math.sin(state.elapsedTime * 0.8) * 0.15;
  }

  state.frameCount++;
  if (state.frameCount % 3 === 0) updateMinimap();

  state.mouse.dx = 0;
  state.mouse.dy = 0;

  composer.render();
}

init();
