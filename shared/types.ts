import type { PersonalEvent } from './events';
import type {
  TechnicalAnalysis,
  RoadmapStep,
  WorkLog,
  QuestionStatus,
  Submission,
  Attachment,
} from './learning';
export type Role = 'MASTER' | 'STUDENT';
export type Membership = 'INVITED' | 'ACTIVE' | 'ON_LEAVE' | 'GRADUATED' | 'REVOKED';
export type ProjectStatus =
  'IDEA' | 'PLANNING' | 'BUILDING' | 'TESTING' | 'REVIEW' | 'COMPLETED' | 'PAUSED';
export type Appearance = {
  skin: string;
  hair: string;
  hairstyle: number;
  eyes: string;
  eyeShape: number;
  brows: number;
  mouth: number;
  expression: number;
  accessory: number;
  body: number;
};
export const defaultAppearance: Appearance = {
  skin: '#f1c6a1',
  hair: '#44372d',
  hairstyle: 0,
  eyes: '#34364a',
  eyeShape: 0,
  brows: 0,
  mouth: 0,
  expression: 0,
  accessory: 0,
  body: 0,
};
export type Member = {
  id: string;
  schoolId: string;
  name: string;
  role: Role;
  status: Membership;
  appearance: Appearance;
  help: boolean;
  helpSource?: 'MANUAL' | 'QUESTION';
  workStatus: 'IDLE' | 'BUILDING' | 'MENTORING';
  deskId: string | null;
  previousDeskId?: string | null;
};
export type Task = { id: string; text: string; done: boolean };
export type Entry = {
  id: string;
  author: string;
  name: string;
  text: string;
  createdAt: string;
  kind?: string;
  topic?: string;
  feedbackStatus?: 'OPEN' | 'ACKNOWLEDGED' | 'DONE';
  work?: WorkLog;
  status?: QuestionStatus;
  answers?: Entry[];
};
export type AIMessage = {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
  createdAt: string;
};
export type Project = {
  id: string;
  schoolId: string;
  ownerId: string;
  title: string;
  purpose: string;
  problem: string;
  audience: string;
  features: string;
  experience: string;
  aiTools: string;
  technologies: string;
  startDate: string;
  targetDate: string;
  githubUrl: string;
  serviceUrl: string;
  references: string;
  status: ProjectStatus;
  isPublic: boolean;
  tasks: Task[];
  updates: Entry[];
  questions: Entry[];
  feedback: Entry[];
  aiMessages: AIMessage[];
  approved: boolean;
  analysis?: TechnicalAnalysis;
  roadmap?: RoadmapStep[];
  submissions?: Submission[];
  attachments?: Attachment[];
  helpRequested?: boolean;
  createdAt: string;
  updatedAt: string;
};
export type Desk = { id: string; schoolId: string; x: number; y: number };
export type Material = {
  id: string;
  title: string;
  description: string;
  category: string;
  version: number;
  visibility: 'ACTIVE' | 'ALL';
  fileName: string;
  mime: string;
  size: number;
  createdAt: string;
  topics?: string[];
};
export type Invitation = {
  id: string;
  label: string;
  expiresAt: string;
  usedAt: string | null;
  revoked: boolean;
  createdAt: string;
};
export type Message = Entry & { type: 'CHAT' | 'NOTICE'; recipientId: string | null };
export type History = {
  id: string;
  memberId: string;
  actor: string;
  from: string;
  to: string;
  reason: string;
  createdAt: string;
};
export type AppState = {
  me: Member;
  members: Member[];
  projects: Project[];
  desks: Desk[];
  materials: Material[];
  messages: Message[];
  invitations: Invitation[];
  history: History[];
  demo: boolean;
  aiConfigured: boolean;
  online: string[];
  events?: PersonalEvent[];
  world?: { width: number; height: number };
};
export const statusLabels: Record<ProjectStatus, string> = {
  IDEA: '아이디어',
  PLANNING: '기획 중',
  BUILDING: '개발 중',
  TESTING: '테스트 중',
  REVIEW: '검토 대기',
  COMPLETED: '완료',
  PAUSED: '잠시 멈춤',
};
export const membershipLabels: Record<Membership, string> = {
  INVITED: '입학 대기',
  ACTIVE: '재학',
  ON_LEAVE: '휴학',
  GRADUATED: '졸업',
  REVOKED: '제적',
};
export const progress = (p: Project) => {
  const items = [...p.tasks, ...(p.roadmap || [])];
  return items.length ? Math.round((items.filter((t) => t.done).length / items.length) * 100) : 0;
};
export const emptyProject = () => ({
  title: '',
  purpose: '',
  problem: '',
  audience: '',
  features: '',
  experience: '처음 시작해요',
  aiTools: '',
  technologies: '',
  startDate: new Date().toISOString().slice(0, 10),
  targetDate: '',
  githubUrl: '',
  serviceUrl: '',
  references: '',
  status: 'IDEA' as ProjectStatus,
  isPublic: false,
});
