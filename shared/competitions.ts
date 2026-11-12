/** Public competition DTOs deliberately contain no account emails or private project records. */
export type CompetitionState =
  | 'DRAFT'
  | 'UPCOMING'
  | 'SUBMISSION_OPEN'
  | 'SUBMISSION_CLOSED'
  | 'JUDGING'
  | 'JUDGING_CLOSED'
  | 'RESULTS_PUBLISHED'
  | 'ARCHIVED';
export const competitionStateLabels: Record<CompetitionState, string> = {
  DRAFT: '준비 중',
  UPCOMING: '접수 예정',
  SUBMISSION_OPEN: '작품 접수 중',
  SUBMISSION_CLOSED: '접수 마감',
  JUDGING: '심사 중',
  JUDGING_CLOSED: '심사 마감',
  RESULTS_PUBLISHED: '결과 발표',
  ARCHIVED: '보관됨',
};
export type SchoolClass = {
  id: string;
  schoolId: string;
  name: string;
  createdAt: string;
  memberIds: string[];
};
export type Competition = {
  id: string;
  schoolId: string;
  classId: string;
  name: string;
  description: string;
  opensAt: string;
  submissionDueAt: string;
  judgingStartsAt: string;
  judgingEndsAt: string;
  resultsAt: string;
  participantIds: string[];
  visibility: 'JUDGES' | 'PUBLIC';
  allowRealNames: boolean;
  awardNames: string[];
  minJudges: number;
  allowedFileTypes: string[];
  judgingMethod: 'KEY_AVERAGE';
  revision: number;
  published: boolean;
  resultsPublished: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  state: CompetitionState;
};
export type CompetitionIntro = {
  serviceName: string;
  purpose: string;
  problem: string;
  audience: string;
  features: string;
  usage: string;
  examples: string;
  aiTools: string;
  development: string;
  screenshots: string;
  effect: string;
  nextSteps: string;
};
export type CompetitionFile = {
  id: string;
  fileName: string;
  mime: string;
  size: number;
  downloadUrl: string;
};
export type CompetitionEntry = {
  id: string;
  competitionId: string;
  studentId?: string;
  projectId?: string;
  title: string;
  displayName: string;
  serviceUrl: string;
  consentPublic: boolean;
  intro: CompetitionIntro;
  introHtml: string;
  artifact?: CompetitionFile;
  introFile?: CompetitionFile;
  revision: number;
  submittedAt: string | null;
  status: 'DRAFT' | 'SUBMITTED' | 'WITHDRAWN';
  createdAt: string;
  updatedAt: string;
  projectSnapshot?: {
    title: string;
    purpose: string;
    problem: string;
    audience: string;
    features: string;
    aiTools: string;
    technologies: string;
    serviceUrl: string;
  };
};
export type CompetitionScoreInput = {
  practicality: number;
  usability: number;
  completeness: number;
  creativity: number;
  comment: string;
  idempotencyKey: string;
};
export type CompetitionResult = {
  entryId: string;
  title: string;
  displayName: string;
  count: number;
  average: number;
  practicality: number;
  usability: number;
  completeness: number;
  creativity: number;
  rank: number | null;
  eligible: boolean;
  award: string | null;
};
export type CompetitionPass = {
  id: string;
  label: string;
  expiresAt: string;
  entryIds: string[];
  usedAt: string | null;
  revoked: boolean;
  createdAt: string;
  scoredCount: number;
};
export type CompetitionAudit = {
  id: string;
  competitionId: string;
  action: string;
  actor: string;
  detail: string;
  createdAt: string;
};
export type CompetitionVersionSummary = Pick<
  CompetitionEntry,
  'id' | 'revision' | 'title' | 'status' | 'submittedAt' | 'updatedAt'
>;
export type CompetitionScoreReview = {
  id: string;
  entryId: string;
  title: string;
  judgeLabel: string;
  createdAt: string;
  practicality: number;
  usability: number;
  completeness: number;
  creativity: number;
  comment: string;
  review: { revision: number; excluded: boolean; reason: string; updatedAt: string | null };
};
export type CompetitionListResponse = {
  classes: SchoolClass[];
  competitions: Competition[];
  serverNow: string;
  activeClassId: string;
};
export type CompetitionDetailResponse = {
  competition: Competition;
  entries: CompetitionEntry[];
  myEntry: CompetitionEntry | null;
  results?: CompetitionResult[];
  passes?: CompetitionPass[];
  audit?: CompetitionAudit[];
  serverNow: string;
  extensions?: { studentId: string; dueAt: string; reason: string }[];
};
export type PublicCompetition = Pick<
  Competition,
  | 'id'
  | 'name'
  | 'description'
  | 'opensAt'
  | 'submissionDueAt'
  | 'judgingStartsAt'
  | 'judgingEndsAt'
  | 'resultsAt'
  | 'state'
  | 'visibility'
  | 'awardNames'
  | 'minJudges'
>;
export type PublicCompetitionResponse = {
  competition: PublicCompetition;
  entries: CompetitionEntry[];
  results?: CompetitionResult[];
  serverNow: string;
  judge?: { id: string; label: string; allowedEntryIds: string[]; scoredEntryIds: string[] };
};
export type CompetitionClassroomEvent = {
  id: string;
  name: string;
  state: CompetitionState;
  classId: string;
  submissionDueAt: string;
  judgingEndsAt: string;
  winners?: string[];
};
export function competitionState(
  c: Pick<
    Competition,
    | 'published'
    | 'archived'
    | 'resultsPublished'
    | 'opensAt'
    | 'submissionDueAt'
    | 'judgingStartsAt'
    | 'judgingEndsAt'
  >,
  time = Date.now(),
): CompetitionState {
  if (c.archived) return 'ARCHIVED';
  if (!c.published) return 'DRAFT';
  if (c.resultsPublished) return 'RESULTS_PUBLISHED';
  if (time < Date.parse(c.opensAt)) return 'UPCOMING';
  if (time < Date.parse(c.submissionDueAt)) return 'SUBMISSION_OPEN';
  if (time < Date.parse(c.judgingStartsAt)) return 'SUBMISSION_CLOSED';
  if (time < Date.parse(c.judgingEndsAt)) return 'JUDGING';
  return 'JUDGING_CLOSED';
}
export const competitionScoreLimits = {
  practicality: 35,
  usability: 30,
  completeness: 20,
  creativity: 15,
} as const;
export const competitionIntroLabels: Record<keyof CompetitionIntro, string> = {
  serviceName: '서비스 이름',
  purpose: '서비스 소개',
  problem: '해결하는 문제',
  audience: '사용할 사람',
  features: '주요 기능',
  usage: '사용 방법',
  examples: '활용 예시',
  aiTools: '활용한 AI',
  development: '개발 과정',
  screenshots: '화면 설명',
  effect: '기대 효과',
  nextSteps: '다음 개선 계획',
};
