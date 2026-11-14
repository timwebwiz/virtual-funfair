// Buildings face toward -Z; their entrance corridors are kept free of loose objects.
export const BUILDINGS = [
  { id: 'hospital', name: 'Park Hospital', x: 45, z: 45, width: 12, depth: 10, height: 8, doorWidth: 4, color: '#eef3f7', roof: '#2a9d8f' },
  { id: 'depot', name: 'Maintenance Depot', x: -45, z: 45, width: 10, depth: 8, height: 5, doorWidth: 4, color: '#c9a227', roof: '#444444' }
];
export const DOORS = BUILDINGS.map(b => ({ id: b.id, name: b.name, x: b.x, z: b.z - b.depth / 2, width: b.doorWidth }));
export const DOOR_REACH = 2.8;
export const WALL_THICKNESS = 0.3;

export function doorById(id) { return DOORS.find(d => d.id === id); }
export function nearestDoor(x, z, range = DOOR_REACH) {
  let best = null, distance = range;
  for (const door of DOORS) {
    const d = Math.hypot(x - door.x, z - door.z);
    if (d < distance) { best = door; distance = d; }
  }
  return best;
}

export function inDoorwayClearance(x, z, radius = 0) {
  return DOORS.some(d => Math.abs(x - d.x) < d.width / 2 + 0.7 + radius && Math.abs(z - d.z) < 3 + radius);
}

// Whether a movement segment crosses the doorway plane within its opening.
export function crossesDoor(door, x1, z1, x2, z2, margin = 0) {
  if ((z1 - door.z) * (z2 - door.z) > 0 || z1 === z2) return false;
  const t = (door.z - z1) / (z2 - z1);
  return t >= 0 && t <= 1 && Math.abs(x1 + (x2 - x1) * t - door.x) < door.width / 2 + margin;
}

export function doorObstacle(door) {
  return { x: door.x, z: door.z, ht: WALL_THICKNESS / 2, hr: door.width / 2, tx: 0, tz: 1, rx: 1, rz: 0 };
}

export function doorOccupied(door, entities) {
  return entities.some(q => Math.abs(q.x - door.x) < door.width / 2 + 0.5 && Math.abs(q.z - door.z) < 1);
}

export function closedDoorBlocks(doors, state, x1, z1, x2, z2, margin = 0.3) {
  return doors.some(d => {
    if (state[d.id]) return false;
    const o = doorObstacle(d);
    return crossesDoor(d, x1, z1, x2, z2, margin) ||
      (Math.abs(x2 - o.x) < o.hr + margin && Math.abs(z2 - o.z) < o.ht + margin);
  });
}
