import { useEffect, useState, useRef, type FormEvent } from 'react';
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Save,
  Copy,
  Upload,
  Download,
  CheckCircle2,
  Send,
} from 'lucide-react';
import type { Project, AppState, Entry } from '../shared/types';
import {
  defaultAnalysis,
  technicalFields,
  questionLabels,
  codexTemplate,
  recommendedMaterials,
  type QuestionStatus,
  type RoadmapStep,
} from '../shared/learning';
import { Field, Empty, date, External, Status } from './components';
import type { Mutate } from './Projects';
export function LearningPlan({
  p,
  state,
  mutate,
  onAskAI,
}: {
  p: Project;
  state: AppState;
  mutate: Mutate;
  onAskAI?: () => void;
}) {
  const mine = p.ownerId === state.me.id;
  const [analysis, setAnalysis] = useState(p.analysis || defaultAnalysis()),
    [steps, setSteps] = useState<RoadmapStep[]>(p.roadmap || []),
    [choice, setChoice] = useState('AUTO'),
    [saving, setSaving] = useState(false);
  const roadmapDirty = useRef(false),
    revision = useRef(0);
  const analysisDirty = useRef(false);
  const analysisRevision = useRef(p.revision || 0),
    roadmapRevision = useRef(p.revision || 0);
  const [saveError, setSaveError] = useState('');
  const editAnalysis = (value: Parameters<typeof setAnalysis>[0]) => {
    analysisDirty.current = true;
    setAnalysis(value);
  };
  const editSteps = (value: RoadmapStep[] | ((old: RoadmapStep[]) => RoadmapStep[])) => {
    roadmapDirty.current = true;
    revision.current++;
    setSteps(value);
  };
  async function update(
    path: string,
    method: string,
    body: unknown,
    apply?: (result: Project) => void,
  ) {
    setSaving(true);
    try {
      const base = path.endsWith('/learning')
        ? analysisRevision.current
        : path.endsWith('/roadmap')
          ? roadmapRevision.current
          : undefined;
      const result = (await mutate(path, method, body, base)) as Project;
      setSaveError('');
      if (path.endsWith('/learning')) {
        analysisDirty.current = false;
        analysisRevision.current = result.revision || 0;
      }
      if (path.endsWith('/roadmap')) roadmapRevision.current = result.revision || 0;
      apply?.(result);
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const analysisKey = JSON.stringify(p.analysis),
    roadmapKey = JSON.stringify(p.roadmap);
  useEffect(() => {
    if (!analysisDirty.current) {
      setAnalysis(p.analysis || defaultAnalysis());
      analysisRevision.current = p.revision || 0;
    }
  }, [analysisKey, p.revision]);
  useEffect(() => {
    if (!roadmapDirty.current) {
      setSteps(p.roadmap || []);
      roadmapRevision.current = p.revision || 0;
    }
  }, [roadmapKey, p.revision]);
  const edit = (index: number, value: Partial<RoadmapStep>) =>
    editSteps((s) => s.map((step, i) => (i === index ? { ...step, ...value } : step)));
  const reorder = (index: number, offset: number) =>
    editSteps((s) => {
      const copy = [...s];
      [copy[index], copy[index + offset]] = [copy[index + offset], copy[index]];
      return copy;
    });
  const recommendations = recommendedMaterials(p, state.materials);
  return (
    <div className="learning-plan">
      {saveError && (
        <div className="form-message error" role="alert">
          <strong>입력한 초안을 보관했어요</strong>
          <p>{saveError}</p>
          <button
            className="button secondary"
            onClick={() => {
              if (window.confirm('입력한 기술 구성과 로드맵을 버리고 최신 내용을 불러올까요?')) {
                analysisDirty.current = false;
                roadmapDirty.current = false;
                setAnalysis(p.analysis || defaultAnalysis());
                setSteps(p.roadmap || []);
                analysisRevision.current = p.revision || 0;
                roadmapRevision.current = p.revision || 0;
                setSaveError('');
              }
            }}
          >
            최신 내용 불러오기
          </button>
        </div>
      )}
      <fieldset disabled={saving} className="learning-fieldset">
        <div className="section-heading">
          <h3>이 프로젝트에 필요한 기술</h3>
          <p className="muted">
            아직 모르는 항목은 ‘아직 모름’으로 두세요. 아래 내용은 직접 정리하는 기술 구성입니다.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void update(`/projects/${p.id}/learning`, 'PATCH', { analysis }, (result) =>
              setAnalysis(result.analysis || defaultAnalysis()),
            );
          }}
        >
          <div className="form-grid">
            <Field label="만드는 서비스 형태">
              <select
                value={analysis.productType}
                disabled={!mine}
                onChange={(e) =>
                  editAnalysis((a) => ({
                    ...a,
                    productType: e.target.value as typeof a.productType,
                  }))
                }
              >
                <option value="">아직 모름</option>
                <option value="WEB">웹서비스</option>
                <option value="DESKTOP">데스크톱 앱</option>
                <option value="AUTOMATION">자동화 프로그램</option>
              </select>
            </Field>
            <Field label="예상 개발 난이도">
              <select
                value={analysis.difficulty}
                disabled={!mine}
                onChange={(e) =>
                  editAnalysis((a) => ({ ...a, difficulty: e.target.value as typeof a.difficulty }))
                }
              >
                <option value="">아직 모름</option>
                <option value="BEGINNER">입문 · 작은 기능부터</option>
                <option value="INTERMEDIATE">보통 · 여러 기능 연결</option>
                <option value="ADVANCED">도전 · 복잡한 연동</option>
              </select>
            </Field>
            {technicalFields.map(([key, label]) => (
              <Field label={`${label} 필요 여부`} key={key}>
                <select
                  value={analysis[key] === null ? '' : String(analysis[key])}
                  disabled={!mine}
                  onChange={(e) =>
                    editAnalysis((a) => ({
                      ...a,
                      [key]: e.target.value === '' ? null : e.target.value === 'true',
                    }))
                  }
                >
                  <option value="">아직 모름</option>
                  <option value="true">필요해요</option>
                  <option value="false">지금은 필요 없어요</option>
                </select>
              </Field>
            ))}
          </div>
          <p className="muted">
            현재 경험: {p.experience} · 사용 기술: {p.technologies || '아직 정하지 않았어요'}
          </p>
          {mine && (
            <button className="button primary" type="submit">
              <Save size={15} />
              기술 구성 저장
            </button>
          )}
        </form>
        <div className="info-banner">
          <div>
            <strong>
              {state.aiConfigured
                ? 'AI 조교에게 기술 구성의 이유를 물어보세요'
                : 'AI 미연결 · 직접 정리와 템플릿을 이용해요'}
            </strong>
            <p>AI는 참고 조언을 제공합니다. 필요한 기술과 그 이유는 MASTER와 함께 확인해요.</p>
            {state.aiConfigured && (
              <button className="text-button" onClick={onAskAI}>
                AI에게 기술 구성 상담하기 ↗
              </button>
            )}
          </div>
        </div>
        <div className="section-heading">
          <h3>나만의 개발 로드맵</h3>
          <p className="muted">
            학생과 MASTER가 단계를 함께 편집할 수 있어요. AI 미연결 상태의 예시는 규칙 기반
            템플릿입니다.
          </p>
        </div>
        {!steps.length && mine && (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              void update(`/projects/${p.id}/roadmap/template`, 'POST', { choice }, (result) => {
                setSteps(result.roadmap || []);
                roadmapDirty.current = false;
              });
            }}
          >
            <select
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              aria-label="로드맵 예시 종류"
            >
              {[
                ['AUTO', '저장한 기술 구성에 맞는 예시'],
                ['WEB', '단순 웹서비스'],
                ['DATA', '데이터 관리 서비스'],
                ['API', '외부 API 자동화'],
                ['AI', 'AI 챗봇'],
                ['DESKTOP', '데스크톱 앱'],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <button className="button secondary">템플릿 불러오기</button>
          </form>
        )}
        <div className="roadmap-list">
          {steps.map((step, i) => (
            <article key={step.id} className="roadmap-step">
              <div className="roadmap-number">{String(i + 1).padStart(2, '0')}</div>
              <div className="roadmap-content">
                <div className="inline-form">
                  <input
                    type="checkbox"
                    aria-label={`${step.text} 단계 완료`}
                    checked={step.done}
                    onChange={(e) => edit(i, { done: e.target.checked })}
                  />
                  <input
                    value={step.text}
                    aria-label={`로드맵 ${i + 1} 단계 이름`}
                    maxLength={200}
                    onChange={(e) => edit(i, { text: e.target.value })}
                  />
                </div>
                <textarea
                  value={step.description}
                  aria-label={`로드맵 ${i + 1} 설명`}
                  rows={2}
                  maxLength={2000}
                  onChange={(e) => edit(i, { description: e.target.value })}
                />
                <div className="roadmap-actions">
                  <button
                    className="icon-button"
                    aria-label={`${i + 1} 단계 위로`}
                    disabled={!i}
                    onClick={() => reorder(i, -1)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`${i + 1} 단계 아래로`}
                    disabled={i === steps.length - 1}
                    onClick={() => reorder(i, 1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`${i + 1} 단계 삭제`}
                    onClick={() => editSteps((s) => s.filter((v) => v.id !== step.id))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
        <div className="between learning-actions">
          <button
            className="button secondary"
            disabled={steps.length >= 60}
            onClick={() =>
              editSteps((s) => [
                ...s,
                { id: crypto.randomUUID(), text: '새 개발 단계', description: '', done: false },
              ])
            }
          >
            <Plus size={15} />
            단계 추가
          </button>
          <button
            className="button primary"
            onClick={() => {
              const version = revision.current;
              void update(`/projects/${p.id}/roadmap`, 'PUT', { steps }, (result) => {
                if (revision.current === version) {
                  setSteps(result.roadmap || []);
                  roadmapDirty.current = false;
                }
              });
            }}
          >
            <Save size={15} />
            로드맵 저장
          </button>
        </div>
        <p className="muted">진행률은 일반 할 일과 로드맵 단계의 완료 여부를 함께 계산해요.</p>
        {recommendations.length > 0 && (
          <section className="recommended-materials">
            <h3>지금 도움이 될 교안</h3>
            {recommendations.map((m) => (
              <a key={m.id} href={`/api/materials/${m.id}/download`} className="profile-project">
                <Download size={16} />
                <span>
                  <strong>{m.title}</strong>
                  <small>{m.description}</small>
                </span>
              </a>
            ))}
          </section>
        )}
      </fieldset>
    </div>
  );
}
export function QuestionThread({
  q,
  p,
  state,
  mutate,
}: {
  q: Entry;
  p: Project;
  state: AppState;
  mutate: Mutate;
}) {
  const [answer, setAnswer] = useState(''),
    [busy, setBusy] = useState(false);
  const master = state.me.role === 'MASTER';
  async function reply(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await mutate(`/projects/${p.id}/questions/${q.id}`, 'PATCH', { answer });
      setAnswer('');
    } catch {
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="question-thread">
      <div className="between">
        <strong>{q.name}</strong>
        <span className={`question-status question-${q.status || 'NEW'}`}>
          {questionLabels[q.status || 'NEW']}
        </span>
      </div>
      <p>{q.text}</p>
      <time>{date(q.createdAt)}</time>
      {(q.answers || []).map((a) => (
        <div className="question-answer" key={a.id}>
          <strong>♛ {a.name}</strong>
          <p>{a.text}</p>
          <time>{date(a.createdAt)}</time>
        </div>
      ))}
      {master ? (
        <>
          <Field label="질문 처리 상태">
            <select
              value={q.status || 'NEW'}
              onChange={(e) =>
                void mutate(`/projects/${p.id}/questions/${q.id}`, 'PATCH', {
                  status: e.target.value as QuestionStatus,
                }).catch(() => {})
              }
            >
              {Object.entries(questionLabels).map(([v, l]) => (
                <option value={v} key={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <form className="inline-form" onSubmit={reply}>
            <textarea
              aria-label="질문 답변"
              rows={2}
              required
              maxLength={4000}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="이 학생에게 필요한 다음 한 걸음을 안내해 주세요."
            />
            <button className="button primary small" disabled={!answer.trim() || busy}>
              <Send size={14} />
              답변 등록
            </button>
          </form>
        </>
      ) : (
        q.status !== 'RESOLVED' && (
          <button
            className="text-button"
            onClick={() =>
              void mutate(`/projects/${p.id}/questions/${q.id}`, 'PATCH', {
                status: 'RESOLVED',
              }).catch(() => {})
            }
          >
            <CheckCircle2 size={14} />
            해결됐어요
          </button>
        )
      )}
    </article>
  );
}
export function PromptPanel({ p, onToast }: { p: Project; onToast: (s: string) => void }) {
  const [draft, setDraft] = useState(codexTemplate(p));
  return (
    <div className="prompt-panel">
      <div className="info-banner">
        <div>
          <strong>편집 가능한 템플릿 초안</strong>
          <p>
            프로젝트 정보를 조합한 규칙 기반 초안이에요. 실제 AI가 생성하거나 코드를 검토한 결과가
            아닙니다. 비밀키·개인정보가 없는지 직접 확인해 주세요.
          </p>
        </div>
      </div>
      <Field label="Codex 지시문 초안">
        <textarea
          rows={17}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={15000}
        />
      </Field>
      <div className="form-actions">
        <button className="button secondary" onClick={() => setDraft(codexTemplate(p))}>
          현재 정보로 다시 만들기
        </button>
        <button
          className="button primary"
          onClick={() =>
            void navigator.clipboard
              .writeText(draft)
              .then(() => onToast('Codex 지시문을 복사했어요.'))
              .catch(() =>
                onToast('복사를 지원하지 않는 브라우저예요. 초안을 직접 선택해 복사해 주세요.'),
              )
          }
        >
          <Copy size={15} />
          지시문 복사
        </button>
      </div>
    </div>
  );
}
export function SubmissionPanel({
  p,
  state,
  mutate,
  onToast,
}: {
  p: Project;
  state: AppState;
  mutate: Mutate;
  onToast: (s: string) => void;
}) {
  const mine = p.ownerId === state.me.id;
  const [draft, setDraft] = useState({
      overview: p.purpose,
      serviceUrl: p.serviceUrl,
      githubUrl: p.githubUrl,
      features: p.features,
      aiTools: p.aiTools,
      lessons: '',
    }),
    [review, setReview] = useState(''),
    [decision, setDecision] = useState<'APPROVED' | 'CHANGES_REQUESTED'>('CHANGES_REQUESTED'),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>((p.attachments || []).map((a) => a.id));
  const [file, setFile] = useState<File>();
  const pending = p.submissions?.at(-1)?.status === 'PENDING';
  async function upload() {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      onToast('5MB 이하 파일을 선택해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const content = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const attached = (await mutate(`/projects/${p.id}/attachments`, 'POST', {
        fileName: file.name,
        content,
      })) as { id: string };
      setSelected((s) => [...s, attached.id]);
      setFile(undefined);
    } catch {
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="submission-panel">
      <div className="section-heading">
        <h3>완성의 순간을 남겨요</h3>
        <p className="muted">
          제출할 때의 설명과 링크를 보존해요. 수정 요청을 받으면 보완한 내용을 다시 제출할 수
          있어요.
        </p>
      </div>
      <div className="attachments">
        <h4>시연 이미지와 참고파일</h4>
        {(p.attachments || []).map((a) => (
          <div className="attachment-row" key={a.id}>
            {mine && (
              <input
                type="checkbox"
                aria-label={`${a.fileName} 제출에 포함`}
                checked={selected.includes(a.id)}
                onChange={(e) =>
                  setSelected((s) =>
                    e.target.checked ? [...s, a.id] : s.filter((v) => v !== a.id),
                  )
                }
              />
            )}
            <a href={`/api/projects/${p.id}/attachments/${a.id}`}>
              <Download size={14} />
              {a.fileName}
            </a>
            <small>{Math.ceil(a.size / 1024)}KB</small>
            {mine && (
              <button
                className="icon-button"
                aria-label={`${a.fileName} 삭제`}
                onClick={() =>
                  void mutate(`/projects/${p.id}/attachments/${a.id}`, 'DELETE')
                    .then(() => setSelected((s) => s.filter((v) => v !== a.id)))
                    .catch(() => {})
                }
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
        {mine && (
          <div className="inline-form">
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.md"
              aria-label="프로젝트 첨부파일"
              onChange={(e) => setFile(e.target.files?.[0])}
            />
            <button
              className="button secondary small"
              disabled={!file || busy}
              onClick={() => void upload()}
            >
              <Upload size={14} />
              첨부 저장
            </button>
          </div>
        )}
        <p className="muted">이미지·PDF·TXT·MD · 파일당 5MB · 프로젝트당 최대 10개</p>
      </div>
      {mine && !pending && (
        <form
          className="project-form"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            void mutate(`/projects/${p.id}/submissions`, 'POST', {
              ...draft,
              attachmentIds: selected,
            })
              .then(() => onToast('최종 검토를 요청했어요.'))
              .catch(() => {})
              .finally(() => setBusy(false));
          }}
        >
          {(
            [
              ['overview', '프로젝트 개요'],
              ['features', '구현한 기능'],
              ['lessons', '개발하며 배운 점'],
            ] as const
          ).map(([key, label]) => (
            <Field label={label} key={key}>
              <textarea
                rows={3}
                required={key === 'overview'}
                value={draft[key]}
                maxLength={4000}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              />
            </Field>
          ))}
          <div className="form-grid">
            {(
              [
                ['serviceUrl', '실제 서비스 URL'],
                ['githubUrl', '제출 GitHub URL'],
                ['aiTools', '제출에 사용한 AI 도구'],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  type={key === 'aiTools' ? 'text' : 'url'}
                  value={draft[key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
          <button className="button primary" disabled={busy}>
            <Send size={15} />
            최종 제출하기
          </button>
        </form>
      )}
      {pending && (
        <div className="info-banner">
          <strong>MASTER가 제출한 결과를 검토하고 있어요.</strong>
        </div>
      )}
      {(p.submissions || [])
        .slice()
        .reverse()
        .map((s, i) => (
          <article className="submission-record" key={s.id}>
            <div className="between">
              <h3>{(p.submissions?.length || 0) - i}차 제출</h3>
              <span className="membership">
                {s.status === 'PENDING'
                  ? '검토 대기'
                  : s.status === 'APPROVED'
                    ? '승인'
                    : '수정 요청'}
              </span>
            </div>
            <time>{date(s.createdAt)}</time>
            <h4>프로젝트 개요</h4>
            <p>{s.overview}</p>
            <h4>구현한 기능</h4>
            <p>{s.features || '기록 없음'}</p>
            <h4>배운 점</h4>
            <p>{s.lessons || '기록 없음'}</p>
            <p className="muted">사용 AI 도구: {s.aiTools || '기록 없음'}</p>
            <div className="project-links">
              <External href={s.serviceUrl}>서비스</External>
              <External href={s.githubUrl}>GitHub</External>
            </div>
            {s.attachmentIds.map((attachmentId) => {
              const a = p.attachments?.find((a) => a.id === attachmentId);
              return (
                a && (
                  <a
                    className="text-link"
                    key={a.id}
                    href={`/api/projects/${p.id}/attachments/${a.id}`}
                  >
                    {a.fileName}
                  </a>
                )
              );
            })}
            {s.review && (
              <div className="question-answer">
                <strong>{s.review.name}</strong>
                <p>{s.review.text}</p>
                <time>{date(s.review.createdAt)}</time>
              </div>
            )}
            {state.me.role === 'MASTER' && s.status === 'PENDING' && (
              <form
                className="entry-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void mutate(`/projects/${p.id}/submissions/${s.id}/review`, 'POST', {
                    decision,
                    text: review,
                  })
                    .then(() => setReview(''))
                    .catch(() => {});
                }}
              >
                <Field label="최종 검토 결과">
                  <select
                    value={decision}
                    onChange={(e) => setDecision(e.target.value as typeof decision)}
                  >
                    <option value="CHANGES_REQUESTED">수정 요청</option>
                    <option value="APPROVED">승인</option>
                  </select>
                </Field>
                <Field label="구체적인 검토 피드백">
                  <textarea
                    required
                    maxLength={4000}
                    rows={3}
                    value={review}
                    onChange={(e) => setReview(e.target.value)}
                  />
                </Field>
                <button className="button primary">검토 결과 저장</button>
              </form>
            )}
          </article>
        ))}
    </div>
  );
}
