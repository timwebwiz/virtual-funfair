import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import WebSocket from 'ws';
import { APPEARANCE_OPTIONS } from '../public/appearance.js';
import { buildAvatar, defaultAvatar, animateAvatar } from '../public/avatar.js';

test('all wardrobe options build and animate, and old descriptors retain defaults', () => {
  const defaults = defaultAvatar();
  for (const [key, choices] of Object.entries(APPEARANCE_OPTIONS)) {
    assert.equal(defaults[key], choices[0]);
    for (const choice of choices) {
      const model = buildAvatar({ [key]: choice });
      assert.ok(model.getObjectByName('armL'), `${key}: ${choice}`);
      assert.ok(model.getObjectByName('legR'), `${key}: ${choice}`);
      assert.doesNotThrow(() => animateAvatar(model, 1, { moving: true, mood: 'happy' }));
    }
  }
  const old = buildAvatar({ shirt: '#123456', hat: '#ffd400' });
  assert.ok(old.getObjectByName('headPivot'));
});

test('new wardrobe selections change the rendered geometry', () => {
  const signature = model => {
    const meshes = [];
    model.traverse(o => {
      if (o.isMesh) meshes.push([o.geometry.type, o.position.x, o.position.y, o.position.z, o.material.color?.getHexString()]);
    });
    return JSON.stringify(meshes);
  };
  const base = signature(buildAvatar({}));
  for (const [key, choices] of Object.entries({
    hairStyle: ['ponytail', 'curly'], shirtStyle: ['tank', 'jacket'], pantsStyle: ['skirt'],
    hat: ['sunhat'], glasses: ['square'], pattern: ['stripe', 'star'],
    footwear: ['boots', 'sneakers'], neckwear: ['scarf', 'necklace'], wristwear: ['bracelet', 'watch']
  })) {
    for (const choice of choices) assert.notEqual(signature(buildAvatar({ [key]: choice })), base, `${key}: ${choice}`);
  }
});

test('wardrobe selections survive multiplayer join and avatar updates', async t => {
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => server.kill());
  await new Promise((resolve, reject) => {
    server.stdout.once('data', resolve);
    server.once('error', reject);
    server.once('exit', code => reject(new Error(`server exited: ${code}`)));
  });
  const connect = async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    t.after(() => ws.terminate());
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    return ws;
  };
  const message = (ws, type) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', onMessage); reject(new Error(`timed out waiting for ${type}`)); }, 3000);
    const onMessage = data => {
      const m = JSON.parse(data);
      if (m.t === type) { clearTimeout(timer); ws.off('message', onMessage); resolve(m); }
    };
    ws.on('message', onMessage);
  });
  const observer = await connect();
  const welcome = message(observer, 'welcome');
  observer.send(JSON.stringify({ t: 'join', name: 'Observer', avatar: defaultAvatar() }));
  await welcome;
  const player = await connect();
  const join = message(observer, 'join');
  const choices = { hairStyle: 'curly', shirtStyle: 'jacket', pantsStyle: 'skirt', pattern: 'star', footwear: 'boots', hat: 'sunhat', glasses: 'square', neckwear: 'scarf', wristwear: 'watch' };
  player.send(JSON.stringify({ t: 'join', name: 'Player', avatar: { ...defaultAvatar(), ...choices } }));
  const joined = (await join).player.avatar;
  for (const [key, value] of Object.entries(choices)) assert.equal(joined[key], value);
  const update = message(observer, 'avatar');
  player.send(JSON.stringify({ t: 'avatar', avatar: { ...defaultAvatar(), ...choices, pattern: 'invalid', neckwear: 'necklace' } }));
  const changed = (await update).avatar;
  assert.equal(changed.pattern, 'plain');
  assert.equal(changed.neckwear, 'necklace');
  assert.equal(changed.footwear, 'boots');
});
