import { useEffect, useRef, useState } from 'react';
import type { Competition, CompetitionScoreReview as Score } from '../shared/competitions';
import { api } from './api';
import { Modal, Field } from './components';
import { Button, InlineNotice } from './ui';
import { kst } from './competition-ui';
type Page = { scores: Score[]; total: number; offset: number; limit: number };
export function CompetitionScoreReview({
  competition,
  onSaved,
}: {
  competition: Competition;
  onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [data, setData] = useState<Page>(),
    [offset, setOffset] = useState(0),
    [selected, setSelected] = useState<Score | null>(null),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const sequence = useRef(0),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      sequence.current++;
    };
  }, []);
  async function load() {
    const id = ++sequence.current;
    const next = await api<Page>(`/competitions/${competition.id}/score-reviews?offset=${offset}`);
    if (alive.current && sequence.current === id) {
      setData(next);
      setError('');
    }
  }
  useEffect(() => {
    if (open)
      void load().catch((e) => {
        if (alive.current) setError(e.message);
      });
  }, [open, competition.id, offset]);
  const locked = competition.resultsPublished || competition.archived;
  async function save() {
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    try {
      await api(`/competitions/${competition.id}/score-reviews/${selected.id}`, 'POST', {
        revision: selected.review.revision,
        excluded: !selected.review.excluded,
        reason,
      });
      await load();
      await onSaved();
      if (alive.current) {
        setSelected(null);
        setReason('');
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <details
      className="panel competition-score-reviews"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>평가 원본과 집계 검토 · MASTER 전용</summary>
      <p className="competition-note">
        원래 점수는 수정하거나 삭제하지 않아요. 사유를 기록해 집계에서 제외·복원하며 최소 심사 수와
        순위가 다시 계산돼요. 재평가가 필요하면 기존 평가를 확인한 후 해당 작품만 새 심사 KEY로
        배정해 주세요.
      </p>
      {locked && (
        <p className="competition-privacy-note">
          공개한 결과는 먼저 공개를 철회해야 검토할 수 있어요. 보관된 대회는 변경할 수 없어요.
        </p>
      )}
      {error && !selected && (
        <InlineNotice kind="error" title="평가를 불러오지 못했어요">
          {error}
        </InlineNotice>
      )}
      <Button
        type="button"
        disabled={busy}
        onClick={() => void load().catch((e) => setError(e.message))}
      >
        평가 목록 새로고침
      </Button>
      {data && (
        <>
          <p>
            전체 평가 {data.total}개 · {data.offset + 1 > data.total ? 0 : data.offset + 1}–
            {Math.min(data.offset + data.scores.length, data.total)} 표시
          </p>
          <ul className="competition-pass-list">
            {data.scores.map((score) => (
              <li key={score.id}>
                <div>
                  <strong>{score.title}</strong>
                  <p>
                    {score.judgeLabel} · {kst(score.createdAt)}
                  </p>
                  <p>
                    실용성 {score.practicality}/35 · 활용성 {score.usability}/30 · 완성도{' '}
                    {score.completeness}/20 · 창의성 {score.creativity}/15
                  </p>
                  <p>
                    <strong>{score.review.excluded ? '집계 제외' : '집계 포함'}</strong> · 원본 합계{' '}
                    {score.practicality + score.usability + score.completeness + score.creativity}점
                  </p>
                  {score.comment && <p className="competition-note">심사 의견: {score.comment}</p>}
                  {score.review.reason && (
                    <p className="competition-note">
                      최근 검토 사유: {score.review.reason} ·{' '}
                      {kst(score.review.updatedAt || undefined)}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  disabled={locked || busy}
                  onClick={() => {
                    setSelected(score);
                    setReason('');
                    setError('');
                  }}
                >
                  {score.review.excluded ? '집계에 복원' : '집계에서 제외'}
                </Button>
              </li>
            ))}
          </ul>
          {!data.total && <p>제출된 평가가 아직 없어요.</p>}
          <div className="competition-actions">
            <Button
              type="button"
              disabled={offset === 0 || busy}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              이전 평가
            </Button>
            <Button
              type="button"
              disabled={offset + data.limit >= data.total || busy}
              onClick={() => setOffset(offset + 50)}
            >
              다음 평가
            </Button>
          </div>
        </>
      )}
      {selected && (
        <Modal
          title={
            selected.review.excluded ? '평가를 집계에 복원할까요?' : '평가를 집계에서 제외할까요?'
          }
          subtitle={`${selected.title} · ${selected.judgeLabel}`}
          onClose={() => {
            if (!busy) setSelected(null);
          }}
        >
          <p>
            평가 원본과 이전 검토 이력은 보존돼요. 집계 대상이 바뀌어 순위와 수상이 달라질 수
            있어요.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Field label="평가 검토 사유">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                minLength={5}
                maxLength={1000}
                required
                rows={4}
              />
            </Field>
            {error && (
              <InlineNotice title="검토를 저장하지 못했어요" kind="error">
                {error}
              </InlineNotice>
            )}
            <div className="form-actions">
              <Button type="button" disabled={busy} onClick={() => setSelected(null)}>
                취소
              </Button>
              <Button type="submit" busy={busy} disabled={reason.trim().length < 5}>
                사유 기록하고 {selected.review.excluded ? '복원' : '제외'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </details>
  );
}
