// Simple pathfinder for room pieces.
// Exports: buildGraph(pieces) -> { nodes: [], adj: Map(index->Array(indexes)), startIndex, portalIndex }
// shortestPath(adj, startIdx, targetIdx) -> Array of node indices using BFS (unweighted shortest path)

export function buildGraph(pieces) {
  const nodes = pieces.map((p, i) => ({ ...p, index: i }));
  const adj = new Map();

  function overlapLength(a0, a1, b0, b1) {
    return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  }

  function centerXZ(piece) {
    return {
      x: (piece.minX + piece.maxX) / 2,
      z: (piece.minZ + piece.maxZ) / 2,
    };
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

    const centerA = centerXZ(a);
    const centerB = centerXZ(b);
    const centerTol = 2;

    const xFaceTouch = xDist <= 1 && zOverlap >= 2 && Math.abs(centerA.z - centerB.z) <= centerTol;
    const zFaceTouch = zDist <= 1 && xOverlap >= 2 && Math.abs(centerA.x - centerB.x) <= centerTol;

    // Reject corner-only contact where both axes are within touch distance.
    if (xDist <= 1 && zDist <= 1 && !(xFaceTouch || zFaceTouch)) {
      return false;
    }

    return xFaceTouch || zFaceTouch;
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
  if (!path) return null;
  if (!path.some(i => pieces[i].type === 'Library')) return path;
  const noLibrary = (i) => pieces[i].type !== 'Library';
  return shortestPath(adj, startIdx, targetIdx, noLibrary);
}
