import { useCallback, useEffect, useState } from 'react';
import type { AppState } from '../shared/types';
import type { Assignment, Homework, TeachingState } from '../shared/teaching';
import { homeworkLabel } from '../shared/teaching';
import { api } from './api';
import { Field } from './components';

const deadlineText = (v: string) => new Date(v).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
export function TeachingPage({
  state,
  onToast,
}: {
  state: AppState;
  onToast: (v: string) => void;
}) {
  const [data, setData] = useState<TeachingState>({ assignments: [], submissions: [] });
  const [error, setError] = useState('');
  const [title, setTitle] = useState(''),
    [instructions, setInstructions] = useState(''),
    [due, setDue] = useState('');
  const [recipient, setRecipient] = useState('ALL'),
    [busy, setBusy] = useState(false),
    [archived, setArchived] = useState(false);
  const teacher = state.me.role === 'MASTER';
  const students = state.members.filter((m) => m.role === 'STUDENT' && m.status === 'ACTIVE');
  const reload = useCallback(async () => {
    setData(await api<TeachingState>('/teaching'));
    setError('');
  }, []);
  useEffect(() => {
    let current = true;
    void api<TeachingState>('/teaching')
      .then((v) => {
        if (current) {
          setData(v);
          setError('');
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [state]);
  const act = async (path: string, method: string, body: unknown) => {
    try {
      await api(path, method, body);
      await reload();
      onToast('저장했어요.');
    } catch (e) {
      if ((e as { status?: number }).status === 409) await reload();
      onToast((e as Error).message);
      throw e;
    }
  };
  const assignments = data.assignments
    .filter((a) => a.archived === archived)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return (
    <section className="teaching-page">
      <div className="page-section-title">
        <div>
          <p className="eyebrow">TODAY'S CLASS</p>
          <h1>수업과 과제</h1>
          <p className="muted">
            마감과 제출 현황을 확인하고, 결과물과 배운 내용을 남겨요. 시간은 한국 기준으로 표시해요.
          </p>
        </div>
      </div>
      {error && (
        <div role="alert" className="panel">
          {error}
          <button
            className="button secondary"
            onClick={() => void reload().catch((e) => setError(e.message))}
          >
            다시 불러오기
          </button>
        </div>
      )}
      {teacher && (
        <details className="panel assignment-create">
          <summary>새 과제 배정하기</summary>
          <form
            className="project-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              void act('/assignments', 'POST', {
                title,
                instructions,
                dueAt: new Date(due + '+09:00').toISOString(),
                studentIds: recipient === 'ALL' ? students.map((s) => s.id) : [recipient],
              })
                .then(() => {
                  setTitle('');
                  setInstructions('');
                  setDue('');
                })
                .catch(() => {})
                .finally(() => setBusy(false));
            }}
          >
            <Field label="과제 제목">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={120}
              />
            </Field>
            <Field label="할 일과 제출 안내">
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                required
                maxLength={6000}
                rows={4}
              />
            </Field>
            <div className="teaching-grid">
              <Field label="마감일 · 한국 시간">
                <input
                  type="datetime-local"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  required
                />
              </Field>
              <Field label="과제 대상">
                <select value={recipient} onChange={(e) => setRecipient(e.target.value)}>
                  <option value="ALL">현재 재학생 전체 ({students.length}명)</option>
                  {students.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="muted">
              배정 당시의 재학생에게만 전달돼요. 늦은 제출도 받으며 지각으로 표시해요.
            </p>
            <button className="button primary" disabled={busy || !students.length}>
              {busy ? '배정 중…' : '과제 배정'}
            </button>
          </form>
        </details>
      )}
      <div className="form-actions">
        <button
          className={`button ${!archived ? 'primary' : 'secondary'}`}
          onClick={() => setArchived(false)}
        >
          진행 중 과제
        </button>
        <button
          className={`button ${archived ? 'primary' : 'secondary'}`}
          onClick={() => setArchived(true)}
        >
          보관한 과제
        </button>
      </div>
      {!assignments.length && (
        <div className="panel">
          <h2>아직 {archived ? '보관한' : '배정된'} 과제가 없어요</h2>
          <p className="muted">
            {teacher
              ? '학생이 입학하면 새 과제를 배정해 주세요.'
              : '선생님이 과제를 배정하면 여기서 확인하고 제출할 수 있어요.'}
          </p>
        </div>
      )}
      {assignments.map((a) => {
        const submissions = data.submissions.filter((s) => s.assignmentId === a.id);
        return (
          <article className="panel assignment-card" key={a.id}>
            <div className="page-section-title">
              <div>
                <h2>{a.title}</h2>
                <p className="muted">마감 {deadlineText(a.dueAt)}</p>
              </div>
              {teacher && (
                <button
                  className="button small secondary"
                  onClick={() =>
                    void act(`/assignments/${a.id}`, 'PATCH', { archived: !a.archived }).catch(
                      () => {},
                    )
                  }
                >
                  {a.archived ? '과제 다시 열기' : '과제 보관'}
                </button>
              )}
            </div>
            <p className="assignment-instructions">{a.instructions}</p>
            {teacher ? (
              <>
                <p className="assignment-summary">
                  대상 {a.studentIds.length}명 · 제출 {submissions.length}명 · 미제출{' '}
                  {a.studentIds.length - submissions.length}명 · 지각{' '}
                  {submissions.filter((s) => s.late).length}명 · 확인{' '}
                  {submissions.filter((s) => s.result === 'APPROVED').length}명
                </p>
                <details>
                  <summary>학생별 제출물과 피드백</summary>
                  {a.studentIds.map((studentId) => {
                    const s = submissions.find((v) => v.studentId === studentId);
                    return (
                      <div className="homework-row" key={studentId}>
                        <h3>
                          {state.members.find((m) => m.id === studentId)?.name || '이전 재학생'}{' '}
                          <span className="membership">{homeworkLabel(a, s)}</span>
                        </h3>
                        {s && (
                          <>
                            <p className="assignment-instructions">{s.text}</p>
                            {s.url && (
                              <a href={s.url} target="_blank" rel="noopener noreferrer">
                                결과물 열기 ↗
                              </a>
                            )}
                            <p className="muted">{deadlineText(s.submittedAt)}</p>
                            <ReviewForm key={studentId} submission={s} act={act} />
                          </>
                        )}
                      </div>
                    );
                  })}
                </details>
                {!a.archived && <ExtendDeadline assignment={a} act={act} />}
              </>
            ) : (
              <StudentSubmission
                assignment={a}
                submission={submissions.find((s) => s.studentId === state.me.id)}
                act={act}
              />
            )}
          </article>
        );
      })}
    </section>
  );
}
type Act = (path: string, method: string, body: unknown) => Promise<void>;
function ExtendDeadline({ assignment, act }: { assignment: Assignment; act: Act }) {
  const [due, setDue] = useState('');
  return (
    <details className="deadline-edit">
      <summary>마감일 연장</summary>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void act(`/assignments/${assignment.id}`, 'PATCH', {
            dueAt: new Date(due + '+09:00').toISOString(),
          })
            .then(() => setDue(''))
            .catch(() => {});
        }}
      >
        <Field label={`${assignment.title} 새 마감일`}>
          <input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            required
          />
        </Field>
        <button className="button secondary">마감일 저장</button>
      </form>
    </details>
  );
}
function StudentSubmission({
  assignment: a,
  submission: s,
  act,
}: {
  assignment: Assignment;
  submission?: Homework;
  act: Act;
}) {
  const [draft, setDraft] = useState({
    text: s?.text || '',
    url: s?.url || '',
    revision: s?.revision || 0,
  });
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!dirty) setDraft({ text: s?.text || '', url: s?.url || '', revision: s?.revision || 0 });
  }, [s, dirty]);
  return (
    <div className="student-submission">
      <p>
        <span className="membership">{homeworkLabel(a, s)}</span>
      </p>
      {s?.review && (
        <div className="homework-feedback">
          <strong>선생님 피드백</strong>
          <p className="assignment-instructions">{s.review}</p>
        </div>
      )}
      {!a.archived && (
        <form
          className="project-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            void act(`/assignments/${a.id}/submission`, 'PUT', draft)
              .then(() => setDirty(false))
              .catch(() => {})
              .finally(() => setBusy(false));
          }}
        >
          <Field label={`${a.title} 제출 내용`} hint="완료한 일, 배운 점, 막힌 부분을 적어 주세요.">
            <textarea
              rows={4}
              required
              maxLength={6000}
              value={draft.text}
              onChange={(e) => {
                setDirty(true);
                setDraft({ ...draft, text: e.target.value });
              }}
            />
          </Field>
          <Field label={`${a.title} 결과물 링크 (선택)`}>
            <input
              type="url"
              maxLength={1000}
              placeholder="https://…"
              value={draft.url}
              onChange={(e) => {
                setDirty(true);
                setDraft({ ...draft, url: e.target.value });
              }}
            />
          </Field>
          <button className="button primary" disabled={busy}>
            {busy ? '제출 중…' : s ? '수정해서 다시 제출' : '과제 제출'}
          </button>
          {dirty && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setDirty(false)}
            >
              입력 취소 · 최신 제출 내용 보기
            </button>
          )}
        </form>
      )}
    </div>
  );
}
function ReviewForm({ submission: s, act }: { submission: Homework; act: Act }) {
  const [draft, setDraft] = useState({
    review: s.review,
    result: s.result === 'CHANGES' ? 'CHANGES' : 'APPROVED',
    revision: s.revision,
  });
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!dirty)
      setDraft({
        review: s.review,
        result: s.result === 'CHANGES' ? 'CHANGES' : 'APPROVED',
        revision: s.revision,
      });
  }, [s, dirty]);
  return (
    <form
      className="project-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        void act(`/homework/${encodeURIComponent(s.id)}/review`, 'PATCH', draft)
          .then(() => setDirty(false))
          .catch(() => {})
          .finally(() => setBusy(false));
      }}
    >
      <Field label="과제 피드백">
        <textarea
          required
          maxLength={4000}
          value={draft.review}
          onChange={(e) => {
            setDirty(true);
            setDraft({ ...draft, review: e.target.value });
          }}
        />
      </Field>
      <Field label="과제 확인 결과">
        <select
          value={draft.result}
          onChange={(e) => {
            setDirty(true);
            setDraft({ ...draft, result: e.target.value });
          }}
        >
          <option value="APPROVED">확인 완료</option>
          <option value="CHANGES">보완 요청</option>
        </select>
      </Field>
      <button className="button secondary" disabled={busy}>
        과제 피드백 저장
      </button>
      {dirty && (
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => setDirty(false)}
        >
          입력 취소 · 최신 피드백 보기
        </button>
      )}
    </form>
  );
}
