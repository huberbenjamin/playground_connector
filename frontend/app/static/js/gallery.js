function renderGallery() {
  const grid = document.getElementById("gallery-grid");
  if (!grid) return;

  grid.innerHTML = "";

  if (!galleryObjects.length) {
    grid.innerHTML = `
      <div class="gallery-empty-card">
        <div class="gallery-empty-icon">◼</div>
        <h2>No objects yet</h2>
        <p>Upload a new object or buy one from the store to start building your gallery.</p>
      </div>
    `;
    return;
  }

  galleryObjects.forEach((obj) => {
    const id = obj.objectId;
    const name = obj.title || obj.name || "Object";
    const createdAt = obj.createdAt ? formatDate(obj.createdAt) : "";
    const description = obj.description || "";
    const type = obj.type || "";

    if (!id) {
      console.warn("Skipping gallery object without backend objectId:", obj);
      return;
    }

    grid.innerHTML += `
      <button class="gallery-object-card" type="button" onclick="openGalleryActionModal('${escapeHtmlAttribute(id)}')">
        <div class="gallery-card-thumb-wrap">
          ${getObjectThumbnailMarkup(obj)}
        </div>
        <div class="gallery-card-body">
          ${type ? `<span class="gallery-card-type ${type === "EXCLUSIVE" ? "type-exclusive" : type === "ADMIN" ? "type-admin" : "type-public"}">${escapeHtml(type)}</span>` : ""}
          <div class="object-name">${escapeHtml(name)}</div>
          ${description ? `<div class="gallery-card-description">${escapeHtml(description)}</div>` : ""}
          <div class="object-date">${escapeHtml(createdAt)}</div>
        </div>
      </button>
    `;
  });

  hydrateBackendImages(grid);
}

function getSelectedGalleryTitle() {
  return selectedGalleryObject?.title || selectedGalleryObject?.name || "Object";
}

function getSelectedGalleryDescription() {
  return selectedGalleryObject?.description || "No description has been added for this object yet.";
}

function renderSelectedGallerySheet() {
  const title = getSelectedGalleryTitle();
  const description = getSelectedGalleryDescription();
  const type = selectedGalleryObject?.type || "";
  const createdAt = selectedGalleryObject?.createdAt ? formatDate(selectedGalleryObject.createdAt) : "";

  document.getElementById("gallery-action-title").innerText = title;
  document.getElementById("gallery-sheet-description").innerText = description;
  document.getElementById("gallery-sheet-meta").innerText = [type, createdAt].filter(Boolean).join(" · ");

  const thumbWrap = document.getElementById("gallery-sheet-thumbnail-wrap");
  thumbWrap.innerHTML = getObjectThumbnailMarkup(selectedGalleryObject);
  hydrateBackendImages(thumbWrap);
}

function openGalleryActionModal(objectId) {
  selectedGalleryObject = galleryObjects.find((object) => object.objectId === objectId) || null;
  if (!selectedGalleryObject) return;

  renderSelectedGallerySheet();
  document.getElementById("gallery-action-main").classList.remove("hidden");
  document.getElementById("gallery-gift-form").classList.add("hidden");
  document.getElementById("recipient-user-id-input").value = "";
  setGiftStatus("");
  document.getElementById("gallery-action-modal").classList.remove("hidden");
}

function closeGalleryActionModal() {
  document.getElementById("gallery-action-modal").classList.add("hidden");
  selectedGalleryObject = null;
  setGiftStatus("");
}

function showGiftForm() {
  document.getElementById("gallery-action-main").classList.add("hidden");
  document.getElementById("gallery-gift-form").classList.remove("hidden");
  document.getElementById("recipient-user-id-input").focus();
}

function setGiftStatus(message, isError = false) {
  const status = document.getElementById("gift-status");
  status.innerText = message || "";
  status.classList.toggle("error", Boolean(isError));
}

function previewSelectedGalleryObject() {
  if (!selectedGalleryObject?.objectId) return;
  openViewer(selectedGalleryObject.objectId);
}

function openSelectedGalleryObjectInAr() {
  // Kept as a compatibility alias for the old button name.
  previewSelectedGalleryObject();
}

function openSelectedGalleryObjectInPlayground() {
  const config = window.CONNECTAR_CONFIG || {};
  window.location.href = config.playgroundPageUrl || "/ar/demo-playground";
}

async function sendSelectedGalleryObject(event) {
  event.preventDefault();

  if (!getToken() || getRole() !== "user") {
    closeGalleryActionModal();
    showPublicLogin();
    return;
  }

  if (!selectedGalleryObject?.objectId) {
    setGiftStatus("This object is missing a backend object ID.", true);
    return;
  }

  const recipientUserId = document.getElementById("recipient-user-id-input").value.trim();
  if (!/^\d{6}$/.test(recipientUserId)) {
    setGiftStatus("Please enter a valid 6-digit user ID.", true);
    return;
  }

  const sendButton = document.getElementById("gift-send-button");
  sendButton.disabled = true;
  sendButton.innerText = "Sending...";
  setGiftStatus("");

  try {
    const giftUrl = `${API_BASE_URL}/objects/${selectedGalleryObject.objectId}/gift`;
    const response = await fetch(giftUrl, {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true"
      },
      body: JSON.stringify({ recipientUserId })
    });

    const responseText = await response.text();
    const body = parseJsonResponse(responseText, {});

    if (response.status === 401 || response.status === 403) {
      closeGalleryActionModal();
      showPublicLogin();
      return;
    }

    if (!response.ok) {
      const message = body.message || body.error || responseText || `Gift failed with status ${response.status}.`;
      throw new Error(Array.isArray(message) ? message.join(" ") : String(message));
    }

    setGiftStatus(`Object sent to user ${recipientUserId}.`);
    await loadGalleryObjects();
    setTimeout(closeGalleryActionModal, 700);
  } catch (error) {
    console.error("Object gift failed:", error);
    setGiftStatus(error.message || "Could not send object.", true);
  } finally {
    sendButton.disabled = false;
    sendButton.innerText = "Send";
  }
}

function openViewer(id) {
  window.location.href = `/ar/viewer?object=${encodeURIComponent(id)}`;
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !document.getElementById("gallery-action-modal")?.classList.contains("hidden")) {
    closeGalleryActionModal();
  }
});
