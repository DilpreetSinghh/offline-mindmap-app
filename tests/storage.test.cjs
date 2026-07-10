const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BACKUP_FORMAT,
  SCHEMA_VERSION,
  createBackup,
  migrateBackup,
  validateState,
  validateWorkspace,
} = require("../storage.js");

function state(text = "Central idea") {
  return {
    nodes: [{ id: "root", text, x: 0, y: 0, parentId: null }],
    connections: [],
    selectedNodeId: "root",
    panX: 100,
    panY: 100,
    scale: 1,
  };
}

function workspace() {
  return {
    schemaVersion: SCHEMA_VERSION,
    savedAt: "2026-07-11T00:00:00.000Z",
    activeTabIndex: 0,
    tabs: [{ id: null, name: "Untitled 1", state: state() }],
  };
}

test("validates a recovery workspace", () => {
  assert.equal(validateWorkspace(workspace()).valid, true);
});

test("rejects missing parents and invalid connections", () => {
  const invalid = state();
  invalid.nodes[0].parentId = "missing";
  invalid.connections.push({ from: "root", to: "missing" });
  const validation = validateState(invalid);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" "), /missing parent/);
});

test("creates and validates a versioned native backup", () => {
  const backup = createBackup([], workspace(), "2026-07-11T00:00:00.000Z");
  assert.equal(backup.format, BACKUP_FORMAT);
  assert.equal(backup.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(migrateBackup(backup), backup);
});

test("migrates schema version 1 backups", () => {
  const migrated = migrateBackup({
    format: BACKUP_FORMAT,
    schemaVersion: 1,
    maps: [],
    activeTabIndex: 0,
    tabs: workspace().tabs,
  });
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrated.workspace.tabs[0].name, "Untitled 1");
});

test("rejects unsupported and corrupt backups before import", () => {
  assert.throws(() => migrateBackup({ format: BACKUP_FORMAT, schemaVersion: 999 }), /Unsupported/);
  assert.throws(() => migrateBackup({ format: "other", schemaVersion: 2 }), /not an Offline/);
});
