import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";
import { SplatMesh } from "@sparkjsdev/spark";

const config = window.VIEWER_CONFIG || {};
const AUTH_TOKEN_KEY = "accessToken";
const API_BASE_URL = config.apiBaseUrl || "";
let splats = config.splats || [];

let currentIndex = 0;
let currentSplat = null;

const statusEl = document.getElementById("viewer-status");

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message || "";
  statusEl.classList.toggle("is-error", Boolean(isError));
  statusEl.classList.toggle("is-hidden", !message);
}

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
  alpha: true,
  powerPreference: "high-performance"
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.domElement.style.touchAction = "none";
document.body.appendChild(renderer.domElement);

renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local-floor");

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.5, -1);
controls.enableDamping = true;
controls.update();

function getObjectIdFromQuery() {
  return new URLSearchParams(window.location.search).get("object");
}

function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function normalizeBackendAssetUrl(url) {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("blob:") || url.startsWith("/static/")) {
    return url;
  }

  const normalizedPath = url.replace(/^\/+/, "");
  return API_BASE_URL
    ? `${API_BASE_URL.replace(/\/+$/, "")}/${normalizedPath}`
    : `/${normalizedPath}`;
}

function toSogLoadUrl(url) {
  const normalizedUrl = normalizeBackendAssetUrl(url);
  if (!normalizedUrl) return "";

  try {
    const parsed = new URL(normalizedUrl, window.location.origin);
    const apiBase = API_BASE_URL ? new URL(API_BASE_URL, window.location.origin) : null;
    const isApiAsset = !apiBase || parsed.origin === apiBase.origin;

    if (isApiAsset && parsed.pathname.startsWith("/files/sog/")) {
      const relativeFilename = parsed.pathname.replace("/files/sog/", "");
      const encodedFilename = relativeFilename
        .split("/")
        .map((part) => encodeURIComponent(decodeURIComponent(part)))
        .join("/");

      return `/ar/sog/${encodedFilename}`;
    }
  } catch (error) {
    console.warn("Could not parse SOG URL:", normalizedUrl, error);
  }

  return normalizedUrl;
}

async function fetchSelectedObjectSplatUrl() {
  const objectId = getObjectIdFromQuery();
  if (!objectId || !API_BASE_URL) return "";

  const token = getToken();
  if (!token) {
    window.location.href = `${config.mainPageUrl || "/ar"}?screen=gallery`;
    return "";
  }

  const response = await fetch(`${API_BASE_URL}/objects/${encodeURIComponent(objectId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "ngrok-skip-browser-warning": "true"
    }
  });

  const responseText = await response.text();

  if (response.status === 401 || response.status === 403) {
    window.location.href = `${config.mainPageUrl || "/ar"}?screen=gallery`;
    return "";
  }

  if (!response.ok) {
    throw new Error(responseText || `Object request failed with status ${response.status}.`);
  }

  const object = responseText ? JSON.parse(responseText) : {};
  document.title = `${object.title || object.name || "Object"} · ConnectAR Preview`;
  return toSogLoadUrl(object.sogUrl);
}

function loadSplat(url) {
  if (!url) {
    throw new Error("No SOG URL was available for this object.");
  }

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

function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", handleResize);

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
  scene.add(controller);

  const grip = renderer.xr.getControllerGrip(i);
  grip.add(controllerModelFactory.createControllerModel(grip));
  scene.add(grip);
}

document.body.appendChild(VRButton.createButton(renderer));

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

async function initializeViewer() {
  setStatus("Loading preview…");

  try {
    const selectedSplatUrl = await fetchSelectedObjectSplatUrl();

    if (selectedSplatUrl) {
      splats = [selectedSplatUrl];
      currentIndex = 0;
    }

    if (splats.length === 0) {
      throw new Error("No splat files were configured.");
    }

    loadSplat(splats[currentIndex]);
    setStatus("");
  } catch (error) {
    console.error("Could not initialize viewer:", error);
    setStatus(error.message || "Could not load preview.", true);
  }
}

initializeViewer();
