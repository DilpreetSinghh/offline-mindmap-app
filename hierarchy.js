(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MindMapHierarchy = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function parentKey(parentId) {
    return parentId === undefined ? null : parentId;
  }

  function getChildren(nodes, parentId) {
    const expectedParent = parentKey(parentId);
    return nodes
      .map((node, index) => ({ node, index }))
      .filter(({ node }) => parentKey(node.parentId) === expectedParent)
      .sort((a, b) => {
        const aOrder = Number.isFinite(a.node.order) ? a.node.order : a.index;
        const bOrder = Number.isFinite(b.node.order) ? b.node.order : b.index;
        return aOrder - bOrder || a.index - b.index;
      })
      .map(({ node }) => node);
  }

  function normaliseSiblingOrders(nodes, parentId) {
    getChildren(nodes, parentId).forEach((node, index) => {
      node.order = index;
    });
  }

  function normaliseAllOrders(nodes) {
    const parents = new Set(nodes.map((node) => parentKey(node.parentId)));
    for (const parentId of parents) normaliseSiblingOrders(nodes, parentId);
  }

  function nextSiblingOrder(nodes, parentId) {
    return getChildren(nodes, parentId).length;
  }

  function getDescendantIds(nodes, nodeId) {
    const descendants = new Set();
    const queue = [nodeId];
    while (queue.length) {
      const parentId = queue.shift();
      for (const child of getChildren(nodes, parentId)) {
        if (descendants.has(child.id)) continue;
        descendants.add(child.id);
        queue.push(child.id);
      }
    }
    return descendants;
  }

  function getLowestCommonAncestorId(nodes, firstNodeId, secondNodeId) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    if (!nodeById.has(firstNodeId) || !nodeById.has(secondNodeId)) return null;

    const firstAncestors = new Set();
    let current = nodeById.get(firstNodeId);
    while (current) {
      firstAncestors.add(current.id);
      current = nodeById.get(current.parentId);
    }

    current = nodeById.get(secondNodeId);
    while (current) {
      if (firstAncestors.has(current.id)) return current.id;
      current = nodeById.get(current.parentId);
    }
    return null;
  }

  function canReparent(nodes, nodeId, newParentId) {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    const parent = nodes.find((candidate) => candidate.id === newParentId);
    if (!node || !parent || node.parentId === null || node.parentId === undefined) return false;
    if (nodeId === newParentId || node.parentId === newParentId) return false;
    return !getDescendantIds(nodes, nodeId).has(newParentId);
  }

  function replaceHierarchyConnection(connections, nodeId, parentId) {
    for (let index = connections.length - 1; index >= 0; index--) {
      const connection = connections[index];
      if (connection.to === nodeId && connection.kind !== "relationship") {
        connections.splice(index, 1);
      }
    }
    connections.push({ from: parentId, to: nodeId, kind: "hierarchy" });
  }

  function reparentNode(nodes, connections, nodeId, newParentId) {
    if (!canReparent(nodes, nodeId, newParentId)) return false;
    const node = nodes.find((candidate) => candidate.id === nodeId);
    const oldParentId = parentKey(node.parentId);
    node.parentId = newParentId;
    node.order = nextSiblingOrder(nodes.filter((candidate) => candidate.id !== nodeId), newParentId);
    replaceHierarchyConnection(connections, nodeId, newParentId);
    normaliseSiblingOrders(nodes, oldParentId);
    normaliseSiblingOrders(nodes, newParentId);
    return true;
  }

  function moveSibling(nodes, nodeId, direction) {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node || ![-1, 1].includes(direction)) return false;
    const siblings = getChildren(nodes, node.parentId);
    const index = siblings.findIndex((candidate) => candidate.id === nodeId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) return false;
    const target = siblings[targetIndex];
    const currentOrder = node.order;
    node.order = target.order;
    target.order = currentOrder;
    normaliseSiblingOrders(nodes, node.parentId);
    return true;
  }

  function indentNode(nodes, connections, nodeId) {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node || node.parentId === null || node.parentId === undefined) return false;
    const siblings = getChildren(nodes, node.parentId);
    const index = siblings.findIndex((candidate) => candidate.id === nodeId);
    if (index <= 0) return false;
    return reparentNode(nodes, connections, nodeId, siblings[index - 1].id);
  }

  function outdentNode(nodes, connections, nodeId) {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node || node.parentId === null || node.parentId === undefined) return false;
    const parent = nodes.find((candidate) => candidate.id === node.parentId);
    if (!parent || parent.parentId === null || parent.parentId === undefined) return false;
    const grandparentId = parent.parentId;
    if (!reparentNode(nodes, connections, nodeId, grandparentId)) return false;
    node.order = (Number.isFinite(parent.order) ? parent.order : 0) + 0.5;
    normaliseSiblingOrders(nodes, grandparentId);
    return true;
  }

  return {
    canReparent,
    getChildren,
    getDescendantIds,
    getLowestCommonAncestorId,
    indentNode,
    moveSibling,
    nextSiblingOrder,
    normaliseAllOrders,
    normaliseSiblingOrders,
    outdentNode,
    reparentNode,
  };
});
