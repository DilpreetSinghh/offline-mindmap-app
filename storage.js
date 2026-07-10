(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.MindMapStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCHEMA_VERSION = 2;
  const BACKUP_FORMAT = "offline-mindmap-backup";

  function result(errors) {
    return { valid: errors.length === 0, errors };
  }

  function validateState(state) {
    const errors = [];
    if (!state || typeof state !== "object" || Array.isArray(state)) {
      return result(["Map state must be an object."]);
    }
    if (!Array.isArray(state.nodes) || !Array.isArray(state.connections)) {
      return result(["Map state must contain node and connection arrays."]);
    }
    if (state.nodes.length === 0) errors.push("Map state must contain at least one node.");

    const ids = new Set();
    for (const node of state.nodes) {
      if (!node || typeof node !== "object") {
        errors.push("Every node must be an object.");
        continue;
      }
      if (typeof node.id !== "string" || !node.id) errors.push("Every node needs a string ID.");
      else if (ids.has(node.id)) errors.push(`Duplicate node ID: ${node.id}`);
      else ids.add(node.id);
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
        errors.push(`Node ${node.id || "(unknown)"} has invalid coordinates.`);
      }
      if (node.parentId !== null && node.parentId !== undefined && typeof node.parentId !== "string") {
        errors.push(`Node ${node.id || "(unknown)"} has an invalid parent ID.`);
      }
    }

    for (const node of state.nodes) {
      if (node && node.parentId && !ids.has(node.parentId)) {
        errors.push(`Node ${node.id} refers to missing parent ${node.parentId}.`);
      }
    }
    for (const connection of state.connections) {
      if (!connection || !ids.has(connection.from) || !ids.has(connection.to)) {
        errors.push("Every connection must refer to two existing nodes.");
      }
    }
    if (!Number.isFinite(state.panX) || !Number.isFinite(state.panY)) {
      errors.push("Map camera position is invalid.");
    }
    if (!Number.isFinite(state.scale) || state.scale <= 0) {
      errors.push("Map camera scale is invalid.");
    }
    return result(errors);
  }

  function validateWorkspace(workspace) {
    const errors = [];
    if (!workspace || typeof workspace !== "object" || Array.isArray(workspace)) {
      return result(["Workspace must be an object."]);
    }
    if (workspace.schemaVersion !== SCHEMA_VERSION) {
      errors.push(`Unsupported workspace schema version: ${workspace.schemaVersion}`);
    }
    if (!Array.isArray(workspace.tabs) || workspace.tabs.length === 0) {
      errors.push("Workspace must contain at least one tab.");
      return result(errors);
    }
    if (
      !Number.isInteger(workspace.activeTabIndex) ||
      workspace.activeTabIndex < 0 ||
      workspace.activeTabIndex >= workspace.tabs.length
    ) {
      errors.push("Workspace active tab index is invalid.");
    }

    for (const tab of workspace.tabs) {
      if (!tab || typeof tab !== "object" || typeof tab.name !== "string") {
        errors.push("Every workspace tab needs a name and state.");
        continue;
      }
      errors.push(...validateState(tab.state).errors.map((error) => `${tab.name}: ${error}`));
    }
    return result(errors);
  }

  function validateMaps(maps) {
    const errors = [];
    if (!Array.isArray(maps)) return result(["Saved maps must be an array."]);
    const ids = new Set();
    for (const map of maps) {
      if (!map || typeof map.id !== "string" || !map.id || typeof map.name !== "string") {
        errors.push("Every saved map needs an ID, name, and state.");
        continue;
      }
      if (ids.has(map.id)) errors.push(`Duplicate saved map ID: ${map.id}`);
      ids.add(map.id);
      errors.push(...validateState(map.data).errors.map((error) => `${map.name}: ${error}`));
    }
    return result(errors);
  }

  function createBackup(maps, workspace, exportedAt) {
    const mapCheck = validateMaps(maps);
    const workspaceCheck = validateWorkspace(workspace);
    if (!mapCheck.valid || !workspaceCheck.valid) {
      throw new Error([...mapCheck.errors, ...workspaceCheck.errors].join("\n"));
    }
    return {
      format: BACKUP_FORMAT,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: exportedAt || new Date().toISOString(),
      maps,
      workspace,
    };
  }

  function migrateBackup(input) {
    if (!input || typeof input !== "object" || input.format !== BACKUP_FORMAT) {
      throw new Error("This is not an Offline Mind Map backup file.");
    }

    let migrated = input;
    if (input.schemaVersion === 1) {
      migrated = {
        format: BACKUP_FORMAT,
        schemaVersion: SCHEMA_VERSION,
        exportedAt: input.exportedAt || null,
        maps: Array.isArray(input.maps) ? input.maps : [],
        workspace: input.workspace || {
          schemaVersion: SCHEMA_VERSION,
          savedAt: input.exportedAt || null,
          activeTabIndex: Number.isInteger(input.activeTabIndex) ? input.activeTabIndex : 0,
          tabs: input.tabs,
        },
      };
    }
    if (migrated.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(`Unsupported backup schema version: ${migrated.schemaVersion}`);
    }
    const mapCheck = validateMaps(migrated.maps);
    const workspaceCheck = validateWorkspace(migrated.workspace);
    if (!mapCheck.valid || !workspaceCheck.valid) {
      throw new Error([...mapCheck.errors, ...workspaceCheck.errors].join("\n"));
    }
    return migrated;
  }

  return {
    BACKUP_FORMAT,
    SCHEMA_VERSION,
    createBackup,
    migrateBackup,
    validateMaps,
    validateState,
    validateWorkspace,
  };
});
