import { useEffect, useState } from 'react';
import type { AppState } from '../shared/types';
import { Field } from './components';
import { api } from './api';
type Usage = { usedBytes: number; limitBytes: number; freeBytes: number; backupAt: string | null };
const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
export function AccountPage({ state, onToast }: { state: AppState; onToast: (v: string) => void }) {
  const [current, setCurrent] = useState(''),
    [password, setPassword] = useState(''),
    [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false),
    [usage, setUsage] = useState<Usage>(),
    [error, setError] = useState('');
  useEffect(() => {
    if (state.me.role === 'MASTER')
      void api<Usage>('/operations')
        .then(setUsage)
        .catch((e) => setError(e.message));
  }, [state.me.id, state.me.role]);
  return (
    <section className="teaching-page">
      <div className="page-section-title">
        <div>
          <p className="eyebrow">MY ACCOUNT</p>
          <h1>내 계정과 운영</h1>
          <p className="muted">
            {state.me.name} · {state.me.role === 'MASTER' ? '선생님' : '학생'}
          </p>
        </div>
      </div>
      <div className="panel">
        <h2>비밀번호 변경</h2>
        <form
          className="project-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) return;
            if (password !== again) return onToast('새 비밀번호가 서로 달라요.');
            setBusy(true);
            void api('/account/password', 'POST', { currentPassword: current, password })
              .then(() => {
                setCurrent('');
                setPassword('');
                setAgain('');
                onToast('비밀번호를 변경했어요. 다른 기기는 로그아웃됩니다.');
              })
              .catch((e) => onToast(e.message))
              .finally(() => setBusy(false));
          }}
        >
          <Field label="현재 비밀번호">
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              maxLength={128}
            />
          </Field>
          <Field label="새 비밀번호">
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
              maxLength={128}
            />
          </Field>
          <Field label="새 비밀번호 확인">
            <input
              type="password"
              autoComplete="new-password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              required
              minLength={10}
              maxLength={128}
            />
          </Field>
          <button className="button primary" disabled={busy}>
            비밀번호 변경하기
          </button>
        </form>
      </div>
      {state.me.role === 'MASTER' && (
        <div className="panel">
          <h2>학교 저장 공간과 백업</h2>
          {error && <p role="alert">{error}</p>}
          {usage && (
            <>
              <p>
                첨부파일 {mb(usage.usedBytes)} / {mb(usage.limitBytes)} MB
              </p>
              <progress
                max={usage.limitBytes}
                value={usage.usedBytes}
                aria-label="학교 첨부파일 저장 공간"
              />
              {usage.usedBytes > usage.limitBytes * 0.8 && (
                <p role="alert">
                  저장 공간의 80% 이상을 사용했어요. 불필요한 첨부파일을 정리해 주세요.
                </p>
              )}
              <p className="muted">
                최근 서버 백업:{' '}
                {usage.backupAt
                  ? new Date(usage.backupAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
                  : '아직 없음'}
              </p>
            </>
          )}
          <p className="muted">
            운영 서버는 시작 시와 6시간마다 검증된 백업 한 개를 보관해요. 같은 서버의 백업이므로
            PC에도 내려받아 안전하게 보관해 주세요. 백업에는 비공개 교육 기록이 포함됩니다.
          </p>
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void api<Usage>('/operations/backup', 'POST')
                  .then((v) => {
                    setUsage(v);
                    setError('');
                    onToast('서버 백업을 만들었어요.');
                  })
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              지금 서버 백업
            </button>
            <a className="button primary" href="/api/operations/backup" download>
              학교 백업 내려받기
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
export function RecoveryControls({
  state,
  onToast,
}: {
  state: AppState;
  onToast: (v: string) => void;
}) {
  const [student, setStudent] = useState(''),
    [link, setLink] = useState(''),
    [expiry, setExpiry] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <details className="panel recovery-panel">
      <summary>학생 비밀번호 복구</summary>
      <p className="muted">
        학생 본인임을 확인한 뒤 복구 링크를 발급해 전달하세요. 30분 동안 한 번만 사용할 수 있어요.
        새 링크를 발급하면 이전 링크는 취소됩니다.
      </p>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setLink('');
          void api<{ key: string; expiresAt: string }>(`/members/${student}/recovery`, 'POST')
            .then((v) => {
              setLink(`${location.origin}/?reset=${v.key}`);
              setExpiry(v.expiresAt);
            })
            .catch((e) => onToast(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <Field label="복구할 학생">
          <select
            value={student}
            onChange={(e) => {
              setStudent(e.target.value);
              setLink('');
            }}
            required
          >
            <option value="">학생 선택</option>
            {state.members
              .filter((s) => s.role === 'STUDENT' && s.status === 'ACTIVE')
              .map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
        <button className="button secondary" disabled={busy}>
          복구 링크 발급
        </button>
      </form>
      {link && (
        <div className="invite-result">
          <Field label="학생에게 전달할 복구 링크">
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
          </Field>
          <p className="muted">
            {new Date(expiry).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}까지 · 원문은 이
            화면에서만 표시돼요.
          </p>
          <button
            className="button secondary"
            onClick={() =>
              void navigator.clipboard
                .writeText(link)
                .then(() => onToast('복구 링크를 복사했어요.'))
                .catch(() => onToast('표시된 링크를 직접 복사해 주세요.'))
            }
          >
            복구 링크 복사
          </button>
        </div>
      )}
    </details>
  );
}
export function BatchInvites({ onToast }: { onToast: (v: string) => void }) {
  const [count, setCount] = useState(8),
    [busy, setBusy] = useState(false),
    [links, setLinks] = useState<string[]>([]);
  return (
    <details className="panel">
      <summary>여러 학생 초대 링크 한 번에 만들기</summary>
      <p className="muted">
        학생마다 다른 링크를 하나씩 전달하세요. 공용 접근 암호도 별도로 알려 주세요. 각 링크는 7일
        동안 한 번만 쓸 수 있어요.
      </p>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          void api<{ key: string; label: string }[]>('/invitations/batch', 'POST', {
            count,
            label: '교육생',
          })
            .then((v) => {
              setLinks(v.map((i) => `${i.label}: ${location.origin}/?invite=${i.key}`));
              onToast('초대 링크를 발급했어요. 지금 복사해 주세요.');
            })
            .catch((e) => onToast(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <Field label="초대할 학생 수">
          <input
            type="number"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            min={1}
            max={30}
            required
          />
        </Field>
        <button className="button primary" disabled={busy}>
          개별 초대 링크 일괄 발급
        </button>
      </form>
      {links.length > 0 && (
        <Field label="개별 초대 링크 목록">
          <textarea
            rows={Math.min(links.length * 2, 16)}
            readOnly
            value={links.join('\n\n')}
            onFocus={(e) => e.target.select()}
          />
        </Field>
      )}
    </details>
  );
}
