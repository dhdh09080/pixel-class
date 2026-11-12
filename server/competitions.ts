import type { Express, Request, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db, id, now, list, get, put, members, saveMember, transaction } from './db.js';
import type { Member, Project } from '../shared/types.js';
import type { PersonalEventInput } from '../shared/events.js';
import {
  competitionState,
  competitionIntroLabels,
  type Competition,
  type CompetitionEntry,
  type CompetitionFile,
  type CompetitionIntro,
  type SchoolClass,
  type CompetitionPass,
  type CompetitionAudit,
  type CompetitionClassroomEvent,
} from '../shared/competitions.js';
import {
  sanitizeCompetitionHtml,
  competitionRanking,
  type RankedScore,
} from './competition-domain.js';
import { assertUploadCapacity } from './operations.js';
import { validateUpload, UploadError } from './uploads.js';
export { isPublicCompetitionRequest } from './competition-domain.js';

db.exec(`
CREATE TABLE IF NOT EXISTS competition_judge_passes(id TEXT PRIMARY KEY,school_id TEXT NOT NULL,competition_id TEXT NOT NULL,key_hash TEXT UNIQUE NOT NULL,label TEXT NOT NULL,entry_ids TEXT NOT NULL,expires_at INTEGER NOT NULL,used_at INTEGER,revoked INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS competition_pass_scope ON competition_judge_passes(school_id,competition_id);
CREATE TABLE IF NOT EXISTS competition_judge_sessions(token_hash TEXT PRIMARY KEY,school_id TEXT NOT NULL,competition_id TEXT NOT NULL,judge_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS competition_session_judge ON competition_judge_sessions(judge_id);
CREATE TABLE IF NOT EXISTS competition_scores(id TEXT PRIMARY KEY,school_id TEXT NOT NULL,competition_id TEXT NOT NULL,judge_id TEXT NOT NULL,entry_id TEXT NOT NULL,idempotency_key TEXT NOT NULL,payload_hash TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(competition_id,judge_id,entry_id),UNIQUE(competition_id,judge_id,idempotency_key));
CREATE INDEX IF NOT EXISTS competition_score_scope ON competition_scores(school_id,competition_id);
`);

type Dependencies = {
  active: (r: Request) => Member;
  master: (r: Request) => Member;
  fail: (status: number, message: string) => never;
  changed: (school: string) => void;
  notify: (user: Member, event: PersonalEventInput) => unknown;
  rate: (key: string, max: number, ms?: number) => void;
};
type StoredEntry = CompetitionEntry & {
  schoolId: string;
  studentId: string;
  projectId: string;
  artifactId?: string;
  introFileId?: string;
  studentName: string;
  consentVisibility: 'JUDGES' | 'PUBLIC';
  consentRealName: boolean;
};
type StoredFile = {
  id: string;
  schoolId: string;
  competitionId: string;
  entryId: string;
  fileName: string;
  mime: string;
  size: number;
  base64: string;
  purpose: 'ARTIFACT' | 'INTRO';
  createdAt: string;
};
type JudgeRow = {
  id: string;
  school_id: string;
  competition_id: string;
  label: string;
  entry_ids: string;
  expires_at: number;
  used_at: number | null;
  revoked: number;
  created_at: string;
};
type Extension = {
  id: string;
  competitionId: string;
  studentId: string;
  dueAt: string;
  reason: string;
};
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const iso = z
  .string()
  .datetime({ offset: true })
  .transform((v) => new Date(v).toISOString());
const text = (max = 4000) => z.string().trim().max(max);
const configSchema = z.object({
  name: text(120).min(1),
  description: text(6000).default(''),
  classId: text(100).min(1),
  opensAt: iso,
  submissionDueAt: iso,
  judgingStartsAt: iso,
  judgingEndsAt: iso,
  resultsAt: iso,
  participantIds: z.array(text(100).min(1)).min(1).max(120),
  visibility: z.enum(['JUDGES', 'PUBLIC']).default('JUDGES'),
  allowRealNames: z.boolean().default(false),
  awardNames: z.array(text(40).min(1)).max(12).default(['대상', '최우수상', '우수상']),
  minJudges: z.number().int().min(1).max(100).default(1),
  allowedFileTypes: z
    .array(z.enum(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'md', 'html', 'zip', 'exe']))
    .min(1)
    .max(10)
    .default(['pdf', 'png', 'jpg', 'txt', 'html', 'zip']),
  judgingMethod: z.literal('KEY_AVERAGE').default('KEY_AVERAGE'),
});
const introSchema = z.object({
  serviceName: text(160).default(''),
  purpose: text().default(''),
  problem: text().default(''),
  audience: text().default(''),
  features: text().default(''),
  usage: text().default(''),
  examples: text().default(''),
  aiTools: text().default(''),
  development: text().default(''),
  screenshots: text().default(''),
  effect: text().default(''),
  nextSteps: text().default(''),
});
const uploadSchema = z.object({
  fileName: text(150).min(1),
  mime: text(100).optional(),
  base64: z.string().max(7 * 1024 * 1024),
});
const linkSchema = text(2000).refine((v) => {
  if (!v) return true;
  try {
    const u = new URL(v);
    return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password;
  } catch {
    return false;
  }
}, '결과물 링크는 http 또는 https 주소로 입력해 주세요.');
const scoreSchema = z.object({
  practicality: z.number().int().min(0).max(35),
  usability: z.number().int().min(0).max(30),
  completeness: z.number().int().min(0).max(20),
  creativity: z.number().int().min(0).max(15),
  comment: text(2000).default(''),
  idempotencyKey: z
    .string()
    .min(16)
    .max(120)
    .regex(/^[A-Za-z0-9_-]+$/),
});
export const defaultClassId = (school: string) => `class-${school}-default`;
export function schoolClasses(school: string): SchoolClass[] {
  let classes = list<SchoolClass>('competition-class', school);
  if (!classes.some((c) => c.id === defaultClassId(school))) {
    const value: SchoolClass = {
      id: defaultClassId(school),
      schoolId: school,
      name: '기본반',
      createdAt: now(),
      memberIds: [],
    };
    put('competition-class', value, school);
    classes = [...classes, value];
  }
  const people = members(school);
  return classes.map((c) => ({
    ...c,
    memberIds: people
      .filter(
        (m) =>
          m.role === 'STUDENT' &&
          m.status === 'ACTIVE' &&
          (m.classId || defaultClassId(school)) === c.id,
      )
      .map((m) => m.id),
  }));
}
function viewCompetition(c: Competition): Competition {
  return { ...c, state: competitionState(c) };
}
function ownClass(u: Member) {
  return u.classId || defaultClassId(u.schoolId);
}
function submitted(c: Competition): StoredEntry[] {
  const current = () =>
    list<StoredEntry>('competition-entry', c.schoolId).filter(
      (e) => e.competitionId === c.id && e.status === 'SUBMITTED',
    );
  if (!c.published || Date.now() < Date.parse(c.judgingStartsAt)) return current();
  // Finalization is lazy but atomic and durable. Restarts never recompute a frozen work.
  if (!get('competition-freeze', 'freeze:' + c.id, c.schoolId))
    transaction(() => {
      for (const e of current())
        put('competition-final-entry', { ...e, id: 'final:' + e.id, entryId: e.id }, c.schoolId);
      put(
        'competition-freeze',
        { id: 'freeze:' + c.id, competitionId: c.id, frozenAt: now() },
        c.schoolId,
      );
    });
  return list<StoredEntry & { entryId: string }>('competition-final-entry', c.schoolId)
    .filter((e) => e.competitionId === c.id)
    .map((e) => ({ ...e, id: e.entryId }));
}
function scores(c: Competition): RankedScore[] {
  const excluded = new Set(
    (
      db
        .prepare(
          "SELECT json_extract(body,'$.scoreId') id FROM records WHERE school_id=? AND kind='competition-score-review' AND json_extract(body,'$.competitionId')=? AND json_extract(body,'$.excluded')=1",
        )
        .all(c.schoolId, c.id) as { id: string }[]
    ).map((r) => r.id),
  );
  return (
    db
      .prepare(
        'SELECT id,entry_id,body FROM competition_scores WHERE school_id=? AND competition_id=?',
      )
      .all(c.schoolId, c.id) as { id: string; entry_id: string; body: string }[]
  )
    .filter((r) => !excluded.has(r.id))
    .map((r) => ({ ...JSON.parse(r.body), entryId: r.entry_id }));
}
function ranks(c: Competition) {
  return competitionRanking(
    submitted(c).map((e) => ({
      ...e,
      displayName: c.allowRealNames && e.consentRealName ? e.studentName : e.displayName,
    })),
    scores(c),
    c.minJudges,
    c.awardNames,
  );
}
export function competitionClassroomState(u: Member): {
  classes: SchoolClass[];
  competitionEvent?: CompetitionClassroomEvent;
} {
  const classes = schoolClasses(u.schoolId).filter(
    (c) => u.role === 'MASTER' || c.id === ownClass(u),
  );
  if (u.status !== 'ACTIVE') return { classes: [] };
  const current = list<Competition>('competition', u.schoolId)
    .filter(
      (c) =>
        c.classId === ownClass(u) &&
        c.published &&
        !c.archived &&
        (u.role === 'MASTER' || c.participantIds.includes(u.id)),
    )
    .sort((a, b) => b.opensAt.localeCompare(a.opensAt))[0];
  return {
    classes,
    ...(current
      ? {
          competitionEvent: {
            id: current.id,
            name: current.name,
            state: competitionState(current),
            classId: current.classId,
            submissionDueAt: current.submissionDueAt,
            judgingEndsAt: current.judgingEndsAt,
            ...(current.resultsPublished
              ? {
                  winners: ranks(current)
                    .filter((r) => r.award)
                    .map((r) => r.displayName),
                }
              : {}),
          },
        }
      : {}),
  };
}
function cookieName(contest: string) {
  return 'pixel_judge_' + contest.replaceAll('-', '');
}
function judgeSession(req: Request, c: Competition): JudgeRow | undefined {
  const token = req.headers.cookie
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName(c.id) + '='))
    ?.split('=')[1];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
  return db
    .prepare(
      `SELECT p.* FROM competition_judge_sessions s JOIN competition_judge_passes p ON p.id=s.judge_id AND p.school_id=s.school_id AND p.competition_id=s.competition_id WHERE s.token_hash=? AND s.school_id=? AND s.competition_id=? AND s.expires_at>? AND p.expires_at>? AND p.revoked=0`,
    )
    .get(digest(token), c.schoolId, c.id, Date.now(), Date.now()) as JudgeRow | undefined;
}
function permittedEntries(judge: JudgeRow) {
  return JSON.parse(judge.entry_ids) as string[];
}
function hasScope(judge: JudgeRow, entry: string) {
  const scopes = permittedEntries(judge);
  return scopes.length === 0 || scopes.includes(entry);
}
function fileDto(f: StoredFile, publicRoute = false): CompetitionFile {
  const base = publicRoute ? '/api/public/competitions/' : '/api/competitions/';
  return {
    id: f.id,
    fileName: f.fileName,
    mime: f.mime,
    size: f.size,
    downloadUrl: `${base}${f.competitionId}/entries/${f.entryId}/files/${f.id}`,
  };
}
function entryView(
  e: StoredEntry,
  c: Competition,
  access: 'OWNER' | 'MASTER' | 'JUDGE' | 'PUBLIC',
): CompetitionEntry {
  // Explicit whitelist: never spread project snapshots or account IDs into public responses.
  const value: CompetitionEntry = {
    id: e.id,
    competitionId: e.competitionId,
    title: e.title,
    displayName: c.allowRealNames && e.consentRealName ? e.studentName : e.displayName,
    serviceUrl: e.serviceUrl,
    consentPublic: e.consentPublic,
    intro: e.intro,
    introHtml: e.introHtml,
    revision: e.revision,
    submittedAt: e.submittedAt,
    status: e.status,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
  if (access === 'OWNER' || access === 'MASTER')
    Object.assign(value, {
      studentId: e.studentId,
      projectId: e.projectId,
      projectSnapshot: e.projectSnapshot,
    });
  if (e.artifactId) {
    const f = get<StoredFile>('competition-file', e.artifactId, c.schoolId);
    if (f) value.artifact = fileDto(f, access === 'PUBLIC' || access === 'JUDGE');
  }
  if (e.introFileId && access !== 'PUBLIC') {
    const f = get<StoredFile>('competition-file', e.introFileId, c.schoolId);
    if (f) value.introFile = fileDto(f, access === 'JUDGE');
  }
  return value;
}
function safeDownload(res: Response, f: StoredFile) {
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(f.fileName)}`,
  );
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(Buffer.from(f.base64, 'base64'));
}
function templateHtml(intro: CompetitionIntro) {
  const escape = (v: string) =>
    v
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  return Object.entries(intro)
    .filter(([, value]) => value)
    .map(
      ([key, value]) =>
        `<h2>${competitionIntroLabels[key as keyof CompetitionIntro]}</h2><p>${escape(value).replaceAll('\n', '<br>')}</p>`,
    )
    .join('');
}

export function registerCompetitionRoutes(app: Express, d: Dependencies) {
  function audit(c: Competition, action: string, actor: string, detail = '') {
    const record: CompetitionAudit = {
      id: id(),
      competitionId: c.id,
      action,
      actor,
      detail: detail.slice(0, 1000),
      createdAt: now(),
    };
    put('competition-audit', record, c.schoolId);
  }
  function notify(c: Competition, kind: string, preview: string, targets = c.participantIds) {
    for (const m of members(c.schoolId).filter(
      (u) =>
        targets.includes(u.id) &&
        u.status === 'ACTIVE' &&
        (u.role === 'MASTER' || ownClass(u) === c.classId),
    ))
      d.notify(m, {
        type: 'competition.updated',
        payload: { competitionId: c.id, name: c.name, kind, preview },
      });
  }
  /** Server-origin reminders survive reconnect/restart without repeating a notification. */
  function reminders() {
    const contests = (
      db.prepare("SELECT body FROM records WHERE kind='competition'").all() as { body: string }[]
    ).map((r) => JSON.parse(r.body) as Competition);
    for (const c of contests.filter((value) => value.published && !value.archived)) {
      const notices: { key: string; kind: string; preview: string; targets: string[] }[] = [];
      const phase = competitionState(c);
      if (phase === 'JUDGING' || phase === 'JUDGING_CLOSED') submitted(c);
      if (phase === 'JUDGING')
        notices.push({
          key: 'judging',
          kind: 'judging.started',
          preview: '심사가 시작됐어요. 최종 제출 작품은 더 이상 바뀌지 않습니다.',
          targets: c.participantIds,
        });
      if (phase === 'SUBMISSION_CLOSED')
        notices.push({
          key: 'submission.closed',
          kind: 'submission.closed',
          preview:
            '정규 작품 접수가 마감됐어요. 연장을 승인받았다면 개인 제출 기한을 확인해 주세요.',
          targets: c.participantIds,
        });
      if (Date.now() < Date.parse(c.judgingStartsAt))
        for (const student of c.participantIds) {
          const extension = get<Extension>(
            'competition-extension',
            c.id + ':' + student,
            c.schoolId,
          );
          const due = Math.max(
            Date.parse(c.submissionDueAt),
            Date.parse(extension?.dueAt || c.submissionDueAt),
          );
          const remaining = due - Date.now();
          const window =
            remaining > 0 && remaining <= 3600000
              ? '1h'
              : remaining > 0 && remaining <= 86400000
                ? '24h'
                : '';
          if (window)
            notices.push({
              key: `due:${student}:${due}:${window}`,
              kind: 'deadline.near',
              preview:
                window === '1h'
                  ? '제출 마감까지 한 시간 이내예요. 저장한 초안을 최종 제출했는지 확인해 주세요.'
                  : '제출 마감까지 하루 이내예요. 작품과 소개서를 준비해 주세요.',
              targets: [student],
            });
        }
      let sent = false;
      for (const notice of notices) {
        const marker = 'competition-notice:' + c.id + ':' + notice.key;
        if (get('competition-notice', marker, c.schoolId)) continue;
        transaction(() => {
          put('competition-notice', { id: marker, competitionId: c.id, sentAt: now() }, c.schoolId);
          notify(c, notice.kind, notice.preview, notice.targets);
        });
        sent = true;
      }
      if (sent) d.changed(c.schoolId);
    }
  }
  const runReminders = () => {
    try {
      reminders();
    } catch {
      console.error('Competition reminders deferred; no credentials logged.');
    }
  };
  runReminders();
  setInterval(runReminders, 60000).unref();
  function load(req: Request, masterOnly = false) {
    const u = masterOnly ? d.master(req) : d.active(req);
    const c = get<Competition>('competition', String(req.params.id), u.schoolId);
    if (
      !c ||
      (u.role !== 'MASTER' &&
        (c.classId !== ownClass(u) || !c.participantIds.includes(u.id) || !c.published))
    )
      d.fail(404, '참가할 수 있는 대회를 찾을 수 없습니다.');
    return { u, c: c! };
  }
  function publicLoad(req: Request) {
    d.rate('competition-public:' + req.ip, 600, 60000);
    const row = db
      .prepare("SELECT body FROM records WHERE id=? AND kind='competition'")
      .get(String(req.params.id)) as { body: string } | undefined;
    const c = row ? (JSON.parse(row.body) as Competition) : undefined;
    if (!c || !c.published || c.archived) d.fail(404, '공개된 대회를 찾을 수 없습니다.');
    return c!;
  }
  function validateConfig(v: z.infer<typeof configSchema>, school: string) {
    if (!schoolClasses(school).some((c) => c.id === v.classId))
      d.fail(400, '현재 학교의 반을 선택해 주세요.');
    const eligible = new Set(
      members(school)
        .filter((m) => m.role === 'STUDENT' && m.status === 'ACTIVE' && ownClass(m) === v.classId)
        .map((m) => m.id),
    );
    if (v.participantIds.some((p) => !eligible.has(p)))
      d.fail(400, '선택한 반의 재학생만 참가할 수 있습니다.');
    const [a, b, c, e, f] = [
      v.opensAt,
      v.submissionDueAt,
      v.judgingStartsAt,
      v.judgingEndsAt,
      v.resultsAt,
    ].map(Date.parse);
    if (!(a < b && b <= c && c < e && e <= f))
      d.fail(
        400,
        '접수 시작 → 제출 마감 → 심사 시작 → 심사 종료 → 발표 순서로 일정을 설정해 주세요.',
      );
  }
  function writable(c: Competition, u: Member) {
    if (u.role !== 'STUDENT' || !c.participantIds.includes(u.id) || ownClass(u) !== c.classId)
      d.fail(403, '이 반의 대회 참가 학생만 제출할 수 있습니다.');
    const extension = get<Extension>('competition-extension', c.id + ':' + u.id, c.schoolId);
    const dueAt = new Date(
      Math.max(Date.parse(extension?.dueAt || c.submissionDueAt), Date.parse(c.submissionDueAt)),
    ).toISOString();
    if (
      !c.published ||
      c.archived ||
      Date.now() < Date.parse(c.opensAt) ||
      Date.now() >= Date.parse(dueAt) ||
      Date.now() >= Date.parse(c.judgingStartsAt)
    )
      d.fail(409, '현재는 작품을 제출하거나 수정할 수 없습니다. 제출 기간을 확인해 주세요.');
  }
  function upload(
    value: z.infer<typeof uploadSchema>,
    c: Competition,
    entry: string,
    purpose: 'INTRO' | 'ARTIFACT',
  ): StoredFile {
    const ext = value.fileName.split('.').at(-1)?.toLowerCase() || '';
    if (
      /[\x00-\x1f\x7f/\\]/.test(value.fileName) ||
      (purpose === 'ARTIFACT' && !c.allowedFileTypes.includes(ext))
    )
      d.fail(400, '선생님이 허용한 파일 형식만 첨부할 수 있습니다.');
    if (purpose === 'INTRO' && ext !== 'html')
      d.fail(400, '소개서 원본은 HTML 파일로 올려 주세요.');
    const content = Buffer.from(value.base64, 'base64');
    if (
      !content.length ||
      content.length > 5 * 1024 * 1024 ||
      content.toString('base64') !== value.base64
    )
      d.fail(400, '파일이 비어 있거나 5MB를 초과했어요.');
    let mime = 'application/octet-stream';
    if (ext === 'html') {
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(content);
      } catch {
        d.fail(400, 'HTML 소개서는 UTF-8 인코딩으로 저장해 주세요.');
      }
      if (content.includes(0)) d.fail(400, '올바른 HTML 문서가 아닙니다.');
      mime = 'text/html';
    } else if (ext === 'zip') {
      if (!['504b0304', '504b0506', '504b0708'].includes(content.subarray(0, 4).toString('hex')))
        d.fail(400, 'ZIP 파일 형식과 실제 내용이 일치하지 않습니다.');
      mime = 'application/zip';
    } else if (ext === 'exe') {
      if (content.subarray(0, 2).toString() !== 'MZ')
        d.fail(400, '실행 파일 형식과 실제 내용이 일치하지 않습니다.');
    } else {
      try {
        const checked = validateUpload(value.fileName, value.base64);
        mime = checked.mime;
      } catch (e) {
        if (e instanceof UploadError) d.fail(400, e.message);
        throw e;
      }
    }
    assertUploadCapacity(c.schoolId, value.base64);
    return {
      id: id(),
      schoolId: c.schoolId,
      competitionId: c.id,
      entryId: entry,
      fileName: value.fileName,
      mime,
      size: content.length,
      base64: value.base64,
      purpose,
      createdAt: now(),
    };
  }
  function passes(c: Competition): CompetitionPass[] {
    return (
      db
        .prepare(
          'SELECT * FROM competition_judge_passes WHERE school_id=? AND competition_id=? ORDER BY created_at DESC',
        )
        .all(c.schoolId, c.id) as JudgeRow[]
    ).map((r) => ({
      id: r.id,
      label: r.label,
      expiresAt: new Date(r.expires_at).toISOString(),
      entryIds: permittedEntries(r),
      usedAt: r.used_at ? new Date(r.used_at).toISOString() : null,
      revoked: !!r.revoked,
      createdAt: r.created_at,
      scoredCount: (
        db
          .prepare(
            'SELECT count(*) n FROM competition_scores WHERE school_id=? AND competition_id=? AND judge_id=?',
          )
          .get(c.schoolId, c.id, r.id) as { n: number }
      ).n,
    }));
  }

  app.get('/api/competitions', (req, res) => {
    const u = d.active(req);
    res.json({
      classes: schoolClasses(u.schoolId).filter((c) => u.role === 'MASTER' || c.id === ownClass(u)),
      competitions: list<Competition>('competition', u.schoolId)
        .filter(
          (c) =>
            u.role === 'MASTER' ||
            (c.classId === ownClass(u) && c.participantIds.includes(u.id) && c.published),
        )
        .map(viewCompetition),
      activeClassId: ownClass(u),
      serverNow: now(),
    });
  });
  app.post('/api/classes', (req, res) => {
    const u = d.master(req),
      v = z.object({ name: text(80).min(1) }).parse(req.body);
    if (schoolClasses(u.schoolId).length >= 40)
      d.fail(409, '한 학교에는 최대 40개 반을 만들 수 있습니다.');
    const c: SchoolClass = {
      ...v,
      id: id(),
      schoolId: u.schoolId,
      createdAt: now(),
      memberIds: [],
    };
    put('competition-class', c, u.schoolId);
    d.changed(u.schoolId);
    res.status(201).json(c);
  });
  app.patch('/api/classes/:id/members', (req, res) => {
    const u = d.master(req),
      value = z.object({ memberIds: z.array(text(100).min(1)).max(120) }).parse(req.body),
      target = schoolClasses(u.schoolId).find((c) => c.id === req.params.id);
    if (!target) d.fail(404, '반을 찾을 수 없습니다.');
    const people = members(u.schoolId);
    if (
      value.memberIds.some(
        (member) =>
          !people.some((m) => m.id === member && m.role === 'STUDENT' && m.status === 'ACTIVE'),
      )
    )
      d.fail(400, '현재 학교의 재학생만 반에 배정할 수 있습니다.');
    transaction(() => {
      for (const m of people.filter((m) => m.role === 'STUDENT')) {
        const next = value.memberIds.includes(m.id)
          ? target!.id
          : ownClass(m) === target!.id
            ? defaultClassId(u.schoolId)
            : ownClass(m);
        if (next !== ownClass(m)) {
          if (
            list<StoredEntry>('competition-entry', u.schoolId).some(
              (e) =>
                e.studentId === m.id &&
                e.status === 'SUBMITTED' &&
                list<Competition>('competition', u.schoolId).some(
                  (c) => c.id === e.competitionId && c.published && !c.archived,
                ),
            )
          )
            d.fail(409, '제출한 대회가 운영 중인 학생은 대회 보관 후 반을 옮겨 주세요.');
          saveMember({ ...m, classId: next });
        }
      }
    });
    d.changed(u.schoolId);
    res.json({ ok: true });
  });
  app.patch('/api/competition-classroom', (req, res) => {
    const u = d.master(req),
      v = z.object({ classId: text(100).min(1) }).parse(req.body);
    if (!schoolClasses(u.schoolId).some((c) => c.id === v.classId))
      d.fail(404, '현재 학교의 반을 선택해 주세요.');
    saveMember({ ...u, classId: v.classId });
    d.changed(u.schoolId);
    res.json({ ok: true });
  });
  app.post('/api/competitions', (req, res) => {
    const u = d.master(req),
      v = configSchema.parse(req.body);
    validateConfig(v, u.schoolId);
    if (list<Competition>('competition', u.schoolId).length >= 100)
      d.fail(409, '학교의 대회 생성 한도에 도달했습니다.');
    const c: Competition = {
      ...v,
      participantIds: [...new Set(v.participantIds)],
      id: id(),
      schoolId: u.schoolId,
      published: false,
      resultsPublished: false,
      archived: false,
      createdAt: now(),
      updatedAt: now(),
      revision: 1,
      state: 'DRAFT',
    };
    transaction(() => {
      put('competition', c, u.schoolId);
      audit(c, 'created', u.id);
    });
    d.changed(u.schoolId);
    res.status(201).json(viewCompetition(c));
  });
  app.get('/api/competitions/:id', (req, res) => {
    const { u, c } = load(req);
    const entries = list<StoredEntry>('competition-entry', c.schoolId).filter(
      (e) => e.competitionId === c.id,
    );
    res.json({
      competition: viewCompetition(c),
      entries: entries
        .filter((e) => u.role === 'MASTER' || e.studentId === u.id)
        .map((e) => entryView(e, c, u.role === 'MASTER' ? 'MASTER' : 'OWNER')),
      myEntry: entries.find((e) => e.studentId === u.id)
        ? entryView(
            entries.find((e) => e.studentId === u.id)!,
            c,
            'OWNER',
          )
        : null,
      ...(u.role === 'MASTER' || c.resultsPublished ? { results: ranks(c) } : {}),
      ...(u.role === 'MASTER'
        ? {
            passes: passes(c),
            audit: list<CompetitionAudit>('competition-audit', c.schoolId)
              .filter((a) => a.competitionId === c.id)
              .slice(-300),
          }
        : {}),
      extensions: list<Extension>('competition-extension', c.schoolId)
        .filter((e) => e.competitionId === c.id && (u.role === 'MASTER' || e.studentId === u.id))
        .map((e) => ({
          ...e,
          dueAt: new Date(
            Math.max(Date.parse(e.dueAt), Date.parse(c.submissionDueAt)),
          ).toISOString(),
        })),
      serverNow: now(),
    });
  });
  app.patch('/api/competitions/:id', (req, res) => {
    const { u, c } = load(req, true);
    const revision = z.number().int().positive().parse(req.body.revision);
    if (revision !== c.revision)
      d.fail(409, '다른 화면에서 대회 설정이 바뀌었어요. 새로고침해 주세요.');
    if (
      c.archived ||
      get('competition-freeze', 'freeze:' + c.id, c.schoolId) ||
      (c.published && Date.now() >= Date.parse(c.judgingStartsAt))
    )
      d.fail(409, '심사 시작 후에는 대회 설정을 변경할 수 없습니다.');
    const v = configSchema.parse({ ...c, ...req.body });
    validateConfig(v, u.schoolId);
    if (
      list<Extension>('competition-extension', c.schoolId).some(
        (e) => e.competitionId === c.id && Date.parse(e.dueAt) > Date.parse(v.judgingStartsAt),
      )
    )
      d.fail(409, '승인한 개별 제출 연장보다 심사를 먼저 시작할 수 없습니다.');
    if (
      list<StoredEntry>('competition-entry', c.schoolId).some((e) => e.competitionId === c.id) &&
      (v.classId !== c.classId || c.participantIds.some((p) => !v.participantIds.includes(p)))
    )
      d.fail(409, '제출 이력이 있는 대회의 반과 기존 참가자를 바꿀 수 없습니다.');
    if (Date.parse(v.judgingStartsAt) <= Date.now())
      d.fail(400, '심사 시작 시각은 현재 이후로 지정해 주세요.');
    const latest = { ...c, ...v, revision: c.revision + 1, updatedAt: now() };
    transaction(() => {
      put('competition', latest, c.schoolId);
      audit(c, 'settings.updated', u.id, `revision ${latest.revision}`);
    });
    d.changed(c.schoolId);
    res.json(viewCompetition(latest));
  });
  app.post('/api/competitions/:id/action', (req, res) => {
    const { u, c } = load(req, true),
      v = z
        .object({
          action: z.enum(['publish', 'unpublish', 'archive', 'publishResults', 'retractResults']),
          reason: text(500).optional(),
        })
        .parse(req.body);
    if (c.archived) d.fail(409, '보관한 대회는 변경할 수 없습니다.');
    if (
      (v.action === 'publish' && c.published) ||
      (v.action === 'unpublish' && !c.published) ||
      (v.action === 'publishResults' && c.resultsPublished)
    )
      return res.json(viewCompetition(c));
    if (v.action === 'publish') {
      validateConfig(configSchema.parse(c), c.schoolId);
      if (Date.now() >= Date.parse(c.judgingStartsAt))
        d.fail(409, '심사 시작 전 대회만 개최할 수 있습니다.');
      c.published = true;
    }
    if (v.action === 'unpublish') {
      if (Date.now() >= Date.parse(c.judgingStartsAt))
        d.fail(409, '심사 시작 후에는 대회를 비공개로 전환할 수 없습니다.');
      c.published = false;
    }
    if (v.action === 'archive') c.archived = true;
    if (v.action === 'publishResults') {
      if (
        !c.published ||
        Date.now() < Date.parse(c.judgingEndsAt) ||
        Date.now() < Date.parse(c.resultsAt)
      )
        d.fail(409, '심사 종료와 발표 시각이 지난 뒤 결과를 공개할 수 있습니다.');
      if (!submitted(c).length) d.fail(409, '공개할 제출 작품이 없습니다.');
      c.resultsPublished = true;
    }
    if (v.action === 'retractResults') {
      if (!v.reason) d.fail(400, '결과 공개를 철회하는 이유를 입력해 주세요.');
      c.resultsPublished = false;
    }
    c.revision++;
    c.updatedAt = now();
    transaction(() => {
      put('competition', c, c.schoolId);
      audit(c, v.action, u.id, v.reason);
      if (v.action === 'publish' || v.action === 'publishResults')
        notify(
          c,
          v.action,
          v.action === 'publish'
            ? '우리 반 경진대회가 열렸어요. 일정과 제출 안내를 확인해 주세요.'
            : '경진대회 결과가 발표됐어요. 내 작품의 결과를 확인해 주세요.',
        );
    });
    d.changed(c.schoolId);
    res.json(viewCompetition(c));
  });
  app.put('/api/competitions/:id/entry', (req, res) => {
    const { u, c } = load(req);
    writable(c, u);
    d.rate('competition-submit:' + u.id, 40, 60000);
    const v = z
      .object({
        projectId: text(100).min(1),
        title: text(160).min(1),
        displayName: text(40).min(1),
        serviceUrl: linkSchema.default(''),
        consentPublic: z.boolean().default(false),
        intro: introSchema.optional(),
        introFile: uploadSchema.optional(),
        artifact: uploadSchema.optional(),
        expectedRevision: z.number().int().nonnegative().default(0),
        submit: z.boolean().default(true),
      })
      .parse(req.body);
    if (v.submit && !v.consentPublic)
      d.fail(
        400,
        '대회에서 안내한 심사·전시 범위에 동의한 뒤 최종 제출해 주세요. 동의 전에는 초안으로 저장할 수 있습니다.',
      );
    const project = get<Project>('project', v.projectId, u.schoolId);
    if (!project || project.ownerId !== u.id) d.fail(404, '본인의 프로젝트만 제출할 수 있습니다.');
    const entry = transaction(() => {
      const previous = list<StoredEntry>('competition-entry', u.schoolId).find(
        (e) => e.competitionId === c.id && e.studentId === u.id,
      );
      if ((previous?.revision || 0) !== v.expectedRevision)
        d.fail(409, '다른 화면에서 작품이 바뀌었어요. 새로고침 후 다시 저장해 주세요.');
      if ((previous?.revision || 0) >= 100)
        d.fail(
          409,
          '작품 수정 이력 한도(100회)에 도달했습니다. 선생님에게 문의해 주세요. 기존 제출과 파일은 보존됩니다.',
        );
      const entryId = previous?.id || id(),
        intro = v.intro || previous?.intro || introSchema.parse({});
      let artifactId = previous?.artifactId,
        introFileId = previous?.introFileId;
      if (v.artifact) {
        const f = upload(v.artifact, c, entryId, 'ARTIFACT');
        put('competition-file', f, u.schoolId);
        artifactId = f.id;
      }
      if (v.introFile) {
        const f = upload(v.introFile, c, entryId, 'INTRO');
        put('competition-file', f, u.schoolId);
        introFileId = f.id;
      }
      // Choosing a template explicitly replaces the old uploaded preview; original files remain in version history.
      if (v.intro && !v.introFile) introFileId = undefined;
      const htmlFile = introFileId
        ? get<StoredFile>('competition-file', introFileId, u.schoolId)
        : undefined;
      const introHtml = sanitizeCompetitionHtml(
        htmlFile ? Buffer.from(htmlFile.base64, 'base64').toString('utf8') : templateHtml(intro),
      );
      if (Buffer.byteLength(introHtml) > 128 * 1024)
        d.fail(400, '안전한 미리보기를 위해 소개서 본문은 128KB 이내로 줄여 주세요.');
      if (v.submit && !v.serviceUrl && !artifactId)
        d.fail(400, '실제 서비스 주소 또는 결과물 파일을 하나 이상 제출해 주세요.');
      if (
        v.submit &&
        !(htmlFile
          ? sanitizeCompetitionHtml(introHtml)
              .replace(/<[^>]*>/g, '')
              .trim()
          : intro.serviceName && intro.purpose && intro.features && intro.usage)
      )
        d.fail(
          400,
          '소개서에 서비스명, 제작 목적, 주요 기능과 사용 방법을 작성하거나 HTML 소개서를 올려 주세요.',
        );
      const p = project!;
      const record: StoredEntry = {
        id: entryId,
        schoolId: u.schoolId,
        competitionId: c.id,
        studentId: u.id,
        studentName: u.name,
        projectId: p.id,
        title: v.title,
        displayName: v.displayName,
        serviceUrl: v.serviceUrl,
        consentPublic: v.consentPublic,
        consentVisibility: c.visibility,
        consentRealName: c.allowRealNames,
        intro,
        introHtml,
        artifactId,
        introFileId,
        projectSnapshot: {
          title: p.title,
          purpose: p.purpose,
          problem: p.problem,
          audience: p.audience,
          features: p.features,
          aiTools: p.aiTools,
          technologies: p.technologies,
          serviceUrl: p.serviceUrl,
        },
        revision: (previous?.revision || 0) + 1,
        status: v.submit ? 'SUBMITTED' : 'DRAFT',
        submittedAt: v.submit ? now() : null,
        createdAt: previous?.createdAt || now(),
        updatedAt: now(),
      };
      put('competition-entry', record, u.schoolId);
      put(
        'competition-version',
        { ...record, id: `${entryId}:${record.revision}`, entryId },
        u.schoolId,
      );
      audit(
        c,
        v.submit ? 'entry.submitted' : 'entry.draft',
        u.id,
        `entry ${entryId}; revision ${record.revision}`,
      );
      if (v.submit)
        notify(
          c,
          'entry.submitted',
          '새 작품이 제출됐어요.',
          members(c.schoolId)
            .filter((m) => m.role === 'MASTER')
            .map((m) => m.id),
        );
      return record;
    });
    d.changed(c.schoolId);
    res.json(entryView(entry, c, 'OWNER'));
  });
  app.post('/api/competitions/:id/withdraw', (req, res) => {
    const { u, c } = load(req);
    d.rate('competition-withdraw:' + u.id, 40, 60000);
    writable(c, u);
    const e = list<StoredEntry>('competition-entry', c.schoolId).find(
      (entry) => entry.competitionId === c.id && entry.studentId === u.id,
    );
    if (!e) d.fail(404, '제출한 작품이 없습니다.');
    if (e!.status !== 'SUBMITTED')
      d.fail(409, '최종 제출한 작품만 철회할 수 있어요. 이미 철회한 내용은 다시 저장하지 않아요.');
    if (e!.revision >= 100)
      d.fail(409, '제출 버전 한도에 도달했어요. 선생님에게 대회 운영을 문의해 주세요.');
    const revision = z.number().int().positive().parse(req.body.expectedRevision);
    if (revision !== e!.revision) d.fail(409, '최신 제출 내용을 확인한 후 철회해 주세요.');
    e!.status = 'WITHDRAWN';
    e!.updatedAt = now();
    e!.revision++;
    transaction(() => {
      put('competition-entry', e!, c.schoolId);
      put(
        'competition-version',
        { ...e!, id: `${e!.id}:${e!.revision}`, entryId: e!.id },
        c.schoolId,
      );
      audit(c, 'entry.withdrawn', u.id, e!.id);
    });
    d.changed(c.schoolId);
    res.json({ ok: true });
  });
  app.get('/api/competitions/:id/entries/:entryId/versions', (req, res) => {
    const { u, c } = load(req),
      e = get<StoredEntry>('competition-entry', String(req.params.entryId), c.schoolId);
    if (!e || e.competitionId !== c.id || (u.role !== 'MASTER' && e.studentId !== u.id))
      d.fail(404, '작품을 찾을 수 없습니다.');
    if (req.query.summary === '1') {
      const rows = db
        .prepare(
          "SELECT json_extract(body,'$.revision') revision,json_extract(body,'$.title') title,json_extract(body,'$.status') status,json_extract(body,'$.submittedAt') submittedAt,json_extract(body,'$.updatedAt') updatedAt FROM records WHERE school_id=? AND kind='competition-version' AND json_extract(body,'$.entryId')=? ORDER BY json_extract(body,'$.revision') DESC",
        )
        .all(c.schoolId, e!.id);
      return res.json(rows.map((row) => ({ id: e!.id, ...row })));
    }
    const versions = list<StoredEntry & { entryId: string }>(
      'competition-version',
      c.schoolId,
    ).filter((v) => v.entryId === e!.id);
    res.json(
      versions.map((v) =>
        entryView({ ...v, id: v.entryId }, c, u.role === 'MASTER' ? 'MASTER' : 'OWNER'),
      ),
    );
  });
  app.get('/api/competitions/:id/entries/:entryId/versions/:revision', (req, res) => {
    const { u, c } = load(req),
      entryId = String(req.params.entryId);
    const e = get<StoredEntry>('competition-entry', entryId, c.schoolId);
    if (!e || e.competitionId !== c.id || (u.role !== 'MASTER' && e.studentId !== u.id))
      d.fail(404, '작품을 찾을 수 없습니다.');
    const revision = z.coerce.number().int().min(1).max(100).parse(req.params.revision);
    const version = get<StoredEntry & { entryId: string }>(
      'competition-version',
      `${entryId}:${revision}`,
      c.schoolId,
    );
    if (!version || version.entryId !== entryId || version.competitionId !== c.id)
      d.fail(404, '제출 버전을 찾을 수 없습니다.');
    res.json(entryView({ ...version!, id: entryId }, c, u.role === 'MASTER' ? 'MASTER' : 'OWNER'));
  });
  app.get('/api/competitions/:id/score-reviews', (req, res) => {
    const { c } = load(req, true);
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .max(100000)
      .parse(req.query.offset || 0);
    const rows = db
      .prepare(
        'SELECT s.id,s.entry_id,s.body,s.created_at,p.label FROM competition_scores s LEFT JOIN competition_judge_passes p ON p.id=s.judge_id AND p.school_id=s.school_id AND p.competition_id=s.competition_id WHERE s.school_id=? AND s.competition_id=? ORDER BY s.created_at DESC,s.id DESC LIMIT 50 OFFSET ?',
      )
      .all(c.schoolId, c.id, offset) as {
      id: string;
      entry_id: string;
      body: string;
      created_at: string;
      label: string | null;
    }[];
    const total = (
      db
        .prepare('SELECT count(*) n FROM competition_scores WHERE school_id=? AND competition_id=?')
        .get(c.schoolId, c.id) as { n: number }
    ).n;
    res.json({
      total,
      offset,
      limit: 50,
      scores: rows.map((row) => {
        const value = JSON.parse(row.body),
          entry = get<StoredEntry>('competition-entry', row.entry_id, c.schoolId);
        const review = get<{
          revision: number;
          excluded: boolean;
          reason: string;
          updatedAt: string;
        }>('competition-score-review', 'score-review:' + row.id, c.schoolId);
        return {
          id: row.id,
          entryId: row.entry_id,
          title: entry?.title || '보존된 출품작',
          judgeLabel: row.label || '복원된 심사자',
          createdAt: row.created_at,
          practicality: value.practicality,
          usability: value.usability,
          completeness: value.completeness,
          creativity: value.creativity,
          comment: value.comment,
          review: review
            ? {
                revision: review.revision,
                excluded: review.excluded,
                reason: review.reason,
                updatedAt: review.updatedAt,
              }
            : { revision: 0, excluded: false, reason: '', updatedAt: null },
        };
      }),
    });
  });
  app.post('/api/competitions/:id/score-reviews/:scoreId', (req, res) => {
    const { u, c } = load(req, true);
    d.rate('score-review:' + u.id, 30, 60000);
    const value = z
      .object({
        revision: z.number().int().min(0).max(99),
        excluded: z.boolean(),
        reason: text(1000).min(5),
      })
      .parse(req.body);
    if (c.resultsPublished || c.archived)
      d.fail(
        409,
        '공개한 결과는 먼저 공개를 철회해야 검토할 수 있어요. 보관한 대회는 변경할 수 없어요.',
      );
    const scoreId = String(req.params.scoreId);
    transaction(() => {
      const row = db
        .prepare(
          'SELECT body FROM competition_scores WHERE id=? AND school_id=? AND competition_id=?',
        )
        .get(scoreId, c.schoolId, c.id) as { body: string } | undefined;
      if (!row) d.fail(404, '평가를 찾을 수 없습니다.');
      const previous = get<{ revision: number; excluded: boolean; originalHash: string }>(
        'competition-score-review',
        'score-review:' + scoreId,
        c.schoolId,
      );
      if ((previous?.revision || 0) !== value.revision)
        d.fail(409, '다른 화면에서 검토 상태가 바뀌었어요. 다시 불러와 주세요.');
      if ((previous?.excluded || false) === value.excluded)
        d.fail(409, '이미 같은 검토 상태입니다.');
      if (previous && previous.originalHash !== digest(row!.body))
        d.fail(409, '평가 원본이 달라져 검토를 중단했어요. 운영 기록을 확인해 주세요.');
      const record = {
        id: 'score-review:' + scoreId,
        scoreId,
        competitionId: c.id,
        revision: value.revision + 1,
        excluded: value.excluded,
        reason: value.reason,
        actor: u.id,
        updatedAt: now(),
        originalHash: digest(row!.body),
      };
      put('competition-score-review', record, c.schoolId);
      put(
        'competition-score-review-version',
        { ...record, id: scoreId + ':' + record.revision },
        c.schoolId,
      );
      audit(
        c,
        value.excluded ? 'score.excluded' : 'score.restored',
        u.id,
        scoreId + '; ' + value.reason,
      );
    });
    d.changed(c.schoolId);
    res.json({ ok: true });
  });
  app.post('/api/competitions/:id/extensions', (req, res) => {
    const { u, c } = load(req, true),
      v = z
        .object({ studentId: text(100).min(1), dueAt: iso, reason: text(500).min(1) })
        .parse(req.body);
    if (
      c.archived ||
      Date.now() >= Date.parse(c.judgingStartsAt) ||
      !c.participantIds.includes(v.studentId)
    )
      d.fail(409, '심사 전 참가 학생에게만 제출 연장을 지정할 수 있습니다.');
    if (
      Date.parse(v.dueAt) <= Math.max(Date.now(), Date.parse(c.submissionDueAt)) ||
      Date.parse(v.dueAt) > Date.parse(c.judgingStartsAt)
    )
      d.fail(400, '새 제출 기한은 기존 마감 이후부터 심사 시작 이전으로 지정해 주세요.');
    const extension: Extension = { ...v, id: c.id + ':' + v.studentId, competitionId: c.id };
    transaction(() => {
      put('competition-extension', extension, c.schoolId);
      audit(c, 'deadline.extended', u.id, `${v.studentId}; ${v.dueAt}; ${v.reason}`);
      notify(c, 'deadline.extended', '제출 기한이 연장됐어요. 새 기한을 확인해 주세요.', [
        v.studentId,
      ]);
    });
    d.changed(c.schoolId);
    res.json(extension);
  });
  app.get('/api/competitions/:id/entries/:entryId/files/:fileId', (req, res) => {
    const { u, c } = load(req),
      f = get<StoredFile>('competition-file', String(req.params.fileId), c.schoolId),
      e = get<StoredEntry>('competition-entry', String(req.params.entryId), c.schoolId);
    if (
      !f ||
      !e ||
      f.competitionId !== c.id ||
      e.competitionId !== c.id ||
      f.entryId !== e.id ||
      (u.role !== 'MASTER' && e.studentId !== u.id)
    )
      d.fail(404, '첨부파일을 찾을 수 없습니다.');
    safeDownload(res, f!);
  });
  app.post('/api/competitions/:id/judge-passes', (req, res) => {
    const { u, c } = load(req, true),
      v = z
        .object({
          label: text(80).min(1),
          expiresAt: iso.optional(),
          entryIds: z.array(z.string().uuid()).max(120).default([]),
        })
        .parse(req.body);
    if (!c.published || c.archived || Date.now() >= Date.parse(c.judgingEndsAt))
      d.fail(409, '진행 중인 대회의 심사 KEY만 발급할 수 있습니다.');
    if (passes(c).length >= 300) d.fail(409, '대회별 심사 KEY 한도에 도달했습니다.');
    const allowed = new Set(
      list<StoredEntry>('competition-entry', c.schoolId)
        .filter((e) => e.competitionId === c.id)
        .map((e) => e.id),
    );
    if (v.entryIds.some((entry) => !allowed.has(entry)))
      d.fail(400, '현재 대회의 작품만 심사 범위에 포함해 주세요.');
    // Read-only scoped access remains available for announced results. Scoring and
    // new activation still close exactly at judgingEndsAt, regardless of this TTL.
    const readUntil = Math.min(Date.parse(c.resultsAt) + 7 * 86400000, Date.now() + 30 * 86400000);
    const expires = v.expiresAt ? Date.parse(v.expiresAt) : readUntil;
    if (expires <= Date.now() || expires > readUntil)
      d.fail(400, 'KEY 만료는 현재 이후부터 발표 후 7일(최대 발급 후 30일)까지 지정해 주세요.');
    const key = randomBytes(32).toString('base64url'),
      passId = id(),
      createdAt = now();
    transaction(() => {
      db.prepare(
        'INSERT INTO competition_judge_passes(id,school_id,competition_id,key_hash,label,entry_ids,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)',
      ).run(
        passId,
        c.schoolId,
        c.id,
        digest(key),
        v.label,
        JSON.stringify([...new Set(v.entryIds)]),
        expires,
        createdAt,
      );
      audit(c, 'judge-pass.created', u.id, passId);
    });
    res.status(201).json({ key, pass: passes(c).find((p) => p.id === passId) });
  });
  app.delete('/api/competitions/:id/judge-passes/:passId', (req, res) => {
    const { u, c } = load(req, true);
    const changed = transaction(() => {
      const result = db
        .prepare(
          'UPDATE competition_judge_passes SET revoked=1 WHERE id=? AND school_id=? AND competition_id=?',
        )
        .run(String(req.params.passId), c.schoolId, c.id);
      db.prepare(
        'DELETE FROM competition_judge_sessions WHERE judge_id=? AND school_id=? AND competition_id=?',
      ).run(String(req.params.passId), c.schoolId, c.id);
      if (result.changes) audit(c, 'judge-pass.revoked', u.id, String(req.params.passId));
      return result.changes;
    });
    if (!changed) d.fail(404, '심사 KEY를 찾을 수 없습니다.');
    res.json({ ok: true });
  });
  app.get('/api/public/competitions/:id', (req, res) => {
    const c = publicLoad(req),
      judge = judgeSession(req, c);
    const entries = submitted(c).filter((e) =>
      judge
        ? hasScope(judge, e.id)
        : c.visibility === 'PUBLIC' && e.consentPublic && e.consentVisibility === 'PUBLIC',
    );
    const resultIds = new Set(entries.map((e) => e.id));
    const {
      id: contestId,
      name,
      description,
      opensAt,
      submissionDueAt,
      judgingStartsAt,
      judgingEndsAt,
      resultsAt,
      visibility,
      awardNames,
      minJudges,
    } = c;
    res.json({
      competition: {
        id: contestId,
        name,
        description,
        opensAt,
        submissionDueAt,
        judgingStartsAt,
        judgingEndsAt,
        resultsAt,
        visibility,
        awardNames,
        minJudges,
        state: competitionState(c),
      },
      entries: entries.map((e) => entryView(e, c, judge ? 'JUDGE' : 'PUBLIC')),
      ...(judge
        ? {
            judge: {
              id: judge.id,
              label: judge.label,
              allowedEntryIds: entries.map((e) => e.id),
              scoredEntryIds: (
                db
                  .prepare(
                    'SELECT entry_id FROM competition_scores WHERE school_id=? AND competition_id=? AND judge_id=?',
                  )
                  .all(c.schoolId, c.id, judge.id) as { entry_id: string }[]
              ).map((r) => r.entry_id),
            },
          }
        : {}),
      ...(c.resultsPublished ? { results: ranks(c).filter((r) => resultIds.has(r.entryId)) } : {}),
      serverNow: now(),
    });
  });
  app.post('/api/public/competitions/:id/judge-session', (req, res) => {
    const c = publicLoad(req);
    // School guests often share a NAT: bound guessing without blocking a 30-person jury.
    d.rate('competition-key-ip:' + req.ip, 180, 15 * 60000);
    d.rate('competition-key:' + c.id + ':' + req.ip, 60, 15 * 60000);
    const v = z
      .object({
        key: z
          .string()
          .min(32)
          .max(100)
          .regex(/^[A-Za-z0-9_-]+$/),
      })
      .parse(req.body);
    if (Date.now() >= Date.parse(c.judgingEndsAt))
      d.fail(409, '심사가 종료되어 KEY를 사용할 수 없습니다.');
    const token = randomBytes(32).toString('hex');
    const pass = transaction(() => {
      const p = db
        .prepare(
          'SELECT * FROM competition_judge_passes WHERE key_hash=? AND school_id=? AND competition_id=?',
        )
        .get(digest(v.key), c.schoolId, c.id) as JudgeRow | undefined;
      if (!p || p.revoked || p.used_at || p.expires_at <= Date.now())
        d.fail(403, '유효하지 않거나 이미 사용한 심사 KEY입니다. 발급한 선생님에게 확인해 주세요.');
      const updated = db
        .prepare(
          'UPDATE competition_judge_passes SET used_at=? WHERE id=? AND used_at IS NULL AND revoked=0 AND expires_at>?',
        )
        .run(Date.now(), p!.id, Date.now());
      if (Number(updated.changes) !== 1) d.fail(409, '이미 활성화한 심사 KEY입니다.');
      db.prepare('INSERT INTO competition_judge_sessions VALUES(?,?,?,?,?)').run(
        digest(token),
        c.schoolId,
        c.id,
        p!.id,
        p!.expires_at,
      );
      audit(c, 'judge-pass.activated', p!.id);
      return p!;
    });
    res.cookie(cookieName(c.id), token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.COOKIE_SECURE === 'true',
      path: '/api/public/competitions/' + c.id,
      maxAge: Math.max(0, pass.expires_at - Date.now()),
    });
    res.json({ ok: true });
  });
  app.delete('/api/public/competitions/:id/judge-session', (req, res) => {
    const c = publicLoad(req),
      token = req.headers.cookie
        ?.split(';')
        .map((v) => v.trim())
        .find((v) => v.startsWith(cookieName(c.id) + '='))
        ?.split('=')[1];
    if (token)
      db.prepare(
        'DELETE FROM competition_judge_sessions WHERE token_hash=? AND school_id=? AND competition_id=?',
      ).run(digest(token), c.schoolId, c.id);
    res.clearCookie(cookieName(c.id), {
      path: '/api/public/competitions/' + c.id,
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.COOKIE_SECURE === 'true',
    });
    res.json({ ok: true });
  });
  app.post('/api/public/competitions/:id/entries/:entryId/scores', (req, res) => {
    const c = publicLoad(req),
      judge = judgeSession(req, c);
    if (!judge) d.fail(401, '심사 KEY를 먼저 활성화해 주세요.');
    d.rate('competition-score:' + judge!.id, 120, 60000);
    const v = scoreSchema.parse(req.body),
      entryId = String(req.params.entryId);
    const e = submitted(c).find((entry) => entry.id === entryId);
    if (!e || !hasScope(judge!, entryId)) d.fail(404, '심사할 수 있는 작품이 아닙니다.');
    const { idempotencyKey, ...body } = v,
      hash = digest(JSON.stringify({ entryId, ...body }));
    const result = transaction(() => {
      const existing = db
        .prepare(
          'SELECT entry_id,payload_hash,body FROM competition_scores WHERE school_id=? AND competition_id=? AND judge_id=? AND idempotency_key=?',
        )
        .get(c.schoolId, c.id, judge!.id, idempotencyKey) as
        { entry_id: string; payload_hash: string; body: string } | undefined;
      if (existing) {
        if (existing.entry_id === entryId && existing.payload_hash === hash)
          return JSON.parse(existing.body) as typeof body;
        d.fail(409, '같은 요청 번호로 다른 심사를 제출할 수 없습니다.');
      }
      if (competitionState(c) !== 'JUDGING')
        d.fail(409, '지금은 심사 기간이 아닙니다. 서버 기준 일정을 확인해 주세요.');
      if (
        db
          .prepare(
            'SELECT 1 FROM competition_scores WHERE school_id=? AND competition_id=? AND judge_id=? AND entry_id=?',
          )
          .get(c.schoolId, c.id, judge!.id, entryId)
      ) {
        // Audit is written outside the failed transaction below, so it survives rollback.
        return null;
      }
      db.prepare('INSERT INTO competition_scores VALUES(?,?,?,?,?,?,?,?,?)').run(
        id(),
        c.schoolId,
        c.id,
        judge!.id,
        entryId,
        idempotencyKey,
        hash,
        JSON.stringify(body),
        now(),
      );
      audit(c, 'score.submitted', judge!.id, entryId);
      return body;
    });
    if (!result) {
      audit(c, 'score.duplicate-rejected', judge!.id, entryId);
      d.fail(409, '이 작품은 이미 최종 심사를 제출했습니다. 점수는 한 번만 제출할 수 있습니다.');
    }
    res.json({
      ok: true,
      score: {
        ...result,
        total: result!.practicality + result!.usability + result!.completeness + result!.creativity,
      },
    });
  });
  app.get('/api/public/competitions/:id/entries/:entryId/files/:fileId', (req, res) => {
    const c = publicLoad(req),
      judge = judgeSession(req, c),
      e = submitted(c).find((entry) => entry.id === req.params.entryId);
    const publicAllowed =
      c.visibility === 'PUBLIC' && e?.consentPublic && e.consentVisibility === 'PUBLIC';
    if (!e || (!publicAllowed && (!judge || !hasScope(judge, e.id))))
      d.fail(404, '첨부파일을 찾을 수 없습니다.');
    const f = get<StoredFile>('competition-file', String(req.params.fileId), c.schoolId);
    if (
      !f ||
      f.competitionId !== c.id ||
      f.entryId !== e!.id ||
      (f.id !== e!.artifactId && f.id !== e!.introFileId) ||
      (f.purpose === 'INTRO' && (!judge || !hasScope(judge, e!.id)))
    )
      d.fail(404, '첨부파일을 찾을 수 없습니다.');
    safeDownload(res, f!);
  });
}
