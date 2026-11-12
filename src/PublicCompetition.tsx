import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Trophy,
} from 'lucide-react';
import type {
  CompetitionEntry,
  CompetitionResult,
  PublicCompetitionResponse,
} from '../shared/competitions';
import { api } from './api';
import { Field, Modal } from './components';
import { Button, InlineNotice } from './ui';
import {
  CompetitionSchedule,
  IntroductionPreview,
  PhaseBadge,
  ServiceLink,
  kst,
  scoreCriteria,
} from './competition-ui';

export function CompetitionResults({ results }: { results: CompetitionResult[] }) {
  if (!results.length) return <p className="competition-note">집계할 제출 작품이 없어요.</p>;
  return (
    <ol className="competition-result-list" aria-label="경진대회 결과">
      {results.map((result) => (
        <li className="competition-result" key={result.entryId}>
          <span className="competition-rank">{result.rank ?? '·'}</span>
          <div>
            <strong>
              {result.award ? `${result.award} · ` : ''}
              {result.title}
            </strong>
            <small>
              {result.displayName} · 유효 평가 {result.count}개
              {!result.eligible ? ' · 최소 심사 수 미달' : ''}
            </small>
            <small>
              실용성 {result.practicality.toFixed(2)}/35 · 활용성 {result.usability.toFixed(2)}/30 ·
              완성도 {result.completeness.toFixed(2)}/20 · 창의성 {result.creativity.toFixed(2)}/15
            </small>
          </div>
          <span className="competition-result-score">
            {result.average.toFixed(2)} <small>/ 100점</small>
          </span>
        </li>
      ))}
    </ol>
  );
}
function ScoreForm({
  entry,
  competitionId,
  onSaved,
}: {
  entry: CompetitionEntry;
  competitionId: string;
  onSaved: () => Promise<void>;
}) {
  const [scores, setScores] = useState<Record<string, string>>({});
  const [comment, setComment] = useState(''),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  const sending = useRef(false),
    requestId = useRef(crypto.randomUUID());
  const total = scoreCriteria.reduce(
    (sum, criterion) => sum + (Number(scores[criterion.key]) || 0),
    0,
  );
  const submit = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      await api(`/public/competitions/${competitionId}/entries/${entry.id}/scores`, 'POST', {
        ...Object.fromEntries(
          scoreCriteria.map((criterion) => [criterion.key, Number(scores[criterion.key])]),
        ),
        comment,
        idempotencyKey: requestId.current,
      });
      setSaved(true);
      setConfirm(false);
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
      setConfirm(false);
      if ((e as { status?: number }).status === 409) await onSaved();
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  if (saved)
    return (
      <InlineNotice title="평가를 제출했어요" kind="success">
        최종 평가가 안전하게 저장되었어요. 다른 작품도 살펴봐 주세요.
      </InlineNotice>
    );
  return (
    <form
      className="competition-score-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError('');
        setConfirm(true);
      }}
    >
      <div>
        <p className="eyebrow">YOUR REVIEW</p>
        <h2 id="competition-scoring" tabIndex={-1}>
          이 작품 평가하기
        </h2>
        <p className="muted">
          소개서와 결과물을 살펴보고 각 항목에 정수 점수를 입력해 주세요. 최종 제출 후에는 수정할 수
          없어요.
        </p>
      </div>
      {scoreCriteria.map((criterion) => (
        <div className="competition-score-row" key={criterion.key}>
          <div>
            <label htmlFor={`score-${criterion.key}`}>{criterion.label}</label>
            <p id={`score-${criterion.key}-help`}>{criterion.description}</p>
          </div>
          <div>
            <input
              id={`score-${criterion.key}`}
              aria-describedby={`score-${criterion.key}-help score-${criterion.key}-max`}
              type="number"
              inputMode="numeric"
              min="0"
              max={criterion.max}
              step="1"
              required
              value={scores[criterion.key] ?? ''}
              onChange={(e) =>
                setScores((previous) => ({ ...previous, [criterion.key]: e.target.value }))
              }
            />
            <div id={`score-${criterion.key}-max`} className="competition-score-max">
              0–{criterion.max}점
            </div>
          </div>
        </div>
      ))}
      <Field label="작품에 남기는 한마디 · 선택">
        <textarea
          value={comment}
          maxLength={2000}
          rows={3}
          onChange={(e) => setComment(e.target.value)}
          placeholder="좋았던 점이나 더 발전시키면 좋을 점을 남겨 주세요."
        />
      </Field>
      <div className="competition-score-total">
        <span>나의 총점</span>
        <strong>
          {total}
          <small> / 100</small>
        </strong>
      </div>
      {error && (
        <InlineNotice title="평가를 저장하지 못했어요" kind="error">
          {error}
        </InlineNotice>
      )}
      <Button type="submit" variant="primary" disabled={busy}>
        점수 확인하고 제출하기
      </Button>
      {confirm && (
        <Modal
          title="이 점수로 제출할까요?"
          subtitle={`${entry.title} · 제출 후 수정할 수 없어요.`}
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <div className="competition-confirm-scores">
            {scoreCriteria.map((criterion) => (
              <div key={criterion.key}>
                <span>{criterion.label}</span>
                <strong>
                  {scores[criterion.key]} / {criterion.max}점
                </strong>
              </div>
            ))}
          </div>
          <div className="competition-score-total">
            <span>최종 총점</span>
            <strong>{total} / 100</strong>
          </div>
          <div className="form-actions">
            <Button type="button" disabled={busy} onClick={() => setConfirm(false)}>
              돌아가서 수정
            </Button>
            <Button type="button" variant="primary" busy={busy} onClick={() => void submit()}>
              평가 최종 제출
            </Button>
          </div>
        </Modal>
      )}
    </form>
  );
}
export default function PublicCompetition({ id }: { id: string }) {
  const [data, setData] = useState<PublicCompetitionResponse | null>(null),
    [error, setError] = useState(''),
    [key, setKey] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [selectedId, setSelectedId] = useState('');
  const activationStarted = useRef(false),
    disposed = useRef(false);
  const reload = useCallback(async () => {
    const next = await api<PublicCompetitionResponse>(
      `/public/competitions/${encodeURIComponent(id)}`,
    );
    if (!disposed.current) {
      setData(next);
      setError('');
    }
  }, [id]);
  useEffect(() => {
    disposed.current = false;
    const originalTitle = document.title;
    const start = async () => {
      // A fragment never reaches HTTP access logs. Remove it before the exchange or any navigation.
      const fragment = new URLSearchParams(location.hash.slice(1));
      const invite = fragment.get('judge');
      if (invite && !activationStarted.current) {
        activationStarted.current = true;
        history.replaceState(null, '', location.pathname + location.search);
        setBusy(true);
        try {
          await api(`/public/competitions/${encodeURIComponent(id)}/judge-session`, 'POST', {
            key: invite,
          });
          if (!disposed.current) setMessage('심사 KEY를 확인했어요. 이제 작품을 평가할 수 있어요.');
        } catch (e) {
          if (!disposed.current)
            setMessage(`심사 KEY를 확인하지 못했어요. ${(e as Error).message}`);
        } finally {
          if (!disposed.current) setBusy(false);
        }
      }
      try {
        await reload();
      } catch (e) {
        if (!disposed.current) setError((e as Error).message);
      }
    };
    void start();
    const timer = setInterval(() => {
      void reload().catch(() => {});
    }, 60000);
    return () => {
      disposed.current = true;
      clearInterval(timer);
      document.title = originalTitle;
    };
  }, [id, reload]);
  useEffect(() => {
    if (data) document.title = `${data.competition.name} · Pixel Class 경진대회`;
  }, [data?.competition.name]);
  const activate = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`/public/competitions/${id}/judge-session`, 'POST', { key: key.trim() });
      setKey('');
      await reload();
      setMessage('심사 KEY를 확인했어요. 작품을 선택해 평가해 주세요.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const selected = data?.entries.find((entry) => entry.id === selectedId);
  const scored = new Set(data?.judge?.scoredEntryIds || []);
  return (
    <div className="competition-public">
      <header className="competition-public-header">
        <div className="competition-public-brand">
          <Trophy aria-hidden="true" />
          <span>
            PIXEL CLASS
            <br />
            <small>AI SERVICE SHOWCASE</small>
          </span>
        </div>
        <span className="muted">함께 만든 가능성, 세상에 소개해요</span>
      </header>
      <main className="competition-public-inner">
        {error && (
          <InlineNotice title="확인이 필요해요" kind="error">
            {error}
            <div className="competition-actions">
              <Button type="button" onClick={() => void reload().catch((e) => setError(e.message))}>
                <RefreshCw size={16} />
                다시 불러오기
              </Button>
            </div>
          </InlineNotice>
        )}
        {message && !selected && (
          <InlineNotice
            title={message}
            kind={message.startsWith('심사 KEY를 확인하지') ? 'error' : 'success'}
          />
        )}
        {!data ? (
          !error && (
            <div className="competition-empty" role="status">
              경진대회를 불러오고 있어요…
            </div>
          )
        ) : (
          <>
            <section
              className={`competition-public-hero ${selected ? 'is-compact' : ''}`}
              aria-labelledby="competition-public-title"
            >
              <div>
                <PhaseBadge state={data.competition.state} />
                <h1 id="competition-public-title">{data.competition.name}</h1>
                <p className="competition-description">{data.competition.description}</p>
                <p className="competition-note">
                  모든 일정은 한국 시간(KST)이에요. 접수와 심사 마감은 서버가 확인해요.
                </p>
              </div>
              {selected ? (
                <details className="competition-compact-schedule">
                  <summary>대회 일정 보기 · 한국 시간</summary>
                  <CompetitionSchedule competition={data.competition} />
                </details>
              ) : (
                <CompetitionSchedule competition={data.competition} />
              )}
            </section>
            {data.judge ? (
              <div className="competition-judging-status">
                <ShieldCheck size={24} aria-hidden="true" />
                <div style={{ flex: 1 }}>
                  <strong>{data.judge.label} · 심사 연결됨</strong>
                  <p>
                    평가한 작품 {data.judge.scoredEntryIds.length}개 · 이 심사 권한은 학교 계정에
                    접근할 수 없어요.
                  </p>
                </div>
                <Button
                  type="button"
                  aria-label="심사 연결 종료"
                  onClick={() =>
                    void api(`/public/competitions/${id}/judge-session`, 'DELETE')
                      .then(() => {
                        setSelectedId('');
                        setMessage('심사 연결을 종료했어요.');
                        return reload();
                      })
                      .catch((e) => setError(e.message))
                  }
                >
                  <LogOut size={16} />
                  종료
                </Button>
              </div>
            ) : (
              <section className="panel">
                <div className="competition-heading">
                  <div>
                    <h2>초대받은 심사자이신가요?</h2>
                    <p className="competition-note">
                      학교 계정 없이 선생님이 전달한 일회용 KEY로 참여할 수 있어요.
                    </p>
                  </div>
                  <KeyRound size={22} aria-hidden="true" />
                </div>
                <form
                  className="competition-public-key"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void activate();
                  }}
                >
                  <Field label="심사 KEY">
                    <input
                      type="password"
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                      required
                      maxLength={256}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="전달받은 KEY를 입력해 주세요"
                    />
                  </Field>
                  <Button type="submit" variant="primary" busy={busy}>
                    심사 참여하기
                  </Button>
                </form>
              </section>
            )}
            {data.results && (
              <section className="panel">
                <p className="eyebrow">CELEBRATE THE BUILDERS</p>
                <h2>경진대회 결과</h2>
                <CompetitionResults results={data.results} />
              </section>
            )}
            {selected ? (
              <section className="panel competition-work-detail">
                <Button type="button" variant="ghost" onClick={() => setSelectedId('')}>
                  <ArrowLeft size={16} />
                  작품 목록으로
                </Button>
                <div className="competition-work-heading">
                  <div>
                    <h2>{selected.title}</h2>
                    <p className="competition-note">
                      {selected.displayName} · 제출 버전 {selected.revision}
                    </p>
                  </div>
                  <div className="competition-actions">
                    <ServiceLink url={selected.serviceUrl} />
                    {data.judge &&
                      !scored.has(selected.id) &&
                      data.competition.state === 'JUDGING' && (
                        <a className="button primary" href="#competition-scoring">
                          평가 항목으로 바로가기
                        </a>
                      )}
                  </div>
                </div>
                <p className="competition-privacy-note">
                  결과물은 제출자가 공개에 동의한 내용만 표시해요. 외부 서비스는 새 창에서 열리며,
                  서비스의 내용이나 안전성을 Pixel Class가 보증하지 않아요.
                </p>
                <IntroductionPreview
                  html={selected.introHtml}
                  title={`${selected.title} 서비스 소개서`}
                  compact
                />
                <div className="competition-actions">
                  {selected.artifact && (
                    <a className="button secondary" href={selected.artifact.downloadUrl}>
                      결과물 다운로드 · {selected.artifact.fileName}
                    </a>
                  )}
                  {selected.introFile && (
                    <a className="button secondary" href={selected.introFile.downloadUrl}>
                      소개서 원본 다운로드
                    </a>
                  )}
                </div>
                {scored.has(selected.id) ? (
                  <InlineNotice title="이미 평가한 작품이에요" kind="success">
                    중복 평가를 막기 위해 제출한 점수는 다시 입력할 수 없어요.
                  </InlineNotice>
                ) : data.judge &&
                  data.competition.state === 'JUDGING' &&
                  (!data.judge.allowedEntryIds.length ||
                    data.judge.allowedEntryIds.includes(selected.id)) ? (
                  <ScoreForm
                    key={`${data.judge.id}-${selected.id}`}
                    entry={selected}
                    competitionId={id}
                    onSaved={reload}
                  />
                ) : (
                  <InlineNotice
                    title={
                      data.competition.state === 'JUDGING'
                        ? '심사 KEY를 확인하면 평가할 수 있어요'
                        : '지금은 심사 입력 기간이 아니에요'
                    }
                  >
                    심사 기간: {kst(data.competition.judgingStartsAt)} –{' '}
                    {kst(data.competition.judgingEndsAt)}
                  </InlineNotice>
                )}
              </section>
            ) : (
              <section>
                <div className="page-section-title">
                  <div>
                    <p className="eyebrow">MADE WITH AI, BUILT BY US</p>
                    <h2>
                      출품한 서비스 <span className="muted">{data.entries.length}</span>
                    </h2>
                  </div>
                </div>
                {!data.entries.length ? (
                  <div className="competition-empty">
                    <Trophy size={32} />
                    <h2>
                      {data.competition.visibility === 'JUDGES' && !data.judge
                        ? '초대된 심사자에게 공개하는 작품이에요'
                        : '아직 공개할 작품이 없어요'}
                    </h2>
                    <p>
                      {data.competition.visibility === 'JUDGES' && !data.judge
                        ? '전달받은 심사 KEY를 입력하면 평가할 작품을 볼 수 있어요.'
                        : '학생들이 제출하고 공개에 동의한 작품이 여기에 모여요.'}
                    </p>
                  </div>
                ) : (
                  <div className="competition-cards">
                    {data.entries.map((entry) => (
                      <article className="competition-card" key={entry.id}>
                        <div className="competition-card-top">
                          <span className="competition-card-icon">
                            <Trophy size={21} />
                          </span>
                          {scored.has(entry.id) && (
                            <span className="competition-card-meta">
                              <CheckCircle2 size={16} />
                              평가 완료
                            </span>
                          )}
                        </div>
                        <h2>{entry.title}</h2>
                        <p>{entry.displayName}</p>
                        <p>
                          {entry.intro.purpose.slice(0, 110) ||
                            '소개서에서 이 서비스의 이야기를 만나보세요.'}
                        </p>
                        <Button
                          type="button"
                          onClick={() => {
                            setSelectedId(entry.id);
                            window.scrollTo({ top: 0, behavior: 'instant' });
                          }}
                        >
                          작품 살펴보기
                          {data.judge &&
                          !scored.has(entry.id) &&
                          data.competition.state === 'JUDGING'
                            ? ' · 평가'
                            : ''}
                        </Button>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}
            <footer className="competition-note">
              서버 확인: {kst(data.serverNow)} · 학생 이메일과 비공개 프로젝트 기록은 이 페이지에
              공개하지 않아요.
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
