import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { state } from './state.js';
import { WORLD_SCALE } from './constants.js';

export let renderer, scene, camera, composer;

// ── Clean Color Correction Shader ───────────────────────────────────────
const ColorCorrectionShader = {
  uniforms: {
    tDiffuse: { value: null },
    contrast: { value: 1.08 },
    saturation: { value: 1.15 },
    brightness: { value: 1.02 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float contrast;
    uniform float saturation;
    uniform float brightness;
    varying vec2 vUv;

    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;

      // Brightness
      color *= brightness;

      // Contrast (pivot around mid-gray)
      color = (color - 0.5) * contrast + 0.5;

      // Saturation
      float lum = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(vec3(lum), color, saturation);

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `
};

// ── Procedural Environment Cube Map ─────────────────────────────────────
function createEnvMap() {
  const size = 64;
  const canvases = [];

  for (let i = 0; i < 6; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (i === 2) {
      // +y (top) — sky color, updated each frame
      ctx.fillStyle = '#87ceeb';
      ctx.fillRect(0, 0, size, size);
    } else if (i === 3) {
      // -y (bottom) — dark ground
      ctx.fillStyle = '#111111';
      ctx.fillRect(0, 0, size, size);
    } else {
      // Sides — gradient + neon dots
      const grad = ctx.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0, '#87ceeb');
      grad.addColorStop(0.5, '#FFA062');
      grad.addColorStop(1, '#222222');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      const colors = ['#ff1493', '#00ffff', '#ff4500', '#39ff14', '#ffd700'];
      for (let j = 0; j < 20; j++) {
        const bx = Math.random() * size;
        const by = size * 0.3 + Math.random() * size * 0.5;
        ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
        ctx.fillRect(bx, by, 2, 2);
      }
    }
    canvases.push(canvas);
  }

  const cubeTexture = new THREE.CubeTexture(canvases);
  cubeTexture.needsUpdate = true;
  scene.environment = cubeTexture;
  state.envCubeTexture = cubeTexture;
  state.envCanvases = canvases;
}

// ── Init ────────────────────────────────────────────────────────────────
export function initRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  document.body.prepend(renderer.domElement);
  renderer.domElement.id = 'gameCanvas';

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xFFA062, 0.0008 / WORLD_SCALE);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 800 * WORLD_SCALE);

  // Environment cube map for PBR reflections
  createEnvMap();

  // Post-processing chain: Render → Bloom → SMAA → Color Correction → Output
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.6, 0.5, 0.75
  );
  state.bloomPass = bloomPass;
  composer.addPass(bloomPass);

  // SMAA anti-aliasing for sharper edges
  const smaaPass = new SMAAPass(window.innerWidth, window.innerHeight);
  composer.addPass(smaaPass);
  state.smaaPass = smaaPass;

  // Clean color correction (contrast + saturation, no film effects)
  const colorPass = new ShaderPass(ColorCorrectionShader);
  state.colorPass = colorPass;
  composer.addPass(colorPass);

  composer.addPass(new OutputPass());

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    if (state.smaaPass) {
      state.smaaPass.setSize(window.innerWidth, window.innerHeight);
    }
  });
}
