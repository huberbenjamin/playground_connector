import * as THREE from "three";
import { MindARThree } from "mindar-image-three";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";

const config = window.DEMO_AR_CONFIG;

const arContainer = document.querySelector("#ar-container");
const startButton = document.querySelector("#start-ar");
const stopButton = document.querySelector("#stop-ar");
const statusText = document.querySelector("#ar-status");

let mindarThree = null;
let renderer = null;
let scene = null;
let camera = null;
let hasSetup = false;
let isRunning = false;

console.log("demo_playground.js loaded");

function setStatus(message) {
  statusText.textContent = message;
}

function createSogObject(url, options = {}) {
  const splat = new SplatMesh({
    url,
    lod: false
  });

  const scale = options.scale ?? 5.0;
  splat.scale.setScalar(scale);

  splat.position.set(
    options.x ?? 0,
    options.y ?? 0,
    options.z ?? 0
  );

  // Common Spark orientation fix.
  // Adjust/remove if your SOG appears rotated incorrectly.
  splat.quaternion.set(1, 0, 0, 0);

  return splat;
}

async function setupMindAR() {
  console.log("setupMindAR called");
  if (hasSetup) return;

  mindarThree = new MindARThree({
    container: arContainer,
    imageTargetSrc: config.mindFileUrl,
    maxTrack: config.maxTrack
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

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1));

  const anchor0 = mindarThree.addAnchor(0);
  const anchor1 = mindarThree.addAnchor(1);

  const objectA = createSogObject(config.objectAUrl, {
    scale: 5.0,
    x: 1.0,
    y: 2.0,
    z: 3.0
  });

  const objectB = createSogObject(config.objectBUrl, {
    scale: 5.0,
    x: 0,
    y: 0,
    z: 0
  });

  anchor0.group.add(objectA);
  anchor1.group.add(objectB);

  anchor0.onTargetFound = () => setStatus("Marker 0 found");
  anchor0.onTargetLost = () => setStatus("Marker 0 lost");

  anchor1.onTargetFound = () => setStatus("Marker 1 found");
  anchor1.onTargetLost = () => setStatus("Marker 1 lost");

  await Promise.all([objectA.initialized, objectB.initialized]);

  hasSetup = true;
}

async function startAR() {
  console.log("startAR called");
  if (isRunning) return;

  try {
    setStatus("Loading AR scene...");
    startButton.disabled = true;

    await setupMindAR();
    await mindarThree.start();

    console.log("videos:", document.querySelectorAll("#ar-container video"));
    console.log("canvases:", document.querySelectorAll("#ar-container canvas"));

    document.querySelectorAll("#ar-container video").forEach((video, index) => {
      console.log(`video ${index}`, {
        width: video.videoWidth,
        height: video.videoHeight,
        readyState: video.readyState,
        paused: video.paused,
        style: video.getAttribute("style")
      });
    });

    renderer.setAnimationLoop(() => {
      renderer.setClearColor(0x000000, 0);
      renderer.setClearAlpha(0);
      renderer.render(scene, camera);
    });

    isRunning = true;
    stopButton.disabled = false;
    setStatus("AR running. Show one or both markers to the camera.");
  } catch (error) {
    console.error(error);
    startButton.disabled = false;
    stopButton.disabled = true;
    setStatus(`AR failed to start: ${error.message}`);
  }
}

function stopAR() {
  if (!mindarThree || !isRunning) return;

  mindarThree.stop();
  renderer.setAnimationLoop(null);

  isRunning = false;
  startButton.disabled = false;
  stopButton.disabled = true;
  setStatus("AR stopped.");
}

startButton.addEventListener("click", startAR);
stopButton.addEventListener("click", stopAR);

window.addEventListener("beforeunload", () => {
  if (mindarThree && isRunning) {
    mindarThree.stop();
  }
});
