// Shared ground model (used by the server for NPC speed and by the client for rendering and balance).
export const HILLS = [{ x: -52, z: -8, r: 15, h: 3.4 }, { x: 48, z: -48, r: 14, h: 2.4 }];
export const MUD = [{ x: 52, z: 12, r: 6 }, { x: -8, z: 52, r: 5 }];

const bump = (o, x, z) => { const d = Math.hypot(x - o.x, z - o.z); return d >= o.r ? 0 : o.h * 0.5 * (1 + Math.cos(Math.PI * d / o.r)); };
export const heightAt = (x, z) => { let y = 0; for (const o of HILLS) y += bump(o, x, z); return y; };

export function gradientAt(x, z) {
  const e = 0.3;
  return [(heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e), (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e)];
}
// rise per metre travelled in the unit direction (dx, dz): positive is uphill
export const slopeAlong = (x, z, dx, dz) => { const [gx, gz] = gradientAt(x, z); return gx * dx + gz * dz; };
export const steepness = (x, z) => Math.hypot(...gradientAt(x, z));
export const onMud = (x, z) => MUD.some(o => Math.hypot(x - o.x, z - o.z) < o.r);
