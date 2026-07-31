export const SHAPE_RECOGNITION_DEFAULTS = Object.freeze({
  enabled: true,
  minPoints: 8,
  dedupeDistance: 0.6,
  minDimension: 10,
  closureAbsolute: 14,
  closureRatio: 0.2,
  radiusDeviation: 0.14,
  circleFillMin: 0.58,
  circleFillMax: 0.85,
  rectFillMin: 0.72,
  rectPerimeterRatio: 1.45,
  diamondFillMin: 0.42,
  diamondEdgeTolerance: 0.18,
  triangleFillMin: 0.48,
  triangleFillMax: 0.66,
  cornerAngle: 32,
  sampleCount: 64,
  cornerClusterRatio: 0.06,
  lineDeviation: 0.09,
  lineArcRatio: 1.18,
  arrowBendAngle: 60,
  arrowBackAngle: 105,
  minimumAspectForRotation: 1.15,
  angleSnap: 0.15,
});

function vectorAngleDegrees(u, v) {
  const numerator = u[0] * v[0] + u[1] * v[1];
  const denominator = Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]);
  if (!denominator) return 0;
  return Math.acos(Math.max(-1, Math.min(1, numerator / denominator))) * 180 / Math.PI;
}

function distance(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function absolutePoints(points) {
  if (!Array.isArray(points)) return [];
  const parsed = [];
  for (const point of points) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const x = Number(point[0]);
    const y = Number(point[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    parsed.push([x, y]);
  }
  if (!parsed.length) return [];
  const [originX, originY] = parsed[0];
  const relative = Math.hypot(originX, originY) < 0.001;
  const result = [];
  for (const [x, y] of parsed) {
    const absolute = relative ? [x + originX, y + originY] : [x, y];
    const previous = result[result.length - 1];
    if (!previous || distance(previous, absolute) >= 0.6) result.push(absolute);
  }
  return result;
}

function bboxOf(points) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function centroidOf(points) {
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point[0];
    y += point[1];
  }
  return { x: x / points.length, y: y / points.length };
}

function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distance(points[i - 1], points[i]);
  return total;
}

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

function resample(points, count) {
  if (points.length <= 2) return points.slice();
  const lengths = [0];
  for (let i = 1; i < points.length; i += 1) lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]));
  const total = lengths[lengths.length - 1];
  if (!total) return points.slice();
  const samples = [];
  for (let i = 0; i < count; i += 1) {
    const target = (i / (count - 1)) * total;
    let index = 0;
    while (index < lengths.length - 2 && lengths[index + 1] < target) index += 1;
    const span = lengths[index + 1] - lengths[index];
    const ratio = span ? (target - lengths[index]) / span : 0;
    samples.push([
      points[index][0] + (points[index + 1][0] - points[index][0]) * ratio,
      points[index][1] + (points[index + 1][1] - points[index][1]) * ratio,
    ]);
  }
  return samples;
}

function turningAngleDegrees(previous, middle, next) {
  return vectorAngleDegrees(
    [middle[0] - previous[0], middle[1] - previous[1]],
    [next[0] - middle[0], next[1] - middle[1]],
  );
}

function detectCorners(points, options, closed = false) {
  const samples = resample(points, options.sampleCount);
  const count = samples.length;
  const corners = [];
  for (let i = 0; i < count; i += 1) {
    if (!closed && (i === 0 || i === count - 1)) continue;
    const previous = samples[(i - 2 + count) % count];
    const middle = samples[i];
    const next = samples[(i + 2) % count];
    const angle = turningAngleDegrees(previous, middle, next);
    if (angle >= options.cornerAngle) corners.push({ index: i, angle, point: middle });
  }
  const clusterWindow = Math.max(2, Math.round(options.sampleCount * options.cornerClusterRatio));
  const clusters = [];
  for (const corner of corners) {
    const last = clusters[clusters.length - 1];
    if (last && corner.index - last.index <= clusterWindow) {
      if (corner.angle > last.angle) {
        last.index = corner.index;
        last.angle = corner.angle;
        last.point = corner.point;
      }
    } else {
      clusters.push({ ...corner });
    }
  }
  if (closed && clusters.length > 1) {
    const first = clusters[0];
    const last = clusters[clusters.length - 1];
    const seamDistance = count - last.index + first.index;
    if (seamDistance <= clusterWindow) {
      if (last.angle > first.angle) clusters.shift();
      else clusters.pop();
    }
  }
  return clusters;
}

function fitLine(points) {
  const centroid = centroidOf(points);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of points) {
    const dx = x - centroid.x;
    const dy = y - centroid.y;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const direction = [Math.cos(angle), Math.sin(angle)];
  let maxDeviation = 0;
  for (const [x, y] of points) {
    const dx = x - centroid.x;
    const dy = y - centroid.y;
    const projection = dx * direction[0] + dy * direction[1];
    const deviation = Math.hypot(dx - projection * direction[0], dy - projection * direction[1]);
    if (deviation > maxDeviation) maxDeviation = deviation;
  }
  const start = points[0];
  const end = points[points.length - 1];
  return { angle, direction, maxDeviation, start, end, length: distance(start, end) };
}

function rotateAround(point, center, radians) {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const dx = point[0] - center.x;
  const dy = point[1] - center.y;
  return [center.x + dx * cosine - dy * sine, center.y + dx * sine + dy * cosine];
}

function orientedShape(type, points, angle, options) {
  let rotation = 0;
  if (Math.abs(angle) > options.angleSnap) rotation = angle;
  const rotated = rotation ? points.map((point) => rotateAround(point, centroidOf(points), -rotation)) : points;
  const bounds = bboxOf(rotated);
  return {
    type,
    x: bounds.x,
    y: bounds.y,
    width: Math.max(1, bounds.width),
    height: Math.max(1, bounds.height),
    angle: rotation,
    points: null,
  };
}

function ellipseShape(points, bounds, options) {
  const aspect = Math.max(bounds.width / bounds.height, bounds.height / bounds.width);
  const angle = aspect > options.minimumAspectForRotation ? fitLine(points).angle : 0;
  return orientedShape("ellipse", points, angle, options);
}

function rectangleShape(points, angle, options) {
  const shape = orientedShape("rectangle", points, angle, options);
  const aspect = Math.max(shape.width / shape.height, shape.height / shape.width);
  if (aspect <= 1.12) {
    const side = (shape.width + shape.height) / 2;
    shape.width = side;
    shape.height = side;
  }
  return shape;
}

function triangleShape(points, corners, options) {
  const centroid = centroidOf(points);
  const angle = Math.abs(fitLine(points).angle) > options.angleSnap ? fitLine(points).angle : 0;
  const rotated = corners.map((corner) => rotateAround(corner.point, centroid, -angle));
  const rotatedBounds = bboxOf(rotated);
  const width = Math.max(1, rotatedBounds.width);
  const height = Math.max(1, rotatedBounds.height);
  const normalized = rotated.map(([x, y]) => [
    Number(((x - rotatedBounds.x) / width).toFixed(4)),
    Number(((y - rotatedBounds.y) / height).toFixed(4)),
  ]);
  return { type: "triangle", x: rotatedBounds.x, y: rotatedBounds.y, width, height, angle, points: normalized };
}

function diamondShape(points, bounds, options) {
  const aspect = Math.max(bounds.width / bounds.height, bounds.height / bounds.width);
  const angle = aspect > options.minimumAspectForRotation ? fitLine(points).angle : 0;
  return orientedShape("diamond", points, angle, options);
}

function diamondCornersAtMidpoints(corners, bounds, options) {
  const midX = bounds.x + bounds.width / 2;
  const midY = bounds.y + bounds.height / 2;
  const midpoints = [
    [midX, bounds.y],
    [bounds.x + bounds.width, midY],
    [midX, bounds.y + bounds.height],
    [bounds.x, midY],
  ];
  const toleranceX = options.diamondEdgeTolerance * bounds.width;
  const toleranceY = options.diamondEdgeTolerance * bounds.height;
  for (const corner of corners) {
    let nearest = midpoints[0];
    let nearestDistance = Infinity;
    for (const midpoint of midpoints) {
      const candidate = distance(corner.point, midpoint);
      if (candidate < nearestDistance) {
        nearestDistance = candidate;
        nearest = midpoint;
      }
    }
    if (nearest[0] === midX) {
      if (Math.abs(corner.point[0] - midX) > toleranceX || Math.abs(corner.point[1] - nearest[1]) > toleranceY) return false;
    } else if (Math.abs(corner.point[1] - midY) > toleranceY || Math.abs(corner.point[0] - nearest[0]) > toleranceX) {
      return false;
    }
  }
  return true;
}

function closedShape(points, bounds, options) {
  const area = polygonArea(points);
  const fillRatio = area / (bounds.width * bounds.height);
  if (fillRatio <= 0.05) return null;
  const centroid = centroidOf(points);
  const radii = points.map((point) => distance(point, centroid));
  const meanRadius = radii.reduce((total, radius) => total + radius, 0) / radii.length;
  const variance = radii.reduce((total, radius) => total + (radius - meanRadius) ** 2, 0) / radii.length;
  const radiusDeviation = meanRadius > 0 ? Math.sqrt(variance) / meanRadius : 0;
  const corners = detectCorners(points, options, true);

  if (radiusDeviation <= options.radiusDeviation && fillRatio >= options.circleFillMin && fillRatio <= options.circleFillMax) {
    return ellipseShape(points, bounds, options);
  }

  if (corners.length === 4) {
    const perimeter = pathLength(points);
    const perimeterRatio = perimeter / (2 * (bounds.width + bounds.height));
    if (perimeterRatio <= options.rectPerimeterRatio) {
      if (fillRatio >= options.diamondFillMin && diamondCornersAtMidpoints(corners, bounds, options)) {
        return diamondShape(points, bounds, options);
      }
      if (corners.every((corner) => Math.abs(Math.abs(corner.angle) - 90) <= 28)) {
        return rectangleShape(points, fitLine(points).angle, options);
      }
    }
  }

  if (corners.length === 3 && fillRatio >= options.triangleFillMin && fillRatio <= options.triangleFillMax) {
    return triangleShape(points, corners, options);
  }
  return null;
}

function arrowTip(points, options) {
  if (points.length < 5) return null;
  const apexCount = Math.min(points.length - 2, 5);
  for (let offset = 0; offset < apexCount; offset += 1) {
    const apexIndex = points.length - 2 - offset;
    const before = points[apexIndex - 1];
    const apex = points[apexIndex];
    const barb = points[apexIndex + 1];
    const incoming = [apex[0] - before[0], apex[1] - before[1]];
    const outgoing = [barb[0] - apex[0], barb[1] - apex[1]];
    if (Math.hypot(incoming[0], incoming[1]) < 0.7 * options.minDimension || Math.hypot(outgoing[0], outgoing[1]) < 0.35 * options.minDimension) continue;
    const angle = vectorAngleDegrees(incoming, outgoing);
    const turn = 180 - angle;
    if (turn <= options.arrowBendAngle && angle >= options.arrowBackAngle) return { apex, barb, apexIndex };
  }
  return null;
}

function linearShape(points, options) {
  const tip = arrowTip(points, options);
  const linePoints = tip ? points.slice(0, tip.apexIndex) : points;
  if (linePoints.length < 2) return null;
  const line = fitLine(linePoints);
  if (line.length < options.minDimension) return null;
  const arcLength = pathLength(linePoints);
  const straightness = line.length > 0 ? arcLength / line.length : 1;
  if (straightness > options.lineArcRatio || line.maxDeviation / line.length > options.lineDeviation) return null;
  const start = linePoints[0];
  const end = tip ? tip.apex : linePoints[linePoints.length - 1];
  return {
    type: tip ? "arrow" : "line",
    x: start[0],
    y: start[1],
    width: Math.abs(end[0] - start[0]),
    height: Math.abs(end[1] - start[1]),
    angle: 0,
    points: [[0, 0], [end[0] - start[0], end[1] - start[1]]],
  };
}

function openShape(points, options) {
  return linearShape(points, options);
}

export function recogniseShape(element, options = {}) {
  const settings = { ...SHAPE_RECOGNITION_DEFAULTS, ...options };
  if (!settings.enabled) return null;
  const points = absolutePoints(element?.points);
  if (points.length < settings.minPoints) return null;
  const bounds = bboxOf(points);
  if (Math.max(bounds.width, bounds.height) < settings.minDimension || bounds.width * bounds.height === 0) return null;
  const gap = distance(points[0], points[points.length - 1]);
  const closed = gap < Math.max(settings.closureAbsolute, settings.closureRatio * Math.hypot(bounds.width, bounds.height));
  return closed ? closedShape(points, bounds, settings) : openShape(points, settings);
}

function elementId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `shape-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function shapeSkeleton(source, shape) {
  const common = {
    id: elementId(),
    type: shape.type,
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
    angle: shape.angle ?? 0,
    strokeColor: source?.strokeColor ?? "#1e1e1e",
    backgroundColor: source?.backgroundColor ?? "transparent",
    fillStyle: source?.fillStyle ?? "solid",
    strokeWidth: source?.strokeWidth ?? 2,
    strokeStyle: source?.strokeStyle ?? "solid",
    roughness: source?.roughness ?? 1,
    opacity: source?.opacity ?? 100,
    groupIds: Array.isArray(source?.groupIds) ? source.groupIds : [],
    frameId: source?.frameId ?? null,
    locked: source?.locked ?? false,
    link: source?.link ?? null,
    customData: source?.customData,
    roundness: shape.type === "ellipse" ? { type: "sizeBasedRadius" } : null,
    boundElements: null,
  };
  if (shape.type === "line" || shape.type === "arrow") {
    return {
      ...common,
      points: shape.points,
      startArrowhead: null,
      endArrowhead: shape.type === "arrow" ? "arrow" : null,
    };
  }
  return { ...common, points: shape.type === "triangle" ? shape.points : [[0, 0], [1, 0], [1, 1], [0, 1]] };
}
