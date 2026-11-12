import { useState } from 'react';
import { OperationsPanel } from './OperationsPanel';
import type { AppState } from '../shared/types';
import { Field } from './components';
import { api } from './api';
import { defaultSchoolSettings, type SchoolSettings } from '../shared/school';
export function AccountPage({
  state,
  onToast,
  onSchoolSaved,
}: {
  state: AppState;
  onToast: (v: string) => void;
  onSchoolSaved: (value: SchoolSettings) => void;
}) {
  const [school, setSchool] = useState(() => ({ ...defaultSchoolSettings, ...state.school }));
  const [schoolSaving, setSchoolSaving] = useState(false);
  const [current, setCurrent] = useState(''),
    [password, setPassword] = useState(''),
    [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
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
      {state.me.role === 'MASTER' && (
        <div className="panel school-settings-panel">
          <h2>학교와 교실 이름</h2>
          <p className="muted">MASTER가 바꾸면 학생 화면에도 같은 이름으로 표시돼요.</p>
          <form
            className="project-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (schoolSaving) return;
              setSchoolSaving(true);
              void api<SchoolSettings>('/school', 'PATCH', school)
                .then((saved) => {
                  setSchool(saved);
                  onSchoolSaved(saved);
                  onToast('학교와 교실 이름을 저장했어요.');
                })
                .catch((error) => onToast(error.message))
                .finally(() => setSchoolSaving(false));
            }}
          >
            <div className="form-grid">
              {(
                [
                  { key: 'name', label: '학교 이름', max: 40 },
                  { key: 'cohortName', label: '기수 이름', max: 40 },
                  { key: 'roomName', label: '교실 이름', max: 60 },
                  { key: 'term', label: '학기 표시', max: 24 },
                ] as const
              ).map((field) => (
                <Field key={field.key} label={field.label}>
                  <input
                    value={school[field.key]}
                    required
                    maxLength={field.max}
                    disabled={schoolSaving}
                    onChange={(event) =>
                      setSchool((previous) => ({ ...previous, [field.key]: event.target.value }))
                    }
                  />
                </Field>
              ))}
            </div>
            <button className="button primary" disabled={schoolSaving}>
              {schoolSaving ? '저장 중…' : '학교 이름 저장하기'}
            </button>
          </form>
        </div>
      )}
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
      {state.me.role === 'MASTER' && <OperationsPanel key={state.me.id} onToast={onToast} />}
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
