import { SegmentedControl } from './ui';
import {
  MentoringSummary,
  MasterQuestions,
  StudentMentoring,
  matchesMentoringFilter,
  MentorPriority,
} from './Mentoring';
import { useState } from 'react';
import {
  Users,
  FolderKanban,
  Mail,
  Plus,
  Copy,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  AlertCircle,
  LayoutGrid,
  Save,
  Trash2,
  Send,
} from 'lucide-react';
import type { AppState, Membership, Desk } from '../shared/types';
import { membershipLabels, progress } from '../shared/types';
import { Avatar, Status, Progress, Field, date, Empty } from './components';
import type { Mutate } from './Projects';
import { nextDeskSlot } from '../shared/world';
import { RecoveryControls, BatchInvites } from './Account';
export function MasterPage({
  state,
  mutate,
  onProject,
  onToast,
}: {
  state: AppState;
  mutate: Mutate;
  onProject: (id: string, initialTab?: string) => void;
  onToast: (text: string) => void;
}) {
  const [tab, setTab] = useState('students'),
    [selected, setSelected] = useState(''),
    [status, setStatus] = useState<Membership>('ACTIVE'),
    [reason, setReason] = useState(''),
    [release, setRelease] = useState(false),
    [label, setLabel] = useState(''),
    [invite, setInvite] = useState<{ key: string; id: string } | null>(null),
    [notice, setNotice] = useState(''),
    [recipient, setRecipient] = useState('');
  const [busy, setBusy] = useState(false);
  const [projectFilter, setProjectFilter] = useState('ALL'),
    [mentoring, setMentoring] = useState('');
  const [studentFilter, setStudentFilter] = useState('ALL'),
    [studentQuery, setStudentQuery] = useState('');
  const students = state.members.filter((m) => m.role === 'STUDENT');
  const reviews = state.projects.filter((p) => p.status === 'REVIEW');
  const needing = students.filter((m) => m.help);
  async function issue() {
    setBusy(true);
    try {
      const result = (await mutate('/invitations', 'POST', { label })) as {
        key: string;
        id: string;
      };
      setInvite(result);
      setLabel('');
    } catch {
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      onToast('클립보드에 복사했어요.');
    } catch {
      onToast('복사가 지원되지 않아요. 표시된 KEY를 직접 복사해 주세요.');
    }
  }
  return (
    <section className="master-page">
      <div className="page-section-title">
        <div>
          <p className="eyebrow">TEACHER'S ROOM</p>
          <h1>함께 자라는 교무실</h1>
          <p className="muted">학생마다 다른 아이디어, 각자의 속도에 맞는 다음 한 걸음.</p>
        </div>
        <span className="master-badge">♛ MASTER</span>
      </div>
      <MentoringSummary
        state={state}
        onFilter={(key) => {
          if (key.startsWith('MEMBER_')) {
            setTab('students');
            setStudentFilter(key === 'MEMBER_LEAVE' ? 'ON_LEAVE' : 'ACTIVE');
          } else if (key === 'QUESTIONS') setTab('questions');
          else {
            setTab('projects');
            setProjectFilter(key);
          }
        }}
      />
      <MentorPriority state={state} onProject={onProject} />
      <SegmentedControl
        label="교무실 메뉴"
        value={tab}
        onChange={(value) => {
          setTab(value);
          setProjectFilter('ALL');
        }}
        options={[
          ['students', '학생과 학적', Users],
          ['projects', '프로젝트 지도', FolderKanban],
          ['questions', '질문과 상담', Mail],
          ['invites', '입학 초대', Mail],
          ['classroom', '책상 배치', LayoutGrid],
          ['notices', '공지 보내기', Send],
        ].map(([key, text, Icon]) => {
          const I = Icon as typeof Users;
          return {
            value: key as string,
            label: (
              <>
                <I size={15} />
                {text as string}
              </>
            ),
          };
        })}
      />
      {tab === 'students' && (
        <>
          <RecoveryControls state={state} onToast={onToast} />
          <div className="student-controls">
            <Field label="학생 이름 검색">
              <input
                type="search"
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
                placeholder="학생 이름으로 찾기"
              />
            </Field>
            <Field label="학생 학적 필터">
              <select value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)}>
                <option value="ALL">모든 학생</option>
                {(['ACTIVE', 'ON_LEAVE', 'GRADUATED', 'REVOKED'] as Membership[]).map((v) => (
                  <option key={v} value={v}>
                    {membershipLabels[v]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="student-list">
            {students
              .filter(
                (m) =>
                  (studentFilter === 'ALL' || m.status === studentFilter) &&
                  m.name.includes(studentQuery.trim()),
              )
              .sort((a, b) => Number(b.help) - Number(a.help) || a.name.localeCompare(b.name, 'ko'))
              .map((m) => (
                <article className="student-row" key={m.id}>
                  <Avatar appearance={m.appearance} size={58} />
                  <div>
                    <strong>{m.name}</strong>
                    <p className="muted">
                      프로젝트 {state.projects.filter((p) => p.ownerId === m.id).length}개 ·{' '}
                      {m.deskId ? '책상 배정됨' : '책상 미배정'}
                    </p>
                  </div>
                  <button className="button small secondary" onClick={() => setMentoring(m.id)}>
                    학생 상담
                    <ArrowUpRight size={13} />
                  </button>
                  <span className={`membership membership-${m.status}`}>
                    {membershipLabels[m.status]}
                  </span>
                  {m.help && <span className="help-tag">도움 요청</span>}
                  <button
                    className="button small secondary"
                    onClick={() => {
                      setSelected(m.id);
                      setStatus(m.status);
                      setReason('');
                    }}
                  >
                    학적 관리
                    <ArrowUpRight size={13} />
                  </button>
                  {selected === m.id && (
                    <form
                      className="member-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void mutate(`/members/${m.id}`, 'PATCH', {
                          status,
                          reason,
                          releaseDesk: release,
                        })
                          .then(() => {
                            setSelected('');
                            onToast('학적과 변경 이력을 저장했어요.');
                          })
                          .catch(() => {});
                      }}
                    >
                      <Field label="학적 상태">
                        <select
                          value={status}
                          onChange={(e) => setStatus(e.target.value as Membership)}
                        >
                          {(['ACTIVE', 'ON_LEAVE', 'GRADUATED', 'REVOKED'] as Membership[]).map(
                            (v) => (
                              <option key={v} value={v}>
                                {membershipLabels[v]}
                              </option>
                            ),
                          )}
                        </select>
                      </Field>
                      <Field label="변경 사유 *">
                        <input
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          required
                          maxLength={300}
                          placeholder="학적 변경 이유를 남겨 주세요."
                        />
                      </Field>
                      {status === 'ON_LEAVE' && (
                        <label className="inline-check">
                          <input
                            type="checkbox"
                            checked={release}
                            onChange={(e) => setRelease(e.target.checked)}
                          />
                          휴학 중 책상 회수
                        </label>
                      )}
                      <div className="form-actions">
                        <button
                          className="button small secondary"
                          type="button"
                          onClick={() => setSelected('')}
                        >
                          취소
                        </button>
                        <button className="button small primary">학적 변경 저장</button>
                      </div>
                    </form>
                  )}
                </article>
              ))}
            {!students.some(
              (m) =>
                (studentFilter === 'ALL' || m.status === studentFilter) &&
                m.name.includes(studentQuery.trim()),
            ) && (
              <Empty
                icon={<Users />}
                title="조건에 맞는 학생이 없어요"
                description="다른 이름이나 학적을 선택해 보세요."
              />
            )}
          </div>
          <h3 className="section-heading">최근 학적 변경 이력</h3>
          {!state.history.length ? (
            <p className="muted">아직 변경된 학적이 없어요.</p>
          ) : (
            state.history
              .slice()
              .reverse()
              .map((h) => (
                <div className="history-row" key={h.id}>
                  <span>{state.members.find((m) => m.id === h.memberId)?.name}</span>
                  <strong>
                    {membershipLabels[h.from as Membership]} →{' '}
                    {membershipLabels[h.to as Membership]}
                  </strong>
                  <p>{h.reason}</p>
                  <small>
                    {h.actor} · {date(h.createdAt)}
                  </small>
                </div>
              ))
          )}
        </>
      )}
      {tab === 'projects' && (
        <div className="mentoring-list">
          {state.projects
            .filter((p) => matchesMentoringFilter(p, projectFilter))
            .map((p) => {
              const m = state.members.find((m) => m.id === p.ownerId);
              return (
                <article key={p.id}>
                  <div className="between">
                    <div className="mentor-project-owner">
                      {m && <Avatar appearance={m.appearance} size={38} />}
                      <span>{m?.name}</span>
                      <Status status={p.status} />
                    </div>
                    <button className="text-button" onClick={() => onProject(p.id)}>
                      프로젝트 지도
                      <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <h3>{p.title}</h3>
                  <p>{p.purpose}</p>
                  <Progress value={progress(p)} />
                  {p.questions.length > 0 && (
                    <div className="question-preview">
                      <MessageIcon />
                      최근 질문: {p.questions.at(-1)?.text}
                    </div>
                  )}
                  <div className="muted">
                    마지막 활동 {date(p.updatedAt)} · 진행 기록 {p.updates.length}개 · 피드백{' '}
                    {p.feedback.length}개
                  </div>
                </article>
              );
            })}
        </div>
      )}
      {tab === 'questions' && (
        <MasterQuestions state={state} mutate={mutate} onProject={onProject} />
      )}
      {mentoring && state.members.find((m) => m.id === mentoring) && (
        <StudentMentoring
          student={state.members.find((m) => m.id === mentoring)!}
          state={state}
          mutate={mutate}
          onProject={onProject}
          onClose={() => setMentoring('')}
        />
      )}
      {tab === 'invites' && (
        <div>
          <BatchInvites onToast={onToast} />
          <div className="invite-layout">
            <div className="panel">
              <h3>새로운 메이커를 초대해요</h3>
              <p className="muted">초대 KEY는 한 번만 사용할 수 있고, 7일 동안 유효해요.</p>
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void issue();
                }}
              >
                <input
                  aria-label="초대 이름"
                  placeholder="예: 현장 2팀 신규 교육생"
                  required
                  maxLength={60}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
                <button className="button primary" disabled={busy}>
                  <Plus size={16} />
                  초대 발급
                </button>
              </form>
              {invite && (
                <div className="invite-result">
                  <strong>초대 KEY를 지금 복사해 주세요</strong>
                  <p>보안을 위해 KEY 원문은 다시 표시되지 않아요.</p>
                  <code>{invite.key}</code>
                  <div className="form-actions">
                    <button
                      className="button small secondary"
                      onClick={() => void copy(invite.key)}
                    >
                      <Copy size={13} />
                      KEY 복사
                    </button>
                    <button
                      className="button small primary"
                      onClick={() =>
                        void copy(`${location.origin}/?invite=${encodeURIComponent(invite.key)}`)
                      }
                    >
                      <Copy size={13} />
                      입학 링크 복사
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="panel">
              <h3>발급 내역</h3>
              {!state.invitations.length && <p className="muted">발급한 초대장이 없어요.</p>}
              {state.invitations
                .slice()
                .reverse()
                .map((i) => (
                  <div className="invite-row" key={i.id}>
                    <div>
                      <strong>{i.label}</strong>
                      <p>{date(i.expiresAt)}까지 유효</p>
                    </div>
                    <span className="membership">
                      {i.revoked
                        ? '취소됨'
                        : i.usedAt
                          ? '사용 완료'
                          : Date.parse(i.expiresAt) < Date.now()
                            ? '만료됨'
                            : '입학 대기'}
                    </span>
                    {!i.usedAt && !i.revoked && (
                      <button
                        className="text-button danger-text"
                        onClick={() =>
                          void mutate(`/invitations/${i.id}`, 'DELETE').catch(() => {})
                        }
                      >
                        초대 취소
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
      {tab === 'classroom' && (
        <>
          <div className="info-banner">
            <LayoutGrid size={20} />
            <div>
              <strong>통로를 지키는 책상 배치</strong>
              <p>
                학생이 있는 책상은 먼저 자리를 옮긴 후 제거할 수 있어요. 배정 변경 시 기존 자리와
                교환해요.
              </p>
            </div>
          </div>
          <div className="desk-editor-grid">
            {state.desks.map((d) => (
              <DeskEditor
                key={`${d.id}-${d.x}-${d.y}-${state.members.find((m) => m.deskId === d.id)?.id}`}
                desk={d}
                state={state}
                mutate={mutate}
              />
            ))}
          </div>
          <button
            className="button secondary"
            onClick={() => {
              const empty = nextDeskSlot(state.desks);
              if (!empty) {
                onToast('교실 확장 가능한 영역이 모두 사용 중이에요.');
                return;
              }
              void mutate('/desks', 'POST', { x: empty.x, y: empty.y }).catch(() => {});
            }}
          >
            <Plus size={16} />빈 책상 추가
          </button>
        </>
      )}
      {tab === 'notices' && (
        <div className="panel">
          <h3>오늘의 메시지</h3>
          <p className="muted">공지는 교실 채팅과 구분해서 표시돼요.</p>
          <form
            className="entry-form"
            onSubmit={(e) => {
              e.preventDefault();
              void mutate('/messages', 'POST', {
                text: notice,
                type: 'NOTICE',
                recipientId: recipient || null,
              })
                .then(() => {
                  setNotice('');
                  onToast('공지를 보냈어요.');
                })
                .catch(() => {});
            }}
          >
            <Field label="받는 사람">
              <select value={recipient} onChange={(e) => setRecipient(e.target.value)}>
                <option value="">전체 학생</option>
                {students.map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <textarea
              value={notice}
              onChange={(e) => setNotice(e.target.value)}
              required
              maxLength={1000}
              placeholder="학생들에게 전하고 싶은 말을 적어 주세요."
              rows={4}
            />
            <button className="button primary">
              <Send size={16} />
              공지 보내기
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
function MessageIcon() {
  return <Mail size={15} />;
}
function DeskEditor({ desk, state, mutate }: { desk: Desk; state: AppState; mutate: Mutate }) {
  const owner = state.members.find((m) => m.deskId === desk.id);
  const [x, setX] = useState(desk.x),
    [y, setY] = useState(desk.y),
    [student, setStudent] = useState(owner?.id || '');
  return (
    <form
      className="desk-editor panel"
      onSubmit={(e) => {
        e.preventDefault();
        void mutate(`/desks/${desk.id}`, 'PATCH', { x, y, memberId: student || null }).catch(
          () => {},
        );
      }}
    >
      <div className="between">
        <h3>{owner ? `${owner.name}의 책상` : '빈 책상'}</h3>
        <button
          type="button"
          className="icon-button"
          aria-label="빈 책상 제거"
          disabled={!!owner}
          onClick={() => void mutate(`/desks/${desk.id}`, 'DELETE').catch(() => {})}
        >
          <Trash2 size={15} />
        </button>
      </div>
      <div className="form-grid">
        <Field label="가로 위치">
          <input
            aria-label="가로 위치"
            type="number"
            min={230}
            max={870}
            value={x}
            onChange={(e) => setX(Number(e.target.value))}
          />
        </Field>
        <Field label="세로 위치">
          <input
            aria-label="세로 위치"
            type="number"
            min={285}
            max={7350}
            value={y}
            onChange={(e) => setY(Number(e.target.value))}
          />
        </Field>
      </div>
      <Field label="학생 배정">
        <select value={student} onChange={(e) => setStudent(e.target.value)}>
          <option value="">빈 자리로</option>
          {state.members
            .filter((m) => m.role === 'STUDENT' && m.status === 'ACTIVE')
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
      </Field>
      <button className="button secondary small">
        <Save size={14} />
        배치 저장
      </button>
    </form>
  );
}
