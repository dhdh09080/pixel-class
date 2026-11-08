// Two isolated Docker network clients. This is a local topology check, not an external deployment.
import https from 'node:https';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import WebSocket from '/app/node_modules/ws/index.js';
const config = JSON.parse(readFileSync('/run/peer-config.json', 'utf8'));
const ca = readFileSync('/run/peer-ca.crt');
const origin = new URL(config.origin);
const authorization =
  'Basic ' + Buffer.from(`${config.gate.username}:${config.gate.password}`).toString('base64');
let cookie = '',
  address = '';
async function request(path, body, method = body === undefined ? 'GET' : 'POST') {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'https',
        port: 443,
        servername: 'localhost',
        ca,
        path: '/api' + path,
        method,
        headers: {
          Host: origin.host,
          Origin: origin.origin,
          Authorization: authorization,
          'X-Pixel-Class': '1',
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
      },
      (res) => {
        address = res.socket.localAddress;
        if (res.headers['set-cookie']) cookie = res.headers['set-cookie'][0].split(';')[0];
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (v) => (raw += v));
        res.on('end', () => {
          let data;
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
          resolve({ status: res.statusCode, data });
        });
      },
    );
    req.setTimeout(7000, () => req.destroy(Error('Peer HTTPS timeout')));
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(read, verify, label) {
  for (let i = 0; i < 80; i++) {
    const value = await read();
    if (verify(value)) return value;
    await pause(150);
  }
  throw Error(`Peer timed out: ${label}`);
}
assert.equal(
  (await request('/login', { email: config.email, password: config.password })).status,
  200,
);
const me = (await request('/state')).data.me;
const socket = new WebSocket('wss://https/socket', {
  servername: 'localhost',
  ca,
  headers: {
    Host: origin.host,
    Origin: origin.origin,
    Authorization: authorization,
    Cookie: cookie,
  },
});
const frames = [];
socket.on('message', (raw) => frames.push(JSON.parse(String(raw))));
socket.on('error', () => {});
try {
  await until(
    () => frames,
    (v) => v.some((x) => x.type === 'positions'),
    'initial WSS positions',
  );
  await until(
    () => request('/state'),
    (v) => v.data.online.length === 2,
    'two isolated peers',
  );
  if (config.role === 'MASTER') {
    assert.equal(
      (
        await request('/materials', {
          title: config.marker,
          description: 'Peer network lesson',
          category: '기초',
          visibility: 'ACTIVE',
          fileName: 'peer-lesson.txt',
          content: Buffer.from('두 컴퓨터 교안 검증').toString('base64'),
        })
      ).status,
      200,
    );
    const s = await until(
      () => request('/state'),
      (v) => v.data.projects.some((p) => p.title === config.marker),
      'student project',
    );
    const project = s.data.projects.find((p) => p.title === config.marker);
    assert.equal(
      (
        await request(`/projects/${project.id}/entries`, {
          type: 'feedback',
          text: 'PEER_FEEDBACK: 저장과 조회를 확인하세요.',
          kind: '다음 과제',
        })
      ).status,
      200,
    );
    await until(
      () => frames,
      (v) => v.some((f) => f.type === 'move' && f.userId !== me.id),
      'student move broadcast',
    );
    await until(
      () => request('/state'),
      (v) => v.data.messages.some((m) => m.text === config.marker),
      'student chat',
    );
    // Keep WSS present until the student has observed and acknowledged feedback.
    await until(
      () => request('/state'),
      (v) =>
        v.data.projects
          .find((p) => p.id === project.id)
          ?.updates.some((e) => e.text === 'PEER_ACK'),
      'feedback acknowledgement',
    );
  } else {
    const lesson = await until(
      () => request('/state'),
      (v) => v.data.materials.some((m) => m.title === config.marker),
      'lesson upload',
    );
    const material = lesson.data.materials.find((m) => m.title === config.marker);
    assert.equal((await request(`/materials/${material.id}/download`)).data, '두 컴퓨터 교안 검증');
    assert.equal((await request('/materials', { title: '권한 우회' })).status, 403);
    const p = await request('/projects', { ...config.emptyProject, title: config.marker });
    assert.equal(p.status, 201);
    const pose = frames.find((f) => f.type === 'positions').players.find((p) => p.userId === me.id);
    assert.ok(pose);
    socket.send(
      JSON.stringify({ x: pose.x + 3, y: pose.y, direction: 'right', moving: true, seated: false }),
    );
    assert.equal(
      (await request('/messages', { type: 'CHAT', text: config.marker, recipientId: null })).status,
      200,
    );
    await until(
      () => request('/state'),
      (v) =>
        v.data.projects
          .find((x) => x.id === p.data.id)
          ?.feedback.some((f) => f.text.startsWith('PEER_FEEDBACK')),
      'MASTER feedback',
    );
    assert.equal(
      (await request(`/projects/${p.data.id}/entries`, { type: 'updates', text: 'PEER_ACK' }))
        .status,
      200,
    );
  }
  console.log(
    JSON.stringify({
      ok: true,
      role: config.role,
      clientAddress: address,
      httpsChainVerified: true,
      wss: true,
      externalDeployment: false,
    }),
  );
} finally {
  socket.close();
  await request('/logout', {});
}
