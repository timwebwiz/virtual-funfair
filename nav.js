import { SPOTS } from './public/senses.js';
import { ITEMS } from './public/items.js';
// Grid navigation: static obstacles (rides, booths, stations, hospital) + A* with line-of-sight smoothing.
const MIN = -80, N = 160; // 1 m cells covering -80..80

const rect = (x, z, ht, hr, ang) => ({ x, z, ht, hr, tx: -Math.sin(ang), tz: Math.cos(ang), rx: Math.cos(ang), rz: Math.sin(ang) });
const circle = (x, z, r) => ({ x, z, r });

export const STATIONS = [{ x: -24, z: 14, name: 'First Aid Station A' }, { x: 24, z: 10, name: 'First Aid Station B' }, { x: 0, z: -24, name: 'First Aid Station C' }];
export const HOSPITAL = { x: 45, z: 45, name: 'Park Hospital' };
export const HOSP_DOOR = [44, 38];
export const AMB_BAY = [30, 38];
export const DEPOT = { x: -45, z: 45, name: 'Maintenance Depot' };

export const OBSTACLES = [
  rect(-30, -30, 4.5, 1.2, 0),            // ferris wheel base/legs
  circle(30, -20, 6.5),                   // carousel
  rect(HOSPITAL.x, HOSPITAL.z, 5.5, 6.5, 0),
  rect(DEPOT.x, DEPOT.z, 4, 5, 0),
  ...Array.from({ length: 6 }, (_, i) => { const a = i / 6 * Math.PI * 2; return rect(Math.cos(a) * 18, Math.sin(a) * 18, 2, 1.5, a); }), // booths
  ...SPOTS.map(p => rect(p.x, p.z, 0.8, 1.1, 0)), // food stands
  ...ITEMS.map(i => rect(i.x, i.z, i.ht, i.hr, 0)), // fountain, strength tester, bench, mural
  ...STATIONS.map(s => rect(s.x, s.z, 2.5, 2, Math.atan2(s.z, s.x)))
];

// point in front of a building (towards park centre) where staff can stand
export const front = (s, d = 4.5) => { const l = Math.hypot(s.x, s.z) || 1; return [s.x - s.x / l * d, s.z - s.z / l * d]; };

const hit = (o, x, z, m) => {
  const dx = x - o.x, dz = z - o.z;
  if (o.r !== undefined) return Math.hypot(dx, dz) < o.r + m;
  return Math.abs(dx * o.tx + dz * o.tz) < o.ht + m && Math.abs(dx * o.rx + dz * o.rz) < o.hr + m;
};
export const blockedPoint = (x, z, m) => OBSTACLES.some(o => hit(o, x, z, m));

const grids = {};
const grid = margin => grids[margin] || (grids[margin] = (() => {
  const g = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) g[j * N + i] = blockedPoint(MIN + i + 0.5, MIN + j + 0.5, margin) ? 1 : 0;
  return g;
})());
const cell = v => Math.max(0, Math.min(N - 1, Math.floor(v - MIN)));

const free = (g, x, z) => !g[cell(z) * N + cell(x)];
const clear = (g, x0, z0, x1, z1) => {
  const d = Math.hypot(x1 - x0, z1 - z0), steps = Math.ceil(d / 0.4);
  for (let s = 1; s <= steps; s++) { const t = s / steps; if (!free(g, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false; }
  return true;
};
const nearestFree = (g, x, z) => {
  const ci = cell(x), cj = cell(z);
  if (!g[cj * N + ci]) return [ci, cj];
  let best = null, bd = 1e9;
  for (let r = 1; r < 40 && !best; r++) {
    for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
      if (i < 0 || j < 0 || i >= N || j >= N || g[j * N + i]) continue;
      const d = Math.hypot(MIN + i + 0.5 - x, MIN + j + 0.5 - z); if (d < bd) { bd = d; best = [i, j]; }
    }
  }
  return best;
};

class Heap {
  constructor() { this.a = []; }
  push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, s = i; if (l < a.length && a[l][0] < a[s][0]) s = l; if (r < a.length && a[r][0] < a[s][0]) s = r; if (s === i) break; [a[s], a[i]] = [a[i], a[s]]; i = s; } }
    return top;
  }
  get size() { return this.a.length; }
}

const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

// returns { path: [[x,z],...] (excluding start), goal: [x,z] (snapped to a reachable free spot), snapped }
export function findPath(sx, sz, gx, gz, margin = 0.9, extra = []) {
  let g = grid(margin);
  if (extra.length) { // movable obstacles (crates): block the cells they cover for this search only
    g = g.slice();
    for (const c of extra) {
      const r = (c.r || 0.6) + margin * 0.5, i0 = cell(c.x - r), i1 = cell(c.x + r), j0 = cell(c.z - r), j1 = cell(c.z + r);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (Math.hypot(MIN + i + 0.5 - c.x, MIN + j + 0.5 - c.z) < r + 0.5) g[j * N + i] = 1;
    }
  }
  const goalCell = nearestFree(g, gx, gz), startCell = nearestFree(g, sx, sz);
  if (!goalCell || !startCell) return { path: [], goal: [sx, sz], snapped: true };
  const goalFree = free(g, gx, gz);
  const goal = goalFree ? [gx, gz] : [MIN + goalCell[0] + 0.5, MIN + goalCell[1] + 0.5];
  const snapped = Math.hypot(goal[0] - gx, goal[1] - gz) > 0.5;
  if (free(g, sx, sz) && clear(g, sx, sz, goal[0], goal[1])) return { path: [goal], goal, snapped };

  const idx = (i, j) => j * N + i, start = idx(...startCell), end = idx(...goalCell);
  const gs = new Float32Array(N * N).fill(1e9), parent = new Int32Array(N * N).fill(-1), done = new Uint8Array(N * N);
  const h = (i, j) => { const dx = Math.abs(i - goalCell[0]), dz = Math.abs(j - goalCell[1]); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  const open = new Heap(); gs[start] = 0; open.push(h(...startCell), start);
  let expanded = 0, found = false;
  while (open.size && expanded++ < 25000) {
    const cur = open.pop()[1]; if (done[cur]) continue; done[cur] = 1;
    if (cur === end) { found = true; break; }
    const ci = cur % N, cj = (cur / N) | 0;
    for (const [di, dj, c] of DIRS) {
      const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const n = idx(ni, nj); if (g[n] || done[n]) continue;
      if (di && dj && (g[idx(ci + di, cj)] || g[idx(ci, cj + dj)])) continue; // no corner cutting
      const ng = gs[cur] + c; if (ng < gs[n]) { gs[n] = ng; parent[n] = cur; open.push(ng + h(ni, nj), n); }
    }
  }
  if (!found) return { path: [], goal: [sx, sz], snapped: true };
  const pts = []; for (let c = end; c !== -1; c = parent[c]) pts.push([MIN + (c % N) + 0.5, MIN + ((c / N) | 0) + 0.5]);
  pts.reverse(); pts[pts.length - 1] = goal;
  // smooth: skip waypoints while line of sight stays clear
  const out = []; let a = [sx, sz], k = 0;
  while (k < pts.length) {
    let far = k;
    for (let m = pts.length - 1; m > k; m--) if (clear(g, a[0], a[1], pts[m][0], pts[m][1])) { far = m; break; }
    out.push(pts[far]); a = pts[far]; k = far + 1;
  }
  return { path: out, goal, snapped };
}

export const isBlocked = (x, z, margin = 0.9) => !free(grid(margin), x, z);
