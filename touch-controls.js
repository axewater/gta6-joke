import { state } from './state.js';
import { handleVehicleToggle, handlePunch, handleShoot } from './player.js';

let cameraTouchId = null;
let lastTouchX = 0;
let lastTouchY = 0;
const controlElements = [];

function isTouchOnControl(touch) {
  for (const el of controlElements) {
    const r = el.getBoundingClientRect();
    if (touch.clientX >= r.left && touch.clientX <= r.right &&
        touch.clientY >= r.top && touch.clientY <= r.bottom) {
      return true;
    }
  }
  return false;
}

export function initTouchControls() {
  const joystickZone = document.getElementById('touch-joystick-zone');
  const buttonsContainer = document.getElementById('touch-buttons');
  const shootBtn = document.getElementById('touch-btn-shoot');
  const jumpBtn = document.getElementById('touch-btn-jump');
  const vehicleBtn = document.getElementById('touch-btn-vehicle');
  const buyBtn = document.getElementById('touch-btn-buy');

  // Show touch UI
  joystickZone.style.display = 'block';
  buttonsContainer.style.display = 'block';

  // Move minimap to middle-right so it doesn't overlap action buttons
  const minimapContainer = document.getElementById('minimap-container');
  if (minimapContainer) {
    minimapContainer.style.bottom = 'auto';
    minimapContainer.style.top = '50%';
    minimapContainer.style.transform = 'translateY(-50%)';
  }

  // Track control elements for camera touch filtering
  controlElements.push(joystickZone, shootBtn, jumpBtn, vehicleBtn, buyBtn);

  // ── Virtual Joystick ──────────────────────────────────────────────────
  const joystick = nipplejs.create({
    zone: joystickZone,
    mode: 'dynamic',
    position: { left: '50%', top: '50%' },
    color: 'rgba(255, 255, 255, 0.3)',
    size: 120,
  });

  joystick.on('move', (evt, data) => {
    const angle = data.angle.radian;
    const force = Math.min(data.force, 1);
    const x = Math.cos(angle) * force;
    const y = Math.sin(angle) * force;

    const threshold = 0.3;
    state.keys['KeyW'] = y > threshold;
    state.keys['KeyS'] = y < -threshold;
    state.keys['KeyA'] = x < -threshold;
    state.keys['KeyD'] = x > threshold;
    state.keys['ShiftLeft'] = force > 0.75;
  });

  joystick.on('end', () => {
    state.keys['KeyW'] = false;
    state.keys['KeyS'] = false;
    state.keys['KeyA'] = false;
    state.keys['KeyD'] = false;
    state.keys['ShiftLeft'] = false;
  });

  // ── Camera Touch (swipe anywhere) ─────────────────────────────────────
  const canvas = document.getElementById('gameCanvas');

  canvas.addEventListener('touchstart', (e) => {
    for (const touch of e.changedTouches) {
      if (cameraTouchId === null && !isTouchOnControl(touch)) {
        cameraTouchId = touch.identifier;
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;
      }
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    for (const touch of e.changedTouches) {
      if (touch.identifier === cameraTouchId) {
        state.mouse.dx += (touch.clientX - lastTouchX) * 1.0;
        state.mouse.dy += (touch.clientY - lastTouchY) * 1.0;
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;
      }
    }
  }, { passive: true });

  canvas.addEventListener('touchend', (e) => {
    for (const touch of e.changedTouches) {
      if (touch.identifier === cameraTouchId) {
        cameraTouchId = null;
      }
    }
  }, { passive: true });

  // Prevent default on touchmove for the whole document to stop scrolling
  document.addEventListener('touchmove', (e) => {
    e.preventDefault();
  }, { passive: false });

  // ── Action Buttons ────────────────────────────────────────────────────
  shootBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (state.isInVehicle || state.isDead) return;
    if (state.hasGun) handleShoot();
    else handlePunch();
  }, { passive: false });

  jumpBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    state.keys['Space'] = true;
  }, { passive: false });

  jumpBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    state.keys['Space'] = false;
  }, { passive: false });

  vehicleBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!state.isDead) handleVehicleToggle();
  }, { passive: false });

  buyBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (state.isDead || state.isInVehicle || !state.gunStore || state.hasGun) return;
    const gs = state.gunStore;
    const dx = gs.x - state.player.x, dz = gs.z - state.player.z;
    if (dx * dx + dz * dz < 25 && state.money >= 200) {
      state.money -= 200;
      state.hasGun = true;
      document.getElementById('weapon').innerHTML = '&#128299; PISTOL';
    }
  }, { passive: false });
}

export function updateTouchControls() {
  if (!state.isMobile) return;

  const buyBtn = document.getElementById('touch-btn-buy');
  const shootBtn = document.getElementById('touch-btn-shoot');

  // Update shoot button icon based on weapon
  shootBtn.innerHTML = state.hasGun ? '&#128299;' : '&#9994;';

  // Show/hide buy gun button contextually
  if (state.gunStore && !state.hasGun && !state.isInVehicle && !state.isDead) {
    const gs = state.gunStore;
    const dx = gs.x - state.player.x, dz = gs.z - state.player.z;
    buyBtn.style.display = (dx * dx + dz * dz < 25 && state.money >= 200) ? 'flex' : 'none';
  } else {
    buyBtn.style.display = 'none';
  }
}
