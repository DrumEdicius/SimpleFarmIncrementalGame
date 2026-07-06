import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/* =========================================================
   VOXEL FARM + TAP TREE INCREMENTAL
   ========================================================= */

const PLATFORM_TOP = -0.4;

const WATER_DURATION = 180;
const WATER_BONUS_MULT = 1.2;

const CROP_TYPES = {
  carrot:      { name: 'Carrot',      cost: 0,    rate: 0.08, growTime: 5,  color: 0xff8c3a, topColor: 0x4caf50, kind: 'veg' },
  strawberry:  { name: 'Strawberry',  cost: 60,   rate: 0.14, growTime: 8,  color: 0xe0324c, topColor: 0x4caf50, kind: 'veg' },
  blueberry:   { name: 'Blueberry',   cost: 95,   rate: 0.22, growTime: 10, color: 0x3a4fd8, topColor: 0x4caf50, kind: 'veg' },
  apple:       { name: 'Apple Tree',  cost: 200,  rate: 0.35, growTime: 12, color: 0xd4302f, topColor: 0x6b4226, kind: 'tree' },
  orange:      { name: 'Orange Tree', cost: 300,  rate: 0.55, growTime: 15, color: 0xff9a1f, topColor: 0x6b4226, kind: 'tree' },
  watermelon:  { name: 'Watermelon',  cost: 650,  rate: 0.8,  growTime: 18, color: 0x2e8b57, topColor: 0x3a6b2a, kind: 'melon' },
  pumpkin:     { name: 'Pumpkin',     cost: 800,  rate: 1.1,  growTime: 20, color: 0xe6822a, topColor: 0x3a6b2a, kind: 'melon' },
  grape:       { name: 'Grape Vine',  cost: 1000, rate: 1.6,  growTime: 24, color: 0x6a3fa0, topColor: 0x5c3b20, kind: 'tree' },
  dragonfruit: { name: 'Dragonfruit', cost: 1500, rate: 2.3,  growTime: 28, color: 0xd6337a, topColor: 0x4caf50, kind: 'veg' },
};

const LAND_SIZES = [3, 6, 12];
const LAND_UPGRADE_COST = [1000, 10000];
const VALUE_UPGRADE = [
  { mult: 1.2, cost: 800 },
  { mult: 1.5, cost: 1500 },
];

// NEW: what was "tap power" upgrades is now framed as growing the tree.
// Each tier both boosts tap power AND visibly grows the tree (scale). The
// final tier is the endgame: 20,000g, tree reaches full size, turns gold.
const TREE_UPGRADES = [
  { cost: 500,   mult: 1.3, label: 'Sprouting Growth',   scale: 1.15 },
  { cost: 1000,  mult: 1.5, label: 'Budding Branches',   scale: 1.3 },
  { cost: 2500,  mult: 2.0, label: 'Flourishing Canopy', scale: 1.5 },
  { cost: 5000,  mult: 2.5, label: 'Ancient Roots',      scale: 1.75 },
  { cost: 20000, mult: 3.0, label: 'Golden Bloom',       scale: 2.2, golden: true },
];

const FERTILIZERS = [
  { key: 'fert1', mult: 1.2, cost: 500,  duration: 60,  label: 'Basic Fertilizer' },
  { key: 'fert2', mult: 1.5, cost: 2000, duration: 60,  label: 'Rich Fertilizer' },
  { key: 'fert3', mult: 2.0, cost: 5000, duration: 120, label: 'Super Fertilizer' },
];

// NEW: quest 5 no longer grants the Golden Tree (that's now the final tree
// upgrade) — replaced with a straightforward Crop Value bonus.
const QUESTS = [
  { desc: 'Plant 5 crops',            reward: '+10% Crop Value', check: () => state.cropsPlanted >= 5,    apply: () => { state.valueMult *= 1.10; } },
  { desc: 'Earn 200 lifetime gold',   reward: '+1 flat Tap Power', check: () => state.lifetimeGold >= 200,  apply: () => { state.tapPower += 1; } },
  { desc: 'Fend off 3 crows',         reward: '+15% Crop Value', check: () => state.pestsDefeated >= 3,   apply: () => { state.valueMult *= 1.15; } },
  { desc: 'Expand land to 12x12',     reward: 'Tap Power x2',    check: () => state.landSize >= 12,       apply: () => { state.tapPower *= 2; } },
  { desc: 'Earn 2000 lifetime gold',  reward: '+20% Crop Value', check: () => state.lifetimeGold >= 2000, apply: () => { state.valueMult *= 1.20; } },
];

const DECOR_FOR_QUEST = ['bush', 'bush', 'grassTuft', 'bush', 'barn'];

const state = {
  gold: 10,
  lifetimeGold: 0,
  cropsPlanted: 0,
  pestsDefeated: 0,
  questIndex: 0,
  landIndex: 0,
  landSize: LAND_SIZES[0],
  valueLevel: 0,
  valueMult: 1,
  tapLevel: 0,
  tapPower: 1,
  fertilizerMult: 1,
  fertilizerTimeLeft: 0,
  selectedCrop: null,
  selectedTool: null,
  tiles: [],
};

let goldenTreeUnlocked = false;
let treeBaseScale = 1;    // NEW: persistent "grown size" target from upgrades
let treeScaleCurrent = 1; // NEW: animates smoothly toward treeBaseScale

/* ---------------- Renderer / Scene ---------------- */

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe0ff);
scene.fog = new THREE.Fog(0xbfe0ff, 30, 65);

function buildSkydome() {
  const geo = new THREE.SphereGeometry(90, 24, 16);
  const pos = geo.attributes.position;
  const colors = [];
  const topColor = new THREE.Color(0x6fb3f7);
  const bottomColor = new THREE.Color(0xf5fbff);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp((y + 90) / 180, 0, 1);
    const c = bottomColor.clone().lerp(topColor, t);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'skydome';
  mesh.renderOrder = -1;
  return mesh;
}
scene.add(buildSkydome());

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(8, 9, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const root = document.getElementById('root') ?? document.body;
root.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 5;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.set(0, 0, 0);

const ambient = new THREE.AmbientLight(0xfff2df, 0.75);
ambient.name = 'ambientLight';
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff6e6, 1.15);
sun.name = 'sunLight';
sun.position.set(10, 16, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 60;
sun.shadow.bias = -0.001;
sun.shadow.normalBias = 0.02;
scene.add(sun);
scene.add(sun.target);

const skyFill = new THREE.HemisphereLight(0xcfe0ff, 0x6b8f4a, 0.5);
skyFill.name = 'skyFill';
scene.add(skyFill);

/* ---------------- Ground / world ---------------- */

let worldPlatform = null;
let farmGroup = new THREE.Group();
farmGroup.name = 'farmGroup';
scene.add(farmGroup);

let treeGroup = null;
let tapPulse = 0;

const pests = [];
const particles = [];

const decorGroup = new THREE.Group();
decorGroup.name = 'decorGroup';
scene.add(decorGroup);
const decorations = [];

const ambientDecorGroup = new THREE.Group();
ambientDecorGroup.name = 'ambientDecorGroup';
scene.add(ambientDecorGroup);

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();

/* ---------------- Tile data model ---------------- */

function makeEmptyTile() {
  return {
    mesh: null,
    dirtMesh: null,
    cropMesh: null,
    cropType: null,
    plantedAt: 0,
    growTime: 0,
    ready: false,
    waterTimeLeft: 0,
    lastTick: 0,
    popupAccum: 0,
    popupTimer: 0,
    uiBars: null,
  };
}

function treeZOffset(size) {
  const step = 1.06;
  return -(size * step / 2 + 3.5);
}

function buildWorldPlatform(size) {
  if (worldPlatform) disposeObject(worldPlatform);
  const step = 1.06;
  const farmHalf = (size * step) / 2 + 1.6;
  const treeZ = treeZOffset(size);
  const zMin = treeZ - 3.4;
  const zMax = farmHalf;
  const centerZ = (zMin + zMax) / 2;
  const depth = zMax - zMin;
  const width = farmHalf * 2;
  const thickness = 0.6;

  const geo = new THREE.BoxGeometry(width, thickness, depth);
  const mat = new THREE.MeshStandardMaterial({ color: 0x6b8f52, roughness: 0.95 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, PLATFORM_TOP - thickness / 2, centerZ);
  mesh.receiveShadow = true;
  mesh.name = 'worldPlatform';
  scene.add(mesh);
  worldPlatform = mesh;
}

function decorSlotPosition(index) {
  const farmHalf = (state.landSize * 1.06) / 2;
  const r = farmHalf + 1.6;
  const slots = [
    { x: -r, z: -r * 0.4 },
    { x: r, z: -r * 0.4 },
    { x: -r, z: r * 0.5 },
    { x: r, z: r * 0.5 },
    { x: 0, z: r + 1.6 },
  ];
  return slots[index % slots.length];
}

function repositionDecorations() {
  for (const d of decorations) {
    const pos = decorSlotPosition(d.slotIndex);
    d.mesh.position.set(pos.x, PLATFORM_TOP, pos.z);
  }
}

function buildAmbientDecor(size) {
  while (ambientDecorGroup.children.length) {
    disposeObject(ambientDecorGroup.children.pop());
  }

  const step = 1.06;
  const farmHalf = (size * step) / 2;
  const platformHalfX = farmHalf + 1.6;
  const treeZ = treeZOffset(size);
  const zMin = treeZ - 3.4;
  const zMax = farmHalf + 1.6;

  const targetCount = 16 + size * 3;
  let placed = 0;
  let attempts = 0;

  while (placed < targetCount && attempts < targetCount * 8) {
    attempts++;
    const x = (Math.random() * 2 - 1) * platformHalfX * 0.94;
    const z = zMin + Math.random() * (zMax - zMin);

    const insideFarm = Math.abs(x) < farmHalf + 0.4 && z > -farmHalf - 0.4 && z < farmHalf + 0.4;
    const nearTree = Math.abs(x) < 2.8 && Math.abs(z - treeZ) < 2.8;
    if (insideFarm || nearTree) continue;

    const mesh = Math.random() < 0.55 ? buildBushMesh() : buildGrassTuftMesh();
    mesh.position.set(x, PLATFORM_TOP, z);
    mesh.scale.setScalar(0.75 + Math.random() * 0.6);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    ambientDecorGroup.add(mesh);
    placed++;
  }
}

function buildFarm() {
  for (const p of pests) {
    scene.remove(p.mesh);
    disposeObject(p.mesh);
  }
  pests.length = 0;

  const preserved = {};
  for (const row of state.tiles) {
    for (const tile of row) {
      if (tile.cropType) {
        const x = tile.mesh.userData.tileX;
        const z = tile.mesh.userData.tileZ;
        preserved[`${x}_${z}`] = {
          cropType: tile.cropType,
          plantedAt: tile.plantedAt,
          growTime: tile.growTime,
          ready: tile.ready,
          waterTimeLeft: tile.waterTimeLeft,
          lastTick: tile.lastTick,
        };
      }
      if (tile.uiBars) {
        tile.uiBars.container.remove();
        tile.uiBars = null;
      }
    }
  }

  while (farmGroup.children.length) {
    const c = farmGroup.children.pop();
    disposeObject(c);
  }
  state.tiles = [];

  const size = state.landSize;
  const tileSize = 1.0;
  const gap = 0.06;
  const step = tileSize + gap;
  const offset = (size - 1) * step / 2;

  const grassGeo = new THREE.BoxGeometry(tileSize, 0.4, tileSize);
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x5fae4a, roughness: 0.9 });
  const dirtGeo = new THREE.BoxGeometry(tileSize * 0.6, 0.42, tileSize * 0.6);
  const soilMatDry = new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 1 });
  const soilMatWet = new THREE.MeshStandardMaterial({ color: 0x5c3b20, roughness: 0.85 });

  for (let x = 0; x < size; x++) {
    const row = [];
    for (let z = 0; z < size; z++) {
      const tile = makeEmptyTile();

      const grassMesh = new THREE.Mesh(grassGeo, grassMat);
      grassMesh.name = `grassTile_${x}_${z}`;
      grassMesh.position.set(x * step - offset, -0.2, z * step - offset);
      grassMesh.receiveShadow = true;
      grassMesh.userData.tileX = x;
      grassMesh.userData.tileZ = z;
      grassMesh.userData.isSoil = true;
      farmGroup.add(grassMesh);

      const dirtMesh = new THREE.Mesh(dirtGeo, soilMatDry.clone());
      dirtMesh.name = `dirtPatch_${x}_${z}`;
      dirtMesh.position.set(x * step - offset, -0.19, z * step - offset);
      dirtMesh.receiveShadow = true;
      dirtMesh.userData.tileX = x;
      dirtMesh.userData.tileZ = z;
      dirtMesh.userData.isSoil = true;
      farmGroup.add(dirtMesh);

      tile.mesh = grassMesh;
      tile.dirtMesh = dirtMesh;
      tile.dryMat = soilMatDry;
      tile.wetMat = soilMatWet;
      row.push(tile);
    }
    state.tiles.push(row);
  }

  buildWorldPlatform(size);

  sun.target.position.set(0, 0, 0);
  sun.target.updateMatrixWorld();

  const dist = Math.max(9, size * 1.3);
  camera.position.set(dist * 0.8, dist * 0.85, dist * 0.9);
  controls.target.set(0, 0, 0);
  controls.update();

  const shadowExtent = Math.max(size * step, 10) * 0.75;
  sun.shadow.camera.left = -shadowExtent;
  sun.shadow.camera.right = shadowExtent;
  sun.shadow.camera.top = shadowExtent;
  sun.shadow.camera.bottom = -shadowExtent;
  sun.shadow.camera.updateProjectionMatrix();

  buildTree(size);
  // NEW: snap to current grown size immediately (no re-growing animation on land rebuilds)
  treeScaleCurrent = treeBaseScale;
  if (treeGroup) treeGroup.scale.setScalar(treeScaleCurrent);
  if (goldenTreeUnlocked) applyGoldenTreeLook();

  repositionDecorations();
  buildAmbientDecor(size);

  for (const key in preserved) {
    const [x, z] = key.split('_').map(Number);
    if (state.tiles[x] && state.tiles[x][z]) {
      const tile = state.tiles[x][z];
      const saved = preserved[key];

      const mesh = buildCropMesh(saved.cropType);
      mesh.position.copy(tile.mesh.position);
      mesh.position.y = 0.2;
      farmGroup.add(mesh);

      tile.cropMesh = mesh;
      tile.cropType = saved.cropType;
      tile.plantedAt = saved.plantedAt;
      tile.growTime = saved.growTime;
      tile.ready = saved.ready;
      tile.waterTimeLeft = saved.waterTimeLeft;
      tile.lastTick = saved.lastTick;
      tile.dirtMesh.material = saved.waterTimeLeft > 0 ? tile.wetMat : tile.dryMat;
      createTileBars(tile);
    }
  }
}

function disposeObject(obj) {
  obj.traverse?.((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
      else child.material.dispose();
    }
  });
  if (obj.parent) obj.parent.remove(obj);
}

/* ---------------- Tile progress bars ---------------- */

function createTileBars(tile) {
  const container = document.createElement('div');
  container.className = 'tile-bars';

  const growthBar = document.createElement('div');
  growthBar.className = 'bar growth-bar';
  const growthFill = document.createElement('div');
  growthFill.className = 'bar-fill growth-fill';
  growthBar.appendChild(growthFill);

  const waterBar = document.createElement('div');
  waterBar.className = 'bar water-bar';
  const waterFill = document.createElement('div');
  waterFill.className = 'bar-fill water-fill';
  waterBar.appendChild(waterFill);

  container.appendChild(growthBar);
  container.appendChild(waterBar);
  document.getElementById('overlay').appendChild(container);

  tile.uiBars = { container, growthBar, growthFill, waterBar, waterFill };
}

function updateTileBars() {
  const now = performance.now();
  for (const row of state.tiles) {
    for (const tile of row) {
      if (!tile.cropType || !tile.uiBars) continue;

      const worldPos = tile.cropMesh.position.clone();
      worldPos.y += 1.1;
      const proj = worldPos.project(camera);
      const visible = proj.z < 1;
      tile.uiBars.container.style.display = visible ? 'flex' : 'none';
      if (!visible) continue;

      const x = (proj.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-proj.y * 0.5 + 0.5) * window.innerHeight;
      tile.uiBars.container.style.left = `${x}px`;
      tile.uiBars.container.style.top = `${y}px`;

      if (!tile.ready) {
        const elapsedSec = (now - tile.plantedAt) / 1000;
        const t = Math.min(1, elapsedSec / tile.growTime);
        tile.uiBars.growthBar.style.display = 'block';
        tile.uiBars.growthFill.style.width = `${t * 100}%`;
      } else {
        tile.uiBars.growthBar.style.display = 'none';
      }

      const waterT = Math.max(0, Math.min(1, tile.waterTimeLeft / WATER_DURATION));
      tile.uiBars.waterFill.style.width = `${waterT * 100}%`;
    }
  }
}

/* ---------------- Tap tree ---------------- */

function buildTree(landSize) {
  if (treeGroup) disposeObject(treeGroup);
  treeGroup = new THREE.Group();
  treeGroup.name = 'tapTree';

  const padGeo = new THREE.BoxGeometry(3.2, 0.3, 3.2);
  const padMat = new THREE.MeshStandardMaterial({ color: 0x8a7a63, roughness: 0.95 });
  const pad = new THREE.Mesh(padGeo, padMat);
  pad.position.y = 0.15;
  pad.receiveShadow = true;
  pad.castShadow = true;
  pad.name = 'treePad';
  treeGroup.add(pad);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.95 });
  const foliageMatA = new THREE.MeshStandardMaterial({ color: 0x3f8f3f, roughness: 0.85 });
  const foliageMatB = new THREE.MeshStandardMaterial({ color: 0x2f6b2f, roughness: 0.85 });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xffd54a, roughness: 0.3, metalness: 0.6,
    emissive: 0x664400, emissiveIntensity: 0.3,
  });

  const trunkHeight = 3.2;
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.1, trunkHeight, 1.1), trunkMat);
  trunk.position.y = 0.3 + trunkHeight / 2;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  trunk.name = 'trunk';
  treeGroup.add(trunk);

  const baseY = 0.3 + trunkHeight;
  const layers = [
    { size: 3.6, y: baseY + 0.6, mat: foliageMatA },
    { size: 2.8, y: baseY + 1.7, mat: foliageMatB },
    { size: 2.0, y: baseY + 2.6, mat: foliageMatA },
    { size: 1.2, y: baseY + 3.4, mat: foliageMatB },
  ];
  layers.forEach((l, i) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(l.size, l.size * 0.7, l.size), l.mat);
    box.position.y = l.y;
    box.castShadow = true;
    box.receiveShadow = true;
    box.name = `foliage_${i}`;
    treeGroup.add(box);
  });

  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const radius = 1.5 + (i % 2) * 0.5;
    const y = baseY + 1.2 + (i % 3) * 0.7;
    const gem = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), goldMat);
    gem.position.set(Math.cos(ang) * radius, y, Math.sin(ang) * radius);
    gem.castShadow = true;
    gem.name = `gem_${i}`;
    treeGroup.add(gem);
  }

  treeGroup.position.set(0, PLATFORM_TOP, treeZOffset(landSize));
  scene.add(treeGroup);
}

function applyGoldenTreeLook() {
  if (!treeGroup) return;
  treeGroup.traverse((child) => {
    if (child.name && child.name.startsWith('foliage_')) {
      child.material.color.set(0xffd54a);
      child.material.emissive.set(0x77590a);
      child.material.emissiveIntensity = 0.35;
    }
  });
}

function tapTree(hitPoint) {
  const gained = state.tapPower;
  state.gold += gained;
  state.lifetimeGold += gained;
  spawnFloatingText(hitPoint, `+${gained.toFixed(1)}g`);
  tapPulse = 1;
  updateGoldUI();
}

/* ---------------- Crop mesh builders ---------------- */

function buildCropMesh(cropKey) {
  const def = CROP_TYPES[cropKey];
  const group = new THREE.Group();
  group.name = `crop_${cropKey}`;

  const stemMat = new THREE.MeshStandardMaterial({ color: 0x3d8b3d, roughness: 0.8 });
  const produceMat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.55, metalness: 0.05 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3b20, roughness: 1 });
  const foliageMat = new THREE.MeshStandardMaterial({ color: def.topColor, roughness: 0.9 });

  if (def.kind === 'veg') {
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), stemMat);
    stem.position.y = 0.25;
    stem.castShadow = true;
    stem.name = 'stem';
    group.add(stem);

    const produce = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), produceMat);
    produce.position.y = 0.55;
    produce.castShadow = true;
    produce.name = 'produce';
    group.add(produce);
  } else if (def.kind === 'tree') {
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), trunkMat);
    trunk.position.y = 0.35;
    trunk.castShadow = true;
    trunk.name = 'trunk';
    group.add(trunk);

    const foliage = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), foliageMat);
    foliage.position.y = 0.85;
    foliage.castShadow = true;
    foliage.name = 'foliage';
    group.add(foliage);

    for (let i = 0; i < 4; i++) {
      const fruit = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), produceMat);
      const ang = (i / 4) * Math.PI * 2;
      fruit.position.set(Math.cos(ang) * 0.32, 0.75, Math.sin(ang) * 0.32);
      fruit.castShadow = true;
      fruit.name = `fruit_${i}`;
      group.add(fruit);
    }
  } else {
    const vine = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.55), stemMat);
    vine.position.y = 0.06;
    vine.castShadow = true;
    vine.name = 'vine';
    group.add(vine);

    const fruit = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.42), produceMat);
    fruit.position.y = 0.28;
    fruit.castShadow = true;
    fruit.name = 'produce';
    group.add(fruit);
  }

  group.scale.setScalar(0.05);
  return group;
}

function buildPestMesh() {
  const group = new THREE.Group();
  group.name = 'pestCrow';

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 });
  const beakMat = new THREE.MeshStandardMaterial({ color: 0xffb400, roughness: 0.5 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.42), bodyMat);
  body.position.y = 0.3;
  body.castShadow = true;
  body.name = 'body';
  group.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), bodyMat);
  head.position.set(0, 0.42, 0.24);
  head.castShadow = true;
  head.name = 'head';
  group.add(head);

  const beak = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.14), beakMat);
  beak.position.set(0, 0.4, 0.36);
  beak.name = 'beak';
  group.add(beak);

  const wingGeo = new THREE.BoxGeometry(0.42, 0.06, 0.18);
  const wingL = new THREE.Mesh(wingGeo, bodyMat);
  wingL.position.set(-0.28, 0.32, 0);
  wingL.name = 'wingL';
  group.add(wingL);

  const wingR = new THREE.Mesh(wingGeo, bodyMat);
  wingR.position.set(0.28, 0.32, 0);
  wingR.name = 'wingR';
  group.add(wingR);

  return group;
}

function buildBushMesh() {
  const group = new THREE.Group();
  group.name = 'bush';
  const matA = new THREE.MeshStandardMaterial({ color: 0x4a9c3f, roughness: 0.9 });
  const matB = new THREE.MeshStandardMaterial({ color: 0x3a7f30, roughness: 0.9 });
  const blobs = [
    { size: 0.5, y: 0.25, mat: matA },
    { size: 0.36, y: 0.5, mat: matB },
    { size: 0.26, y: 0.68, mat: matA },
  ];
  blobs.forEach((b) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(b.size, b.size * 0.85, b.size), b.mat);
    box.position.y = b.y;
    box.position.x = (Math.random() - 0.5) * 0.15;
    box.position.z = (Math.random() - 0.5) * 0.15;
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);
  });
  return group;
}

function buildGrassTuftMesh() {
  const group = new THREE.Group();
  group.name = 'grassTuft';
  const mat = new THREE.MeshStandardMaterial({ color: 0x6dbf4a, roughness: 0.9 });
  for (let i = 0; i < 6; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3 + Math.random() * 0.2, 0.05), mat);
    const ang = (i / 6) * Math.PI * 2;
    blade.position.set(Math.cos(ang) * 0.14, 0.15, Math.sin(ang) * 0.14);
    blade.rotation.z = (Math.random() - 0.5) * 0.4;
    blade.castShadow = true;
    group.add(blade);
  }
  return group;
}

function buildBarnMesh() {
  const group = new THREE.Group();
  group.name = 'barn';
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xb03a3a, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5c3b20, roughness: 0.9 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xf2e6d0, roughness: 0.7 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 1.8), wallMat);
  body.position.y = 0.8;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const roofL = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 1.3), roofMat);
  roofL.position.set(0, 1.75, -0.4);
  roofL.rotation.x = -0.5;
  roofL.castShadow = true;
  group.add(roofL);

  const roofR = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 1.3), roofMat);
  roofR.position.set(0, 1.75, 0.4);
  roofR.rotation.x = 0.5;
  roofR.castShadow = true;
  group.add(roofR);

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.05), trimMat);
  door.position.set(0, 0.45, 0.93);
  group.add(door);

  return group;
}

function spawnDecorationForQuest(questIdx) {
  const type = DECOR_FOR_QUEST[questIdx % DECOR_FOR_QUEST.length];
  const slotIndex = decorations.length;
  const pos = decorSlotPosition(slotIndex);

  let mesh;
  if (type === 'bush') mesh = buildBushMesh();
  else if (type === 'grassTuft') mesh = buildGrassTuftMesh();
  else mesh = buildBarnMesh();

  mesh.position.set(pos.x, PLATFORM_TOP, pos.z);
  decorGroup.add(mesh);
  decorations.push({ mesh, slotIndex });

  spawnParticleBurst(new THREE.Vector3(pos.x, PLATFORM_TOP + 1, pos.z), 0xbff783, 18);
}

/* ---------------- Particles ---------------- */

function spawnParticleBurst(position, color = 0xffe27a, count = 12) {
  const geo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    scene.add(mesh);

    const angle = Math.random() * Math.PI * 2;
    const speed = 1.2 + Math.random() * 1.8;
    const vel = new THREE.Vector3(Math.cos(angle) * speed, 2 + Math.random() * 2, Math.sin(angle) * speed);
    particles.push({ mesh, vel, life: 1 });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt * 0.8;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      disposeObject(p.mesh);
      particles.splice(i, 1);
      continue;
    }
    p.vel.y -= 4 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.material.opacity = Math.max(0, p.life);
    p.mesh.rotation.x += dt * 4;
    p.mesh.rotation.y += dt * 3;
  }
}

/* ---------------- Fertilizer ---------------- */

function updateFertilizer(dt) {
  if (state.fertilizerTimeLeft > 0) {
    state.fertilizerTimeLeft -= dt;
    if (state.fertilizerTimeLeft <= 0) {
      state.fertilizerTimeLeft = 0;
      state.fertilizerMult = 1;
    }
  }
}

function buyFertilizer(fert) {
  if (state.gold < fert.cost) return;
  state.gold -= fert.cost;
  state.fertilizerMult = fert.mult;
  state.fertilizerTimeLeft = fert.duration;
  spawnFloatingText(new THREE.Vector3(0, 2, 0), `🧪 ${fert.label} active!`);
  spawnParticleBurst(new THREE.Vector3(0, 1, 0), 0x9adf6b, 14);
  updateGoldUI();
  updateFertilizerBadge();
  if (shopBackdrop.classList.contains('open')) refreshShopContent();
}

/* ---------------- Planting / growth ---------------- */

function plantCrop(tile, cropKey) {
  if (tile.cropType) return false;
  const def = CROP_TYPES[cropKey];
  if (state.gold < def.cost) return false;
  state.gold -= def.cost;

  const mesh = buildCropMesh(cropKey);
  mesh.position.copy(tile.mesh.position);
  mesh.position.y = 0.2;
  farmGroup.add(mesh);

  tile.cropMesh = mesh;
  tile.cropType = cropKey;
  tile.plantedAt = performance.now();
  tile.growTime = def.growTime;
  tile.ready = false;
  tile.waterTimeLeft = 0;
  tile.lastTick = performance.now();
  tile.popupAccum = 0;
  tile.popupTimer = 0;
  tile.dirtMesh.material = tile.dryMat;

  createTileBars(tile);

  state.cropsPlanted += 1;
  updateGoldUI();
  return true;
}

function waterTile(tile) {
  if (!tile.cropType) return false;
  tile.waterTimeLeft = WATER_DURATION;
  tile.dirtMesh.material = tile.wetMat;
  return true;
}

function removeCrop(tile) {
  if (!tile.cropType) return false;
  disposeObject(tile.cropMesh);
  tile.cropMesh = null;
  tile.cropType = null;
  tile.ready = false;
  tile.waterTimeLeft = 0;
  tile.popupAccum = 0;
  tile.popupTimer = 0;
  tile.dirtMesh.material = tile.dryMat;
  if (tile.uiBars) {
    tile.uiBars.container.remove();
    tile.uiBars = null;
  }
  return true;
}

/* ---------------- Floating text feedback ---------------- */

const floatingTexts = [];
function spawnFloatingText(worldPos, text) {
  const div = document.createElement('div');
  div.className = 'float-text';
  div.textContent = text;
  document.getElementById('overlay').appendChild(div);
  floatingTexts.push({ div, life: 1.0, worldPos: worldPos.clone().add(new THREE.Vector3(0, 0.6, 0)) });
}

function updateFloatingTexts(dt) {
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.life -= dt * 0.7;
    if (ft.life <= 0) {
      ft.div.remove();
      floatingTexts.splice(i, 1);
      continue;
    }
    const p = ft.worldPos.clone();
    p.y += (1 - ft.life) * 1.2;
    const proj = p.project(camera);
    const x = (proj.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-proj.y * 0.5 + 0.5) * window.innerHeight;
    ft.div.style.left = `${x}px`;
    ft.div.style.top = `${y}px`;
    ft.div.style.opacity = Math.min(1, ft.life * 1.5).toString();
  }
}

/* ---------------- Growth tick & passive income ---------------- */

function tickFarm(dt) {
  const now = performance.now();
  let earned = 0;
  for (const row of state.tiles) {
    for (const tile of row) {
      if (!tile.cropType) continue;

      if (tile.waterTimeLeft > 0) {
        tile.waterTimeLeft = Math.max(0, tile.waterTimeLeft - dt);
        tile.dirtMesh.material = tile.waterTimeLeft > 0 ? tile.wetMat : tile.dryMat;
      }

      const elapsedSec = (now - tile.plantedAt) / 1000;
      const t = Math.min(1, elapsedSec / tile.growTime);

      if (!tile.ready) {
        const scale = 0.05 + t * 0.95;
        tile.cropMesh.scale.setScalar(scale);
        if (t >= 1) {
          tile.ready = true;
          tile.lastTick = now;
        }
      } else {
        const def = CROP_TYPES[tile.cropType];
        const dtSec = (now - tile.lastTick) / 1000;
        const wateredMult = tile.waterTimeLeft > 0 ? WATER_BONUS_MULT : 1;
        const gainedThisTile = dtSec * def.rate * state.valueMult * state.fertilizerMult * wateredMult;
        earned += gainedThisTile;
        tile.lastTick = now;

        tile.popupAccum += gainedThisTile;
        tile.popupTimer += dtSec;
        if (tile.popupTimer >= 1.6 && tile.popupAccum > 0) {
          spawnFloatingText(tile.mesh.position, `+${tile.popupAccum.toFixed(1)}g`);
          tile.popupAccum = 0;
          tile.popupTimer = 0;
        }

        const pulse = 1 + Math.sin(now * 0.006 + tile.mesh.id) * 0.06;
        tile.cropMesh.scale.setScalar(pulse);
      }
    }
  }
  if (earned > 0) {
    state.gold += earned;
    state.lifetimeGold += earned;
    updateGoldText();
  }
}

/* ---------------- Pests (crows) ---------------- */

function spawnPest() {
  const candidates = [];
  for (const row of state.tiles) for (const t of row) if (t.cropType) candidates.push(t);
  if (candidates.length === 0) return;

  const target = candidates[Math.floor(Math.random() * candidates.length)];
  const mesh = buildPestMesh();

  const angle = Math.random() * Math.PI * 2;
  const spawnRadius = (state.landSize * 1.06) / 2 + 4;
  mesh.position.set(Math.cos(angle) * spawnRadius, 1.2, Math.sin(angle) * spawnRadius);
  scene.add(mesh);

  pests.push({ mesh, targetTile: target, speed: 1.8 + Math.random() * 0.6 });
}

function updatePests(dt) {
  const now = performance.now();
  for (let i = pests.length - 1; i >= 0; i--) {
    const p = pests[i];

    if (!p.targetTile.cropType) {
      scene.remove(p.mesh);
      disposeObject(p.mesh);
      pests.splice(i, 1);
      continue;
    }

    const targetPos = p.targetTile.mesh.position;
    const dx = targetPos.x - p.mesh.position.x;
    const dz = targetPos.z - p.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.25) {
      spawnFloatingText(p.mesh.position.clone(), 'crop lost!');
      removeCrop(p.targetTile);
      scene.remove(p.mesh);
      disposeObject(p.mesh);
      pests.splice(i, 1);
      continue;
    }

    const invDist = 1 / dist;
    p.mesh.position.x += dx * invDist * p.speed * dt;
    p.mesh.position.z += dz * invDist * p.speed * dt;
    p.mesh.position.y = 1.0 + Math.sin(now * 0.006 + i) * 0.15;
    p.mesh.lookAt(targetPos.x, p.mesh.position.y, targetPos.z);

    const flap = Math.sin(now * 0.02 + i) * 0.5;
    const wingL = p.mesh.getObjectByName('wingL');
    const wingR = p.mesh.getObjectByName('wingR');
    if (wingL) wingL.rotation.z = flap;
    if (wingR) wingR.rotation.z = -flap;
  }
}

function defeatPest(idx) {
  const p = pests[idx];
  const bounty = 3 + Math.random() * 2;
  state.gold += bounty;
  state.lifetimeGold += bounty;
  state.pestsDefeated += 1;
  spawnFloatingText(p.mesh.position.clone(), `+${bounty.toFixed(1)}g`);
  scene.remove(p.mesh);
  disposeObject(p.mesh);
  pests.splice(idx, 1);
  updateGoldUI();
}

/* ---------------- Quests ---------------- */

function checkQuests() {
  if (state.questIndex >= QUESTS.length) return;
  const q = QUESTS[state.questIndex];
  if (q.check()) {
    q.apply();
    spawnDecorationForQuest(state.questIndex);
    spawnFloatingText(new THREE.Vector3(0, 3, 0), `Quest complete: ${q.reward}`);
    state.questIndex += 1;
    updateGoldUI();
    if (questBackdrop.classList.contains('open')) refreshQuestContent();
  }
}

/* ---------------- Input handling ---------------- */

function getTileFromIntersect(mesh) {
  const x = mesh.userData.tileX;
  const z = mesh.userData.tileZ;
  if (x === undefined || z === undefined) return null;
  return state.tiles[x][z];
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);

  if (pests.length > 0) {
    const pestMeshes = pests.map(p => p.mesh);
    const pestHits = raycaster.intersectObjects(pestMeshes, true);
    if (pestHits.length > 0) {
      let hitObj = pestHits[0].object;
      while (hitObj.parent && !pests.find(p => p.mesh === hitObj)) hitObj = hitObj.parent;
      const idx = pests.findIndex(p => p.mesh === hitObj);
      if (idx !== -1) {
        defeatPest(idx);
        return;
      }
    }
  }

  if (treeGroup) {
    const treeHits = raycaster.intersectObject(treeGroup, true);
    if (treeHits.length > 0) {
      tapTree(treeHits[0].point);
      return;
    }
  }

  const soilMeshes = [];
  for (const row of state.tiles) for (const t of row) { soilMeshes.push(t.mesh); soilMeshes.push(t.dirtMesh); }
  const hits = raycaster.intersectObjects(soilMeshes, false);
  if (hits.length === 0) return;

  const tile = getTileFromIntersect(hits[0].object);
  if (!tile) return;

  if (state.selectedTool === 'water') {
    waterTile(tile);
  } else if (state.selectedTool === 'shovel') {
    removeCrop(tile);
  } else if (state.selectedCrop) {
    if (!tile.cropType) {
      plantCrop(tile, state.selectedCrop);
    }
  }
});

/* =========================================================
   UI
   ========================================================= */

const uiRoot = document.createElement('div');
uiRoot.id = 'ui-root';
document.body.appendChild(uiRoot);

const overlay = document.createElement('div');
overlay.id = 'overlay';
document.body.appendChild(overlay);

const style = document.createElement('style');
style.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  #ui-root, #overlay {
    position: fixed; inset: 0; pointer-events: none;
    font-family: 'Inter', sans-serif;
    box-sizing: border-box;
  }
  #ui-root * { box-sizing: border-box; }

  .panel {
    position: fixed;
    background: #efe4d3;
    border: 1px solid #c9b899;
    border-radius: 10px;
    color: #4a3826;
    pointer-events: auto;
  }

  #topbar {
    top: 12px; left: 12px; right: 12px;
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px;
    height: 52px;
    flex-wrap: wrap;
  }

  #goldDisplay {
    font-size: 18px; font-weight: 700; color: #6b4a1f;
    display: flex; align-items: center; gap: 8px;
  }
  #goldDisplay .coin {
    width: 18px; height: 18px; border-radius: 50%;
    background: #d4a94c; border: 1px solid #a8802f;
    display: inline-block;
  }
  #fertilizerBadge {
    font-size: 12px; font-weight: 600; color: #3a7f30;
    background: #d7f0c8; border: 1px solid #a8d68f;
    padding: 2px 8px; border-radius: 12px;
  }

  #topbarBtns { display: flex; gap: 8px; flex-wrap: wrap; }
  #upgradeBtn, #questBtn, #shopBtn {
    background: #c9a05a; border: 1px solid #a8802f; color: #3d2c14;
    font-weight: 600; font-size: 13px;
    padding: 8px 14px; border-radius: 8px; cursor: pointer;
  }
  #upgradeBtn:hover, #questBtn:hover, #shopBtn:hover { background: #d4ad68; }

  #cropBar {
    bottom: 12px; left: 50%; transform: translateX(-50%);
    display: flex; gap: 8px; padding: 10px;
    max-width: 96vw; overflow-x: auto;
  }

  .crop-btn {
    display: flex; flex-direction: column; align-items: center;
    gap: 4px; padding: 8px 10px; min-width: 84px;
    border-radius: 8px; border: 1px solid #c9b899;
    background: #e3d4b8; cursor: pointer; color: #4a3826;
    transition: background 0.12s, border-color 0.12s;
  }
  .crop-btn:hover { background: #d9c6a3; }
  .crop-btn.selected { background: #b8895a; border-color: #7a5326; color: #fff; }
  .crop-swatch {
    width: 22px; height: 22px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.2);
  }
  .crop-name { font-size: 11.5px; font-weight: 600; }
  .crop-cost { font-size: 10.5px; opacity: 0.8; }

  #toolPanel {
    right: 12px; top: 74px;
    display: flex; flex-direction: column; gap: 6px;
    padding: 8px;
  }
  .tool-btn {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px; border-radius: 8px; border: 1px solid #c9b899;
    background: #e3d4b8; cursor: pointer; color: #4a3826; font-size: 13px; font-weight: 600;
    min-width: 130px;
  }
  .tool-btn:hover { background: #d9c6a3; }
  .tool-btn.selected { background: #7a9b5a; border-color: #4f6b36; color: #fff; }

  #modalBackdrop, #questBackdrop, #shopBackdrop, #endgameBackdrop {
    position: fixed; inset: 0; background: rgba(30, 20, 10, 0.45);
    display: none; align-items: center; justify-content: center;
    pointer-events: auto; z-index: 20;
  }
  #modalBackdrop.open, #questBackdrop.open, #shopBackdrop.open, #endgameBackdrop.open { display: flex; }
  #modal, #questModal, #shopModal, #endgameModal {
    background: #efe4d3; border: 1px solid #c9b899; border-radius: 12px;
    padding: 20px; width: 360px; max-width: 92vw; color: #4a3826;
  }
  #modal h2, #questModal h2, #shopModal h2, #endgameModal h2 { font-size: 16px; margin-bottom: 14px; font-weight: 700; }
  #endgameModal p { font-size: 13px; line-height: 1.5; margin-bottom: 10px; }
  .upgrade-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 0; border-top: 1px solid #d9c6a3;
  }
  .upgrade-row:first-of-type { border-top: none; }
  .upgrade-label { font-size: 13px; font-weight: 600; }
  .upgrade-sub { font-size: 11px; opacity: 0.75; margin-top: 2px; }
  .upgrade-btn {
    background: #c9a05a; border: 1px solid #a8802f; color: #3d2c14;
    font-weight: 700; font-size: 12.5px; padding: 7px 12px; border-radius: 7px; cursor: pointer;
    white-space: nowrap;
  }
  .upgrade-btn:hover { background: #d4ad68; }
  .upgrade-btn:disabled, .upgrade-btn.disabled {
    background: #cfc3ac; border-color: #b3a488; color: #8a7a5f; cursor: not-allowed;
  }
  #closeModal, #closeQuestModal, #closeShopModal, #closeEndgameModal {
    margin-top: 16px; width: 100%; padding: 9px; border-radius: 8px;
    background: #4a3826; color: #efe4d3; border: none; cursor: pointer;
    font-weight: 600; font-size: 13px;
  }
  #closeModal:hover, #closeQuestModal:hover, #closeShopModal:hover, #closeEndgameModal:hover { background: #5c4630; }

  .float-text {
    position: fixed; pointer-events: none; color: #d4a94c;
    font-weight: 700; font-size: 14px; text-shadow: 0 1px 2px rgba(0,0,0,0.5);
    transform: translate(-50%, -50%);
  }

  .tile-bars {
    position: fixed;
    transform: translate(-50%, -100%);
    display: flex;
    flex-direction: column;
    gap: 2px;
    pointer-events: none;
  }
  .bar {
    width: 46px;
    height: 5px;
    background: rgba(0, 0, 0, 0.35);
    border-radius: 3px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    border-radius: 3px;
  }
  .growth-fill { background: #6dbf4a; }
  .water-fill { background: #4aa8df; }

  #hint {
    left: 12px; bottom: 74px;
    padding: 8px 12px; font-size: 11.5px; max-width: 280px; opacity: 0.9;
  }
`;
document.head.appendChild(style);

/* Topbar */
const topbar = document.createElement('div');
topbar.className = 'panel';
topbar.id = 'topbar';
topbar.innerHTML = `
  <div id="goldDisplay">
    <span class="coin"></span><span id="goldValue">10.0</span> gold
    <span id="fertilizerBadge" style="display:none;"></span>
  </div>
  <div id="topbarBtns">
    <button id="shopBtn">🧪 Shop</button>
    <button id="questBtn">🎯 Quests</button>
    <button id="upgradeBtn">Upgrades</button>
  </div>
`;
uiRoot.appendChild(topbar);

function updateGoldText() {
  document.getElementById('goldValue').textContent = state.gold.toFixed(1);
}

function updateFertilizerBadge() {
  const badge = document.getElementById('fertilizerBadge');
  if (!badge) return;
  if (state.fertilizerTimeLeft > 0) {
    badge.style.display = 'inline-flex';
    badge.textContent = `🧪 x${state.fertilizerMult.toFixed(1)} (${Math.ceil(state.fertilizerTimeLeft)}s)`;
  } else {
    badge.style.display = 'none';
  }
}

function updateGoldUI() {
  updateGoldText();
  refreshCropBarAffordability();
  refreshModalContent();
}

/* Crop bar */
const cropBar = document.createElement('div');
cropBar.className = 'panel';
cropBar.id = 'cropBar';
uiRoot.appendChild(cropBar);

function buildCropBar() {
  cropBar.innerHTML = '';
  for (const key of Object.keys(CROP_TYPES)) {
    const def = CROP_TYPES[key];
    const btn = document.createElement('div');
    btn.className = 'crop-btn';
    btn.dataset.crop = key;
    btn.innerHTML = `
      <div class="crop-swatch" style="background:#${def.color.toString(16).padStart(6,'0')}"></div>
      <div class="crop-name">${def.name}</div>
      <div class="crop-cost">${def.cost === 0 ? 'Free' : def.cost + 'g'}</div>
    `;
    btn.addEventListener('click', () => {
      state.selectedTool = null;
      state.selectedCrop = (state.selectedCrop === key) ? null : key;
      refreshSelectionUI();
    });
    cropBar.appendChild(btn);
  }
}
buildCropBar();

function refreshCropBarAffordability() {
  cropBar.querySelectorAll('.crop-btn').forEach((btn) => {
    const key = btn.dataset.crop;
    const def = CROP_TYPES[key];
    const affordable = state.gold >= def.cost;
    btn.style.opacity = affordable ? '1' : '0.5';
  });
}

function refreshSelectionUI() {
  cropBar.querySelectorAll('.crop-btn').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.crop === state.selectedCrop);
  });
  toolPanel.querySelectorAll('.tool-btn').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.tool === state.selectedTool);
  });
}

/* Tool panel */
const toolPanel = document.createElement('div');
toolPanel.className = 'panel';
toolPanel.id = 'toolPanel';
toolPanel.innerHTML = `
  <div class="tool-btn" data-tool="water">💧 Watering Can</div>
  <div class="tool-btn" data-tool="shovel">🔨 Shovel</div>
`;
uiRoot.appendChild(toolPanel);
toolPanel.querySelectorAll('.tool-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tool = btn.dataset.tool;
    state.selectedCrop = null;
    state.selectedTool = (state.selectedTool === tool) ? null : tool;
    refreshSelectionUI();
  });
});

/* Hint */
const hint = document.createElement('div');
hint.className = 'panel';
hint.id = 'hint';
hint.textContent = 'Water crops anytime for a 1.2x gold boost lasting 3 minutes. Tap the tree for gold — grow it with upgrades until it blooms gold!';
uiRoot.appendChild(hint);

/* Upgrade modal */
const modalBackdrop = document.createElement('div');
modalBackdrop.id = 'modalBackdrop';
modalBackdrop.innerHTML = `
  <div id="modal">
    <h2>Upgrades</h2>
    <div id="upgradeList"></div>
    <button id="closeModal">Close</button>
  </div>
`;
document.body.appendChild(modalBackdrop);

document.getElementById('upgradeBtn').addEventListener('click', () => {
  modalBackdrop.classList.add('open');
  refreshModalContent();
});
document.getElementById('closeModal').addEventListener('click', () => {
  modalBackdrop.classList.remove('open');
});
modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) modalBackdrop.classList.remove('open');
});

function refreshModalContent() {
  const list = document.getElementById('upgradeList');
  if (!list) return;
  list.innerHTML = '';

  const nextLandIdx = state.landIndex + 1;
  if (nextLandIdx < LAND_SIZES.length) {
    const cost = LAND_UPGRADE_COST[state.landIndex];
    const size = LAND_SIZES[nextLandIdx];
    const row = document.createElement('div');
    row.className = 'upgrade-row';
    row.innerHTML = `
      <div>
        <div class="upgrade-label">Expand Land</div>
        <div class="upgrade-sub">${state.landSize}x${state.landSize} &rarr; ${size}x${size}</div>
      </div>
      <button class="upgrade-btn" ${state.gold < cost ? 'disabled' : ''}>${cost}g</button>
    `;
    row.querySelector('button').addEventListener('click', () => {
      if (state.gold < cost) return;
      state.gold -= cost;
      state.landIndex = nextLandIdx;
      state.landSize = size;
      buildFarm();
      spawnParticleBurst(new THREE.Vector3(0, 1, 0), 0xffe27a, 14);
      updateGoldUI();
    });
    list.appendChild(row);
  } else {
    const row = document.createElement('div');
    row.className = 'upgrade-row';
    row.innerHTML = `<div><div class="upgrade-label">Expand Land</div><div class="upgrade-sub">Max size reached (12x12)</div></div>`;
    list.appendChild(row);
  }

  if (state.valueLevel < VALUE_UPGRADE.length) {
    const next = VALUE_UPGRADE[state.valueLevel];
    const row = document.createElement('div');
    row.className = 'upgrade-row';
    row.innerHTML = `
      <div>
        <div class="upgrade-label">Crop Value Boost</div>
        <div class="upgrade-sub">x${next.mult} multiplier (current x${state.valueMult.toFixed(2)})</div>
      </div>
      <button class="upgrade-btn" ${state.gold < next.cost ? 'disabled' : ''}>${next.cost}g</button>
    `;
    row.querySelector('button').addEventListener('click', () => {
      if (state.gold < next.cost) return;
      state.gold -= next.cost;
      state.valueMult *= next.mult;
      state.valueLevel += 1;
      spawnParticleBurst(new THREE.Vector3(0, 1, 0), 0xffe27a, 14);
      updateGoldUI();
    });
    list.appendChild(row);
  } else {
    const row = document.createElement('div');
    row.className = 'upgrade-row';
    row.innerHTML = `<div><div class="upgrade-label">Crop Value Boost</div><div class="upgrade-sub">Max boost reached (x${state.valueMult.toFixed(2)})</div></div>`;
    list.appendChild(row);
  }

  // NEW: Tree Growth upgrades — boosts tap power AND grows the tree visually
  if (state.tapLevel < TREE_UPGRADES.length) {
    const next = TREE_UPGRADES[state.tapLevel];
    const row = document.createElement('div');
    row.className = 'upgrade-row';
    const subText = next.golden
      ? `Final upgrade! Tap power x${next.mult}, tree reaches full size and turns gold`
      : `Tap power x${next.mult}, tree grows larger (currently ${state.tapPower.toFixed(1)}g/tap)`;
    row.innerHTML = `
      <div>
        <div class="upgrade-label">🌳 ${next.label}</div>
        <div class="upgrade-sub">${subText}</div>
      </div>
      <button class="upgrade-btn" ${state.gold < next.cost ? 'disabled' : ''}>${next.cost}g</button>
    `;
    row.querySelector('button').addEventListener('click', () => {
      if (state.gold < next.cost) return;
      state.gold -= next.cost;
      state.tapPower *= next.mult;
      state.tapLevel += 1;
      treeBaseScale = next.scale;
      if (treeGroup) spawnParticleBurst(treeGroup.position.clone().add(new THREE.Vector3(0, 3, 0)), 0xffe27a, 20);
      if (next.golden) {
        goldenTreeUnlocked = true;
        applyGoldenTreeLook();
        showEndgamePopup();
      }
      updateGoldUI();
    });
    list.appendChild(row);
  } else {
    const row = document.createElement('div');
    row.className = 'upgrade-row';
    row.innerHTML = `<div><div class="upgrade-label">🌳 Golden Tree</div><div class="upgrade-sub">Fully grown — max tap power ${state.tapPower.toFixed(1)}g/tap</div></div>`;
    list.appendChild(row);
  }
}

/* Quest modal */
const questBackdrop = document.createElement('div');
questBackdrop.id = 'questBackdrop';
questBackdrop.innerHTML = `
  <div id="questModal">
    <h2>Quests</h2>
    <div id="questList"></div>
    <button id="closeQuestModal">Close</button>
  </div>
`;
document.body.appendChild(questBackdrop);

document.getElementById('questBtn').addEventListener('click', () => {
  questBackdrop.classList.add('open');
  refreshQuestContent();
});
document.getElementById('closeQuestModal').addEventListener('click', () => {
  questBackdrop.classList.remove('open');
});
questBackdrop.addEventListener('click', (e) => {
  if (e.target === questBackdrop) questBackdrop.classList.remove('open');
});

function refreshQuestContent() {
  const list = document.getElementById('questList');
  if (!list) return;
  list.innerHTML = '';
  QUESTS.forEach((q, i) => {
    const status = i < state.questIndex ? '✅ Done' : (i === state.questIndex ? '⏳ In progress' : '🔒 Locked');
    const row = document.createElement('div');
    row.className = 'upgrade-row';
    row.innerHTML = `
      <div>
        <div class="upgrade-label">${q.desc}</div>
        <div class="upgrade-sub">Reward: ${q.reward} — ${status}</div>
      </div>
    `;
    list.appendChild(row);
  });
}

/* Shop modal */
const shopBackdrop = document.createElement('div');
shopBackdrop.id = 'shopBackdrop';
shopBackdrop.innerHTML = `
  <div id="shopModal">
    <h2>Shop</h2>
    <div id="shopList"></div>
    <button id="closeShopModal">Close</button>
  </div>
`;
document.body.appendChild(shopBackdrop);

document.getElementById('shopBtn').addEventListener('click', () => {
  shopBackdrop.classList.add('open');
  refreshShopContent();
});
document.getElementById('closeShopModal').addEventListener('click', () => {
  shopBackdrop.classList.remove('open');
});
shopBackdrop.addEventListener('click', (e) => {
  if (e.target === shopBackdrop) shopBackdrop.classList.remove('open');
});

function refreshShopContent() {
  const list = document.getElementById('shopList');
  if (!list) return;
  list.innerHTML = '';

  if (state.fertilizerTimeLeft > 0) {
    const activeRow = document.createElement('div');
    activeRow.className = 'upgrade-row';
    activeRow.innerHTML = `<div><div class="upgrade-label">Active Boost</div><div class="upgrade-sub">x${state.fertilizerMult.toFixed(1)} gold production — ${Math.ceil(state.fertilizerTimeLeft)}s left</div></div>`;
    list.appendChild(activeRow);
  }

  FERTILIZERS.forEach((fert) => {
    const row = document.createElement('div');
    row.className = 'upgrade-row';
    row.innerHTML = `
      <div>
        <div class="upgrade-label">${fert.label}</div>
        <div class="upgrade-sub">x${fert.mult} gold production for ${fert.duration}s</div>
      </div>
      <button class="upgrade-btn" ${state.gold < fert.cost ? 'disabled' : ''}>${fert.cost}g</button>
    `;
    row.querySelector('button').addEventListener('click', () => buyFertilizer(fert));
    list.appendChild(row);
  });
}

/* Endgame modal (NEW) */
const endgameBackdrop = document.createElement('div');
endgameBackdrop.id = 'endgameBackdrop';
endgameBackdrop.innerHTML = `
  <div id="endgameModal">
    <h2>🌟 You did it!</h2>
    <p>Your tree has reached its final golden form — that's the full upgrade path complete.</p>
    <p>Nothing changes mechanically — keep planting, tapping, and collecting at your own pace.</p>
    <button id="closeEndgameModal">Continue Playing</button>
  </div>
`;
document.body.appendChild(endgameBackdrop);

document.getElementById('closeEndgameModal').addEventListener('click', () => {
  endgameBackdrop.classList.remove('open');
});
endgameBackdrop.addEventListener('click', (e) => {
  if (e.target === endgameBackdrop) endgameBackdrop.classList.remove('open');
});

function showEndgamePopup() {
  endgameBackdrop.classList.add('open');
}

/* =========================================================
   Main loop
   ========================================================= */

buildFarm();
updateGoldUI();
refreshSelectionUI();

const clock = new THREE.Clock();
let uiRefreshTimer = 0;
let pestSpawnTimer = 10 + Math.random() * 8;

function animate() {
  const dt = Math.min(0.1, clock.getDelta());
  tickFarm(dt);
  updateFloatingTexts(dt);
  updatePests(dt);
  updateParticles(dt);
  updateFertilizer(dt);
  updateTileBars();

  pestSpawnTimer -= dt;
  if (pestSpawnTimer <= 0) {
    spawnPest();
    pestSpawnTimer = 18 + Math.random() * 14;
  }

  // NEW: smoothly grow the tree toward its current upgrade-tier size,
  // with the tap bounce layered on top.
  treeScaleCurrent += (treeBaseScale - treeScaleCurrent) * Math.min(1, dt * 2);
  tapPulse *= 0.85;
  if (treeGroup) treeGroup.scale.setScalar(treeScaleCurrent * (1 + tapPulse * 0.12));

  uiRefreshTimer += dt;
  if (uiRefreshTimer > 0.25) {
    uiRefreshTimer = 0;
    refreshCropBarAffordability();
    if (modalBackdrop.classList.contains('open')) refreshModalContent();
    if (shopBackdrop.classList.contains('open')) refreshShopContent();
    updateFertilizerBadge();
    checkQuests();
  }

  controls.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});