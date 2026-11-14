import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import WebSocket from 'ws';
import { TOOL_STATION, LIGHT_SWITCH, nearestMess } from '../public/interactions.js';
import { blockedPoint } from '../nav.js';
import { maintMethods } from '../maint.js';

test('interaction locations are solid and mess is selected within reach', () => {
  assert.ok(blockedPoint(TOOL_STATION.x, TOOL_STATION.z, 0));
  assert.ok(blockedPoint(LIGHT_SWITCH.x, LIGHT_SWITCH.z, 0));
  const near = { x: 1, z: 0 }, far = { x: 2, z: 0 };
  assert.equal(nearestMess(0, 0, [far, near]), near);
  assert.equal(nearestMess(0, 0, [far]), null);
});

test('maintenance does not remove another item when a player already cleaned its target', () => {
  const target = { x: 0, z: 0 }, other = { x: 1, z: 1 };
  const world = { litter: [other], radio() {}, place() { return 'plaza'; } };
  for (const type of ['litter', 'spill']) {
    const npc = { task: { type, e: target, x: 0, z: 0 }, bag: 0, duty: 'cleaner' };
    maintMethods.finishTask.call(world, npc);
    assert.deepEqual(world.litter, [other]);
  }
});

test('tools, cleanup and switch are validated and synchronized across players', async t => {
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => server.kill());
  await new Promise((resolve, reject) => {
    server.stdout.once('data', resolve); server.once('error', reject);
    server.once('exit', code => reject(new Error(`server exited: ${code}`)));
  });
  const connect = async name => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    t.after(() => ws.terminate());
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    const welcome = wait(ws, 'welcome');
    ws.send(JSON.stringify({ t: 'join', name }));
    return { ws, welcome: await welcome };
  };
  const wait = (ws, type, predicate = () => true) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', onMessage); reject(new Error(`timed out waiting for ${type}`)); }, 3000);
    const onMessage = data => {
      const m = JSON.parse(data);
      if (m.t === type && predicate(m)) { clearTimeout(timer); ws.off('message', onMessage); resolve(m); }
    };
    ws.on('message', onMessage);
  });
  const send = (ws, msg) => ws.send(JSON.stringify(msg));
  const move = (ws, x, z) => send(ws, { t: 'move', x, z, ry: 0, s: {} });
  const a = await connect('Cleaner'), b = await connect('Observer');

  let note = wait(a.ws, 'note');
  send(a.ws, { t: 'interact', action: 'clean' });
  assert.match((await note).text, /tool/i);
  note = wait(a.ws, 'note');
  send(a.ws, { t: 'interact', action: 'switch' });
  assert.match((await note).text, /closer/i);
  move(a.ws, 5, 6);
  const toolA = wait(a.ws, 'tool'), toolB = wait(b.ws, 'tool');
  send(a.ws, { t: 'interact', action: 'tool' });
  assert.equal((await toolA).equipped, true);
  assert.equal((await toolB).id, a.welcome.id);

  const late = await connect('Late arrival');
  assert.equal(late.welcome.players.find(p => p.id === a.welcome.id).tool, true);
  note = wait(a.ws, 'note');
  send(a.ws, { t: 'grab' });
  assert.match((await note).text, /return the cleaning tool/i);

  move(a.ws, 10, 4);
  const litterSnapshot = wait(a.ws, 'npcs', m => m.l.some(item => Math.hypot(item[1] - 10, item[2] - 4) < 0.3));
  send(a.ws, { t: 'act', a: 'litter' });
  const litter = (await litterSnapshot).l.find(item => Math.hypot(item[1] - 10, item[2] - 4) < 0.3);
  const cleanA = wait(a.ws, 'cleaned', m => m.litterId === litter[0]);
  const cleanB = wait(b.ws, 'cleaned', m => m.litterId === litter[0]);
  send(a.ws, { t: 'interact', action: 'clean' });
  assert.equal((await cleanA).id, a.welcome.id);
  assert.equal((await cleanB).litterId, litter[0]);

  move(a.ws, -5, 6);
  const lightA = wait(a.ws, 'plaza-light'), lightB = wait(b.ws, 'plaza-light');
  send(a.ws, { t: 'interact', action: 'switch' });
  assert.equal((await lightA).on, true);
  assert.equal((await lightB).on, true);
  const later = await connect('Another arrival');
  assert.equal(later.welcome.plazaLightOn, true);
  const off = wait(b.ws, 'plaza-light');
  send(a.ws, { t: 'interact', action: 'switch' });
  assert.equal((await off).on, false);
  move(a.ws, 5, 6);
  const returned = wait(b.ws, 'tool');
  send(a.ws, { t: 'interact', action: 'tool' });
  assert.equal((await returned).equipped, false);
});
