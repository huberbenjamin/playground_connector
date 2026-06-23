import * as THREE from "three";
import { MindARThree } from "mindar-image-three";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";

console.log("demo_playground.js loaded");

const config = window.DEMO_AR_CONFIG ?? {};

const arContainer = document.querySelector("#ar-container");
const startButton = document.querySelector("#start-ar");
const stopButton = document.querySelector("#stop-ar");
const saveButton = document.querySelector("#save-transform");
const resetButton = document.querySelector("#reset-transform");
const toggleLogButton = document.querySelector("#toggle-log");
const clearAssignmentsButton = document.querySelector("#clear-assignments");
const statusText = document.querySelector("#ar-status");
const gestureHint = document.querySelector("#gesture-hint");
const transformReadout = document.querySelector("#transform-readout");
const activeMarkerLabel = document.querySelector("#active-marker-label");
const drawerToggle = document.querySelector("#drawer-toggle");
const objectDrawer = document.querySelector("#object-drawer");
const markerSlotRow = document.querySelector("#marker-slot-row");
const objectCollection = document.querySelector("#object-collection");
const tabButtons = document.querySelectorAll(".tab-button");

const markerCount = config.markerCount ?? 6;
const maxTrack = config.maxTrack ?? 2;
const demoObjects = config.demoObjects ?? [];
const galleryObjects = config.galleryObjects ?? [];

let mindarThree = null;
let renderer = null;
let scene = null;
let camera = null;
let hasSetup = false;
let isRunning = false;
let activeMarkerIndex = 0;
let activeTab = "demo";
let isLogVisible = false;

const markerStates = new Map();
const visibleMarkers = new Set();

const STORAGE_ASSIGNMENTS_KEY = "demoPlayground.markerAssignments.v1";
const STORAGE_TRANSFORM_PREFIX = "demoPlayground.markerTransform.";

const gestureState = {
  mode: null,
  startX: 0,
  startY: 0,
  startDistance: 0,
  startAngle: 0,
  startScale: 1,
  startRotationX: 0,
  startRotationY: 0,
  startRotationZ: 0,
  startQuaternion: new THREE.Quaternion(),
  twistAxis: new THREE.Vector3(0, 0, 1)
};

function resetGestureState() {
  gestureState.mode = null;
  gestureState.startX = 0;
  gestureState.startY = 0;
  gestureState.startDistance = 0;
  gestureState.startAngle = 0;
  gestureState.startScale = 1;
  gestureState.startRotationX = 0;
  gestureState.startRotationY = 0;
  gestureState.startRotationZ = 0;
  gestureState.startQuaternion.identity();
  gestureState.twistAxis.set(0, 0, 1);
}

let assignments = loadAssignments();

function setStatus(message) {
  statusText.textContent = message;
}

function degToRad(degrees) {
  return degrees * Math.PI / 180;
}

function radToDeg(radians) {
  return radians * 180 / Math.PI;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundForStorage(value) {
  return Number(value.toFixed(4));
}

function isQuaternionArray(value) {
  return Array.isArray(value) &&
    value.length === 4 &&
    value.every((entry) => Number.isFinite(entry));
}

function quaternionArrayFromEulerDegrees(rotationX, rotationY, rotationZ) {
  const euler = new THREE.Euler(
    degToRad(rotationX),
    degToRad(rotationY),
    degToRad(rotationZ),
    "XYZ"
  );

  return new THREE.Quaternion().setFromEuler(euler).toArray();
}

function cleanQuaternionForStorage(quaternion) {
  if (!isQuaternionArray(quaternion)) return null;
  return quaternion.map(roundForStorage);
}

function defaultTransform() {
  return {
    scale: 1,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    quaternion: null
  };
}

function cloneTransform(transform) {
  return {
    scale: transform.scale,
    rotationX: transform.rotationX,
    rotationY: transform.rotationY,
    rotationZ: transform.rotationZ,
    quaternion: Array.isArray(transform.quaternion) ? [...transform.quaternion] : null
  };
}

function transformStorageKey(markerIndex) {
  return `${STORAGE_TRANSFORM_PREFIX}${markerIndex}`;
}

function getAllObjects() {
  return [
    ...demoObjects.map((object) => ({ ...object, source: "demo" })),
    ...galleryObjects.map((object) => ({ ...object, source: "gallery" }))
  ];
}

function getObjectsForActiveTab() {
  if (activeTab === "gallery") return galleryObjects.map((object) => ({ ...object, source: "gallery" }));
  return demoObjects.map((object) => ({ ...object, source: "demo" }));
}

function findObjectById(objectId) {
  return getAllObjects().find((object) => object.id === objectId) ?? null;
}

function sanitizeAssignments(value) {
  const knownIds = new Set(getAllObjects().map((object) => object.id));
  const output = Array.from({ length: markerCount }, () => null);

  if (!Array.isArray(value)) return output;

  for (let i = 0; i < markerCount; i += 1) {
    const objectId = value[i];
    output[i] = knownIds.has(objectId) ? objectId : null;
  }

  return output;
}

function loadAssignments() {
  try {
    const saved = localStorage.getItem(STORAGE_ASSIGNMENTS_KEY);
    if (!saved) return Array.from({ length: markerCount }, () => null);
    return sanitizeAssignments(JSON.parse(saved));
  } catch (error) {
    console.warn("Could not load marker assignments", error);
    return Array.from({ length: markerCount }, () => null);
  }
}

function saveAssignments() {
  localStorage.setItem(STORAGE_ASSIGNMENTS_KEY, JSON.stringify(assignments));
}

function loadTransform(markerIndex) {
  const fallback = defaultTransform();

  try {
    const saved = localStorage.getItem(transformStorageKey(markerIndex));
    if (!saved) return fallback;

    const parsed = JSON.parse(saved);

    const transform = {
      scale: Number.isFinite(parsed.scale) ? parsed.scale : fallback.scale,
      rotationX: Number.isFinite(parsed.rotationX) ? parsed.rotationX : fallback.rotationX,
      rotationY: Number.isFinite(parsed.rotationY) ? parsed.rotationY : fallback.rotationY,
      rotationZ: Number.isFinite(parsed.rotationZ) ? parsed.rotationZ : fallback.rotationZ,
      quaternion: isQuaternionArray(parsed.quaternion) ? parsed.quaternion : null
    };

    // Older saved transforms only have Euler rotations. Convert them to a quaternion
    // so later gestures can keep rotating from the exact current orientation.
    if (!transform.quaternion) {
      transform.quaternion = quaternionArrayFromEulerDegrees(
        transform.rotationX,
        transform.rotationY,
        transform.rotationZ
      );
    }

    return transform;
  } catch (error) {
    console.warn("Could not load saved transform", error);
    return fallback;
  }
}

function saveTransform(markerIndex, options = {}) {
  const { silent = false } = options;
  const markerState = markerStates.get(markerIndex);

  if (markerState?.group) {
    syncTransformFromGroup(markerState);
  }

  const transform = markerState?.transform ?? loadTransform(markerIndex);

  const cleanTransform = {
    scale: roundForStorage(transform.scale),
    rotationX: roundForStorage(transform.rotationX),
    rotationY: roundForStorage(transform.rotationY),
    rotationZ: roundForStorage(transform.rotationZ),
    quaternion: cleanQuaternionForStorage(transform.quaternion)
  };

  localStorage.setItem(transformStorageKey(markerIndex), JSON.stringify(cleanTransform));

  if (!silent) {
    setStatus(`Saved transform for marker ${markerIndex}.`);
  }

  updateTransformReadout();
}

function getAssignedMarkerIndex(objectId) {
  return assignments.findIndex((assignedObjectId) => assignedObjectId === objectId);
}

function getNextEmptyMarkerIndex() {
  return assignments.findIndex((objectId) => objectId === null);
}

function getMarkerDisplayName(markerIndex) {
  const objectId = assignments[markerIndex];
  const object = findObjectById(objectId);
  return object?.name ?? "Empty";
}

function setActiveMarker(markerIndex) {
  activeMarkerIndex = clamp(markerIndex, 0, markerCount - 1);
  updateTransformReadout();
  renderMarkerSlots();
  setStatus(`Editing marker ${activeMarkerIndex}.`);
}

function syncTransformFromGroup(markerState) {
  const { group, transform } = markerState;
  transform.scale = group.scale.x;
  transform.quaternion = group.quaternion.toArray();
  transform.rotationX = radToDeg(group.rotation.x);
  transform.rotationY = radToDeg(group.rotation.y);
  transform.rotationZ = radToDeg(group.rotation.z);
}

function applyTransform(markerIndex) {
  const markerState = markerStates.get(markerIndex);
  if (!markerState) return;

  const { group, transform } = markerState;

  transform.scale = clamp(transform.scale, 0.05, 20);
  group.scale.setScalar(transform.scale);

  if (isQuaternionArray(transform.quaternion)) {
    group.quaternion.fromArray(transform.quaternion);
  } else {
    group.rotation.set(
      degToRad(transform.rotationX),
      degToRad(transform.rotationY),
      degToRad(transform.rotationZ)
    );
    transform.quaternion = group.quaternion.toArray();
  }

  syncTransformFromGroup(markerState);
  updateTransformReadout();
}

function applyLiveTransform(markerIndex) {
  const markerState = markerStates.get(markerIndex);
  if (!markerState) return;

  syncTransformFromGroup(markerState);
  updateTransformReadout();
}

function updateTransformReadout() {
  const markerState = markerStates.get(activeMarkerIndex);
  const transform = markerState?.transform ?? loadTransform(activeMarkerIndex);
  const assignedName = getMarkerDisplayName(activeMarkerIndex);

  activeMarkerLabel.textContent = String(activeMarkerIndex);
  transformReadout.textContent =
    `Marker ${activeMarkerIndex} · ${assignedName} · scale ${transform.scale.toFixed(2)} · ` +
    `rot X ${Math.round(transform.rotationX)}° ` +
    `Y ${Math.round(transform.rotationY)}° ` +
    `Z ${Math.round(transform.rotationZ)}°`;
}

function createMarkerSlotButton(markerIndex) {
  const objectId = assignments[markerIndex];
  const object = findObjectById(objectId);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "marker-slot";
  button.classList.toggle("active", markerIndex === activeMarkerIndex);
  button.classList.toggle("assigned", Boolean(object));
  button.dataset.markerIndex = String(markerIndex);

  button.innerHTML = `
    <span class="marker-slot-title">Marker ${markerIndex}</span>
    <span class="marker-slot-name">${object?.name ?? "Empty"}</span>
  `;

  button.addEventListener("click", () => {
    setActiveMarker(markerIndex);
  });

  return button;
}

function renderMarkerSlots() {
  markerSlotRow.innerHTML = "";

  for (let markerIndex = 0; markerIndex < markerCount; markerIndex += 1) {
    markerSlotRow.appendChild(createMarkerSlotButton(markerIndex));
  }
}

function createObjectCard(object) {
  const assignedMarkerIndex = getAssignedMarkerIndex(object.id);
  const isAssigned = assignedMarkerIndex !== -1;

  const card = document.createElement("button");
  card.type = "button";
  card.className = "object-card";
  card.classList.toggle("assigned", isAssigned);
  card.dataset.objectId = object.id;

  const image = document.createElement("img");
  image.className = "object-thumb";
  image.src = object.thumbnailUrl ?? "";
  image.alt = object.name;
  image.loading = "lazy";
  image.addEventListener("error", () => {
    image.style.display = "none";
  });

  const fallback = document.createElement("div");
  fallback.className = "object-thumb-fallback";
  fallback.textContent = object.name.replace(/^Demo\s*/i, "") || "SOG";

  const title = document.createElement("span");
  title.className = "object-card-title";
  title.textContent = object.name;

  const badge = document.createElement("span");
  badge.className = "object-card-badge";
  badge.textContent = isAssigned ? `M${assignedMarkerIndex}` : "+";

  card.appendChild(fallback);
  card.appendChild(image);
  card.appendChild(title);
  card.appendChild(badge);

  card.addEventListener("click", () => {
    assignObjectBySelectionOrder(object.id);
  });

  return card;
}

function renderObjectCollection() {
  objectCollection.innerHTML = "";

  const objects = getObjectsForActiveTab();

  if (objects.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-collection";
    empty.textContent = activeTab === "gallery"
      ? "Gallery is empty for now. Later you can fill this from your backend."
      : "No demo objects configured.";
    objectCollection.appendChild(empty);
    return;
  }

  objects.forEach((object) => {
    objectCollection.appendChild(createObjectCard(object));
  });
}

function renderTabs() {
  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === activeTab);
  });
}

function renderPickerUi() {
  renderMarkerSlots();
  renderTabs();
  renderObjectCollection();
  updateTransformReadout();
}

function removeSplatFromMarker(markerIndex) {
  const markerState = markerStates.get(markerIndex);
  if (!markerState?.splat) return;

  markerState.group.remove(markerState.splat);
  markerState.splat.dispose?.();
  markerState.splat = null;
  markerState.objectId = null;
  markerState.loadingToken += 1;
}

async function updateMarkerObject(markerIndex) {
  const markerState = markerStates.get(markerIndex);
  if (!markerState) return;

  const objectId = assignments[markerIndex];

  if (markerState.objectId === objectId) return;

  removeSplatFromMarker(markerIndex);

  if (!objectId) {
    setStatus(`Marker ${markerIndex} is empty.`);
    return;
  }

  const object = findObjectById(objectId);
  if (!object) {
    setStatus(`Object for marker ${markerIndex} was not found.`);
    return;
  }

  const loadingToken = markerState.loadingToken + 1;
  markerState.loadingToken = loadingToken;
  markerState.objectId = objectId;

  const splat = new SplatMesh({
    url: object.url,
    lod: false
  });

  // Internal SOG orientation fix. User-controlled rotation stays on markerState.group.
  splat.quaternion.set(1, 0, 0, 0);

  markerState.splat = splat;
  markerState.group.add(splat);

  setStatus(`Loading ${object.name} for marker ${markerIndex}...`);

  try {
    if (splat.initialized) await splat.initialized;

    if (markerState.loadingToken === loadingToken) {
      setStatus(`${object.name} assigned to marker ${markerIndex}.`);
    }
  } catch (error) {
    console.error(`Failed to load ${object.name}`, error);
    if (markerState.loadingToken === loadingToken) {
      setStatus(`Failed to load ${object.name}: ${error.message}`);
    }
  }
}

async function syncAllMarkerObjects() {
  if (!hasSetup) return;
  await Promise.all(assignments.map((_, markerIndex) => updateMarkerObject(markerIndex)));
}

async function assignObjectToMarker(objectId, markerIndex) {
  const object = findObjectById(objectId);
  if (!object) return;

  const previouslyAssignedMarker = getAssignedMarkerIndex(objectId);
  if (previouslyAssignedMarker !== -1 && previouslyAssignedMarker !== markerIndex) {
    assignments[previouslyAssignedMarker] = null;
    if (hasSetup) removeSplatFromMarker(previouslyAssignedMarker);
  }

  assignments[markerIndex] = objectId;
  saveAssignments();
  setActiveMarker(markerIndex);
  renderPickerUi();

  if (hasSetup) {
    await updateMarkerObject(markerIndex);
  } else {
    setStatus(`${object.name} will load on marker ${markerIndex} when AR starts.`);
  }
}

async function assignObjectBySelectionOrder(objectId) {
  const alreadyAssignedMarker = getAssignedMarkerIndex(objectId);

  if (alreadyAssignedMarker !== -1) {
    setActiveMarker(alreadyAssignedMarker);
    setStatus(`${findObjectById(objectId)?.name ?? "Object"} is already assigned to marker ${alreadyAssignedMarker}.`);
    return;
  }

  const emptyMarker = getNextEmptyMarkerIndex();

  if (emptyMarker !== -1) {
    await assignObjectToMarker(objectId, emptyMarker);
    return;
  }

  // When all 6 are full, replace the currently selected marker.
  await assignObjectToMarker(objectId, activeMarkerIndex);
}

function clearMarkerAssignment(markerIndex) {
  assignments[markerIndex] = null;
  saveAssignments();

  if (hasSetup) removeSplatFromMarker(markerIndex);

  renderPickerUi();
  setStatus(`Cleared marker ${markerIndex}.`);
}

function clearAllAssignments() {
  assignments = Array.from({ length: markerCount }, () => null);
  saveAssignments();

  if (hasSetup) {
    for (let markerIndex = 0; markerIndex < markerCount; markerIndex += 1) {
      removeSplatFromMarker(markerIndex);
    }
  }

  renderPickerUi();
  setStatus("Cleared all marker assignments.");
}

function resetActiveTransform() {
  const markerState = markerStates.get(activeMarkerIndex);

  localStorage.removeItem(transformStorageKey(activeMarkerIndex));

  if (markerState) {
    markerState.transform = cloneTransform(defaultTransform());
    applyTransform(activeMarkerIndex);
  }

  setStatus(`Reset transform for marker ${activeMarkerIndex}.`);
}

function distanceBetweenTouches(touchA, touchB) {
  const dx = touchB.clientX - touchA.clientX;
  const dy = touchB.clientY - touchA.clientY;
  return Math.hypot(dx, dy);
}

function angleBetweenTouches(touchA, touchB) {
  return Math.atan2(
    touchB.clientY - touchA.clientY,
    touchB.clientX - touchA.clientX
  );
}

function getCameraFacingLocalAxis(group) {
  if (!camera) return new THREE.Vector3(0, 0, 1);

  const groupWorldPosition = new THREE.Vector3();
  const cameraWorldPosition = new THREE.Vector3();
  const groupWorldQuaternion = new THREE.Quaternion();

  group.getWorldPosition(groupWorldPosition);
  camera.getWorldPosition(cameraWorldPosition);
  group.getWorldQuaternion(groupWorldQuaternion);

  const directionToCamera = cameraWorldPosition
    .sub(groupWorldPosition)
    .normalize();

  const localAxes = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1)
  ];

  let bestLocalAxis = localAxes[2].clone();
  let bestScore = -Infinity;

  for (const localAxis of localAxes) {
    const worldAxis = localAxis.clone()
      .applyQuaternion(groupWorldQuaternion)
      .normalize();

    const signedScore = worldAxis.dot(directionToCamera);
    const score = Math.abs(signedScore);

    if (score > bestScore) {
      bestScore = score;
      bestLocalAxis = localAxis.clone().multiplyScalar(signedScore >= 0 ? 1 : -1);
    }
  }

  return bestLocalAxis.normalize();
}

function shouldIgnoreGesture(event) {
  return !isRunning || Boolean(event.target.closest("#ar-control-panel, #object-drawer, #drawer-toggle"));
}

function getActiveMarkerState() {
  return markerStates.get(activeMarkerIndex);
}

function handleTouchStart(event) {
  if (shouldIgnoreGesture(event)) return;

  const markerState = getActiveMarkerState();
  if (!markerState) return;

  event.preventDefault();

  if (event.touches.length === 1) {
    const touch = event.touches[0];

    syncTransformFromGroup(markerState);

    gestureState.mode = "rotate";
    gestureState.startX = touch.clientX;
    gestureState.startY = touch.clientY;
    gestureState.startRotationX = markerState.transform.rotationX;
    gestureState.startRotationY = markerState.transform.rotationY;
    gestureState.startRotationZ = markerState.transform.rotationZ;
  }

  if (event.touches.length >= 2) {
    const [touchA, touchB] = event.touches;

    syncTransformFromGroup(markerState);

    gestureState.mode = "pinch";
    gestureState.startDistance = distanceBetweenTouches(touchA, touchB);
    gestureState.startAngle = angleBetweenTouches(touchA, touchB);
    gestureState.startScale = markerState.transform.scale;
    gestureState.startRotationX = markerState.transform.rotationX;
    gestureState.startRotationY = markerState.transform.rotationY;
    gestureState.startRotationZ = markerState.transform.rotationZ;
    gestureState.startQuaternion.copy(markerState.group.quaternion);
    gestureState.twistAxis.copy(getCameraFacingLocalAxis(markerState.group));
  }
}

function handleTouchMove(event) {
  if (shouldIgnoreGesture(event)) return;

  const markerState = getActiveMarkerState();
  if (!markerState || !gestureState.mode) return;

  event.preventDefault();

  if (gestureState.mode === "rotate" && event.touches.length === 1) {
    const touch = event.touches[0];
    const deltaX = touch.clientX - gestureState.startX;
    const deltaY = touch.clientY - gestureState.startY;

    markerState.transform.rotationY = gestureState.startRotationY + deltaX * 0.45;
    markerState.transform.rotationX = gestureState.startRotationX + deltaY * 0.45;
    markerState.transform.rotationZ = gestureState.startRotationZ;
    markerState.transform.quaternion = null;

    applyTransform(activeMarkerIndex);
  }

  if (gestureState.mode === "pinch" && event.touches.length >= 2) {
    const [touchA, touchB] = event.touches;

    // Pinch scale.
    const currentDistance = distanceBetweenTouches(touchA, touchB);
    const scaleFactor = currentDistance / gestureState.startDistance;
    markerState.transform.scale = clamp(gestureState.startScale * scaleFactor, 0.05, 20);
    markerState.group.scale.setScalar(markerState.transform.scale);

    // Two-finger twist: rotate around the object's local axis that was facing
    // the camera/user when the gesture started, instead of always using Z.
    const currentAngle = angleBetweenTouches(touchA, touchB);
    const angleDelta = currentAngle - gestureState.startAngle;

    markerState.group.quaternion.copy(gestureState.startQuaternion);
    markerState.group.rotateOnAxis(gestureState.twistAxis, -angleDelta); // - to invert the rotation

    applyLiveTransform(activeMarkerIndex);
  }
}

function handleTouchEnd(event) {
  if (!isRunning) {
    resetGestureState();
    return;
  }

  if (shouldIgnoreGesture(event)) return;

  if (gestureState.mode) {
    saveTransform(activeMarkerIndex, { silent: true });
    setStatus(`Updated transform for marker ${activeMarkerIndex}.`);
  }

  resetGestureState();
}

function installGestureHandlers() {
  arContainer.addEventListener("touchstart", handleTouchStart, { passive: false });
  arContainer.addEventListener("touchmove", handleTouchMove, { passive: false });
  arContainer.addEventListener("touchend", handleTouchEnd, { passive: false });
  arContainer.addEventListener("touchcancel", handleTouchEnd, { passive: false });
}

function setDrawerExpanded(expanded) {
  objectDrawer.classList.toggle("collapsed", !expanded);
  drawerToggle.setAttribute("aria-expanded", String(expanded));
  drawerToggle.textContent = expanded ? "⌄ Hide" : "⌃ Objects";
}

function createEmptyMarkerStates() {
  for (let markerIndex = 0; markerIndex < markerCount; markerIndex += 1) {
    const anchor = mindarThree.addAnchor(markerIndex);
    const group = new THREE.Group();
    const transform = loadTransform(markerIndex);

    // Keep objects hidden until their marker is actually found.
    group.visible = false;

    anchor.group.add(group);

    const markerState = {
      anchor,
      group,
      transform,
      splat: null,
      objectId: null,
      loadingToken: 0
    };

    markerStates.set(markerIndex, markerState);
    applyTransform(markerIndex);

    anchor.onTargetFound = () => {
      group.visible = true;
      visibleMarkers.add(markerIndex);
      setActiveMarker(markerIndex);
      setStatus(`Marker ${markerIndex} found.`);
    };

    anchor.onTargetLost = () => {
      group.visible = false;
      visibleMarkers.delete(markerIndex);
      setStatus(`Marker ${markerIndex} lost.`);
    };
  }
}

function hideAllMarkerGroups() {
  markerStates.forEach((markerState) => {
    if (markerState?.group) {
      markerState.group.visible = false;
    }
  });
}

function setMindARUiVisible(visible) {
  const displayValue = visible ? "" : "none";

  document
    .querySelectorAll(".mindar-ui-scanning, .mindar-ui-loading, .mindar-ui-compatibility")
    .forEach((element) => {
      element.style.display = displayValue;
    });
}

function setCameraElementsVisible(visible) {
  const displayValue = visible ? "block" : "none";

  document.querySelectorAll("#ar-container video").forEach((video) => {
    video.style.display = displayValue;
  });

  if (renderer?.domElement) {
    renderer.domElement.style.display = displayValue;
  }
}

function clearARView() {
  renderer?.setAnimationLoop(null);
  hideAllMarkerGroups();
  setMindARUiVisible(false);

  if (renderer) {
    renderer.setClearColor(0x000000, 0);
    renderer.setClearAlpha(0);
    renderer.clear(true, true, true);
  }

  setCameraElementsVisible(false);
}

function showARView() {
  setCameraElementsVisible(true);
  setMindARUiVisible(true);
}

async function setupMindAR() {
  if (hasSetup) return;

  if (!window.isSecureContext) {
    throw new Error("Camera requires HTTPS on iPhone. Use an HTTPS tunnel such as ngrok or Cloudflare Tunnel.");
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Camera API is not available in this browser/context.");
  }

  mindarThree = new MindARThree({
    container: arContainer,
    imageTargetSrc: config.mindFileUrl,
    maxTrack: maxTrack,
    filterMinCF: 0.001,
    filterBeta: 0.01,
    missTolerance: 10
  });

  ({ renderer, scene, camera } = mindarThree);

  scene.background = null;
  renderer.setClearColor(0x000000, 0);
  renderer.setClearAlpha(0);
  renderer.domElement.style.background = "transparent";
  renderer.domElement.style.position = "absolute";
  renderer.domElement.style.inset = "0";
  renderer.domElement.style.zIndex = "1";

  const sparkRenderer = new SparkRenderer({ renderer });
  scene.add(sparkRenderer);

  createEmptyMarkerStates();
  installGestureHandlers();

  hasSetup = true;

  await syncAllMarkerObjects();
  renderPickerUi();
}

async function startAR() {
  if (isRunning) return;

  try {
    setStatus("Loading AR scene...");
    startButton.disabled = true;

    await setupMindAR();
    await mindarThree.start();

    showARView();

    renderer.setAnimationLoop(() => {
      renderer.setClearColor(0x000000, 0);
      renderer.setClearAlpha(0);
      renderer.render(scene, camera);
    });

    isRunning = true;
    stopButton.disabled = false;
    setStatus(`AR running. ${markerCount} markers configured, max ${maxTrack} tracked at once.`);
  } catch (error) {
    console.error("startAR failed:", error);
    isRunning = false;
    startButton.disabled = false;
    stopButton.disabled = true;
    clearARView();
    setStatus(`AR failed: ${error.message}`);
  }
}

async function stopAR() {
  if (!mindarThree || !isRunning) return;

  try {
    // Set this first so touch handlers stop immediately.
    isRunning = false;
    resetGestureState();

    renderer?.setAnimationLoop(null);
    await mindarThree.stop();

    visibleMarkers.clear();
    clearARView();

    startButton.disabled = false;
    stopButton.disabled = true;
    setStatus("AR stopped.");
  } catch (error) {
    console.error("stopAR failed:", error);

    // Still clean the UI even if MindAR throws while stopping.
    isRunning = false;
    visibleMarkers.clear();
    clearARView();

    startButton.disabled = false;
    stopButton.disabled = true;
    setStatus(`AR stopped with cleanup warning: ${error.message}`);
  }
}

function updateLogVisibility() {
  [statusText, gestureHint, transformReadout].forEach(el => el.classList.toggle("is-hidden", !isLogVisible));
  toggleLogButton.textContent = isLogVisible ? "▼" : "▶";
  toggleLogButton.setAttribute("aria-pressed", String(isLogVisible));
}

startButton.addEventListener("click", startAR);
stopButton.addEventListener("click", stopAR);
saveButton.addEventListener("click", () => saveTransform(activeMarkerIndex));
resetButton.addEventListener("click", resetActiveTransform);
toggleLogButton.addEventListener("click", () => {
  isLogVisible = !isLogVisible;
  updateLogVisibility();
});

clearAssignmentsButton.addEventListener("click", clearAllAssignments);
drawerToggle.addEventListener("click", () => {
  setDrawerExpanded(drawerToggle.getAttribute("aria-expanded") !== "true");
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeTab = button.dataset.tab;
    renderPickerUi();
  });
});

markerSlotRow.addEventListener("dblclick", (event) => {
  const slot = event.target.closest(".marker-slot");
  if (!slot) return;
  clearMarkerAssignment(Number(slot.dataset.markerIndex));
});

window.addEventListener("beforeunload", () => {
  if (mindarThree && isRunning) {
    mindarThree.stop();
  }

  resetGestureState();
});

renderPickerUi();
setDrawerExpanded(false);
