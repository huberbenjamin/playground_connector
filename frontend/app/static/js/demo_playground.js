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
const legacyDemoObjects = Array.isArray(config.demoObjects) ? config.demoObjects : [];
const configuredGalleryObjects = Array.isArray(config.galleryObjects) ? config.galleryObjects : [];

const multitrackButton = document.querySelector("#multitrack-button");
const MULTITRACK_STORAGE_KEY = "demo-playground-enable-multi-track";
let currentMaxTrack = Number(localStorage.getItem(MULTITRACK_STORAGE_KEY)) || 1;

// Single-library mode. For now, the old demo objects are treated as Gallery objects.
// Later your backend can fill galleryObjects with user-owned objects.
const galleryObjects = configuredGalleryObjects.length > 0
  ? configuredGalleryObjects
  : legacyDemoObjects;

let mindarThree = null;
let renderer = null;
let scene = null;
let camera = null;
let hasSetup = false;
let isRunning = false;
let activeMarkerIndex = 0;
let isLogVisible = false;

const markerStates = new Map();
const visibleMarkers = new Set();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

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
  twistAxis: new THREE.Vector3(0, 0, 1),
  hasMoved: false,
  startTime: 0
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
  gestureState.hasMoved = false;
  gestureState.startTime = 0;
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
    scale: 1.2,
    rotationX: 90,
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
  return galleryObjects.map((object) => ({ ...object, source: "gallery" }));
}

function getObjectsForCollection() {
  return getAllObjects();
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

function getNextEmptyMarkerIndex(startAfter = -1) {
  for (let offset = 1; offset <= markerCount; offset += 1) {
    const markerIndex = (startAfter + offset + markerCount) % markerCount;
    if (assignments[markerIndex] === null) return markerIndex;
  }

  return -1;
}

function getMarkerDisplayName(markerIndex) {
  const objectId = assignments[markerIndex];
  const object = findObjectById(objectId);
  return object?.name ?? "Empty";
}

function setActiveMarker(markerIndex, options = {}) {
  const { silent = false } = options;

  activeMarkerIndex = clamp(markerIndex, 0, markerCount - 1);
  updateTransformReadout();
  renderMarkerSlots();
  renderObjectCollection();

  if (!silent) {
    setStatus(`Editing marker ${activeMarkerIndex}.`);
  }
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
  const isSelectedForActiveMarker = assignments[activeMarkerIndex] === object.id;

  const card = document.createElement("button");
  card.type = "button";
  card.className = "object-card";
  card.classList.toggle("assigned", isAssigned);
  card.classList.toggle("selected", isSelectedForActiveMarker);
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

  if (isSelectedForActiveMarker) {
    badge.textContent = "✓";
  } else if (isAssigned) {
    badge.textContent = `M${assignedMarkerIndex}`;
  } else {
    badge.textContent = "+";
  }

  card.appendChild(fallback);
  card.appendChild(image);
  card.appendChild(title);
  card.appendChild(badge);

  card.addEventListener("click", () => {
    toggleObjectForActiveMarker(object.id);
  });

  return card;
}

function renderObjectCollection() {
  objectCollection.innerHTML = "";

  const objects = getObjectsForCollection();

  if (objects.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-collection";
    empty.textContent = "Gallery is empty for now. Later you can fill this from your backend.";
    objectCollection.appendChild(empty);
    return;
  }

  objects.forEach((object) => {
    objectCollection.appendChild(createObjectCard(object));
  });
}

function renderTabs() {
  // Tabs were removed. Keep this as a no-op so older HTML does not break.
  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === "gallery");
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

async function assignObjectToMarker(objectId, markerIndex, options = {}) {
  const { advanceToNextEmpty = false } = options;
  const object = findObjectById(objectId);
  if (!object) return;

  const targetMarkerIndex = clamp(markerIndex, 0, markerCount - 1);
  const previouslyAssignedMarker = getAssignedMarkerIndex(objectId);

  if (previouslyAssignedMarker !== -1 && previouslyAssignedMarker !== targetMarkerIndex) {
    assignments[previouslyAssignedMarker] = null;
    if (hasSetup) removeSplatFromMarker(previouslyAssignedMarker);
  }

  assignments[targetMarkerIndex] = objectId;
  saveAssignments();
  renderPickerUi();

  if (hasSetup) {
    await updateMarkerObject(targetMarkerIndex);
  }

  if (advanceToNextEmpty) {
    const nextEmptyMarker = getNextEmptyMarkerIndex(targetMarkerIndex);

    if (nextEmptyMarker !== -1) {
      setActiveMarker(nextEmptyMarker, { silent: true });
      setStatus(`${object.name} assigned to marker ${targetMarkerIndex}. Next empty marker: ${nextEmptyMarker}.`);
      return;
    }
  }

  setActiveMarker(targetMarkerIndex, { silent: true });
  setStatus(`${object.name} assigned to marker ${targetMarkerIndex}.`);
}

async function toggleObjectForActiveMarker(objectId) {
  const object = findObjectById(objectId);
  if (!object) return;

  const currentObjectId = assignments[activeMarkerIndex];

  // Tap the currently selected object again to deselect it from this marker.
  if (currentObjectId === objectId) {
    clearMarkerAssignment(activeMarkerIndex);
    setStatus(`${object.name} deselected from marker ${activeMarkerIndex}.`);
    return;
  }

  await assignObjectToMarker(objectId, activeMarkerIndex, { advanceToNextEmpty: true });
}

async function assignObjectBySelectionOrder(objectId) {
  // Legacy name kept for compatibility. New behavior is marker-slot driven.
  await toggleObjectForActiveMarker(objectId);
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

function getMarkerStateFromScreenPoint(clientX, clientY) {
  if (!camera || !renderer) return null;

  const rect = renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((clientY - rect.top) / rect.height) * 2 - 1);

  raycaster.setFromCamera(pointer, camera);

  const hitboxes = [];
  markerStates.forEach((markerState) => {
    if (markerState.group?.visible && markerState.objectId && markerState.hitbox) {
      hitboxes.push(markerState.hitbox);
    }
  });

  const hits = raycaster.intersectObjects(hitboxes, false);
  if (hits.length === 0) return null;

  const markerIndex = Number(hits[0].object.userData.markerIndex);
  return markerStates.get(markerIndex) ?? null;
}

function selectMarkerFromScreenPoint(clientX, clientY) {
  const markerState = getMarkerStateFromScreenPoint(clientX, clientY);
  if (!markerState) return false;

  const markerIndex = markerState.markerIndex;
  setActiveMarker(markerIndex, { silent: true });
  setStatus(`Selected marker ${markerIndex} from AR object.`);
  return true;
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
    gestureState.hasMoved = false;
    gestureState.startTime = performance.now();
    gestureState.startRotationX = markerState.transform.rotationX;
    gestureState.startRotationY = markerState.transform.rotationY;
    gestureState.startRotationZ = markerState.transform.rotationZ;
  }

  if (event.touches.length >= 2) {
    const [touchA, touchB] = event.touches;

    syncTransformFromGroup(markerState);

    gestureState.mode = "pinch";
    gestureState.hasMoved = false;
    gestureState.startTime = performance.now();
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

    if (Math.hypot(deltaX, deltaY) > 8) {
      gestureState.hasMoved = true;
    }

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

    if (Math.abs(currentDistance - gestureState.startDistance) > 6) {
      gestureState.hasMoved = true;
    }
    markerState.transform.scale = clamp(gestureState.startScale * scaleFactor, 0.05, 20);
    markerState.group.scale.setScalar(markerState.transform.scale);

    // Two-finger twist: rotate around the object's local axis that was facing
    // the camera/user when the gesture started, instead of always using Z.
    const currentAngle = angleBetweenTouches(touchA, touchB);
    const angleDelta = currentAngle - gestureState.startAngle;

    if (Math.abs(angleDelta) > degToRad(3)) {
      gestureState.hasMoved = true;
    }

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
    const changedTouch = event.changedTouches?.[0];
    const isQuickTap = gestureState.mode === "rotate" &&
      !gestureState.hasMoved &&
      changedTouch &&
      performance.now() - gestureState.startTime < 450;

    if (isQuickTap && selectMarkerFromScreenPoint(changedTouch.clientX, changedTouch.clientY)) {
      resetGestureState();
      return;
    }

    if (gestureState.hasMoved) {
      saveTransform(activeMarkerIndex, { silent: true });
      setStatus(`Updated transform for marker ${activeMarkerIndex}.`);
    }
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

    const hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.4, 1.4),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false
      })
    );
    hitbox.userData.markerIndex = markerIndex;
    group.add(hitbox);

    // Keep objects hidden until their marker is actually found.
    group.visible = false;

    anchor.group.add(group);

    const markerState = {
      markerIndex,
      anchor,
      group,
      hitbox,
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
      setStatus(`Marker ${markerIndex} found. Tap its object to edit this marker.`);
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
    maxTrack: currentMaxTrack,
    filterMinCF: 0.0001,
    filterBeta: 0.001,
    warmupTolerance: 5,
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

function updateMultitrackButtonLabel() {
  if (![1, 2, 3, 4].includes(currentMaxTrack)) {
    currentMaxTrack = 1;
  }

  multitrackButton.textContent = `MT ${currentMaxTrack}`;
}

updateMultitrackButtonLabel();

function confirmMaxTrackIncrease() {
  if (currentMaxTrack === 1 || currentMaxTrack === 4) return true;

  const message = `Further increasing max tracked markers may reduce performance on some devices. Continue?`;
  return window.confirm(message);
}

multitrackButton.addEventListener("click", async () => {
  if(confirmMaxTrackIncrease()) {
    if (currentMaxTrack === 1) {
      currentMaxTrack = 2;
    } else if (currentMaxTrack === 2) {
      currentMaxTrack = 3;
    } else if (currentMaxTrack === 3) {
      currentMaxTrack = 4;
    } else {
      currentMaxTrack = 1;
    }
  }

  localStorage.setItem(MULTITRACK_STORAGE_KEY, String(currentMaxTrack));
  updateMultitrackButtonLabel();

  const wasRunning = isRunning;

  if (wasRunning) {
    await stopAR();
  }

  hasSetup = false;
  mindarThree = null;

  if (wasRunning) {
    await startAR();
  }
});

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
    setStatus(`AR running. ${markerCount} markers configured, max ${currentMaxTrack} tracked at once.`);
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
