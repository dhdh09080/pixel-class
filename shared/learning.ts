import type { Project, Entry } from './types';
export type TechnicalAnalysis = {
  productType: '' | 'WEB' | 'DESKTOP' | 'AUTOMATION';
  frontend: boolean | null;
  backend: boolean | null;
  database: boolean | null;
  externalApi: boolean | null;
  aiModel: boolean | null;
  deployment: boolean | null;
  difficulty: '' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
};
export const defaultAnalysis = (): TechnicalAnalysis => ({
  productType: '',
  frontend: null,
  backend: null,
  database: null,
  externalApi: null,
  aiModel: null,
  deployment: null,
  difficulty: '',
});
export const technicalFields = [
  ['frontend', '화면(프런트엔드)'],
  ['backend', '서버(백엔드)'],
  ['database', '데이터베이스'],
  ['externalApi', '외부 API'],
  ['aiModel', 'AI 모델 연결'],
  ['deployment', '배포'],
] as const;
export const technicalTopics = [
  'API 연결',
  '서버 구축',
  'DB 설계',
  '사용자 인증',
  '웹 배포',
  'AI 모델 연결',
  '자동화',
  '오류 해결',
  'UI/UX 개선',
  '기타',
] as const;
export type RoadmapStep = { id: string; text: string; description: string; done: boolean };
export type WorkLog = {
  completed: string;
  inProgress: string;
  next: string;
  blockers: string;
  references: string;
};
export const emptyWorkLog = (): WorkLog => ({
  completed: '',
  inProgress: '',
  next: '',
  blockers: '',
  references: '',
});
export type QuestionStatus = 'NEW' | 'ACKNOWLEDGED' | 'ANSWERED' | 'RESOLVED';
export const questionLabels: Record<QuestionStatus, string> = {
  NEW: '새 질문',
  ACKNOWLEDGED: '확인 중',
  ANSWERED: '답변 완료',
  RESOLVED: '해결됨',
};
export type Attachment = {
  id: string;
  projectId: string;
  fileName: string;
  mime: string;
  size: number;
  createdAt: string;
};
export type Submission = {
  id: string;
  overview: string;
  serviceUrl: string;
  githubUrl: string;
  features: string;
  aiTools: string;
  lessons: string;
  attachmentIds: string[];
  createdAt: string;
  status: 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED';
  review?: Entry;
};
export const normalizeProject = (p: Project): Project => ({
  ...p,
  revision: p.revision || 0,
  helpRequested:
    p.helpRequested ?? p.questions.some((q) => ['NEW', 'ACKNOWLEDGED'].includes(q.status || 'NEW')),
  analysis: { ...defaultAnalysis(), ...p.analysis },
  roadmap: p.roadmap || [],
  submissions: p.submissions || [],
  attachments: p.attachments || [],
  questions: p.questions.map((q) => ({
    ...q,
    status: q.status || 'NEW',
    answers: q.answers || [],
  })),
});
export function roadmapTemplate(analysis: TechnicalAnalysis, choice = 'AUTO'): RoadmapStep[] {
  const kind =
    choice === 'AUTO'
      ? analysis.aiModel
        ? 'AI'
        : analysis.productType === 'AUTOMATION' || analysis.externalApi
          ? 'API'
          : analysis.database
            ? 'DATA'
            : analysis.productType === 'DESKTOP'
              ? 'DESKTOP'
              : 'WEB'
      : choice;
  const steps: Record<string, string[]> = {
    WEB: ['화면 구성', '핵심 기능 구현', '사용자 테스트', '웹 배포'],
    DATA: [
      '요구사항 정리',
      'DB 설계',
      '사용자 인증',
      '데이터 등록·수정·삭제',
      '권한 관리',
      '테스트와 배포',
    ],
    API: [
      'API 제공 여부 확인',
      '인증키 발급과 서버 보관',
      '요청·응답 분석',
      'API 연결',
      '예외 처리',
      '실행 조건과 배포',
    ],
    AI: [
      '모델 선정',
      '프롬프트 설계',
      '서버 측 API 연결',
      '대화 기록',
      '호출량과 비용 제한',
      '응답 검증',
      '배포',
    ],
    DESKTOP: [
      '사용 환경과 요구사항',
      '데스크톱 화면',
      '핵심 기능과 로컬 저장',
      '권한과 설치 테스트',
      '설치 파일 준비',
    ],
  };
  return (steps[kind] || steps.WEB).map((text) => ({
    id: crypto.randomUUID(),
    text,
    description: '이 단계에서 확인할 결과와 작은 작업을 직접 적어보세요.',
    done: false,
  }));
}
export function recommendedMaterials(
  p: Project,
  materials: { id: string; topics?: string[]; title: string; description: string }[],
) {
  const a = p.analysis || defaultAnalysis();
  const terms = [
    p.technologies,
    p.aiTools,
    p.features,
    a.database ? 'DB 데이터베이스' : '',
    a.externalApi ? 'API' : '',
    a.aiModel ? 'AI 프롬프트' : '',
    a.backend ? '서버 호스팅' : '',
    a.frontend ? '웹 개발' : '',
    a.deployment ? '배포 GitHub' : '',
  ]
    .join(' ')
    .toLowerCase();
  return materials.filter((m) =>
    (m.topics || []).some((t) =>
      t.split(/[\s·]+/).some((word) => word.length > 1 && terms.includes(word.toLowerCase())),
    ),
  );
}
export const lastWorkDate = (p: Project) => p.updates.at(-1)?.createdAt || p.createdAt;
export const isStale = (p: Project, at = Date.now()) =>
  !['COMPLETED', 'PAUSED'].includes(p.status) && at - Date.parse(lastWorkDate(p)) >= 7 * 86400000;
/** Redact likely credentials and personal identifiers before sending student text to a model. */
export function redactSensitive(text: string, knownSecrets: readonly string[] = []) {
  for (const secret of knownSecrets)
    if (secret.length >= 8) text = text.split(secret).join('[서버 비밀값 제외]');
  return text
    .replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g, '[비밀키 제외]')
    .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, '[인증 토큰 제외]')
    .replace(
      /((?:api[_ -]?key|secret|password|비밀번호|인증키|토큰)\s*["']?\s*[:=]\s*["']?)[^\s,;"'}]+/gi,
      '$1[제외]',
    )
    .replace(
      /\b(?:gh[pousr]_[a-zA-Z0-9_]{12,}|github_pat_[a-zA-Z0-9_]{12,})\b/g,
      '[접근 토큰 제외]',
    )
    .replace(/\bBearer\s+[a-zA-Z0-9._~-]+/gi, 'Bearer [인증 토큰 제외]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[이메일 제외]')
    .replace(/\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b/g, '[전화번호 제외]')
    .replace(/\b\d{6}[- ]?[1-4]\d{6}\b/g, '[개인식별번호 제외]');
}
export function aiProjectContext(p: Project) {
  return redactSensitive(
    JSON.stringify({
      title: p.title,
      purpose: p.purpose,
      features: p.features,
      stage: p.status,
      technologies: p.technologies,
      analysis: p.analysis,
      blockers: p.updates.slice(-3).map((e) => e.work?.blockers || ''),
      recentWork: p.updates.slice(-3).map((e) => e.work || e.text),
      questions: p.questions
        .filter((q) => q.status !== 'RESOLVED')
        .slice(-3)
        .map((q) => q.text),
    }),
  );
}
export function codexTemplate(p: Project) {
  return redactSensitive(
    `다음 프로젝트의 다음 작은 작업을 구현해 주세요.\n\n프로젝트: ${p.title}\n목적: ${p.purpose || '아직 정하지 않음'}\n예상 사용자: ${p.audience || '아직 정하지 않음'}\n주요 기능: ${p.features || '핵심 기능부터 함께 정리'}\n기술 구성: ${p.technologies || '가장 단순한 구성을 먼저 제안'}\n필요한 구성: ${
      technicalFields
        .filter(([key]) => p.analysis?.[key] === true)
        .map(([, label]) => label)
        .join(', ') || '아직 정하지 않음'
    }\n현재 개발 경험: ${p.experience}\n현재 단계: ${p.status}\n다음 로드맵: ${p.roadmap?.find((s) => !s.done)?.text || '첫 화면부터 작은 단위로 구현'}\n최근 막힌 문제: ${p.updates.at(-1)?.work?.blockers || '기록 없음'}\n\n기존 코드를 먼저 읽고 필요한 부분만 수정해 주세요. 개인정보와 API 키는 프런트엔드에 포함하지 마세요. 완료 조건을 정하고 실제 실행·테스트 결과, 남은 설정을 보고해 주세요. 복잡한 서버 도입은 필요성을 설명하고 선택하세요.`,
  );
}
