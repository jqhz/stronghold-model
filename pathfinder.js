// Simple pathfinder for room pieces.
// Exports: buildGraph(pieces) -> { nodes: [], adj: Map(index->Array(indexes)), startIndex, portalIndex }
// shortestPath(adj, startIdx, targetIdx) -> Array of node indices using BFS (unweighted shortest path)

export function isPrisonHall(piece) {
  return piece.type === 'PrisonHall';
}

export function isFiveWay(piece) {
  return piece.type === 'FiveWayCrossing';
}

// Corridor alignment coords for each 5-way arm (two openings per corner extension).
// Values are taken from the 5-way bbox per orientation; the checked axis is perpendicular to the
// connection face (N/S → X, E/W → Z) using the same min/max offsets from the spec.
function fiveWayExtensionCoords(fiveWay, direction) {
  const minX = Math.min(fiveWay.minX, fiveWay.maxX);
  const maxX = Math.max(fiveWay.minX, fiveWay.maxX);
  const minZ = Math.min(fiveWay.minZ, fiveWay.maxZ);
  const maxZ = Math.max(fiveWay.minZ, fiveWay.maxZ);
  switch (direction) {
    case 'N':
      return { axis: 'x', values: [maxX - 2, maxX - 8] };
    case 'S':
      return { axis: 'x', values: [minX + 2, minX + 8] };
    case 'E':
      return { axis: 'z', values: [minZ + 2, minZ + 8] };
    case 'W':
      return { axis: 'z', values: [maxZ - 2, maxZ - 8] };
    default:
      return null;
  }
}

// Literal spec labels (for debug logging).
function fiveWayExtensionSpec(fiveWay, direction) {
  const minX = Math.min(fiveWay.minX, fiveWay.maxX);
  const maxX = Math.max(fiveWay.minX, fiveWay.maxX);
  const minZ = Math.min(fiveWay.minZ, fiveWay.maxZ);
  const maxZ = Math.max(fiveWay.minZ, fiveWay.maxZ);
  switch (direction) {
    case 'N': return { label: 'maxZ-2,maxZ-8', values: [maxZ - 2, maxZ - 8] };
    case 'S': return { label: 'minZ+2,minZ+8', values: [minZ + 2, minZ + 8] };
    case 'E': return { label: 'minX+2,minX+8', values: [minX + 2, minX + 8] };
    case 'W': return { label: 'maxX-2,maxX-8', values: [maxX - 2, maxX - 8] };
    default: return null;
  }
}

function connectionDirectionFromFiveWay(fiveWay, other) {
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

  // Use the face that actually touches (avoids mis-labeling corner contacts as E/W).
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

function centerXZ(piece) {
  return {
    x: (piece.minX + piece.maxX) / 2,
    z: (piece.minZ + piece.maxZ) / 2,
  };
}

function alignsWithFiveWayExtension(fiveWay, other, direction, centerTol) {
  const ext = fiveWayExtensionCoords(fiveWay, direction);
  if (!ext) return false;
  const nb = centerXZ(other);
  const lo = ext.axis === 'x'
    ? Math.min(other.minX, other.maxX)
    : Math.min(other.minZ, other.maxZ);
  const hi = ext.axis === 'x'
    ? Math.max(other.minX, other.maxX)
    : Math.max(other.minZ, other.maxZ);
  const coord = ext.axis === 'x' ? nb.x : nb.z;
  const centerMatch = ext.values.some(v => Math.abs(coord - v) <= centerTol);
  const bboxMatch = ext.values.some(v => v >= lo - centerTol && v <= hi + centerTol);
  return centerMatch || bboxMatch;
}

function standardPerpendicularAligned(a, b, xFaceTouch, zFaceTouch, centerTol) {
  const centerA = centerXZ(a);
  const centerB = centerXZ(b);
  const xFaceAligned = xFaceTouch && Math.abs(centerA.z - centerB.z) <= centerTol;
  const zFaceAligned = zFaceTouch && Math.abs(centerA.x - centerB.x) <= centerTol;
  return xFaceAligned || zFaceAligned;
}

export function pieceChunkPos(piece) {
  const cx = (piece.minX + piece.maxX) / 2;
  const cz = (piece.minZ + piece.maxZ) / 2;
  return { x: Math.floor(cx / 16), z: Math.floor(cz / 16) };
}

// PrisonHall bbox centers are offset by the jail; for chunk/culling steps skip them and
// bridge from the previous non–PrisonHall room to the next (piece path still includes them).
export function buildChunkPathSkippingPrisonHalls(pieces, pathIdx) {
  const chunkPath = [];
  for (const idx of pathIdx) {
    if (isPrisonHall(pieces[idx])) continue;
    const c = pieceChunkPos(pieces[idx]);
    const prev = chunkPath[chunkPath.length - 1];
    if (!prev || prev.x !== c.x || prev.z !== c.z) {
      chunkPath.push(c);
    }
  }
  return chunkPath;
}

export function buildGraph(pieces) {
  const nodes = pieces.map((p, i) => ({ ...p, index: i }));
  const adj = new Map();

  function overlapLength(a0, a1, b0, b1) {
    return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  }

  // Cardinal face adjacency only: touching on one horizontal axis, overlapping on the
  // other, Y overlap, and room centers aligned on the corridor axis (no corner cuts).
  function boxesAdjacent(a, b) {
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

    if (yOverlap <= 0) return false;

    const centerTol = 2;
    const xFaceTouch = xDist <= 1 && zOverlap >= 2;
    const zFaceTouch = zDist <= 1 && xOverlap >= 2;

    // PrisonHall centers are shifted by the jail wing; use face overlap only for those links.
    if (isPrisonHall(a) || isPrisonHall(b)) {
      if (xDist <= 1 && zDist <= 1 && !(xFaceTouch || zFaceTouch)) {
        return false;
      }
      return xFaceTouch || zFaceTouch;
    }

    const fiveWay = isFiveWay(a) ? a : isFiveWay(b) ? b : null;
    if (fiveWay) {
      const other = fiveWay === a ? b : a;
      const dir = connectionDirectionFromFiveWay(fiveWay, other);
      const faceTouch = (dir === 'E' || dir === 'W') ? xFaceTouch : zFaceTouch;
      const extensionAligned = alignsWithFiveWayExtension(fiveWay, other, dir, centerTol);
      const fallbackAligned = standardPerpendicularAligned(fiveWay, other, xFaceTouch, zFaceTouch, centerTol);
      const aligned = extensionAligned || fallbackAligned;
      if (!faceTouch) {
        if (xDist <= 2 && zDist <= 2) {
          console.log('[adjacency] FiveWay face miss', {
            fiveWayIdx: fiveWay.index,
            otherType: other.type,
            dir,
            xDist,
            zDist,
            xOverlap,
            zOverlap,
          });
        }
        return false;
      }
      if (!aligned) {
        const ext = fiveWayExtensionCoords(fiveWay, dir);
        const nb = centerXZ(other);
        console.log('[adjacency] FiveWay alignment miss', {
          fiveWayIdx: fiveWay.index,
          otherType: other.type,
          dir,
          extension: ext,
          spec: fiveWayExtensionSpec(fiveWay, dir),
          otherCenter: nb,
          extensionAligned,
          fallbackAligned,
        });
        return false;
      }
      return true;
    }

    const centerA = centerXZ(a);
    const centerB = centerXZ(b);

    const xFaceAligned = xFaceTouch && Math.abs(centerA.z - centerB.z) <= centerTol;
    const zFaceAligned = zFaceTouch && Math.abs(centerA.x - centerB.x) <= centerTol;

    // Reject corner-only contact where both axes are within touch distance.
    if (xDist <= 1 && zDist <= 1 && !(xFaceAligned || zFaceAligned)) {
      return false;
    }

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

export function shortestPath(adj, startIdx, targetIdx, canVisit = () => true) {
  if (startIdx === -1 || targetIdx === -1) return null;
  if (!canVisit(startIdx) || !canVisit(targetIdx)) return null;
  const q = [startIdx];
  const prev = new Map();
  prev.set(startIdx, null);
  while (q.length) {
    const cur = q.shift();
    if (cur === targetIdx) break;
    const neighbors = adj.get(cur) || [];
    for (const nb of neighbors) {
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

// Shortest start→portal path; if the shortest route passes through a Library, use the
// shortest route that does not (libraries are not valid corridor connections).
export function shortestPathAvoidingLibraries(adj, pieces, startIdx, targetIdx) {
  const path = shortestPath(adj, startIdx, targetIdx);
  if (!path) {
    console.log('[path] no route', {
      startIdx,
      startType: pieces[startIdx]?.type,
      targetIdx,
      targetType: pieces[targetIdx]?.type,
      startNeighbors: (adj.get(startIdx) || []).length,
    });
    return null;
  }
  if (!path.some(i => pieces[i].type === 'Library')) return path;
  const noLibrary = (i) => pieces[i].type !== 'Library';
  const noLibPath = shortestPath(adj, startIdx, targetIdx, noLibrary);
  if (!noLibPath) {
    console.log('[path] no library-free route; using path with library', {
      startIdx,
      targetIdx,
      pathLen: path.length,
    });
    return path;
  }
  return noLibPath;
}
