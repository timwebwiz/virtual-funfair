import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import WebSocket from 'ws';
import { BUILDINGS, DOORS, crossesDoor, inDoorwayClearance, nearestDoor } from '../public/doors.js';
import { blockedPoint, crossesBuildingWall, findPath } from '../nav.js';
import { World } from '../npc.js';
import { Crates } from '../stockroom.js';
import { ITEMS } from '../public/items.js';
import { SPOTS } from '../public/senses.js';

test('doors have clear passages on both sides and no fixed or initial loose objects', () => {
  const crates = new Crates();
  for (const door of DOORS) {
    assert.equal(nearestDoor(door.x, door.z - 2).id, door.id);
    assert.equal(nearestDoor(door.x, door.z + 2).id, door.id);
    for (let z = door.z - 3; z <= door.z + 3; z += 0.25) for (const x of [door.x - 1.3, door.x, door.x + 1.3])
      assert.equal(blockedPoint(x, z, 0.4), false, `${door.id} at ${x}, ${z}`);
    assert.equal(crossesBuildingWall(door.x, door.z - 3, door.x, door.z + 3), false);
    assert.equal(crossesBuildingWall(door.x + door.width / 2 + 1, door.z - 3, door.x + door.width / 2 + 1, door.z + 3), true);
    for (const direction of [-1, 1]) {
      const path = findPath(door.x, door.z + 3 * direction, door.x, door.z - 3 * direction);
      assert.equal(path.snapped, false);
      assert.ok(path.path.length);
    }
    for (const obj of [...ITEMS, ...SPOTS, ...crates.list]) {
      assert.equal(inDoorwayClearance(obj.x, obj.z, Math.max(obj.ht || 0, obj.hr || 0, obj.w ? 0.6 : 0)), false, `${door.id}: ${obj.name || obj.id}`);
    }
    assert.ok(crossesDoor(door, door.x, door.z - 1, door.x, door.z + 1));
  }
  assert.equal(BUILDINGS.length, 2);
});

test('NPCs open and walk through each door in both directions', () => {
  const events = [], world = new World(new Map(), event => events.push(event));
  for (const door of DOORS) for (const direction of [-1, 1]) {
    world.doors[door.id] = false;
    const n = { id: 777, role: 'visitor', x: door.x, z: door.z + direction * 3, ry: 0, state: 'walk', spd: 1 };
    world.npcs.push(n);
    world.goTo(n, door.x, door.z - direction * 3);
    for (let i = 0; i < 200 && !n.arrived; i++) world.move(n, 0.1);
    assert.ok(n.arrived, `${door.id} direction ${direction}`);
    assert.ok(Math.abs(n.z - (door.z - direction * 3)) < 0.5);
    assert.equal(world.doors[door.id], true);
    assert.ok(events.some(e => e.t === 'door' && e.id === door.id && e.npc === n.id));
    const occupant = { id: 21, x: door.x, z: door.z };
    world.players.set(occupant.id, occupant);
    world.closeNpcDoors();
    assert.equal(world.doors[door.id], true);
    world.players.delete(occupant.id);
    world.closeNpcDoors();
    assert.equal(world.doors[door.id], false);
    assert.ok(events.some(e => e.t === 'door' && e.id === door.id && e.npc === n.id && !e.open));
    world.npcs.pop();
  }
});

test('crate drops and litter cannot block doorways, including disconnect relocation', () => {
  const crates = new Crates(), door = DOORS[0];
  const crate = crates.list[0], p = { id: 31, x: door.x, z: door.z - 1, ry: 0 };
  crate.by = p.id;
  assert.equal(crates.drop(p), null);
  assert.equal(crate.by, p.id);
  const relocated = crates.drop(p, { relocate: true });
  assert.ok(relocated);
  assert.equal(inDoorwayClearance(relocated.x, relocated.z, 0.6), false);
  const world = new World(new Map(), () => {});
  assert.equal(world.dropLitter(door.x, door.z), null);
});

test('door state is shared, validated, and supports passage from either side', async t => {
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => server.kill());
  await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(new Error(`server exited: ${code}`))); });
  const wait = (ws, type, predicate = () => true) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', onMessage); reject(new Error(`timed out waiting for ${type}`)); }, 4000);
    const onMessage = data => { const m = JSON.parse(data); if (m.t === type && predicate(m)) { clearTimeout(timer); ws.off('message', onMessage); resolve(m); } };
    ws.on('message', onMessage);
  });
  const send = (ws, m) => ws.send(JSON.stringify(m));
  const connect = async name => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    t.after(() => ws.terminate());
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    const welcome = wait(ws, 'welcome'); send(ws, { t: 'join', name });
    return { ws, welcome: await welcome };
  };
  const a = await connect('Walker'), b = await connect('Observer'), d = DOORS[0];
  const update = (x, z) => send(a.ws, { t: 'move', x, z, ry: 0, s: {} });
  const doorAction = () => send(a.ws, { t: 'interact', action: 'door', id: d.id });
  let note = wait(a.ws, 'note'); doorAction();
  assert.match((await note).text, /closer/);
  update(d.x, d.z - 2);
  let broadcast = wait(b.ws, 'door', m => m.id === d.id);
  doorAction(); assert.equal((await broadcast).open, true);
  const late = await connect('Late');
  assert.equal(late.welcome.doors[d.id], true);
  let move = wait(b.ws, 'move', m => m.id === a.welcome.id);
  update(d.x, d.z + 2); assert.equal((await move).z, d.z + 2);
  broadcast = wait(b.ws, 'door', m => m.id === d.id);
  doorAction(); assert.equal((await broadcast).open, false);
  move = wait(b.ws, 'move', m => m.id === a.welcome.id);
  const correction = wait(a.ws, 'position');
  update(d.x, d.z - 2); assert.equal((await move).z, d.z + 2);
  assert.equal((await correction).z, d.z + 2);
  broadcast = wait(b.ws, 'door', m => m.id === d.id);
  doorAction(); assert.equal((await broadcast).open, true);
  move = wait(b.ws, 'move', m => m.id === a.welcome.id);
  update(d.x, d.z); assert.equal((await move).z, d.z);
  note = wait(a.ws, 'note'); doorAction();
  assert.match((await note).text, /occupied/);
  move = wait(b.ws, 'move', m => m.id === a.welcome.id);
  update(d.x, d.z - 2); assert.equal((await move).z, d.z - 2);
  broadcast = wait(b.ws, 'door', m => m.id === d.id);
  doorAction(); assert.equal((await broadcast).open, false);
});
