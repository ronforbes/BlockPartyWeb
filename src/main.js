import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const GRID_COLUMNS = 6;
const GRID_ROWS = 12;
const INITIAL_FILLED_ROWS = 5;
const BLOCK_SIZE = 1.1;
const BLOCK_GAP = 0.18;

const BLOCK_COLORS = [
  0xff6f91,
  0xff9671,
  0xffc75f,
  0xf9f871,
  0x6a93ff,
  0x6fffb0,
];

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
  const boardMaterial = new THREE.MeshBasicMaterial({
    color: 0x0a142d,
    opacity: 0.92,
    transparent: true,
  });
  const boardMesh = new THREE.Mesh(boardGeometry, boardMaterial);
  boardMesh.position.z = -BLOCK_SIZE * 0.8;
  scene.add(boardMesh);

  const frameGeometry = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(boardWidth, boardHeight, BLOCK_SIZE * 0.28)
  );
  const frameMaterial = new THREE.LineBasicMaterial({ color: 0x223459 });
  const frameMesh = new THREE.LineSegments(frameGeometry, frameMaterial);
  frameMesh.position.z = -BLOCK_SIZE;
  scene.add(frameMesh);
}

function createBlocks() {
  const blockGeometry = new THREE.BoxGeometry(
    BLOCK_SIZE - BLOCK_GAP,
    BLOCK_SIZE - BLOCK_GAP,
    BLOCK_SIZE * 0.55
  );

  for (let y = 0; y < GRID_ROWS; y += 1) {
    for (let x = 0; x < GRID_COLUMNS; x += 1) {
      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.4,
        metalness: 0.05,
      });
      const mesh = new THREE.Mesh(blockGeometry, material);
      const center = cellCenters[y][x];
      mesh.position.copy(center);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.visible = false;
      scene.add(mesh);
      blockMeshes[y][x] = mesh;
    }
  }
}

function createCursor() {
  const cursorGeometry = new THREE.BoxGeometry(
    BLOCK_SIZE * 2 - BLOCK_GAP,
    BLOCK_SIZE - BLOCK_GAP,
    BLOCK_SIZE * 0.6
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
  cursorMesh.position.z = BLOCK_SIZE;
  scene.add(cursorMesh);
}

function updateBlocks() {
  for (let y = 0; y < GRID_ROWS; y += 1) {
    for (let x = 0; x < GRID_COLUMNS; x += 1) {
      const cell = grid.getCell(x, y);
      const mesh = blockMeshes[y][x];
      if (!cell) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.material.color.set(cell.color);
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
  const viewHeight = GRID_ROWS * BLOCK_SIZE * 1.4;
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
