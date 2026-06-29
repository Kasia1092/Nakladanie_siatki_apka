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

let img = null;
let fileName = "rzut";
let drawBox = null;

let scalePoints = [];
let pxPerMeter = null;

let currentRoom = [];
let rooms = [];

let resultDataUrl = null;

const GRID_COLOR = "rgba(115, 115, 115, 0.55)";
const POINT_COLOR = "rgba(180, 60, 30, 0.95)";
const ROOM_COLOR = "rgba(80, 80, 80, 0.9)";
const SCALE_COLOR = "rgba(180, 40, 40, 0.95)";

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

    placeholder.classList.add("hidden");
    previewSection.classList.add("hidden");
    downloadBtn.disabled = true;

    updateStatus("Kliknij dwa punkty do skali.");
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
  if (!img || !drawBox) return;

  const point = getImagePoint(event);
  if (!point) return;

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
  updateStatus("Klikaj kolejne narożniki albo zamknij pokój.");
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
    alert("Wpisz poprawną długość.");
    return;
  }

  const meters = unitInput.value === "cm" ? value / 100 : value;
  const pixelDistance = distance(scalePoints[0], scalePoints[1]);

  pxPerMeter = pixelDistance / meters;
  updateStatus("Skala zapisana. Teraz obrysuj pokoje.");
  draw();
});

clearScaleBtn.addEventListener("click", () => {
  scalePoints = [];
  pxPerMeter = null;
  currentRoom = [];
  rooms = [];
  resultDataUrl = null;
  downloadBtn.disabled = true;
  previewSection.classList.add("hidden");
  updateStatus(img ? "Kliknij dwa punkty do skali." : "Wgraj obraz.");
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
    alert("Pokój musi mieć minimum 3 narożniki.");
    return;
  }

  rooms.push(currentRoom.map(p => ({ x: p.x, y: p.y })));
  currentRoom = [];

  updateStatus("Pokój zapisany. Możesz obrysować kolejny.");
  draw();
});

undoPointBtn.addEventListener("click", () => {
  if (currentRoom.length > 0) {
    currentRoom.pop();
  } else if (pxPerMeter === null && scalePoints.length > 0) {
    scalePoints.pop();
  }

  draw();
  updateStatus();
});

deleteRoomBtn.addEventListener("click", () => {
  rooms.pop();
  draw();
  updateStatus("Usunięto ostatni pokój.");
});

clearAllBtn.addEventListener("click", () => {
  if (!confirm("Wyczyścić skalę, pokoje i podgląd?")) return;

  scalePoints = [];
  pxPerMeter = null;
  currentRoom = [];
  rooms = [];
  resultDataUrl = null;
  downloadBtn.disabled = true;
  previewSection.classList.add("hidden");

  updateStatus(img ? "Kliknij dwa punkty do skali." : "Wgraj obraz.");
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
    alert("Najpierw obrysuj przynajmniej jeden pokój/korytarz.");
    return;
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
  link.download = `${safeName(fileName)}_siatka_1x1m.png`;
  link.click();
});

function draw() {
  const rect = editCanvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (!img) return;

  drawBox = getDrawBox(rect.width, rect.height, img.naturalWidth, img.naturalHeight);

  ctx.drawImage(img, drawBox.x, drawBox.y, drawBox.w, drawBox.h);

  drawSavedRooms();
  drawCurrentRoom();
  drawScaleLine();
}

function getDrawBox(canvasW, canvasH, imageW, imageH) {
  const margin = 12;
  const scale = Math.min(
    (canvasW - margin * 2) / imageW,
    (canvasH - margin * 2) / imageH
  );

  const w = imageW * scale;
  const h = imageH * scale;

  return {
    x: (canvasW - w) / 2,
    y: (canvasH - h) / 2,
    w,
    h,
    scale
  };
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

  for (const room of rooms) {
    const points = room.map(toCanvasPoint);
    drawClosedPath(points);
    ctx.stroke();
  }

  ctx.restore();
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
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function makeResultImage() {
  const out = document.createElement("canvas");
  out.width = img.naturalWidth;
  out.height = img.naturalHeight;

  const outCtx = out.getContext("2d");
  outCtx.drawImage(img, 0, 0);

  for (const room of rooms) {
    drawGridInRoom(outCtx, room);
  }

  return out.toDataURL("image/png");
}

function drawGridInRoom(outCtx, room) {
  const step = pxPerMeter; // 1 m
  const bounds = getBounds(room);

  outCtx.save();

  outCtx.beginPath();
  outCtx.moveTo(room[0].x, room[0].y);
  for (let i = 1; i < room.length; i++) {
    outCtx.lineTo(room[i].x, room[i].y);
  }
  outCtx.closePath();
  outCtx.clip();

  outCtx.strokeStyle = GRID_COLOR;
  outCtx.lineWidth = Math.max(1, img.naturalWidth / 1800);

  const startX = Math.floor(bounds.minX / step) * step;
  const startY = Math.floor(bounds.minY / step) * step;

  for (let x = startX; x <= bounds.maxX + step; x += step) {
    outCtx.beginPath();
    outCtx.moveTo(x, bounds.minY - step);
    outCtx.lineTo(x, bounds.maxY + step);
    outCtx.stroke();
  }

  for (let y = startY; y <= bounds.maxY + step; y += step) {
    outCtx.beginPath();
    outCtx.moveTo(bounds.minX - step, y);
    outCtx.lineTo(bounds.maxX + step, y);
    outCtx.stroke();
  }

  outCtx.restore();
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

  statusRooms.textContent = `Pokoje: ${rooms.length}`;

  if (message) {
    statusMode.textContent = `Teraz: ${message}`;
  } else if (!img) {
    statusMode.textContent = "Teraz: wgraj obraz";
  } else if (pxPerMeter === null) {
    statusMode.textContent = "Teraz: ustaw skalę";
  } else {
    statusMode.textContent = "Teraz: obrysuj pokoje";
  }
}

function safeName(name) {
  return String(name)
    .replace(/\.[^/.]+$/, "")
    .replace(/[^\p{L}\p{N}_-]+/gu, "_");
}

updateStatus();
