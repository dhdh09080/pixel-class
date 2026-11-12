import { useRef, useState } from 'react';
import type { AppState } from '../shared/types';
import type { Competition, SchoolClass } from '../shared/competitions';
import { api } from './api';
import { Field, Modal } from './components';
import { Button, InlineNotice } from './ui';
import { fromKstInput, toKstInput } from './competition-ui';
export function CompetitionEditor({
  competition,
  classes,
  state,
  participantsLocked = false,
  onClose,
  onSaved,
}: {
  competition?: Competition;
  classes: SchoolClass[];
  state: AppState;
  participantsLocked?: boolean;
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(competition?.name || ''),
    [description, setDescription] = useState(competition?.description || '');
  const [classId, setClassId] = useState(competition?.classId || classes[0]?.id || '');
  const [dates, setDates] = useState(() =>
    Object.fromEntries(
      ['opensAt', 'submissionDueAt', 'judgingStartsAt', 'judgingEndsAt', 'resultsAt'].map((key) => [
        key,
        toKstInput(competition?.[key as 'opensAt']),
      ]),
    ),
  );
  const [participants, setParticipants] = useState(
      competition?.participantIds ||
        classes[0]?.memberIds.filter((id) =>
          state.members.some(
            (member) => member.id === id && member.role === 'STUDENT' && member.status === 'ACTIVE',
          ),
        ) ||
        [],
    ),
    [visibility, setVisibility] = useState(competition?.visibility || 'JUDGES'),
    [realNames, setRealNames] = useState(competition?.allowRealNames || false);
  const [awards, setAwards] = useState(
      competition?.awardNames.join('\n') || '최우수상\n우수상\n아이디어상',
    ),
    [minJudges, setMinJudges] = useState(competition?.minJudges || 1);
  const [fileTypes, setFileTypes] = useState(
    competition?.allowedFileTypes || ['pdf', 'png', 'jpg', 'txt', 'html', 'zip'],
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const sending = useRef(false);
  const students = state.members.filter(
    (member) =>
      member.role === 'STUDENT' &&
      member.status === 'ACTIVE' &&
      classes.find((c) => c.id === classId)?.memberIds.includes(member.id),
  );
  const eligibleIds = new Set(students.map((student) => student.id));
  const unavailableIds = participants.filter((id) => !eligibleIds.has(id));
  const retainedIds = participantsLocked ? competition?.participantIds || [] : [];
  const save = async () => {
    if (sending.current) return;
    if (unavailableIds.length) {
      setError('현재 반의 재학생이 아닌 참가자가 있어요. 아래 참가 명단 안내를 확인해 주세요.');
      return;
    }
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const times = Object.fromEntries(
        Object.entries(dates).map(([key, value]) => [key, fromKstInput(value)]),
      );
      const result = await api<Competition>(
        competition ? `/competitions/${competition.id}` : '/competitions',
        competition ? 'PATCH' : 'POST',
        {
          name,
          description,
          classId,
          ...times,
          participantIds: participants,
          visibility,
          allowRealNames: realNames,
          awardNames: awards
            .split('\n')
            .map((v) => v.trim())
            .filter(Boolean),
          minJudges,
          allowedFileTypes: fileTypes,
          judgingMethod: 'KEY_AVERAGE',
          ...(competition ? { revision: competition.revision } : {}),
        },
      );
      await onSaved(result.id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      sending.current = false;
    }
  };
  return (
    <Modal
      title={competition ? '경진대회 설정 수정' : '새 경진대회 만들기'}
      subtitle="반별 작품을 모아 소개하고, 초대된 심사자와 함께 평가해요."
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <form
        className="competition-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {error && (
          <InlineNotice title="설정을 저장하지 못했어요" kind="error">
            {error}
          </InlineNotice>
        )}
        <Field label="대회 이름">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            placeholder="예: 우리 반 AI 서비스 쇼케이스"
          />
        </Field>
        <Field label="대회 소개와 참가 안내">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={6000}
            rows={3}
            required
          />
        </Field>
        <Field label="참가 반">
          <select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setParticipants(
                classes
                  .find((c) => c.id === e.target.value)
                  ?.memberIds.filter((id) =>
                    state.members.some(
                      (member) =>
                        member.id === id && member.role === 'STUDENT' && member.status === 'ACTIVE',
                    ),
                  ) || [],
              );
            }}
            required
            disabled={!!competition}
          >
            {classes.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <fieldset>
          <legend>일정 · 한국 시간(KST)</legend>
          <div className="competition-form-grid">
            {[
              ['opensAt', '작품 접수 시작'],
              ['submissionDueAt', '작품 제출 마감'],
              ['judgingStartsAt', '심사 시작'],
              ['judgingEndsAt', '심사 종료'],
              ['resultsAt', '결과 발표 예정'],
            ].map(([key, label]) => (
              <Field label={label} key={key}>
                <input
                  type="datetime-local"
                  required
                  value={dates[key]}
                  onChange={(e) => setDates((previous) => ({ ...previous, [key]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
          <p className="competition-note">
            접수 시작 → 제출 마감 → 심사 시작 → 심사 종료 → 발표 순서로 설정해 주세요. 시간은
            서버에서 검증해요. 결과는 자동 공개되지 않아요.
          </p>
        </fieldset>
        <fieldset>
          <legend>참가 학생 · {participants.length}명 선택</legend>
          {unavailableIds.length > 0 && (
            <InlineNotice title="참가 명단을 확인해 주세요" kind="error">
              <p>
                다른 반으로 이동했거나 현재 재학생이 아닌 참가자가 남아 있어요:{' '}
                {unavailableIds
                  .map(
                    (id) =>
                      state.members.find((member) => member.id === id)?.name || '기존 참가 학생',
                  )
                  .join(', ')}
              </p>
              {participantsLocked ? (
                <p>
                  출품 이력이 있는 대회는 기존 참가자를 제외할 수 없어요. 해당 학생을 원래 반으로
                  돌리거나 대회를 보관한 뒤 새 대회를 준비해 주세요. 제출 기록은 보존돼요.
                </p>
              ) : (
                <Button
                  type="button"
                  onClick={() =>
                    setParticipants((previous) => previous.filter((id) => eligibleIds.has(id)))
                  }
                >
                  현재 반 참가 명단으로 정리
                </Button>
              )}
            </InlineNotice>
          )}
          <div className="competition-actions">
            <Button
              type="button"
              onClick={() =>
                setParticipants([...new Set([...retainedIds, ...students.map((s) => s.id)])])
              }
            >
              이 반 전체 선택
            </Button>
            <Button type="button" onClick={() => setParticipants(retainedIds)}>
              선택 해제
            </Button>
          </div>
          <div className="competition-check-list">
            {students.map((student) => (
              <label className="competition-checkbox" key={student.id}>
                <input
                  type="checkbox"
                  checked={participants.includes(student.id)}
                  disabled={retainedIds.includes(student.id)}
                  title={
                    retainedIds.includes(student.id)
                      ? '출품 이력이 있는 대회의 기존 참가자는 유지해요.'
                      : undefined
                  }
                  onChange={(e) =>
                    setParticipants((previous) =>
                      e.target.checked
                        ? [...previous, student.id]
                        : previous.filter((id) => id !== student.id),
                    )
                  }
                />
                <span>{student.name}</span>
              </label>
            ))}
            {!students.length && (
              <p className="competition-note">먼저 반 구성에서 학생을 배정해 주세요.</p>
            )}
          </div>
          {participantsLocked && (
            <p className="competition-note">
              출품 이력이 있어 기존 참가자를 유지해요. 현재 반의 재학생을 추가로 선택할 수 있어요.
            </p>
          )}
        </fieldset>
        <fieldset>
          <legend>공개 범위와 심사</legend>
          <div className="competition-form-grid">
            <Field label="작품 공개 범위">
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as 'JUDGES' | 'PUBLIC')}
              >
                <option value="JUDGES">초대된 KEY 심사자만</option>
                <option value="PUBLIC">링크를 아는 모든 방문자</option>
              </select>
            </Field>
            <Field label="순위에 필요한 작품별 최소 심사 수">
              <input
                type="number"
                min="1"
                max="100"
                required
                value={minJudges}
                onChange={(e) => setMinJudges(Number(e.target.value))}
              />
            </Field>
          </div>
          <label className="competition-checkbox">
            <input
              type="checkbox"
              checked={realNames}
              onChange={(e) => setRealNames(e.target.checked)}
            />
            <span>
              학생 이름 공개 허용{' '}
              <small className="muted">· 기본은 학생이 정한 작품 표시 이름이에요.</small>
            </span>
          </label>
          <p className="competition-note">
            어느 범위든 학생의 명시적인 공개 동의가 필요해요. 공식 점수는 KEY 심사의 항목별 평균으로
            집계해요.
          </p>
        </fieldset>
        <div className="competition-form-grid">
          <Field label="시상 이름 · 위에서부터 순위 순서">
            <textarea
              value={awards}
              onChange={(e) => setAwards(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="한 줄에 하나씩 입력해 주세요."
            />
          </Field>
          <fieldset>
            <legend>허용할 결과물 파일</legend>
            <div className="competition-check-list">
              {['pdf', 'png', 'jpg', 'txt', 'html', 'zip'].map((type) => (
                <label key={type} className="competition-checkbox">
                  <input
                    type="checkbox"
                    checked={fileTypes.includes(type)}
                    onChange={(e) =>
                      setFileTypes((previous) =>
                        e.target.checked ? [...previous, type] : previous.filter((v) => v !== type),
                      )
                    }
                  />
                  <span>{type.toUpperCase()}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="form-actions">
          <Button type="button" disabled={busy} onClick={onClose}>
            취소
          </Button>
          <Button
            type="submit"
            variant="primary"
            busy={busy}
            disabled={!classId || !participants.length || unavailableIds.length > 0}
          >
            {competition ? '설정 저장' : '준비 상태로 만들기'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
