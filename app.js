// Simple offline mind-map editor
// All data lives in memory or browser storage. No network requests for user content.

(function () {
  const canvas = document.getElementById("mindmapCanvas");
  const ctx = canvas.getContext("2d");

  const newMapBtn = document.getElementById("newMapBtn");
  const openMapBtn = document.getElementById("openMapBtn");
  const saveMapBtn = document.getElementById("saveMapBtn");
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  const addNodeBtn = document.getElementById("addNodeBtn");
  const deleteNodeBtn = document.getElementById("deleteNodeBtn");
  const autoFitBtn = document.getElementById("autoFitBtn");

  const nodeColorInput = document.getElementById("nodeColorInput");
  const fontSizeInput = document.getElementById("fontSizeInput");
  const connectorStyleSelect = document.getElementById("connectorStyleSelect");
  const layoutModeSelect = document.getElementById("layoutModeSelect");
  const applyLayoutBtn = document.getElementById("applyLayoutBtn");

  const nodeTextInput = document.getElementById("nodeTextInput");
  const updateTextBtn = document.getElementById("updateTextBtn");

  const exportFormatSelect = document.getElementById("exportFormatSelect");
  const qualitySelect = document.getElementById("qualitySelect");
  const sizePresetSelect = document.getElementById("sizePresetSelect");
  const customWidthInput = document.getElementById("customWidthInput");
  const customHeightInput = document.getElementById("customHeightInput");
  const exportBtn = document.getElementById("exportBtn");

  const mapSelect = document.getElementById("mapSelect");

  const STORAGE_KEY = "offline-mindmap-maps-v1";

  let state = {
    nodes: [],
    connections: [],
    selectedNodeId: null,
    panX: 0,
    panY: 0,
    scale: 1,
    connectorStyle: "solid",
    nodeColor: "#1976d2",
    fontSize: 16,
  };

  let history = [];
  let future = [];

  const NODE_RADIUS = 60;

  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    draw();
  }

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  function pushHistory() {
    history.push(JSON.stringify(state));
    if (history.length > 100) history.shift();
    future = [];
  }

  function restoreStateFrom(serialised) {
    state = JSON.parse(serialised);
    draw();
  }

  function undo() {
    if (!history.length) return;
    const current = JSON.stringify(state);
    const previous = history.pop();
    future.push(current);
    restoreStateFrom(previous);
  }

  function redo() {
    if (!future.length) return;
    const current = JSON.stringify(state);
    const next = future.pop();
    history.push(current);
    restoreStateFrom(next);
  }

  function createInitialMap() {
    state.nodes = [
      {
        id: "root",
        text: "Central idea",
        x: 0,
        y: 0,
        color: state.nodeColor,
        fontSize: state.fontSize,
        parentId: null,
      },
    ];
    state.connections = [];
    state.selectedNodeId = "root";
    state.panX = canvas.width / (2 * window.devicePixelRatio);
    state.panY = canvas.height / (2 * window.devicePixelRatio);
    state.scale = 1;
    draw();
  }

  function getNodeById(id) {
    return state.nodes.find((n) => n.id === id) || null;
  }

  function addNode() {
    if (!state.nodes.length) {
      createInitialMap();
    }
    pushHistory();
    const parent = getNodeById(state.selectedNodeId) || state.nodes[0];
    const id = "n" + Date.now();
    const angle = Math.random() * Math.PI * 2;
    const distance = 180;
    const node = {
      id,
      text: "New node",
      x: parent.x + Math.cos(angle) * distance,
      y: parent.y + Math.sin(angle) * distance,
      color: state.nodeColor,
      fontSize: state.fontSize,
      parentId: parent ? parent.id : null,
    };
    state.nodes.push(node);
    if (parent) {
      state.connections.push({ from: parent.id, to: id });
    }
    state.selectedNodeId = id;
    draw();
  }

  function deleteSelectedNode() {
    if (!state.selectedNodeId || state.selectedNodeId === "root") return;
    pushHistory();
    const id = state.selectedNodeId;
    const descendants = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of state.nodes) {
        if (node.parentId && descendants.has(node.parentId) && !descendants.has(node.id)) {
          descendants.add(node.id);
          changed = true;
        }
      }
    }
    state.nodes = state.nodes.filter((n) => !descendants.has(n.id));
    state.connections = state.connections.filter(
      (c) => !descendants.has(c.from) && !descendants.has(c.to)
    );
    state.selectedNodeId = state.nodes.length ? state.nodes[0].id : null;
    draw();
  }

  function draw() {
    const width = canvas.width / window.devicePixelRatio;
    const height = canvas.height / window.devicePixelRatio;

    ctx.save();
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.translate(state.panX, state.panY);
    ctx.scale(state.scale, state.scale);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const c of state.connections) {
      const from = getNodeById(c.from);
      const to = getNodeById(c.to);
      if (!from || !to) continue;
      ctx.beginPath();
      if (state.connectorStyle === "dashed") {
        ctx.setLineDash([8, 6]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = "#9ca3af";
      ctx.lineWidth = 2;
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }

    ctx.setLineDash([]);

    for (const node of state.nodes) {
      const isSelected = node.id === state.selectedNodeId;
      ctx.beginPath();
      const radius = NODE_RADIUS;
      const rx = radius * 1.3;
      const ry = radius * 0.8;
      drawRoundedRect(ctx, node.x - rx, node.y - ry, rx * 2, ry * 2, 14);
      ctx.fillStyle = node.color || state.nodeColor;
      ctx.globalAlpha = isSelected ? 1.0 : 0.9;
      ctx.fill();
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = isSelected ? "#fbbf24" : "#1f2937";
      ctx.lineWidth = isSelected ? 3 : 1.5;
      ctx.stroke();

      ctx.fillStyle = "#f9fafb";
      ctx.font = `${node.fontSize || state.fontSize}px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      wrapText(ctx, node.text, node.x, node.y, rx * 1.6, node.fontSize * 1.2, node.fontSize);
    }

    ctx.restore();
  }

  function drawRoundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, fontSize) {
    const words = (text || "").split(/\s+/);
    const lines = [];
    let current = "";
    for (const w of words) {
      const test = current ? current + " " + w : w;
      const metrics = ctx.measureText(test);
      if (metrics.width > maxWidth && current) {
        lines.push(current);
        current = w;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);

    const totalHeight = lines.length * lineHeight;
    let offsetY = y - totalHeight / 2 + fontSize / 2;
    for (const line of lines) {
      ctx.fillText(line, x, offsetY);
      offsetY += lineHeight;
    }
  }

  function screenToWorld(x, y) {
    const wx = (x - state.panX) / state.scale;
    const wy = (y - state.panY) / state.scale;
    return { x: wx, y: wy };
  }

  function findNodeAt(canvasX, canvasY) {
    const { x, y } = screenToWorld(canvasX, canvasY);
    for (let i = state.nodes.length - 1; i >= 0; i--) {
      const node = state.nodes[i];
      const rx = NODE_RADIUS * 1.3;
      const ry = NODE_RADIUS * 0.8;
      if (
        x >= node.x - rx &&
        x <= node.x + rx &&
        y >= node.y - ry &&
        y <= node.y + ry
      ) {
        return node;
      }
    }
    return null;
  }

  let isPanning = false;
  let isDraggingNode = false;
  let dragNodeId = null;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener("mousedown", (e) => {
    handlePointerDown(e.clientX, e.clientY, e.button);
  });

  canvas.addEventListener("mousemove", (e) => {
    handlePointerMove(e.clientX, e.clientY);
  });

  window.addEventListener("mouseup", () => {
    handlePointerUp();
  });

  canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      handlePointerDown(t.clientX, t.clientY, 0);
    } else if (e.touches.length === 2) {
      pinchStart(e);
    }
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    if (e.touches.length === 1 && !pinch.active) {
      const t = e.touches[0];
      handlePointerMove(t.clientX, t.clientY);
    } else if (e.touches.length === 2) {
      pinchMove(e);
    }
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener("touchend", () => {
    handlePointerUp();
    pinchEnd();
  });

  function handlePointerDown(clientX, clientY, button) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    lastX = x;
    lastY = y;
    const node = findNodeAt(x, y);
    if (node && button === 0) {
      pushHistory();
      isDraggingNode = true;
      dragNodeId = node.id;
      state.selectedNodeId = node.id;
      nodeTextInput.value = node.text || "";
      draw();
    } else {
      isPanning = true;
    }
  }

  function handlePointerMove(clientX, clientY) {
    if (!isPanning && !isDraggingNode) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const dx = x - lastX;
    const dy = y - lastY;
    lastX = x;
    lastY = y;

    if (isDraggingNode && dragNodeId) {
      const node = getNodeById(dragNodeId);
      if (node) {
        const worldDelta = screenToWorld(x, y);
        const worldPrev = screenToWorld(x - dx, y - dy);
        node.x += worldDelta.x - worldPrev.x;
        node.y += worldDelta.y - worldPrev.y;
        draw();
      }
    } else if (isPanning) {
      state.panX += dx;
      state.panY += dy;
      draw();
    }
  }

  function handlePointerUp() {
    isPanning = false;
    isDraggingNode = false;
    dragNodeId = null;
  }

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = -e.deltaY || e.wheelDelta;
    const zoomFactor = delta > 0 ? 1.1 : 0.9;

    const before = screenToWorld(mouseX, mouseY);
    state.scale *= zoomFactor;
    state.scale = Math.max(0.2, Math.min(4, state.scale));
    const after = screenToWorld(mouseX, mouseY);
    state.panX += (after.x - before.x) * state.scale;
    state.panY += (after.y - before.y) * state.scale;
    draw();
  }, { passive: false });

  const pinch = {
    active: false,
    startDist: 0,
    startScale: 1,
  };

  function distance(t1, t2) {
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function pinchStart(e) {
    if (e.touches.length !== 2) return;
    pinch.active = true;
    pinch.startDist = distance(e.touches[0], e.touches[1]);
    pinch.startScale = state.scale;
  }

  function pinchMove(e) {
    if (!pinch.active || e.touches.length !== 2) return;
    const d = distance(e.touches[0], e.touches[1]);
    const factor = d / pinch.startDist;
    state.scale = Math.max(0.2, Math.min(4, pinch.startScale * factor));
    draw();
  }

  function pinchEnd() {
    pinch.active = false;
  }

  function autoFit() {
    if (!state.nodes.length) return;
    const bounds = getContentBounds();
    if (!bounds) return;
    const width = canvas.width / window.devicePixelRatio;
    const height = canvas.height / window.devicePixelRatio;
    const margin = 60;
    const scaleX = (width - margin * 2) / bounds.width;
    const scaleY = (height - margin * 2) / bounds.height;
    const scale = Math.max(0.2, Math.min(2.5, Math.min(scaleX, scaleY)));
    state.scale = scale;
    state.panX = width / 2 - (bounds.x + bounds.width / 2) * scale;
    state.panY = height / 2 - (bounds.y + bounds.height / 2) * scale;
    draw();
  }

  function getContentBounds() {
    if (!state.nodes.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of state.nodes) {
      const rx = NODE_RADIUS * 1.3;
      const ry = NODE_RADIUS * 0.8;
      minX = Math.min(minX, node.x - rx);
      maxX = Math.max(maxX, node.x + rx);
      minY = Math.min(minY, node.y - ry);
      maxY = Math.max(maxY, node.y + ry);
    }
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  function applyLayout(mode) {
    if (!state.nodes.length) return;
    pushHistory();
    const root = state.nodes.find((n) => !n.parentId) || state.nodes[0];
    const children = state.nodes.filter((n) => n.parentId === root.id);
    const others = state.nodes.filter((n) => n.parentId && n.parentId !== root.id);

    const centreX = root.x;
    const centreY = root.y;

    if (mode === "radial") {
      const radius = 260;
      const step = (Math.PI * 2) / Math.max(children.length, 1);
      children.forEach((child, index) => {
        child.x = centreX + Math.cos(step * index) * radius;
        child.y = centreY + Math.sin(step * index) * radius;
      });
    } else if (mode === "tree") {
      const levelGapY = 160;
      const levelGapX = 200;
      root.x = centreX;
      root.y = centreY;
      const rootChildren = children;
      const totalWidth = (rootChildren.length - 1) * levelGapX;
      rootChildren.forEach((child, index) => {
        child.x = centreX - totalWidth / 2 + index * levelGapX;
        child.y = centreY + levelGapY;
      });
    } else if (mode === "flow") {
      const gapX = 220;
      const gapY = 120;
      root.x = centreX;
      root.y = centreY;
      const rootChildren = children;
      const totalHeight = (rootChildren.length - 1) * gapY;
      rootChildren.forEach((child, index) => {
        child.x = centreX + gapX;
        child.y = centreY - totalHeight / 2 + index * gapY;
      });
    }

    others.forEach((node) => {
      const parent = getNodeById(node.parentId);
      if (!parent) return;
      const angle = Math.random() * Math.PI * 2;
      const distance = 140;
      node.x = parent.x + Math.cos(angle) * distance;
      node.y = parent.y + Math.sin(angle) * distance;
    });

    draw();
  }

  function getQualityScale(preset) {
    switch (preset) {
      case "low":
        return 1;
      case "medium":
        return 2;
      case "high":
        return 3;
      case "max":
        return 4;
      default:
        return 2;
    }
  }

  function getQualityFactor(preset) {
    switch (preset) {
      case "low":
        return 0.6;
      case "medium":
        return 0.8;
      case "high":
        return 0.92;
      case "max":
        return 0.98;
      default:
        return 0.8;
    }
  }

  function getSizePixels(preset) {
    const screenWidth = canvas.width / window.devicePixelRatio;
    const screenHeight = canvas.height / window.devicePixelRatio;
    if (preset === "screen") {
      return { width: screenWidth, height: screenHeight };
    }
    const DPI = 96;
    if (preset === "a4") {
      const widthInches = 8.27;
      const heightInches = 11.69;
      return { width: widthInches * DPI, height: heightInches * DPI };
    }
    if (preset === "a3") {
      const widthInches = 11.69;
      const heightInches = 16.54;
      return { width: widthInches * DPI, height: heightInches * DPI };
    }
    let w = parseInt(customWidthInput.value, 10) || 1920;
    let h = parseInt(customHeightInput.value, 10) || 1080;
    w = Math.max(200, Math.min(8000, w));
    h = Math.max(200, Math.min(8000, h));
    return { width: w, height: h };
  }

  function drawToOffscreen(targetCanvas, fitToCanvas) {
    const context = targetCanvas.getContext("2d");
    const width = targetCanvas.width;
    const height = targetCanvas.height;
    const pixelRatio = 1;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);

    let panX = state.panX;
    let panY = state.panY;
    let scale = state.scale;

    if (fitToCanvas) {
      const bounds = getContentBounds();
      if (bounds) {
        const margin = 80;
        const scaleX = (width - margin * 2) / bounds.width;
        const scaleY = (height - margin * 2) / bounds.height;
        scale = Math.min(scaleX, scaleY);
        panX = width / 2 - (bounds.x + bounds.width / 2) * scale;
        panY = height / 2 - (bounds.y + bounds.height / 2) * scale;
      }
    }

    context.translate(panX, panY);
    context.scale(scale, scale);

    context.lineCap = "round";
    context.lineJoin = "round";

    for (const c of state.connections) {
      const from = getNodeById(c.from);
      const to = getNodeById(c.to);
      if (!from || !to) continue;
      context.beginPath();
      if (state.connectorStyle === "dashed") {
        context.setLineDash([8, 6]);
      } else {
        context.setLineDash([]);
      }
      context.strokeStyle = "#9ca3af";
      context.lineWidth = 2;
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    }

    context.setLineDash([]);

    for (const node of state.nodes) {
      const isSelected = node.id === state.selectedNodeId;
      const radius = NODE_RADIUS;
      const rx = radius * 1.3;
      const ry = radius * 0.8;
      drawRoundedRect(context, node.x - rx, node.y - ry, rx * 2, ry * 2, 14);
      context.fillStyle = node.color || state.nodeColor;
      context.globalAlpha = isSelected ? 1.0 : 0.95;
      context.fill();
      context.globalAlpha = 1.0;
      context.strokeStyle = "#1f2937";
      context.lineWidth = 1.5;
      context.stroke();

      context.fillStyle = "#f9fafb";
      const fSize = node.fontSize || state.fontSize;
      context.font = `${fSize}px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      wrapText(context, node.text, node.x, node.y, rx * 1.6, fSize * 1.2, fSize);
    }
  }

  function triggerDownloadFromBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function exportMap() {
    if (!state.nodes.length) return;

    const format = exportFormatSelect.value;
    const qualityPreset = qualitySelect.value;
    const sizePreset = sizePresetSelect.value;

    const qualityScale = getQualityScale(qualityPreset);
    const qualityFactor = getQualityFactor(qualityPreset);
    const sizePx = getSizePixels(sizePreset);

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = sizePx.width * qualityScale;
    exportCanvas.height = sizePx.height * qualityScale;

    drawToOffscreen(exportCanvas, true);

    const filenameBase = "mindmap-export-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

    if (format === "pdf") {
      const imgData = exportCanvas.toDataURL("image/png");
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({
        orientation: sizePx.width >= sizePx.height ? "landscape" : "portrait",
        unit: "pt",
        format: [sizePx.width, sizePx.height],
      });
      pdf.addImage(imgData, "PNG", 0, 0, sizePx.width, sizePx.height);
      const blob = pdf.output("blob");
      triggerDownloadFromBlob(blob, filenameBase + ".pdf");
      return;
    }

    let mimeType = "image/png";
    let ext = "png";
    if (format === "jpeg") {
      mimeType = "image/jpeg";
      ext = "jpg";
    } else if (format === "heif") {
      mimeType = "image/heif";
      ext = "heif";
    }

    exportCanvas.toBlob(
      (blob) => {
        if (!blob) {
          if (format === "heif") {
            exportCanvas.toBlob((fallbackBlob) => {
              if (!fallbackBlob) return;
              triggerDownloadFromBlob(fallbackBlob, filenameBase + ".jpg");
            }, "image/jpeg", qualityFactor);
            return;
          }
          return;
        }
        triggerDownloadFromBlob(blob, `${filenameBase}.${ext}`);
      },
      mimeType,
      qualityFactor
    );
  }

  function loadMapsFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return [];
      return list;
    } catch (e) {
      console.warn("Failed to read stored maps", e);
      return [];
    }
  }

  function saveMapsToStorage(maps) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(maps));
    } catch (e) {
      console.warn("Failed to save maps", e);
    }
  }

  function refreshMapSelect() {
    const maps = loadMapsFromStorage();
    mapSelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Local maps";
    placeholder.disabled = true;
    placeholder.selected = true;
    mapSelect.appendChild(placeholder);
    maps.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.name;
      mapSelect.appendChild(opt);
    });
  }

  function saveCurrentMap() {
    const name = prompt("Save map as (name):", "My mind map");
    if (!name) return;
    const maps = loadMapsFromStorage();
    const id = "map-" + Date.now();
    maps.push({ id, name, data: state });
    saveMapsToStorage(maps);
    refreshMapSelect();
    mapSelect.value = id;
  }

  function openSelectedMap() {
    const id = mapSelect.value;
    if (!id) return;
    const maps = loadMapsFromStorage();
    const match = maps.find((m) => m.id === id);
    if (!match) return;
    pushHistory();
    state = match.data;
    draw();
  }

  function newMap() {
    pushHistory();
    state = {
      nodes: [],
      connections: [],
      selectedNodeId: null,
      panX: canvas.width / (2 * window.devicePixelRatio),
      panY: canvas.height / (2 * window.devicePixelRatio),
      scale: 1,
      connectorStyle: connectorStyleSelect.value,
      nodeColor: nodeColorInput.value,
      fontSize: parseInt(fontSizeInput.value, 10) || 16,
    };
    createInitialMap();
  }

  newMapBtn.addEventListener("click", newMap);
  saveMapBtn.addEventListener("click", saveCurrentMap);
  openMapBtn.addEventListener("click", openSelectedMap);
  undoBtn.addEventListener("click", undo);
  redoBtn.addEventListener("click", redo);
  addNodeBtn.addEventListener("click", addNode);
  deleteNodeBtn.addEventListener("click", deleteSelectedNode);
  autoFitBtn.addEventListener("click", autoFit);

  nodeColorInput.addEventListener("change", () => {
    state.nodeColor = nodeColorInput.value;
    const node = getNodeById(state.selectedNodeId);
    if (node) node.color = state.nodeColor;
    draw();
  });

  fontSizeInput.addEventListener("change", () => {
    const value = parseInt(fontSizeInput.value, 10) || 16;
    state.fontSize = value;
    const node = getNodeById(state.selectedNodeId);
    if (node) node.fontSize = value;
    draw();
  });

  connectorStyleSelect.addEventListener("change", () => {
    state.connectorStyle = connectorStyleSelect.value;
    draw();
  });

  applyLayoutBtn.addEventListener("click", () => {
    applyLayout(layoutModeSelect.value);
  });

  updateTextBtn.addEventListener("click", () => {
    const node = getNodeById(state.selectedNodeId);
    if (!node) return;
    pushHistory();
    node.text = nodeTextInput.value || "";
    draw();
  });

  sizePresetSelect.addEventListener("change", () => {
    const custom = sizePresetSelect.value === "custom";
    customWidthInput.disabled = !custom;
    customHeightInput.disabled = !custom;
  });

  exportBtn.addEventListener("click", exportMap);

  refreshMapSelect();
  createInitialMap();
})();
