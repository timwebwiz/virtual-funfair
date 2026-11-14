// Shared positions and reach distances for server-validated park interactions.
export const TOOL_STATION = { id: 'tool-station', name: 'cleaning tool station', x: 5, z: 4, kind: 'tool', ht: 0.6, hr: 0.6 };
export const LIGHT_SWITCH = { id: 'light-switch', name: 'plaza light switch', x: -5, z: 4, kind: 'switch', ht: 0.5, hr: 0.5 };
export const INTERACTION_RANGE = 2.8;
export const CLEAN_RANGE = 2;

export function nearestMess(x, z, mess, range = CLEAN_RANGE) {
  let best = null, distance = range;
  for (const item of mess) {
    const d = Math.hypot(item.x - x, item.z - z);
    if (d < distance) { best = item; distance = d; }
  }
  return best;
}
