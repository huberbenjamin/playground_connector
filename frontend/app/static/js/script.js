let galleryObjects = [];
    let storeObjects = [];
    let selectedStoreObject = null;

    async function loadObjects() {
      const galleryRes = await fetch("/api/gallery-objects");
      galleryObjects = await galleryRes.json();
      const storeRes = await fetch("/api/store-objects");
      storeObjects = await storeRes.json();
      renderGallery();
      renderStore();
    }

    function renderGallery() {
      const grid = document.getElementById("gallery-grid");
      grid.innerHTML = "";
      galleryObjects.forEach(obj => {
        grid.innerHTML += `
          <div class="object-card" onclick="openViewer('${obj.id}')">
            <div class="object-thumb">◼</div>
            <div class="object-name">${obj.name}</div>
            <div class="object-date">${obj.createdAt}</div>
          </div>
        `;
      });
    }

    function renderStore() {
      const grid = document.getElementById("store-grid");
      grid.innerHTML = "";
      storeObjects.forEach(obj => {
        grid.innerHTML += `
          <div class="object-card" onclick="selectStoreObject('${obj.id}')">
            <div class="object-thumb">◼</div>
            <div class="object-name">${obj.name}</div>
            <div class="object-date">${obj.createdAt}</div>
          </div>
        `;
      });

    }

    function selectStoreObject(id) {
      selectedStoreObject = storeObjects.find(o => o.id === id);
      document.getElementById("selected-store-name").innerText = selectedStoreObject.name + " selected";
      document.getElementById("store-panel").style.display = "block";
    }

    function addSelectedToGallery() {

      if (!selectedStoreObject) return;

      const exists = galleryObjects.some(o => o.id === selectedStoreObject.id);

      if (!exists) {
        galleryObjects.push(selectedStoreObject);
      }

      selectedStoreObject = null;
      document.getElementById("store-panel").style.display = "none";
      renderGallery();
      showScreen("gallery");
    }

    function openViewer(id) {
      window.location.href = `/ar/viewer?object=${id}`; //each object opens viewer with own object id
    }

    function showProcessing() {
      showScreen("processing");
      setTimeout(() => {
        alert("Success! Object created.");
        showScreen("gallery");
      }, 1200);
    }
    function showScreen(id) {
      document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
      document.getElementById(id).classList.add("active");
      document.querySelectorAll(".nav-item").forEach(btn => btn.classList.remove("active"));
    }
    loadObjects();
