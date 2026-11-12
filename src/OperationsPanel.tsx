import { useCallback, useEffect, useRef, useState } from 'react';
import type { OperationsStatus } from '../shared/operations';
import { api } from './api';
const mb = (value: number) => (value / 1024 / 1024).toFixed(1);
const time = (value: string | null) =>
  value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '아직 없음';
const labels = {
  missing: '아직 백업 없음',
  unverified: '무결성 확인 필요',
  verified: '마지막 무결성 검사 통과',
  stale: '백업 생성 또는 검증 후 12시간 이상 지남',
};
export function OperationsPanel({ onToast }: { onToast: (text: string) => void }) {
  const [status, setStatus] = useState<OperationsStatus>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  const sequence = useRef(0),
    alive = useRef(true);
  const refresh = useCallback(async () => {
    const id = ++sequence.current;
    try {
      const result = await api<OperationsStatus>('/operations');
      if (alive.current && id === sequence.current) {
        setStatus(result);
        setError('');
      }
    } catch (e) {
      if (alive.current && id === sequence.current) setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
      sequence.current++;
    };
  }, [refresh]);
  async function run(action: 'backup' | 'backup/verify') {
    if (busy) return;
    ++sequence.current;
    setBusy(action);
    setError('');
    try {
      const result = await api<OperationsStatus>('/operations/' + action, 'POST');
      if (alive.current) {
        setStatus(result);
        onToast(
          action === 'backup'
            ? '검증된 서버 백업을 만들었어요.'
            : '백업 파일의 해시와 DB 무결성을 확인했어요.',
        );
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy('');
    }
  }
  return (
    <section className="panel operations-panel" aria-label="학교 운영 상태">
      <div className="competition-heading">
        <h2>학교 운영 상태</h2>
        <button
          type="button"
          className="button secondary"
          onClick={() => void refresh()}
          disabled={!!busy}
        >
          상태 새로고침
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!status && !error && <p role="status">운영 상태를 확인하고 있어요…</p>}
      {status && (
        <>
          <div className="operations-grid">
            <section>
              <h3>서버와 연결</h3>
              <p>마지막 API 응답 정상 · SQLite · 단일 인스턴스</p>
              <p className="muted">관측 시각: {time(status.observedAt)}</p>
              <p className="muted">
                이 화면의 API 응답을 확인했어요. 외부 WSS 연결 검증과는 별개예요.
              </p>
              <dl>
                <dt>서버 가동</dt>
                <dd>{Math.floor(status.runtime.uptimeSeconds / 60)}분</dd>
                <dt>현재 메모리</dt>
                <dd>{mb(status.runtime.rssBytes)} MB</dd>
                <dt>DB / 임시 WAL</dt>
                <dd>
                  {mb(status.runtime.databaseBytes)} / {mb(status.runtime.walBytes)} MB
                </dd>
              </dl>
              <p className="muted">
                메모리는 서버 전체의 현재 관측값이며 청구액이나 월 비용 예측이 아니에요.
              </p>
            </section>
            <section>
              <h3>AI 사용 관리</h3>
              <p>
                {!status.ai.enabled
                  ? 'AI 사용 꺼짐'
                  : status.ai.configured
                    ? 'AI 연결 설정 있음'
                    : 'AI 키·모델 연결 필요'}
              </p>
              <p>
                오늘 학교 사용 {status.ai.usedToday} / {status.ai.dailyLimit}회
              </p>
              <p className="muted">
                날짜는 UTC 기준 · 동시 {status.ai.maxConcurrent}회. 횟수 제한은 금액 상한이 아니며
                실제 응답 성공을 뜻하지 않아요.
              </p>
            </section>
          </div>
          <hr />
          <h3>학교 저장 공간과 백업</h3>
          <p>
            첨부파일 {mb(status.usedBytes)} / {mb(status.limitBytes)} MB
          </p>
          <progress
            max={status.limitBytes}
            value={status.usedBytes}
            aria-label="학교 첨부파일 저장 공간"
          />
          {status.usedBytes > status.limitBytes * 0.8 && (
            <p role="alert">
              저장 공간의 80% 이상을 사용했어요. 자료를 별도 보관한 뒤 필요한 파일만 정리해 주세요.
            </p>
          )}
          <p>최근 서버 백업: {time(status.backupAt)}</p>
          <p role="status">
            {labels[status.backup.state]} · {mb(status.backup.sizeBytes)} MB
          </p>
          <p className="muted">마지막 검증: {time(status.backup.verifiedAt)}</p>
          {status.backup.lastFailure && <p role="alert">{status.backup.lastFailure}</p>}
          {status.backup.sha256 && (
            <details>
              <summary>백업 SHA-256 확인</summary>
              <code className="backup-checksum">{status.backup.sha256}</code>
              <p className="muted">
                이 해시는 서버 전체 백업용이에요. 학교별 다운로드는 다른 파일이므로 응답의
                X-Backup-SHA256을 사용해요.
              </p>
            </details>
          )}
          {status.lastExport && (
            <details>
              <summary>최근 학교별 다운로드 검증 정보</summary>
              <p>
                {status.lastExport.fileName} · {time(status.lastExport.preparedAt)}
              </p>
              <code className="backup-checksum">{status.lastExport.sha256}</code>
              <p className="muted">
                서버가 마지막으로 준비한 파일의 해시예요. PC 저장이나 별도 보관이 완료됐다는 뜻은
                아니에요. 다운로드 뒤 상태 새로고침으로 확인해 주세요.
              </p>
              <code className="backup-checksum">
                npm run db:verify -- &quot;내려받은파일.sqlite&quot; --sha256{' '}
                {status.lastExport.sha256}
              </code>
            </details>
          )}
          <div className="operations-backup-note">
            <strong>같은 Volume에 저장 · 별도 보관 확인 안 됨</strong>
            <p>
              서버 시작 시와 6시간마다 백업 한 개를 보관해요. Volume 장애나 만료 시 백업도 함께 잃을
              수 있어요. 학교 백업을 내려받아 회사에서 허용한 별도 저장소에 보관해 주세요. 다운로드
              준비만으로 별도 보관 완료로 표시하지 않아요.
            </p>
          </div>
          <div className="form-actions operations-actions">
            <button
              className="button secondary"
              type="button"
              disabled={!!busy}
              onClick={() => void run('backup')}
            >
              {busy === 'backup' ? '백업 생성·검증 중…' : '지금 서버 백업'}
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={!!busy || status.backup.state === 'missing'}
              onClick={() => void run('backup/verify')}
            >
              {busy === 'backup/verify' ? '무결성 확인 중…' : '백업 무결성 다시 확인'}
            </button>
            <a className="button primary" href="/api/operations/backup" download>
              학교 백업 내려받기
            </a>
          </div>
        </>
      )}
    </section>
  );
}
