const PROBE_ANGLES_DEG = [0, 30, 60, 90, 120];
const PROBE_RADIUS = 2048.0;

function dist(a, b) {
    const dx = a[0] - b[0];
    const dz = a[1] - b[1];
    return Math.hypot(dx, dz);
}

function probe_pos_minecraft_yaw(yaw_deg, radius = PROBE_RADIUS) {
    // Minecraft yaw:
    // 0   = south (+Z)
    // 90  = west  (-X)
    // 180 = north (-Z)
    // 270 = east  (+X)
    const theta = (yaw_deg * Math.PI) / 180;
    const x = -radius * Math.sin(theta);
    const z = radius * Math.cos(theta);
    return [x, z];
}

function pick_stronghold(strongholds) {
    let best = null;

    for (const angle of PROBE_ANGLES_DEG) {
        const p = probe_pos_minecraft_yaw(angle);

        // find nearest stronghold to probe position (use world block coords)
        let nearestIdx = 0;
        let nearestDist = Infinity;
        for (let i = 0; i < strongholds.length; i++) {
            const sh = strongholds[i];
            const shPos = [sh.x, sh.z];
            const d = dist(p, shPos);
            if (d < nearestDist) {
                nearestDist = d;
                nearestIdx = i;
            }
        }

        const nearestSh = strongholds[nearestIdx];
        const candidate = [nearestDist, angle, p, nearestSh, nearestIdx];
        if (best === null || candidate[0] < best[0]) {
            best = candidate;
        }
    }

    return best;
}

/**
 * strongholds: Array of objects { x:number, z:number, chunkX:number, chunkZ:number }
 * returns: { best_angle, best_probe_pos, best_stronghold, best_stronghold_idx, best_distance }
 */
function get_mpk_stronghold(strongholds) {
    if (!Array.isArray(strongholds) || strongholds.length === 0) return null;
    const best = pick_stronghold(strongholds);
    if (!best) return null;
    return {
        best_angle: best[1],
        best_probe_pos: best[2],
        best_stronghold: best[3],
        best_stronghold_idx: best[4],
        best_distance: best[0]
    };
}

export { get_mpk_stronghold };