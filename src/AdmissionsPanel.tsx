import { useRef, useState } from 'react';
import { Users } from 'lucide-react';
import type { Admission, AppState } from '../shared/types';
import { Avatar, Empty, Field, date } from './components';
import { InlineNotice } from './ui';
import type { Mutate } from './Projects';

export function AdmissionsPanel({
  state,
  mutate,
  onToast,
}: {
  state: AppState;
  mutate: Mutate;
  onToast: (text: string) => void;
}) {
  const [filter, setFilter] = useState('PENDING'),
    [className, setClassName] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [classes, setClasses] = useState<Record<string, string>>({}),
    [reasons, setReasons] = useState<Record<string, string>>({});
  const working = useRef(false);
  const applications = state.admissions || [];
  async function act(action: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function decide(user: Admission, approve: boolean) {
    await act(async () => {
      await mutate('/admissions/' + user.id + (approve ? '/approve' : '/reject'), 'POST', {
        revision: user.admission?.revision ?? 0,
        ...(approve ? { classId: classes[user.id] } : { reason: reasons[user.id] }),
      });
      onToast(
        approve
          ? user.name + '님의 가입을 승인하고 반을 배정했어요.'
          : '가입 거절 사유를 학생에게 전달했어요.',
      );
    });
  }
  return (
    <section className="admissions-panel" aria-label="가입 승인과 반 배정">
      <h2>가입 승인과 반 배정</h2>
      <p className="muted">
        가입 신청을 확인하고 반을 선택해 승인하세요. 승인하면 학생 책상도 자동 배정됩니다.
      </p>
      {state.approvalRegistrationEnabled && (
        <p className="admission-share">
          학생에게 보낼 회원가입 주소 ·{' '}
          <a href={location.origin + '/join'} target="_blank" rel="noreferrer">
            {location.origin}/join
          </a>
        </p>
      )}
      <form
        className="admission-class-form"
        onSubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            await mutate('/classes', 'POST', { name: className });
            setClassName('');
            onToast('새 반을 만들었어요.');
          });
        }}
      >
        <Field label="새 반 이름">
          <input
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            required
            maxLength={80}
            placeholder="예: AI 서비스 1반"
          />
        </Field>
        <button className="button secondary" disabled={busy}>
          반 만들기
        </button>
      </form>
      <div className="filter-tabs" aria-label="가입 신청 상태">
        {['PENDING', 'REJECTED'].map((value) => (
          <button
            key={value}
            className={filter === value ? 'selected' : ''}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === 'PENDING' ? '승인 대기' : '거절한 신청'} (
            {applications.filter((user) => user.status === value).length})
          </button>
        ))}
      </div>
      {error && (
        <InlineNotice kind="error" title="가입 처리를 완료하지 못했어요">
          {error}
        </InlineNotice>
      )}
      {!applications.some((user) => user.status === filter) && (
        <Empty
          icon={<Users />}
          title={
            filter === 'PENDING' ? '승인을 기다리는 학생이 없어요' : '거절한 가입 신청이 없어요'
          }
          description="학생이 회원가입하면 이곳에서 신청을 확인할 수 있어요."
        />
      )}
      <div className="admission-grid">
        {applications
          .filter((user) => user.status === filter)
          .map((user) => (
            <article className="admission-card" key={user.id}>
              <div className="admission-identity">
                <Avatar appearance={user.appearance} size={76} />
                <div>
                  <h3>{user.name}</h3>
                  <p>{user.email}</p>
                  <small className="muted">신청 · {date(user.admission?.requestedAt || '')}</small>
                </div>
              </div>
              {user.status === 'REJECTED' && (
                <p className="muted">안내한 사유 · {user.admission?.reason}</p>
              )}
              <Field label={'배정할 반 · ' + user.name}>
                <select
                  value={classes[user.id] || ''}
                  onChange={(e) =>
                    setClasses((current) => ({ ...current, [user.id]: e.target.value }))
                  }
                >
                  <option value="">반을 선택해 주세요</option>
                  {(state.classes || []).map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                className="button primary"
                disabled={busy || !classes[user.id]}
                onClick={() => void decide(user, true)}
              >
                승인하고 반 배정
              </button>
              {user.status === 'PENDING' && (
                <details>
                  <summary>가입 거절</summary>
                  <Field label={'학생에게 안내할 거절 사유 · ' + user.name}>
                    <textarea
                      maxLength={300}
                      value={reasons[user.id] || ''}
                      onChange={(e) =>
                        setReasons((current) => ({ ...current, [user.id]: e.target.value }))
                      }
                      placeholder="학생에게 보이는 내용이에요. 사유를 알려 주세요."
                    />
                  </Field>
                  <button
                    className="button secondary"
                    disabled={busy || !reasons[user.id]?.trim()}
                    onClick={() => void decide(user, false)}
                  >
                    사유를 전달하고 거절
                  </button>
                </details>
              )}
            </article>
          ))}
      </div>
    </section>
  );
}
