import { useCallback, useEffect, useRef, useState } from 'react';
import type { Appearance, Membership } from '../shared/types';
import { Auth, type Config } from './Auth';
import { Avatar } from './components';
import { api, ApiError } from './api';
import { InlineNotice } from './ui';

type EnrollmentSession = {
  id: string;
  name: string;
  appearance: Appearance;
  status: Membership;
  schoolName: string;
  className?: string;
  requestedAt?: string;
  reason?: string;
};
export default function Enrollment() {
  const [config, setConfig] = useState<Config | null>(null);
  const [session, setSession] = useState<EnrollmentSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const sequence = useRef(0),
    mounted = useRef(true),
    actionBusy = useRef(false);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const next = await api<EnrollmentSession>('/enrollment/session');
      if (mounted.current && sequence.current === current) {
        setSession(next);
        setError('');
      }
    } catch (e) {
      if (!mounted.current || sequence.current !== current) return;
      if (e instanceof ApiError && e.status === 401) setSession(null);
      else setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void api<Config>('/enrollment/config')
      .then(async (next) => {
        if (!mounted.current) return;
        setConfig(next);
        await load();
      })
      .catch((e) => {
        if (mounted.current) setError(e.message);
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    return () => {
      mounted.current = false;
      sequence.current++;
    };
  }, [load]);
  useEffect(() => {
    if (!session || !['PENDING', 'REJECTED'].includes(session.status)) return;
    const refresh = () => {
      if (!document.hidden) void load();
    };
    const timer = setInterval(refresh, 15000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [session?.status, load]);
  async function act(action: 'refresh' | 'enter' | 'logout') {
    if (actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    setError('');
    try {
      if (action === 'refresh') await load();
      else if (action === 'enter') {
        await api('/enrollment/enter', 'POST');
        location.assign('/');
      } else {
        await api('/enrollment/logout', 'POST');
        sequence.current++;
        setSession(null);
        history.replaceState(null, '', '/join?login=1');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      actionBusy.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  if (loading)
    return (
      <main className="initial-loading" role="status">
        학교를 불러오고 있어요…
      </main>
    );
  if (!config)
    return (
      <main className="enrollment-page">
        <InlineNotice kind="error" title="학교에 연결하지 못했어요">
          {error}
        </InlineNotice>
        <button className="button primary" onClick={() => location.reload()}>
          다시 시도하기
        </button>
      </main>
    );
  if (!session)
    return (
      <main className="enrollment-entry">
        {error && (
          <InlineNotice kind="error" title="다시 확인해 주세요">
            {error}
          </InlineNotice>
        )}
        {notice && (
          <InlineNotice kind="info" title="계정 안내">
            {notice}
          </InlineNotice>
        )}
        {config.acceptingApplications === false && (
          <InlineNotice title="학교를 준비하고 있어요">
            가입 신청은 선생님이 학교를 개설한 뒤 가능해요.
          </InlineNotice>
        )}
        <Auth config={config} onSuccess={() => void load()} onToast={setNotice} />
        <footer className="enrollment-footer">
          <a href="/admin-entry">MASTER 학교 설정</a>
        </footer>
      </main>
    );
  const pending = session.status === 'PENDING',
    rejected = session.status === 'REJECTED',
    blocked = session.status === 'REVOKED';
  return (
    <main className="enrollment-page">
      <section className="enrollment-card">
        <p className="eyebrow">{session.schoolName}</p>
        <Avatar appearance={session.appearance} size={160} />
        <span className="enrollment-badge">
          {pending
            ? '승인 대기'
            : rejected
              ? '가입 거절'
              : blocked
                ? '접근 권한 회수'
                : session.className || '학교 계정'}
        </span>
        <h1>
          {pending
            ? '가입 신청을 보냈어요'
            : rejected
              ? '선생님의 안내를 확인해 주세요'
              : blocked
                ? '선생님에게 문의해 주세요'
                : session.name + '님, 환영해요'}
        </h1>
        <p>
          {pending
            ? '선생님이 가입을 승인하고 반을 배정하면 교실에 입장할 수 있어요. 이 화면은 15초마다 승인 상태를 확인해요.'
            : rejected
              ? session.reason || '가입 승인이 보류되었어요. 선생님에게 문의해 주세요.'
              : blocked
                ? '학교 접근 권한이 회수되었습니다.'
                : session.className
                  ? '내 반 · ' + session.className
                  : '기존 계정으로 학교에 접속할 수 있어요.'}
        </p>
        <p className="muted">
          {session.name}님의 계정과 캐릭터는 저장되어 있어요. 나중에 같은 계정으로 로그인해도 신청
          상태를 확인할 수 있어요.
        </p>
        {error && (
          <InlineNotice kind="error" title="다시 확인해 주세요">
            {error}
          </InlineNotice>
        )}
        <div className="enrollment-actions">
          {!pending && !rejected && !blocked ? (
            <button className="button primary" disabled={busy} onClick={() => void act('enter')}>
              교실 입장하기
            </button>
          ) : (
            <button className="button primary" disabled={busy} onClick={() => void act('refresh')}>
              승인 상태 새로고침
            </button>
          )}
          <button className="button secondary" disabled={busy} onClick={() => void act('logout')}>
            로그아웃
          </button>
        </div>
      </section>
    </main>
  );
}
