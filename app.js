const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const imageInput = document.getElementById("imageInput");
const projectInput = document.getElementById("projectInput");
const emptyState = document.getElementById("emptyState");
const coordsEl = document.getElementById("coords");

const realDistanceInput = document.getElementById("realDistance");
const applyCalibrationBtn = document.getElementById("applyCalibration");
const clearCalibrationBtn = document.getElementById("clearCalibration");
const scaleInfo = document.getElementById("scaleInfo");

const roomNameInput = document.getElementById("roomName");
const closeRoomBtn = document.getElementById("closeRoom");
const undoPointBtn = document.getElementById("undoPoint");
const clearCurrentBtn = document.getElementById("clearCurrent");
const roomsList = document.getElementById("roomsList");

const gridSpacingInput = document.getElementById("gridSpacing");
const gridColorInput = document.getElementById("gridColor");
const gridOpacityInput = document.getElementById("gridOpacity");
const gridWidthInput = document.getElementById("gridWidth");
const showOutlinesInput = document.getElementById("showOutlines");
const gridPerRoomOriginInput = document.getElementById("gridPerRoomOrigin");

const fitViewBtn = document.getElementById("fitView");
const exportPngBtn = document.getElementById("exportPng");
const saveProjectBtn = document.getElementById("saveProject");
const modeHelp = document.getElementById("modeHelp");

let mode = "pan";
let image = null;
let imageDataUrl = null;
let imageName = null;

let view = { scale: 1, x: 0, y: 0 };
let dpr = window.devicePixelRatio || 1;

let pxPerMeter = null;
let calibrationPoints = [];
let currentPoints = [];
let rooms = [];

let isDragging = false;
let dragStart = { x: 0, y: 0 };
let dragViewStart = { x: 0, y: 0 };
let pointerDown = null;

const modeHelpText = {
  pan: "Tryb „Przesuwaj”: przeciągaj rzut, kółkiem myszy przybliżaj.",
  calibrate: "Tryb „Kalibruj”: kliknij dwa punkty znanego wymiaru, potem wpisz wymiar i zatwierdź.",
  room: "Tryb „Rysuj pomieszczenie”: klikaj narożniki pomieszczenia/korytarza po wewnętrznej stronie ścian."
};

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  draw();
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function setMode(nextMode) {
  mode = nextMode;
  document.querySelectorAll(".mode").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  modeHelp.textContent = modeHelpText[mode];
}

document.querySelectorAll(".mode").forEach(btn => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

function imageToScreen(pt) {
  return { x: pt.x * view.scale + view.x, y: pt.y * view.scale + view.y };
}

function screenToImage(pt) {
  return { x: (pt.x - view.x) / view.scale, y: (pt.y - view.y) / view.scale };
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function fitImageToView() {
  if (!image) return;
  const rect = canvas.getBoundingClientRect();
  const padding = 32;
  const sx = (rect.width - padding * 2) / image.naturalWidth;
  const sy = (rect.height - padding * 2) / image.naturalHeight;
  view.scale = Math.min(sx, sy);
  view.x = (rect.width - image.naturalWidth * view.scale) / 2;
  view.y = (rect.height - image.naturalHeight * view.scale) / 2;
  draw();
}

imageInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  imageName = file.name;
  imageDataUrl = await fileToDataUrl(file);

  const img = new Image();
  img.onload = () => {
    image = img;
    emptyState.style.display = "none";
    calibrationPoints = [];
    currentPoints = [];
    rooms = [];
    pxPerMeter = null;
    updateScaleInfo();
    updateRoomsList();
    fitImageToView();
  };
  img.src = imageDataUrl;
});

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function draw() {
  const rect = canvas.getBoundingClientRect();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (!image) return;

  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(view.scale, view.scale);

  ctx.drawImage(image, 0, 0);

  drawRoomsAndGrids(ctx, {
    scaleAware: true,
    includeImage: false,
    showCurrent: true
  });

  ctx.restore();

  drawCalibrationPoints();
}

function drawRoomsAndGrids(targetCtx, options = {}) {
  const scaleAware = options.scaleAware ?? false;
  const showCurrent = options.showCurrent ?? true;

  const settings = getGridSettings();

  for (const room of rooms) {
    if (room.grid !== false && pxPerMeter) {
      drawGridInsidePolygon(targetCtx, room.points, settings, pxPerMeter, scaleAware);
    }

    if (settings.showOutlines) {
      drawPolygon(targetCtx, room.points, "rgba(70,70,70,0.75)", scaleAware ? 1.5 / view.scale : 2, true);
    }
  }

  if (showCurrent && currentPoints.length > 0) {
    drawPolyline(targetCtx, currentPoints, "rgba(180, 80, 30, 0.95)", scaleAware ? 2 / view.scale : 2);

    for (const pt of currentPoints) {
      drawPointInImageSpace(targetCtx, pt, "rgba(180, 80, 30, 0.95)", scaleAware ? 5 / view.scale : 5);
    }
  }
}

function getGridSettings() {
  return {
    spacingM: Math.max(0.01, parseFloat(gridSpacingInput.value) || 1),
    color: gridColorInput.value || "#777777",
    opacity: Math.max(0.05, Math.min(1, parseFloat(gridOpacityInput.value) || 0.45)),
    width: Math.max(1, parseFloat(gridWidthInput.value) || 1),
    showOutlines: showOutlinesInput.checked,
    perRoomOrigin: gridPerRoomOriginInput.checked
  };
}

function hexToRgba(hex, alpha) {
  let value = hex.replace("#", "");
  if (value.length === 3) {
    value = value.split("").map(char => char + char).join("");
  }
  const int = parseInt(value, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawGridInsidePolygon(targetCtx, polygon, settings, pxPerMeterValue, scaleAware) {
  if (polygon.length < 3) return;

  const step = settings.spacingM * pxPerMeterValue;
  if (!Number.isFinite(step) || step <= 0) return;

  const bounds = getBounds(polygon);
  const lineWidth = scaleAware ? settings.width / view.scale : settings.width;
  const color = hexToRgba(settings.color, settings.opacity);

  targetCtx.save();
  pathPolygon(targetCtx, polygon);
  targetCtx.clip();

  targetCtx.strokeStyle = color;
  targetCtx.lineWidth = lineWidth;
  targetCtx.setLineDash([]);

  const startX = settings.perRoomOrigin
    ? bounds.minX
    : Math.floor(bounds.minX / step) * step;

  const startY = settings.perRoomOrigin
    ? bounds.minY
    : Math.floor(bounds.minY / step) * step;

  for (let x = startX; x <= bounds.maxX + step * 0.5; x += step) {
    targetCtx.beginPath();
    targetCtx.moveTo(x, bounds.minY - step);
    targetCtx.lineTo(x, bounds.maxY + step);
    targetCtx.stroke();
  }

  for (let y = startY; y <= bounds.maxY + step * 0.5; y += step) {
    targetCtx.beginPath();
    targetCtx.moveTo(bounds.minX - step, y);
    targetCtx.lineTo(bounds.maxX + step, y);
    targetCtx.stroke();
  }

  targetCtx.restore();
}

function drawCalibrationPoints() {
  if (!calibrationPoints.length) return;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const screenPts = calibrationPoints.map(imageToScreen);
  ctx.strokeStyle = "rgba(180, 40, 40, 0.95)";
  ctx.fillStyle = "rgba(180, 40, 40, 0.95)";
  ctx.lineWidth = 2;

  if (screenPts.length === 2) {
    ctx.beginPath();
    ctx.moveTo(screenPts[0].x, screenPts[0].y);
    ctx.lineTo(screenPts[1].x, screenPts[1].y);
    ctx.stroke();
  }

  for (const pt of screenPts) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function pathPolygon(targetCtx, points) {
  targetCtx.beginPath();
  targetCtx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    targetCtx.lineTo(points[i].x, points[i].y);
  }
  targetCtx.closePath();
}

function drawPolygon(targetCtx, points, color, lineWidth, dashed = false) {
  if (points.length < 2) return;
  targetCtx.save();
  targetCtx.strokeStyle = color;
  targetCtx.lineWidth = lineWidth;
  targetCtx.setLineDash(dashed ? [8 * lineWidth, 5 * lineWidth] : []);
  pathPolygon(targetCtx, points);
  targetCtx.stroke();
  targetCtx.restore();
}

function drawPolyline(targetCtx, points, color, lineWidth) {
  if (points.length < 1) return;
  targetCtx.save();
  targetCtx.strokeStyle = color;
  targetCtx.lineWidth = lineWidth;
  targetCtx.setLineDash([]);
  targetCtx.beginPath();
  targetCtx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    targetCtx.lineTo(points[i].x, points[i].y);
  }
  targetCtx.stroke();
  targetCtx.restore();
}

function drawPointInImageSpace(targetCtx, pt, color, radius) {
  targetCtx.save();
  targetCtx.fillStyle = color;
  targetCtx.beginPath();
  targetCtx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
  targetCtx.fill();
  targetCtx.restore();
}

function getBounds(points) {
  return points.reduce((acc, pt) => ({
    minX: Math.min(acc.minX, pt.x),
    minY: Math.min(acc.minY, pt.y),
    maxX: Math.max(acc.maxX, pt.x),
    maxY: Math.max(acc.maxY, pt.y)
  }), {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  });
}

canvas.addEventListener("pointerdown", (event) => {
  if (!image) return;
  canvas.setPointerCapture(event.pointerId);
  const pt = getCanvasPoint(event);
  pointerDown = { ...pt };
  isDragging = mode === "pan";
  dragStart = pt;
  dragViewStart = { x: view.x, y: view.y };
});

canvas.addEventListener("pointermove", (event) => {
  const screenPt = getCanvasPoint(event);
  if (image) {
    const imgPt = screenToImage(screenPt);
    coordsEl.textContent = `x: ${imgPt.x.toFixed(0)} px, y: ${imgPt.y.toFixed(0)} px`;
  }

  if (isDragging && mode === "pan") {
    view.x = dragViewStart.x + (screenPt.x - dragStart.x);
    view.y = dragViewStart.y + (screenPt.y - dragStart.y);
    draw();
  }
});

canvas.addEventListener("pointerup", (event) => {
  if (!image) return;
  const pt = getCanvasPoint(event);
  const moved = pointerDown ? Math.hypot(pt.x - pointerDown.x, pt.y - pointerDown.y) : 0;

  if (moved < 5 && mode !== "pan") {
    handleCanvasClick(pt);
  }

  isDragging = false;
  pointerDown = null;
});

canvas.addEventListener("wheel", (event) => {
  if (!image) return;
  event.preventDefault();

  const pt = getCanvasPoint(event);
  const before = screenToImage(pt);
  const zoom = event.deltaY < 0 ? 1.12 : 1 / 1.12;
  view.scale = clamp(view.scale * zoom, 0.05, 20);
  const afterScreen = imageToScreen(before);
  view.x += pt.x - afterScreen.x;
  view.y += pt.y - afterScreen.y;
  draw();
}, { passive: false });

function handleCanvasClick(screenPt) {
  const imgPt = screenToImage(screenPt);

  if (imgPt.x < 0 || imgPt.y < 0 || imgPt.x > image.naturalWidth || imgPt.y > image.naturalHeight) {
    return;
  }

  if (mode === "calibrate") {
    if (calibrationPoints.length >= 2) calibrationPoints = [];
    calibrationPoints.push(imgPt);
    if (calibrationPoints.length === 2) {
      updateScaleInfo("Wpisz rzeczywisty wymiar i kliknij „Zastosuj kalibrację”.");
    }
    draw();
    return;
  }

  if (mode === "room") {
    currentPoints.push(imgPt);
    draw();
  }
}

applyCalibrationBtn.addEventListener("click", () => {
  if (calibrationPoints.length !== 2) {
    alert("Najpierw kliknij dwa punkty kalibracji na rysunku.");
    return;
  }

  const realDistance = parseFloat(realDistanceInput.value);
  if (!Number.isFinite(realDistance) || realDistance <= 0) {
    alert("Wpisz poprawny wymiar rzeczywisty w metrach.");
    return;
  }

  const pixelDistance = distance(calibrationPoints[0], calibrationPoints[1]);
  pxPerMeter = pixelDistance / realDistance;
  updateScaleInfo();
  draw();
});

clearCalibrationBtn.addEventListener("click", () => {
  calibrationPoints = [];
  pxPerMeter = null;
  updateScaleInfo();
  draw();
});

function updateScaleInfo(extra = "") {
  if (!pxPerMeter) {
    scaleInfo.textContent = extra || "Skala: nieustalona";
    return;
  }
  scaleInfo.textContent = `Skala: 1 m = ${pxPerMeter.toFixed(2)} px. ${extra}`;
}

closeRoomBtn.addEventListener("click", () => {
  if (currentPoints.length < 3) {
    alert("Pomieszczenie musi mieć co najmniej 3 punkty.");
    return;
  }

  const name = roomNameInput.value.trim() || `Pomieszczenie ${rooms.length + 1}`;
  rooms.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    name,
    points: currentPoints.map(pt => ({ x: pt.x, y: pt.y })),
    grid: true
  });

  currentPoints = [];
  roomNameInput.value = `Pomieszczenie ${rooms.length + 1}`;
  updateRoomsList();
  draw();
});

undoPointBtn.addEventListener("click", () => {
  currentPoints.pop();
  draw();
});

clearCurrentBtn.addEventListener("click", () => {
  currentPoints = [];
  draw();
});

function updateRoomsList() {
  roomsList.innerHTML = "";

  if (!rooms.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "Brak zapisanych pomieszczeń.";
    roomsList.appendChild(empty);
    return;
  }

  rooms.forEach((room, index) => {
    const item = document.createElement("div");
    item.className = "room-item";

    const top = document.createElement("div");
    top.className = "room-top";

    const title = document.createElement("div");
    title.innerHTML = `<div class="room-title">${escapeHtml(room.name)}</div><div class="room-meta">${room.points.length} pkt</div>`;

    const checkboxLabel = document.createElement("label");
    checkboxLabel.className = "check";
    checkboxLabel.innerHTML = `<input type="checkbox" ${room.grid !== false ? "checked" : ""} /> siatka`;
    checkboxLabel.querySelector("input").addEventListener("change", (event) => {
      room.grid = event.target.checked;
      draw();
    });

    top.appendChild(title);
    top.appendChild(checkboxLabel);

    const actions = document.createElement("div");
    actions.className = "room-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "secondary";
    editBtn.textContent = "Edytuj";
    editBtn.addEventListener("click", () => {
      currentPoints = room.points.map(pt => ({ ...pt }));
      roomNameInput.value = room.name;
      rooms.splice(index, 1);
      updateRoomsList();
      setMode("room");
      draw();
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "danger";
    deleteBtn.textContent = "Usuń";
    deleteBtn.addEventListener("click", () => {
      rooms.splice(index, 1);
      updateRoomsList();
      draw();
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(top);
    item.appendChild(actions);
    roomsList.appendChild(item);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

[
  gridSpacingInput,
  gridColorInput,
  gridOpacityInput,
  gridWidthInput,
  showOutlinesInput,
  gridPerRoomOriginInput
].forEach(el => el.addEventListener("input", draw));

fitViewBtn.addEventListener("click", fitImageToView);

exportPngBtn.addEventListener("click", () => {
  if (!image) {
    alert("Najpierw wgraj obraz.");
    return;
  }

  if (!pxPerMeter) {
    const proceed = confirm("Skala nie jest ustawiona. Siatka nie zostanie narysowana. Eksportować mimo to?");
    if (!proceed) return;
  }

  const out = document.createElement("canvas");
  out.width = image.naturalWidth;
  out.height = image.naturalHeight;
  const outCtx = out.getContext("2d");

  outCtx.drawImage(image, 0, 0);
  drawRoomsAndGridsForExport(outCtx);

  const link = document.createElement("a");
  link.download = makeSafeFileName(imageName || "rzut") + "_siatka_1x1m.png";
  link.href = out.toDataURL("image/png");
  link.click();
});

function drawRoomsAndGridsForExport(outCtx) {
  const settings = getGridSettings();

  for (const room of rooms) {
    if (room.grid !== false && pxPerMeter) {
      drawGridInsidePolygon(outCtx, room.points, settings, pxPerMeter, false);
    }

    if (settings.showOutlines) {
      drawPolygon(outCtx, room.points, "rgba(70,70,70,0.75)", Math.max(1, settings.width), true);
    }
  }
}

function makeSafeFileName(name) {
  return name.replace(/\.[^/.]+$/, "").replace(/[^\p{L}\p{N}_-]+/gu, "_");
}

saveProjectBtn.addEventListener("click", () => {
  const project = {
    version: 1,
    imageName,
    imageDataUrl,
    pxPerMeter,
    calibrationPoints,
    currentPoints,
    rooms,
    settings: {
      gridSpacing: gridSpacingInput.value,
      gridColor: gridColorInput.value,
      gridOpacity: gridOpacityInput.value,
      gridWidth: gridWidthInput.value,
      showOutlines: showOutlinesInput.checked,
      gridPerRoomOrigin: gridPerRoomOriginInput.checked
    }
  };

  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.download = "projekt_siatka_1x1m.json";
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
});

projectInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const text = await file.text();
  const project = JSON.parse(text);

  if (!project.imageDataUrl) {
    alert("Ten projekt nie zawiera obrazu.");
    return;
  }

  const img = new Image();
  img.onload = () => {
    image = img;
    imageDataUrl = project.imageDataUrl;
    imageName = project.imageName || "rzut";
    pxPerMeter = project.pxPerMeter || null;
    calibrationPoints = project.calibrationPoints || [];
    currentPoints = project.currentPoints || [];
    rooms = project.rooms || [];

    if (project.settings) {
      gridSpacingInput.value = project.settings.gridSpacing ?? "1.00";
      gridColorInput.value = project.settings.gridColor ?? "#777777";
      gridOpacityInput.value = project.settings.gridOpacity ?? "0.45";
      gridWidthInput.value = project.settings.gridWidth ?? "1";
      showOutlinesInput.checked = project.settings.showOutlines ?? true;
      gridPerRoomOriginInput.checked = project.settings.gridPerRoomOrigin ?? false;
    }

    emptyState.style.display = "none";
    updateScaleInfo();
    updateRoomsList();
    fitImageToView();
  };
  img.src = project.imageDataUrl;
});

updateRoomsList();
setMode("pan");
