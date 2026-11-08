import { LearningPlan, QuestionThread, PromptPanel, SubmissionPanel } from './LearningPanels';
import { emptyWorkLog, technicalTopics } from '../shared/learning';
import { useState, useRef, type FormEvent } from 'react';
import {
  Plus,
  ArrowUpRight,
  FolderOpen,
  CheckCircle2,
  MessageCircle,
  GitBranch,
  Link,
  Trash2,
  Pencil,
  Send,
  Sparkles,
  BookOpen,
  ClipboardList,
  Lock,
  Globe,
  Flag,
} from 'lucide-react';
import {
  type AppState,
  type Project,
  type ProjectStatus,
  emptyProject,
  progress,
  statusLabels,
} from '../shared/types';
import {
  Avatar,
  Modal,
  Status,
  Progress,
  Empty,
  Field,
  CheckRow,
  External,
  date,
} from './components';
import { api } from './api';
export type Mutate = (
  path: string,
  method?: string,
  body?: unknown,
  revision?: number,
) => Promise<unknown>;
export function ProjectCards({
  state,
  onOpen,
  onCreate,
  gallery = false,
}: {
  state: AppState;
  onOpen: (id: string) => void;
  onCreate: () => void;
  gallery?: boolean;
}) {
  const [filter, setFilter] = useState('ALL');
  const projects = state.projects
    .filter((p) =>
      gallery ? p.approved && p.isPublic : state.me.role === 'MASTER' || p.ownerId === state.me.id,
    )
    .filter((p) => filter === 'ALL' || p.status === filter);
  return (
    <section className="projects-page">
      <div className="page-section-title">
        <div>
          <p className="eyebrow">{gallery ? 'MADE IN PIXEL CLASS' : 'MY WORKSPACE'}</p>
          <h1>{gallery ? '아이디어가 현실이 된 순간' : '나의 프로젝트'}</h1>
          <p className="muted">
            {gallery
              ? '작은 시작이 멋진 서비스가 되었어요. 서로의 도전을 구경해 보세요.'
              : '하나의 아이디어부터, 나만의 서비스가 완성될 때까지.'}
          </p>
        </div>
        {!gallery && (
          <button className="button primary" onClick={onCreate}>
            <Plus size={17} />
            프로젝트 만들기
          </button>
        )}
      </div>
      {!gallery && (
        <div className="filter-tabs">
          {[
            ['ALL', '전체'],
            ['BUILDING', '개발 중'],
            ['REVIEW', '검토 대기'],
            ['COMPLETED', '완료'],
          ].map(([key, label]) => (
            <button
              className={filter === key ? 'selected' : ''}
              key={key}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="project-grid">
        {projects.map((p, i) => {
          const owner = state.members.find((m) => m.id === p.ownerId);
          return (
            <button className="project-card" key={p.id} onClick={() => onOpen(p.id)}>
              <div className={`project-cover cover-${i % 4}`}>
                <span>{gallery ? <Flag size={35} /> : <FolderOpen size={35} />}</span>
                <span className="pixel-decoration">
                  +<br /> ▪
                </span>
                <span className="cover-number">PROJECT {String(i + 1).padStart(2, '0')}</span>
              </div>
              <div className="project-card-body">
                <div className="between">
                  <Status status={p.status} />
                  {!p.isPublic && <Lock size={14} />}
                </div>
                <h3>{p.title}</h3>
                <p>{p.purpose || '이 프로젝트의 목표를 적어보세요.'}</p>
                <div className="between progress-label">
                  <span>
                    {p.ownerId === state.me.id || state.me.role === 'MASTER'
                      ? `할 일 ${p.tasks.filter((t) => t.done).length}/${p.tasks.length}`
                      : '공개 프로젝트'}
                  </span>
                  <strong>
                    {p.ownerId === state.me.id || state.me.role === 'MASTER'
                      ? `${progress(p)}%`
                      : '보기 ↗'}
                  </strong>
                </div>
                {(p.ownerId === state.me.id || state.me.role === 'MASTER') && (
                  <Progress value={progress(p)} />
                )}
                <div className="project-card-footer">
                  {owner && (
                    <>
                      <Avatar appearance={owner.appearance} size={31} />
                      <span>{owner.name}</span>
                    </>
                  )}
                  <ArrowUpRight size={17} />
                </div>
              </div>
            </button>
          );
        })}
        {!gallery && (
          <button className="new-project-card" onClick={onCreate}>
            <span>
              <Plus size={25} />
            </span>
            <h3>다음 아이디어는 무엇인가요?</h3>
            <p>작은 불편함에서 시작해 보세요.</p>
          </button>
        )}
      </div>
      {!projects.length && gallery && (
        <Empty
          icon={<Flag />}
          title="첫 번째 작품을 기다리고 있어요"
          description="공개 프로젝트를 검토 요청하고 MASTER가 승인하면 여기에 전시돼요."
        />
      )}
    </section>
  );
}
export function ProjectForm({
  project,
  onClose,
  onSaved,
  mutate,
}: {
  project?: Project;
  onClose: () => void;
  onSaved: (id: string) => void;
  mutate: Mutate;
}) {
  const [draft, setDraft] = useState(project ? { ...project } : { ...emptyProject() });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const baseRevision = useRef(project?.revision || 0);
  const change = (key: string, value: unknown) => setDraft((p) => ({ ...p, [key]: value }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const fields = Object.fromEntries(
      Object.keys(emptyProject()).map((k) => [k, draft[k as keyof typeof draft]]),
    );
    try {
      const p = (await mutate(
        project ? `/projects/${project.id}` : '/projects',
        project ? 'PATCH' : 'POST',
        fields,
        project ? baseRevision.current : undefined,
      )) as Project;
      onSaved(p.id);
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={project ? '프로젝트 다듬기' : '어떤 서비스를 만들고 싶나요?'}
      subtitle="아직 정하지 못한 내용은 비워 두어도 괜찮아요."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="project-form">
        {saveError && (
          <div className="form-message error" role="alert">
            <strong>저장하지 못했어요</strong>
            <p>{saveError}</p>
            {project && (
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  if (window.confirm('현재 입력을 버리고 최신 저장 내용을 불러올까요?')) {
                    setDraft({ ...project });
                    baseRevision.current = project.revision || 0;
                    setSaveError('');
                  }
                }}
              >
                최신 내용 불러오기
              </button>
            )}
          </div>
        )}
        <Field label="프로젝트 이름 *">
          <input
            required
            maxLength={100}
            autoFocus
            value={draft.title}
            onChange={(e) => change('title', e.target.value)}
            placeholder="예: 현장 일지 자동 정리"
          />
        </Field>
        <Field label="프로젝트 목적">
          <textarea
            value={draft.purpose}
            onChange={(e) => change('purpose', e.target.value)}
            placeholder="어떤 서비스를 만들고 싶은지 한 문장으로 적어보세요."
            rows={2}
          />
        </Field>
        <div className="form-grid">
          <Field label="해결하고 싶은 문제">
            <textarea
              value={draft.problem}
              onChange={(e) => change('problem', e.target.value)}
              rows={2}
              placeholder="평소 어떤 점이 불편했나요?"
            />
          </Field>
          <Field label="예상 사용자">
            <textarea
              value={draft.audience}
              onChange={(e) => change('audience', e.target.value)}
              rows={2}
              placeholder="누구를 위한 서비스인가요?"
            />
          </Field>
        </div>
        <Field label="주요 기능">
          <textarea
            value={draft.features}
            onChange={(e) => change('features', e.target.value)}
            rows={2}
            placeholder="꼭 필요한 기능부터 적어보세요."
          />
        </Field>
        <div className="form-grid">
          <Field label="현재 단계">
            <select value={draft.status} onChange={(e) => change('status', e.target.value)}>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="개발 경험">
            <select value={draft.experience} onChange={(e) => change('experience', e.target.value)}>
              {['처음 시작해요', '조금 만들어 봤어요', '스스로 만들 수 있어요'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="시작일">
            <input
              type="date"
              value={draft.startDate}
              onChange={(e) => change('startDate', e.target.value)}
            />
          </Field>
          <Field label="목표 완료일">
            <input
              type="date"
              value={draft.targetDate}
              min={draft.startDate || undefined}
              onChange={(e) => change('targetDate', e.target.value)}
            />
          </Field>
          <Field label="사용하는 AI 도구">
            <input
              value={draft.aiTools}
              onChange={(e) => change('aiTools', e.target.value)}
              placeholder="Codex, ChatGPT…"
            />
          </Field>
          <Field label="필요한 기술">
            <input
              value={draft.technologies}
              onChange={(e) => change('technologies', e.target.value)}
              placeholder="잘 모르겠다면 비워두세요."
            />
          </Field>
          <Field label="GitHub URL">
            <input
              type="url"
              value={draft.githubUrl}
              onChange={(e) => change('githubUrl', e.target.value)}
              placeholder="https://github.com/…"
            />
          </Field>
          <Field label="서비스 URL">
            <input
              type="url"
              value={draft.serviceUrl}
              onChange={(e) => change('serviceUrl', e.target.value)}
              placeholder="https://…"
            />
          </Field>
        </div>
        <Field label="참고자료">
          <textarea
            value={draft.references}
            onChange={(e) => change('references', e.target.value)}
            rows={2}
            placeholder="참고할 내용이나 교안 이름, 링크"
          />
        </Field>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={draft.isPublic}
            onChange={(e) => change('isPublic', e.target.checked)}
          />
          <Globe size={17} />
          <span>
            교실에 프로젝트 소개 공개하기
            <small>이름·목적·단계·결과 링크만 공개돼요. 질문과 피드백은 비공개예요.</small>
          </span>
        </label>
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            취소
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? '저장 중…' : project ? '변경사항 저장' : '프로젝트 시작하기'}
            <ArrowUpRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function ProjectDetail({
  project: p,
  state,
  onClose,
  onEdit,
  onDeleted,
  mutate,
  onToast,
}: {
  project: Project;
  state: AppState;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
  mutate: Mutate;
  onToast: (s: string) => void;
}) {
  const mine = p.ownerId === state.me.id,
    master = state.me.role === 'MASTER',
    privateView = mine || master;
  const [tab, setTab] = useState('overview'),
    [task, setTask] = useState(''),
    [text, setText] = useState(''),
    [kind, setKind] = useState('다음 과제'),
    [busy, setBusy] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false),
    [work, setWork] = useState(emptyWorkLog()),
    [topic, setTopic] = useState('기타');
  const owner = state.members.find((m) => m.id === p.ownerId);
  async function addEntry(e: FormEvent) {
    e.preventDefault();
    const bodyText =
      text.trim() ||
      (tab === 'updates' ? Object.values(work).filter(Boolean).join('\n').slice(0, 4000) : '');
    if (!bodyText) return;
    setBusy(true);
    try {
      if (tab === 'ai') await mutate(`/projects/${p.id}/ai`, 'POST', { text });
      else
        await mutate(`/projects/${p.id}/entries`, 'POST', {
          text: bodyText,
          work: tab === 'updates' ? work : undefined,
          topic: tab === 'feedback' ? topic : undefined,
          type: tab === 'feedback' ? 'feedback' : tab === 'questions' ? 'questions' : 'updates',
          kind,
        });
      setText('');
      setWork(emptyWorkLog());
    } catch {
    } finally {
      setBusy(false);
    }
  }
  async function addTask(e: FormEvent) {
    e.preventDefault();
    if (!task.trim()) return;
    try {
      await mutate(`/projects/${p.id}/tasks`, 'POST', { text: task.trim() });
      setTask('');
    } catch {}
  }
  const entries = tab === 'feedback' ? p.feedback : tab === 'questions' ? p.questions : p.updates;
  return (
    <Modal title={p.title} subtitle={p.purpose} onClose={onClose} wide>
      <div className="detail-meta">
        <Status status={p.status} />
        {owner && (
          <span className="owner">
            <Avatar appearance={owner.appearance} size={34} />
            {owner.name}
          </span>
        )}
        <span className="visibility">
          {p.isPublic ? (
            <>
              <Globe size={13} />
              소개 공개
            </>
          ) : (
            <>
              <Lock size={13} />
              비공개
            </>
          )}
        </span>
        {mine && (
          <button className="button small secondary" onClick={onEdit}>
            <Pencil size={13} />
            수정
          </button>
        )}
      </div>
      {privateView && (
        <div className="detail-tabs">
          {[
            ['overview', '프로젝트', ClipboardList],
            ['planning', '기술·로드맵', ClipboardList],
            ['submissions', '최종 제출', CheckCircle2],
            ['prompt', 'Codex 지시문', Sparkles],
            ['updates', '개발 기록', BookOpen],
            ['questions', '질문', MessageCircle],
            ['feedback', 'MASTER 피드백', CheckCircle2],
            ['ai', 'AI 조교', Sparkles],
          ].map(([key, label, Icon]) => {
            const I = Icon as typeof BookOpen;
            return (
              <button
                className={tab === key ? 'selected' : ''}
                key={key as string}
                onClick={() => {
                  setTab(key as string);
                  setText('');
                }}
              >
                <I size={15} />
                {label as string}
                {key === 'feedback' && p.feedback.length > 0 && <b>{p.feedback.length}</b>}
              </button>
            );
          })}
        </div>
      )}
      {tab === 'planning' ? (
        <LearningPlan
          p={p}
          state={state}
          mutate={mutate}
          onAskAI={() => {
            setTab('ai');
            setText(
              '이 프로젝트의 기술 구성을 분석하고 가장 단순한 추천 구성과 각 기술이 필요한 이유, 다음 작업을 알려주세요.',
            );
          }}
        />
      ) : tab === 'submissions' ? (
        <SubmissionPanel p={p} state={state} mutate={mutate} onToast={onToast} />
      ) : tab === 'prompt' ? (
        <PromptPanel p={p} onToast={onToast} />
      ) : tab === 'overview' ? (
        <div className="project-overview">
          {privateView && (
            <>
              <div className="detail-progress">
                <div className="between">
                  <h3>한 걸음씩 완성하기</h3>
                  <strong>
                    {progress(p)}
                    <small>%</small>
                  </strong>
                </div>
                <Progress value={progress(p)} />
                <p className="muted">
                  완료한 할 일을 기준으로 진행률을 계산해요. {p.tasks.filter((t) => t.done).length}/
                  {p.tasks.length} 완료
                </p>
              </div>
              <div className="task-list">
                {p.tasks.map((t) => (
                  <div className="task-item" key={t.id}>
                    <CheckRow
                      done={t.done}
                      text={t.text}
                      disabled={!mine}
                      onChange={() =>
                        void mutate(`/projects/${p.id}/tasks/${t.id}`, 'PATCH', {
                          done: !t.done,
                        }).catch(() => {})
                      }
                    />
                    {mine && (
                      <button
                        className="icon-button"
                        aria-label={`${t.text} 삭제`}
                        onClick={() =>
                          void mutate(`/projects/${p.id}/tasks/${t.id}`, 'DELETE').catch(() => {})
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {mine && (
                <form className="inline-form" onSubmit={addTask}>
                  <input
                    value={task}
                    onChange={(e) => setTask(e.target.value)}
                    maxLength={300}
                    placeholder="작은 할 일 하나 추가하기"
                    aria-label="새 할 일"
                  />
                  <button className="button secondary" disabled={!task.trim()}>
                    <Plus size={16} />
                    추가
                  </button>
                </form>
              )}
            </>
          )}
          <div className="project-info-grid">
            {[
              ['해결하고 싶은 문제', p.problem],
              ['누가 사용할까요?', p.audience],
              ['주요 기능', p.features],
              ['기술 구성', p.technologies],
              ['AI 도구', p.aiTools],
              ['목표 완료일', p.targetDate],
              ['참고자료', p.references],
            ]
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div key={label}>
                  <h4>{label}</h4>
                  <p>{value}</p>
                </div>
              ))}
          </div>
          <div className="project-links">
            {p.githubUrl && (
              <External href={p.githubUrl}>
                <GitBranch size={15} />
                GitHub 저장소
              </External>
            )}
            {p.serviceUrl && (
              <External href={p.serviceUrl}>
                <Link size={15} />
                서비스 열기
              </External>
            )}
          </div>
          {mine && (
            <div className="project-management">
              <Field label="프로젝트 단계">
                <select
                  aria-label="프로젝트 단계"
                  value={p.status}
                  onChange={(e) =>
                    void mutate(`/projects/${p.id}`, 'PATCH', {
                      status: e.target.value as ProjectStatus,
                    }).catch(() => {})
                  }
                >
                  {Object.entries(statusLabels).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                className="button primary"
                disabled={p.status === 'REVIEW' || p.approved}
                onClick={() =>
                  void mutate(`/projects/${p.id}`, 'PATCH', { status: 'REVIEW' })
                    .then(() => onToast('MASTER에게 검토를 요청했어요.'))
                    .catch(() => {})
                }
              >
                <CheckCircle2 size={16} />
                검토 요청하기
              </button>
            </div>
          )}
          {master && p.status === 'REVIEW' && (
            <button
              className="button primary"
              onClick={() =>
                void mutate(`/projects/${p.id}/approve`, 'POST')
                  .then(() => onToast('프로젝트를 승인했어요!'))
                  .catch(() => {})
              }
            >
              <CheckCircle2 size={17} />
              검토 승인 및 완료 처리
            </button>
          )}
          {mine && (
            <div className="danger-zone">
              {confirmDelete ? (
                <>
                  <span>프로젝트와 모든 기록을 삭제할까요?</span>
                  <button
                    className="button danger small"
                    onClick={() =>
                      void mutate(`/projects/${p.id}`, 'DELETE')
                        .then(onDeleted)
                        .catch(() => {})
                    }
                  >
                    삭제 확인
                  </button>
                  <button
                    className="button small secondary"
                    onClick={() => setConfirmDelete(false)}
                  >
                    취소
                  </button>
                </>
              ) : (
                <button className="text-button danger-text" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={13} />
                  프로젝트 삭제
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="entry-panel">
          {tab === 'ai' ? (
            <>
              <div className="info-banner">
                <Sparkles size={18} />
                <div>
                  <strong>AI의 조언은 참고로 활용해요</strong>
                  <p>
                    {state.aiConfigured
                      ? '코드를 직접 확인하는 조교가 아니에요. 중요한 결정은 MASTER와 함께해요.'
                      : '아직 AI가 연결되지 않았어요. 서버에 OpenAI API 설정이 필요해요.'}
                  </p>
                </div>
              </div>
              {p.aiMessages.map((m) => (
                <div key={m.id} className={`ai-message ${m.role}`}>
                  <strong>
                    {m.role === 'user' ? '나' : m.role === 'error' ? '연결 안내' : 'AI 조교'}
                  </strong>
                  <p>{m.text}</p>
                  <time>{date(m.createdAt)}</time>
                </div>
              ))}
              {!p.aiMessages.length && (
                <Empty
                  icon={<Sparkles />}
                  title="프로젝트에 대해 함께 생각해 봐요"
                  description="필요한 기능 정리, 개발 순서, 오류 해결 방법을 물어볼 수 있어요."
                />
              )}
            </>
          ) : (
            <>
              {!entries.length && (
                <Empty
                  icon={tab === 'feedback' ? <CheckCircle2 /> : <MessageCircle />}
                  title={
                    tab === 'feedback'
                      ? '아직 피드백이 없어요'
                      : tab === 'questions'
                        ? '막힌 부분을 편하게 물어보세요'
                        : '오늘의 작은 진전을 기록해 보세요'
                  }
                  description={
                    tab === 'feedback'
                      ? 'MASTER가 남긴 조언과 다음 과제가 여기에 모여요.'
                      : '작성한 내용과 시간은 프로젝트에 함께 저장돼요.'
                  }
                />
              )}
              <div className="timeline">
                {entries
                  .slice()
                  .reverse()
                  .map((e) =>
                    tab === 'questions' ? (
                      <QuestionThread key={e.id} q={e} p={p} state={state} mutate={mutate} />
                    ) : (
                      <article className="timeline-entry" key={e.id}>
                        <div className="between">
                          <strong>
                            {e.name}
                            {e.kind && <span>{e.kind}</span>}
                          </strong>
                          <time>{date(e.createdAt)}</time>
                        </div>
                        <p>{e.text}</p>
                        {e.work && (
                          <div className="work-summary">
                            {Object.entries(e.work)
                              .filter(([, v]) => v)
                              .map(([key, value]) => (
                                <p key={key}>
                                  <strong>
                                    {
                                      {
                                        completed: '완료',
                                        inProgress: '진행 중',
                                        next: '다음 작업',
                                        blockers: '막힌 문제',
                                        references: '참고자료',
                                      }[key]
                                    }
                                    :{' '}
                                  </strong>
                                  {value}
                                </p>
                              ))}
                          </div>
                        )}
                        {tab === 'feedback' && (
                          <>
                            <span className="membership">{e.topic || '기타'}</span>
                            <Field label="피드백 반영 상태">
                              <select
                                value={e.feedbackStatus || 'OPEN'}
                                onChange={(event) =>
                                  void mutate(`/projects/${p.id}/feedback/${e.id}`, 'PATCH', {
                                    status: event.target.value,
                                  }).catch(() => {})
                                }
                              >
                                <option value="OPEN">새 조언</option>
                                <option value="ACKNOWLEDGED">확인했어요</option>
                                <option value="DONE">반영했어요</option>
                              </select>
                            </Field>
                          </>
                        )}
                      </article>
                    ),
                  )}
              </div>
            </>
          )}
          {((tab === 'feedback' && master) ||
            (tab !== 'feedback' && mine) ||
            (tab === 'ai' && master)) && (
            <form className="entry-form" onSubmit={addEntry}>
              {tab === 'updates' && (
                <div className="form-grid">
                  {(
                    [
                      ['completed', '오늘 완료한 작업'],
                      ['inProgress', '진행 중인 작업'],
                      ['next', '다음 작업'],
                      ['blockers', '해결하지 못한 문제'],
                      ['references', '스크린샷·참고자료 링크'],
                    ] as const
                  ).map(([key, label]) => (
                    <Field key={key} label={label}>
                      <textarea
                        value={work[key]}
                        rows={2}
                        maxLength={4000}
                        onChange={(e) => setWork((v) => ({ ...v, [key]: e.target.value }))}
                      />
                    </Field>
                  ))}
                </div>
              )}
              {tab === 'feedback' && (
                <Field label="기술 지도 주제">
                  <select value={topic} onChange={(e) => setTopic(e.target.value)}>
                    {technicalTopics.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </Field>
              )}
              {tab === 'feedback' && (
                <Field label="피드백 종류">
                  <select value={kind} onChange={(e) => setKind(e.target.value)}>
                    {['다음 과제', '기술 조언', '개선할 점', '참고자료', '추가 질문'].map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </Field>
              )}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  tab === 'ai'
                    ? '예: 이 프로젝트는 어떤 순서로 개발하면 좋을까요?'
                    : tab === 'feedback'
                      ? '학생에게 다음 한 걸음을 안내해 주세요.'
                      : tab === 'questions'
                        ? '무엇을 하다가, 어떤 부분에서 막혔나요?'
                        : '오늘 한 일, 발견한 오류, 다음 작업 계획…'
                }
                maxLength={tab === 'ai' ? 2000 : 4000}
                rows={3}
                aria-label={
                  tab === 'feedback' ? 'MASTER 피드백 내용' : tab === 'ai' ? 'AI 질문' : '기록 내용'
                }
              />
              <button
                className="button primary"
                disabled={
                  !(text.trim() || (tab === 'updates' && Object.values(work).some(Boolean))) ||
                  busy ||
                  (tab === 'ai' && !state.aiConfigured)
                }
              >
                {busy
                  ? '처리 중…'
                  : tab === 'ai'
                    ? 'AI에게 물어보기'
                    : tab === 'feedback'
                      ? '피드백 남기기'
                      : tab === 'questions'
                        ? '선생님 도움 요청'
                        : '기록 남기기'}
                <Send size={15} />
              </button>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
