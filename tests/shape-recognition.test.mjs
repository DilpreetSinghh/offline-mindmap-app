import test from "node:test";
import assert from "node:assert/strict";
import { SHAPE_RECOGNITION_DEFAULTS, absolutePoints, recogniseShape, shapeSkeleton } from "../src/shape-recognition.mjs";

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function jittered(points, amplitude, random) {
  const offset = () => (random() - 0.5) * 2 * amplitude;
  return points.map(([x, y]) => [x + offset(), y + offset()]);
}

function circleStroke(radius, count = 48, jitter = 0, random = mulberry32(1)) {
  return jittered(Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  }), jitter, random);
}

function ellipseStroke(rx, ry, count = 48, jitter = 0, random = mulberry32(2)) {
  return jittered(Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return [rx * Math.cos(angle), ry * Math.sin(angle)];
  }), jitter, random);
}

function rectangleStroke(width, height, jitter = 0, random = mulberry32(3), rotation = 0) {
  const corners = [[0, 0], [width, 0], [width, height], [0, height]];
  const points = [];
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  for (let edge = 0; edge < 4; edge += 1) {
    const [x1, y1] = corners[edge];
    const [x2, y2] = corners[(edge + 1) % 4];
    for (let step = 0; step < 14; step += 1) {
      const ratio = step / 14;
      let x = x1 + (x2 - x1) * ratio;
      let y = y1 + (y2 - y1) * ratio;
      if (rotation) {
        const rotatedX = x * cosine - y * sine;
        const rotatedY = x * sine + y * cosine;
        x = rotatedX;
        y = rotatedY;
      }
      points.push([x, y]);
    }
  }
  return jittered(points, jitter, random);
}

function roundedRectangleStroke(width, height, cornerRadius, random = mulberry32(4)) {
  const points = [];
  const corners = [[cornerRadius, 0], [width - cornerRadius, 0], [width, cornerRadius], [width, height - cornerRadius],
    [width - cornerRadius, height], [cornerRadius, height], [0, height - cornerRadius], [0, cornerRadius]];
  for (let edge = 0; edge < 8; edge += 1) {
    const [x1, y1] = corners[edge];
    const [x2, y2] = corners[(edge + 1) % 8];
    for (let step = 0; step < 10; step += 1) {
      const ratio = step / 10;
      points.push([x1 + (x2 - x1) * ratio, y1 + (y2 - y1) * ratio]);
    }
  }
  return jittered(points, 1, random);
}

function triangleStroke(random = mulberry32(5), jitter = 1) {
  const vertices = [[0, 0], [100, 0], [50, 86.6]];
  const points = [];
  for (let edge = 0; edge < 3; edge += 1) {
    const [x1, y1] = vertices[edge];
    const [x2, y2] = vertices[(edge + 1) % 3];
    for (let step = 0; step < 12; step += 1) {
      const ratio = step / 12;
      points.push([x1 + (x2 - x1) * ratio, y1 + (y2 - y1) * ratio]);
    }
  }
  return jittered(points, jitter, random);
}

function diamondStroke(random = mulberry32(6), jitter = 1) {
  const vertices = [[50, 0], [100, 50], [50, 100], [0, 50]];
  const points = [];
  for (let edge = 0; edge < 4; edge += 1) {
    const [x1, y1] = vertices[edge];
    const [x2, y2] = vertices[(edge + 1) % 4];
    for (let step = 0; step < 12; step += 1) {
      const ratio = step / 12;
      points.push([x1 + (x2 - x1) * ratio, y1 + (y2 - y1) * ratio]);
    }
  }
  return jittered(points, jitter, random);
}

function lineStroke(x1, y1, x2, y2, jitter = 1, random = mulberry32(7), count = 60) {
  return jittered(Array.from({ length: count }, (_, index) => {
    const ratio = index / (count - 1);
    return [x1 + (x2 - x1) * ratio, y1 + (y2 - y1) * ratio];
  }), jitter, random);
}

function wavyStroke(length = 200, amplitude = 12, random = mulberry32(8)) {
  return jittered(Array.from({ length: 80 }, (_, index) => {
    const x = (index / 79) * length;
    return [x, amplitude * Math.sin((index / 79) * Math.PI * 6)];
  }), 1, random);
}

function arrowStroke(jitter = 0, random = mulberry32(9)) {
  const points = Array.from({ length: 50 }, (_, index) => {
    const ratio = index / 49;
    return [(index / 49) * 140, (random() - 0.5) * 2 * jitter];
  });
  points.push([150, 0], [142, 7]);
  return points;
}

test("converts a clean circle stroke into an ellipse", () => {
  const shape = recogniseShape({ points: circleStroke(50) });
  assert.equal(shape.type, "ellipse");
  assert.ok(Math.abs(shape.width - 100) < 2);
  assert.ok(Math.abs(shape.height - 100) < 2);
  assert.equal(shape.angle, 0);
  assert.equal(shape.points, null);
});

test("still converts a noticeably wobbly circle", () => {
  const shape = recogniseShape({ points: circleStroke(50, 48, 3) });
  assert.equal(shape.type, "ellipse");
});

test("converts a squashed circle into a rotated or flat ellipse", () => {
  const shape = recogniseShape({ points: ellipseStroke(80, 40) });
  assert.equal(shape.type, "ellipse");
  const aspect = Math.max(shape.width / shape.height, shape.height / shape.width);
  assert.ok(aspect > 1.7);
});

test("rejects a scribble blob that is too far from a circle", () => {
  assert.equal(recogniseShape({ points: circleStroke(40, 48, 12) }), null);
});

test("converts a rectangle stroke into a rectangle with matching size", () => {
  const shape = recogniseShape({ points: rectangleStroke(120, 80, 2) });
  assert.equal(shape.type, "rectangle");
  assert.ok(Math.abs(shape.width - 120) < 4);
  assert.ok(Math.abs(shape.height - 80) < 4);
  assert.equal(shape.angle, 0);
});

test("converts a rotated rectangle and keeps the rotation angle", () => {
  const shape = recogniseShape({ points: rectangleStroke(120, 80, 1, mulberry32(31), Math.PI / 6) });
  assert.equal(shape.type, "rectangle");
  assert.ok(Math.abs(shape.angle - Math.PI / 6) < 0.05);
});

test("rejects a rounded rectangle without sharp corners", () => {
  assert.equal(recogniseShape({ points: roundedRectangleStroke(120, 80, 20) }), null);
});

test("converts a triangle stroke into a triangle element with normalized points", () => {
  const shape = recogniseShape({ points: triangleStroke() });
  assert.equal(shape.type, "triangle");
  assert.equal(shape.points.length, 3);
  for (const [x, y] of shape.points) {
    assert.ok(x >= -0.02 && x <= 1.02 && y >= -0.02 && y <= 1.02);
  }
});

test("converts a diamond stroke into a diamond element", () => {
  const shape = recogniseShape({ points: diamondStroke() });
  assert.equal(shape.type, "diamond");
  assert.ok(Math.abs(shape.width - 100) < 3);
  assert.ok(Math.abs(shape.height - 100) < 3);
});

test("converts a nearly straight stroke into a line", () => {
  const shape = recogniseShape({ points: lineStroke(0, 0, 200, 30, 1.5) });
  assert.equal(shape.type, "line");
  assert.deepEqual(shape.points[0], [0, 0]);
  assert.ok(Math.abs(shape.points[1][0] - 200) < 5);
  assert.ok(Math.abs(shape.points[1][1] - 30) < 5);
});

test("converts a straight stroke with a backward V at the end into an arrow", () => {
  const shape = recogniseShape({ points: arrowStroke() });
  assert.equal(shape.type, "arrow");
  assert.deepEqual(shape.points, [[0, 0], [150, 0]]);
});

test("rejects a wavy stroke instead of converting it to a line", () => {
  assert.equal(recogniseShape({ points: wavyStroke() }), null);
});

function realisticStroke(vertices, jitter, bow, random) {
  const mid = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const corner = (a, b, c, t) => {
    const p = mid(a, b, 0.94);
    const q = mid(b, c, 0.06);
    const u = 1 - t;
    return [u * u * p[0] + 2 * u * t * b[0] + t * t * q[0], u * u * p[1] + 2 * u * t * b[1] + t * t * q[1]];
  };
  const points = [];
  const count = vertices.length;
  for (let edge = 0; edge < count; edge += 1) {
    const a = vertices[edge];
    const b = vertices[(edge + 1) % count];
    const c = vertices[(edge + 2) % count];
    const start = mid(a, b, 0.06);
    const end = mid(a, b, 0.94);
    const nx = -(b[1] - a[1]);
    const ny = b[0] - a[0];
    const norm = Math.hypot(nx, ny) || 1;
    for (let i = 0; i < 10; i += 1) {
      const t = i / 10;
      const [x, y] = mid(start, end, t);
      const arc = bow * Math.sin(Math.PI * t);
      points.push([x + nx / norm * arc + (random() - 0.5) * jitter, y + ny / norm * arc + (random() - 0.5) * jitter]);
    }
    for (let i = 1; i <= 5; i += 1) {
      const [x, y] = corner(a, b, c, i / 6);
      points.push([x + (random() - 0.5) * jitter, y + (random() - 0.5) * jitter]);
    }
  }
  return points;
}

const sloppySquare = () => realisticStroke([[-50, -50], [50, -50], [50, 50], [-50, 50]], 3, 5, mulberry32(21));
const sloppyTriangle = () => realisticStroke([[-55, 42], [58, 40], [0, -52]], 3, 4, mulberry32(22));
const sloppyDiamond = () => realisticStroke([[0, -52], [52, 0], [0, 52], [-52, 0]], 3, 4, mulberry32(23));
const sloppyCircle = () => Array.from({ length: 44 }, (_, i) => {
  const angle = i / 44 * Math.PI * 2;
  const radius = 55 + (mulberry32(24 + Math.floor(i / 11))() - 0.5) * 10;
  return [radius * Math.cos(angle), radius * Math.sin(angle)];
});

test("converts realistic wobbly shapes to their correct perfect equivalents", () => {
  const circle = recogniseShape({ points: sloppyCircle() });
  assert.equal(circle.type, "ellipse");
  const square = recogniseShape({ points: sloppySquare() });
  assert.equal(square.type, "rectangle");
  assert.ok(Math.abs(square.width - 100) < 12);
  assert.ok(Math.abs(square.height - 100) < 12);
  const triangle = recogniseShape({ points: sloppyTriangle() });
  assert.equal(triangle.type, "triangle");
  assert.equal(triangle.points.length, 3);
  const diamond = recogniseShape({ points: sloppyDiamond() });
  assert.equal(diamond.type, "diamond");
});

test("never converts a wobbly square into an ellipse", () => {
  const square = recogniseShape({ points: sloppySquare() });
  assert.notEqual(square?.type, "ellipse");
});

function overrunSquare(extraLength, random = mulberry32(31)) {
  const corners = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const points = [];
  for (let edge = 0; edge < 4; edge += 1) {
    const [x1, y1] = corners[edge];
    const [x2, y2] = corners[(edge + 1) % 4];
    for (let step = 0; step < 14; step += 1) {
      const ratio = step / 14;
      points.push([x1 + (x2 - x1) * ratio + (random() - 0.5) * 2, y1 + (y2 - y1) * ratio + (random() - 0.5) * 2]);
    }
  }
  for (let step = 1; step <= extraLength / 7; step += 1) {
    points.push([step * 7 + (random() - 0.5) * 2, (random() - 0.5) * 2]);
  }
  return points;
}

test("converts a square whose tail overruns the starting point", () => {
  const shape = recogniseShape({ points: overrunSquare(30) });
  assert.equal(shape.type, "rectangle");
  assert.ok(Math.abs(shape.width - 100) < 6);
  assert.ok(Math.abs(shape.height - 100) < 6);
});

test("converts a square whose tail starts a second lap before stopping", () => {
  const shape = recogniseShape({ points: overrunSquare(180) });
  assert.equal(shape.type, "rectangle");
  assert.ok(Math.abs(shape.width - 100) < 8);
  assert.ok(Math.abs(shape.height - 100) < 8);
});

test("converts a circle whose tail overruns the starting point", () => {
  const points = circleStroke(50, 48, 2, mulberry32(32));
  const last = points[points.length - 1];
  for (let step = 1; step <= 6; step += 1) points.push([last[0] + step * 6, last[1]]);
  const shape = recogniseShape({ points });
  assert.equal(shape.type, "ellipse");
});

test("does not trim a plain straight line into a shape", () => {
  const shape = recogniseShape({ points: lineStroke(0, 0, 200, 30, 1.5) });
  assert.equal(shape.type, "line");
  assert.ok(Math.abs(shape.points[1][0] - 200) < 5);
});

test("does not trim a wavy open stroke into a closed shape", () => {
  assert.equal(recogniseShape({ points: wavyStroke() }), null);
});

test("places the replacement shape exactly where the stroke was drawn", () => {
  const relativePoints = Array.from({ length: 48 }, (_, index) => {
    const angle = index / 48 * Math.PI * 2;
    return [50 * Math.cos(angle) - 50, 50 * Math.sin(angle)];
  });
  const shape = recogniseShape({ x: 300, y: 400, points: relativePoints });
  assert.equal(shape.type, "ellipse");
  assert.ok(Math.abs(shape.x - 200) < 3);
  assert.ok(Math.abs(shape.y - 350) < 3);
  assert.ok(Math.abs(shape.width - 100) < 3);
  assert.ok(Math.abs(shape.height - 100) < 3);
});

test("rejects strokes that are too small or too short to classify", () => {
  assert.equal(recogniseShape({ points: circleStroke(3) }), null);
  assert.equal(recogniseShape({ points: [[0, 0], [5, 0], [10, 0], [15, 0]] }), null);
  assert.equal(recogniseShape({ points: [] }), null);
  assert.equal(recogniseShape({ points: [[0, 0], [1, 1]] }), null);
});

test("respects the enabled option", () => {
  assert.equal(recogniseShape({ points: circleStroke(50) }, { enabled: false }), null);
  assert.equal(recogniseShape({ points: circleStroke(50) }, { enabled: true }).type, "ellipse");
});

test("keeps defaults frozen and consistent", () => {
  assert.equal(SHAPE_RECOGNITION_DEFAULTS.enabled, true);
  assert.equal(SHAPE_RECOGNITION_DEFAULTS.minDimension, 10);
  assert.throws(() => { SHAPE_RECOGNITION_DEFAULTS.enabled = false; }, TypeError);
});

test("normalises freedraw points into absolute deduplicated coordinates", () => {
  const points = [[0, 0], [10, 5], [10.1, 5.1], [20, 10]];
  assert.deepEqual(absolutePoints(points), [[0, 0], [10, 5], [20, 10]]);
  assert.deepEqual(absolutePoints([[3, 4], [13, 9], [23, 14]]), [[3, 4], [13, 9], [23, 14]]);
  assert.deepEqual(absolutePoints(null), []);
  assert.deepEqual(absolutePoints([[NaN, 0]]), []);
});

test("shapeSkeleton preserves freehand styling on the replacement element", () => {
  const source = {
    strokeColor: "#e03131",
    backgroundColor: "#ffc9c9",
    fillStyle: "hachure",
    strokeWidth: 4,
    strokeStyle: "dashed",
    roughness: 2,
    opacity: 60,
    groupIds: ["group-1"],
    frameId: "frame-9",
    locked: true,
    link: "https://example.com",
  };
  const shape = recogniseShape({ points: circleStroke(50) });
  const skeleton = shapeSkeleton(source, shape);
  assert.equal(skeleton.type, "ellipse");
  assert.equal(skeleton.strokeColor, "#e03131");
  assert.equal(skeleton.backgroundColor, "#ffc9c9");
  assert.equal(skeleton.fillStyle, "hachure");
  assert.equal(skeleton.strokeWidth, 4);
  assert.equal(skeleton.strokeStyle, "dashed");
  assert.equal(skeleton.roughness, 0);
  assert.equal(skeleton.opacity, 60);
  assert.deepEqual(skeleton.groupIds, ["group-1"]);
  assert.equal(skeleton.frameId, "frame-9");
  assert.equal(skeleton.locked, true);
  assert.equal(skeleton.link, "https://example.com");
  assert.deepEqual(skeleton.points, [[0, 0], [1, 0], [1, 1], [0, 1]]);
});

test("shapeSkeleton produces a head at the end of arrows and none on lines", () => {
  const line = shapeSkeleton({}, recogniseShape({ points: lineStroke(0, 0, 200, 0) }));
  assert.equal(line.type, "line");
  assert.equal(line.endArrowhead, null);
  assert.equal(line.startArrowhead, null);
  const arrow = shapeSkeleton({}, recogniseShape({ points: arrowStroke() }));
  assert.equal(arrow.type, "arrow");
  assert.equal(arrow.endArrowhead, "arrow");
});

test("shapeSkeleton supplies defaults when the source element is missing", () => {
  const shape = recogniseShape({ points: circleStroke(50) });
  const skeleton = shapeSkeleton(null, shape);
  assert.equal(skeleton.strokeColor, "#1e1e1e");
  assert.equal(skeleton.strokeWidth, 2);
  assert.deepEqual(skeleton.groupIds, []);
  assert.equal(skeleton.frameId, null);
});
