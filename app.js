// Offline mind-map editor with Miro/Freeform-inspired design and interactions
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
    nodeColor: "#facc15", // soft sticky-note yellow
    fontSize: 16,
  };

  let history = [];
  let future = [];

  const NODE_RADIUS = 60;
  const HANDLE_SIZE = 22;
  const HANDLE_GAP = 12;

  // Inline editor state
  let inlineEditor = null;
  let editingNodeId = null;

  // Hover state for Freeform-style handles
  let hoverNodeId = null;

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

  function getHandleCenters(node) {
    const radius = NODE_RADIUS;
    const rx = radius * 1.3;
    const ry = radius * 0.8;
    return {
      top: { x: node.x, y: node.y - ry - HANDLE_GAP },
      bottom: { x: node.x, y: node.y + ry + HANDLE_GAP },
      left: { x: node.x - rx - HANDLE_GAP, y: node.y },
      right: { x: node.x + rx + HANDLE_GAP, y: node.y },
    };
  }

  function getHandleDirectionAt(node, wx, wy) {
    const centres = getHandleCenters(node);
    const half = HANDLE_SIZE / 2;
    for (const dir of ["top", "right", "bottom", "left"]) {
      const c = centres[dir];
      if (Math.abs(wx - c.x) <= half && Math.abs(wy - c.y) <= half) {
        return dir;
      }
    }
    return null;
  }

  function findHandleAt(worldX, worldY) {
    let candidate = hoverNodeId ? getNodeById(hoverNodeId) : null;
    if (!candidate && state.selectedNodeId) {
      candidate = getNodeById(state.selectedNodeId);
    }
    if (!candidate) return null;
    const dir = getHandleDirectionAt(candidate, worldX, worldY);
    if (!dir) return null;
    return { node: candidate, direction: dir };
  }

  function addChildNode(parent, direction) {
    if (!parent) parent = state.nodes[0];
    if (!parent) return;
    pushHistory();

    const id = "n" + Date.now();
    const distance = 220;
    let x;
    let y;

    if (direction === "right") {
      x = parent.x + distance;
      y = parent.y;
    } else if (direction === "left") {
      x = parent.x - distance;
      y = parent.y;
    } else if (direction === "top") {
      x = parent.x;
      y = parent.y - distance;
    } else if (direction === "bottom") {
      x = parent.x;
      y = parent.y + distance;
    } else {
      const angle = Math.random() * Math.PI * 2;
      const radialDistance = 180;
      x = parent.x + Math.cos(angle) * radialDistance;
      y = parent.y + Math.sin(angle) * radialDistance;
    }

    const node = {
      id,
      text: "",
      x,
      y,
      color: state.nodeColor,
      fontSize: state.fontSize,
      parentId: parent.id,
    };
    state.nodes.push(node);
    state.connections.push({ from: parent.id, to: id });
    state.selectedNodeId = id;
    nodeTextInput.value = node.text;
    draw();
    openInlineEditor(node);
  }

  function addSiblingNode(node) {
    if (!node) return;
    const parent = node.parentId ? getNodeById(node.parentId) : null;
    const base = parent || node;
    pushHistory();
    const id = "n" + Date.now();
    const offsetY = 140;
    const newNode = {
      id,
      text: "",
      x: base.x,
      y: node.y + offsetY,
      color: state.nodeColor,
      fontSize: state.fontSize,
      parentId: parent ? parent.id : node.parentId,
    };
    state.nodes.push(newNode);
    if (parent) {
      state.connections.push({ from: parent.id, to: id });
    }
    state.selectedNodeId = id;
    nodeTextInput.value = newNode.text;
    draw();
    openInlineEditor(newNode);
  }

  function addNode() {
    if (!state.nodes.length) {
      createInitialMap();
    }
    const parent = getNodeById(state.selectedNodeId) || state.nodes[0];
    addChildNode(parent);
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
    nodeTextInput.value = state.selectedNodeId ? getNodeById(state.selectedNodeId).text : "";
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

    // Connections
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

    // Nodes (Miro/Freeform-like sticky notes)
    for (const node of state.nodes) {
      const isSelected = node.id === state.selectedNodeId;
      const isHovered = node.id === hoverNodeId;
      ctx.save();
      const radius = NODE_RADIUS;
      const rx = radius * 1.3;
      const ry = radius * 0.8;

      // Drop shadow
      ctx.fillStyle = "rgba(15,23,42,0.08)";
      drawRoundedRect(ctx, node.x - rx + 4, node.y - ry + 6, rx * 2, ry * 2, 14);
      ctx.fill();

      // Card
      drawRoundedRect(ctx, node.x - rx, node.y - ry, rx * 2, ry * 2, 14);
      ctx.fillStyle = node.color || state.nodeColor;
      ctx.globalAlpha = 0.96;
      ctx.fill();
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = isSelected ? "#2563eb" : "#e5e7eb";
      ctx.lineWidth = isSelected ? 3 : 1.5;
      ctx.stroke();

      // Text
      ctx.fillStyle = "#111827";
      const fSize = node.fontSize || state.fontSize;
      ctx.font = `${fSize}px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      const textPaddingX = 14;
      const textPaddingY = 10;
      wrapText(
        ctx,
        node.text,
        node.x - rx + textPaddingX,
        node.y - ry + textPaddingY,
        rx * 2 - textPaddingX * 2,
        fSize * 1.2,
        fSize
      );

      // Freeform-style connection handles when hovered or selected
      if (isHovered || isSelected) {
        drawHandles(ctx, node);
      }

      ctx.restore();
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

  function drawHandles(ctx, node) {
    const centres = getHandleCenters(node);
    for (const dir of ["top", "right", "bottom", "left"]) {
      const c = centres[dir];
      drawArrowHandle(ctx, c.x, c.y, dir);
    }
  }

  function drawArrowHandle(ctx, cx, cy, direction) {
    const size = HANDLE_SIZE;
    ctx.save();
    ctx.beginPath();
    if (direction === "right") {
      ctx.moveTo(cx - size / 2, cy - size / 2);
      ctx.lineTo(cx + size / 2, cy);
      ctx.lineTo(cx - size / 2, cy + size / 2);
    } else if (direction === "left") {
      ctx.moveTo(cx + size / 2, cy - size / 2);
      ctx.lineTo(cx - size / 2, cy);
      ctx.lineTo(cx + size / 2, cy + size / 2);
    } else if (direction === "top") {
      ctx.moveTo(cx - size / 2, cy + size / 2);
      ctx.lineTo(cx, cy - size / 2);
      ctx.lineTo(cx + size / 2, cy + size / 2);
    } else if (direction === "bottom") {
      ctx.moveTo(cx - size / 2, cy - size / 2);
      ctx.lineTo(cx, cy + size / 2);
      ctx.lineTo(cx + size / 2, cy - size / 2);
    }
    ctx.closePath();
    ctx.fillStyle = "#2563eb";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#1d4ed8";
    ctx.stroke();
    ctx.restore();
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
    let offsetY = y;
    if (totalHeight < NODE_RADIUS * 1.6 - fontSize) {
      offsetY = y + (NODE_RADIUS * 1.6 - totalHeight) / 2 - fontSize;
    }
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

  function worldToScreen(x, y) {
    const sx = x * state.scale + state.panX;
    const sy = y * state.scale + state.panY;
    return { x: sx, y: sy };
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

  // Pointer interactions
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

  canvas.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        handlePointerDown(t.clientX, t.clientY, 0);
      } else if (e.touches.length === 2) {
        pinchStart(e);
      }
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length === 1 && !pinch.active) {
        const t = e.touches[0];
        handlePointerMove(t.clientX, t.clientY);
      } else if (e.touches.length === 2) {
        pinchMove(e);
      }
      e.preventDefault();
    },
    { passive: false }
  );

  canvas.addEventListener("touchend", () => {
    handlePointerUp();
    pinchEnd();
  });

  function handlePointerDown(clientX, clientY, button) {
    closeInlineEditor(true);
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    lastX = x;
    lastY = y;

    const world = screenToWorld(x, y);
    // Check if clicking on a Freeform-style handle first
    const handle = findHandleAt(world.x, world.y);
    if (handle && button === 0) {
      addChildNode(handle.node, handle.direction);
      return;
    }

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
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Update hover state for handles, keeping them visible when hovering node or handles
    const world = screenToWorld(x, y);
    let nodeForHover = findNodeAt(x, y);
    if (!nodeForHover && hoverNodeId) {
      const existing = getNodeById(hoverNodeId);
      if (existing && getHandleDirectionAt(existing, world.x, world.y)) {
        nodeForHover = existing;
      }
    }
    const newHoverId = nodeForHover ? nodeForHover.id : null;
    if (newHoverId !== hoverNodeId) {
      hoverNodeId = newHoverId;
      draw();
    }

    if (!isPanning && !isDraggingNode) {
      lastX = x;
      lastY = y;
      return;
    }

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

  // Inline editing on double-click
  canvas.addEventListener("dblclick", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const node = findNodeAt(x, y);
    if (!node) return;
    state.selectedNodeId = node.id;
    openInlineEditor(node);
  });

  function openInlineEditor(node) {
    closeInlineEditor(false);
    const { x, y } = worldToScreen(node.x, node.y);
    const radius = NODE_RADIUS;
    const rectWidth = radius * 2.6;
    const rectHeight = radius * 1.6;

    const editor = document.createElement("textarea");
    editor.className = "inline-node-editor";
    editor.value = node.text || "";
    const canvasRect = canvas.getBoundingClientRect();
    editor.style.left = `${canvasRect.left + x - rectWidth / 2}px`;
    editor.style.top = `${canvasRect.top + y - rectHeight / 2}px`;
    editor.style.width = `${rectWidth}px`;
    editor.style.height = `${rectHeight}px`;

    document.body.appendChild(editor);
    editor.focus();
    editor.select();

    inlineEditor = editor;
    editingNodeId = node.id;

    editor.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        closeInlineEditor(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeInlineEditor(false);
      }
    });

    editor.addEventListener("blur", () => {
      if (inlineEditor) {
        closeInlineEditor(true);
      }
    });
  }

  function closeInlineEditor(applyChanges) {
    if (!inlineEditor) return;
    const node = getNodeById(editingNodeId);
    if (applyChanges && node) {
      pushHistory();
      node.text = inlineEditor.value || "";
      nodeTextInput.value = node.text;
      draw();
    }
    inlineEditor.remove();
    inlineEditor = null;
    editingNodeId = null;
  }

  // Zoom
  canvas.addEventListener(
    "wheel",
    (e) => {
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
    },
    { passive: false }
  );

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
      const levelGapX = 220;
      root.x = centreX;
      root.y = centreY;
      const rootChildren = children;
      const totalWidth = (rootChildren.length - 1) * levelGapX;
      rootChildren.forEach((child, index) => {
        child.x = centreX - totalWidth / 2 + index * levelGapX;
        child.y = centreY + levelGapY;
      });
    } else if (mode === "flow") {
      const gapX = 260;
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

    // Simple placement for deeper descendants
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

      context.save();
      // Shadow
      context.fillStyle = "rgba(15,23,42,0.08)";
      drawRoundedRect(context, node.x - rx + 4, node.y - ry + 6, rx * 2, ry * 2, 14);
      context.fill();

      // Card
      drawRoundedRect(context, node.x - rx, node.y - ry, rx * 2, ry * 2, 14);
      context.fillStyle = node.color || state.nodeColor;
      context.globalAlpha = 0.96;
      context.fill();
      context.globalAlpha = 1.0;
      context.strokeStyle = isSelected ? "#2563eb" : "#e5e7eb";
      context.lineWidth = isSelected ? 3 : 1.5;
      context.stroke();

      // Text
      context.fillStyle = "#111827";
      const fSize = node.fontSize || state.fontSize;
      context.font = `${fSize}px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
      context.textAlign = "left";
      context.textBaseline = "top";
      const textPaddingX = 14;
      const textPaddingY = 10;
      wrapText(
        context,
        node.text,
        node.x - rx + textPaddingX,
        node.y - ry + textPaddingY,
        rx * 2 - textPaddingX * 2,
        fSize * 1.2,
        fSize
      );
      context.restore();
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

    // Compute export canvas size with a cap so huge maps don't blow up memory
    let targetWidth = sizePx.width * qualityScale;
    let targetHeight = sizePx.height * qualityScale;
    const maxDim = 10000;
    const maxCurrentDim = Math.max(targetWidth, targetHeight);
    if (maxCurrentDim > maxDim) {
      const ratio = maxDim / maxCurrentDim;
      targetWidth = Math.round(targetWidth * ratio);
      targetHeight = Math.round(targetHeight * ratio);
    }

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = targetWidth;
    exportCanvas.height = targetHeight;

    drawToOffscreen(exportCanvas, true);

    const filenameBase = "mindmap-export-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

    if (format === "pdf") {
      if (!window.PDFLib || !PDFLib.PDFDocument) {
        alert("PDF library failed to load. Please check your network connection and try again.");
        return;
      }
      const { PDFDocument } = PDFLib;
      const pngDataUrl = exportCanvas.toDataURL("image/png");
      const pdfDoc = await PDFDocument.create();
      const pngImage = await pdfDoc.embedPng(pngDataUrl);
      const pngDims = pngImage.scale(1);

      const page = pdfDoc.addPage([sizePx.width, sizePx.height]);
      const pageWidth = page.getWidth();
      const pageHeight = page.getHeight();

      const scale = Math.min(pageWidth / pngDims.width, pageHeight / pngDims.height);
      const imgWidth = pngDims.width * scale;
      const imgHeight = pngDims.height * scale;
      const x = (pageWidth - imgWidth) / 2;
      const y = (pageHeight - imgHeight) / 2;

      page.drawImage(pngImage, { x, y, width: imgWidth, height: imgHeight });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
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
    nodeTextInput.value = state.selectedNodeId ? getNodeById(state.selectedNodeId)?.text || "" : "";
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

  // Keyboard shortcuts (Miro-like): Enter = sibling, Tab = child, Delete = delete node
  document.addEventListener("keydown", (e) => {
    if (inlineEditor) return; // let editor handle keys
    const node = getNodeById(state.selectedNodeId);
    if (!node) return;
    if (e.key === "Tab") {
      e.preventDefault();
      addChildNode(node);
    } else if (e.key === "Enter") {
      e.preventDefault();
      addSiblingNode(node);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteSelectedNode();
    } else if (e.key === "Escape") {
      state.selectedNodeId = null;
      nodeTextInput.value = "";
      draw();
    }
  });

  refreshMapSelect();
  createInitialMap();
})();
