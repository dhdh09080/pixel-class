import { SqliteRecordRepository } from './storage/sqlite.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID, scryptSync, randomBytes } from 'node:crypto';
import { defaultAppearance, emptyProject, type Member, type Project } from '../shared/types.js';
import { initialDesks } from '../shared/world.js';
export const demo = process.env.DEMO_MODE !== 'false' && process.env.NODE_ENV !== 'production';
const file = process.env.DATABASE_PATH || (demo ? 'data/demo.sqlite' : 'data/school.sqlite');
mkdirSync(dirname(file), { recursive: true });
export const db = new DatabaseSync(file);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,school_id TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,school_id TEXT NOT NULL,kind TEXT NOT NULL,body TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS records_school_kind ON records(school_id,kind);
CREATE TABLE IF NOT EXISTS invitations(id TEXT PRIMARY KEY,school_id TEXT NOT NULL,key_hash TEXT UNIQUE NOT NULL,body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ai_usage(user_id TEXT NOT NULL,day TEXT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(user_id,day));`);
// Preserve pre-v0.4 usage when introducing the school-wide cap. Atomic and idempotent:
// never reduce reservations or double-count them; include usage written during a v03 rollback.
db.exec(`BEGIN IMMEDIATE;
CREATE TABLE IF NOT EXISTS ai_school_usage(school_id TEXT NOT NULL,day TEXT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(school_id,day));
INSERT INTO ai_school_usage(school_id,day,count)
SELECT users.school_id,ai_usage.day,SUM(ai_usage.count) FROM ai_usage JOIN users ON users.id=ai_usage.user_id GROUP BY users.school_id,ai_usage.day
ON CONFLICT(school_id,day) DO UPDATE SET count=MAX(ai_school_usage.count,excluded.count);
COMMIT;`);
export const SCHOOL = 'pixel-school';
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function userById(userId: string): Member | undefined {
  const row = db.prepare('SELECT body FROM users WHERE id=?').get(userId) as
    { body: string } | undefined;
  return row ? JSON.parse(row.body) : undefined;
}
export function members(schoolId: string): Member[] {
  return (
    db.prepare('SELECT body FROM users WHERE school_id=?').all(schoolId) as { body: string }[]
  ).map((r) => JSON.parse(r.body));
}
export function saveMember(user: Member) {
  db.prepare('UPDATE users SET body=? WHERE id=?').run(JSON.stringify(user), user.id);
}
export function insertMember(user: Member, email: string, password: string) {
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(
    user.id,
    user.schoolId,
    email,
    hashPassword(password),
    JSON.stringify(user),
  );
}
export const records = new SqliteRecordRepository(db);
export const list = <T>(kind: string, schoolId: string) => records.list<T>(kind, schoolId);
export const get = <T>(kind: string, recordId: string, schoolId: string) =>
  records.get<T>(kind, recordId, schoolId);
export const put = <T extends { id: string }>(kind: string, record: T, schoolId = SCHOOL) =>
  records.put(kind, record, schoolId);
export const remove = (kind: string, recordId: string, schoolId: string) =>
  records.remove(kind, recordId, schoolId);
let commitEffects: (() => void)[] | undefined;
/** Realtime effects become observable only after the associated write commits. */
export function afterCommit(effect: () => void) {
  if (commitEffects) commitEffects.push(effect);
  else effect();
}
export function transaction<T>(fn: () => T): T {
  if (commitEffects) throw new Error('Nested transactions are not supported.');
  db.exec('BEGIN IMMEDIATE');
  const effects: (() => void)[] = [];
  commitEffects = effects;
  let value: T;
  try {
    value = fn();
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    commitEffects = undefined;
  }
  for (const effect of effects) {
    try {
      effect();
    } catch {
      console.error('Committed realtime delivery failed; clients may refresh.');
    }
  }
  return value;
}
if (!demo && userById('demo-master')) {
  throw new Error(
    'Demo data cannot be used in private mode. Choose a fresh DATABASE_PATH, such as data/school.sqlite.',
  );
}
if (demo && !userById('demo-student')) {
  initialDesks.forEach((d) => put('desk', { ...d, schoolId: SCHOOL }));
  const names = ['김민수', '이지은', '박준호', '정다희'];
  names.forEach((name, i) =>
    insertMember(
      {
        id: i === 0 ? 'demo-student' : `demo-student-${i}`,
        schoolId: SCHOOL,
        name,
        role: 'STUDENT',
        status: 'ACTIVE',
        appearance: {
          ...defaultAppearance,
          hairstyle: i % 3,
          hair: ['#44372d', '#57362f', '#292a36', '#925b32'][i],
          skin: i === 2 ? '#c88b63' : '#f1c6a1',
          accessory: i === 1 ? 1 : 0,
        },
        help: i === 2,
        workStatus: i === 0 ? 'BUILDING' : 'IDLE',
        deskId: `desk-${i + 1}`,
      },
      `student${i}@demo.local`,
      randomBytes(32).toString('hex'),
    ),
  );
  insertMember(
    {
      id: 'demo-master',
      schoolId: SCHOOL,
      name: '한지훈 선생님',
      role: 'MASTER',
      status: 'ACTIVE',
      appearance: { ...defaultAppearance, accessory: 1 },
      help: false,
      workStatus: 'MENTORING',
      deskId: null,
    },
    'master@demo.local',
    randomBytes(32).toString('hex'),
  );
  const titles = [
    '현장 일지 자동 정리',
    '우리 팀 건강검진 매니저',
    'AI 안전 수칙 도우미',
    '오늘의 뉴스 한 스푼',
  ];
  titles.forEach((title, i) => {
    const p: Project = {
      ...emptyProject(),
      id: `demo-project-${i}`,
      schoolId: SCHOOL,
      ownerId: i === 0 ? 'demo-student' : `demo-student-${i}`,
      title,
      purpose: [
        '매일 쓰는 현장 일지를 AI로 간편하게 정리해요.',
        '우리 팀 검진 일정을 한눈에 관리해요.',
        '현장에서 필요한 안전 수칙을 쉽게 찾아봐요.',
        '바쁜 아침, 중요한 뉴스만 빠르게 읽어요.',
      ][i],
      problem: '반복되는 업무에 시간을 너무 많이 쓰고 있어요.',
      features: '기록 입력, 목록 조회, 결과 내보내기',
      aiTools: 'Codex',
      technologies: 'React · TypeScript',
      status: i === 3 ? 'COMPLETED' : i === 1 ? 'PLANNING' : 'BUILDING',
      isPublic: i !== 1,
      tasks: [
        '사용자와 필요한 기능 정리하기',
        '화면 디자인 만들기',
        '기록 입력 기능 구현하기',
        '저장한 기록 목록 보여주기',
        '팀원에게 테스트 부탁하기',
      ].map((text, j) => ({ id: id(), text, done: i === 3 || j < 3 })),
      updates: [],
      questions:
        i === 2
          ? [
              {
                id: id(),
                author: 'demo-student-2',
                name: '박준호',
                text: 'API 키는 어디에 보관해야 안전할까요?',
                createdAt: now(),
              },
            ]
          : [],
      feedback:
        i === 0
          ? [
              {
                id: id(),
                author: 'demo-master',
                name: '한지훈 선생님',
                text: '첫 화면이 잘 정리됐어요! 다음에는 입력한 일지를 저장하고, 목록에서 다시 확인하는 기능을 만들어 봅시다.',
                kind: '다음 과제',
                createdAt: now(),
              },
            ]
          : [],
      aiMessages: [],
      approved: i === 3,
      createdAt: now(),
      updatedAt: now(),
    };
    put('project', p);
  });
  put('message', {
    id: id(),
    author: 'demo-master',
    name: '한지훈 선생님',
    text: '작은 아이디어도 좋아요. 오늘은 내 프로젝트의 첫 번째 기능을 완성해 봅시다! 🌱',
    createdAt: now(),
    type: 'NOTICE',
    recipientId: null,
  });
  put('material', {
    id: 'intro-guide',
    title: 'AI와 함께 만드는 나의 첫 서비스',
    description: '아이디어부터 첫 화면까지, 부담 없이 시작하는 개발 가이드',
    category: '시작하기',
    version: 1,
    visibility: 'ACTIVE',
    fileName: '첫-서비스-가이드.md',
    mime: 'text/markdown',
    size: 0,
    createdAt: now(),
    content:
      '# 나의 첫 AI 서비스\n\n1. 내가 반복하는 업무 한 가지를 적어보세요.\n2. 누가 사용할지 정하세요.\n3. 가장 중요한 기능 하나를 선택하세요.\n4. Codex에 화면과 동작을 구체적으로 설명하세요.\n5. 직접 사용하고 동료에게 피드백을 받으세요.\n\n## 안전한 개발\nAPI 키는 서버 환경 변수에 보관하세요. 개인정보를 AI에 그대로 입력하지 마세요.',
  });
}
