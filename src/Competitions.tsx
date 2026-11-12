import { CompetitionHistory } from './CompetitionHistory';
import { CompetitionScoreReview } from './CompetitionScoreReview';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Archive,
  CheckCircle2,
  ExternalLink,
  FileCode2,
  Flag,
  Plus,
  RefreshCw,
  Settings2,
  Trophy,
  Users,
} from 'lucide-react';
import type { AppState } from '../shared/types';
import type {
  Competition,
  CompetitionDetailResponse,
  CompetitionEntry,
  CompetitionListResponse,
} from '../shared/competitions';
import { api } from './api';
import { Field, Modal } from './components';
import { Button, InlineNotice, SegmentedControl } from './ui';
import { CompetitionResults } from './PublicCompetition';
import {
  CompetitionSchedule,
  IntroductionPreview,
  PhaseBadge,
  ServiceLink,
  kst,
} from './competition-ui';
import { ClassManager, JudgePasses, DeadlineExtension } from './CompetitionAdministration';
import { CompetitionEditor } from './CompetitionEditor';
import { SubmissionEditor } from './CompetitionSubmission';
type Props = { state: AppState; onToast: (text: string) => void; onRefresh: () => Promise<void> };
const blankList: CompetitionListResponse = {
  classes: [],
  competitions: [],
  activeClassId: '',
  serverNow: '',
};
export function CompetitionsPage({ state, onToast, onRefresh }: Props) {
  const [list, setList] = useState<CompetitionListResponse>(blankList),
    [detail, setDetail] = useState<CompetitionDetailResponse | null>(null),
    [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [archive, setArchive] = useState<'current' | 'archived'>('current');
  const [editing, setEditing] = useState<Competition | 'new' | null>(null),
    [submissionOpen, setSubmissionOpen] = useState(false),
    [preview, setPreview] = useState<CompetitionEntry | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null),
    [actionReason, setActionReason] = useState(''),
    [actionBusy, setActionBusy] = useState(false);
  const request = useRef(0),
    mounted = useRef(true);
  const teacher = state.me.role === 'MASTER';
  const load = useCallback(async (id = '') => {
    const sequence = ++request.current;
    const [nextList, nextDetail] = await Promise.all([
      api<CompetitionListResponse>('/competitions'),
      id
        ? api<CompetitionDetailResponse>(`/competitions/${encodeURIComponent(id)}`)
        : Promise.resolve(null),
    ]);
    if (mounted.current && sequence === request.current) {
      setList(nextList);
      setDetail(nextDetail);
      setError('');
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current++;
    };
  }, []);
  useEffect(() => {
    setLoading(true);
    void load(selectedId).catch((e) => {
      if (mounted.current) {
        setError(e.message);
        setLoading(false);
      }
    });
  }, [selectedId, load, state]);
  useEffect(() => {
    const update = () => {
      if (!document.hidden) void load(selectedId).catch(() => {});
    };
    const timer = setInterval(update, 60000);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, [load, selectedId]);
  const refresh = async () => {
    await load(selectedId);
    await onRefresh();
  };
  const action = async () => {
    if (!detail || !pendingAction || actionBusy) return;
    setActionBusy(true);
    setError('');
    try {
      await api(`/competitions/${detail.competition.id}/action`, 'POST', {
        action: pendingAction,
        reason: actionReason,
      });
      await refresh();
      setPendingAction(null);
      setActionReason('');
      onToast('대회 운영 상태를 저장했어요.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionBusy(false);
    }
  };
  const competition = detail?.competition;
  const myEntry = detail?.myEntry;
  const extension = detail?.extensions?.find((item) => item.studentId === state.me.id);
  const editable =
    competition &&
    detail &&
    ['SUBMISSION_OPEN', 'SUBMISSION_CLOSED'].includes(competition.state) &&
    Date.parse(detail.serverNow) < Date.parse(extension?.dueAt || competition.submissionDueAt) &&
    Date.parse(detail.serverNow) < Date.parse(competition.judgingStartsAt);
  const visibleContests = list.competitions.filter((item) =>
    archive === 'archived' ? item.archived : !item.archived,
  );
  const actionLabels: Record<string, string> = {
    publish: '대회 공개하기',
    unpublish: '접수 취소하고 준비 상태로',
    archive: '대회 보관하기',
    publishResults: '결과 공개하기',
    retractResults: '결과 공개 철회',
  };
  return (
    <section className="competition-page">
      <div className="page-section-title">
        <div>
          <p className="eyebrow">CLASSROOM SHOWCASE</p>
          <h1>{competition ? competition.name : '우리 반 AI 경진대회'}</h1>
          <p className="muted">
            {teacher
              ? '학생의 첫 서비스를 함께 살펴보고, 다음 가능성을 발견해요.'
              : '내가 만든 AI 서비스를 소개하고 함께 성장해요.'}
          </p>
        </div>
        <div className="competition-actions">
          {selectedId && (
            <Button
              type="button"
              onClick={() => {
                setSelectedId('');
                setDetail(null);
              }}
            >
              <ArrowLeft size={16} />
              대회 목록
            </Button>
          )}
          {teacher && (
            <Button
              type="button"
              variant="primary"
              onClick={() => setEditing('new')}
              disabled={!list.classes.length}
            >
              <Plus size={16} />
              대회 만들기
            </Button>
          )}
        </div>
      </div>
      {error && (
        <InlineNotice title="경진대회를 확인하지 못했어요" kind="error">
          {error}
          <div className="competition-actions">
            <Button
              type="button"
              onClick={() => void load(selectedId).catch((e) => setError(e.message))}
            >
              <RefreshCw size={16} />
              다시 불러오기
            </Button>
          </div>
        </InlineNotice>
      )}
      {!selectedId ? (
        <>
          {teacher && <ClassManager classes={list.classes} state={state} onSaved={refresh} />}
          <div className="competition-toolbar">
            <SegmentedControl
              label="대회 목록"
              value={archive}
              onChange={setArchive}
              options={[
                { value: 'current', label: '진행 대회' },
                { value: 'archived', label: '보관한 대회' },
              ]}
            />
            {teacher && (
              <Field label="교실에서 볼 반">
                <select
                  value={list.activeClassId}
                  onChange={(e) =>
                    void api('/competition-classroom', 'PATCH', { classId: e.target.value })
                      .then(refresh)
                      .then(() => onToast('교실의 대회 안내를 변경했어요.'))
                      .catch((e) => setError(e.message))
                  }
                >
                  {list.classes.map((schoolClass) => (
                    <option value={schoolClass.id} key={schoolClass.id}>
                      {schoolClass.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          {loading ? (
            <div className="competition-empty" role="status">
              우리 반 경진대회를 불러오고 있어요…
            </div>
          ) : !visibleContests.length ? (
            <div className="competition-empty">
              <Trophy size={36} />
              <h2>
                {archive === 'archived'
                  ? '보관한 대회가 없어요'
                  : teacher
                    ? '우리 반의 첫 쇼케이스를 열어 보세요'
                    : '아직 참가할 경진대회가 없어요'}
              </h2>
              <p>
                {teacher
                  ? '반과 참가 학생을 확인하고, 대회를 준비 상태로 만든 뒤 공개해 주세요.'
                  : '선생님이 대회를 열면 일정과 출품 안내를 여기에서 확인할 수 있어요.'}
              </p>
              {teacher && archive === 'current' && (
                <Button
                  type="button"
                  onClick={() => setEditing('new')}
                  disabled={!list.classes.length}
                >
                  첫 대회 준비하기
                </Button>
              )}
            </div>
          ) : (
            <div className="competition-cards">
              {visibleContests.map((item) => (
                <article className="competition-card" key={item.id}>
                  <div className="competition-card-top">
                    <span className="competition-card-icon">
                      <Trophy size={22} />
                    </span>
                    <PhaseBadge state={item.state} />
                  </div>
                  <div className="competition-card-meta">
                    <Users size={15} />
                    {list.classes.find((c) => c.id === item.classId)?.name || '나의 반'}
                  </div>
                  <h2>{item.name}</h2>
                  <p>{item.description.slice(0, 150)}</p>
                  <p className="competition-note">제출 마감 · {kst(item.submissionDueAt)}</p>
                  <Button
                    type="button"
                    onClick={() => {
                      setSelectedId(item.id);
                      setDetail(null);
                    }}
                  >
                    대회 자세히 보기
                  </Button>
                </article>
              ))}
            </div>
          )}
        </>
      ) : !competition || !detail ? (
        <div className="competition-empty" role="status">
          대회 안내를 불러오고 있어요…
        </div>
      ) : (
        <>
          <div className="competition-layout">
            <div className="competition-main">
              <section className="panel">
                <div className="competition-heading">
                  <div>
                    <PhaseBadge state={competition.state} />
                    <p className="competition-description">{competition.description}</p>
                  </div>
                  {teacher && (
                    <Button
                      type="button"
                      disabled={[
                        'JUDGING',
                        'JUDGING_CLOSED',
                        'RESULTS_PUBLISHED',
                        'ARCHIVED',
                      ].includes(competition.state)}
                      title="심사 시작 후에는 출품작 보호를 위해 설정을 바꿀 수 없어요."
                      onClick={() => setEditing(competition)}
                    >
                      <Settings2 size={16} />
                      설정 수정
                    </Button>
                  )}
                </div>
                <div className="competition-actions">
                  <a
                    className="button secondary"
                    href={`/competition/${competition.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink size={16} />
                    외부 심사 페이지
                  </a>
                  {teacher && !competition.archived && (
                    <>
                      <Button
                        type="button"
                        onClick={() => {
                          setPendingAction(competition.published ? 'unpublish' : 'publish');
                          setActionReason('');
                        }}
                      >
                        <Flag size={16} />
                        {competition.published ? '접수 취소' : '대회 공개'}
                      </Button>
                      {competition.state === 'JUDGING_CLOSED' && !competition.resultsPublished && (
                        <Button
                          type="button"
                          variant="primary"
                          onClick={() => setPendingAction('publishResults')}
                        >
                          <Trophy size={16} />
                          결과 공개
                        </Button>
                      )}
                      {competition.resultsPublished && (
                        <Button type="button" onClick={() => setPendingAction('retractResults')}>
                          결과 공개 철회
                        </Button>
                      )}
                    </>
                  )}
                </div>
                <p className="competition-note">
                  작품 공개:{' '}
                  {competition.visibility === 'PUBLIC' ? '링크를 아는 방문자' : '초대된 KEY 심사자'}{' '}
                  · 작품별 최소 심사 {competition.minJudges}개 · 공식 KEY 심사 평균 집계
                </p>
              </section>
              {teacher ? (
                <>
                  <section className="panel">
                    <h2>출품과 심사 현황</h2>
                    <div className="competition-stats">
                      <div className="competition-stat">
                        <span>참가 대상</span>
                        <strong>
                          {competition.participantIds.length}
                          <small>명</small>
                        </strong>
                      </div>
                      <div className="competition-stat">
                        <span>제출 완료</span>
                        <strong>
                          {detail.entries.filter((entry) => entry.status === 'SUBMITTED').length}
                          <small>개</small>
                        </strong>
                      </div>
                      <div className="competition-stat">
                        <span>연결한 심사자</span>
                        <strong>
                          {detail.passes?.filter((pass) => pass.usedAt && !pass.revoked).length ||
                            0}
                          <small>명</small>
                        </strong>
                      </div>
                    </div>
                    <div className="competition-entry-list">
                      {competition.participantIds.map((studentId) => {
                        const member = state.members.find((m) => m.id === studentId);
                        const entry = detail.entries.find((entry) => entry.studentId === studentId);
                        const studentExtension = detail.extensions?.find(
                          (item) => item.studentId === studentId,
                        );
                        return (
                          <article className="competition-entry" key={studentId}>
                            <div>
                              <h3>{entry?.title || '아직 제출하지 않았어요'}</h3>
                              <p>
                                {member?.name || '참가 학생'} ·{' '}
                                {entry?.status === 'SUBMITTED'
                                  ? `제출 완료 · 버전 ${entry.revision}`
                                  : entry?.status === 'DRAFT'
                                    ? '임시 저장 중'
                                    : entry?.status === 'WITHDRAWN'
                                      ? '제출 철회'
                                      : '미제출'}
                                {entry?.submittedAt ? ` · ${kst(entry.submittedAt)}` : ''}
                              </p>
                              {studentExtension && <p>개별 연장 · {kst(studentExtension.dueAt)}</p>}
                            </div>
                            {entry && (
                              <div className="competition-actions">
                                <Button type="button" onClick={() => setPreview(entry)}>
                                  제출 내용 확인
                                </Button>
                                <CompetitionHistory competitionId={competition.id} entry={entry} />
                              </div>
                            )}
                          </article>
                        );
                      })}
                      {!competition.participantIds.length && (
                        <p className="competition-note">설정에서 참가 학생을 선택해 주세요.</p>
                      )}
                    </div>
                  </section>
                  <JudgePasses
                    key={competition.id}
                    competition={competition}
                    passes={detail.passes || []}
                    entries={detail.entries}
                    onSaved={refresh}
                  />
                  <section className="panel">
                    <div className="competition-heading">
                      <div>
                        <h2>
                          {competition.resultsPublished
                            ? '공개한 결과'
                            : '결과 미리보기 · MASTER 전용'}
                        </h2>
                        <p className="competition-note">
                          공식 KEY 심사의 항목별 평균을 합산해요. 동점은 실용성 → 활용성 → 완성도 →
                          창의성 순으로 비교하며 모두 같으면 공동 순위예요.
                        </p>
                      </div>
                      <Trophy size={22} />
                    </div>
                    {detail.results ? (
                      <CompetitionResults results={detail.results} />
                    ) : (
                      <p className="competition-note">
                        심사가 시작되면 결과 집계를 확인할 수 있어요.
                      </p>
                    )}
                  </section>
                  <CompetitionScoreReview competition={competition} onSaved={refresh} />
                  <DeadlineExtension
                    competitionId={competition.id}
                    state={{
                      ...state,
                      members: state.members.filter((member) =>
                        competition.participantIds.includes(member.id),
                      ),
                    }}
                    onSaved={refresh}
                  />
                </>
              ) : (
                <section className="panel">
                  <div className="competition-heading">
                    <div>
                      <p className="eyebrow">MY FIRST SHOWCASE</p>
                      <h2>내 출품작</h2>
                      <p className="competition-note">
                        {extension
                          ? `개별 제출 기한 · ${kst(extension.dueAt)}`
                          : `제출 마감 · ${kst(competition.submissionDueAt)}`}
                      </p>
                    </div>
                    {myEntry?.status === 'SUBMITTED' && (
                      <span className="competition-saved">
                        <CheckCircle2 size={17} />
                        제출 완료
                      </span>
                    )}
                  </div>
                  {myEntry ? (
                    <>
                      <h3>{myEntry.title}</h3>
                      <p className="competition-note">
                        {myEntry.displayName} · 버전 {myEntry.revision} ·{' '}
                        {myEntry.status === 'DRAFT'
                          ? '임시 저장'
                          : myEntry.status === 'WITHDRAWN'
                            ? '철회됨'
                            : `최종 제출 ${kst(myEntry.submittedAt || undefined)}`}
                      </p>
                      <div className="competition-actions">
                        <Button type="button" onClick={() => setPreview(myEntry)}>
                          <FileCode2 size={16} />
                          공개 내용 미리보기
                        </Button>
                        <CompetitionHistory competitionId={competition.id} entry={myEntry} />
                        {editable && (
                          <Button
                            type="button"
                            variant="primary"
                            onClick={() => setSubmissionOpen(true)}
                          >
                            출품작 수정하기
                          </Button>
                        )}
                        {editable && myEntry.status === 'SUBMITTED' && (
                          <Button
                            type="button"
                            onClick={() => {
                              if (
                                !confirm(
                                  '이 작품의 제출을 철회할까요? 기한 내에 다시 제출할 수 있어요.',
                                )
                              )
                                return;
                              void api(`/competitions/${competition.id}/withdraw`, 'POST', {
                                expectedRevision: myEntry.revision,
                              })
                                .then(refresh)
                                .then(() => onToast('출품을 철회했어요.'))
                                .catch((e) => setError(e.message));
                            }}
                          >
                            제출 철회
                          </Button>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <p>
                        직접 만든 서비스를 소개서와 함께 제출해 주세요. 쉬운 템플릿으로 소개서를
                        작성할 수 있어요.
                      </p>
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => setSubmissionOpen(true)}
                        disabled={!editable}
                      >
                        <Plus size={16} />내 서비스 출품하기
                      </Button>
                    </>
                  )}
                  {!editable && (
                    <p className="competition-privacy-note">
                      {competition.state === 'UPCOMING'
                        ? '작품 접수가 시작되면 출품할 수 있어요.'
                        : '지금은 출품작을 수정할 수 없는 기간이에요. 제출 기한 연장이 필요하면 선생님에게 문의해 주세요.'}{' '}
                      일정과 허용 여부는 서버가 확인해요.
                    </p>
                  )}
                </section>
              )}
              {!teacher && detail.results && (
                <section className="panel">
                  <h2>우리 반 경진대회 결과</h2>
                  <CompetitionResults results={detail.results} />
                </section>
              )}
            </div>
            <aside className="competition-aside">
              <section className="panel">
                <h2>대회 일정</h2>
                <CompetitionSchedule competition={competition} />
                <p className="competition-note">
                  한국 시간(KST)
                  <br />
                  서버 확인: {kst(detail.serverNow)}
                </p>
              </section>
              <section className="panel">
                <h2>어떤 작품을 평가하나요?</h2>
                <p className="competition-note">
                  실용성 35점
                  <br />
                  활용성 30점
                  <br />
                  완성도 20점
                  <br />
                  창의성 15점
                </p>
                <p className="competition-note">
                  합계 100점 · 평가 완료 전 다른 심사자의 점수는 공개하지 않아요.
                </p>
                {competition.awardNames.length > 0 && (
                  <>
                    <h3>시상</h3>
                    <p className="competition-note">{competition.awardNames.join(' · ')}</p>
                  </>
                )}
              </section>
            </aside>
          </div>
          {teacher && detail.audit && (
            <details className="panel competition-class-manager">
              <summary>대회 운영 이력</summary>
              <ul className="competition-audit">
                {detail.audit.map((item) => (
                  <li key={item.id}>
                    <time dateTime={item.createdAt}>{kst(item.createdAt)}</time> · {item.action}
                    <br />
                    {item.detail}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {teacher && !competition.archived && (
            <div className="competition-danger-zone">
              <Button type="button" onClick={() => setPendingAction('archive')}>
                <Archive size={16} />
                대회 보관하기
              </Button>
              <p className="competition-note">
                보관하면 교실의 대회 장식과 진행 안내가 내려가요. 제출물과 심사 기록은 보존해요.
              </p>
            </div>
          )}
        </>
      )}
      {editing && (
        <CompetitionEditor
          key={editing === 'new' ? 'new' : editing.id}
          competition={editing === 'new' ? undefined : editing}
          participantsLocked={
            editing !== 'new' && detail?.competition.id === editing.id && !!detail.entries.length
          }
          classes={list.classes}
          state={state}
          onClose={() => setEditing(null)}
          onSaved={async (id) => {
            await load(id);
            setSelectedId(id);
            await onRefresh();
            onToast('대회 설정을 저장했어요.');
          }}
        />
      )}
      {submissionOpen && competition && (
        <SubmissionEditor
          competition={competition}
          entry={myEntry || null}
          state={state}
          onSaved={async () => {
            await refresh();
            onToast('출품작을 저장했어요.');
          }}
          onClose={() => setSubmissionOpen(false)}
        />
      )}
      {preview && (
        <Modal
          title={preview.title}
          subtitle={`${preview.displayName} · 제출 버전 ${preview.revision}`}
          onClose={() => setPreview(null)}
          wide
        >
          <div className="competition-work-detail">
            <p className="competition-privacy-note">
              이 화면은 제출한 소개서와 결과물만 표시해요. 실제 외부 공개 여부는 대회 상태·공개
              범위·학생 동의를 서버가 확인해요.
            </p>
            <div className="competition-actions">
              <ServiceLink url={preview.serviceUrl} />
              {preview.artifact && (
                <a className="button secondary" href={preview.artifact.downloadUrl}>
                  결과물 다운로드
                </a>
              )}
              {preview.introFile && (
                <a className="button secondary" href={preview.introFile.downloadUrl}>
                  소개서 원본 다운로드
                </a>
              )}
            </div>
            <IntroductionPreview
              html={preview.introHtml}
              title={`${preview.title} 공개 소개서 미리보기`}
            />
          </div>
        </Modal>
      )}
      {pendingAction && (
        <Modal
          title={actionLabels[pendingAction] || '대회 상태 변경'}
          onClose={() => {
            if (!actionBusy) setPendingAction(null);
          }}
        >
          <p className="competition-confirm-warning">
            {pendingAction === 'publishResults'
              ? '결과를 공개하면 학생과 대회 페이지 방문자가 순위와 평균 점수를 확인할 수 있어요. 최소 심사 수와 누락된 작품을 먼저 확인해 주세요.'
              : pendingAction === 'publish'
                ? '공개하면 설정한 일정에 따라 참가 학생의 접수와 외부 심사가 열려요. 반, 일정, 공개 범위를 확인해 주세요.'
                : '운영 상태가 바뀌며 변경 사유가 기록돼요. 기존 제출물과 심사 기록은 삭제하지 않아요.'}
          </p>
          <Field label="변경 사유">
            <textarea
              rows={3}
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              maxLength={500}
            />
          </Field>
          {error && (
            <InlineNotice title="상태를 변경하지 못했어요" kind="error">
              {error}
            </InlineNotice>
          )}
          <div className="form-actions">
            <Button type="button" disabled={actionBusy} onClick={() => setPendingAction(null)}>
              취소
            </Button>
            <Button type="button" variant="primary" busy={actionBusy} onClick={() => void action()}>
              {actionLabels[pendingAction]}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
