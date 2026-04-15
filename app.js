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

  const nodeBorderColorInput = document.getElementById("nodeBorderColorInput");
  const nodeFillColorInput = document.getElementById("nodeFillColorInput");
  const nodeTextColorInput = document.getElementById("nodeTextColorInput");
  const connectionColorInput = document.getElementById("connectionColorInput");
  const applyNodeStyleToAllBtn = document.getElementById("applyNodeStyleToAllBtn");

  const fontSizeInput = document.getElementById("fontSizeInput");
  const connectorStyleSelect = document.getElementById("connectorStyleSelect");
  const layoutModeSelect = document.getElementById("layoutModeSelect");
  const treeDirectionSelect = document.getElementById("treeDirectionSelect");
  const autoLayoutToggle = document.getElementById("autoLayoutToggle");
  const autoLayoutIntervalInput = document.getElementById("autoLayoutIntervalInput");
  const applyLayoutBtn = document.getElementById("applyLayoutBtn");

  const exportFormatSelect = document.getElementById("exportFormatSelect");
  const qualitySelect = document.getElementById("qualitySelect");
  const sizePresetSelect = document.getElementById("sizePresetSelect");
  const customWidthInput = document.getElementById("customWidthInput");
  const customHeightInput = document.getElementById("customHeightInput");
  const exportBtn = document.getElementById("exportBtn");

  const mapSelect = document.getElementById("mapSelect");
  const tabBar = document.getElementById("tabBar");

  const STORAGE_KEY = "offline-mindmap-maps-v1";

  // Tabs: each tab keeps its own state object and optional storage id
  let tabs = [];
  let activeTabIndex = -1;

  // Editing state for currently active tab
  let state = {
    nodes: [],
    connections: [],
    selectedNodeId: null,
    panX: 0,
    panY: 0,
    scale: 1,
    connectorStyle: "solid",
    nodeBorderColor: "#e5e7eb",
    nodeFillColor: "#facc15",
    nodeTextColor: "#111827",
    connectionColor: "#9ca3af",
    fontSize: 16,
    treeDirection: "top-down",
  };

  // Undo history shared per tab (cleared when switching tabs)
  let history = [];
  let future = [];

  const NODE_RADIUS = 60;
  const HANDLE_SIZE = 26;
  const HANDLE_GAP = 16;

  // Inline editor state
  let inlineEditor = null;
  let editingNodeId = null;

  // Hover state for Freeform-style handles
  let hoverNodeId = null;
  let hoverHandleDirection = null;
  let showHandles = true;

  // Auto-layout
  let autoLayoutTimer = null;
  let autoLayoutEnabled = true;
  let autoLayoutIntervalSec = 10;

  // Draw scheduling to avoid lag on hover
  let needsDraw = false;
  function scheduleDraw() {
    if (needsDraw) return;
    needsDraw = true;
    requestAnimationFrame(() => {
      needsDraw = false;
      draw();
    });
  }

  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    scheduleDraw();
  }

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  function getActiveTab() {
    if (activeTabIndex < 0 || activeTabIndex >= tabs.length) return null;
    return tabs[activeTabIndex];
  }

  function pushHistory() {
    const tab = getActiveTab();
    if (!tab) return;
    history.push(JSON.stringify(state));
    if (history.length > 100) history.shift();
    future = [];
  }

  function restoreStateFrom(serialised) {
    state = JSON.parse(serialised);
    const tab = getActiveTab();
    if (tab) tab.state = state;
    syncInputsFromState();
    scheduleDraw();
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
        fillColor: state.nodeFillColor,
        borderColor: state.nodeBorderColor,
        textColor: state.nodeTextColor,
        fontSize: state.fontSize,
        parentId: null,
      },
    ];
    state.connections = [];
    state.selectedNodeId = "root";
    state.panX = canvas.width / (2 * window.devicePixelRatio);
    state.panY = canvas.height / (2 * window.devicePixelRatio);
    state.scale = 1;
    syncInputsFromState();
    scheduleDraw();
    setTimeout(() => {
      const rootNode = getNodeById("root");
      if (rootNode) {
        openInlineEditor(rootNode);
      }
    }, 0);
  }

  function getNodeById(id) {
    return state.nodes.find((n) => n.id === id) || null;
  }

  // Tabs ------------------------------------------------------------------

  function syncInputsFromState() {
    nodeBorderColorInput.value = state.nodeBorderColor || "#e5e7eb";
    nodeFillColorInput.value = state.nodeFillColor || "#facc15";
    nodeTextColorInput.value = state.nodeTextColor || "#111827";
    connectionColorInput.value = state.connectionColor || "#9ca3af";
    fontSizeInput.value = state.fontSize || 16;
    treeDirectionSelect.value = state.treeDirection || "top-down";
  }

  function refreshTabBar() {
    tabBar.innerHTML = "";
    tabs.forEach((tab, index) => {
      const btn = document.createElement("button");
      btn.className = "tab" + (index === activeTabIndex ? " active" : "");
      const title = document.createElement("span");
      title.textContent = tab.name || "Untitled";
      btn.appendChild(title);
      if (tabs.length > 1) {
        const close = document.createElement("span");
        close.textContent = "×";
        close.className = "tab-close";
        close.addEventListener("click", (e) => {
          e.stopPropagation();
          closeTab(index);
        });
        btn.appendChild(close);
      }
      btn.addEventListener("click", () => {
        if (index !== activeTabIndex) {
          setActiveTab(index);
        }
      });
      tabBar.appendChild(btn);
    });
  }

  function resetAutoLayoutTimer() {
    if (autoLayoutTimer) {
      clearInterval(autoLayoutTimer);
      autoLayoutTimer = null;
    }
    if (!autoLayoutEnabled || !state.nodes.length) return;
    const ms = Math.max(1, autoLayoutIntervalSec) * 1000;
    autoLayoutTimer = setInterval(() => {
      if (!state.nodes.length) return;
      applyLayout(layoutModeSelect.value);
    }, ms);
  }

  function setActiveTab(index) {
    if (index < 0 || index >= tabs.length) return;
    activeTabIndex = index;
    const tab = tabs[index];
    state = tab.state;
    history = [];
    future = [];
    syncInputsFromState();
    refreshTabBar();
    resetAutoLayoutTimer();
    scheduleDraw();
  }

  function closeTab(index) {
    if (index < 0 || index >= tabs.length) return;
    tabs.splice(index, 1);
    if (!tabs.length) {
      createNewTab("Untitled 1", null);
      return;
    }
    if (activeTabIndex >= tabs.length) {
      activeTabIndex = tabs.length - 1;
    }
    const tab = tabs[activeTabIndex];
    state = tab.state;
    history = [];
    future = [];
    syncInputsFromState();
    refreshTabBar();
    resetAutoLayoutTimer();
    scheduleDraw();
  }

  function createNewTab(name, id) {
    state = {
      nodes: [],
      connections: [],
      selectedNodeId: null,
      panX: canvas.width / (2 * window.devicePixelRatio),
      panY: canvas.height / (2 * window.devicePixelRatio),
      scale: 1,
      connectorStyle: connectorStyleSelect.value,
      nodeBorderColor: nodeBorderColorInput.value,
      nodeFillColor: nodeFillColorInput.value,
      nodeTextColor: nodeTextColorInput.value,
      connectionColor: connectionColorInput.value,
      fontSize: parseInt(fontSizeInput.value, 10) || 16,
      treeDirection: treeDirectionSelect.value,
    };
    createInitialMap();
    const tab = { id: id || null, name: name || "Untitled", state };
    tabs.push(tab);
    activeTabIndex = tabs.length - 1;
    refreshTabBar();
    resetAutoLayoutTimer();
  }

  // Handles & drawing -----------------------------------------------------
  // (rest of file unchanged)
