// Pathfinder for stronghold room pieces (graph build + generation-order path).

export function isPrisonHall(piece) {
  return piece.type === 'PrisonHall';
}

export function isFiveWay(piece) {
  return piece.type === 'FiveWayCrossing';
}

export function isSmallCorridor(piece) {
  return piece.type === 'SmallCorridor';
}

export function isLibrary(piece) {
  return piece.type === 'Library';
}

export function pieceAge(pieces, idx) {
  const p = pieces[idx];
  return p.age != null ? p.age : idx + 1;
}

function overlapLength(a0, a1, b0, b1) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

export function centerXZ(piece) {
  return {
    x: (piece.minX + piece.maxX) / 2,
    z: (piece.minZ + piece.maxZ) / 2,
  };
}

const OPPOSITE_DIR = { N: 'S', S: 'N', E: 'W', W: 'E' };

// Per-arm opening coords (perpendicular axis): N/S → X, E/W → Z.
export function fiveWayExtensionCoords(fiveWay, direction) {
  const minX = Math.min(fiveWay.minX, fiveWay.maxX);
  const maxX = Math.max(fiveWay.minX, fiveWay.maxX);
  const minZ = Math.min(fiveWay.minZ, fiveWay.maxZ);
  const maxZ = Math.max(fiveWay.minZ, fiveWay.maxZ);
  switch (direction) {
    case 'N':
      return { axis: 'x', near: maxX - 2, far: maxX - 8 };
    case 'S':
      return { axis: 'x', near: minX + 2, far: minX + 8 };
    case 'E':
      return { axis: 'z', near: minZ + 2, far: minZ + 8 };
    case 'W':
      return { axis: 'z', near: maxZ - 2, far: maxZ - 8 };
    default:
      return null;
  }
}

export function connectionDirectionFromFiveWay(fiveWay, other) {
  const fx0 = Math.min(fiveWay.minX, fiveWay.maxX);
  const fx1 = Math.max(fiveWay.minX, fiveWay.maxX);
  const fz0 = Math.min(fiveWay.minZ, fiveWay.maxZ);
  const fz1 = Math.max(fiveWay.minZ, fiveWay.maxZ);
  const ox0 = Math.min(other.minX, other.maxX);
  const ox1 = Math.max(other.minX, other.maxX);
  const oz0 = Math.min(other.minZ, other.maxZ);
  const oz1 = Math.max(other.minZ, other.maxZ);

  const xDist = Math.max(0, Math.max(ox0 - fx1, fx0 - ox1));
  const zDist = Math.max(0, Math.max(oz0 - fz1, fz0 - oz1));
  const xOverlap = Math.max(0, Math.min(ox1, fx1) - Math.max(ox0, fx0));
  const zOverlap = Math.max(0, Math.min(oz1, fz1) - Math.max(oz0, fz0));

  if (zDist <= 1 && xOverlap >= 2) {
    const omidZ = (oz0 + oz1) / 2;
    const fmidZ = (fz0 + fz1) / 2;
    return omidZ < fmidZ ? 'N' : 'S';
  }
  if (xDist <= 1 && zOverlap >= 2) {
    const omidX = (ox0 + ox1) / 2;
    const fmidX = (fx0 + fx1) / 2;
    return omidX > fmidX ? 'E' : 'W';
  }

  const fw = centerXZ(fiveWay);
  const o = centerXZ(other);
  if (Math.abs(o.x - fw.x) > Math.abs(o.z - fw.z)) {
    return o.x > fw.x ? 'E' : 'W';
  }
  return o.z > fw.z ? 'S' : 'N';
}

export function fiveWayOpeningSide(fiveWay, armDir, piece) {
  const ext = fiveWayExtensionCoords(fiveWay, armDir);
  if (!ext) return null;
  const coord = ext.axis === 'x' ? centerXZ(piece).x : centerXZ(piece).z;
  return Math.abs(coord - ext.near) <= Math.abs(coord - ext.far) ? 'near' : 'far';
}

export function fiveWayCorridorCenterXZ(fiveWay, entranceDir) {
  const minX = Math.min(fiveWay.minX, fiveWay.maxX);
  const maxX = Math.max(fiveWay.minX, fiveWay.maxX);
  const minZ = Math.min(fiveWay.minZ, fiveWay.maxZ);
  const maxZ = Math.max(fiveWay.minZ, fiveWay.maxZ);
  const midX = (minX + maxX) / 2;
  const midZ = (minZ + maxZ) / 2;

  if (entranceDir === 'N' || entranceDir === 'S') {
    const ext = fiveWayExtensionCoords(fiveWay, entranceDir);
    const corridorX = (ext.near + ext.far) / 2;
    const offsetX = Math.round(midX) + (corridorX > midX ? 1 : corridorX < midX ? -1 : 0);
    return { x: offsetX, z: midZ };
  }
  const ext = fiveWayExtensionCoords(fiveWay, entranceDir);
  const corridorZ = (ext.near + ext.far) / 2;
  const offsetZ = Math.round(midZ) + (corridorZ > midZ ? 1 : corridorZ < midZ ? -1 : 0);
  return { x: midX, z: offsetZ };
}

function faceTouchMetrics(a, b) {
  const ax0 = Math.min(a.minX, a.maxX), ax1 = Math.max(a.minX, a.maxX);
  const az0 = Math.min(a.minZ, a.maxZ), az1 = Math.max(a.minZ, a.maxZ);
  const ay0 = Math.min(a.minY, a.maxY), ay1 = Math.max(a.minY, a.maxY);
  const bx0 = Math.min(b.minX, b.maxX), bx1 = Math.max(b.minX, b.maxX);
  const bz0 = Math.min(b.minZ, b.maxZ), bz1 = Math.max(b.minZ, b.maxZ);
  const by0 = Math.min(b.minY, b.maxY), by1 = Math.max(b.minY, b.maxY);

  const xDist = Math.max(0, Math.max(bx0 - ax1, ax0 - bx1));
  const zDist = Math.max(0, Math.max(bz0 - az1, az0 - bz1));
  const xOverlap = overlapLength(ax0, ax1, bx0, bx1);
  const zOverlap = overlapLength(az0, az1, bz0, bz1);
  const yOverlap = overlapLength(ay0, ay1, by0, by1);

  const xFaceTouch = xDist <= 1 && zOverlap >= 2;
  const zFaceTouch = zDist <= 1 && xOverlap >= 2;
  return { xFaceTouch, zFaceTouch, yOverlap, xOverlap, zOverlap };
}

function overlapMidpoint(a, b, axis) {
  if (axis === 'x') {
    const lo = Math.max(Math.min(a.minX, a.maxX), Math.min(b.minX, b.maxX));
    const hi = Math.min(Math.max(a.minX, a.maxX), Math.max(b.minX, b.maxX));
    return (lo + hi) / 2;
  }
  const lo = Math.max(Math.min(a.minZ, a.maxZ), Math.min(b.minZ, b.maxZ));
  const hi = Math.min(Math.max(a.minZ, a.maxZ), Math.max(b.minZ, b.maxZ));
  return (lo + hi) / 2;
}

function coordOnAxis(piece, axis) {
  return axis === 'x' ? centerXZ(piece).x : centerXZ(piece).z;
}

function alignsOpening(piece, ext, centerTol) {
  const lo = ext.axis === 'x'
    ? Math.min(piece.minX, piece.maxX)
    : Math.min(piece.minZ, piece.maxZ);
  const hi = ext.axis === 'x'
    ? Math.max(piece.minX, piece.maxX)
    : Math.max(piece.minZ, piece.maxZ);
  const coord = coordOnAxis(piece, ext.axis);
  const openings = [ext.near, ext.far];
  return openings.some(v =>
    Math.abs(coord - v) <= centerTol || (v >= lo - centerTol && v <= hi + centerTol)
  );
}

// Corridor room center aligned to tunnel on holder's face (uses room center, not holder bbox center).
function alignsCorridorToFace(room, holder, faceDir, centerTol) {
  const { xFaceTouch, zFaceTouch } = faceTouchMetrics(holder, room);
  const c = centerXZ(room);
  if (faceDir === 'E' || faceDir === 'W') {
    if (!xFaceTouch) return false;
    const tunnelZ = overlapMidpoint(holder, room, 'z');
    return Math.abs(c.z - tunnelZ) <= centerTol;
  }
  if (!zFaceTouch) return false;
  const tunnelX = overlapMidpoint(holder, room, 'x');
  return Math.abs(c.x - tunnelX) <= centerTol;
}

function alignsWithFiveWayArm(fiveWay, other, exitDir, centerTol) {
  const ext = fiveWayExtensionCoords(fiveWay, exitDir);
  if (!ext) return false;
  return alignsOpening(other, ext, centerTol);
}

export function fiveWayExitAllows(fiveWay, entranceDir, fromPiece, other, centerTol = 2) {
  const exitDir = connectionDirectionFromFiveWay(fiveWay, other);
  if (exitDir === entranceDir) return false;

  if (exitDir === OPPOSITE_DIR[entranceDir]) {
    return alignsWithFiveWayArm(fiveWay, other, exitDir, centerTol);
  }

  const inSide = fiveWayOpeningSide(fiveWay, entranceDir, fromPiece);
  const outSide = fiveWayOpeningSide(fiveWay, exitDir, other);
  if (!inSide || !outSide || inSide !== outSide) return false;
  return alignsWithFiveWayArm(fiveWay, other, exitDir, centerTol);
}

// Prison hall: 1 entrance / 1 exit — align using the corridor room's center on the shared face.
function prisonHallAdjacent(ph, corridorRoom, centerTol = 2) {
  const { xFaceTouch, zFaceTouch, yOverlap } = faceTouchMetrics(ph, corridorRoom);
  if (yOverlap <= 0) return false;
  if (!xFaceTouch && !zFaceTouch) return false;
  const faceDir = connectionDirectionFromFiveWay(ph, corridorRoom);
  return alignsCorridorToFace(corridorRoom, ph, faceDir, centerTol);
}

export function pathingCenterXZ(piece, prevPiece, entranceDir = null) {
  if (isPrisonHall(piece) && prevPiece) {
    return centerXZ(prevPiece);
  }
  if (isFiveWay(piece) && entranceDir) {
    return fiveWayCorridorCenterXZ(piece, entranceDir);
  }
  return centerXZ(piece);
}

export function pieceChunkPos(piece, prevPiece = null, entranceDir = null) {
  const c = pathingCenterXZ(piece, prevPiece, entranceDir);
  return { x: Math.floor(c.x / 16), z: Math.floor(c.z / 16) };
}

export function buildChunkPathSkippingPrisonHalls(pieces, pathIdx) {
  const chunkPath = [];
  for (let i = 0; i < pathIdx.length; i++) {
    const idx = pathIdx[i];
    if (isPrisonHall(pieces[idx])) continue;
    const prev = i > 0 ? pieces[pathIdx[i - 1]] : null;
    let entranceDir = null;
    if (isFiveWay(pieces[idx]) && prev) {
      entranceDir = connectionDirectionFromFiveWay(pieces[idx], prev);
    }
    const c = pieceChunkPos(pieces[idx], prev, entranceDir);
    const last = chunkPath[chunkPath.length - 1];
    if (!last || last.x !== c.x || last.z !== c.z) {
      chunkPath.push(c);
    }
  }
  return chunkPath;
}

export function buildGraph(pieces) {
  const nodes = pieces.map((p, i) => ({ ...p, index: i }));
  const adj = new Map();

  function boxesAdjacent(a, b) {
    const { xFaceTouch, zFaceTouch, yOverlap } = faceTouchMetrics(a, b);
    if (yOverlap <= 0) return false;

    const centerTol = 2;

    if (isPrisonHall(a) || isPrisonHall(b)) {
      const ph = isPrisonHall(a) ? a : b;
      const other = ph === a ? b : a;
      return prisonHallAdjacent(ph, other, centerTol);
    }

    const fiveWay = isFiveWay(a) ? a : isFiveWay(b) ? b : null;
    if (fiveWay) {
      const other = fiveWay === a ? b : a;
      const exitDir = connectionDirectionFromFiveWay(fiveWay, other);
      const faceTouch = (exitDir === 'E' || exitDir === 'W') ? xFaceTouch : zFaceTouch;
      if (!faceTouch) return false;
      return alignsWithFiveWayArm(fiveWay, other, exitDir, centerTol);
    }

    const centerA = centerXZ(a);
    const centerB = centerXZ(b);
    const xFaceAligned = xFaceTouch && Math.abs(centerA.z - centerB.z) <= centerTol;
    const zFaceAligned = zFaceTouch && Math.abs(centerA.x - centerB.x) <= centerTol;

    if (xFaceTouch && zFaceTouch && !(xFaceAligned || zFaceAligned)) return false;
    return xFaceAligned || zFaceAligned;
  }

  for (let i = 0; i < nodes.length; i++) {
    adj.set(i, []);
  }

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (boxesAdjacent(nodes[i], nodes[j])) {
        adj.get(i).push(j);
        adj.get(j).push(i);
      }
    }
  }

  const startIndex = nodes.findIndex(n => n.type === 'Start');
  const portalIndex = nodes.findIndex(n => n.type === 'PortalRoom');

  return { nodes, adj, startIndex, portalIndex };
}

export function canVisitForPath(pieces, idx) {
  return !isLibrary(pieces[idx]) && !isSmallCorridor(pieces[idx]);
}

export function canVisitForOptimalPath(pieces, idx) {
  return !isLibrary(pieces[idx]);
}

// Nodes that can reach the portal following strictly increasing piece age.
export function computeCanReachPortal(adj, pieces, portalIdx) {
  const canReach = new Set([portalIdx]);
  const q = [portalIdx];
  while (q.length) {
    const c = q.shift();
    for (let i = 0; i < pieces.length; i++) {
      if (!canVisitForPath(pieces, i)) continue;
      if (!(adj.get(i) || []).includes(c)) continue;
      if (pieceAge(pieces, c) <= pieceAge(pieces, i)) continue;
      if (!canReach.has(i)) {
        canReach.add(i);
        q.push(i);
      }
    }
  }
  return canReach;
}

// Generation spine: each step goes to the lowest-age neighbor that can still reach the portal.
export function findGenerationPath(adj, pieces, startIdx, targetIdx) {
  if (startIdx === -1 || targetIdx === -1) return null;
  if (!canVisitForPath(pieces, startIdx) || !canVisitForPath(pieces, targetIdx)) return null;

  const canReach = computeCanReachPortal(adj, pieces, targetIdx);
  if (!canReach.has(startIdx)) {
    console.log('[path] start cannot reach portal under age rules');
    return null;
  }

  const path = [startIdx];
  let cur = startIdx;
  const visited = new Set([startIdx]);

  while (cur !== targetIdx) {
    const candidates = (adj.get(cur) || []).filter(nb =>
      canVisitForPath(pieces, nb) &&
      !visited.has(nb) &&
      pieceAge(pieces, nb) > pieceAge(pieces, cur) &&
      canReach.has(nb)
    );

    if (!candidates.length) {
      console.log('[path] stuck at piece age', pieceAge(pieces, cur), pieces[cur].type);
      break;
    }

    candidates.sort((a, b) => pieceAge(pieces, a) - pieceAge(pieces, b));
    const next = candidates[0];
    path.push(next);
    visited.add(next);
    cur = next;
  }

  if (cur !== targetIdx) return null;

  console.log('[path] generation path', {
    len: path.length,
    ages: path.map(i => pieceAge(pieces, i)),
    types: path.map(i => pieces[i].type),
  });
  return path;
}

export function shortestPath(adj, startIdx, targetIdx, canVisit = () => true) {
  if (startIdx === -1 || targetIdx === -1) return null;
  if (!canVisit(startIdx) || !canVisit(targetIdx)) return null;
  const q = [startIdx];
  const prev = new Map();
  prev.set(startIdx, null);
  while (q.length) {
    const cur = q.shift();
    if (cur === targetIdx) break;
    for (const nb of adj.get(cur) || []) {
      if (!prev.has(nb) && canVisit(nb)) {
        prev.set(nb, cur);
        q.push(nb);
      }
    }
  }
  if (!prev.has(targetIdx)) return null;
  const path = [];
  let cur = targetIdx;
  while (cur !== null) {
    path.push(cur);
    cur = prev.get(cur);
  }
  path.reverse();
  return path;
}

export function shortestPathAvoidingLibraries(adj, pieces, startIdx, targetIdx) {
  const path = findGenerationPath(adj, pieces, startIdx, targetIdx);
  if (path) return path;

  const fallback = shortestPath(adj, startIdx, targetIdx, i => canVisitForPath(pieces, i));
  if (fallback) {
    console.log('[path] fallback (hop-only)', { len: fallback.length, ages: fallback.map(i => pieceAge(pieces, i)) });
    return fallback;
  }
  console.log('[path] no route', { startIdx, targetIdx });
  return null;
}

// Shortest hop path: allows SmallCorridor, no generation-order age constraint.
export function shortestPathOptimalToPortal(adj, pieces, startIdx, targetIdx) {
  const path = shortestPath(adj, startIdx, targetIdx, i => canVisitForOptimalPath(pieces, i));
  if (path) {
    console.log('[path] optimal', { len: path.length, ages: path.map(i => pieceAge(pieces, i)) });
    return path;
  }
  console.log('[path] no optimal route', { startIdx, targetIdx });
  return null;
}

export function buildPathPoints(pieces, pathIdx, toVector3) {
  const points = [];
  for (let i = 0; i < pathIdx.length; i++) {
    const piece = pieces[pathIdx[i]];
    const prev = i > 0 ? pieces[pathIdx[i - 1]] : null;
    const next = i < pathIdx.length - 1 ? pieces[pathIdx[i + 1]] : null;
    let entranceDir = null;
    if (isFiveWay(piece) && prev) {
      entranceDir = connectionDirectionFromFiveWay(piece, prev);
    }
    let xz;
    if (isPrisonHall(piece)) {
      if (prev && next) {
        const fromC = centerXZ(prev);
        const toC = centerXZ(next);
        xz = { x: (fromC.x + toC.x) / 2, z: (fromC.z + toC.z) / 2 };
      } else {
        xz = pathingCenterXZ(piece, prev, entranceDir);
      }
    } else {
      xz = pathingCenterXZ(piece, prev, entranceDir);
    }
    const y = (piece.minY + piece.maxY) / 2;
    points.push(toVector3(xz.x, y, xz.z));
  }
  return points;
}
