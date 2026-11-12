import { useState } from 'react';
import { Clipboard, Plus, ShieldCheck, Users } from 'lucide-react';
import type { AppState } from '../shared/types';
import type {
  Competition,
  CompetitionEntry,
  CompetitionPass,
  SchoolClass,
} from '../shared/competitions';
import { api } from './api';
import { Field } from './components';
import { Button, InlineNotice } from './ui';
import { fromKstInput, kst } from './competition-ui';
export function ClassManager({
  classes,
  state,
  onSaved,
}: {
  classes: SchoolClass[];
  state: AppState;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [selection, setSelection] = useState<Record<string, string[]>>({});
  const students = state.members.filter(
    (member) => member.role === 'STUDENT' && member.status === 'ACTIVE',
  );
  const save = async (classId?: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (classId)
        await api(`/classes/${classId}/members`, 'PATCH', { memberIds: selection[classId] || [] });
      else {
        await api('/classes', 'POST', { name: name.trim() });
        setName('');
      }
      await onSaved();
      setSelection({});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="panel competition-class-manager">
      <summary>
        <Users size={18} />
        &nbsp; 반 구성과 학생 배정
      </summary>
      <p className="competition-note">
        각 학생은 한 반에 소속돼요. 다른 반으로 옮길 때 기존 대회 참가와 제출 상태도 확인해 주세요.
      </p>
      <form
        className="competition-inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="새 반 이름">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
            placeholder="예: AI 서비스 만들기 2반"
          />
        </Field>
        <Button type="submit" busy={busy}>
          <Plus size={16} />반 만들기
        </Button>
      </form>
      {error && (
        <InlineNotice title="반 설정을 저장하지 못했어요" kind="error">
          {error}
        </InlineNotice>
      )}
      {classes.map((schoolClass) => (
        <div className="competition-class-row" key={schoolClass.id}>
          <h3>
            {schoolClass.name}{' '}
            <span className="muted">
              ·{' '}
              {
                schoolClass.memberIds.filter((id) => students.some((student) => student.id === id))
                  .length
              }
              명
            </span>
          </h3>
          <div
            className="competition-check-list"
            role="group"
            aria-label={`${schoolClass.name} 학생 배정`}
          >
            {students
              .filter(
                (student) =>
                  schoolClass.id !== `class-${state.me.schoolId}-default` ||
                  schoolClass.memberIds.includes(student.id),
              )
              .map((student) => {
                const selected =
                  selection[schoolClass.id] ||
                  schoolClass.memberIds.filter((id) =>
                    students.some((student) => student.id === id),
                  );
                const other = classes.find(
                  (c) => c.id !== schoolClass.id && c.memberIds.includes(student.id),
                );
                return (
                  <label className="competition-checkbox" key={student.id}>
                    <input
                      type="checkbox"
                      disabled={schoolClass.id === `class-${state.me.schoolId}-default`}
                      checked={selected.includes(student.id)}
                      onChange={(e) =>
                        setSelection((previous) => ({
                          ...previous,
                          [schoolClass.id]: e.target.checked
                            ? [...selected, student.id]
                            : selected.filter((id) => id !== student.id),
                        }))
                      }
                    />
                    <span>
                      {student.name}
                      {other ? <small className="muted"> · 현재 {other.name}</small> : null}
                    </span>
                  </label>
                );
              })}
            {!students.length && (
              <p className="competition-note">학생이 입학하면 이곳에서 반을 배정할 수 있어요.</p>
            )}
          </div>
          {schoolClass.id === `class-${state.me.schoolId}-default` && (
            <p className="competition-note">
              아직 다른 반에 배정하지 않은 학생이에요. 새 반에서 학생을 선택하면 이동해요. 새 반의
              선택을 해제하면 기본반으로 돌아와요.
            </p>
          )}
          <div className="competition-actions">
            <Button
              type="button"
              disabled={
                schoolClass.id === `class-${state.me.schoolId}-default` ||
                !selection[schoolClass.id]
              }
              busy={busy}
              onClick={() => void save(schoolClass.id)}
            >
              이 반의 학생 배정 저장
            </Button>
          </div>
        </div>
      ))}
    </details>
  );
}
export function JudgePasses({
  competition,
  passes,
  entries,
  onSaved,
}: {
  competition: Competition;
  passes: CompetitionPass[];
  entries: CompetitionEntry[];
  onSaved: () => Promise<void>;
}) {
  const [label, setLabel] = useState(''),
    [key, setKey] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [copied, setCopied] = useState(false);
  const [scope, setScope] = useState<'all' | 'selected'>('all'),
    [entryIds, setEntryIds] = useState<string[]>([]),
    [expiresAt, setExpiresAt] = useState('');
  const link = key
    ? `${location.origin}/competition/${competition.id}#judge=${encodeURIComponent(key)}`
    : '';
  const create = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      const result = await api<{ key: string; pass: CompetitionPass }>(
        `/competitions/${competition.id}/judge-passes`,
        'POST',
        {
          label,
          entryIds: scope === 'selected' ? entryIds : [],
          ...(expiresAt ? { expiresAt: fromKstInput(expiresAt) } : {}),
        },
      );
      setKey(result.key);
      setLabel('');
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel">
      <div className="competition-heading">
        <div>
          <h2>외부 심사자 초대</h2>
          <p className="competition-note">심사자 한 명당 KEY 하나를 발급해 개별 전달해 주세요.</p>
        </div>
        <ShieldCheck size={22} />
      </div>
      {error && (
        <InlineNotice title="심사 KEY를 처리하지 못했어요" kind="error">
          {error}
        </InlineNotice>
      )}
      <form
        className="competition-inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <Field label="심사자 구분 이름 · 내부 관리용">
          <input
            value={label}
            maxLength={80}
            required
            onChange={(e) => setLabel(e.target.value)}
            placeholder="예: 외부 심사위원 A"
          />
        </Field>
        <details className="competition-pass-options">
          <summary>심사 범위와 만료 시간 설정 · 선택</summary>
          <Field label="심사 가능한 작품">
            <select value={scope} onChange={(e) => setScope(e.target.value as 'all' | 'selected')}>
              <option value="all">이 대회의 모든 최종 제출 작품</option>
              <option
                value="selected"
                disabled={!entries.some((entry) => entry.status === 'SUBMITTED')}
              >
                선택한 제출 작품만
              </option>
            </select>
          </Field>
          {scope === 'selected' && (
            <div
              className="competition-check-list"
              role="group"
              aria-label="이 심사자에게 공개할 작품"
            >
              {entries
                .filter((entry) => entry.status === 'SUBMITTED')
                .map((entry) => (
                  <label className="competition-checkbox" key={entry.id}>
                    <input
                      type="checkbox"
                      checked={entryIds.includes(entry.id)}
                      onChange={(e) =>
                        setEntryIds((previous) =>
                          e.target.checked
                            ? [...previous, entry.id]
                            : previous.filter((id) => id !== entry.id),
                        )
                      }
                    />
                    <span>{entry.title}</span>
                  </label>
                ))}
            </div>
          )}
          <Field
            label="심사 연결 만료 시간 · 한국 시간"
            hint="비워 두면 결과 발표 예정일부터 7일 동안 결과를 확인할 수 있어요. 신규 연결과 점수 입력은 심사 종료 시각에 닫혀요."
          >
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </Field>
        </details>
        <Button
          type="submit"
          busy={busy}
          disabled={
            !competition.published ||
            ['JUDGING_CLOSED', 'RESULTS_PUBLISHED', 'ARCHIVED'].includes(competition.state) ||
            (scope === 'selected' && !entryIds.length)
          }
        >
          <Plus size={16} />
          KEY 발급
        </Button>
      </form>
      {key && (
        <div className="competition-pass-secret">
          <strong>지금 한 번만 확인할 수 있는 심사 초대</strong>
          <p className="competition-note">
            이 링크에 심사 KEY가 포함돼요. 신뢰하는 심사자에게만 전달하고 공유 게시판에는 올리지
            마세요. 처음 연결한 브라우저에서만 활성화할 수 있어요.
          </p>
          <code>{link}</code>
          <Button
            type="button"
            onClick={() =>
              void navigator.clipboard
                .writeText(link)
                .then(() => setCopied(true))
                .catch(() =>
                  setError('자동 복사를 할 수 없어요. 위 링크를 선택해 직접 복사해 주세요.'),
                )
            }
          >
            <Clipboard size={16} />
            {copied ? '복사했어요' : '심사 초대 링크 복사'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setKey('')}>
            KEY 표시 닫기
          </Button>
        </div>
      )}
      <ul className="competition-pass-list">
        {passes.map((pass) => (
          <li key={pass.id}>
            <div>
              <strong>{pass.label}</strong>
              <p className="competition-note">
                {pass.revoked ? '취소됨' : pass.usedAt ? '연결 완료' : '아직 연결 전'} · 평가{' '}
                {pass.scoredCount}개<br />
                만료 {kst(pass.expiresAt)}
              </p>
            </div>
            {!pass.revoked && (
              <Button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (
                    !confirm(`${pass.label}의 심사 권한을 취소할까요? 이미 제출한 평가는 보존돼요.`)
                  )
                    return;
                  setBusy(true);
                  void api(`/competitions/${competition.id}/judge-passes/${pass.id}`, 'DELETE')
                    .then(onSaved)
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                권한 취소
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
export function DeadlineExtension({
  competitionId,
  state,
  onSaved,
}: {
  competitionId: string;
  state: AppState;
  onSaved: () => Promise<void>;
}) {
  const [studentId, setStudentId] = useState(''),
    [date, setDate] = useState(''),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <details className="panel competition-class-manager">
      <summary>학생별 제출 기한 연장</summary>
      <p className="competition-note">
        심사 시작 전에만 연장할 수 있어요. 사유와 변경 이력이 기록돼요.
      </p>
      <form
        className="competition-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          void Promise.resolve()
            .then(() =>
              api(`/competitions/${competitionId}/extensions`, 'POST', {
                studentId,
                dueAt: fromKstInput(date),
                reason,
              }),
            )
            .then(onSaved)
            .then(() => {
              setReason('');
            })
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <div className="competition-form-grid">
          <Field label="연장할 학생">
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
              <option value="">학생 선택</option>
              {state.members
                .filter((member) => member.role === 'STUDENT' && member.status === 'ACTIVE')
                .map((student) => (
                  <option value={student.id} key={student.id}>
                    {student.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="새 제출 기한 · 한국 시간">
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </Field>
        </div>
        <Field label="연장 사유">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            maxLength={500}
          />
        </Field>
        {error && (
          <InlineNotice title="기한을 연장하지 못했어요" kind="error">
            {error}
          </InlineNotice>
        )}
        <Button type="submit" busy={busy}>
          제출 기한 연장
        </Button>
      </form>
    </details>
  );
}
