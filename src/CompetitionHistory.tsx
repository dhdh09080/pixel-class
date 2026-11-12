import { useEffect, useState } from 'react';
import type { CompetitionEntry, CompetitionVersionSummary } from '../shared/competitions';
import { competitionIntroLabels } from '../shared/competitions';
import { api } from './api';
import { Modal, Field } from './components';
import { Button, InlineNotice } from './ui';
import { IntroductionPreview, kst } from './competition-ui';

export function CompetitionHistory({
  competitionId,
  entry,
}: {
  competitionId: string;
  entry: CompetitionEntry;
}) {
  const [open, setOpen] = useState(false),
    [versions, setVersions] = useState<CompetitionVersionSummary[]>([]),
    [left, setLeft] = useState(0),
    [right, setRight] = useState(0),
    [pair, setPair] = useState<CompetitionEntry[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  const base = `/competitions/${encodeURIComponent(competitionId)}/entries/${encodeURIComponent(entry.id)}/versions`;
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError('');
    setPair([]);
    void api<CompetitionVersionSummary[]>(base + '?summary=1')
      .then((rows) => {
        if (!alive) return;
        const sorted = rows.toSorted((a, b) => b.revision - a.revision);
        setVersions(sorted);
        setLeft(sorted[1]?.revision || sorted[0]?.revision || 0);
        setRight(sorted[0]?.revision || 0);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, base, entry.revision]);
  useEffect(() => {
    if (!open || !left || !right) return;
    let alive = true;
    setLoading(true);
    setError('');
    setPair([]);
    void Promise.all([
      api<CompetitionEntry>(base + '/' + left),
      api<CompetitionEntry>(base + '/' + right),
    ])
      .then((rows) => {
        if (alive) setPair(rows);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, base, left, right]);
  const a = pair[0],
    b = pair[1];
  const changes =
    a && b
      ? [
          ...(
            [
              ['title', '작품 이름'],
              ['displayName', '표시 이름'],
              ['serviceUrl', '결과물 주소'],
            ] as const
          ).map(([key, label]) => ({ label, before: a[key], after: b[key] })),
          ...Object.entries(competitionIntroLabels).map(([key, label]) => ({
            label,
            before: a.intro[key as keyof typeof a.intro],
            after: b.intro[key as keyof typeof b.intro],
          })),
          {
            label: '결과물 파일',
            before: a.artifact?.fileName || '',
            after: b.artifact?.fileName || '',
          },
          {
            label: '소개서 원본',
            before: a.introFile?.fileName || '',
            after: b.introFile?.fileName || '',
          },
        ].filter((item) => item.before !== item.after)
      : [];
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        제출 버전 비교
      </Button>
      {open && (
        <Modal
          title="제출 버전 비교"
          subtitle="조회 전용 이력이에요. 비교해도 현재 제출물이나 심사 대상은 바뀌지 않아요."
          onClose={() => setOpen(false)}
          wide
        >
          {error && (
            <InlineNotice title="이력을 불러오지 못했어요" kind="error">
              {error}
            </InlineNotice>
          )}
          <div className="competition-history-selectors">
            {(
              [
                ['이전 버전', left, setLeft],
                ['비교할 버전', right, setRight],
              ] as const
            ).map(([label, value, set]) => (
              <Field label={label} key={label}>
                <select
                  value={value}
                  onChange={(e) => set(Number(e.target.value))}
                  disabled={!versions.length}
                >
                  {versions.map((v) => (
                    <option key={v.revision} value={v.revision}>
                      버전 {v.revision} ·{' '}
                      {v.status === 'DRAFT'
                        ? '임시 저장'
                        : v.status === 'WITHDRAWN'
                          ? '철회'
                          : '제출'}{' '}
                      · {kst(v.updatedAt)}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          {loading && <p role="status">선택한 버전을 확인하고 있어요…</p>}
          {!loading && !error && a && b && (
            <>
              <p className="competition-note">
                버전 {a.revision} → 버전 {b.revision} · 변경된 항목 {changes.length}개
              </p>
              {!changes.length && (
                <p>
                  소개 항목의 차이가 없어요. HTML 소개서가 있다면 아래 미리보기도 확인해 주세요.
                </p>
              )}
              <div className="competition-history-diff">
                {changes.map((item) => (
                  <section key={item.label}>
                    <h3>{item.label}</h3>
                    <div className="competition-history-columns">
                      <div>
                        <strong>버전 {a.revision}</strong>
                        <p>{item.before || '입력 없음'}</p>
                      </div>
                      <div>
                        <strong>버전 {b.revision}</strong>
                        <p>{item.after || '입력 없음'}</p>
                      </div>
                    </div>
                  </section>
                ))}
              </div>
              <div className="competition-history-columns">
                {pair.map((v, index) => (
                  <details key={index}>
                    <summary>버전 {v.revision} 소개서 미리보기</summary>
                    <IntroductionPreview
                      html={v.introHtml}
                      title={`버전 ${v.revision} 소개서 ${index + 1}`}
                    />
                  </details>
                ))}
              </div>
            </>
          )}
          {!loading && !error && !versions.length && <p>보존된 제출 이력이 없어요.</p>}
        </Modal>
      )}
    </>
  );
}
