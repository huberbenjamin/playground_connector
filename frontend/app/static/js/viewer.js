import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";
import { SplatMesh } from "@sparkjsdev/spark";

const config = window.VIEWER_CONFIG || {};
const splats = config.splats || [];

if (splats.length === 0) {
  console.error("No splat files were configured.");
}

let currentIndex = 0;
let currentSplat = null;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

camera.position.set(0, 1.5, 0);
camera.lookAt(0, 1.5, -1);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance"
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.style.touchAction = "none";
document.body.appendChild(renderer.domElement);

renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local-floor");

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.5, -1);
controls.enableDamping = true;
controls.update();

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clickableObjects = [];

function loadSplat(url) {
  if (currentSplat) {
    scene.remove(currentSplat);

    if (typeof currentSplat.dispose === "function") {
      currentSplat.dispose();
    }
  }

  currentSplat = new SplatMesh({
    url,
    enableControls: false,
    halfPrecision: true,
    antialiased: false
  });

  currentSplat.position.set(0, 1.5, -1);
  currentSplat.rotation.set(0, Math.PI, Math.PI);
  currentSplat.scale.set(0.3, 0.3, 0.3);

  scene.add(currentSplat);
}

function createButton(text, position, onClick) {
  const geometry = new THREE.PlaneGeometry(0.3, 0.1);

  const backgroundMaterial = new THREE.MeshBasicMaterial({
    color: 0x4444ff,
    side: THREE.DoubleSide
  });

  const button = new THREE.Mesh(geometry, backgroundMaterial);
  button.position.copy(position);

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "white";
  ctx.font = "bold 48px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 64);

  const texture = new THREE.CanvasTexture(canvas);

  const textMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide
  });

  const textMesh = new THREE.Mesh(geometry, textMaterial);
  textMesh.position.z = 0.01;
  button.add(textMesh);

  button.userData.onClick = onClick;
  button.userData.isButton = true;

  return button;
}

const prevButton = createButton("PREV", new THREE.Vector3(-0.3, 1.3, -0.5), () => {
  currentIndex = (currentIndex - 1 + splats.length) % splats.length;
  loadSplat(splats[currentIndex]);
});

const nextButton = createButton("NEXT", new THREE.Vector3(0.3, 1.3, -0.5), () => {
  currentIndex = (currentIndex + 1) % splats.length;
  loadSplat(splats[currentIndex]);
});

scene.add(prevButton);
scene.add(nextButton);
clickableObjects.push(prevButton, nextButton);

function findButtonRoot(object) {
  let current = object;

  while (current && !current.userData.isButton) {
    current = current.parent;
  }

  return current && current.userData.isButton ? current : null;
}

function getIntersectedButton(event) {
  const rect = renderer.domElement.getBoundingClientRect();

  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);

  const intersects = raycaster.intersectObjects(clickableObjects, true);

  if (intersects.length === 0) {
    return null;
  }

  return findButtonRoot(intersects[0].object);
}

// This tap detector allows:
// - short tap on a 3D button => button click
// - drag movement => OrbitControls rotation
// - two fingers => OrbitControls pinch zoom
const activePointers = new Map();

let buttonTouchCandidate = null;
let pointerDownPosition = null;
let pointerDownId = null;

const TAP_MOVEMENT_LIMIT_PX = 10;

renderer.domElement.addEventListener(
  "pointerdown",
  (event) => {
    activePointers.set(event.pointerId, event);

    if (activePointers.size > 1) {
      buttonTouchCandidate = null;
      pointerDownPosition = null;
      pointerDownId = null;
      return;
    }

    const button = getIntersectedButton(event);

    if (!button) {
      buttonTouchCandidate = null;
      pointerDownPosition = null;
      pointerDownId = null;
      return;
    }

    buttonTouchCandidate = button;
    pointerDownPosition = {
      x: event.clientX,
      y: event.clientY
    };
    pointerDownId = event.pointerId;
  },
  { passive: true }
);

renderer.domElement.addEventListener(
  "pointermove",
  (event) => {
    if (activePointers.has(event.pointerId)) {
      activePointers.set(event.pointerId, event);
    }

    if (
      !buttonTouchCandidate ||
      !pointerDownPosition ||
      event.pointerId !== pointerDownId
    ) {
      return;
    }

    const dx = event.clientX - pointerDownPosition.x;
    const dy = event.clientY - pointerDownPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > TAP_MOVEMENT_LIMIT_PX) {
      buttonTouchCandidate = null;
      pointerDownPosition = null;
      pointerDownId = null;
    }
  },
  { passive: true }
);

renderer.domElement.addEventListener(
  "pointerup",
  (event) => {
    activePointers.delete(event.pointerId);

    if (
      !buttonTouchCandidate ||
      !pointerDownPosition ||
      event.pointerId !== pointerDownId
    ) {
      buttonTouchCandidate = null;
      pointerDownPosition = null;
      pointerDownId = null;
      return;
    }

    const dx = event.clientX - pointerDownPosition.x;
    const dy = event.clientY - pointerDownPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const releasedButton = getIntersectedButton(event);

    if (
      distance <= TAP_MOVEMENT_LIMIT_PX &&
      releasedButton === buttonTouchCandidate &&
      buttonTouchCandidate.userData.onClick
    ) {
      buttonTouchCandidate.userData.onClick();
    }

    buttonTouchCandidate = null;
    pointerDownPosition = null;
    pointerDownId = null;
  },
  { passive: true }
);

renderer.domElement.addEventListener(
  "pointercancel",
  (event) => {
    activePointers.delete(event.pointerId);

    if (event.pointerId === pointerDownId) {
      buttonTouchCandidate = null;
      pointerDownPosition = null;
      pointerDownId = null;
    }
  },
  { passive: true }
);

const controllerModelFactory = new XRControllerModelFactory();

for (let i = 0; i <= 1; i += 1) {
  const controller = renderer.xr.getController(i);

  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1)
  ]);

  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color: 0xffffff })
  );

  controller.add(line);

  controller.addEventListener("selectstart", () => {
    raycaster.setFromXRController(controller);

    const intersects = raycaster.intersectObjects(clickableObjects, true);

    for (const intersect of intersects) {
      const button = findButtonRoot(intersect.object);

      if (button && button.userData.onClick) {
        button.userData.onClick();
        break;
      }
    }
  });

  scene.add(controller);

  const grip = renderer.xr.getControllerGrip(i);
  grip.add(controllerModelFactory.createControllerModel(grip));
  scene.add(grip);
}

function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", handleResize);

if (splats.length > 0) {
  loadSplat(splats[0]);
}

document.body.appendChild(VRButton.createButton(renderer));

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
