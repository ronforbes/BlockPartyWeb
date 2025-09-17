import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const GRID_COLUMNS = 6;
const GRID_ROWS = 12;
const INITIAL_FILLED_ROWS = 5;
const BLOCK_SIZE = 1.1;
const BLOCK_GAP = 0.18;
const BLOCK_DEPTH = BLOCK_SIZE * 0.6;

const BLOCK_COLORS = [
  0xff6f91,
  0xff9671,
  0xffc75f,
  0xf9f871,
  0x6a93ff,
  0x6fffb0,
];

const WHITE = new THREE.Color(0xffffff);
const BLACK = new THREE.Color(0x050505);
const baseColorScratch = new THREE.Color();
const shadeColorScratch = new THREE.Color();
const midColorScratch = new THREE.Color();
const highlightColorScratch = new THREE.Color();

class Grid {
  constructor(columns, rows, fillRows) {
    this.columns = columns;
    this.rows = rows;
    this.cells = Array.from({ length: rows }, () => Array(columns).fill(null));
    this.populateRandom(fillRows);
  }

  isInside(x, y) {
    return x >= 0 && x < this.columns && y >= 0 && y < this.rows;
  }

  getCell(x, y) {
    if (!this.isInside(x, y)) {
      return null;
    }
    return this.cells[y][x];
  }

  setCell(x, y, value) {
    if (this.isInside(x, y)) {
      this.cells[y][x] = value;
    }
  }

  swap(x1, y1, x2, y2) {
    if (!this.isInside(x1, y1) || !this.isInside(x2, y2)) {
      return;
    }
    const temp = this.cells[y1][x1];
    this.cells[y1][x1] = this.cells[y2][x2];
    this.cells[y2][x2] = temp;
  }

  populateRandom(fillRows) {
    const rowsToFill = Math.min(fillRows, this.rows);
    for (let y = 0; y < rowsToFill; y += 1) {
      let filledInRow = 0;
      for (let x = 0; x < this.columns; x += 1) {
        if (Math.random() < 0.72) {
          this.cells[y][x] = { color: randomBlockColor() };
          filledInRow += 1;
        }
      }
      if (filledInRow === 0) {
        const forcedColumn = Math.floor(Math.random() * this.columns);
        this.cells[y][forcedColumn] = { color: randomBlockColor() };
      }
    }
  }
}

function randomBlockColor() {
  const index = Math.floor(Math.random() * BLOCK_COLORS.length);
  return BLOCK_COLORS[index];
}

const grid = new Grid(GRID_COLUMNS, GRID_ROWS, INITIAL_FILLED_ROWS);

let scene;
let camera;
let renderer;
let cursorMesh;
let cursorX = Math.floor((GRID_COLUMNS - 1) / 2);
let cursorY = Math.max(1, INITIAL_FILLED_ROWS) - 1;
let playfieldGroup;
const blockMeshes = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLUMNS).fill(null));
const cellCenters = Array.from({ length: GRID_ROWS }, (_, y) =>
  Array.from({ length: GRID_COLUMNS }, (_, x) => computeCellCenter(x, y))
);

function computeCellCenter(x, y) {
  const offsetX = (GRID_COLUMNS - 1) / 2;
  const offsetY = (GRID_ROWS - 1) / 2;
  return new THREE.Vector3(
    (x - offsetX) * BLOCK_SIZE,
    (y - offsetY) * BLOCK_SIZE,
    0
  );
}

function init() {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x060814, 25, 60);

  playfieldGroup = new THREE.Group();
  playfieldGroup.rotation.x = THREE.MathUtils.degToRad(-18);
  playfieldGroup.rotation.y = THREE.MathUtils.degToRad(12);
  scene.add(playfieldGroup);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  document.body.appendChild(renderer.domElement);

  camera = new THREE.OrthographicCamera();
  camera.position.set(0, 0, 30);
  camera.lookAt(0, 0, 0);
  updateCameraFrustum();

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
  keyLight.position.set(3, 6, 10);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x729bff, 0.45);
  rimLight.position.set(-6, -8, -10);
  scene.add(rimLight);

  createPlayfield();
  createBlocks();
  createCursor();

  updateBlocks();
  updateCursor();

  window.addEventListener("resize", onWindowResize);
  window.addEventListener("keydown", onKeyDown);

  renderer.setAnimationLoop(render);
}

function createPlayfield() {
  const boardWidth = GRID_COLUMNS * BLOCK_SIZE + 0.4;
  const boardHeight = GRID_ROWS * BLOCK_SIZE + 0.6;
  const boardGeometry = new THREE.BoxGeometry(
    boardWidth,
    boardHeight,
    BLOCK_SIZE * 0.25
  );
  const boardMaterial = new THREE.MeshStandardMaterial({
    color: 0x0a142d,
    opacity: 0.92,
    transparent: true,
    roughness: 0.85,
    metalness: 0.06,
    emissive: 0x050a18,
    emissiveIntensity: 0.25,
  });
  const boardMesh = new THREE.Mesh(boardGeometry, boardMaterial);
  boardMesh.position.z = -BLOCK_DEPTH * 0.9;
  playfieldGroup.add(boardMesh);

  const frameGeometry = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(boardWidth, boardHeight, BLOCK_SIZE * 0.28)
  );
  const frameMaterial = new THREE.LineBasicMaterial({ color: 0x223459 });
  const frameMesh = new THREE.LineSegments(frameGeometry, frameMaterial);
  frameMesh.position.z = -BLOCK_DEPTH * 1.1;
  playfieldGroup.add(frameMesh);
}

function createBlocks() {
  for (let y = 0; y < GRID_ROWS; y += 1) {
    for (let x = 0; x < GRID_COLUMNS; x += 1) {
      const block = buildBlockMesh();
      const center = cellCenters[y][x];
      block.position.copy(center);
      block.visible = false;
      playfieldGroup.add(block);
      blockMeshes[y][x] = block;
    }
  }
}

function buildBlockMesh() {
  const blockGroup = new THREE.Group();
  const blockWidth = BLOCK_SIZE - BLOCK_GAP;
  const blockHeight = BLOCK_SIZE - BLOCK_GAP;
  const topHeight = blockHeight * 0.32;

  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.7,
    metalness: 0.08,
  });
  const baseGeometry = new THREE.BoxGeometry(
    blockWidth,
    blockHeight - topHeight,
    BLOCK_DEPTH
  );
  const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
  baseMesh.position.y = -topHeight / 2;
  baseMesh.renderOrder = 0;
  blockGroup.add(baseMesh);

  const topMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.35,
    metalness: 0.4,
  });
  const topGeometry = new THREE.BoxGeometry(
    blockWidth * 0.94,
    topHeight,
    BLOCK_DEPTH * 0.96
  );
  const topMesh = new THREE.Mesh(topGeometry, topMaterial);
  topMesh.position.y = blockHeight / 2 - topHeight / 2;
  topMesh.renderOrder = 1;
  blockGroup.add(topMesh);

  const sheenMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.18,
    metalness: 0.85,
    transparent: true,
    opacity: 0.85,
    emissive: 0xffffff,
    emissiveIntensity: 0.28,
    depthWrite: false,
  });
  const sheenGeometry = new THREE.BoxGeometry(
    blockWidth * 0.68,
    topHeight * 0.45,
    BLOCK_DEPTH * 0.72
  );
  const sheenMesh = new THREE.Mesh(sheenGeometry, sheenMaterial);
  sheenMesh.position.y = blockHeight / 2 - topHeight * 0.28;
  sheenMesh.position.z = BLOCK_DEPTH * 0.12;
  sheenMesh.rotation.x = THREE.MathUtils.degToRad(-10);
  sheenMesh.renderOrder = 2;
  blockGroup.add(sheenMesh);

  blockGroup.userData = {
    baseMaterial,
    topMaterial,
    sheenMaterial,
  };

  return blockGroup;
}

function applyBlockColor(block, colorHex) {
  const { baseMaterial, topMaterial, sheenMaterial } = block.userData;
  if (!baseMaterial || !topMaterial || !sheenMaterial) {
    return;
  }

  baseColorScratch.set(colorHex);
  shadeColorScratch.copy(baseColorScratch).lerp(BLACK, 0.45);
  midColorScratch.copy(baseColorScratch).lerp(WHITE, 0.18);
  highlightColorScratch.copy(baseColorScratch).lerp(WHITE, 0.58);

  baseMaterial.color.copy(shadeColorScratch);
  topMaterial.color.copy(midColorScratch);
  sheenMaterial.color.copy(highlightColorScratch);

  baseMaterial.emissive.copy(shadeColorScratch).multiplyScalar(0.32);
  topMaterial.emissive.copy(midColorScratch).multiplyScalar(0.38);
  sheenMaterial.emissive.copy(highlightColorScratch).multiplyScalar(0.24);
}

function createCursor() {
  const cursorGeometry = new THREE.BoxGeometry(
    BLOCK_SIZE * 2 - BLOCK_GAP,
    BLOCK_SIZE - BLOCK_GAP,
    BLOCK_DEPTH * 1.1
  );
  const cursorEdges = new THREE.EdgesGeometry(cursorGeometry);
  const cursorMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
  });
  cursorMaterial.depthTest = false;
  cursorMaterial.depthWrite = false;
  cursorMesh = new THREE.LineSegments(cursorEdges, cursorMaterial);
  cursorMesh.position.z = BLOCK_DEPTH * 1.05;
  playfieldGroup.add(cursorMesh);
}

function updateBlocks() {
  for (let y = 0; y < GRID_ROWS; y += 1) {
    for (let x = 0; x < GRID_COLUMNS; x += 1) {
      const cell = grid.getCell(x, y);
      const block = blockMeshes[y][x];
      if (!cell) {
        block.visible = false;
        continue;
      }
      block.visible = true;
      applyBlockColor(block, cell.color);
    }
  }
}

function updateCursor() {
  const leftCenter = cellCenters[cursorY][cursorX];
  const rightCenter = cellCenters[cursorY][cursorX + 1];
  const center = leftCenter.clone().add(rightCenter).multiplyScalar(0.5);
  cursorMesh.position.set(center.x, center.y, cursorMesh.position.z);
}

function onKeyDown(event) {
  switch (event.code) {
    case "ArrowLeft":
      moveCursor(-1, 0);
      event.preventDefault();
      break;
    case "ArrowRight":
      moveCursor(1, 0);
      event.preventDefault();
      break;
    case "ArrowUp":
      moveCursor(0, 1);
      event.preventDefault();
      break;
    case "ArrowDown":
      moveCursor(0, -1);
      event.preventDefault();
      break;
    case "Space":
    case "Enter":
      swapCursorBlocks();
      event.preventDefault();
      break;
    default:
      break;
  }
}

function moveCursor(deltaX, deltaY) {
  const nextX = THREE.MathUtils.clamp(
    cursorX + deltaX,
    0,
    GRID_COLUMNS - 2
  );
  const nextY = THREE.MathUtils.clamp(
    cursorY + deltaY,
    0,
    GRID_ROWS - 1
  );
  if (nextX !== cursorX || nextY !== cursorY) {
    cursorX = nextX;
    cursorY = nextY;
    updateCursor();
  }
}

function swapCursorBlocks() {
  grid.swap(cursorX, cursorY, cursorX + 1, cursorY);
  updateBlocks();
}

function updateCameraFrustum() {
  const aspect = window.innerWidth / window.innerHeight;
  const viewHeight = GRID_ROWS * BLOCK_SIZE * 1.55;
  const halfHeight = viewHeight / 2;
  const halfWidth = halfHeight * aspect;
  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.near = 0.1;
  camera.far = 100;
  camera.updateProjectionMatrix();
}

function onWindowResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateCameraFrustum();
}

function render() {
  renderer.render(scene, camera);
}

init();
