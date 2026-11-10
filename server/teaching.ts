import type { Express, Request } from 'express';
import { z } from 'zod';
import type { Member } from '../shared/types.js';
import type { Assignment, Homework } from '../shared/teaching.js';
import { get, list, put, id, now, members, transaction } from './db.js';

type Dependencies = {
  active: (r: Request) => Member;
  master: (r: Request) => Member;
  fail: (status: number, message: string) => never;
  changed: (school: string) => void;
};
const deadline = z.string().datetime({ offset: true });
const assignmentSchema = z.object({
  title: z.string().trim().min(1).max(120),
  instructions: z.string().trim().min(1).max(6000),
  dueAt: deadline,
  studentIds: z.array(z.string().max(100)).min(1).max(120),
});
const link = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => {
    if (!v) return true;
    try {
      const u = new URL(v);
      return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password;
    } catch {
      return false;
    }
  }, '결과물 링크는 http 또는 https 주소로 입력해 주세요.');
export function registerTeachingRoutes(app: Express, d: Dependencies) {
  app.get('/api/teaching', (req, res) => {
    const u = d.active(req);
    const assignments = list<Assignment>('assignment', u.schoolId).filter(
      (a) => u.role === 'MASTER' || a.studentIds.includes(u.id),
    );
    const ids = new Set(assignments.map((a) => a.id));
    res.json({
      assignments,
      submissions: list<Homework>('homework', u.schoolId).filter(
        (s) => ids.has(s.assignmentId) && (u.role === 'MASTER' || s.studentId === u.id),
      ),
    });
  });
  app.post('/api/assignments', (req, res) => {
    const u = d.master(req),
      value = assignmentSchema.parse(req.body);
    const students = new Set(
      members(u.schoolId)
        .filter((m) => m.role === 'STUDENT' && m.status === 'ACTIVE')
        .map((m) => m.id),
    );
    if (value.studentIds.some((s) => !students.has(s)))
      d.fail(400, '현재 학교의 재학생만 선택해 주세요.');
    if (Date.parse(value.dueAt) <= Date.now()) d.fail(400, '마감일은 현재 이후로 지정해 주세요.');
    const a: Assignment = {
      ...value,
      studentIds: [...new Set(value.studentIds)],
      id: id(),
      schoolId: u.schoolId,
      createdAt: now(),
      archived: false,
    };
    put('assignment', a, u.schoolId);
    d.changed(u.schoolId);
    res.status(201).json(a);
  });
  app.patch('/api/assignments/:id', (req, res) => {
    const u = d.master(req),
      a = get<Assignment>('assignment', String(req.params.id), u.schoolId);
    if (!a) d.fail(404, '과제를 찾을 수 없습니다.');
    const value = z
      .object({ archived: z.boolean().optional(), dueAt: deadline.optional() })
      .parse(req.body);
    if (value.dueAt && Date.parse(value.dueAt) <= Date.now())
      d.fail(400, '새 마감일은 현재 이후로 지정해 주세요.');
    put('assignment', { ...a!, ...value }, u.schoolId);
    d.changed(u.schoolId);
    res.json({ ok: true });
  });
  app.put('/api/assignments/:id/submission', (req, res) => {
    const u = d.active(req),
      a = get<Assignment>('assignment', String(req.params.id), u.schoolId);
    if (u.role !== 'STUDENT' || !a || !a.studentIds.includes(u.id))
      d.fail(404, '배정된 과제를 찾을 수 없습니다.');
    if (a!.archived) d.fail(409, '보관된 과제는 제출할 수 없습니다.');
    const value = z
      .object({
        text: z.string().trim().min(1).max(6000),
        url: link,
        revision: z.number().int().nonnegative(),
      })
      .parse(req.body);
    const key = a!.id + ':' + u.id;
    const s = transaction(() => {
      const previous = get<Homework>('homework', key, u.schoolId);
      if ((previous?.revision || 0) !== value.revision)
        d.fail(409, '다른 화면에서 제출 내용이 바뀌었어요. 새로고침 후 확인해 주세요.');
      const record: Homework = {
        ...value,
        id: key,
        schoolId: u.schoolId,
        assignmentId: a!.id,
        studentId: u.id,
        submittedAt: now(),
        late: Date.now() > Date.parse(a!.dueAt),
        revision: value.revision + 1,
        review: '',
        result: 'SUBMITTED',
      };
      put('homework', record, u.schoolId);
      return record;
    });
    d.changed(u.schoolId);
    res.json(s);
  });
  app.patch('/api/homework/:id/review', (req, res) => {
    const u = d.master(req),
      s = get<Homework>('homework', String(req.params.id), u.schoolId);
    if (!s) d.fail(404, '제출물을 찾을 수 없습니다.');
    const value = z
      .object({
        review: z.string().trim().min(1).max(4000),
        result: z.enum(['APPROVED', 'CHANGES']),
        revision: z.number().int().positive(),
      })
      .parse(req.body);
    if (value.revision !== s!.revision)
      d.fail(409, '학생이 다시 제출했어요. 최신 제출물을 확인해 주세요.');
    put('homework', { ...s!, ...value, revision: s!.revision + 1 }, u.schoolId);
    d.changed(u.schoolId);
    res.json({ ok: true });
  });
}
