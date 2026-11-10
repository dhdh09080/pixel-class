import type { Express, Request } from 'express';
import { saveProject } from './projects.js';
import { validateUpload } from './uploads.js';
import { assertUploadCapacity } from './operations.js';
import { z } from 'zod';
import type { Member, Project, Entry } from '../shared/types.js';
import {
  normalizeProject,
  roadmapTemplate,
  type Submission,
  type Attachment,
} from '../shared/learning.js';
import {
  analysisSchema,
  roadmapSchema,
  submissionSchema,
  questionStatusSchema,
} from '../shared/validation.js';
import { id, now, put, get, list, remove, userById, saveMember, transaction } from './db.js';
import type { PersonalEventInput } from '../shared/events.js';
type Deps = {
  active: (req: Request) => Member;
  master: (req: Request) => Member;
  project: (req: Request, u: Member, write?: boolean) => Project;
  fail: (status: number, text: string) => never;
  changed: (school: string) => void;
  notify: (user: Member, input: PersonalEventInput) => void;
};
export function registerLearningRoutes(app: Express, d: Deps) {
  const save = (p: Project) => {
    p.updatedAt = now();
    saveProject(p);
    d.changed(p.schoolId);
    return p;
  };
  const own = (req: Request) => {
    const u = d.active(req),
      p = d.project(req, u, true);
    if (u.id !== p.ownerId) d.fail(403, '프로젝트 소유자만 할 수 있습니다.');
    return { u, p };
  };
  const entry = (u: Member, text: string): Entry => ({
    id: id(),
    author: u.id,
    name: u.name,
    text,
    createdAt: now(),
  });
  app.patch('/api/projects/:id/learning', (req, res) => {
    const { p } = own(req);
    const value = z.object({ analysis: analysisSchema.optional() }).parse(req.body);
    Object.assign(p, value, { approved: false });
    res.json(save(p));
  });
  app.put('/api/projects/:id/roadmap', (req, res) => {
    const u = d.active(req),
      p = d.project(req, u, true);
    const { steps } = z.object({ steps: roadmapSchema }).parse(req.body);
    p.roadmap = steps;
    p.approved = false;
    res.json(save(p));
  });
  app.post('/api/projects/:id/roadmap/template', (req, res) => {
    const { p } = own(req);
    const { choice } = z
      .object({ choice: z.enum(['AUTO', 'WEB', 'DATA', 'API', 'AI', 'DESKTOP']).default('AUTO') })
      .parse(req.body);
    if (p.roadmap?.length)
      d.fail(409, '기존 로드맵을 보존했어요. 직접 편집하거나 비운 뒤 새 예시를 선택하세요.');
    p.roadmap = roadmapTemplate(p.analysis!, choice);
    res.json(save(p));
  });
  app.patch('/api/projects/:id/questions/:questionId', (req, res) => {
    const u = d.active(req),
      p = d.project(req, u, true);
    const v = z
      .object({
        status: questionStatusSchema.optional(),
        answer: z.string().trim().min(1).max(4000).optional(),
      })
      .parse(req.body);
    const q = p.questions.find((q) => q.id === req.params.questionId);
    if (!q) d.fail(404, '질문을 찾을 수 없습니다.');
    if (u.role !== 'MASTER' && (v.answer || v.status !== 'RESOLVED'))
      d.fail(403, '답변과 확인 상태는 MASTER만 관리할 수 있어요.');
    transaction(() => {
      if (v.status) q!.status = v.status;
      if (v.answer) {
        q!.answers = [...(q!.answers || []), entry(u, v.answer)];
        q!.status = 'ANSWERED';
        d.notify(userById(p.ownerId)!, {
          type: 'project.question.answered',
          payload: {
            projectId: p.id,
            questionId: q!.id,
            mentorName: u.name,
            preview: v.answer.slice(0, 200),
          },
        });
      }
      p.helpRequested = p.questions.some(
        (q) => !['ANSWERED', 'RESOLVED'].includes(q.status || 'NEW'),
      );
      const student = userById(p.ownerId);
      if (
        student?.helpSource === 'QUESTION' &&
        !list<Project>('project', p.schoolId).some(
          (other) =>
            other.ownerId === p.ownerId &&
            (other.id === p.id ? p.helpRequested : other.helpRequested),
        )
      ) {
        student.help = false;
        saveMember(student);
      }
      save(p);
    });
    res.json(p);
  });
  app.patch('/api/projects/:id/feedback/:feedbackId', (req, res) => {
    const u = d.active(req),
      p = d.project(req, u, true);
    const v = z.object({ status: z.enum(['OPEN', 'ACKNOWLEDGED', 'DONE']) }).parse(req.body);
    const f = p.feedback.find((f) => f.id === req.params.feedbackId);
    if (!f) d.fail(404, '피드백을 찾을 수 없습니다.');
    f!.feedbackStatus = v.status;
    res.json(save(p));
  });
  app.post('/api/projects/:id/submissions', (req, res) => {
    const { p } = own(req);
    const value = submissionSchema.parse(req.body);
    if (
      value.attachmentIds.some((attachmentId) => !p.attachments?.some((a) => a.id === attachmentId))
    )
      d.fail(400, '이 프로젝트의 첨부파일만 제출할 수 있어요.');
    if (p.submissions?.at(-1)?.status === 'PENDING')
      d.fail(409, '이미 제출한 내용을 MASTER가 검토 중이에요.');
    const snapshot: Submission = { ...value, id: id(), createdAt: now(), status: 'PENDING' };
    p.submissions = [...(p.submissions || []), snapshot];
    p.status = 'REVIEW';
    p.approved = false;
    res.status(201).json(save(p));
  });
  app.post('/api/projects/:id/submissions/:submissionId/review', (req, res) => {
    const u = d.master(req),
      p = d.project(req, u, true);
    const v = z
      .object({
        decision: z.enum(['APPROVED', 'CHANGES_REQUESTED']),
        text: z.string().trim().min(1).max(4000),
      })
      .parse(req.body);
    const s = p.submissions?.find((s) => s.id === req.params.submissionId);
    if (!s) d.fail(404, '제출 기록을 찾을 수 없습니다.');
    if (s!.status !== 'PENDING') d.fail(409, '이미 검토한 제출 기록입니다.');
    transaction(() => {
      s!.status = v.decision;
      s!.review = entry(u, v.text);
      p.feedback.push({
        ...s!.review,
        kind: v.decision === 'APPROVED' ? '검토 승인' : '수정 요청',
        feedbackStatus: 'OPEN',
      });
      p.status = v.decision === 'APPROVED' ? 'COMPLETED' : 'BUILDING';
      p.approved = v.decision === 'APPROVED';
      d.notify(userById(p.ownerId)!, {
        type: 'project.reviewed',
        payload: { projectId: p.id, title: p.title, approved: p.approved },
      });
      save(p);
    });
    res.json(p);
  });
  app.post('/api/projects/:id/attachments', (req, res) => {
    const { p } = own(req);
    const v = z
      .object({ fileName: z.string().min(1).max(150), content: z.string().max(7 * 1024 * 1024) })
      .parse(req.body);
    const { content, mime } = validateUpload(v.fileName, v.content);
    assertUploadCapacity(p.schoolId, v.content);
    if ((p.attachments?.length || 0) >= 10)
      d.fail(400, '프로젝트당 최대 10개 파일을 보관할 수 있어요.');
    const attachment: Attachment = {
      id: id(),
      projectId: p.id,
      fileName: v.fileName,
      mime,
      size: content.length,
      createdAt: now(),
    };
    transaction(() => {
      put('project-attachment', { ...attachment, content: v.content }, p.schoolId);
      p.attachments = [...(p.attachments || []), attachment];
      save(p);
    });
    res.status(201).json(attachment);
  });
  app.get('/api/projects/:id/attachments/:attachmentId', (req, res) => {
    const u = d.active(req),
      p = d.project(req, u, true);
    const file = get<Attachment & { content: string }>(
      'project-attachment',
      String(req.params.attachmentId),
      u.schoolId,
    );
    if (!file || file.projectId !== p.id) d.fail(404, '첨부파일을 찾을 수 없습니다.');
    res.setHeader('Content-Type', file!.mime);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file!.fileName)}`,
    );
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.send(Buffer.from(file!.content, 'base64'));
  });
  app.delete('/api/projects/:id/attachments/:attachmentId', (req, res) => {
    const { p } = own(req);
    if (p.submissions?.some((s) => s.attachmentIds.includes(String(req.params.attachmentId))))
      d.fail(409, '제출 기록에 포함된 파일은 보존해야 해요.');
    const file = get<Attachment>('project-attachment', String(req.params.attachmentId), p.schoolId);
    if (!file || file.projectId !== p.id) d.fail(404, '첨부파일을 찾을 수 없습니다.');
    transaction(() => {
      p.attachments = (p.attachments || []).filter((a) => a.id !== file!.id);
      remove('project-attachment', file!.id, p.schoolId);
      save(p);
    });
    res.json({ ok: true });
  });
}
