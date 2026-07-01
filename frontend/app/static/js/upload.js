(() => {
  const config = window.UPLOAD_CONFIG || {};
  const API_BASE_URL = String(config.apiBaseUrl || "").replace(/\/$/, "");
  const MAIN_PAGE_URL = config.mainPageUrl || "/ar";

  const AUTH_TOKEN_KEY = "accessToken";
  const AUTH_ROLE_KEY = "role";
  const AUTH_COINS_KEY = "coins";

  const LISTING_COSTS = {
    PUBLIC: 2,
    EXCLUSIVE: 5
  };

  const GENERATOR_RULES = {
    FREE_SPLATTER: {
      label: "FreeSplatter",
      min: 4,
      max: 6,
      help: "FreeSplatter needs 4–6 pictures."
    },
    ML_SHARP: {
      label: "ML-Sharp",
      min: 1,
      max: 1,
      help: "ML-Sharp needs exactly 1 picture."
    }
  };

  let selectedImages = [];
  let sourceMode = null;
  let cameraStream = null;
  let captureInProgress = false;
  let uploadInProgress = false;
  let cachedCoins = null;

  const els = {};

  window.navigateMain = function navigateMain(screen = "gallery") {
    const url = new URL(MAIN_PAGE_URL, window.location.origin);
    url.searchParams.set("screen", screen);
    window.location.href = url.toString();
  };

  function getToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  }

  function getRole() {
    return localStorage.getItem(AUTH_ROLE_KEY);
  }

  function getAuthHeaders() {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function getListingType() {
    return els.form.querySelector('input[name="listingType"]:checked')?.value || "PUBLIC";
  }

  function getSelectedGenerator() {
    return els.generatorSelect.value || "FREE_SPLATTER";
  }

  function getCurrentRules() {
    return GENERATOR_RULES[getSelectedGenerator()] || GENERATOR_RULES.FREE_SPLATTER;
  }

  function getSelectedCost() {
    return LISTING_COSTS[getListingType()] ?? LISTING_COSTS.PUBLIC;
  }

  function setStatus(message = "", type = "") {
    els.status.textContent = message;
    els.status.classList.toggle("error", type === "error");
    els.status.classList.toggle("success", type === "success");
  }

  function updateCoinChip() {
    const cost = getSelectedCost();
    const coinText = cachedCoins === null ? "Coins unavailable" : `${cachedCoins} coins available`;
    els.coinChip.textContent = `${coinText} · Cost ${cost}`;
  }

  async function refreshCoins() {
    const token = getToken();
    const storedCoins = localStorage.getItem(AUTH_COINS_KEY);
    cachedCoins = storedCoins === null ? null : Number(storedCoins);
    updateCoinChip();

    if (!token || getRole() !== "user" || !API_BASE_URL) {
      return null;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/coins`, {
        headers: {
          ...getAuthHeaders(),
          "ngrok-skip-browser-warning": "true"
        }
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || `Coins request failed with status ${response.status}.`);
      }

      const data = text ? JSON.parse(text) : {};
      if (data.coins !== undefined) {
        cachedCoins = Number(data.coins);
        localStorage.setItem(AUTH_COINS_KEY, String(data.coins));
        updateCoinChip();
      }

      return data;
    } catch (error) {
      console.warn("Could not refresh coins on upload page:", error);
      updateCoinChip();
      return null;
    }
  }

  function revokeSelectedImageUrls() {
    selectedImages.forEach((item) => {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });
  }

  function clearSelectedImages() {
    revokeSelectedImageUrls();
    selectedImages = [];
    if (els.fileInput) {
      els.fileInput.value = "";
    }
    updateImageUI();
  }

  function setSourceMode(mode, options = {}) {
    const { clearImages = true } = options;
    if (sourceMode === mode) return;

    sourceMode = mode;
    if (clearImages) {
      clearSelectedImages();
    }

    els.filePanel.classList.toggle("hidden", mode !== "upload");
    els.cameraPanel.classList.toggle("hidden", mode !== "camera");
    els.chooseUploadMode.classList.toggle("active", mode === "upload");
    els.chooseCameraMode.classList.toggle("active", mode === "camera");

    if (mode !== "camera") {
      stopCamera();
    }
  }

  function updateListingTypeUI() {
    const listingType = getListingType();
    els.publicCard.classList.toggle("active", listingType === "PUBLIC");
    els.exclusiveCard.classList.toggle("active", listingType === "EXCLUSIVE");

    const cost = getSelectedCost();
    els.costPill.textContent = `${cost} coins`;
    els.submitButton.textContent = `Generate object · ${cost} coins`;
    updateCoinChip();
    updateImageUI();
  }

  function updateGeneratorUI() {
    const rules = getCurrentRules();
    els.generatorHint.textContent = rules.help;
    updateImageUI();
  }

  function buildCountMessage() {
    const rules = getCurrentRules();
    const count = selectedImages.length;

    if (rules.min === rules.max) {
      return `${count} / ${rules.max} image selected`;
    }

    return `${count} / ${rules.max} images selected (min: ${rules.min})`;
  }

  function getImageCountError() {
    const rules = getCurrentRules();
    const count = selectedImages.length;

    if (count === 0) {
      return "Choose or capture pictures first.";
    }

    if (rules.min === rules.max && count !== rules.min) {
      return `${rules.label} needs exactly ${rules.min} picture.`;
    }

    if (count < rules.min || count > rules.max) {
      return `${rules.label} needs ${rules.min}–${rules.max} pictures.`;
    }

    return "";
  }

  function updateImageUI() {
    const rules = getCurrentRules();
    const countError = getImageCountError();

    els.imageCountText.textContent = buildCountMessage();
    els.clearImagesButton.disabled = selectedImages.length === 0;
    els.captureButton.disabled =
      captureInProgress || uploadInProgress || sourceMode !== "camera" || selectedImages.length >= rules.max;

    els.previewGrid.innerHTML = "";
    selectedImages.forEach((item, index) => {
      const card = document.createElement("div");
      card.className = "image-preview";
      card.innerHTML = `
        <img src="${item.previewUrl}" alt="Selected image ${index + 1}">
        <span>${index + 1}</span>
      `;
      els.previewGrid.appendChild(card);
    });

    const hasBasicFields = Boolean(els.titleInput.value.trim()) && Boolean(els.descriptionInput.value.trim());
    const cost = getSelectedCost();
    const hasEnoughCoins = cachedCoins === null || cachedCoins >= cost;
    els.submitButton.disabled = uploadInProgress || !hasBasicFields || Boolean(countError) || !hasEnoughCoins;

    if (uploadInProgress) return;

    if (!hasEnoughCoins) {
      setStatus(`Not enough coins. This listing costs ${cost} coins.`, "error");
    } else if (selectedImages.length > 0 && countError) {
      setStatus(countError, "error");
    } else if (selectedImages.length > 0) {
      setStatus("Ready to generate.");
    } else {
      setStatus("");
    }
  }

  function getJpegFileName(file, index) {
    const fallbackName = `image-${index + 1}`;
    const originalName = file?.name || fallbackName;
    const baseName = originalName.replace(/\.[^/.]+$/, "") || fallbackName;
    return `${baseName}.jpg`;
  }

  function canAttemptImageConversion(file) {
    return Boolean(file?.type?.startsWith("image/")) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file?.name || "");
  }

  function loadImageElement(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();

      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(`Could not read ${file.name || "this image"}. Try a JPG, PNG, or WebP file.`));
      };

      image.src = objectUrl;
    });
  }

  async function convertImageFileToJpeg(file, index) {
    const outputName = getJpegFileName(file, index);

    if (file.type === "image/jpeg") {
      return new File([file], outputName, {
        type: "image/jpeg",
        lastModified: file.lastModified || Date.now()
      });
    }

    const image = await loadImageElement(file);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;

    if (!width || !height) {
      throw new Error(`Could not read ${file.name || "this image"}.`);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, width, height);

    const jpegBlob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.9);
    });

    if (!jpegBlob) {
      throw new Error(`Could not convert ${file.name || "this image"} to JPG.`);
    }

    return new File([jpegBlob], outputName, {
      type: "image/jpeg",
      lastModified: Date.now()
    });
  }

  async function handleFileSelect(event) {
    const rules = getCurrentRules();
    if (sourceMode !== "upload") {
      setSourceMode("upload", { clearImages: false });
    }

    const files = Array.from(event.target.files || [])
      .filter(canAttemptImageConversion);

    if (files.length === 0) {
      clearSelectedImages();
      setStatus("Choose image files first.", "error");
      return;
    }

    if (files.length > rules.max) {
      event.target.value = "";
      clearSelectedImages();
      setStatus(`${rules.label} accepts at most ${rules.max} image${rules.max === 1 ? "" : "s"}.`, "error");
      return;
    }

    setStatus("Preparing selected images as JPG...");

    try {
      const jpegFiles = [];
      for (const [index, file] of files.entries()) {
        jpegFiles.push(await convertImageFileToJpeg(file, index));
      }

      revokeSelectedImageUrls();
      selectedImages = jpegFiles.map((file) => ({
        file,
        source: "upload",
        previewUrl: URL.createObjectURL(file)
      }));

      console.log("Prepared JPG upload files:", selectedImages.map((item) => ({
        name: item.file.name,
        type: item.file.type,
        size: item.file.size
      })));

      updateImageUI();
    } catch (error) {
      console.error("Could not prepare uploaded images:", error);
      event.target.value = "";
      clearSelectedImages();
      setStatus(error.message || "Could not prepare selected images as JPG.", "error");
    }
  }

  async function startCamera() {
    if (cameraStream) return;

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false
      });
      els.video.srcObject = cameraStream;
    } catch (error) {
      console.error("Camera access failed:", error);
      setStatus("Could not access camera. Please allow camera permission.", "error");
    }
  }

  function stopCamera() {
    if (!cameraStream) return;
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    if (els.video) {
      els.video.srcObject = null;
    }
  }

  function captureImage() {
    const rules = getCurrentRules();

    if (sourceMode !== "camera") {
      setSourceMode("camera");
    }

    if (!cameraStream) {
      setStatus("Start the camera first.", "error");
      return;
    }

    if (selectedImages.length >= rules.max) {
      setStatus(`You already captured the maximum for ${rules.label}.`, "error");
      updateImageUI();
      return;
    }

    if (captureInProgress) return;

    const width = els.video.videoWidth || 1280;
    const height = els.video.videoHeight || 720;
    els.canvas.width = width;
    els.canvas.height = height;

    const ctx = els.canvas.getContext("2d");
    ctx.drawImage(els.video, 0, 0, width, height);

    captureInProgress = true;
    updateImageUI();

    els.canvas.toBlob((blob) => {
      captureInProgress = false;

      if (!blob) {
        setStatus("Could not capture image.", "error");
        updateImageUI();
        return;
      }

      const index = selectedImages.length + 1;
      const file = new File([blob], `capture-${index}.jpg`, { type: "image/jpeg" });
      selectedImages.push({
        file,
        source: "camera",
        previewUrl: URL.createObjectURL(blob)
      });

      updateImageUI();
    }, "image/jpeg", 0.9);
  }

  function validateBeforeUpload() {
    if (!getToken() || getRole() !== "user") {
      return "Log in before uploading an object.";
    }

    if (!els.titleInput.value.trim()) {
      return "Enter a title.";
    }

    if (!els.descriptionInput.value.trim()) {
      return "Enter a description.";
    }

    const imageError = getImageCountError();
    if (imageError) {
      return imageError;
    }

    const cost = getSelectedCost();
    if (cachedCoins !== null && cachedCoins < cost) {
      return `Not enough coins. This listing costs ${cost} coins.`;
    }

    return "";
  }

  async function uploadGeneratedObject() {
    const formData = new FormData();
    const listingType = getListingType();
    const generator = getSelectedGenerator();

    formData.append("title", els.titleInput.value.trim());
    formData.append("description", els.descriptionInput.value.trim());
    formData.append("listingType", listingType);

    selectedImages.forEach((item, index) => {
      formData.append("images", item.file, item.file.name || `image-${index + 1}.jpg`);
    });

    console.log("Object generate URL:", `${API_BASE_URL}/objects/generate`);
    console.log("Object generate metadata:", {
      title: els.titleInput.value.trim(),
      description: els.descriptionInput.value.trim(),
      listingType,
      generator,
      imageCount: selectedImages.length
    });

    const response = await fetch(`${API_BASE_URL}/objects/generate`, {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        "ngrok-skip-browser-warning": "true"
      },
      body: formData
    });

    const responseText = await response.text();
    console.log("Object generate response status:", response.status);
    console.log("Object generate response body:", responseText);

    let data = {};
    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch (error) {
        console.warn("Object generate response was not JSON:", error);
      }
    }

    if (!response.ok) {
      const message = data.message || data.error || responseText || `Upload failed with status ${response.status}.`;
      throw new Error(Array.isArray(message) ? message.join(" ") : String(message));
    }

    return data;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const validationError = validateBeforeUpload();
    if (validationError) {
      setStatus(validationError, "error");
      if (validationError.toLowerCase().includes("log in")) {
        window.navigateMain("gallery");
      }
      return;
    }

    uploadInProgress = true;
    els.submitButton.disabled = true;
    els.submitButton.textContent = "Generating...";
    setStatus("Uploading images and generating your SOG object. This may take a moment.");
    stopCamera();

    try {
      await uploadGeneratedObject();
      await refreshCoins();
      setStatus("Object created. Returning to gallery...", "success");
      clearSelectedImages();
      window.setTimeout(() => window.navigateMain("gallery"), 900);
    } catch (error) {
      console.error("Object upload failed:", error);
      setStatus(error.message || "Upload failed. Please try again.", "error");
    } finally {
      uploadInProgress = false;
      updateListingTypeUI();
    }
  }

  function bindElements() {
    Object.assign(els, {
      form: document.getElementById("upload-form"),
      titleInput: document.getElementById("upload-title"),
      descriptionInput: document.getElementById("upload-description"),
      publicCard: document.getElementById("listing-public-card"),
      exclusiveCard: document.getElementById("listing-exclusive-card"),
      costPill: document.getElementById("selected-cost-pill"),
      coinChip: document.getElementById("upload-coin-chip"),
      generatorSelect: document.getElementById("generator-select"),
      generatorHint: document.getElementById("generator-hint"),
      chooseUploadMode: document.getElementById("choose-upload-mode"),
      chooseCameraMode: document.getElementById("choose-camera-mode"),
      filePanel: document.getElementById("file-upload-panel"),
      cameraPanel: document.getElementById("camera-panel"),
      fileInput: document.getElementById("image-file-input"),
      video: document.getElementById("camera-video"),
      canvas: document.getElementById("capture-canvas"),
      startCameraButton: document.getElementById("start-camera-button"),
      captureButton: document.getElementById("capture-button"),
      imageCountText: document.getElementById("image-count-text"),
      clearImagesButton: document.getElementById("clear-images-button"),
      previewGrid: document.getElementById("image-preview-grid"),
      status: document.getElementById("upload-status"),
      submitButton: document.getElementById("submit-upload-button")
    });
  }

  function attachEvents() {
    els.form.addEventListener("submit", handleSubmit);
    els.titleInput.addEventListener("input", updateImageUI);
    els.descriptionInput.addEventListener("input", updateImageUI);

    els.form.querySelectorAll('input[name="listingType"]').forEach((input) => {
      input.addEventListener("change", updateListingTypeUI);
    });

    els.generatorSelect.addEventListener("change", updateGeneratorUI);

    els.chooseUploadMode.addEventListener("click", () => setSourceMode("upload"));
    els.chooseCameraMode.addEventListener("click", () => {
      setSourceMode("camera");
      startCamera();
    });

    els.fileInput.addEventListener("change", handleFileSelect);
    els.startCameraButton.addEventListener("click", startCamera);
    els.captureButton.addEventListener("click", captureImage);
    els.clearImagesButton.addEventListener("click", clearSelectedImages);

    window.addEventListener("pagehide", () => {
      stopCamera();
      revokeSelectedImageUrls();
    });

    window.addEventListener("beforeunload", stopCamera);
  }

  function requireUserSession() {
    if (!getToken() || getRole() !== "user") {
      window.navigateMain("gallery");
      return false;
    }

    return true;
  }

  function initializeUploadPage() {
    bindElements();
    attachEvents();

    if (!requireUserSession()) {
      return;
    }

    updateListingTypeUI();
    updateGeneratorUI();
    updateImageUI();
    refreshCoins();
  }

  initializeUploadPage();
})();
