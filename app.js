const editCanvas = document.getElementById("editCanvas");
const ctx = editCanvas.getContext("2d");

const fileInput = document.getElementById("fileInput");
const lengthInput = document.getElementById("lengthInput");
const unitInput = document.getElementById("unitInput");

const gridWidthSizeInput = document.getElementById("gridWidthSizeInput");
const gridWidthUnitInput = document.getElementById("gridWidthUnitInput");
const gridHeightSizeInput = document.getElementById("gridHeightSizeInput");
const gridHeightUnitInput = document.getElementById("gridHeightUnitInput");
const gridColorInput = document.getElementById("gridColorInput");
const gridLineWidthInput = document.getElementById("gridLineWidthInput");
const gridOpacityInput = document.getElementById("gridOpacityInput");

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
const statusGrid = document.getElementById("statusGrid");
const statusRooms = document.getElementById("statusRooms");
const statusMode = document.getElementById("statusMode");

const placeholder = document.getElementById("placeholder");
const previewSection = document.getElementById("previewSection");
const previewImage = document.getElementById("previewImage");

const roomSettings = document.getElementById("roomSettings");
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

const POINT_COLOR = "rgba(180, 60, 30, 0.95)";
const ROOM_COLOR = "rgba(80, 80, 80, 0.9)";
const SCALE_COLOR = "rgba(180, 40, 40, 0.95)";
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
  updateStatus("Klikaj kolejne narożniki pomieszczenia.");
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
  updateStatus("Skala zapisana. Teraz zaznaczaj pomieszczenia.");
  draw();
});

clearScaleBtn.addEventListener("click", () => {
  scalePoints = [];
  pxPerMeter = null;
  currentRoom = [];
  rooms = [];
  manualCenterRoomIndex = null;
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
    alert("Pomieszczenie musi mieć minimum 3 narożniki.");
    return;
  }

  rooms.push(createRoom(currentRoom));
  currentRoom = [];
  manualCenterRoomIndex = null;

  clearResult();
  updateRoomsPanel();
  updateStatus("Pomieszczenie zapisane. Możesz zaznaczyć kolejne.");
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
  clearResult();
  updateRoomsPanel();
  draw();
  updateStatus("Usunięto ostatnie pomieszczenie.");
});

clearAllBtn.addEventListener("click", () => {
  if (!confirm("Wyczyścić skalę, pomieszczenia i podgląd?")) return;

  scalePoints = [];
  pxPerMeter = null;
  currentRoom = [];
  rooms = [];
  manualCenterRoomIndex = null;

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
    alert("Najpierw zaznacz przynajmniej jedno pomieszczenie.");
    return;
  }

  const grid = getGridSettings();
  if (!grid) {
    alert("Wpisz poprawny wymiar siatki.");
    return;
  }

  resultDataUrl = makeResultImage(grid);
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

[
  gridWidthSizeInput,
  gridWidthUnitInput,
  gridHeightSizeInput,
  gridHeightUnitInput,
  gridColorInput,
  gridLineWidthInput,
  gridOpacityInput
].forEach(element => {
  element.addEventListener("input", () => {
    clearResult();
    updateStatus();
    updateRoomsPanel();
  });
  element.addEventListener("change", () => {
    clearResult();
    updateStatus();
    updateRoomsPanel();
  });
});

function createRoom(points) {
  return {
    points: points.map(p => ({ x: p.x, y: p.y })),
    gridOriginMode: "center",
    manualCenter: null,
    labels: {
      enabled: false,
      prefix: "P",
      start: 1,
      end: "",
      color: "#111111",
      opacity: 0.9,
      size: 22,
      bold: true,
      position: "center"
    }
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

  drawSavedRooms();
  drawRoomCenters();
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

  ctx.save();
  ctx.fillStyle = CENTER_COLOR;
  ctx.strokeStyle = "white";
  ctx.lineWidth = 2;

  rooms.forEach((room) => {
    const origin = getRoomGridOrigin(room);
    const pt = toCanvasPoint(origin);

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pt.x - 10, pt.y);
    ctx.lineTo(pt.x + 10, pt.y);
    ctx.moveTo(pt.x, pt.y - 10);
    ctx.lineTo(pt.x, pt.y + 10);
    ctx.stroke();
  });

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

function updateRoomsPanel() {
  roomsPanel.innerHTML = "";
  roomSettings.classList.toggle("hidden", rooms.length === 0);

  rooms.forEach((room, index) => {
    const card = document.createElement("div");
    card.className = "roomCard";

    const countText = getEstimatedLabelCount(room);

    card.innerHTML = `
      <h3>Pomieszczenie ${index + 1}</h3>
      <p class="small">${countText}</p>

      <div class="roomGrid">
        <label class="full miniLabel">Ustawienie siatki w tym pomieszczeniu</label>
        <button class="light full" data-action="autoCenter">Wyśrodkuj siatkę automatycznie</button>
        <button class="light full" data-action="manualCenter">Ustaw środek kratki ręcznie</button>
        ${manualCenterRoomIndex === index ? '<div class="manualNotice full">Kliknij na obrazie punkt, który ma być środkiem kratki w tym pomieszczeniu.</div>' : ''}

        <label class="checkRow full">
          <input type="checkbox" data-field="enabled" ${room.labels.enabled ? "checked" : ""}>
          numeruj kratki w tym pomieszczeniu
        </label>

        <label class="miniLabel">Litera / prefix</label>
        <label class="miniLabel">Numer od</label>
        <input type="text" data-field="prefix" value="${escapeHtml(room.labels.prefix)}">
        <input type="number" data-field="start" min="0" step="1" value="${room.labels.start}">

        <label class="miniLabel">Numer do</label>
        <label class="miniLabel">Pozycja w kratce</label>
        <input type="number" data-field="end" min="0" step="1" placeholder="auto" value="${escapeHtml(room.labels.end)}">
        <select data-field="position">
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

        <label class="miniLabel">Rozmiar liter</label>
        <label class="miniLabel">Kolor liter</label>
        <input type="number" data-field="size" min="6" max="200" step="1" value="${room.labels.size}">
        <input type="color" data-field="color" value="${room.labels.color}">

        <label class="miniLabel">Transparentność liter</label>
        <label class="miniLabel">Pogrubienie</label>
        <input type="range" data-field="opacity" min="0.1" max="1" step="0.05" value="${room.labels.opacity}">
        <label class="checkRow">
          <input type="checkbox" data-field="bold" ${room.labels.bold ? "checked" : ""}>
          pogrub
        </label>
      </div>
    `;

    card.querySelector('[data-action="autoCenter"]').addEventListener("click", () => {
      room.gridOriginMode = "center";
      room.manualCenter = null;
      manualCenterRoomIndex = null;
      clearResult();
      updateRoomsPanel();
      updateStatus(`Pomieszczenie ${index + 1}: siatka wyśrodkowana automatycznie.`);
      draw();
    });

    card.querySelector('[data-action="manualCenter"]').addEventListener("click", () => {
      manualCenterRoomIndex = index;
      updateRoomsPanel();
      updateStatus(`Kliknij na obrazie środek kratki dla pomieszczenia ${index + 1}.`);
      draw();
    });

    card.querySelectorAll("input, select").forEach(input => {
      input.addEventListener("input", () => {
        updateRoomFromInput(room, input);
        clearResult();
        updateStatus();
      });

      input.addEventListener("change", () => {
        updateRoomFromInput(room, input);
        clearResult();
        updateStatus();
      });
    });

    roomsPanel.appendChild(card);
  });
}

function selected(current, value) {
  return current === value ? "selected" : "";
}

function updateRoomFromInput(room, input) {
  const field = input.dataset.field;

  if (field === "enabled") room.labels.enabled = input.checked;
  if (field === "prefix") room.labels.prefix = input.value;
  if (field === "start") room.labels.start = Number(input.value) || 0;
  if (field === "end") room.labels.end = input.value;
  if (field === "position") room.labels.position = input.value;
  if (field === "size") room.labels.size = Number(input.value) || 22;
  if (field === "color") room.labels.color = input.value || "#111111";
  if (field === "opacity") room.labels.opacity = Number(input.value) || 0.9;
  if (field === "bold") room.labels.bold = input.checked;
}

function getEstimatedLabelCount(room) {
  const grid = getGridSettings();
  if (!grid || !pxPerMeter) return "Kratki do numeracji: po ustawieniu skali.";
  const cells = getRoomCells(room, grid);
  return `Kratki do numeracji: ${cells.length}`;
}

function getGridSettings() {
  const widthValue = Number(gridWidthSizeInput.value);
  const heightValue = Number(gridHeightSizeInput.value);
  const lineWidth = Number(gridLineWidthInput.value);
  const opacity = Number(gridOpacityInput.value);

  if (!Number.isFinite(widthValue) || widthValue <= 0) return null;
  if (!Number.isFinite(heightValue) || heightValue <= 0) return null;

  return {
    widthMeters: gridWidthUnitInput.value === "cm" ? widthValue / 100 : widthValue,
    heightMeters: gridHeightUnitInput.value === "cm" ? heightValue / 100 : heightValue,
    color: gridColorInput.value || "#777777",
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

function makeResultImage(grid) {
  const out = document.createElement("canvas");
  out.width = img.naturalWidth;
  out.height = img.naturalHeight;

  const outCtx = out.getContext("2d");
  outCtx.drawImage(img, 0, 0);

  for (const room of rooms) {
    drawGridInRoom(outCtx, room, grid);
  }

  for (const room of rooms) {
    if (room.labels.enabled) {
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
  const cells = getRoomCells(room, grid);
  const labels = room.labels;

  const start = Number(labels.start) || 0;
  const end = labels.end === "" ? Infinity : Number(labels.end);

  const color = hexToRgba(labels.color, labels.opacity);
  const fontSize = Math.max(6, Number(labels.size) || 22);
  const fontWeight = labels.bold ? "bold" : "normal";

  outCtx.save();
  pathRoom(outCtx, room.points);
  outCtx.clip();

  outCtx.fillStyle = color;
  outCtx.font = `${fontWeight} ${fontSize}px Arial`;
  outCtx.textAlign = "center";
  outCtx.textBaseline = "middle";

  let number = start;

  for (const cell of cells) {
    if (number > end) break;

    const labelPoint = getLabelPointInCell(cell, grid, labels.position);

    outCtx.textAlign = labelPoint.align;
    outCtx.textBaseline = labelPoint.baseline;
    outCtx.fillText(`${labels.prefix}${number}`, labelPoint.x, labelPoint.y);

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

  for (let y = firstCenterY; y <= bounds.maxY + stepY; y += stepY) {
    for (let x = firstCenterX; x <= bounds.maxX + stepX; x += stepX) {
      if (pointInPolygon({ x, y }, room.points)) {
        cells.push({ x, y, stepX, stepY });
      }
    }
  }

  cells.sort((a, b) => {
    if (Math.abs(a.y - b.y) > stepY / 3) return a.y - b.y;
    return a.x - b.x;
  });

  return cells;
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

  statusGrid.textContent =
    `Siatka: ${gridWidthSizeInput.value || "?"} ${gridWidthUnitInput.value} × ${gridHeightSizeInput.value || "?"} ${gridHeightUnitInput.value}`;

  statusRooms.textContent = `Pomieszczenia: ${rooms.length}`;

  if (message) {
    statusMode.textContent = `Teraz: ${message}`;
  } else if (!img) {
    statusMode.textContent = "Teraz: wgraj zdjęcie";
  } else if (pxPerMeter === null) {
    statusMode.textContent = "Teraz: ustaw skalę";
  } else if (manualCenterRoomIndex !== null) {
    statusMode.textContent = `Teraz: kliknij środek kratki dla pomieszczenia ${manualCenterRoomIndex + 1}`;
  } else {
    statusMode.textContent = "Teraz: zaznacz pomieszczenia";
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
