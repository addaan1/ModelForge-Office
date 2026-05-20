import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OFFICE_CONSTANTS, AGENTS, ROOMS, INTERACTIVES } from './config.js';

const MAX_FLOOR = 3;
const DEFAULT_LOOK_SENSITIVITY = 0.96;
const ASSET_MODEL_ROOT = './assets/models/';
const SAFE_SPAWNS = {
  1: [-20.4, -6.8],
  2: [-20.4, -6.8],
  3: [-20.4, -6.8]
};
const SAFE_LIFT_LANDINGS = {
  1: [[4.2, 15.85], [0, 15.95], [-4.2, 15.85], [5.0, 14.8]],
  2: [[0, 15.85], [4.2, 15.85], [-4.2, 15.85]],
  3: [[0, 15.85], [4.2, 15.85], [-4.2, 15.85]]
};

function hexColor(hex) {
  return new THREE.Color(hex);
}

function makeCanvasTexture(draw, size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function labelSprite(text, options = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const bg = options.bg || 'rgba(255,255,255,0.88)';
  const fg = options.fg || '#172033';
  ctx.fillStyle = bg;
  roundRect(ctx, 14, 18, 484, 112, 28);
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,23,42,0.14)';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.font = '700 30px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const words = text.split(' ');
  const line1 = words.slice(0, 3).join(' ');
  const line2 = words.slice(3).join(' ');
  ctx.fillText(line1, 256, line2 ? 62 : 78);
  if (line2) {
    ctx.font = '600 22px Inter, Arial, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText(line2, 256, 98);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: options.depthTest ?? true }));
  sprite.scale.set(2.4, 0.75, 1);
  sprite.renderOrder = options.alwaysOnTop ? 20 : 2;
  return sprite;
}

function signPlane(text, options = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = options.bg || '#ffffff';
  roundRect(ctx, 16, 22, 480, 116, 22);
  ctx.fill();
  ctx.strokeStyle = options.border || 'rgba(15,23,42,0.22)';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = options.fg || '#172033';
  ctx.font = '800 34px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const words = text.split(' ');
  const line1 = words.slice(0, 3).join(' ');
  const line2 = words.slice(3).join(' ');
  ctx.fillText(line1, 256, line2 ? 66 : 82);
  if (line2) {
    ctx.font = '700 24px Inter, Arial, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText(line2, 256, 104);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.FrontSide });
  return new THREE.Mesh(new THREE.PlaneGeometry(options.width || 2.8, options.height || 0.78), material);
}

function liftDisplayTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0f172a';
  roundRect(ctx, 10, 10, 236, 76, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(147,197,253,0.6)';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#bfdbfe';
  ctx.font = '800 44px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 50);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function createMaterials() {
  const wood = makeCanvasTexture((ctx, s) => {
    ctx.fillStyle = '#d7b98f'; ctx.fillRect(0,0,s,s);
    for (let i = 0; i < 28; i++) {
      const y = (i / 28) * s;
      ctx.fillStyle = i % 2 ? 'rgba(116,76,40,0.18)' : 'rgba(255,255,255,0.18)';
      ctx.fillRect(0, y, s, s / 34);
      ctx.fillStyle = 'rgba(89,54,28,0.16)';
      ctx.fillRect((i * 47) % s, y + 4, s / 3, 2);
    }
  });
  wood.repeat.set(10, 7);

  const carpet = makeCanvasTexture((ctx, s) => {
    ctx.fillStyle = '#e5ebf2'; ctx.fillRect(0,0,s,s);
    for (let x = 0; x < s; x += 32) {
      for (let y = 0; y < s; y += 32) {
        ctx.fillStyle = (x + y) % 64 === 0 ? '#d8e2ec' : '#edf2f7';
        ctx.fillRect(x, y, 30, 30);
      }
    }
    ctx.strokeStyle = 'rgba(100,116,139,0.10)';
    for (let i = 0; i < s; i += 32) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(s,i); ctx.stroke(); }
  });
  carpet.repeat.set(8, 6);

  const ceiling = makeCanvasTexture((ctx, s) => {
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0,0,s,s);
    ctx.strokeStyle = '#dce5ef'; ctx.lineWidth = 3;
    for (let i = 0; i <= s; i += 64) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(s,i); ctx.stroke(); }
  });
  ceiling.repeat.set(8, 6);

  return {
    floorWood: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.68, metalness: 0.02 }),
    carpet: new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.82 }),
    loungeFloor: new THREE.MeshStandardMaterial({ color: '#e8eef4', roughness: 0.78 }),
    ceiling: new THREE.MeshStandardMaterial({ map: ceiling, roughness: 0.95 }),
    wall: new THREE.MeshStandardMaterial({ color: '#f7f4ee', roughness: 0.78 }),
    accentWall: new THREE.MeshStandardMaterial({ color: '#e7effa', roughness: 0.75 }),
    darkTrim: new THREE.MeshStandardMaterial({ color: '#263445', roughness: 0.7 }),
    warmTrim: new THREE.MeshStandardMaterial({ color: '#b69b76', roughness: 0.58, metalness: 0.08 }),
    acoustic: new THREE.MeshStandardMaterial({ color: '#dbe4ee', roughness: 0.86 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#c8efff', roughness: 0.08, metalness: 0.0, transmission: 0.54, transparent: true, opacity: 0.36, ior: 1.2, thickness: 0.25 }),
    doorGlass: new THREE.MeshPhysicalMaterial({ color: '#bcecff', transparent: true, opacity: 0.44, roughness: 0.04, metalness: 0.0 }),
    lightPanel: new THREE.MeshBasicMaterial({ color: '#fff7da' }),
    monitor: new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.35, metalness: 0.25 }),
    screen: new THREE.MeshBasicMaterial({ color: '#4cc9f0' }),
    white: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }),
    plant: new THREE.MeshStandardMaterial({ color: '#22c55e', roughness: 0.8 }),
    pot: new THREE.MeshStandardMaterial({ color: '#7c2d12', roughness: 0.75 })
  };
}

export class OfficeWorld {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#dcebff');
    this.scene.fog = new THREE.Fog('#dcebff', 38, 105);
    this.clock = new THREE.Clock();
    this.materials = createMaterials();
    this.gltfLoader = new GLTFLoader();
    this.modelManifestPromise = null;
    this.modelCache = new Map();
    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 180);
    this.camera.position.set(SAFE_SPAWNS[1][0], OFFICE_CONSTANTS.eyeHeight, SAFE_SPAWNS[1][1]);
    this.controls = new PointerLockControls(this.camera, document.body);
    this.controls.pointerSpeed = DEFAULT_LOOK_SENSITIVITY;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(1.35, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.raycaster = new THREE.Raycaster();
    this.keys = new Set();
    this.currentFloor = 1;
    this.interactables = [];
    this.agentGroups = new Map();
    this.agentHome = new Map();
    this.agentStates = new Map();
    this.agentBehaviorEnabled = true;
    this.blockers = [];
    this.liftDoors = new Map();
    this.liftIndicators = new Map();
    this.roomDoors = [];
    this.coffeeMachines = new Map();
    this.strategyLightMesh = null;
    this.liftState = {
      inside: false,
      busy: false,
      currentFloor: 1,
      targetFloor: 1,
      phase: 'idle',
      doorOpen: false
    };
    this.collisionDebugGroup = new THREE.Group();
    this.collisionDebugGroup.visible = false;
    this.scene.add(this.collisionDebugGroup);
    this.seatCount = 0;
    this.seatMode = null;
    this.teamGathered = false;
    this.nearest = null;
    this.lastRoom = 'Lobby & Onboarding';
    this.lastMouseGuardAt = 0;
    this._init();
  }

  _init() {
    this._loadModelManifest();
    this._lights();
    this._buildOfficeShell();
    this._buildRoomsAndFurniture();
    this._buildAgents();
    this._bindEvents();
    this.animate();
  }

  async _loadModelManifest() {
    if (this.modelManifestPromise) return this.modelManifestPromise;
    this.modelManifestPromise = fetch(`${ASSET_MODEL_ROOT}manifest.json`)
      .then(response => response.ok ? response.json() : { assets: {} })
      .catch(() => ({ assets: {} }));
    return this.modelManifestPromise;
  }

  async _loadModelScene(file) {
    if (!file) return null;
    const path = `${ASSET_MODEL_ROOT}${file}`;
    if (!this.modelCache.has(path)) {
      this.modelCache.set(path, new Promise((resolve, reject) => {
        this.gltfLoader.load(path, gltf => resolve(gltf.scene), undefined, reject);
      }));
    }
    const scene = await this.modelCache.get(path);
    return scene.clone(true);
  }

  _trySignatureModel(key, fallback, options = {}) {
    if (!fallback) return fallback;
    this._loadModelManifest()
      .then(manifest => {
        const asset = manifest?.assets?.[key];
        if (!asset?.file) return null;
        return this._loadModelScene(asset.file).then(model => ({ model, asset }));
      })
      .then(result => {
        if (!result?.model) return;
        const { model, asset } = result;
        const scale = Number(options.scale ?? asset.scale ?? 1);
        model.position.copy(fallback.position);
        model.rotation.copy(fallback.rotation);
        model.scale.setScalar(scale);
        model.traverse(child => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = true;
          }
        });
        this.scene.add(model);
        fallback.visible = false;
      })
      .catch(() => { fallback.visible = true; });
    return fallback;
  }
  _lights() {
    const hemi = new THREE.HemisphereLight('#ffffff', '#b9c4d2', 2.1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff8e5', 2.7);
    sun.position.set(-20, 28, -12);
    sun.castShadow = false;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 80;
    sun.shadow.camera.left = -35;
    sun.shadow.camera.right = 35;
    sun.shadow.camera.top = 35;
    sun.shadow.camera.bottom = -35;
    this.scene.add(sun);
  }

  _buildOfficeShell() {
    for (let floor = 1; floor <= MAX_FLOOR; floor++) {
      const y = (floor - 1) * OFFICE_CONSTANTS.floorHeight;
      this._addFloorPlate(y, floor);
      this._addCeiling(y + 3.42, floor);
      this._addPerimeterWalls(y, floor);
      this._addLightGrid(y, floor);
      this._addOfficeDetails(y, floor);
    }
    this._addAtrium();
    this._addElevatorShaft();
  }

  _addFloorPlate(y, floor) {
    const geom = new THREE.BoxGeometry(48, 0.18, 38);
    const mat = floor === 1 ? this.materials.floorWood : floor === 3 ? this.materials.loungeFloor : this.materials.carpet;
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(0, y - 0.09, 0);
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const rugColor = floor === 1 ? '#dbeafe' : floor === 2 ? '#e0f2fe' : '#dcfce7';
    const rug = new THREE.Mesh(new THREE.BoxGeometry(10, 0.025, 6), new THREE.MeshStandardMaterial({ color: rugColor, roughness: 0.85 }));
    rug.position.set(17, y + 0.02, -10.5);
    rug.receiveShadow = true;
    this.scene.add(rug);
    const runner = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.026, 22), new THREE.MeshStandardMaterial({ color: floor === 3 ? '#cbd5e1' : '#e2e8f0', roughness: 0.88 }));
    runner.position.set(0, y + 0.025, 3.4);
    runner.receiveShadow = true;
    this.scene.add(runner);
  }

  _addCeiling(y, floor) {
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(48, 0.12, 38), this.materials.ceiling);
    ceiling.position.set(0, y, 0);
    ceiling.receiveShadow = true;
    this.scene.add(ceiling);
    const beamMat = new THREE.MeshStandardMaterial({ color: floor === 3 ? '#cbd5e1' : '#d6dee8', roughness: 0.72 });
    for (const z of [-12, -4, 4, 12]) this._box(48, 0.08, 0.16, 0, y - 0.1, z, beamMat, false);
    for (const x of [-16, -8, 0, 8, 16]) this._box(0.16, 0.08, 38, x, y - 0.105, 0, beamMat, false);
  }

  _addPerimeterWalls(y, floor) {
    const wallH = 3.45;
    const wallY = y + wallH / 2;
    const mat = this.materials.wall;
    const back = this._box(48, wallH, 0.25, 0, wallY, -19, mat, true);
    const front = this._box(48, wallH, 0.25, 0, wallY, 19, mat, true);
    const left = this._box(0.25, wallH, 38, -24, wallY, 0, mat, true);
    const right = this._box(0.25, wallH, 38, 24, wallY, 0, mat, true);
    [back, front, left, right].forEach(w => w.castShadow = true);

    // Bright office window strips on two facades.
    for (const z of [-18.86, 18.86]) {
      for (let x = -18; x <= 18; x += 6) {
        const win = this._box(4.6, 1.55, 0.06, x, y + 2.05, z, this.materials.glass, false);
        win.renderOrder = 1;
        this._box(0.045, 1.62, 0.07, x - 2.35, y + 2.05, z - Math.sign(z) * 0.02, this.materials.darkTrim, false);
        this._box(0.045, 1.62, 0.07, x + 2.35, y + 2.05, z - Math.sign(z) * 0.02, this.materials.darkTrim, false);
        this._box(4.72, 0.045, 0.07, x, y + 2.84, z - Math.sign(z) * 0.02, this.materials.darkTrim, false);
      }
    }
    for (const x of [-22.5, 22.5]) {
      for (const z of [-15, -7, 1, 9, 16]) {
        this._box(0.42, 3.3, 0.42, x, y + 1.65, z, this.materials.acoustic, true);
      }
    }
  }

  _addLightGrid(y, floor) {
    for (let x = -18; x <= 18; x += 12) {
      for (let z = -13; z <= 13; z += 10) {
        const panel = this._box(2.6, 0.035, 1.05, x, y + 3.34, z, this.materials.lightPanel, false);
        const vent = this._box(1.0, 0.04, 0.65, x + 2.2, y + 3.335, z, this.materials.darkTrim, false);
        vent.scale.y = 1;
      }
    }
    const floorLight = new THREE.PointLight('#fff7da', 0.8, 34, 1.8);
    floorLight.position.set(0, y + 3.0, 0);
    this.scene.add(floorLight);
  }

  _addOfficeDetails(y, floor) {
    // AC units / ducts / wall signs make it feel more like a real office.
    for (const x of [-18, -2, 14]) {
      const ac = this._box(3.0, 0.42, 0.35, x, y + 3.05, -18.75, this.materials.white, false);
      const grille = this._box(2.4, 0.06, 0.04, x, y + 2.98, -18.55, this.materials.darkTrim, false);
      grille.scale.y = 1;
    }
    const floorNames = { 1: 'F1 Build Office', 2: 'F2 Review Wing', 3: 'F3 Recharge Zone' };
    this._wallSign(floorNames[floor] || `Floor ${floor}`, -22.78, y + 2.02, -15.2, Math.PI / 2, { width: 2.45, height: 0.44 });
    this._elevatorLobbyDetails(y, floor);
  }

  _elevatorLobbyDetails(y, floor) {
    const accent = floor === 3 ? '#0f766e' : floor === 2 ? '#334155' : '#2354d1';
    const plaqueMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.72 });
    const trimMat = this.materials.darkTrim;

    // Keep lift sightlines clean: directory is a side plaque, not a huge board behind the cabin.
    this._box(0.08, 1.35, 1.7, -3.04, y + 1.62, 16.35, plaqueMat, false);
    this._box(0.09, 1.45, 0.055, -3.08, y + 1.62, 15.46, trimMat, false);
    this._box(0.09, 1.45, 0.055, -3.08, y + 1.62, 17.24, trimMat, false);
    this._wallSign(`F${floor} Rooms`, -3.10, y + 2.15, 16.35, -Math.PI / 2, {
      width: 1.05,
      height: 0.26,
      backing: '#0f172a',
      bg: '#f8fafc',
      fg: '#0f172a'
    });
    const rooms = ROOMS.filter(room => room.floor === floor && room.id !== 'sky-cafe').slice(0, 4);
    rooms.forEach((room, idx) => {
      this._wallSign(room.name.replace('Leaderboard Command', 'Leaderboard'), -3.12, y + 1.82 - idx * 0.26, 15.72 + idx * 0.42, -Math.PI / 2, {
        width: 0.9,
        height: 0.16,
        backing: '#cbd5e1',
        bg: '#ffffff',
        fg: accent
      });
    });

    this._plant(-5.5, y, 14.1);
    this._plant(5.5, y, 14.1);

    if (floor === 3) {
      const trophyMat = new THREE.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.36, metalness: 0.35 });
      this._wallSign('Recharge Lobby', -4.0, y + 2.08, 17.65, Math.PI, { width: 1.55, height: 0.3, backing: '#0f172a', bg: '#ecfeff', fg: '#0f172a' });
      this._sofa(-4.6, y, 13.6, Math.PI / 2);
      this._box(1.2, 0.08, 0.42, 4.2, y + 1.38, 17.42, trophyMat, false);
      this._box(0.28, 0.48, 0.22, 3.75, y + 1.68, 17.42, trophyMat, false);
      this._box(0.28, 0.68, 0.22, 4.18, y + 1.78, 17.42, trophyMat, false);
      this._box(0.28, 0.38, 0.22, 4.62, y + 1.63, 17.42, trophyMat, false);
      this._wallSign('Games + Reset', -5.15, y + 1.58, 13.55, Math.PI / 2, { width: 1.45, height: 0.28, backing: '#134e4a', bg: '#f0fdfa', fg: '#134e4a' });
      this._wallArt(-1.7, y, 17.38, 'RESET', Math.PI, '#38bdf8');
      this._wallArt(1.7, y, 17.38, 'PLAY', Math.PI, '#22c55e');
      this._trophyWall(5.25, y, 16.95, Math.PI);
    }
  }
  _addAtrium() {
    // Atrium stairs were removed; floor travel is now handled by the physical lift only.
  }

  _addElevatorShaft() {
    for (let floor = 1; floor <= MAX_FLOOR; floor++) {
      const y = (floor - 1) * OFFICE_CONSTANTS.floorHeight;
      const frameMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.38, metalness: 0.42 });
      const wallMat = new THREE.MeshStandardMaterial({ color: '#eef4f8', roughness: 0.72 });
      const cabinMat = new THREE.MeshStandardMaterial({ color: '#dbe5ef', roughness: 0.48, metalness: 0.16 });
      const floorMat = new THREE.MeshStandardMaterial({ color: '#7f8fa3', roughness: 0.56, metalness: 0.18 });
      const railMat = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.36, metalness: 0.36 });
      const glowMat = new THREE.MeshBasicMaterial({ color: '#fff4cc' });

      const shell = new THREE.Group();
      shell.position.set(0, y, 0);
      this.scene.add(shell);
      this._trySignatureModel(`elevator-shell-f${floor}`, shell, { scale: 1 });

      this._box(5.15, 3.16, 0.18, 0, y + 1.58, 17.98, wallMat, false);
      this._box(4.08, 0.12, 2.62, 0, y + 0.06, 16.48, floorMat, false);
      this._box(4.08, 0.10, 2.62, 0, y + 2.94, 16.48, wallMat, false);
      this._box(0.12, 2.66, 2.62, -2.04, y + 1.48, 16.48, cabinMat, false);
      this._box(0.12, 2.66, 2.62, 2.04, y + 1.48, 16.48, cabinMat, false);
      this._box(4.04, 2.66, 0.12, 0, y + 1.48, 17.76, cabinMat, false);
      this._box(1.7, 0.035, 0.48, 0, y + 2.8, 16.22, glowMat, false);
      this._box(1.7, 0.035, 0.48, 0, y + 2.8, 16.86, glowMat, false);

      this._box(4.85, 0.24, 0.28, 0, y + 2.94, 15.08, frameMat, false);
      this._box(4.85, 0.18, 0.24, 0, y + 0.15, 15.08, frameMat, false);
      this._box(0.24, 2.92, 0.25, -2.28, y + 1.5, 15.08, frameMat, false);
      this._box(0.24, 2.92, 0.25, 2.28, y + 1.5, 15.08, frameMat, false);
      this._box(4.2, 0.05, 0.08, 0, y + 0.08, 14.78, railMat, false);
      this._box(4.2, 0.05, 0.08, 0, y + 2.86, 14.78, railMat, false);

      const doorMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.28, metalness: 0.42 });
      const seamMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.42, metalness: 0.28 });
      const leftDoor = this._box(1.20, 2.34, 0.07, -0.6, y + 1.36, 15.02, doorMat, false);
      const rightDoor = this._box(1.20, 2.34, 0.07, 0.6, y + 1.36, 15.02, doorMat, false);
      this._box(0.035, 2.24, 0.075, 0, y + 1.36, 14.98, seamMat, false);
      this._box(1.06, 0.05, 0.08, -0.6, y + 2.47, 14.96, seamMat, false);
      this._box(1.06, 0.05, 0.08, 0.6, y + 2.47, 14.96, seamMat, false);
      this.liftDoors.set(floor, {
        left: leftDoor,
        right: rightDoor,
        closedLeft: -0.6,
        closedRight: 0.6,
        openLeft: -1.58,
        openRight: 1.58,
        open: false
      });

      this._elevatorSign(floor, y);
      const indicator = this._elevatorIndicator(floor, y);
      this.liftIndicators.set(floor, indicator);
      this._elevatorInteriorButtons(floor, y);

      this._box(0.12, 0.74, 0.24, -2.52, y + 1.36, 14.86, frameMat, false);
      this._box(0.055, 0.18, 0.16, -2.59, y + 1.55, 14.84, glowMat, false);
      this._box(0.055, 0.12, 0.12, -2.59, y + 1.25, 14.84, glowMat, false);

      this._addBlocker(floor, -2.28, -1.93, 15.05, 17.95, 'lift side wall');
      this._addBlocker(floor, 1.93, 2.28, 15.05, 17.95, 'lift side wall');
      this._addBlocker(floor, -2.16, 2.16, 17.70, 18.05, 'lift back wall');
      this.interactables.push({
        id: `elevator-door-${floor}`,
        type: 'elevator-door',
        label: `Lift Floor ${floor}`,
        floor,
        position: [0, 0, 14.35],
        radius: 2.75,
        hint: 'Tekan E untuk membuka pintu lift. Masuk ke kabin lalu pilih tombol lantai di kanan.',
        worldY: y
      });
      this._addInteractableDebug(this.interactables[this.interactables.length - 1]);
    }
  }
  _buildRoomsAndFurniture() {
    for (const room of ROOMS) {
      const y = (room.floor - 1) * OFFICE_CONSTANTS.floorHeight;
      this._roomWalls(room, y);
      this._roomLabel(room, y);
      this._furnitureForRoom(room, y);
    }
    for (const meta of INTERACTIVES.filter(i => !i.id.startsWith('elevator'))) {
      const y = (meta.floor - 1) * OFFICE_CONSTANTS.floorHeight;
      this.interactables.push({ ...meta, worldY: y });
      this._addInteractableDebug({ ...meta, worldY: y });
    }
  }

  _roomWalls(room, y) {
    const { x1, x2, z1, z2 } = room;
    const h = 2.85;
    const glassThemes = ['meeting', 'open office', 'monitoring', 'gaming', 'recharge'];
    const mat = glassThemes.includes(room.theme) ? this.materials.glass : this.materials.accentWall;
    const wy = y + h / 2;
    // Use glass partitions with intentional door gaps so movement feels practical.
    this._wallWithGap(x1, x2, z1, 'horizontal', y, mat, room.theme === 'meeting' ? 3.8 : 4.2);
    this._wallWithGap(x1, x2, z2, 'horizontal', y, mat, 4.0);
    this._wallWithGap(z1, z2, x1, 'vertical', y, mat, 3.6);
    this._wallWithGap(z1, z2, x2, 'vertical', y, mat, 3.6);

    // black glass frames / base trims.
    const trimMat = this.materials.darkTrim;
    this._box(x2-x1, 0.08, 0.09, (x1+x2)/2, y + 0.06, z1, trimMat, false);
    this._box(x2-x1, 0.08, 0.09, (x1+x2)/2, y + 0.06, z2, trimMat, false);
    this._box(0.09, 0.08, z2-z1, x1, y + 0.06, (z1+z2)/2, trimMat, false);
    this._box(0.09, 0.08, z2-z1, x2, y + 0.06, (z1+z2)/2, trimMat, false);
    const topY = y + 2.78;
    this._box(x2-x1, 0.08, 0.1, (x1+x2)/2, topY, z1, trimMat, false);
    this._box(x2-x1, 0.08, 0.1, (x1+x2)/2, topY, z2, trimMat, false);
    this._box(0.1, 0.08, z2-z1, x1, topY, (z1+z2)/2, trimMat, false);
    this._box(0.1, 0.08, z2-z1, x2, topY, (z1+z2)/2, trimMat, false);
  }

  _wallWithGap(a1, a2, fixed, orientation, y, mat, gapWidth = 3.0) {
    const mid = (a1 + a2) / 2;
    const gap1 = mid - gapWidth/2;
    const gap2 = mid + gapWidth/2;
    const h = 2.65;
    const floor = this._floorFromY(y);
    const makeSeg = (s1, s2) => {
      if (s2 - s1 < 0.8) return;
      if (orientation === 'horizontal') {
        this._box(s2-s1, h, 0.08, (s1+s2)/2, y+h/2, fixed, mat, false);
        this._addBlocker(floor, s1, s2, fixed - 0.12, fixed + 0.12, 'glass wall');
      } else {
        this._box(0.08, h, s2-s1, fixed, y+h/2, (s1+s2)/2, mat, false);
        this._addBlocker(floor, fixed - 0.12, fixed + 0.12, s1, s2, 'glass wall');
      }
    };
    makeSeg(a1, gap1);
    makeSeg(gap2, a2);
    // Glass sliding doors sit open by default and auto-close softly when the player walks away.
    const doorMat = this.materials.doorGlass;
    if (orientation === 'horizontal') {
      const left = this._box(gapWidth * 0.36, 2.35, 0.045, gap1 + gapWidth * 0.18, y + 1.18, fixed, doorMat, false);
      const right = this._box(gapWidth * 0.36, 2.35, 0.045, gap2 - gapWidth * 0.18, y + 1.18, fixed, doorMat, false);
      this.roomDoors.push({
        floor,
        orientation,
        fixed,
        center: [(gap1 + gap2) / 2, fixed],
        left,
        right,
        closedLeft: gap1 + gapWidth * 0.18,
        closedRight: gap2 - gapWidth * 0.18,
        openLeft: gap1 - gapWidth * 0.08,
        openRight: gap2 + gapWidth * 0.08
      });
    } else {
      const left = this._box(0.045, 2.35, gapWidth * 0.36, fixed, y + 1.18, gap1 + gapWidth * 0.18, doorMat, false);
      const right = this._box(0.045, 2.35, gapWidth * 0.36, fixed, y + 1.18, gap2 - gapWidth * 0.18, doorMat, false);
      this.roomDoors.push({
        floor,
        orientation,
        fixed,
        center: [fixed, (gap1 + gap2) / 2],
        left,
        right,
        closedLeft: gap1 + gapWidth * 0.18,
        closedRight: gap2 - gapWidth * 0.18,
        openLeft: gap1 - gapWidth * 0.08,
        openRight: gap2 + gapWidth * 0.08
      });
    }
  }

  _roomLabel(room, y) {
    this._doorSign(room, y);
  }

  _furnitureForRoom(room, y) {
    const cx = (room.x1 + room.x2) / 2;
    const cz = (room.z1 + room.z2) / 2;
    switch (room.theme) {
      case 'reception':
        this._receptionDesk(cx-2, y, room.z1+1.8);
        this._plant(room.x1+1.5, y, room.z2-1.3);
        this._sofa(room.x2-2.4, y, room.z2-1.9, Math.PI / 2);
        this._wallArt(room.x1 + 1.6, y, room.z1 + 0.22, 'WELCOME', 0, '#2563eb');
        this._modernRug(cx, y, room.z1 + 3.1, 5.4, 1.6, '#dbeafe');
        break;
      case 'open office':
        for (let x = room.x1+3; x < room.x2-1; x += 4.2) this._deskCluster(x, y, cz, 0);
        this._standingScreen(5.2, y, -13.2, 'LLM Terminal', 1);
        this._wallArt(room.x1 + 1.5, y, room.z2 - 0.2, 'BUILD  TEST  LEARN', Math.PI, '#0f766e');
        break;
      case 'meeting':
        this._conferenceTable(cx, y, cz);
        this._whiteboard(room.x2 - 0.18, y, cz, -Math.PI / 2, { label: 'Strategy Board' });
        this._standingScreen(room.x1 + 1.35, y, room.z2 - 1.15, 'CV vs LB', 1);
        this._strategyLight(room.x2 - 0.9, y, room.z2 - 1.1, Math.PI / 2);
        this._progressWall(room.x1 + 0.18, y, cz, Math.PI / 2);
        break;
      case 'data':
        this._standingScreen(room.x1+2.2, y, room.z1+1.2, 'Data Audit', 1);
        this._deskCluster(cx-2, y, cz-2, Math.PI/2);
        this._deskCluster(cx+2, y, cz+2, Math.PI/2);
        this._shelf(room.x2-1, y, room.z2-2);
        this._dataCrates(room.x1 + 2.2, y, room.z2 - 2.2);
        this._wallArt(room.x1 + 0.22, y, cz, 'SCHEMA WALL', Math.PI / 2, '#0284c7');
        this._deskNoteProp(-16.8, y, 2.25, Math.PI / 2, '#fde68a');
        break;
      case 'ml':
        this._standingScreen(room.x2-1.1, y, room.z1+1.4, 'Model Board', 1);
        this._deskCluster(cx-2.3, y, cz-1.4, 0);
        this._deskCluster(cx+2.2, y, cz+1.4, Math.PI);
        this._serverRack(room.x1+1.2, y, room.z2-2);
        this._wallArt(room.x2 - 0.22, y, cz, 'VALIDATION LOCKED', -Math.PI / 2, '#7c3aed');
        this._deskNoteProp(3.2, y, 7.85, Math.PI, '#bfdbfe');
        break;
      case 'break':
      case 'rest':
        this._cafeCounter(room.x1+1.6, y, room.z2-2);
        this._sofa(cx-2, y, cz, 0);
        this._sofa(cx+2, y, cz+2.3, Math.PI);
        this._plant(room.x2-1.2, y, room.z1+1.2);
        this._coffeeMachine(room.x1 + 1.0, y, room.z2 - 3.0, Math.PI / 2, room.floor === 1 ? 'coffee-machine-f1' : 'coffee-machine-f2');
        this._modernRug(cx, y, cz + 1.3, 4.7, 1.8, '#e0f2fe');
        break;
      case 'audit':
        this._conferenceTable(cx, y, cz);
        this._standingScreen(cx+3, y, room.z1+1.2, 'Review Gate', 1);
        this._wallArt(room.x1 + 0.18, y, cz, 'RED  YELLOW  GREEN', Math.PI / 2, '#dc2626');
        this._deskNoteProp(-15.2, y, -10.2, 0, '#fecaca');
        break;
      case 'monitoring':
        this._standingScreen(cx-3.5, y, room.z1+1.2, 'Leaderboard', 1);
        this._standingScreen(cx, y, room.z1+1.2, 'Submissions', 1);
        this._standingScreen(cx+3.5, y, room.z1+1.2, 'Experiments', 1);
        this._deskCluster(cx, y, cz+2, 0);
        break;
      case 'reading':
        this._shelf(room.x1+1.2, y, cz);
        this._shelf(room.x2-1.2, y, cz);
        this._deskCluster(cx, y, cz+1.8, 0);
        break;
      case 'focus':
        for (let x = room.x1+3; x < room.x2-1; x += 4) this._focusPod(x, y, cz);
        this._wallArt(room.x2 - 0.18, y, room.z2 - 2.2, 'FOCUS CORNER', -Math.PI / 2, '#0f766e');
        break;
      case 'teaching':
        this._whiteboard(cx - 1.8, y, room.z1 + 0.12, 0);
        this._conferenceTable(cx, y, cz+1.5);
        this._standingScreen(cx+3.7, y, room.z1+1.2, 'Learning Path', 1);
        break;
      case 'recharge':
        this._sofa(cx-2.6, y, cz+0.5, 0);
        this._beanBag(cx+1.2, y, cz-2.2, '#60a5fa');
        this._beanBag(cx+3.4, y, cz+1.8, '#94a3b8');
        this._coffeeTable(cx, y, cz+2.1);
        this._plant(room.x1+1.2, y, room.z2-1.2);
        this._wallClock(room.x2-0.22, y, room.z1+3.0, Math.PI / 2);
        this._modernRug(cx, y, cz + 1.1, 5.6, 2.0, '#e0f2fe');
        break;
      case 'gaming':
        this._arcadeCabinet(-4.5, y, -10.2, 'Kaggle Quiz');
        this._arcadeCabinet(-1.4, y, -10.2, 'Leak Hunter');
        this._arcadeCabinet(1.8, y, -10.2, 'Typing Sprint');
        this._arcadeCabinet(5, y, -10.2, 'Memory Match');
        this._gameTable(cx-3, y, cz+1.8);
        this._standingScreen(cx+3.4, y, room.z1+1.1, 'Game Scores', 1);
        this._trashBin(room.x1+1.1, y, room.z2-1.1);
        break;
      case 'reflection':
        this._whiteboard(cx, y, room.z1 + 0.12, 0);
        this._focusPod(cx, y, cz+1.0);
        this._plant(room.x2-1.2, y, room.z2-1.2);
        this._wallArt(room.x2 - 0.2, y, cz, 'LESSONS LEARNED', -Math.PI / 2, '#64748b');
        break;
      case 'sky rest':
        this._cafeCounter(room.x1+3, y, room.z2-2);
        this._sofa(cx-5, y, cz, Math.PI / 2);
        this._sofa(cx+5, y, cz, -Math.PI / 2);
        this._plant(room.x2-1.4, y, room.z1+1.2);
        this._coffeeMachine(room.x1 + 3.0, y, room.z2 - 3.1, Math.PI / 2, 'coffee-machine-f3');
        this._wallArt(cx, y, room.z2 - 0.18, 'SKY COFFEE BAR', Math.PI, '#0f766e');
        break;
      default:
        this._deskCluster(cx, y, cz, 0);
    }
  }

  _buildAgents() {
    for (const agent of AGENTS) {
      const y = (agent.floor - 1) * OFFICE_CONSTANTS.floorHeight;
      const group = this._humanoid(agent, y);
      group.position.set(agent.position[0], y, agent.position[2]);
      group.userData = { type: 'agent', agentId: agent.id, label: `${agent.name} - ${agent.role}`, activity: agent.defaultActivity || 'working' };
      this.scene.add(group);
      this.agentGroups.set(agent.id, group);
      this.agentHome.set(agent.id, {
        floor: agent.floor,
        worldY: y,
        position: [agent.position[0], 0, agent.position[2]],
        waypoints: agent.waypoints || [[agent.position[0], 0, agent.position[2]]],
        activitySet: agent.activitySet || ['working', 'walking', 'thinking'],
        defaultActivity: agent.defaultActivity || 'working'
      });
      this.agentStates.set(agent.id, { targetIndex: 1, pause: 0.15 + Math.random() * 0.65, activity: agent.defaultActivity || 'working' });
      this.interactables.push({ id: agent.id, type: 'agent', label: `${agent.name} - ${agent.role}`, floor: agent.floor, position: [agent.position[0], 0, agent.position[2]], radius: 3.3, hint: `Tekan E untuk bicara dengan ${agent.name}.`, agentId: agent.id, worldY: y });
    }
  }

  _humanoid(agent, y) {
    const group = new THREE.Group();
    const accent = new THREE.MeshStandardMaterial({ color: agent.color, roughness: 0.52, metalness: 0.04 });
    const skin = new THREE.MeshStandardMaterial({ color: '#d8a47f', roughness: 0.65 });
    const dark = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.56 });
    const shirt = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.72 });

    const legGeo = new THREE.CylinderGeometry(0.13, 0.15, 0.78, 12);
    const leg1 = new THREE.Mesh(legGeo, dark); leg1.position.set(-0.16, 0.42, 0); leg1.castShadow = true; group.add(leg1);
    const leg2 = new THREE.Mesh(legGeo, dark); leg2.position.set(0.16, 0.42, 0); leg2.castShadow = true; group.add(leg2);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.72, 8, 16), accent); body.position.set(0, 1.15, 0); body.castShadow = true; group.add(body);
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.16, 0.08), shirt); collar.position.set(0, 1.56, -0.31); group.add(collar);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 24, 16), skin); head.position.set(0, 1.85, 0); head.castShadow = true; group.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.285, 24, 10, 0, Math.PI*2, 0, Math.PI/2), dark); hair.position.set(0, 1.94, -0.01); hair.castShadow = true; group.add(hair);
    const armGeo = new THREE.CapsuleGeometry(0.08, 0.58, 8, 10);
    const arm1 = new THREE.Mesh(armGeo, skin); arm1.position.set(-0.43, 1.22, 0.02); arm1.rotation.z = 0.24; arm1.castShadow = true; group.add(arm1);
    const arm2 = new THREE.Mesh(armGeo, skin); arm2.position.set(0.43, 1.22, 0.02); arm2.rotation.z = -0.24; arm2.castShadow = true; group.add(arm2);

    const laptop = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.035, 0.3), this.materials.monitor); laptop.position.set(0.05, 1.05, -0.37); laptop.rotation.x = -0.3; group.add(laptop);
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#0f172a' });
    const eyeGeo = new THREE.SphereGeometry(0.032, 10, 8);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat); leftEye.position.set(-0.09, 1.88, -0.245); group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat); rightEye.position.set(0.09, 1.88, -0.245); group.add(rightEye);
    const browMat = new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.62 });
    const brow1 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.018, 0.012), browMat); brow1.position.set(-0.09, 1.96, -0.25); brow1.rotation.z = 0.16; group.add(brow1);
    const brow2 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.018, 0.012), browMat); brow2.position.set(0.09, 1.96, -0.25); brow2.rotation.z = -0.16; group.add(brow2);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.11, 8), skin); nose.position.set(0, 1.82, -0.27); nose.rotation.x = Math.PI / 2; group.add(nose);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.025), this.materials.white); badge.position.set(0.18, 1.24, -0.33); group.add(badge);
    const label = labelSprite(`${agent.name} ${agent.role}`, { bg: 'rgba(255,255,255,0.92)' });
    label.position.set(0, 2.58, 0);
    label.scale.set(2.1, 0.62, 1);
    group.add(label);
    group.userData.parts = { head, arm1, arm2, laptop, leftEye, rightEye };
    return group;
  }

  _bindEvents() {
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('mousemove', (e) => {
      if (!this.controls.isLocked) return;
      const jump = Math.abs(e.movementX || 0) > 240 || Math.abs(e.movementY || 0) > 190;
      if (!jump) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const now = performance.now();
      if (now - this.lastMouseGuardAt > 1200) {
        this.lastMouseGuardAt = now;
        this.callbacks.onHint?.('Gerakan mouse ekstrem diabaikan agar kamera tidak tiba-tiba berputar.');
      }
    }, true);
    document.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      this.keys.add(e.code);
      if (e.code === 'Tab') {
        e.preventDefault();
        if (this.seatMode) this.standFromSeat();
        this.unlock();
      }
      if (e.code === 'Escape' && this.seatMode) this.standFromSeat();
      if (e.code === 'KeyE') this.interact();
      if (e.code === 'KeyP') this.callbacks.onTogglePanel?.();
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    this.controls.addEventListener('lock', () => this.callbacks.onLockChange?.(true));
    this.controls.addEventListener('unlock', () => this.callbacks.onLockChange?.(false));
  }

  lock() { this.controls.lock(); }
  unlock() { this.controls.unlock(); }
  isLocked() { return this.controls.isLocked; }
  setLookSensitivity(value) { this.controls.pointerSpeed = THREE.MathUtils.clamp(Number(value) || DEFAULT_LOOK_SENSITIVITY, 0.25, 1.8); }
  setNpcBehaviorEnabled(enabled) { this.agentBehaviorEnabled = Boolean(enabled); }
  setLiftDoors(open, floor = this.currentFloor) {
    const data = this.liftDoors.get(floor);
    if (!data) return;
    data.open = Boolean(open);
    this.liftState.doorOpen = Boolean(open);
  }
  setCollisionDebugEnabled(enabled) {
    this.collisionDebugGroup.visible = Boolean(enabled);
  }
  setStrategyLight(mode = 'idle') {
    if (!this.strategyLightMesh) return;
    const colors = { idle: '#94a3b8', meeting: '#f59e0b', done: '#22c55e', risk: '#ef4444' };
    this.strategyLightMesh.material.color.set(colors[mode] || colors.idle);
  }
  setQACamera(view = {}) {
    const floor = THREE.MathUtils.clamp(Number(view.floor) || this.currentFloor || 1, 1, MAX_FLOOR);
    const x = Number(view.x ?? 0);
    const z = Number(view.z ?? 0);
    const y = (floor - 1) * OFFICE_CONSTANTS.floorHeight + OFFICE_CONSTANTS.eyeHeight;
    this.currentFloor = floor;
    this.camera.position.set(x, y, z);
    if (Array.isArray(view.lookAt)) {
      const dx = Number(view.lookAt[0]) - x;
      const dz = Number(view.lookAt[1]) - z;
      this.camera.rotation.set(0, Math.atan2(-dx, -dz), 0);
    } else {
      const yaw = THREE.MathUtils.degToRad(Number(view.yaw || 0));
      const pitch = THREE.MathUtils.degToRad(Number(view.pitch || 0));
      this.camera.rotation.set(pitch, yaw, 0);
    }
    this.lastRoom = this.roomAtCamera();
    this.callbacks.onFloorChange?.(this.currentFloor, this.lastRoom);
    this.callbacks.onHint?.(`QA camera: ${view.label || this.lastRoom}`);
  }
  isPositionClear(x, z, floor = this.currentFloor, radius = 0.36) {
    const pos = new THREE.Vector3(x, (floor - 1) * OFFICE_CONSTANTS.floorHeight + OFFICE_CONSTANTS.eyeHeight, z);
    return !this._isBlockedAt(pos, floor, radius);
  }
  isNearElevator() {
    const pos = this.camera.position;
    return this.interactables.some((meta) => {
      if (!['elevator-door', 'elevator-button'].includes(meta.type) || meta.floor !== this.currentFloor) return false;
      const floorY = (meta.floor - 1) * OFFICE_CONSTANTS.floorHeight;
      const target = new THREE.Vector3(meta.position[0], floorY + OFFICE_CONSTANTS.eyeHeight, meta.position[2]);
      return pos.distanceTo(target) < (meta.radius || OFFICE_CONSTANTS.interactDistance) + 0.6;
    });
  }

  enterElevator() {
    if (this.liftState.busy) return false;
    this.liftState.inside = true;
    this.liftState.phase = 'boarding';
    this.setLiftDoors(true, this.currentFloor);
    this.callbacks.onHint?.('Masuk ke kabin lift, lihat panel tombol di kanan, lalu tekan E pada F1/F2/F3.');
    return true;
  }

  async requestLiftRide(targetFloor) {
    const target = THREE.MathUtils.clamp(Number(targetFloor) || 1, 1, MAX_FLOOR);
    if (this.liftState.busy) return false;
    if (!this._isInLiftCabin()) {
      this.enterElevator();
      return false;
    }
    this.liftState.inside = true;
    if (target === this.currentFloor) {
      this.callbacks.onLiftButtonClick?.();
      this.setLiftDoors(true, this.currentFloor);
      this.callbacks.onHint?.(`Sudah di lantai ${target}. Pintu lift terbuka.`);
      return false;
    }
    this.liftState.busy = true;
    this.liftState.targetFloor = target;
    this.liftState.phase = 'closing';
    this.callbacks.onLiftButtonClick?.();
    this.callbacks.onHint?.(`Lift menuju lantai ${target}. Pintu menutup...`);
    this._snapPlayerToLiftCabin(this.currentFloor);
    this.setLiftDoors(false, this.currentFloor);
    await this._sleep(680);
    this.liftState.phase = 'moving';
    this.callbacks.onLiftMoveStart?.();
    this.callbacks.onHint?.(`Lift bergerak ke lantai ${target}...`);
    this._animateIndicatorTravel(this.currentFloor, target);
    await this._sleep(1050);
    this._moveToLiftCabin(target);
    this.callbacks.onLiftDing?.();
    this.setLiftDoors(true, target);
    this.liftState.phase = 'arrived';
    this.callbacks.onHint?.(`Ding. Tiba di lantai ${target}. Silakan keluar dari lift.`);
    await this._sleep(380);
    this.liftState.busy = false;
    this.liftState.phase = 'idle';
    return true;
  }

  startCoffeeSequence(id) {
    const machine = this.coffeeMachines.get(id) || [...this.coffeeMachines.values()].find(item => item.floor === this.currentFloor);
    if (!machine || machine.busy) return false;
    machine.busy = true;
    machine.start = performance.now();
    machine.until = machine.start + 3600;
    machine.indicator.material.color.set('#f59e0b');
    machine.screen.material.color.set('#38bdf8');
    machine.fill.visible = true;
    machine.fill.scale.y = 0.05;
    machine.cup.rotation.z = -0.05;
    for (const steam of machine.steam) {
      steam.visible = true;
      steam.material.opacity = 0;
    }
    window.setTimeout(() => {
      if (!machine) return;
      machine.indicator.material.color.set('#22c55e');
      machine.screen.material.color.set('#86efac');
    }, 2800);
    window.setTimeout(() => {
      if (!machine) return;
      machine.busy = false;
      machine.cup.rotation.z = 0;
      for (const steam of machine.steam) steam.visible = false;
    }, 4200);
    return true;
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  teleportToWarRoom() {
    this.currentFloor = 1;
    this.camera.position.set(17, OFFICE_CONSTANTS.eyeHeight, -6.8);
    this.callbacks.onFloorChange?.(1, 'Glass War Room');
  }

  toggleFloor() {
    this.currentFloor = this.currentFloor === MAX_FLOOR ? 1 : this.currentFloor + 1;
    this._moveToLiftFloor(this.currentFloor);
  }

  goToFloor(floor) {
    const target = THREE.MathUtils.clamp(Number(floor) || 1, 1, MAX_FLOOR);
    this.setLiftDoors(false, this.currentFloor);
    this.currentFloor = target;
    this._moveToLiftFloor(target);
    this.setLiftDoors(true, target);
  }

  _moveToLiftFloor(floor) {
    this.currentFloor = THREE.MathUtils.clamp(Number(floor) || 1, 1, MAX_FLOOR);
    const y = (this.currentFloor - 1) * OFFICE_CONSTANTS.floorHeight + OFFICE_CONSTANTS.eyeHeight;
    const landing = this._safeLandingForFloor(this.currentFloor);
    this.camera.position.set(landing[0], y, landing[1]);
    this.lastRoom = this.roomAtCamera();
    this.callbacks.onFloorChange?.(this.currentFloor, this.lastRoom);
  }

  _moveToLiftCabin(floor) {
    this.currentFloor = THREE.MathUtils.clamp(Number(floor) || 1, 1, MAX_FLOOR);
    this.liftState.currentFloor = this.currentFloor;
    this.liftState.inside = true;
    const y = (this.currentFloor - 1) * OFFICE_CONSTANTS.floorHeight + OFFICE_CONSTANTS.eyeHeight;
    this.camera.position.set(0, y, 16.36);
    this.lastRoom = this.roomAtCamera();
    this._setElevatorIndicator(this.currentFloor, `F${this.currentFloor}`);
    this.callbacks.onFloorChange?.(this.currentFloor, this.lastRoom);
  }

  _snapPlayerToLiftCabin(floor = this.currentFloor) {
    const y = (floor - 1) * OFFICE_CONSTANTS.floorHeight + OFFICE_CONSTANTS.eyeHeight;
    this.camera.position.set(0, y, 16.36);
  }

  _isInLiftCabin() {
    const p = this.camera.position;
    const y = (this.currentFloor - 1) * OFFICE_CONSTANTS.floorHeight + OFFICE_CONSTANTS.eyeHeight;
    return Math.abs(p.y - y) < 0.2 && p.x > -1.75 && p.x < 1.75 && p.z > 15.18 && p.z < 17.45;
  }

  _animateIndicatorTravel(from, target) {
    const floors = [];
    const step = target > from ? 1 : -1;
    for (let f = from; f !== target + step; f += step) floors.push(f);
    floors.forEach((floor, idx) => {
      window.setTimeout(() => this._setElevatorIndicator(this.currentFloor, `F${floor}`), idx * 280);
    });
  }

  _sleep(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  _safeLandingForFloor(floor) {
    const candidates = SAFE_LIFT_LANDINGS[floor] || [[0, 15.85]];
    return candidates.find(([x, z]) => this.isPositionClear(x, z, floor, 0.48)) || SAFE_SPAWNS[floor] || [0, 15.85];
  }

  gatherTeam() {
    const seats = [
      [14.1, 0, -10.2], [15.8, 0, -12.4], [17.4, 0, -12.4], [19.1, 0, -10.2],
      [17.4, 0, -8.2], [15.8, 0, -8.2], [19.5, 0, -12.4], [14.1, 0, -8.2]
    ];
    this.teamGathered = true;
    AGENTS.forEach((agent, idx) => {
      const group = this.agentGroups.get(agent.id);
      const p = seats[idx % seats.length];
      const y = 0;
      group.position.set(p[0], y, p[2]);
      group.userData.activity = 'meeting';
      this._faceObjectYaw(group, 17, -10.5);
      const meta = this.interactables.find(i => i.id === agent.id);
      if (meta) { meta.floor = 1; meta.worldY = 0; meta.position = [p[0], 0, p[2]]; }
    });
  }

  dismissTeam() {
    this.teamGathered = false;
    AGENTS.forEach((agent) => {
      const group = this.agentGroups.get(agent.id);
      const home = this.agentHome.get(agent.id);
      if (!group || !home) return;
      group.position.set(home.position[0], home.worldY, home.position[2]);
      group.userData.activity = home.defaultActivity;
      const state = this.agentStates.get(agent.id);
      if (state) { state.targetIndex = 0; state.pause = 1.2; state.activity = home.defaultActivity; }
      const meta = this.interactables.find(i => i.id === agent.id);
      if (meta) {
        meta.floor = home.floor;
        meta.worldY = home.worldY;
        meta.position = [...home.position];
      }
    });
  }

  interact() {
    if (this.seatMode) {
      this.standFromSeat();
      return;
    }
    this._updateNearest();
    if (!this.nearest) return;
    if (this.nearest.type === 'seat') {
      this.enterSeat(this.nearest);
      return;
    }
    this.callbacks.onInteract?.(this.nearest);
  }

  enterSeat(meta) {
    const floorY = (meta.floor - 1) * OFFICE_CONSTANTS.floorHeight;
    this.currentFloor = meta.floor;
    this.seatMode = {
      active: true,
      seatId: meta.id,
      label: meta.label,
      kind: meta.kind || 'seat',
      floor: meta.floor,
      position: [...meta.position],
      standPosition: meta.standPosition || [...meta.position],
      lookAt: meta.lookAt || null
    };
    this.camera.position.set(meta.position[0], floorY + OFFICE_CONSTANTS.eyeHeight, meta.position[2]);
    if (meta.lookAt) {
      const dx = meta.lookAt[0] - meta.position[0];
      const dz = meta.lookAt[2] - meta.position[2];
      this.camera.rotation.set(0, Math.atan2(-dx, -dz), 0);
    }
    this.unlock();
    this.callbacks.onFloorChange?.(this.currentFloor, this.roomAtCamera());
    this.callbacks.onSeatChange?.(this.seatMode);
    this.callbacks.onHint?.(`Duduk di ${meta.label}. Tekan E, Tab, atau Esc untuk berdiri.`);
  }

  standFromSeat() {
    if (!this.seatMode) return;
    const floorY = (this.seatMode.floor - 1) * OFFICE_CONSTANTS.floorHeight;
    const stand = this.seatMode.standPosition || this.seatMode.position;
    this.camera.position.set(stand[0], floorY + OFFICE_CONSTANTS.eyeHeight, stand[2]);
    this.currentFloor = this.seatMode.floor;
    this.seatMode = null;
    this.callbacks.onSeatChange?.({ active: false, seatId: '', label: '' });
    this.callbacks.onFloorChange?.(this.currentFloor, this.roomAtCamera());
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const dt = Math.min(0.05, this.clock.getDelta());
    this._move(dt);
    this._updateNearest();
    this._animateAgents(dt);
    this._animateLiftDoors(dt);
    this._animateRoomDoors(dt);
    this._animateCoffee(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _animateCoffee(dt) {
    const now = performance.now();
    for (const machine of this.coffeeMachines.values()) {
      if (!machine.busy) continue;
      const t = THREE.MathUtils.clamp((now - machine.start) / 3600, 0, 1);
      machine.fill.scale.y = THREE.MathUtils.damp(machine.fill.scale.y, Math.max(0.05, t), 8, dt);
      machine.fill.position.y = 0.79 + 0.035 * machine.fill.scale.y;
      machine.cup.rotation.z = Math.sin(now * 0.018) * 0.025;
      machine.screen.scale.x = 1 + Math.sin(now * 0.009) * 0.03;
      machine.steam.forEach((steam, idx) => {
        const phase = t * Math.PI * 2 + idx * 0.85;
        steam.position.y = 0.98 + Math.sin(phase) * 0.05 + t * 0.28;
        steam.position.x = -0.08 + idx * 0.08 + Math.sin(phase * 1.7) * 0.025;
        steam.material.opacity = t < 0.12 ? t * 2.2 : Math.max(0, 0.46 - t * 0.3);
      });
    }
  }

  _animateLiftDoors(dt) {
    for (const data of this.liftDoors.values()) {
      const leftTarget = data.open ? data.openLeft : data.closedLeft;
      const rightTarget = data.open ? data.openRight : data.closedRight;
      data.left.position.x = THREE.MathUtils.damp(data.left.position.x, leftTarget, 9, dt);
      data.right.position.x = THREE.MathUtils.damp(data.right.position.x, rightTarget, 9, dt);
    }
  }

  _animateRoomDoors(dt) {
    const p = this.camera.position;
    for (const door of this.roomDoors) {
      if (door.floor !== this.currentFloor) continue;
      const dist = Math.hypot(p.x - door.center[0], p.z - door.center[1]);
      const open = dist < 3.0;
      const leftTarget = open ? door.openLeft : door.closedLeft;
      const rightTarget = open ? door.openRight : door.closedRight;
      if (door.orientation === 'horizontal') {
        door.left.position.x = THREE.MathUtils.damp(door.left.position.x, leftTarget, 7.5, dt);
        door.right.position.x = THREE.MathUtils.damp(door.right.position.x, rightTarget, 7.5, dt);
      } else {
        door.left.position.z = THREE.MathUtils.damp(door.left.position.z, leftTarget, 7.5, dt);
        door.right.position.z = THREE.MathUtils.damp(door.right.position.z, rightTarget, 7.5, dt);
      }
    }
  }

  _move(dt) {
    if (!this.controls.isLocked) return;
    if (this.seatMode) return;
    if (this.liftState.busy) return;
    const speed = OFFICE_CONSTANTS.moveSpeed * (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? OFFICE_CONSTANTS.sprintMultiplier : 1);
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const move = new THREE.Vector3();
    if (this.keys.has('KeyW')) move.add(forward);
    if (this.keys.has('KeyS')) move.sub(forward);
    if (this.keys.has('KeyD')) move.add(right);
    if (this.keys.has('KeyA')) move.sub(right);
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * dt);
      const nextX = this.camera.position.clone();
      nextX.x = THREE.MathUtils.clamp(nextX.x + move.x, -22.7, 22.7);
      nextX.y = (this.currentFloor - 1) * OFFICE_CONSTANTS.floorHeight + OFFICE_CONSTANTS.eyeHeight;
      if (!this._isBlocked(nextX)) this.camera.position.x = nextX.x;

      const nextZ = this.camera.position.clone();
      nextZ.z = THREE.MathUtils.clamp(nextZ.z + move.z, -17.7, 17.7);
      nextZ.y = (this.currentFloor - 1) * OFFICE_CONSTANTS.floorHeight + OFFICE_CONSTANTS.eyeHeight;
      if (!this._isBlocked(nextZ)) this.camera.position.z = nextZ.z;
      this.camera.position.y = (this.currentFloor - 1) * OFFICE_CONSTANTS.floorHeight + OFFICE_CONSTANTS.eyeHeight;
      const room = this.roomAtCamera();
      if (room !== this.lastRoom) {
        this.lastRoom = room;
        this.callbacks.onFloorChange?.(this.currentFloor, room);
      }
      this.liftState.inside = this._isInLiftCabin();
    }
  }

  _animateAgents(dt) {
    const time = performance.now() * 0.001;
    for (const agent of AGENTS) {
      const group = this.agentGroups.get(agent.id);
      if (!group) continue;
      const cam = this.camera.position;
      const nearPlayer = Math.abs(group.position.y + OFFICE_CONSTANTS.eyeHeight - cam.y) < 3.0 && group.position.distanceTo(new THREE.Vector3(cam.x, group.position.y, cam.z)) < 4.4;
      if (!this.teamGathered && this.agentBehaviorEnabled && !nearPlayer) this._wanderAgent(agent, group, dt);
      if (nearPlayer) this._faceObjectYaw(group, cam.x, cam.z);
      this._poseAgent(group, time, dt, nearPlayer);
    }
  }

  _wanderAgent(agent, group, dt) {
    const home = this.agentHome.get(agent.id);
    const state = this.agentStates.get(agent.id);
    if (!home || !state || home.waypoints.length < 2) return;
    if (state.pause > 0) {
      state.pause -= dt;
      group.userData.activity = state.activity;
      return;
    }
    const target = home.waypoints[state.targetIndex % home.waypoints.length];
    group.userData.activity = 'walking';
    const dx = target[0] - group.position.x;
    const dz = target[2] - group.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.18) {
      state.targetIndex = (state.targetIndex + 1) % home.waypoints.length;
      const activities = home.activitySet || ['working'];
      state.activity = activities[state.targetIndex % activities.length];
      state.pause = 0.45 + Math.random() * 1.1;
      return;
    }
    const speed = 1.15;
    group.position.x += (dx / dist) * speed * dt;
    group.position.z += (dz / dist) * speed * dt;
    group.position.y = home.worldY;
    this._faceObjectYaw(group, target[0], target[2]);
    const meta = this.interactables.find(i => i.id === agent.id);
    if (meta) {
      meta.floor = home.floor;
      meta.worldY = home.worldY;
      meta.position = [group.position.x, 0, group.position.z];
    }
  }

  _poseAgent(group, time, dt, attentive = false) {
    const parts = group.userData.parts || {};
    const activity = attentive ? 'thinking' : group.userData.activity || 'working';
    if (parts.head) {
      parts.head.position.y = 1.85 + Math.sin(time * 1.4 + group.id) * 0.012;
      parts.head.rotation.y = attentive ? Math.sin(time * 1.8) * 0.18 : Math.sin(time * 0.6 + group.id) * 0.08;
    }
    if (parts.arm1 && parts.arm2) {
      const typing = activity === 'typing' || activity === 'working';
      const writing = activity === 'whiteboard';
      const walk = activity === 'walking';
      parts.arm1.rotation.z = typing ? 0.62 + Math.sin(time * 7) * 0.08 : writing ? -0.35 : walk ? Math.sin(time * 5) * 0.28 : 0.22;
      parts.arm2.rotation.z = typing ? -0.62 + Math.cos(time * 7) * 0.08 : writing ? -0.9 + Math.sin(time * 4) * 0.08 : walk ? -Math.sin(time * 5) * 0.28 : -0.22;
      parts.arm1.rotation.x = typing ? 0.45 : writing ? -0.42 : 0;
      parts.arm2.rotation.x = typing ? 0.45 : writing ? -0.65 : 0;
    }
  }

  _updateNearest() {
    if (this.seatMode) {
      this.nearest = null;
      this.callbacks.onHint?.(`Duduk di ${this.seatMode.label}. Tekan E, Tab, atau Esc untuk berdiri.`);
      return;
    }
    const pos = this.camera.position;
    let best = null;
    let bestDist = Infinity;
    for (const meta of this.interactables) {
      const floorY = (meta.floor - 1) * OFFICE_CONSTANTS.floorHeight;
      const target = new THREE.Vector3(meta.position[0], floorY + OFFICE_CONSTANTS.eyeHeight, meta.position[2]);
      const d = pos.distanceTo(target);
      if (d < (meta.radius || OFFICE_CONSTANTS.interactDistance) && d < bestDist && meta.floor === this.currentFloor) {
        best = meta; bestDist = d;
      }
    }
    this.nearest = best;
    if (best) this.callbacks.onHint?.(`${best.hint || `Tekan E untuk interaksi dengan ${best.label}`}`);
    else this.callbacks.onHint?.(this.controls.isLocked ? 'W/A/S/D bergerak - Shift lari - E interaksi - Tab/Esc kembali ke UI.' : 'Mode UI aktif. Klik "Masuk mode first-person" untuk bergerak lagi.');
  }

  roomAtCamera() {
    const x = this.camera.position.x;
    const z = this.camera.position.z;
    const room = ROOMS.find(r => r.floor === this.currentFloor && x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2);
    return room?.name || (this.currentFloor === 1 ? 'Atrium / Corridor' : 'Upper Atrium / Corridor');
  }

  _floorFromY(y) {
    return Math.round(y / OFFICE_CONSTANTS.floorHeight) + 1;
  }

  _addBlocker(floor, x1, x2, z1, z2, label = 'blocker') {
    const blocker = {
      floor,
      x1: Math.min(x1, x2),
      x2: Math.max(x1, x2),
      z1: Math.min(z1, z2),
      z2: Math.max(z1, z2),
      label
    };
    this.blockers.push(blocker);
    this._addCollisionDebugMesh(blocker);
  }

  _addFootprint(x, y, z, w, d, label, pad = 0.08) {
    const floor = this._floorFromY(y);
    this._addBlocker(floor, x - w / 2 - pad, x + w / 2 + pad, z - d / 2 - pad, z + d / 2 + pad, label);
  }

  _isBlocked(pos) {
    return this._isBlockedAt(pos, this.currentFloor, 0.36);
  }

  _isBlockedAt(pos, floor, radius = 0.36) {
    const door = this.liftDoors?.get?.(floor);
    if (door && !door.open && pos.x > -1.42 - radius && pos.x < 1.42 + radius && pos.z > 14.96 - radius && pos.z < 15.18 + radius) {
      return true;
    }
    return this.blockers.some(blocker =>
      blocker.floor === floor &&
      pos.x > blocker.x1 - radius &&
      pos.x < blocker.x2 + radius &&
      pos.z > blocker.z1 - radius &&
      pos.z < blocker.z2 + radius
    );
  }

  _addCollisionDebugMesh(blocker) {
    if (!this.collisionDebugGroup) return;
    const w = Math.max(0.04, blocker.x2 - blocker.x1);
    const d = Math.max(0.04, blocker.z2 - blocker.z1);
    const mat = new THREE.MeshBasicMaterial({ color: blocker.label?.includes('wall') ? '#ef4444' : '#f59e0b', transparent: true, opacity: 0.24, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.11, d), mat);
    mesh.position.set((blocker.x1 + blocker.x2) / 2, (blocker.floor - 1) * OFFICE_CONSTANTS.floorHeight + 0.12, (blocker.z1 + blocker.z2) / 2);
    mesh.userData = { type: 'collision-debug', label: blocker.label };
    this.collisionDebugGroup.add(mesh);
  }

  _addInteractableDebug(meta) {
    // v2.7.1: no floor rings in normal/QA view. Interactable reach is shown by proximity hints.
    return;
  }

  _rotateOffset(dx, dz, rot = 0) {
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    return [dx * cos - dz * sin, dx * sin + dz * cos];
  }

  _faceObjectYaw(object, targetX, targetZ) {
    const dx = targetX - object.position.x;
    const dz = targetZ - object.position.z;
    object.rotation.set(0, Math.atan2(-dx, -dz), 0);
  }

  _normalOffset(x, z, rot = 0, dist = 0.06) {
    return [x + Math.sin(rot) * dist, z + Math.cos(rot) * dist];
  }
  _addSeat(label, floor, x, z, lookX, lookZ, standX = x, standZ = z, kind = 'seat') {
    const id = `seat-${++this.seatCount}`;
    this.interactables.push({
      id,
      type: 'seat',
      kind,
      label,
      floor,
      position: [x, 0, z],
      lookAt: [lookX, 0, lookZ],
      standPosition: [standX, 0, standZ],
      radius: 1.45,
      hint: `Tekan E untuk duduk di ${label}.`
    });
  }

  _box(w, h, d, x, y, z, mat, cast = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  _modernRug(x, y, z, w, d, color = '#dbeafe', rot = 0) {
    const rug = this._box(w, 0.018, d, x, y + 0.022, z, new THREE.MeshStandardMaterial({ color, roughness: 0.9 }), false);
    rug.rotation.y = rot;
    return rug;
  }

  _wallArt(x, y, z, text, rot = 0, accent = '#2563eb') {
    return this._wallSign(text, x, y + 1.66, z, rot, {
      width: Math.min(2.75, Math.max(1.35, String(text).length * 0.13)),
      height: 0.36,
      backing: '#e2e8f0',
      bg: '#f8fafc',
      fg: accent
    });
  }

  _dataCrates(x, y, z) {
    const crateMat = new THREE.MeshStandardMaterial({ color: '#dbeafe', roughness: 0.72 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.55 });
    for (let i = 0; i < 3; i++) {
      const dx = (i % 2) * 0.62;
      const dz = Math.floor(i / 2) * 0.54;
      this._box(0.54, 0.44, 0.48, x + dx, y + 0.23 + i * 0.04, z + dz, crateMat, true);
      this._box(0.56, 0.045, 0.5, x + dx, y + 0.48 + i * 0.04, z + dz, stripeMat, false);
    }
  }

  _strategyLight(x, y, z, rot = 0) {
    const mount = this._box(0.15, 0.7, 0.15, x, y + 1.58, z, this.materials.darkTrim, false);
    mount.rotation.y = rot;
    const lightMat = new THREE.MeshBasicMaterial({ color: '#94a3b8' });
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14), lightMat);
    globe.position.set(x, y + 2.05, z);
    this.scene.add(globe);
    this.strategyLightMesh = globe;
    this._wallSign('STATUS', x, y + 2.28, z, rot, { width: 1.0, height: 0.28, backing: '#111827', bg: '#f8fafc' });
  }

  _progressWall(x, y, z, rot = 0) {
    this._wallSign('Progress Wall', x, y + 2.02, z, rot, { width: 1.8, height: 0.34, backing: '#334155', bg: '#f8fafc' });
    const colors = ['#bfdbfe', '#fde68a', '#bbf7d0', '#fecaca'];
    for (let i = 0; i < 4; i++) {
      const [dx, dz] = this._rotateOffset(0, (i - 1.5) * 0.42, rot);
      const note = this._box(0.04, 0.3, 0.28, x + dx, y + 1.72, z + dz, new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.8 }), false);
      note.rotation.y = rot;
    }
  }

  _coffeeMachine(x, y, z, rot = 0, id = '') {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.82, 0.52), new THREE.MeshStandardMaterial({ color: '#263445', roughness: 0.42, metalness: 0.16 }));
    body.position.set(0, 1.06, 0);
    group.add(body);
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.28, 0.035), new THREE.MeshBasicMaterial({ color: '#67e8f9' }));
    face.position.set(0, 1.2, -0.28);
    group.add(face);
    const indicator = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), new THREE.MeshBasicMaterial({ color: '#94a3b8' }));
    indicator.position.set(0.25, 1.39, -0.3);
    group.add(indicator);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.24), this.materials.darkTrim);
    tray.position.set(0, 0.68, -0.18);
    group.add(tray);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.18, 14), this.materials.white);
    cup.position.set(0, 0.81, -0.18);
    group.add(cup);
    const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.086, 0.078, 0.07, 14), new THREE.MeshBasicMaterial({ color: '#7c2d12' }));
    fill.position.set(0, 0.8, -0.18);
    fill.visible = false;
    group.add(fill);
    const steamMat = new THREE.MeshBasicMaterial({ color: '#e0f2fe', transparent: true, opacity: 0, depthWrite: false });
    const steam = [];
    for (let i = 0; i < 3; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), steamMat.clone());
      puff.position.set(-0.08 + i * 0.08, 0.98 + i * 0.03, -0.18);
      puff.visible = false;
      group.add(puff);
      steam.push(puff);
    }
    group.position.set(x, y, z);
    group.rotation.y = rot;
    this.scene.add(group);
    if (id) this.coffeeMachines.set(id, {
      id,
      floor: this._floorFromY(y),
      group,
      screen: face,
      indicator,
      cup,
      fill,
      steam,
      busy: false,
      start: 0,
      until: 0
    });
  }

  _deskNoteProp(x, y, z, rot = 0, color = '#fde68a') {
    const note = this._box(0.48, 0.02, 0.34, x, y + 0.93, z, new THREE.MeshStandardMaterial({ color, roughness: 0.82 }), false);
    note.rotation.y = rot + 0.12;
  }

  _trophyWall(x, y, z, rot = 0) {
    this._wallSign('Achievement Wall', x, y + 1.98, z, rot, { width: 2.15, height: 0.38, backing: '#92400e', bg: '#fffbeb', fg: '#92400e' });
    const gold = new THREE.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.36, metalness: 0.32 });
    const base = this._box(1.7, 0.08, 0.18, x, y + 1.32, z, this.materials.warmTrim, false);
    base.rotation.y = rot;
    for (let i = 0; i < 3; i++) {
      const [dx, dz] = this._rotateOffset((i - 1) * 0.46, 0, rot);
      const trophy = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.32 + i * 0.06, 18), gold);
      trophy.position.set(x + dx, y + 1.55 + i * 0.03, z + dz);
      trophy.rotation.y = rot;
      this.scene.add(trophy);
    }
  }

  _wallSign(text, x, y, z, rot = 0, options = {}) {
    const group = new THREE.Group();
    const width = options.width || 2.8;
    const height = options.height || 0.64;
    const backing = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.22, height + 0.18, 0.055),
      new THREE.MeshStandardMaterial({ color: options.backing || '#7f725e', roughness: 0.62 })
    );
    backing.position.set(0, 0, -0.02);
    backing.receiveShadow = true;
    group.add(backing);
    const sign = signPlane(text, { width, height, bg: options.bg || '#ffffff', fg: options.fg || '#172033' });
    sign.position.set(0, 0, 0.025);
    group.add(sign);
    if (options.doubleSided) {
      const backSign = signPlane(text, { width, height, bg: options.bg || '#ffffff', fg: options.fg || '#172033' });
      backSign.position.set(0, 0, -0.075);
      backSign.rotation.y = Math.PI;
      group.add(backSign);
    }
    group.position.set(x, y, z);
    group.rotation.y = rot;
    this.scene.add(group);
    return group;
  }

  _doorSign(room, y) {
    let x = (room.x1 + room.x2) / 2;
    let z = room.z1 - 0.075;
    let rot = Math.PI;
    if (room.id === 'sky-cafe') {
      x = -16.2;
      z = room.z1 - 0.075;
      rot = Math.PI;
    }
    const longName = room.name.length > 18;
    this._wallSign(room.name, x, y + 2.0, z, rot, {
      width: longName ? 2.12 : 1.72,
      height: 0.3,
      backing: '#64748b',
      bg: '#f8fafc',
      fg: '#1e293b'
    });
  }
  _elevatorSign(floor, y) {
    this._wallSign(`LIFT F${floor}`, 0, y + 2.64, 14.78, Math.PI, {
      width: 1.12,
      height: 0.28,
      bg: '#f8fafc',
      fg: '#0f172a',
      backing: '#111827'
    });
  }
  _elevatorIndicator(floor, y) {
    const texture = liftDisplayTexture(`F${floor}`);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.FrontSide });
    const display = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.26), mat);
    display.position.set(0, y + 2.34, 14.76);
    display.rotation.y = Math.PI;
    display.userData = { texture, currentText: `F${floor}` };
    this.scene.add(display);
    return display;
  }

  _setElevatorIndicator(floor, text) {
    const display = this.liftIndicators.get(floor);
    if (!display || display.userData.currentText === text) return;
    const oldTexture = display.material.map;
    const texture = liftDisplayTexture(text);
    display.material.map = texture;
    display.material.needsUpdate = true;
    display.userData.texture = texture;
    display.userData.currentText = text;
    oldTexture?.dispose?.();
  }

  _elevatorInteriorButtons(floor, y) {
    const panelMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.32, metalness: 0.34 });
    const plateMat = new THREE.MeshStandardMaterial({ color: '#27364a', roughness: 0.4, metalness: 0.2 });
    const activeMat = new THREE.MeshBasicMaterial({ color: '#60a5fa' });
    const idleMat = new THREE.MeshBasicMaterial({ color: '#f8fafc' });
    const rimMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.3, metalness: 0.38 });

    this._box(0.08, 1.74, 0.88, 1.94, y + 1.52, 16.48, panelMat, false);
    this._box(0.085, 0.34, 0.72, 1.895, y + 2.2, 16.48, plateMat, false);
    const header = signPlane('PILIH LANTAI', { width: 0.68, height: 0.2, bg: '#111827', fg: '#e0f2fe', border: 'rgba(125,211,252,0.35)' });
    header.position.set(1.846, y + 2.2, 16.48);
    header.rotation.y = -Math.PI / 2;
    this.scene.add(header);

    for (let target = 1; target <= MAX_FLOOR; target++) {
      const z = 16.86 - (target - 1) * 0.38;
      this._box(0.04, 0.30, 0.30, 1.89, y + 1.68, z, rimMat, false);
      const button = this._box(0.048, 0.20, 0.20, 1.84, y + 1.68, z, target === floor ? activeMat : idleMat, false);
      button.renderOrder = 4;
      const label = signPlane(`F${target}`, {
        width: 0.34,
        height: 0.18,
        bg: target === floor ? '#dbeafe' : '#f8fafc',
        fg: '#0f172a',
        border: 'rgba(15,23,42,0.12)'
      });
      label.position.set(1.835, y + 1.34, z);
      label.rotation.y = -Math.PI / 2;
      this.scene.add(label);
      this.interactables.push({
        id: `elevator-button-${floor}-${target}`,
        type: 'elevator-button',
        label: `Lift button F${target}`,
        floor,
        targetFloor: target,
        position: [1.46, 0, z],
        radius: 1.22,
        hint: target === floor ? `Tekan E: sekarang sudah di lantai ${target}.` : `Tekan E untuk naik/turun ke lantai ${target}.`,
        worldY: y
      });
      this._addInteractableDebug(this.interactables[this.interactables.length - 1]);
    }
  }
  _deskCluster(x, y, z, rot = 0) {
    const group = new THREE.Group();
    const topMat = new THREE.MeshStandardMaterial({ color: '#e8d7be', roughness: 0.7 });
    const legMat = new THREE.MeshStandardMaterial({ color: '#475569', metalness: 0.2, roughness: 0.35 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 1.05), topMat); top.position.y = 0.78; top.castShadow = true; top.receiveShadow = true; group.add(top);
    for (const sx of [-0.9, 0.9]) for (const sz of [-0.38, 0.38]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), legMat); leg.position.set(sx, 0.38, sz); leg.castShadow = true; group.add(leg);
    }
    const mon = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.45, 0.06), this.materials.monitor); mon.position.set(0, 1.14, -0.28); mon.castShadow = true; group.add(mon);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.36, 0.025), this.materials.screen); screen.position.set(0, 1.14, -0.315); group.add(screen);
    const chairScreen = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.36, 0.025), this.materials.screen); chairScreen.position.set(0, 1.14, -0.245); group.add(chairScreen);
    const chair = this._chairGroup(); chair.position.set(0, 0, 0.95); chair.rotation.y = 0; group.add(chair);
    group.position.set(x, y, z); group.rotation.y = rot;
    this.scene.add(group);
    this._deskAccessories(x, y, z, rot);
    const [seatDx, seatDz] = this._rotateOffset(0, 0.95, rot);
    const [standDx, standDz] = this._rotateOffset(0, 1.65, rot);
    const [lookDx, lookDz] = this._rotateOffset(0, -0.28, rot);
    this._addFootprint(x, y, z, rot % Math.PI === 0 ? 2.45 : 1.45, rot % Math.PI === 0 ? 1.35 : 2.45, 'desk cluster');
    this._addSeat('Workstation chair', this._floorFromY(y), x + seatDx, z + seatDz, x + lookDx, z + lookDz, x + standDx, z + standDz, 'workstation');
  }

  _chairGroup() {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.58 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.12, 0.62), mat); seat.position.y = 0.48; seat.castShadow = true; group.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.7, 0.12), mat); back.position.set(0, 0.85, 0.27); back.castShadow = true; group.add(back);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.48, 10), mat); base.position.y = 0.24; group.add(base);
    return group;
  }

  _conferenceTable(x, y, z) {
    const mat = new THREE.MeshStandardMaterial({ color: '#c7aa83', roughness: 0.66 });
    const baseMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.44, metalness: 0.18 });
    this._box(5.8, 0.16, 2.1, x, y + 0.76, z, mat, true);
    this._box(0.5, 0.72, 1.5, x - 1.8, y + 0.37, z, baseMat, true);
    this._box(0.5, 0.72, 1.5, x + 1.8, y + 0.37, z, baseMat, true);
    this._deskAccessories(x - 1.7, y, z - 0.35, 0);
    this._deskAccessories(x + 1.3, y, z + 0.3, Math.PI);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const chair = this._chairGroup();
      chair.position.set(x + Math.cos(angle) * 3.0, y, z + Math.sin(angle) * 1.7);
      chair.rotation.y = -angle + Math.PI / 2;
      this.scene.add(chair);
      this._addSeat('Meeting chair', this._floorFromY(y), x + Math.cos(angle) * 3.0, z + Math.sin(angle) * 1.7, x, z, x + Math.cos(angle) * 3.65, z + Math.sin(angle) * 2.15);
    }
    this._addFootprint(x, y, z, 6.15, 2.45, 'conference table');
  }

  _receptionDesk(x, y, z) {
    const mat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.54 });
    const accent = new THREE.MeshStandardMaterial({ color: '#2354d1', roughness: 0.44 });
    this._box(5.6, 1.05, 1.2, x, y+0.55, z, mat, true);
    this._box(5.65, 0.13, 0.08, x, y+1.15, z-0.62, accent, false);
    this._deskAccessories(x - 1.4, y + 0.28, z - 0.15, 0);
    const sign = labelSprite('Onboarding Desk');
    sign.position.set(x, y+1.85, z-0.7);
    sign.scale.set(2.2, 0.64, 1);
    this.scene.add(sign);
    this._addFootprint(x, y, z, 5.9, 1.45, 'onboarding desk');
  }

  _whiteboard(x, y, z, rot = 0, options = {}) {
    const group = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.48, metalness: 0.18 });
    const boardMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.38 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.7, 1.55, 0.055), boardMat);
    board.position.set(0, 1.58, 0);
    group.add(board);
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.85, 0.07, 0.08), frameMat); top.position.set(0, 2.39, -0.005); group.add(top);
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(3.85, 0.07, 0.08), frameMat); bottom.position.set(0, 0.77, -0.005); group.add(bottom);
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.65, 0.08), frameMat); left.position.set(-1.91, 1.58, -0.005); group.add(left);
    const right = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.65, 0.08), frameMat); right.position.set(1.91, 1.58, -0.005); group.add(right);
    this._whiteboardNotes(group);
    group.position.set(x, y, z);
    group.rotation.y = rot;
    this.scene.add(group);
    const [sx, sz] = this._normalOffset(x, z, rot, 0.09);
    this._wallSign(options.label || 'Strategy Board', sx, y + 2.28, sz, rot, { width: 1.52, height: 0.3, backing: '#334155', bg: '#ffffff', fg: '#172033' });
  }
  _standingScreen(x, y, z, title, facing = 1) {
    const group = new THREE.Group();
    const frontDir = facing >= 0 ? 1 : -1;
    const rot = frontDir > 0 ? 0 : Math.PI;
    const standMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.42, metalness: 0.25 });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.25, 1.25, 0.08), standMat);
    panel.position.set(0, 1.55, 0);
    panel.castShadow = true;
    group.add(panel);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.02, 0.035), new THREE.MeshBasicMaterial({ color: '#0ea5e9' }));
    screen.position.set(0, 1.55, 0.055);
    group.add(screen);
    const rear = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.02, 0.032), new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.5 }));
    rear.position.set(0, 1.55, -0.055);
    group.add(rear);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), standMat);
    pole.position.set(0, 0.55, 0);
    group.add(pole);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.5), standMat);
    base.position.set(0, 0.06, 0);
    group.add(base);
    group.position.set(x, y, z);
    group.rotation.y = rot;
    this.scene.add(group);
    const [sx, sz] = this._normalOffset(x, z, rot, 0.13);
    this._wallSign(title, sx, y + 2.18, sz, rot, {
      width: 1.75,
      height: 0.34,
      backing: '#334155',
      bg: '#475569',
      fg: '#ffffff'
    });
    this._addFootprint(x, y, z, frontDir > 0 ? 1.1 : 1.1, 0.36, `screen ${title}`, 0.02);
  }
  _serverRack(x, y, z) {
    const mat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.38, metalness: 0.25 });
    this._box(1.15, 2.1, 0.85, x, y+1.05, z, mat, true);
    for (let i = 0; i < 6; i++) this._box(0.92, 0.06, 0.04, x, y+0.35+i*0.28, z-0.44, this.materials.screen, false);
    this._addFootprint(x, y, z, 1.45, 1.05, 'server rack');
  }

  _shelf(x, y, z) {
    const mat = new THREE.MeshStandardMaterial({ color: '#7c5a3b', roughness: 0.76 });
    this._box(0.8, 2.4, 4.0, x, y+1.2, z, mat, true);
    for (let i=0;i<5;i++) this._box(0.86, 0.05, 4.0, x, y+0.35+i*0.43, z, this.materials.darkTrim, false);
    this._addFootprint(x, y, z, 1.1, 4.25, 'shelf');
  }

  _focusPod(x, y, z) {
    const mat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.68 });
    const glass = this.materials.glass;
    this._box(2.4, 2.0, 0.12, x, y+1, z-1.2, mat, true);
    this._box(2.4, 2.0, 0.06, x, y+1, z+1.2, glass, false);
    this._box(0.12, 2.0, 2.4, x-1.2, y+1, z, glass, false);
    this._box(0.12, 2.0, 2.4, x+1.2, y+1, z, glass, false);
    this._deskCluster(x, y, z, 0);
    this._addBlocker(this._floorFromY(y), x - 1.35, x + 1.35, z - 1.35, z - 1.05, 'focus pod back');
    this._addBlocker(this._floorFromY(y), x - 1.35, x - 1.05, z - 1.35, z + 1.35, 'focus pod side');
    this._addBlocker(this._floorFromY(y), x + 1.05, x + 1.35, z - 1.35, z + 1.35, 'focus pod side');
  }

  _cafeCounter(x, y, z) {
    const mat = new THREE.MeshStandardMaterial({ color: '#e8d7be', roughness: 0.72 });
    this._box(4.2, 0.92, 1.0, x+1, y+0.46, z, mat, true);
    this._box(1.2, 0.5, 0.55, x-1.1, y+1.02, z-0.1, this.materials.monitor, true);
    for (let i=0; i<4; i++) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.10, 0.22, 16), this.materials.white);
      cup.position.set(x + i*0.35, y+1.08, z-0.25);
      cup.castShadow = true;
      this.scene.add(cup);
    }
    this._addFootprint(x + 1, y, z, 4.6, 1.25, 'cafe counter');
  }

  _sofa(x, y, z, rot = 0) {
    const mat = new THREE.MeshStandardMaterial({ color: '#6b7f99', roughness: 0.76 });
    const baseMat = new THREE.MeshStandardMaterial({ color: '#263445', roughness: 0.68 });
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.14, 0.9), baseMat); base.position.y = 0.12; base.castShadow = true; group.add(base);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.32, 0.82), mat); seat.position.y = 0.34; seat.castShadow = true; group.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.78, 0.24), mat); back.position.set(0,0.72,0.39); back.castShadow = true; group.add(back);
    const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.22,0.58,0.9), mat); arm1.position.set(-1.32,0.48,0); group.add(arm1);
    const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.22,0.58,0.9), mat); arm2.position.set(1.32,0.48,0); group.add(arm2);
    group.position.set(x,y,z); group.rotation.y = rot;
    this.scene.add(group);
    this._addFootprint(x, y, z, rot % Math.PI === 0 ? 2.85 : 1.25, rot % Math.PI === 0 ? 1.25 : 2.85, 'sofa');
    const [seatDx, seatDz] = this._rotateOffset(0, -0.15, rot);
    const [standDx, standDz] = this._rotateOffset(0, -1.1, rot);
    const [lookDx, lookDz] = this._rotateOffset(0, 1.0, rot);
    this._addSeat('Sofa seat', this._floorFromY(y), x + seatDx, z + seatDz, x + lookDx, z + lookDz, x + standDx, z + standDz);
  }

  _deskAccessories(x, y, z, rot = 0) {
    const paperMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.82 });
    const noteMat = new THREE.MeshStandardMaterial({ color: '#fde68a', roughness: 0.82 });
    const bookMat = new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.72 });
    const dark = this.materials.darkTrim;
    const offsets = [
      [-0.58, 0.875, -0.18, 0.42, 0.018, 0.28, paperMat],
      [0.62, 0.88, 0.24, 0.5, 0.045, 0.32, bookMat],
      [0.15, 0.89, 0.36, 0.36, 0.025, 0.16, dark],
      [-0.18, 0.895, 0.18, 0.26, 0.018, 0.22, noteMat]
    ];
    for (const [dx, dy, dz, w, h, d, mat] of offsets) {
      const [rx, rz] = this._rotateOffset(dx, dz, rot);
      const mesh = this._box(w, h, d, x + rx, y + dy, z + rz, mat, true);
      mesh.rotation.y = rot + (dx > 0.5 ? 0.12 : -0.06);
    }
    const [cupX, cupZ] = this._rotateOffset(0.86, -0.22, rot);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.16, 14), this.materials.white);
    cup.position.set(x + cupX, y + 0.92, z + cupZ);
    cup.castShadow = true;
    this.scene.add(cup);
  }

  _whiteboardNotes(group) {
    const mats = ['#fde68a', '#bfdbfe', '#bbf7d0', '#fecaca', '#ddd6fe'].map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
    const notes = [
      [-1.25, 2.02, 0.04, 0], [-0.55, 1.78, 0.04, 1], [0.18, 1.96, 0.04, 2],
      [0.9, 1.5, 0.04, 3], [-1.05, 1.25, 0.04, 4]
    ];
    notes.forEach(([xx, yy, zz, mi], idx) => {
      const note = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.25, 0.018), mats[mi]);
      note.position.set(xx, yy, zz);
      note.rotation.z = (idx - 2) * 0.035;
      group.add(note);
    });
    const lineMat = new THREE.MeshBasicMaterial({ color: '#64748b' });
    for (let i = 0; i < 4; i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.018, 0.018), lineMat);
      line.position.set(0.25, 1.2 + i * 0.18, 0.045);
      group.add(line);
    }
  }

  _coffeeTable(x, y, z) {
    const mat = new THREE.MeshStandardMaterial({ color: '#d6b88f', roughness: 0.72 });
    this._box(2.3, 0.12, 1.1, x, y + 0.42, z, mat, true);
    this._box(0.12, 0.4, 0.12, x - 0.9, y + 0.2, z - 0.38, this.materials.darkTrim, true);
    this._box(0.12, 0.4, 0.12, x + 0.9, y + 0.2, z + 0.38, this.materials.darkTrim, true);
    this._deskAccessories(x, y - 0.34, z, 0);
    this._addFootprint(x, y, z, 2.6, 1.35, 'coffee table');
  }

  _beanBag(x, y, z, color) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.86 });
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 16), mat);
    bag.scale.set(1.25, 0.55, 1.0);
    bag.position.set(x, y + 0.38, z);
    bag.castShadow = true;
    bag.receiveShadow = true;
    this.scene.add(bag);
    // Soft seating is intentionally non-blocking; the seat interaction anchor handles use.
    this._addSeat('Bean bag', this._floorFromY(y), x, z, x, z - 1, x, z + 1.2);
  }

  _wallClock(x, y, z, rot = 0) {
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.035, 32), new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.58 }));
    face.position.set(x, y + 2.2, z);
    face.rotation.y = rot;
    face.rotation.z = Math.PI / 2;
    this.scene.add(face);
    const handMat = new THREE.MeshBasicMaterial({ color: '#0f172a' });
    const h1 = this._box(0.018, 0.018, 0.24, x, y + 2.2, z - 0.025, handMat, false);
    h1.rotation.y = rot;
    const h2 = this._box(0.018, 0.018, 0.18, x, y + 2.2, z - 0.03, handMat, false);
    h2.rotation.y = rot + 0.7;
  }

  _trashBin(x, y, z) {
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.55, 14), new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.75 }));
    bin.position.set(x, y + 0.28, z);
    bin.castShadow = true;
    this.scene.add(bin);
    // Small decorative bins should not trap movement in narrow rooms.
  }

  _arcadeCabinet(x, y, z, title = 'Kaggle Quiz') {
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.52 });
    const accentMat = new THREE.MeshBasicMaterial({ color: '#38bdf8' });
    const trimMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.42, metalness: 0.18 });
    this._box(1.28, 2.05, 0.82, x, y + 1.02, z, bodyMat, true);
    this._box(1.02, 0.66, 0.045, x, y + 1.48, z + 0.44, accentMat, false);
    this._box(1.10, 0.12, 0.42, x, y + 0.88, z + 0.54, trimMat, true);
    this._box(0.16, 0.12, 0.08, x - 0.32, y + 0.98, z + 0.78, accentMat, false);
    this._box(0.16, 0.12, 0.08, x + 0.05, y + 0.98, z + 0.78, accentMat, false);
    const label = labelSprite(title, { bg: 'rgba(15,23,42,0.92)', fg: '#ffffff' });
    label.position.set(x, y + 2.28, z + 0.55);
    label.scale.set(1.58, 0.44, 1);
    this.scene.add(label);
    this._addFootprint(x, y, z, 1.52, 1.10, `${title} arcade`);
  }

  _gameTable(x, y, z) {
    this._conferenceTable(x, y, z);
    const scoreMat = new THREE.MeshStandardMaterial({ color: '#0f766e', roughness: 0.62 });
    this._box(0.5, 0.04, 0.32, x - 1.4, y + 0.88, z, scoreMat, false);
    this._box(0.5, 0.04, 0.32, x + 1.2, y + 0.88, z + 0.4, scoreMat, false);
  }

  _plant(x, y, z, blocking = false) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.48, 0.55, 18), this.materials.pot); pot.position.set(x,y+0.28,z); pot.castShadow = true; this.scene.add(pot);
    for (let i = 0; i < 9; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.9, 10), this.materials.plant);
      const angle = (i / 9) * Math.PI * 2;
      leaf.position.set(x + Math.cos(angle)*0.12, y+0.85, z + Math.sin(angle)*0.12);
      leaf.rotation.z = Math.cos(angle) * 0.42;
      leaf.rotation.x = Math.sin(angle) * 0.42;
      leaf.castShadow = true;
      this.scene.add(leaf);
    }
    if (blocking) this._addFootprint(x, y, z, 0.72, 0.72, 'plant', 0.03);
  }
}








