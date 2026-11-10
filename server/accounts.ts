import type { Express, Request, Response } from 'express';
import { scryptSync, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Member } from '../shared/types.js';
import { db, id, now, userById, hashPassword, put, get, remove, transaction } from './db.js';
import { makeBackup, exportSchoolDatabase, storageStatus } from './operations.js';
type Recovery = { id: string; userId: string; expiresAt: string; createdAt: string };
type Dependencies = {
  active: (r: Request) => Member;
  master: (r: Request) => Member;
  fail: (status: number, message: string) => never;
  rate: (key: string, count: number) => void;
  closeUser: (id: string) => void;
  login: (res: Response, user: Member, req: Request) => void;
  changed: (school: string) => void;
};
const password = z.string().min(10, '비밀번호는 10자 이상 입력해 주세요.').max(128);
const digest = (v: string) => createHash('sha256').update(v).digest('hex');
function checkPassword(raw: string, stored: string) {
  const [salt, hash] = stored.split(':');
  const actual = scryptSync(raw, salt, 64),
    expected = Buffer.from(hash || '', 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function registerAccountRoutes(app: Express, d: Dependencies) {
  app.post('/api/account/password', (req, res) => {
    const u = d.active(req);
    d.rate('change-password:' + u.id, 8);
    const v = z.object({ currentPassword: z.string().max(128), password }).parse(req.body);
    const row = db.prepare('SELECT password FROM users WHERE id=?').get(u.id) as {
      password: string;
    };
    if (!checkPassword(v.currentPassword, row.password))
      d.fail(400, '현재 비밀번호를 다시 확인해 주세요.');
    transaction(() => {
      db.prepare('UPDATE users SET password=? WHERE id=?').run(hashPassword(v.password), u.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
      db.prepare(
        "DELETE FROM records WHERE school_id=? AND kind='password-recovery' AND json_extract(body,'$.userId')=?",
      ).run(u.schoolId, u.id);
    });
    d.closeUser(u.id);
    d.login(res, u, req);
    res.json({ ok: true });
  });
  app.post('/api/members/:id/recovery', (req, res) => {
    const master = d.master(req),
      u = userById(String(req.params.id));
    if (!u || u.schoolId !== master.schoolId || u.role !== 'STUDENT' || u.status !== 'ACTIVE')
      d.fail(404, '재학생 계정을 찾을 수 없습니다.');
    d.rate('issue-recovery:' + master.id, 30);
    const key = randomBytes(32).toString('hex');
    const record: Recovery = {
      id: digest(key),
      userId: u!.id,
      expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
      createdAt: now(),
    };
    transaction(() => {
      db.prepare(
        "DELETE FROM records WHERE school_id=? AND kind='password-recovery' AND json_extract(body,'$.userId')=?",
      ).run(master.schoolId, u!.id);
      put('password-recovery', record, master.schoolId);
    });
    res.json({ key, expiresAt: record.expiresAt });
  });
  app.post('/api/account/recover', (req, res) => {
    d.rate('recover:' + req.ip, 10);
    const v = z.object({ key: z.string().regex(/^[a-f0-9]{64}$/), password }).parse(req.body);
    const row = db
      .prepare("SELECT school_id FROM records WHERE id=? AND kind='password-recovery'")
      .get(digest(v.key)) as { school_id: string } | undefined;
    if (!row) d.fail(400, '만료되었거나 사용한 복구 KEY입니다. 선생님에게 다시 요청해 주세요.');
    const r = get<Recovery>('password-recovery', digest(v.key), row!.school_id);
    const u = r && userById(r.userId);
    if (
      !r ||
      !u ||
      u.schoolId !== row!.school_id ||
      u.status !== 'ACTIVE' ||
      Date.parse(r.expiresAt) <= Date.now()
    )
      d.fail(400, '만료되었거나 사용할 수 없는 복구 KEY입니다.');
    transaction(() => {
      db.prepare('UPDATE users SET password=? WHERE id=?').run(hashPassword(v.password), u!.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(u!.id);
      remove('password-recovery', r!.id, u!.schoolId);
    });
    d.closeUser(u!.id);
    res.json({ ok: true });
  });
  app.post('/api/invitations/batch', (req, res) => {
    const u = d.master(req);
    d.rate('batch-invite:' + u.id, 10);
    const { count, label } = z
      .object({ count: z.number().int().min(1).max(30), label: z.string().trim().min(1).max(40) })
      .parse(req.body);
    const results = transaction(() =>
      Array.from({ length: count }, (_, i) => {
        const key = randomBytes(24).toString('base64url');
        const inv = {
          id: id(),
          label: label + ' ' + (i + 1),
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
          usedAt: null,
          revoked: false,
          createdAt: now(),
        };
        db.prepare('INSERT INTO invitations VALUES(?,?,?,?)').run(
          inv.id,
          u.schoolId,
          digest(key),
          JSON.stringify(inv),
        );
        return { ...inv, key };
      }),
    );
    d.changed(u.schoolId);
    res.status(201).json(results);
  });
  app.get('/api/operations', (req, res) => {
    const u = d.master(req);
    res.json(storageStatus(u.schoolId));
  });
  app.post('/api/operations/backup', async (req, res) => {
    const u = d.master(req);
    d.rate('backup:' + u.id, 5);
    await makeBackup();
    res.json(storageStatus(u.schoolId));
  });
  app.get('/api/operations/backup', async (req, res) => {
    const u = d.master(req);
    d.rate('backup-download:' + u.id, 5);
    const exported = await exportSchoolDatabase(u.schoolId);
    res.setHeader('Cache-Control', 'private, no-store');
    res.download(
      exported.file,
      'pixel-class-private-' + new Date().toISOString().slice(0, 10) + '.sqlite',
      () => exported.cleanup(),
    );
  });
}
