import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import {
  db,
  SCHOOL,
  id,
  now,
  get,
  put,
  members,
  insertMember,
  userById,
  saveMember,
  transaction,
} from './db.js';
import { defaultAppearance, type Member, type Admission } from '../shared/types.js';
import { defaultSchoolSettings, type SchoolSettings } from '../shared/school.js';
import { appearanceSchema } from '../shared/appearance-schema.js';
import { defaultClassId, schoolClasses } from './competitions.js';
import { approvalRegistrationEnabled } from './admission-policy.js';
import { allocateDesk } from './classroom.js';

export const isApplicant = (user: Member) => ['PENDING', 'REJECTED'].includes(user.status);
export function admissionQueue(school: string): Admission[] {
  return (
    db
      .prepare(
        "SELECT email,body FROM users WHERE school_id=? AND json_extract(body,'$.status') IN ('PENDING','REJECTED') ORDER BY CASE WHEN json_extract(body,'$.status')='PENDING' THEN 0 ELSE 1 END, json_extract(body,'$.admission.requestedAt') DESC LIMIT 400",
      )
      .all(school) as { email: string; body: string }[]
  ).map((row) => ({ ...JSON.parse(row.body), email: row.email }));
}
type Dependencies = {
  sessionUser: (req: Request) => Member | undefined;
  master: (req: Request) => Member;
  active: (req: Request) => Member;
  login: (res: Response, user: Member, req: Request) => void;
  logout: (req: Request, res: Response) => void;
  grantAccess: (res: Response) => void;
  restrictAccess: (res: Response) => void;
  verifyCredentials: (email: string, password: string) => Member;
  fail: (status: number, message: string) => never;
  rate: (key: string, count: number) => void;
  changed: (school: string) => void;
};
const credentials = z.object({
  email: z
    .email('이메일 형식을 확인해 주세요.')
    .max(200)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(10, '비밀번호는 10자 이상 입력해 주세요.').max(128),
});
function schoolName(school: string) {
  return (
    get<SchoolSettings>('school-settings', 'school-settings-' + school, school)?.name ||
    defaultSchoolSettings.name
  );
}
const accepting = () =>
  members(SCHOOL).some((user) => user.role === 'MASTER' && user.status === 'ACTIVE');
export function registerAdmissionRoutes(app: Express, d: Dependencies) {
  const enabled = () => {
    if (!approvalRegistrationEnabled()) d.fail(404, '가입 신청을 이용할 수 없습니다.');
  };
  app.get('/api/enrollment/config', (_req, res) => {
    enabled();
    res.json({
      approvalRegistrationEnabled: true,
      acceptingApplications: accepting(),
      schoolName: schoolName(SCHOOL),
      demo: false,
      bootstrap: false,
      aiConfigured: false,
    });
  });
  app.post('/api/enrollment/register', (req, res) => {
    enabled();
    d.rate('application:' + req.ip, 60);
    const value = credentials
      .extend({
        name: z.string().trim().min(1, '이름을 입력해 주세요.').max(24),
        appearance: appearanceSchema.default(defaultAppearance),
      })
      .strict()
      .parse(req.body);
    const user = transaction(() => {
      if (!accepting()) d.fail(503, '학교를 준비하고 있어요. 선생님에게 문의해 주세요.');
      if (db.prepare('SELECT id FROM users WHERE email=?').get(value.email))
        d.fail(409, '이미 가입한 이메일이에요. 로그인해 주세요.');
      const pending = db
        .prepare(
          "SELECT COUNT(*) AS count FROM users WHERE school_id=? AND json_extract(body,'$.status')='PENDING'",
        )
        .get(SCHOOL) as { count: number };
      const recent = db
        .prepare(
          "SELECT COUNT(*) AS count FROM users WHERE school_id=? AND json_extract(body,'$.admission.requestedAt')>?",
        )
        .get(SCHOOL, new Date(Date.now() - 86400000).toISOString()) as { count: number };
      if (pending.count >= 200 || recent.count >= 100)
        d.fail(429, '오늘은 가입 신청이 많아요. 선생님에게 문의하거나 내일 다시 시도해 주세요.');
      const applicant: Member = {
        id: id(),
        schoolId: SCHOOL,
        name: value.name,
        role: 'STUDENT',
        status: 'PENDING',
        appearance: value.appearance,
        help: false,
        workStatus: 'IDLE',
        deskId: null,
        admission: { requestedAt: now(), revision: 0 },
      };
      insertMember(applicant, value.email, value.password);
      return applicant;
    });
    d.restrictAccess(res);
    d.login(res, user, req);
    d.changed(user.schoolId);
    res.status(201).json({ ok: true, status: user.status });
  });
  app.post('/api/enrollment/login', (req, res) => {
    enabled();
    d.rate('enrollment-login-global', 300);
    d.rate('login:' + req.ip, 120);
    const value = credentials.strict().parse(req.body);
    const user = d.verifyCredentials(value.email, value.password);
    if (user.status === 'REVOKED') d.fail(403, '학교 접근 권한이 회수되었습니다.');
    d.login(res, user, req);
    // Former students retain their existing read-only school access.
    if (isApplicant(user)) d.restrictAccess(res);
    else d.grantAccess(res);
    res.json({ ok: true, status: user.status });
  });
  app.get('/api/enrollment/session', (req, res) => {
    enabled();
    const user = d.sessionUser(req);
    if (!user) d.fail(401, '로그인이 필요합니다.');
    const group =
      user!.status === 'ACTIVE'
        ? get<{ name: string }>(
            'competition-class',
            user!.classId || defaultClassId(user!.schoolId),
            user!.schoolId,
          )
        : undefined;
    res.json({
      id: user!.id,
      name: user!.name,
      appearance: user!.appearance,
      status: user!.status,
      schoolName: schoolName(user!.schoolId),
      className: user!.status === 'ACTIVE' ? group?.name || '기본반' : undefined,
      requestedAt: user!.admission?.requestedAt,
      reason: user!.status === 'REJECTED' ? user!.admission?.reason : undefined,
    });
  });
  app.post('/api/enrollment/enter', (req, res) => {
    enabled();
    const user = d.sessionUser(req);
    if (!user || isApplicant(user) || user.status === 'REVOKED')
      d.fail(403, '선생님의 가입 승인을 기다려 주세요.');
    d.grantAccess(res);
    res.json({ ok: true });
  });
  app.post('/api/enrollment/logout', (req, res) => {
    enabled();
    d.logout(req, res);
    d.restrictAccess(res);
    res.json({ ok: true });
  });
  app.get('/api/admissions', (req, res) => {
    const teacher = d.master(req);
    res.json(admissionQueue(teacher.schoolId));
  });
  for (const action of ['approve', 'reject'] as const) {
    app.post('/api/admissions/:id/' + action, (req, res) => {
      const teacher = d.master(req);
      d.rate('admission-review:' + teacher.id, 60);
      const value = z
        .object({
          revision: z.number().int().nonnegative(),
          classId: z.string().min(1).max(100).optional(),
          reason: z.string().trim().max(300).optional(),
        })
        .strict()
        .parse(req.body);
      if (action === 'approve' && !value.classId) d.fail(400, '배정할 반을 선택해 주세요.');
      if (action === 'reject' && !value.reason)
        d.fail(400, '학생에게 안내할 거절 사유를 입력해 주세요.');
      schoolClasses(teacher.schoolId);
      const result = transaction(() => {
        const user = userById(String(req.params.id));
        if (
          !user ||
          user.schoolId !== teacher.schoolId ||
          user.role !== 'STUDENT' ||
          !user.admission
        )
          d.fail(404, '가입 신청을 찾을 수 없습니다.');
        if (
          !isApplicant(user!) ||
          user!.admission!.revision !== value.revision ||
          (action === 'reject' && user!.status !== 'PENDING')
        )
          d.fail(409, '이미 처리되거나 변경된 신청이에요. 새로고침해 주세요.');
        const previous = user!.status;
        if (action === 'approve') {
          if (!get('competition-class', value.classId!, teacher.schoolId))
            d.fail(404, '우리 학교의 반을 선택해 주세요.');
          user!.classId = value.classId;
          user!.status = 'ACTIVE';
          allocateDesk(user!);
          user!.admission!.approvedAt = now();
        } else user!.status = 'REJECTED';
        user!.admission = {
          ...user!.admission!,
          revision: value.revision + 1,
          reviewedAt: now(),
          reviewedBy: teacher.id,
          reason: action === 'reject' ? value.reason : undefined,
        };
        saveMember(user!);
        put(
          'history',
          {
            id: id(),
            memberId: user!.id,
            actor: teacher.name,
            from: previous,
            to: user!.status,
            reason: action === 'approve' ? '가입 승인 및 반 배정' : value.reason!,
            createdAt: now(),
          },
          teacher.schoolId,
        );
        return user!;
      });
      d.changed(teacher.schoolId);
      res.json({ ok: true, status: result.status, classId: result.classId });
    });
  }
}
