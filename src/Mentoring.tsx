import { useState } from 'react';
import {
  Users,
  FolderKanban,
  CheckCircle2,
  MessageCircle,
  Clock,
  HelpCircle,
  ArrowUpRight,
} from 'lucide-react';
import type { AppState, Member, Project } from '../shared/types';
import { isStale, lastWorkDate, questionLabels } from '../shared/learning';
import { Avatar, Modal, Status, date, Empty } from './components';
import { QuestionThread } from './LearningPanels';
import type { Mutate } from './Projects';
export function MentoringSummary({
  state,
  onFilter,
}: {
  state: AppState;
  onFilter: (key: string) => void;
}) {
  const projects = state.projects;
  const awaiting = projects.reduce(
    (n, p) =>
      n + p.questions.filter((q) => ['NEW', 'ACKNOWLEDGED'].includes(q.status || 'NEW')).length,
    0,
  );
  const stats = [
    {
      label: '재학생',
      value: state.members.filter((m) => m.role === 'STUDENT' && m.status === 'ACTIVE').length,
      icon: Users,
      key: 'ALL',
    },
    {
      label: '휴학생',
      value: state.members.filter((m) => m.role === 'STUDENT' && m.status === 'ON_LEAVE').length,
      icon: Users,
      key: 'ALL',
    },
    {
      label: '진행 중 프로젝트',
      value: projects.filter((p) => !['COMPLETED', 'PAUSED'].includes(p.status)).length,
      icon: FolderKanban,
      key: 'ALL',
    },
    {
      label: '완료 프로젝트',
      value: projects.filter((p) => p.status === 'COMPLETED').length,
      icon: CheckCircle2,
      key: 'COMPLETED',
    },
    {
      label: '검토 대기',
      value: projects.filter((p) => p.status === 'REVIEW').length,
      icon: CheckCircle2,
      key: 'REVIEW',
    },
    { label: '답변 대기 질문', value: awaiting, icon: MessageCircle, key: 'QUESTIONS' },
    {
      label: '7일간 작업 기록 없음',
      value: projects.filter((p) => isStale(p)).length,
      icon: Clock,
      key: 'STALE',
    },
    {
      label: '도움 요청 프로젝트',
      value: projects.filter((p) => p.helpRequested).length,
      icon: HelpCircle,
      key: 'HELP',
    },
  ];
  return (
    <>
      <div className="stats-grid mentoring-stats">
        {stats.map((s) => (
          <button className="stat-card" key={s.label} onClick={() => onFilter(s.key)}>
            <s.icon size={18} />
            <span>{s.label}</span>
            <strong>{s.value}</strong>
            <p>자세히 보기 ↗</p>
          </button>
        ))}
      </div>
      <p className="muted mentoring-note">
        작업 기록과 직접 선택한 상태를 기준으로 안내합니다. 접속 시간이나 PC 사용량으로 학생을
        평가하지 않아요.
      </p>
    </>
  );
}
export function MasterQuestions({
  state,
  mutate,
  onProject,
}: {
  state: AppState;
  mutate: Mutate;
  onProject: (id: string) => void;
}) {
  const [filter, setFilter] = useState('WAITING');
  const questions = state.projects
    .flatMap((p) => p.questions.map((q) => ({ p, q })))
    .filter(({ q }) =>
      filter === 'ALL' || filter === 'WAITING'
        ? filter === 'ALL' || ['NEW', 'ACKNOWLEDGED'].includes(q.status || 'NEW')
        : q.status === filter,
    )
    .sort((a, b) => b.q.createdAt.localeCompare(a.q.createdAt));
  return (
    <section className="master-questions">
      <div className="between">
        <h3>학생의 다음 한 걸음을 함께 찾아요</h3>
        <select
          aria-label="질문 목록 상태"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="WAITING">답변 대기</option>
          <option value="ALL">전체 질문</option>
          {Object.entries(questionLabels).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      {questions.map(({ p, q }) => (
        <section key={q.id}>
          <button className="text-button" onClick={() => onProject(p.id)}>
            {p.title}
            <ArrowUpRight size={14} />
          </button>
          <QuestionThread q={q} p={p} state={state} mutate={mutate} />
        </section>
      ))}
      {!questions.length && (
        <Empty
          icon={<MessageCircle />}
          title="지금은 대기 중인 질문이 없어요"
          description="프로젝트에서 학생이 남긴 질문이 여기에 모여요."
        />
      )}
    </section>
  );
}
export function StudentMentoring({
  student,
  state,
  mutate,
  onProject,
  onClose,
}: {
  student: Member;
  state: AppState;
  mutate: Mutate;
  onProject: (id: string) => void;
  onClose: () => void;
}) {
  const projects = state.projects.filter((p) => p.ownerId === student.id);
  return (
    <Modal
      title={`${student.name}님의 프로젝트 상담`}
      subtitle="학생이 기록한 진행 상황과 질문을 바탕으로 지도해 주세요."
      onClose={onClose}
      wide
    >
      <div className="profile-hero">
        <Avatar appearance={student.appearance} size={110} />
        <div>
          <h3>{student.name}</h3>
          <p>
            프로젝트 {projects.length}개 · {student.deskId ? '책상 배정됨' : '책상 미배정'}
          </p>
        </div>
      </div>
      {projects.map((p) => (
        <article className="student-mentoring-project" key={p.id}>
          <div className="between">
            <h3>{p.title}</h3>
            <Status status={p.status} />
          </div>
          <p>{p.purpose}</p>
          <div className="project-info-grid">
            <div>
              <h4>사용 기술 · 필요한 구성</h4>
              <p>
                {p.technologies || '아직 정하지 않음'}
                <br />
                {p.analysis?.database ? 'DB · ' : ''}
                {p.analysis?.externalApi ? '외부 API · ' : ''}
                {p.analysis?.aiModel ? 'AI 모델 연결' : ''}
              </p>
            </div>
            <div>
              <h4>현재 막힌 문제</h4>
              <p>
                {p.updates.at(-1)?.work?.blockers ||
                  p.questions.filter((q) => q.status !== 'RESOLVED').at(-1)?.text ||
                  '기록된 문제가 없어요.'}
              </p>
            </div>
            <div>
              <h4>최근 작업 · 마지막 작업 날짜</h4>
              <p>
                {p.updates.at(-1)?.work?.completed ||
                  p.updates.at(-1)?.text ||
                  '아직 작업 기록이 없어요.'}
              </p>
              <small>{date(lastWorkDate(p))}</small>
            </div>
            <div>
              <h4>다음 과제 · MASTER 피드백</h4>
              <p>
                {p.roadmap?.find((s) => !s.done)?.text ||
                  p.tasks.find((t) => !t.done)?.text ||
                  '다음 할 일을 함께 정해 주세요.'}
              </p>
              <p>{p.feedback.at(-1)?.text || '아직 피드백이 없어요.'}</p>
            </div>
          </div>
          <button
            className="button secondary small"
            onClick={() => {
              onClose();
              onProject(p.id);
            }}
          >
            기술 구성·로드맵·피드백 자세히 보기
            <ArrowUpRight size={14} />
          </button>
          {p.questions.slice(-2).map((q) => (
            <QuestionThread key={q.id} q={q} p={p} state={state} mutate={mutate} />
          ))}
        </article>
      ))}
      {!projects.length && <Empty icon={<FolderKanban />} title="아직 등록된 프로젝트가 없어요" />}
    </Modal>
  );
}
export const matchesMentoringFilter = (p: Project, filter: string) =>
  filter === 'ALL' ||
  (filter === 'STALE' && isStale(p)) ||
  (filter === 'HELP' && p.helpRequested) ||
  filter === p.status;
