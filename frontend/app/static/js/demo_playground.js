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
const objectInfoBackdrop = document.querySelector("#object-info-backdrop");
const objectInfoSheet = document.querySelector("#object-info-sheet");
const objectInfoCloseButton = document.querySelector("#object-info-close");
const objectInfoThumbnail = document.querySelector("#object-info-thumbnail");
const objectInfoFallback = document.querySelector("#object-info-fallback");
const objectInfoTitle = document.querySelector("#object-info-title");
const objectInfoMarker = document.querySelector("#object-info-marker");
const objectInfoDescription = document.querySelector("#object-info-description");
const sogDownloadOverlay = document.querySelector("#sog-download-overlay");
const sogDownloadMessage = document.querySelector("#sog-download-message");
const sogDownloadProgressBar = document.querySelector("#sog-download-progress-bar");
const sogDownloadCount = document.querySelector("#sog-download-count");
const tabButtons = document.querySelectorAll(".tab-button");

const markerCount = config.markerCount ?? 6;
const legacyDemoObjects = Array.isArray(config.demoObjects) ? config.demoObjects : [];
const configuredGalleryObjects = Array.isArray(config.galleryObjects) ? config.galleryObjects : [];
const fallbackGalleryObjects = Array.isArray(config.fallbackGalleryObjects) ? config.fallbackGalleryObjects : [];

const API_BASE_URL = String(config.apiBaseUrl ?? "").replace(/\/$/, "");
const AUTH_TOKEN_KEY = config.authTokenKey ?? "accessToken";
const FETCH_BACKEND_GALLERY = config.fetchBackendGallery !== false;
const THUMBNAIL_CACHE_NAME = config.thumbnailCacheName || "connectar-thumbnail-cache-v1";
const SOG_PREFETCH_CONCURRENCY = Math.max(1, Math.min(3, Number(config.sogPrefetchConcurrency || 2)));

const multitrackButton = document.querySelector("#multitrack-button");
const MULTITRACK_STORAGE_KEY = "demo-playground-enable-multi-track";
let currentMaxTrack = Number(localStorage.getItem(MULTITRACK_STORAGE_KEY)) || 1;

// The picker starts with local/static objects as a fallback, then replaces them
// with owned backend objects after /me and /objects succeed.
let galleryObjects = configuredGalleryObjects.length > 0
  ? configuredGalleryObjects
  : (fallbackGalleryObjects.length > 0 ? fallbackGalleryObjects : legacyDemoObjects);

let currentUserProfile = null;
let galleryLoadState = "idle";
let galleryLoadError = "";
let sogPreloadPromise = null;
const sogBlobUrlByRemoteUrl = new Map();
const sogDownloadPromiseByRemoteUrl = new Map();
const thumbnailBlobUrlByRemoteUrl = new Map();
const thumbnailDownloadPromiseByRemoteUrl = new Map();

let mindarThree = null;
let renderer = null;
let scene = null;
let camera = null;
let hasSetup = false;
let isRunning = false;
let activeMarkerIndex = 0;
let selectedInfoMarkerIndex = null;
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

function getObjectDescription(object) {
  if (!object) return "";
  return object.description ??
    object.shortDescription ??
    "No description has been added for this object yet.";
}

function getAccessToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function getBackendHeaders() {
  const token = getAccessToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "ngrok-skip-browser-warning": "true"
  };
}

function buildApiUrl(path) {
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function normalizeBackendAssetUrl(value) {
  if (!value) return "";

  const url = String(value);
  if (/^(https?:|blob:|data:)/i.test(url)) {
    return url;
  }

  if (!API_BASE_URL) {
    return url;
  }

  return `${API_BASE_URL}/${url.replace(/^\/+/, "")}`;
}


function toArSogProxyUrl(value) {
  if (!value) return "";

  const url = String(value);
  if (/^(blob:|data:)/i.test(url)) {
    return url;
  }

  // Local/static demo SOG files should stay local.
  if (!url.includes("/files/sog/") && !url.startsWith("files/sog/")) {
    return url;
  }

  const filename = url.split("?")[0].split("/").pop();
  if (!filename) return "";

  // Spark needs a normal URL that ends in .sog. Flask will proxy this route
  // to the backend /files/sog/... URL and add the ngrok skip header server-side.
  return `/ar/sog/${encodeURIComponent(filename)}`;
}

function isApiAssetUrl(url) {
  if (!url || !API_BASE_URL) return false;
  return String(url).startsWith(API_BASE_URL);
}

function getRemoteThumbnailUrl(object) {
  if (!object) return "";
  return object.remoteThumbnailUrl || object.originalThumbnailUrl || object.thumbnailUrl || "";
}

function shouldFetchThumbnailThroughBackend(url) {
  return Boolean(url) &&
    /^(https?:)/i.test(url) &&
    !/^(blob:|data:)/i.test(url) &&
    isApiAssetUrl(url);
}

async function openNamedCache(cacheName) {
  if (!("caches" in window)) return null;

  try {
    return await caches.open(cacheName);
  } catch (error) {
    console.warn(`Cache Storage is unavailable for ${cacheName}; using memory-only blobs.`, error);
    return null;
  }
}

async function fetchImageWithNgrokHeader(url) {
  const response = await fetch(url, {
    headers: {
      "ngrok-skip-browser-warning": "true"
    }
  });

  if (!response.ok) {
    throw new Error(`Thumbnail request failed with status ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`Thumbnail request returned ${contentType || "an unknown content type"} instead of an image.`);
  }

  return response;
}

async function ensureObjectThumbnailCached(object) {
  const remoteUrl = getRemoteThumbnailUrl(object);
  if (!remoteUrl) return "";

  object.remoteThumbnailUrl = remoteUrl;

  if (!shouldFetchThumbnailThroughBackend(remoteUrl)) {
    return remoteUrl;
  }

  if (object.cachedThumbnailUrl) {
    return object.cachedThumbnailUrl;
  }

  const existingBlobUrl = thumbnailBlobUrlByRemoteUrl.get(remoteUrl);
  if (existingBlobUrl) {
    object.cachedThumbnailUrl = existingBlobUrl;
    return existingBlobUrl;
  }

  if (thumbnailDownloadPromiseByRemoteUrl.has(remoteUrl)) {
    const blobUrl = await thumbnailDownloadPromiseByRemoteUrl.get(remoteUrl);
    object.cachedThumbnailUrl = blobUrl;
    return blobUrl;
  }

  const downloadPromise = (async () => {
    const cache = await openNamedCache(THUMBNAIL_CACHE_NAME);
    let response = cache ? await cache.match(remoteUrl) : null;

    if (!response) {
      response = await fetchImageWithNgrokHeader(remoteUrl);
      if (cache) {
        try {
          await cache.put(remoteUrl, response.clone());
        } catch (error) {
          console.warn("Could not write thumbnail to Cache Storage", remoteUrl, error);
        }
      }
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    console.log("Blob object:", blob);
    console.log("Blob size:", blob.size);
    console.log("Blob type:", blob.type);
    console.log("Blob URL:", blobUrl);

    thumbnailBlobUrlByRemoteUrl.set(remoteUrl, blobUrl);
    return blobUrl;
  })();

  thumbnailDownloadPromiseByRemoteUrl.set(remoteUrl, downloadPromise);

  try {
    const blobUrl = await downloadPromise;
    object.cachedThumbnailUrl = blobUrl;
    return blobUrl;
  } finally {
    thumbnailDownloadPromiseByRemoteUrl.delete(remoteUrl);
  }
}

function loadObjectThumbnailIntoImage(image, object) {
  if (!image) return;

  const remoteUrl = getRemoteThumbnailUrl(object);
  image.alt = object?.name || "";
  image.dataset.thumbnailUrl = remoteUrl;

  if (!remoteUrl) {
    image.removeAttribute("src");
    image.style.display = "none";
    return;
  }

  image.style.display = "none";

  ensureObjectThumbnailCached(object)
    .then((thumbnailUrl) => {
      if (!thumbnailUrl || image.dataset.thumbnailUrl !== remoteUrl) return;
      image.src = thumbnailUrl;
      image.style.display = "block";
    })
    .catch((error) => {
      console.warn(`Could not load thumbnail for ${object?.name || "object"}`, error);
      if (image.dataset.thumbnailUrl === remoteUrl) {
        image.removeAttribute("src");
        image.style.display = "none";
      }
    });
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Expected JSON but received: ${text.slice(0, 120)}`);
  }
}

async function fetchBackendJson(path) {
  const response = await fetch(buildApiUrl(path), {
    headers: getBackendHeaders()
  });

  const data = await readJsonResponse(response);

  if (!response.ok) {
    const message = data?.message || data?.error || `Request failed with status ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    error.body = data;
    throw error;
  }

  return data;
}

function setSogDownloadOverlayVisible(visible) {
  if (!sogDownloadOverlay) return;
  sogDownloadOverlay.classList.toggle("is-open", visible);
  sogDownloadOverlay.setAttribute("aria-hidden", String(!visible));
}

function updateSogDownloadOverlay({ downloaded = 0, total = 0, failed = 0, message = "" } = {}) {
  const safeTotal = Math.max(total, 0);
  const safeDownloaded = Math.min(Math.max(downloaded, 0), safeTotal || downloaded);
  const percent = safeTotal > 0 ? Math.round((safeDownloaded / safeTotal) * 100) : 0;

  if (sogDownloadMessage) {
    sogDownloadMessage.textContent = message || "Downloading your gallery objects for AR...";
  }

  if (sogDownloadProgressBar) {
    sogDownloadProgressBar.style.width = `${percent}%`;
  }

  if (sogDownloadCount) {
    const failedText = failed > 0 ? ` · ${failed} failed` : "";
    sogDownloadCount.textContent = `${safeDownloaded} / ${safeTotal} ready${failedText}`;
  }
}

function getOriginalSogUrl(object) {
  if (!object) return "";
  return object.remoteUrl || object.originalUrl || object.originalSogUrl || object.url || "";
}

function getSogUrlForSpark(object) {
  if (!object) return "";
  return object.url || toArSogProxyUrl(getOriginalSogUrl(object));
}

function shouldPreloadSogUrl(url) {
  return Boolean(url) && !/^(blob:|data:)/i.test(url);
}

async function fetchSogForWarmup(url) {
  const headers = isApiAssetUrl(url)
    ? { "ngrok-skip-browser-warning": "true" }
    : {};

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`SOG request failed with status ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.toLowerCase().includes("text/html")) {
    throw new Error("SOG request returned HTML instead of a binary file. Check the proxy route or backend file route.");
  }

  const blob = await response.clone().blob();
  console.log("SOG warmup check:", {
    url,
    contentType,
    sizeBytes: blob.size,
    blobType: blob.type
  });

  return response;
}

async function ensureObjectSogCached(object) {
  const sogUrlForSpark = getSogUrlForSpark(object);
  if (!sogUrlForSpark) return "";

  // Important: do not replace this with a blob: URL. Spark detects file type
  // from the URL/name, so it needs a URL that still ends in .sog.
  object.url = sogUrlForSpark;
  object.cachedSogUrl = "";

  if (!shouldPreloadSogUrl(sogUrlForSpark)) {
    return sogUrlForSpark;
  }

  if (object.sogWarmupReady) {
    return sogUrlForSpark;
  }

  if (sogDownloadPromiseByRemoteUrl.has(sogUrlForSpark)) {
    await sogDownloadPromiseByRemoteUrl.get(sogUrlForSpark);
    object.sogWarmupReady = true;
    return sogUrlForSpark;
  }

  const warmupPromise = fetchSogForWarmup(sogUrlForSpark);
  sogDownloadPromiseByRemoteUrl.set(sogUrlForSpark, warmupPromise);

  try {
    await warmupPromise;
    object.sogWarmupReady = true;
    return sogUrlForSpark;
  } finally {
    sogDownloadPromiseByRemoteUrl.delete(sogUrlForSpark);
  }
}

async function preloadGallerySogFiles() {
  const objectsToDownload = galleryObjects.filter((object) => shouldPreloadSogUrl(getSogUrlForSpark(object)));
  const total = objectsToDownload.length;

  if (total === 0) {
    setSogDownloadOverlayVisible(false);
    startButton.disabled = false;
    return;
  }

  let completed = 0;
  let failed = 0;
  let nextIndex = 0;

  startButton.disabled = true;
  setSogDownloadOverlayVisible(true);
  updateSogDownloadOverlay({
    downloaded: completed,
    total,
    failed,
    message: "Downloading your gallery objects for AR loading..."
  });

  const worker = async () => {
    while (nextIndex < total) {
      const object = objectsToDownload[nextIndex];
      nextIndex += 1;

      updateSogDownloadOverlay({
        downloaded: completed,
        total,
        failed,
        message: `Preparing ${object.name || "object"}...`
      });

      try {
        await ensureObjectSogCached(object);
      } catch (error) {
        failed += 1;
        console.warn(`Could not cache SOG for ${object.name}`, error);
      } finally {
        completed += 1;
        updateSogDownloadOverlay({
          downloaded: completed,
          total,
          failed,
          message: failed > 0
            ? "Some objects could not be cached, but available objects can still be used."
            : "Downloading your gallery SOG files for offline AR loading..."
        });
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(SOG_PREFETCH_CONCURRENCY, total) }, () => worker())
  );

  startButton.disabled = false;

  if (failed > 0) {
    setStatus(`Prepared ${total - failed}/${total} SOG files. ${failed} failed.`);
    updateSogDownloadOverlay({
      downloaded: completed,
      total,
      failed,
      message: `Prepared ${total - failed}/${total} objects. You can still continue.`
    });
    window.setTimeout(() => setSogDownloadOverlayVisible(false), 1600);
  } else {
    setStatus(`Prepared ${total} SOG files for AR.`);
    updateSogDownloadOverlay({
      downloaded: completed,
      total,
      failed,
      message: "All gallery objects are ready."
    });
    window.setTimeout(() => setSogDownloadOverlayVisible(false), 700);
  }

  if (hasSetup) {
    await syncAllMarkerObjects();
  }
}

function normalizeBackendGalleryObject(object) {
  const id = object.objectId || object.id;
  if (!id) return null;

  const sogUrl = object.sogUrl || object.url;

  return {
    id,
    objectId: id,
    name: object.title || object.name || "Untitled object",
    description: object.description || "No description has been added for this object yet.",
    remoteUrl: normalizeBackendAssetUrl(sogUrl),
    originalUrl: normalizeBackendAssetUrl(sogUrl),
    url: toArSogProxyUrl(sogUrl),
    thumbnailUrl: normalizeBackendAssetUrl(object.thumbnailUrl || object.thumbnailPath),
    creatorUserId: object.creatorUserId || "",
    type: object.type || "",
    createdAt: object.createdAt || "",
    ownedSince: object.ownedSince || "",
    source: "backend"
  };
}

function normalizeAssignmentsLength(value) {
  const output = Array.from({ length: markerCount }, () => null);

  if (!Array.isArray(value)) return output;

  for (let i = 0; i < markerCount; i += 1) {
    output[i] = typeof value[i] === "string" ? value[i] : null;
  }

  return output;
}

async function loadBackendGalleryObjects() {
  if (!FETCH_BACKEND_GALLERY) return;

  startButton.disabled = true;

  const token = getAccessToken();
  if (!token) {
    galleryLoadState = "error";
    galleryLoadError = "No login token found. Go back and log in first.";
    startButton.disabled = false;
    renderPickerUi();
    setStatus(galleryLoadError);
    return;
  }

  if (!API_BASE_URL) {
    galleryLoadState = "error";
    galleryLoadError = "No API base URL configured for the playground.";
    startButton.disabled = false;
    renderPickerUi();
    setStatus(galleryLoadError);
    return;
  }

  galleryLoadState = "loading";
  galleryLoadError = "";
  renderPickerUi();
  setStatus("Loading your gallery from the backend...");

  try {
    currentUserProfile = await fetchBackendJson("/me");
    const objects = await fetchBackendJson("/objects");

    galleryObjects = Array.isArray(objects)
      ? objects.map(normalizeBackendGalleryObject).filter(Boolean)
      : [];

    assignments = sanitizeAssignments(assignments);
    saveAssignments();

    galleryLoadState = "loaded";
    galleryLoadError = "";

    renderPickerUi();

    const userLabel = currentUserProfile?.userId ? ` for user ${currentUserProfile.userId}` : "";
    setStatus(`Loaded ${galleryObjects.length} gallery objects${userLabel}. Preparing SOG files...`);

    sogPreloadPromise = preloadGallerySogFiles();
    await sogPreloadPromise;
  } catch (error) {
    console.error("Could not load backend gallery", error);
    galleryLoadState = "error";
    galleryLoadError = error.message || "Could not load your backend gallery.";
    startButton.disabled = false;
    renderPickerUi();
    setStatus(`Gallery load failed: ${galleryLoadError}`);
  }
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

    // Do not sanitize against known object IDs here. Backend objects load async,
    // so sanitizing too early would erase valid saved assignments before /objects returns.
    return normalizeAssignmentsLength(JSON.parse(saved));
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

function setObjectInfoThumbnail(object) {
  if (!objectInfoThumbnail || !objectInfoFallback) return;

  objectInfoFallback.textContent = object.name?.replace(/^Demo\s*/i, "") || "SOG";
  loadObjectThumbnailIntoImage(objectInfoThumbnail, object);
}

function openObjectInfoSheet(markerIndex) {
  const objectId = assignments[markerIndex];
  const object = findObjectById(objectId);

  if (!object || !objectInfoSheet || !objectInfoBackdrop) {
    return false;
  }

  selectedInfoMarkerIndex = markerIndex;
  setActiveMarker(markerIndex, { silent: true });

  objectInfoTitle.textContent = object.name;
  objectInfoMarker.textContent = `Marker ${markerIndex}`;
  objectInfoDescription.textContent = getObjectDescription(object);
  setObjectInfoThumbnail(object);

  objectInfoSheet.classList.add("is-open");
  objectInfoBackdrop.classList.add("is-open");
  objectInfoSheet.setAttribute("aria-hidden", "false");

  setStatus(`Selected ${object.name} on marker ${markerIndex}.`);
  return true;
}

function closeObjectInfoSheet() {
  selectedInfoMarkerIndex = null;

  objectInfoSheet?.classList.remove("is-open");
  objectInfoBackdrop?.classList.remove("is-open");
  objectInfoSheet?.setAttribute("aria-hidden", "true");

  setStatus("Object info dismissed.");
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
  image.alt = object.name;
  image.loading = "lazy";
  loadObjectThumbnailIntoImage(image, object);

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

    if (galleryLoadState === "loading") {
      empty.textContent = "Loading your gallery...";
    } else if (galleryLoadState === "error") {
      empty.textContent = galleryLoadError || "Could not load your gallery.";
    } else {
      empty.textContent = "Your gallery is empty. Upload or buy an object first, then reopen the playground.";
    }

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

  const initialSogUrl = getSogUrlForSpark(object);
  if (!initialSogUrl) {
    setStatus(`${object.name} does not have a SOG download URL.`);
    return;
  }

  const loadingToken = markerState.loadingToken + 1;
  markerState.loadingToken = loadingToken;
  markerState.objectId = objectId;

  setStatus(`Preparing ${object.name} for marker ${markerIndex}...`);

  try {
    await ensureObjectSogCached(object);
  } catch (error) {
    console.error(`Failed to prepare ${object.name}`, error);
    if (markerState.loadingToken === loadingToken) {
      setStatus(`Failed to prepare ${object.name}: ${error.message}`);
      markerState.objectId = null;
    }
    return;
  }

  const sogUrlForSpark = getSogUrlForSpark(object);

  console.log("SplatMesh URL check:", {
    name: object.name,
    originalUrl: object.originalUrl || object.remoteUrl || "",
    url: object.url,
    cachedSogUrl: object.cachedSogUrl,
    sogUrlForSpark,
    isBlob: sogUrlForSpark.startsWith("blob:"),
    endsWithSog: sogUrlForSpark.toLowerCase().split("?")[0].endsWith(".sog")
  });

  const splat = new SplatMesh({
    url: sogUrlForSpark,
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

  if (selectedInfoMarkerIndex === markerIndex) {
    closeObjectInfoSheet();
  }

  if (hasSetup) removeSplatFromMarker(markerIndex);

  renderPickerUi();
  setStatus(`Cleared marker ${markerIndex}.`);
}

function clearAllAssignments() {
  assignments = Array.from({ length: markerCount }, () => null);
  saveAssignments();
  closeObjectInfoSheet();

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
  return !isRunning || Boolean(event.target.closest(
    "#ar-control-panel, #object-drawer, #drawer-toggle, #object-info-sheet, #object-info-backdrop"
  ));
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
  if (openObjectInfoSheet(markerIndex)) {
    return true;
  }

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

    if (sogPreloadPromise) {
      setStatus("Waiting for gallery objects to finish downloading...");
      await sogPreloadPromise;
    }

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

objectInfoThumbnail?.addEventListener("error", () => {
  objectInfoThumbnail.style.display = "none";
});
objectInfoCloseButton?.addEventListener("click", closeObjectInfoSheet);
objectInfoBackdrop?.addEventListener("click", closeObjectInfoSheet);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && objectInfoSheet?.classList.contains("is-open")) {
    closeObjectInfoSheet();
  }
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

  sogBlobUrlByRemoteUrl.forEach((blobUrl) => URL.revokeObjectURL(blobUrl));
  resetGestureState();
});

renderPickerUi();
setDrawerExpanded(false);
loadBackendGalleryObjects();
