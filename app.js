const editCanvas = document.getElementById("editCanvas");
const ctx = editCanvas.getContext("2d");

const fileInput = document.getElementById("fileInput");
const lengthInput = document.getElementById("lengthInput");
const unitInput = document.getElementById("unitInput");

const setScaleBtn = document.getElementById("setScaleBtn");
const clearScaleBtn = document.getElementById("clearScaleBtn");
const closeRoomBtn = document.getElementById("closeRoomBtn");
const undoPointBtn = document.getElementById("undoPointBtn");
const deleteRoomBtn = document.getElementById("deleteRoomBtn");
const clearAllBtn = document.getElementById("clearAllBtn");
const generateBtn = document.getElementById("generateBtn");
const downloadBtn = document.getElementById("downloadBtn");

const statusImage = document.getElementById("statusImage");
const statusScale = document.getElementById("statusScale");
const statusRooms = document.getElementById("statusRooms");
const statusMode = document.getElementById("statusMode");

const placeholder = document.getElementById("placeholder");
const previewSection = document.getElementById("previewSection");
const previewImage = document.getElementById("previewImage");

const zoomOutBtn = document.getElementById("zoomOutBtn");
const zoomInBtn = document.getElementById("zoomInBtn");
const fitViewBtn = document.getElementById("fitViewBtn");
const panModeBtn = document.getElementById("panModeBtn");

const roomsPanel = document.getElementById("roomsPanel");

let img = null;
let fileName = "rzut";
let drawBox = null;

let scalePoints = [];
let pxPerMeter = null;

let currentRoom = [];
let rooms = [];

let resultDataUrl = null;
let manualCenterRoomIndex = null;
let cellEditMode = null;
let view = { zoom: 1, panX: 0, panY: 0 };
let isPanMode = false;
let isPanning = false;
let lastPanPoint = null;
let suppressNextClick = false;

const POINT_COLOR = "rgba(255, 0, 0, 0.95)";
const ROOM_COLOR = "rgba(80, 80, 80, 0.9)";
const SCALE_COLOR = "rgba(255, 0, 0, 0.95)";
const CENTER_COLOR = "rgba(30, 120, 75, 0.95)";

function setupCanvasSize() {
  const rect = editCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  editCanvas.width = Math.max(1, Math.round(rect.width * dpr));
  editCanvas.height = Math.max(1, Math.round(rect.height * dpr));

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

window.addEventListener("resize", setupCanvasSize);
setupCanvasSize();

zoomInBtn.addEventListener("click", (event) => {
  event.preventDefault();
  setZoom(view.zoom * 1.25);
});

zoomOutBtn.addEventListener("click", (event) => {
  event.preventDefault();
  setZoom(view.zoom / 1.25);
});

fitViewBtn.addEventListener("click", (event) => {
  event.preventDefault();
  resetView();
});

panModeBtn.addEventListener("click", (event) => {
  event.preventDefault();
  togglePanMode();
});

editCanvas.addEventListener("pointerdown", (event) => {
  if (!img || !isPanMode) return;

  event.preventDefault();
  isPanning = true;
  lastPanPoint = { x: event.clientX, y: event.clientY };
  suppressNextClick = true;

  editCanvas.classList.add("panning");
  editCanvas.setPointerCapture(event.pointerId);
});

editCanvas.addEventListener("pointermove", (event) => {
  if (!isPanning || !lastPanPoint) return;

  event.preventDefault();

  const dx = event.clientX - lastPanPoint.x;
  const dy = event.clientY - lastPanPoint.y;

  view.panX += dx;
  view.panY += dy;

  lastPanPoint = { x: event.clientX, y: event.clientY };
  draw();
});

editCanvas.addEventListener("pointerup", (event) => {
  if (!isPanning) return;

  event.preventDefault();
  isPanning = false;
  lastPanPoint = null;
  editCanvas.classList.remove("panning");

  try {
    editCanvas.releasePointerCapture(event.pointerId);
  } catch (error) {}
});

editCanvas.addEventListener("pointercancel", () => {
  isPanning = false;
  lastPanPoint = null;
  editCanvas.classList.remove("panning");
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;

  fileName = file.name.replace(/\.[^.]+$/, "");

  const dataUrl = await readFileAsDataUrl(file);
  const loaded = new Image();

  loaded.onload = () => {
    img = loaded;
    scalePoints = [];
    pxPerMeter = null;
    currentRoom = [];
    rooms = [];
    resultDataUrl = null;
    manualCenterRoomIndex = null;
    cellEditMode = null;
    resetView(false);

    placeholder.classList.add("hidden");
    placeholder.style.display = "none";
    previewSection.classList.add("hidden");
    downloadBtn.disabled = true;

    updateRoomsPanel();
    updateStatus("Kliknij dwa punkty do ustawienia skali.");
    draw();
  };

  loaded.src = dataUrl;
});

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

editCanvas.addEventListener("click", (event) => {
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }

  if (isPanMode) return;
  if (!img || !drawBox) return;

  const point = getImagePoint(event);
  if (!point) return;

  if (manualCenterRoomIndex !== null) {
    if (rooms[manualCenterRoomIndex]) {
      rooms[manualCenterRoomIndex].gridOriginMode = "manual";
      rooms[manualCenterRoomIndex].manualCenter = point;
      manualCenterRoomIndex = null;
      clearResult();
      updateRoomsPanel();
      updateStatus("Ręczny środek siatki zapisany.");
      draw();
    }
    return;
  }

  if (cellEditMode !== null) {
    handleCellEditClick(point);
    return;
  }

  if (pxPerMeter === null && scalePoints.length < 2) {
    scalePoints.push(point);

    if (scalePoints.length === 1) {
      updateStatus("Kliknij drugi koniec odcinka do skali.");
    } else {
      updateStatus("Wpisz długość odcinka i kliknij „Zapisz skalę”.");
    }

    draw();
    return;
  }

  if (pxPerMeter === null) {
    updateStatus("Najpierw zapisz skalę.");
    return;
  }

  currentRoom.push(point);
  clearResult();
  updateStatus("Klikaj kolejne narożniki obszaru.");
  draw();
});

setScaleBtn.addEventListener("click", () => {
  if (!img) {
    alert("Najpierw wgraj obraz.");
    return;
  }

  if (scalePoints.length !== 2) {
    alert("Kliknij na obrazie dwa końce znanego odcinka.");
    return;
  }

  const value = Number(lengthInput.value);
  if (!Number.isFinite(value) || value <= 0) {
    alert("Wpisz poprawną długość odcinka.");
    return;
  }

  const meters = unitInput.value === "cm" ? value / 100 : value;
  const pixelDistance = distance(scalePoints[0], scalePoints[1]);

  pxPerMeter = pixelDistance / meters;
  clearResult();
  updateRoomsPanel();
  updateStatus("Skala zapisana. Teraz zaznaczaj obszaru.");
  draw();
});

clearScaleBtn.addEventListener("click", () => {
  scalePoints = [];
  pxPerMeter = null;
  currentRoom = [];
  rooms = [];
  manualCenterRoomIndex = null;
  cellEditMode = null;
  clearResult();
  updateRoomsPanel();
  updateStatus(img ? "Kliknij dwa punkty do ustawienia skali." : "Wgraj zdjęcie.");
  draw();
});

closeRoomBtn.addEventListener("click", () => {
  if (!img) {
    alert("Najpierw wgraj obraz.");
    return;
  }

  if (pxPerMeter === null) {
    alert("Najpierw ustaw skalę.");
    return;
  }

  if (currentRoom.length < 3) {
    alert("Obszar musi mieć minimum 3 narożniki.");
    return;
  }

  rooms.push(createRoom(currentRoom, rooms.length));
  currentRoom = [];
  manualCenterRoomIndex = null;
  cellEditMode = null;

  clearResult();
  updateRoomsPanel();
  updateStatus("Obszar zapisany. Możesz zaznaczyć kolejny.");
  draw();
});

undoPointBtn.addEventListener("click", () => {
  if (currentRoom.length > 0) {
    currentRoom.pop();
  } else if (pxPerMeter === null && scalePoints.length > 0) {
    scalePoints.pop();
  }

  clearResult();
  draw();
  updateStatus();
});

deleteRoomBtn.addEventListener("click", () => {
  rooms.pop();
  manualCenterRoomIndex = null;
  cellEditMode = null;
  clearResult();
  updateRoomsPanel();
  draw();
  updateStatus("Usunięto ostatnie obszar.");
});

clearAllBtn.addEventListener("click", () => {
  if (!confirm("Wyczyścić skalę, obszary i podgląd?")) return;

  scalePoints = [];
  pxPerMeter = null;
  currentRoom = [];
  rooms = [];
  manualCenterRoomIndex = null;
  cellEditMode = null;

  clearResult();
  updateRoomsPanel();

  updateStatus(img ? "Kliknij dwa punkty do ustawienia skali." : "Wgraj zdjęcie.");
  draw();
});

generateBtn.addEventListener("click", () => {
  if (!img) {
    alert("Najpierw wgraj obraz.");
    return;
  }

  if (pxPerMeter === null) {
    alert("Najpierw ustaw skalę.");
    return;
  }

  if (rooms.length === 0) {
    alert("Najpierw zaznacz przynajmniej jedno obszar.");
    return;
  }

  for (const room of rooms) {
    if (!getRoomGridSettings(room)) {
      alert("Jedno z obszarów ma niepoprawne ustawienia siatki.");
      return;
    }
  }

  resultDataUrl = makeResultImage();
  previewImage.src = resultDataUrl;
  previewSection.classList.remove("hidden");
  downloadBtn.disabled = false;
  updateStatus("Podgląd gotowy. Możesz pobrać PNG.");
});

downloadBtn.addEventListener("click", () => {
  if (!resultDataUrl) return;

  const link = document.createElement("a");
  link.href = resultDataUrl;
  link.download = `${safeName(fileName)}_siatka.png`;
  link.click();
});

function createRoom(points, index) {
  return {
    points: points.map(p => ({ x: p.x, y: p.y })),
    gridOriginMode: "center",
    manualCenter: null,
    grid: {
      widthValue: 100,
      widthUnit: "cm",
      heightValue: 100,
      heightUnit: "cm",
      color: "#ff0000",
      lineWidth: 2,
      opacity: 0.55
    },
    labels: {
      enabled: false,
      prefix: "P",
      separator: "",
      start: 1,
      end: "",
      numberDigits: 1,
      suffixSeparator: " ",
      suffix: "",
      color: "#ff0000",
      opacity: 0.9,
      size: 22,
      bold: true,
      position: "center",
      direction: "left-right-down",
      snake: false,
      skipMode: "compact"
    },
    cellOverrides: {}
  };
}



function clearResult() {
  resultDataUrl = null;
  downloadBtn.disabled = true;
  previewSection.classList.add("hidden");
}

function draw() {
  const rect = editCanvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (!img) return;

  drawBox = getDrawBox(rect.width, rect.height, img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, drawBox.x, drawBox.y, drawBox.w, drawBox.h);

  drawGridAndLabelsPreview();
  drawSavedRooms();
  drawRoomCenters();
  drawCurrentRoom();
  drawScaleLine();
}

function getDrawBox(canvasW, canvasH, imageW, imageH) {
  const margin = 12;
  const fitScale = Math.min(
    (canvasW - margin * 2) / imageW,
    (canvasH - margin * 2) / imageH
  );

  const scale = fitScale * view.zoom;
  const w = imageW * scale;
  const h = imageH * scale;

  return {
    x: (canvasW - w) / 2 + view.panX,
    y: (canvasH - h) / 2 + view.panY,
    w,
    h,
    scale,
    fitScale
  };
}

function setZoom(newZoom) {
  if (!img) return;

  const rect = editCanvas.getBoundingClientRect();
  const centerCanvas = { x: rect.width / 2, y: rect.height / 2 };

  const beforeBox = getDrawBox(rect.width, rect.height, img.naturalWidth, img.naturalHeight);
  const imageCenterBefore = {
    x: (centerCanvas.x - beforeBox.x) / beforeBox.scale,
    y: (centerCanvas.y - beforeBox.y) / beforeBox.scale
  };

  view.zoom = Math.min(10, Math.max(0.25, newZoom));

  const afterBox = getDrawBox(rect.width, rect.height, img.naturalWidth, img.naturalHeight);

  view.panX += centerCanvas.x - (afterBox.x + imageCenterBefore.x * afterBox.scale);
  view.panY += centerCanvas.y - (afterBox.y + imageCenterBefore.y * afterBox.scale);

  draw();
}

function resetView(shouldDraw = true) {
  view.zoom = 1;
  view.panX = 0;
  view.panY = 0;

  if (shouldDraw) draw();
}

function togglePanMode() {
  isPanMode = !isPanMode;

  if (isPanMode) {
    manualCenterRoomIndex = null;
    cellEditMode = null;
  }

  updatePanModeButton();
  updateRoomsPanel();
  updateStatus(isPanMode ? "Tryb przesuwania widoku włączony." : "Tryb przesuwania widoku wyłączony.");
  draw();
}

function updatePanModeButton() {
  panModeBtn.textContent = isPanMode ? "Przesuń widok: włączone" : "Przesuń widok: wyłączone";
  panModeBtn.classList.toggle("panActive", isPanMode);
  editCanvas.classList.toggle("panMode", isPanMode);
}


function getImagePoint(event) {
  const rect = editCanvas.getBoundingClientRect();
  const canvasX = event.clientX - rect.left;
  const canvasY = event.clientY - rect.top;

  const x = (canvasX - drawBox.x) / drawBox.scale;
  const y = (canvasY - drawBox.y) / drawBox.scale;

  if (x < 0 || y < 0 || x > img.naturalWidth || y > img.naturalHeight) {
    return null;
  }

  return { x, y };
}

function toCanvasPoint(point) {
  return {
    x: drawBox.x + point.x * drawBox.scale,
    y: drawBox.y + point.y * drawBox.scale
  };
}

function drawSavedRooms() {
  ctx.save();
  ctx.strokeStyle = ROOM_COLOR;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 5]);

  rooms.forEach((room, index) => {
    const points = room.points.map(toCanvasPoint);
    drawClosedPath(points);
    ctx.stroke();

    const labelPoint = toCanvasPoint(getBoundsCenter(room.points));

    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.strokeStyle = "rgba(80,80,80,0.9)";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.arc(labelPoint.x, labelPoint.y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(30,30,30,0.95)";
    ctx.font = "bold 13px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(index + 1), labelPoint.x, labelPoint.y);

    ctx.strokeStyle = ROOM_COLOR;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 5]);
  });

  ctx.restore();
}

function drawRoomCenters() {
  if (!rooms.length) return;

  rooms.forEach((room) => {
    const origin = getRoomGridOrigin(room);
    const pt = toCanvasPoint(origin);
    drawPlusMarker(pt, CENTER_COLOR, 7);
  });
}

function drawCurrentRoom() {
  if (currentRoom.length === 0) return;

  const points = currentRoom.map(toCanvasPoint);

  ctx.save();
  ctx.strokeStyle = POINT_COLOR;
  ctx.fillStyle = POINT_COLOR;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();

  for (const point of points) {
    drawDot(point, 5);
  }

  ctx.restore();
}

function drawScaleLine() {
  if (scalePoints.length === 0) return;

  const points = scalePoints.map(toCanvasPoint);

  ctx.save();
  ctx.strokeStyle = SCALE_COLOR;
  ctx.fillStyle = SCALE_COLOR;
  ctx.lineWidth = 3;

  if (points.length === 2) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.stroke();
  }

  for (const point of points) {
    drawDot(point, 6);
  }

  ctx.restore();
}

function drawClosedPath(points) {
  if (points.length === 0) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }

  ctx.closePath();
}

function drawDot(point, radius) {
  drawPlusMarker(point, POINT_COLOR, 5);
}

function drawPlusMarker(point, color, size = 5) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(point.x - size, point.y);
  ctx.lineTo(point.x + size, point.y);
  ctx.moveTo(point.x, point.y - size);
  ctx.lineTo(point.x, point.y + size);
  ctx.stroke();
  ctx.restore();
}

function updateRoomsPanel() {
  roomsPanel.innerHTML = "";

  if (rooms.length === 0) {
    roomsPanel.innerHTML = `
      <div class="roomCard emptyRoomCard">
        <h3>Brak zamkniętych obszarów</h3>
        <p class="small">Najpierw zaznacz narożniki obszaru na obrazie i kliknij „Zamknij obszar”. Dopiero wtedy pojawi się osobna karta z ustawieniami siatki, numeracji i ręcznej edycji kratek.</p>
      </div>
    `;
    return;
  }

  rooms.forEach((room, index) => {
    const card = document.createElement("div");
    card.className = "roomCard";

    const countText = getEstimatedLabelCount(room);
    const overrideCount = Object.keys(room.cellOverrides || {}).length;

    card.innerHTML = `
      <h3>Obszar ${index + 1}</h3>
      <p class="small">${countText}. Ręcznie zmienione kratki: ${overrideCount}</p>

      <div class="subBox">
        <h4>Siatka tylko dla obszaru ${index + 1}</h4>
        <div class="roomGrid">
          <label class="miniLabel">Szerokość kratki</label>
          <label class="miniLabel">Jednostka</label>
          <input type="number" data-group="grid" data-field="widthValue" min="0.01" step="0.01" value="${room.grid.widthValue}">
          <select data-group="grid" data-field="widthUnit">
            <option value="cm" ${selected(room.grid.widthUnit, "cm")}>cm</option>
            <option value="m" ${selected(room.grid.widthUnit, "m")}>m</option>
          </select>

          <label class="miniLabel">Wysokość kratki</label>
          <label class="miniLabel">Jednostka</label>
          <input type="number" data-group="grid" data-field="heightValue" min="0.01" step="0.01" value="${room.grid.heightValue}">
          <select data-group="grid" data-field="heightUnit">
            <option value="cm" ${selected(room.grid.heightUnit, "cm")}>cm</option>
            <option value="m" ${selected(room.grid.heightUnit, "m")}>m</option>
          </select>

          <label class="miniLabel">Kolor siatki</label>
          <label class="miniLabel">Grubość linii</label>
          <input type="color" data-group="grid" data-field="color" value="${room.grid.color || "#ff0000"}">
          <input type="number" data-group="grid" data-field="lineWidth" min="1" max="10" step="1" value="${room.grid.lineWidth}">

          <label class="miniLabel full">Transparentność siatki</label>
          <input class="full" type="range" data-group="grid" data-field="opacity" min="0.1" max="1" step="0.05" value="${room.grid.opacity}">
        </div>
      </div>

      <div class="subBox">
        <h4>Środek kratki dla obszaru ${index + 1}</h4>
        <div class="roomGrid">
          <button class="light full" data-action="autoCenter">Wyśrodkuj automatycznie</button>
          <button class="light full" data-action="manualCenter">Ustaw środek ręcznie</button>
          ${manualCenterRoomIndex === index ? '<div class="manualNotice full">Kliknij na obrazie punkt, który ma być środkiem kratki w tym obszarze.</div>' : ''}
        </div>
      </div>

      <div class="subBox">
        <h4>Automatyczne teksty i numery</h4>
        <div class="roomGrid">
          <label class="checkRow full">
            <input type="checkbox" data-group="labels" data-field="enabled" ${room.labels.enabled ? "checked" : ""}>
            pokazuj teksty w kratkach tego obszaru
          </label>

          <label class="miniLabel">Prefix / litera</label>
          <label class="miniLabel">Separator</label>
          <input type="text" data-group="labels" data-field="prefix" value="${escapeHtml(room.labels.prefix)}">
          <input type="text" data-group="labels" data-field="separator" value="${escapeHtml(room.labels.separator)}" placeholder="np. -, / albo spacja">

          <label class="miniLabel">Numer od</label>
          <label class="miniLabel">Numer do</label>
          <input type="number" data-group="labels" data-field="start" min="0" step="1" value="${room.labels.start}">
          <input type="number" data-group="labels" data-field="end" min="0" step="1" placeholder="auto" value="${escapeHtml(room.labels.end)}">

          <label class="miniLabel">Ilość cyfr</label>
          <label class="miniLabel">Dopisek / jednostka</label>
          <input type="number" data-group="labels" data-field="numberDigits" min="1" max="6" step="1" value="${room.labels.numberDigits}">
          <input type="text" data-group="labels" data-field="suffix" value="${escapeHtml(room.labels.suffix)}" placeholder="np. lx, lux, V, W">

          <label class="miniLabel">Separator przed dopiskiem</label>
          <label class="miniLabel">Pozycja w kratce</label>
          <input type="text" data-group="labels" data-field="suffixSeparator" value="${escapeHtml(room.labels.suffixSeparator)}" placeholder="np. spacja albo -">
          <select data-group="labels" data-field="position">
            <option value="top-left" ${selected(room.labels.position, "top-left")}>góra lewo</option>
            <option value="top-center" ${selected(room.labels.position, "top-center")}>góra środek</option>
            <option value="top-right" ${selected(room.labels.position, "top-right")}>góra prawo</option>
            <option value="center-left" ${selected(room.labels.position, "center-left")}>środek lewo</option>
            <option value="center" ${selected(room.labels.position, "center")}>środek</option>
            <option value="center-right" ${selected(room.labels.position, "center-right")}>środek prawo</option>
            <option value="bottom-left" ${selected(room.labels.position, "bottom-left")}>dół lewo</option>
            <option value="bottom-center" ${selected(room.labels.position, "bottom-center")}>dół środek</option>
            <option value="bottom-right" ${selected(room.labels.position, "bottom-right")}>dół prawo</option>
          </select>
        </div>
      </div>

      <div class="subBox">
        <h4>Kolejność numerowania</h4>
        <div class="roomGrid">
          <label class="miniLabel full">Kierunek</label>
          <select class="full" data-group="labels" data-field="direction">
            <option value="left-right-down" ${selected(room.labels.direction, "left-right-down")}>od lewej do prawej, potem w dół</option>
            <option value="right-left-down" ${selected(room.labels.direction, "right-left-down")}>od prawej do lewej, potem w dół</option>
            <option value="left-right-up" ${selected(room.labels.direction, "left-right-up")}>od lewej do prawej, potem w górę</option>
            <option value="right-left-up" ${selected(room.labels.direction, "right-left-up")}>od prawej do lewej, potem w górę</option>
            <option value="top-bottom-right" ${selected(room.labels.direction, "top-bottom-right")}>od góry do dołu, potem w prawo</option>
            <option value="bottom-top-right" ${selected(room.labels.direction, "bottom-top-right")}>od dołu do góry, potem w prawo</option>
            <option value="top-bottom-left" ${selected(room.labels.direction, "top-bottom-left")}>od góry do dołu, potem w lewo</option>
            <option value="bottom-top-left" ${selected(room.labels.direction, "bottom-top-left")}>od dołu do góry, potem w lewo</option>
          </select>

          <label class="checkRow full">
            <input type="checkbox" data-group="labels" data-field="snake" ${room.labels.snake ? "checked" : ""}>
            numeruj wężykiem
          </label>

          <label class="miniLabel full">Gdy kratka jest pominięta</label>
          <select class="full" data-group="labels" data-field="skipMode">
            <option value="compact" ${selected(room.labels.skipMode, "compact")}>bez luk: P1, pominięta, P2</option>
            <option value="gaps" ${selected(room.labels.skipMode, "gaps")}>z lukami: P1, pominięta, P3</option>
          </select>
        </div>
      </div>

      <div class="subBox">
        <h4>Wygląd tekstów</h4>
        <div class="roomGrid">
          <label class="miniLabel">Rozmiar</label>
          <label class="miniLabel">Kolor</label>
          <input type="number" data-group="labels" data-field="size" min="6" max="200" step="1" value="${room.labels.size}">
          <input type="color" data-group="labels" data-field="color" value="${room.labels.color || "#ff0000"}">

          <label class="miniLabel">Transparentność</label>
          <label class="miniLabel">Pogrubienie</label>
          <input type="range" data-group="labels" data-field="opacity" min="0.1" max="1" step="0.05" value="${room.labels.opacity}">
          <label class="checkRow">
            <input type="checkbox" data-group="labels" data-field="bold" ${room.labels.bold ? "checked" : ""}>
            pogrub
          </label>
        </div>
      </div>

      <div class="subBox">
        <h4>Ręczna edycja pojedynczych kratek</h4>
        <div class="roomGrid">
          <button class="light full ${isModeActive(index, "skip")}" data-action="skipCells">Klikaj kratki: pomiń / przywróć</button>
          <button class="light full ${isModeActive(index, "custom")}" data-action="customCells">Kliknij kratkę i wpisz własny tekst</button>
          <button class="light full ${isModeActive(index, "restore")}" data-action="restoreCells">Klikaj kratki: przywróć auto</button>
          <button class="light full" data-action="clearOverrides">Wyczyść ręczne zmiany tego obszaru</button>
          ${cellEditMode && cellEditMode.areaIndex === index ? '<div class="manualNotice full">Tryb klikania kratek jest włączony dla tego obszaru. Kliknij kratkę na obrazie.</div>' : ''}
        </div>
      </div>
    `;

    card.querySelector('[data-action="autoCenter"]').addEventListener("click", () => {
      room.gridOriginMode = "center";
      room.manualCenter = null;
      manualCenterRoomIndex = null;
      clearResult();
      updateRoomsPanel();
      updateStatus(`Obszar ${index + 1}: siatka wyśrodkowana automatycznie.`);
      draw();
    });

    card.querySelector('[data-action="manualCenter"]').addEventListener("click", () => {
      manualCenterRoomIndex = index;
      cellEditMode = null;
      updateRoomsPanel();
      updateStatus(`Kliknij na obrazie środek kratki dla obszaru ${index + 1}.`);
      draw();
    });

    card.querySelector('[data-action="skipCells"]').addEventListener("click", () => toggleCellMode(index, "skip"));
    card.querySelector('[data-action="customCells"]').addEventListener("click", () => toggleCellMode(index, "custom"));
    card.querySelector('[data-action="restoreCells"]').addEventListener("click", () => toggleCellMode(index, "restore"));
    card.querySelector('[data-action="clearOverrides"]').addEventListener("click", () => {
      if (!confirm("Wyczyścić ręczne zmiany kratek w tym obszarze?")) return;
      room.cellOverrides = {};
      clearResult();
      updateRoomsPanel();
      updateStatus(`Wyczyszczono ręczne zmiany obszaru ${index + 1}.`);
      draw();
    });

    card.querySelectorAll("input, select").forEach(input => {
      input.addEventListener("input", () => {
        updateRoomFromInput(room, input);
        clearResult();
        updateStatus();
        draw();
      });

      input.addEventListener("change", () => {
        updateRoomFromInput(room, input);
        clearResult();
        updateStatus();
        draw();
      });
    });

    roomsPanel.appendChild(card);
  });
}



function selected(current, value) {
  return current === value ? "selected" : "";
}

function updateRoomFromInput(room, input) {
  const group = input.dataset.group;
  const field = input.dataset.field;

  if (group === "grid") {
    if (field === "widthValue") room.grid.widthValue = Number(input.value) || 0;
    if (field === "widthUnit") room.grid.widthUnit = input.value;
    if (field === "heightValue") room.grid.heightValue = Number(input.value) || 0;
    if (field === "heightUnit") room.grid.heightUnit = input.value;
    if (field === "color") room.grid.color = input.value || "#ff0000";
    if (field === "lineWidth") room.grid.lineWidth = Number(input.value) || 2;
    if (field === "opacity") room.grid.opacity = Number(input.value) || 0.55;
    room.cellOverrides = {};
    return;
  }

  if (group === "labels") {
    if (field === "enabled") room.labels.enabled = input.checked;
    if (field === "prefix") room.labels.prefix = input.value;
    if (field === "separator") room.labels.separator = input.value;
    if (field === "start") room.labels.start = Number(input.value) || 0;
    if (field === "end") room.labels.end = input.value;
    if (field === "numberDigits") room.labels.numberDigits = Number(input.value) || 1;
    if (field === "suffixSeparator") room.labels.suffixSeparator = input.value;
    if (field === "suffix") room.labels.suffix = input.value;
    if (field === "position") room.labels.position = input.value;
    if (field === "direction") room.labels.direction = input.value;
    if (field === "snake") room.labels.snake = input.checked;
    if (field === "skipMode") room.labels.skipMode = input.value;
    if (field === "size") room.labels.size = Number(input.value) || 22;
    if (field === "color") room.labels.color = input.value || "#ff0000";
    if (field === "opacity") room.labels.opacity = Number(input.value) || 0.9;
    if (field === "bold") room.labels.bold = input.checked;
  }
}



function getEstimatedLabelCount(room) {
  const grid = getRoomGridSettings(room);
  if (!grid || !pxPerMeter) return "Kratki do numeracji: po ustawieniu skali.";
  const cells = getRoomCells(room, grid);
  return `Kratki do numeracji: ${cells.length}`;
}

function getRoomGridSettings(room) {
  const widthValue = Number(room.grid.widthValue);
  const heightValue = Number(room.grid.heightValue);
  const lineWidth = Number(room.grid.lineWidth);
  const opacity = Number(room.grid.opacity);

  if (!Number.isFinite(widthValue) || widthValue <= 0) return null;
  if (!Number.isFinite(heightValue) || heightValue <= 0) return null;

  return {
    widthValue,
    widthUnit: room.grid.widthUnit,
    heightValue,
    heightUnit: room.grid.heightUnit,
    widthMeters: room.grid.widthUnit === "cm" ? widthValue / 100 : widthValue,
    heightMeters: room.grid.heightUnit === "cm" ? heightValue / 100 : heightValue,
    color: room.grid.color || "#ff0000",
    lineWidth: Number.isFinite(lineWidth) && lineWidth > 0 ? lineWidth : 2,
    opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0.1, opacity)) : 0.55
  };
}

function getRoomGridOrigin(room) {
  if (room.gridOriginMode === "manual" && room.manualCenter) {
    return room.manualCenter;
  }

  return getBoundsCenter(room.points);
}

function makeResultImage() {
  const out = document.createElement("canvas");
  out.width = img.naturalWidth;
  out.height = img.naturalHeight;

  const outCtx = out.getContext("2d");
  outCtx.drawImage(img, 0, 0);

  for (const room of rooms) {
    const grid = getRoomGridSettings(room);
    if (grid) drawGridInRoom(outCtx, room, grid);
  }

  for (const room of rooms) {
    const grid = getRoomGridSettings(room);
    if (grid && room.labels.enabled) {
      drawLabelsInRoom(outCtx, room, grid);
    }
  }

  return out.toDataURL("image/png");
}

function drawGridInRoom(outCtx, room, grid) {
  const stepX = pxPerMeter * grid.widthMeters;
  const stepY = pxPerMeter * grid.heightMeters;

  if (!Number.isFinite(stepX) || !Number.isFinite(stepY) || stepX <= 0 || stepY <= 0) {
    return;
  }

  const bounds = getBounds(room.points);
  const origin = getRoomGridOrigin(room);

  outCtx.save();
  pathRoom(outCtx, room.points);
  outCtx.clip();

  outCtx.strokeStyle = hexToRgba(grid.color, grid.opacity);
  outCtx.lineWidth = grid.lineWidth;

  const firstX = origin.x - stepX / 2 + Math.floor((bounds.minX - (origin.x - stepX / 2)) / stepX) * stepX;
  const firstY = origin.y - stepY / 2 + Math.floor((bounds.minY - (origin.y - stepY / 2)) / stepY) * stepY;

  for (let x = firstX; x <= bounds.maxX + stepX; x += stepX) {
    outCtx.beginPath();
    outCtx.moveTo(x, bounds.minY - stepY);
    outCtx.lineTo(x, bounds.maxY + stepY);
    outCtx.stroke();
  }

  for (let y = firstY; y <= bounds.maxY + stepY; y += stepY) {
    outCtx.beginPath();
    outCtx.moveTo(bounds.minX - stepX, y);
    outCtx.lineTo(bounds.maxX + stepX, y);
    outCtx.stroke();
  }

  outCtx.restore();
}

function drawLabelsInRoom(outCtx, room, grid) {
  const cells = getOrderedCells(room, grid);
  const labels = room.labels;

  const color = hexToRgba(labels.color, labels.opacity);
  const fontSize = Math.max(6, Number(labels.size) || 22);
  const fontWeight = labels.bold ? "bold" : "normal";
  const start = Number(labels.start) || 0;
  const end = labels.end === "" ? Infinity : Number(labels.end);

  outCtx.save();
  pathRoom(outCtx, room.points);
  outCtx.clip();

  outCtx.fillStyle = color;
  outCtx.font = `${fontWeight} ${fontSize}px Arial`;

  let number = start;

  for (const cell of cells) {
    const override = room.cellOverrides?.[cell.key];

    if (override && override.mode === "skip") {
      if (labels.skipMode === "gaps") number += 1;
      continue;
    }

    if (number > end) break;

    let text = formatAutoLabel(room, number);

    if (override && override.mode === "custom") {
      text = override.text;
    }

    const labelPoint = getLabelPointInCell(cell, grid, labels.position);

    outCtx.textAlign = labelPoint.align;
    outCtx.textBaseline = labelPoint.baseline;
    outCtx.fillText(text, labelPoint.x, labelPoint.y);

    number += 1;
  }

  outCtx.restore();
}



function getRoomCells(room, grid) {
  const stepX = pxPerMeter * grid.widthMeters;
  const stepY = pxPerMeter * grid.heightMeters;
  const bounds = getBounds(room.points);
  const origin = getRoomGridOrigin(room);

  const cells = [];

  const firstCenterX = origin.x + Math.floor((bounds.minX - origin.x) / stepX) * stepX;
  const firstCenterY = origin.y + Math.floor((bounds.minY - origin.y) / stepY) * stepY;

  let row = 0;
  for (let y = firstCenterY; y <= bounds.maxY + stepY; y += stepY) {
    let col = 0;
    for (let x = firstCenterX; x <= bounds.maxX + stepX; x += stepX) {
      if (pointInPolygon({ x, y }, room.points)) {
        cells.push({ x, y, row, col, stepX, stepY, key: `${row}:${col}` });
      }
      col += 1;
    }
    row += 1;
  }

  return cells;
}




function drawGridAndLabelsPreview() {
  if (!drawBox || pxPerMeter === null) return;

  ctx.save();
  ctx.translate(drawBox.x, drawBox.y);
  ctx.scale(drawBox.scale, drawBox.scale);

  for (const room of rooms) {
    const grid = getRoomGridSettings(room);
    if (grid) drawGridInRoom(ctx, room, grid);
  }

  for (const room of rooms) {
    const grid = getRoomGridSettings(room);
    if (grid && room.labels.enabled) drawLabelsInRoom(ctx, room, grid);
  }

  drawCellOverrideMarks(ctx);
  ctx.restore();
}

function drawCellOverrideMarks(outCtx) {
  if (!pxPerMeter) return;

  for (const room of rooms) {
    const grid = getRoomGridSettings(room);
    if (!grid) continue;

    const cells = getRoomCells(room, grid);
    const cellMap = new Map(cells.map(cell => [cell.key, cell]));

    outCtx.save();
    pathRoom(outCtx, room.points);
    outCtx.clip();

    for (const [key, override] of Object.entries(room.cellOverrides || {})) {
      const cell = cellMap.get(key);
      if (!cell) continue;

      outCtx.fillStyle = override.mode === "skip"
        ? "rgba(220, 60, 60, 0.18)"
        : "rgba(255, 190, 40, 0.22)";

      outCtx.fillRect(cell.x - cell.stepX / 2, cell.y - cell.stepY / 2, cell.stepX, cell.stepY);
    }

    outCtx.restore();
  }
}

function toggleCellMode(roomIndex, type) {
  manualCenterRoomIndex = null;

  if (cellEditMode && cellEditMode.areaIndex === roomIndex && cellEditMode.type === type) {
    cellEditMode = null;
    updateStatus("Tryb klikania kratek wyłączony.");
  } else {
    cellEditMode = { areaIndex: roomIndex, type };
    if (type === "skip") updateStatus(`Obszar ${roomIndex + 1}: klikaj kratki, które mają być pominięte albo przywrócone.`);
    if (type === "custom") updateStatus(`Obszar ${roomIndex + 1}: kliknij kratkę, żeby wpisać własny tekst.`);
    if (type === "restore") updateStatus(`Obszar ${roomIndex + 1}: klikaj kratki, które mają wrócić do automatu.`);
  }

  updateRoomsPanel();
  draw();
}

function isModeActive(roomIndex, type) {
  return cellEditMode && cellEditMode.areaIndex === roomIndex && cellEditMode.type === type
    ? "modeButtonActive"
    : "";
}

function handleCellEditClick(point) {
  const room = rooms[cellEditMode.areaIndex];
  if (!room) return;

  const grid = getRoomGridSettings(room);
  if (!grid) {
    alert("Najpierw ustaw poprawną siatkę dla tego obszaru.");
    return;
  }

  const cell = findCellAtPoint(room, grid, point);
  if (!cell) {
    updateStatus("Kliknij środek kratki w wybranym obszarze.");
    return;
  }

  const currentOverride = room.cellOverrides?.[cell.key];

  if (cellEditMode.type === "skip") {
    if (currentOverride && currentOverride.mode === "skip") {
      delete room.cellOverrides[cell.key];
      updateStatus("Kratka wróciła do numeracji.");
    } else {
      room.cellOverrides[cell.key] = { mode: "skip" };
      updateStatus("Kratka pominięta w numeracji.");
    }
  }

  if (cellEditMode.type === "custom") {
    const autoText = getAutoTextForCell(room, grid, cell.key) || "";
    const oldText = currentOverride && currentOverride.mode === "custom" ? currentOverride.text : autoText;
    const text = prompt("Wpisz własny tekst dla tej kratki. Puste pole usunie napis z kratki.", oldText);

    if (text === null) return;

    if (text.trim() === "") {
      room.cellOverrides[cell.key] = { mode: "skip" };
      updateStatus("Usunięto napis z kratki.");
    } else {
      room.cellOverrides[cell.key] = { mode: "custom", text };
      updateStatus("Zapisano własny tekst kratki.");
    }
  }

  if (cellEditMode.type === "restore") {
    delete room.cellOverrides[cell.key];
    updateStatus("Przywrócono automatyczny napis kratki.");
  }

  clearResult();
  updateRoomsPanel();
  draw();
}

function formatAutoLabel(room, number) {
  const labels = room.labels;
  const digits = Math.max(1, Number(labels.numberDigits) || 1);
  const padded = String(number).padStart(digits, "0");
  const suffix = labels.suffix ? `${labels.suffixSeparator || ""}${labels.suffix}` : "";
  return `${labels.prefix || ""}${labels.separator || ""}${padded}${suffix}`;
}

function getAutoTextForCell(room, grid, key) {
  const cells = getOrderedCells(room, grid);
  const labels = room.labels;
  let number = Number(labels.start) || 0;
  const end = labels.end === "" ? Infinity : Number(labels.end);

  for (const cell of cells) {
    const override = room.cellOverrides?.[cell.key];

    if (override && override.mode === "skip") {
      if (labels.skipMode === "gaps") number += 1;
      continue;
    }

    if (number > end) return "";

    if (cell.key === key) {
      return formatAutoLabel(room, number);
    }

    number += 1;
  }

  return "";
}

function getOrderedCells(room, grid) {
  const cells = getRoomCells(room, grid);
  const dir = room.labels.direction || "left-right-down";
  const snake = Boolean(room.labels.snake);

  if (dir.includes("left-right") || dir.includes("right-left")) {
    const rowAsc = dir.endsWith("down");
    const colAscBase = dir.startsWith("left-right");
    return orderByPrimary(cells, "row", "col", rowAsc, colAscBase, snake);
  }

  const colAsc = dir.endsWith("right");
  const rowAscBase = dir.startsWith("top-bottom");
  return orderByPrimary(cells, "col", "row", colAsc, rowAscBase, snake);
}

function orderByPrimary(cells, primaryKey, secondaryKey, primaryAsc, secondaryAscBase, snake) {
  const groups = new Map();

  for (const cell of cells) {
    const key = cell[primaryKey];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(cell);
  }

  const primaryValues = Array.from(groups.keys()).sort((a, b) => primaryAsc ? a - b : b - a);
  const ordered = [];

  primaryValues.forEach((primaryValue, index) => {
    const group = groups.get(primaryValue);
    const secondaryAsc = snake && index % 2 === 1 ? !secondaryAscBase : secondaryAscBase;

    group.sort((a, b) => secondaryAsc
      ? a[secondaryKey] - b[secondaryKey]
      : b[secondaryKey] - a[secondaryKey]
    );

    ordered.push(...group);
  });

  return ordered;
}

function findCellAtPoint(room, grid, point) {
  const cells = getRoomCells(room, grid);

  for (const cell of cells) {
    const insideCell =
      point.x >= cell.x - cell.stepX / 2 &&
      point.x <= cell.x + cell.stepX / 2 &&
      point.y >= cell.y - cell.stepY / 2 &&
      point.y <= cell.y + cell.stepY / 2;

    if (insideCell && pointInPolygon(point, room.points)) {
      return cell;
    }
  }

  return null;
}

function getLabelPointInCell(cell, grid, position) {
  const stepX = pxPerMeter * grid.widthMeters;
  const stepY = pxPerMeter * grid.heightMeters;
  const padX = stepX * 0.16;
  const padY = stepY * 0.16;

  const p = position || "center";
  let x = cell.x;
  let y = cell.y;
  let align = "center";
  let baseline = "middle";

  if (p.includes("left")) {
    x = cell.x - stepX / 2 + padX;
    align = "left";
  } else if (p.includes("right")) {
    x = cell.x + stepX / 2 - padX;
    align = "right";
  }

  if (p.includes("top")) {
    y = cell.y - stepY / 2 + padY;
    baseline = "top";
  } else if (p.includes("bottom")) {
    y = cell.y + stepY / 2 - padY;
    baseline = "bottom";
  }

  return { x, y, align, baseline };
}

function pathRoom(outCtx, points) {
  outCtx.beginPath();
  outCtx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    outCtx.lineTo(points[i].x, points[i].y);
  }
  outCtx.closePath();
}

function pointInPolygon(point, polygon) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

function hexToRgba(hex, alpha) {
  let value = String(hex).replace("#", "");
  if (value.length === 3) {
    value = value.split("").map(char => char + char).join("");
  }

  const number = parseInt(value, 16);
  const r = (number >> 16) & 255;
  const g = (number >> 8) & 255;
  const b = number & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getBounds(points) {
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

function getBoundsCenter(points) {
  const bounds = getBounds(points);
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function updateStatus(message) {
  statusImage.textContent = img
    ? `Obraz: ${img.naturalWidth} × ${img.naturalHeight} px`
    : "Brak obrazu";

  statusScale.textContent = pxPerMeter
    ? `Skala: 1 m = ${pxPerMeter.toFixed(1)} px`
    : `Skala: ${scalePoints.length}/2 punkty`;

  statusRooms.textContent = `Obszary: ${rooms.length}`;

  if (message) {
    statusMode.textContent = `Teraz: ${message}`;
  } else if (!img) {
    statusMode.textContent = "Teraz: wgraj zdjęcie";
  } else if (pxPerMeter === null) {
    statusMode.textContent = "Teraz: ustaw skalę";
  } else if (manualCenterRoomIndex !== null) {
    statusMode.textContent = `Teraz: kliknij środek kratki dla obszaru ${manualCenterRoomIndex + 1}`;
  } else {
    statusMode.textContent = "Teraz: zaznacz obszaru";
  }
}

function safeName(name) {
  return String(name)
    .replace(/\.[^/.]+$/, "")
    .replace(/[^\p{L}\p{N}_-]+/gu, "_");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

updateStatus();
updateRoomsPanel();
