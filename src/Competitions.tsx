import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Archive,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  FileCode2,
  Flag,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react';
import type { AppState } from '../shared/types';
import type {
  Competition,
  CompetitionDetailResponse,
  CompetitionEntry,
  CompetitionListResponse,
  CompetitionPass,
  SchoolClass,
} from '../shared/competitions';
import { api } from './api';
import { Field, Modal } from './components';
import { Button, InlineNotice, SegmentedControl } from './ui';
import { CompetitionResults } from './PublicCompetition';
import {
  CompetitionSchedule,
  IntroductionPreview,
  PhaseBadge,
  ServiceLink,
  emptyIntro,
  fromKstInput,
  introFields,
  kst,
  readCompetitionFile,
  toKstInput,
  type IntroValues,
  type UploadValue,
} from './competition-ui';

type Props = { state: AppState; onToast: (text: string) => void; onRefresh: () => Promise<void> };
const blankList: CompetitionListResponse = {
  classes: [],
  competitions: [],
  activeClassId: '',
  serverNow: '',
};
function ClassManager({
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
function CompetitionEditor({
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
function SubmissionEditor({
  competition,
  entry,
  state,
  onSaved,
  onClose,
}: {
  competition: Competition;
  entry: CompetitionEntry | null;
  state: AppState;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const projects = state.projects.filter((project) => project.ownerId === state.me.id);
  const [projectId, setProjectId] = useState(entry?.projectId || projects[0]?.id || ''),
    [title, setTitle] = useState(entry?.title || projects[0]?.title || '');
  const [displayName, setDisplayName] = useState(entry?.displayName || ''),
    [serviceUrl, setServiceUrl] = useState(entry?.serviceUrl || ''),
    [consent, setConsent] = useState(false);
  const [intro, setIntro] = useState<IntroValues>(entry?.intro || emptyIntro()),
    [mode, setMode] = useState<'template' | 'html'>(entry?.introFile ? 'html' : 'template');
  const [introFile, setIntroFile] = useState<UploadValue>(),
    [artifact, setArtifact] = useState<UploadValue>();
  const [busy, setBusy] = useState(false),
    [reading, setReading] = useState(false),
    [error, setError] = useState('');
  const sending = useRef(false),
    submitMode = useRef(true);
  const chooseFile = async (file: File | undefined, isIntro = false) => {
    if (!file) return;
    setError('');
    setReading(true);
    try {
      const value = await readCompetitionFile(file, isIntro);
      if (isIntro) setIntroFile(value);
      else setArtifact(value);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
    }
  };
  const save = async () => {
    if (sending.current || reading) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      if (mode === 'html' && !introFile && !entry?.introFile)
        throw new Error('소개서 HTML 파일을 선택하거나 템플릿 작성을 이용해 주세요.');
      await api(`/competitions/${competition.id}/entry`, 'PUT', {
        projectId,
        title,
        displayName,
        serviceUrl,
        consentPublic: consent,
        ...(mode === 'template' ? { intro } : {}),
        ...(mode === 'html' && introFile ? { introFile } : {}),
        ...(artifact ? { artifact } : {}),
        ...(entry ? { expectedRevision: entry.revision } : {}),
        submit: submitMode.current,
      });
      await onSaved();
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
      title={entry ? '내 출품작 수정하기' : '경진대회에 작품 제출하기'}
      subtitle={`${competition.name} · 제출 마감 ${kst(competition.submissionDueAt)}`}
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
        <p className="competition-privacy-note">
          내부 개발 기록이나 선생님 피드백은 공개되지 않아요. 이 양식의 소개서, 결과물 링크·파일과
          작품 표시 이름을{' '}
          {competition.visibility === 'PUBLIC' ? '링크를 아는 모든 방문자' : '초대된 심사자'}가 볼
          수 있어요.
        </p>
        {error && (
          <InlineNotice title="작품을 저장하지 못했어요" kind="error">
            {error}
          </InlineNotice>
        )}
        <Field label="출품할 내 프로젝트">
          <select
            value={projectId}
            required
            onChange={(e) => {
              setProjectId(e.target.value);
              const project = projects.find((p) => p.id === e.target.value);
              if (project) {
                setTitle(project.title);
                setServiceUrl(project.serviceUrl || '');
              }
            }}
          >
            <option value="">프로젝트를 선택해 주세요</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </Field>
        {!projects.length && (
          <InlineNotice title="먼저 내 프로젝트를 만들어 주세요">
            프로젝트 화면에서 서비스를 등록하면 출품할 수 있어요.
          </InlineNotice>
        )}
        <div className="competition-form-grid">
          <Field label="공개할 작품 이름">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              required
            />
          </Field>
          <Field
            label="작품 표시 이름"
            hint={
              competition.allowRealNames
                ? '이 대회는 제출할 때의 실제 이름을 작품 표시 이름으로 공개해요.'
                : '실제 이름 대신 별명이나 팀 이름을 사용해 주세요.'
            }
          >
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={40}
              placeholder="예: 초록빛 메이커"
              required
            />
          </Field>
        </div>
        <Field
          label="서비스 결과물 주소"
          hint="직접 만든 서비스의 http 또는 https 주소예요. 주소 대신 아래에 결과물 파일을 첨부할 수도 있어요."
        >
          <input
            type="url"
            value={serviceUrl}
            onChange={(e) => setServiceUrl(e.target.value)}
            maxLength={2000}
            placeholder="https://my-service.example"
          />
        </Field>
        <div className="competition-upload">
          <Field
            label="결과물 파일 · 선택"
            hint={`허용 형식: ${competition.allowedFileTypes.join(', ')} · 최대 5MB`}
          >
            <input
              type="file"
              accept={competition.allowedFileTypes.map((type) => `.${type}`).join(',')}
              onChange={(e) => void chooseFile(e.target.files?.[0])}
              disabled={busy || reading}
            />
          </Field>
          {(artifact || entry?.artifact) && (
            <p className="competition-note">
              첨부: {artifact?.fileName || entry?.artifact?.fileName}
            </p>
          )}
        </div>
        <fieldset>
          <legend>서비스 소개서</legend>
          <SegmentedControl
            value={mode}
            onChange={setMode}
            label="소개서 작성 방식"
            options={[
              { value: 'template', label: '쉬운 템플릿 작성' },
              { value: 'html', label: 'HTML 파일 업로드' },
            ]}
          />
          {mode === 'template' ? (
            <div className="competition-form">
              {introFields.map(([key, label], index) => (
                <Field label={label} key={key}>
                  <textarea
                    value={intro[key]}
                    onChange={(e) =>
                      setIntro((previous) => ({ ...previous, [key]: e.target.value }))
                    }
                    required={['serviceName', 'purpose', 'features', 'usage'].includes(key)}
                    maxLength={4000}
                    rows={index < 2 ? 2 : 3}
                  />
                </Field>
              ))}
            </div>
          ) : (
            <div className="competition-upload">
              <Field
                label="소개서 HTML 파일"
                hint="스크립트와 외부 연결은 미리보기에서 제거돼요. 원본은 별도 다운로드로 제공돼요."
              >
                <input
                  type="file"
                  accept=".html,text/html"
                  onChange={(e) => void chooseFile(e.target.files?.[0], true)}
                  disabled={busy || reading}
                />
              </Field>
              {(introFile || entry?.introFile) && (
                <p className="competition-note">
                  선택: {introFile?.fileName || entry?.introFile?.fileName}
                </p>
              )}
            </div>
          )}
        </fieldset>
        <label className="competition-checkbox">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            공개할 내용을 확인했으며, 소개서·결과물 링크와 첨부파일이{' '}
            {competition.visibility === 'PUBLIC'
              ? '대회 공개 페이지 방문자에게'
              : 'KEY로 초대된 심사자에게'}{' '}
            제공되는 것에 동의해요. 다시 제출할 때에도 공개 범위를 확인해요. 개인정보와 비밀키를
            포함하지 않았어요.
          </span>
        </label>
        <p className="competition-note">
          제출 시점의 프로젝트 정보를 별도로 보관해요. 심사가 시작되면 출품작은 수정할 수 없어요.
          임시 저장은 출품 완료가 아니에요.
        </p>
        <div className="form-actions">
          <Button type="button" disabled={busy} onClick={onClose}>
            취소
          </Button>
          <Button
            type="submit"
            formNoValidate
            disabled={!projectId || reading}
            busy={busy}
            onClick={() => {
              submitMode.current = false;
            }}
          >
            임시 저장
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!projectId || !consent || reading}
            busy={busy}
            onClick={() => {
              submitMode.current = true;
            }}
          >
            {entry?.status === 'SUBMITTED' ? '출품작 다시 제출' : '작품 제출하기'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function JudgePasses({
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
function DeadlineExtension({
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
export function CompetitionsPage({ state, onToast, onRefresh }: Props) {
  const [list, setList] = useState<CompetitionListResponse>(blankList),
    [detail, setDetail] = useState<CompetitionDetailResponse | null>(null),
    [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [archive, setArchive] = useState<'current' | 'archived'>('current');
  const [editing, setEditing] = useState<Competition | 'new' | null>(null),
    [submissionOpen, setSubmissionOpen] = useState(false),
    [preview, setPreview] = useState<CompetitionEntry | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null),
    [actionReason, setActionReason] = useState(''),
    [actionBusy, setActionBusy] = useState(false);
  const request = useRef(0),
    mounted = useRef(true);
  const teacher = state.me.role === 'MASTER';
  const load = useCallback(async (id = '') => {
    const sequence = ++request.current;
    const [nextList, nextDetail] = await Promise.all([
      api<CompetitionListResponse>('/competitions'),
      id
        ? api<CompetitionDetailResponse>(`/competitions/${encodeURIComponent(id)}`)
        : Promise.resolve(null),
    ]);
    if (mounted.current && sequence === request.current) {
      setList(nextList);
      setDetail(nextDetail);
      setError('');
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current++;
    };
  }, []);
  useEffect(() => {
    setLoading(true);
    void load(selectedId).catch((e) => {
      if (mounted.current) {
        setError(e.message);
        setLoading(false);
      }
    });
  }, [selectedId, load, state]);
  useEffect(() => {
    const update = () => {
      if (!document.hidden) void load(selectedId).catch(() => {});
    };
    const timer = setInterval(update, 60000);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, [load, selectedId]);
  const refresh = async () => {
    await load(selectedId);
    await onRefresh();
  };
  const action = async () => {
    if (!detail || !pendingAction || actionBusy) return;
    setActionBusy(true);
    setError('');
    try {
      await api(`/competitions/${detail.competition.id}/action`, 'POST', {
        action: pendingAction,
        reason: actionReason,
      });
      await refresh();
      setPendingAction(null);
      setActionReason('');
      onToast('대회 운영 상태를 저장했어요.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionBusy(false);
    }
  };
  const competition = detail?.competition;
  const myEntry = detail?.myEntry;
  const extension = detail?.extensions?.find((item) => item.studentId === state.me.id);
  const editable =
    competition &&
    detail &&
    ['SUBMISSION_OPEN', 'SUBMISSION_CLOSED'].includes(competition.state) &&
    Date.parse(detail.serverNow) < Date.parse(extension?.dueAt || competition.submissionDueAt) &&
    Date.parse(detail.serverNow) < Date.parse(competition.judgingStartsAt);
  const visibleContests = list.competitions.filter((item) =>
    archive === 'archived' ? item.archived : !item.archived,
  );
  const actionLabels: Record<string, string> = {
    publish: '대회 공개하기',
    unpublish: '접수 취소하고 준비 상태로',
    archive: '대회 보관하기',
    publishResults: '결과 공개하기',
    retractResults: '결과 공개 철회',
  };
  return (
    <section className="competition-page">
      <div className="page-section-title">
        <div>
          <p className="eyebrow">CLASSROOM SHOWCASE</p>
          <h1>{competition ? competition.name : '우리 반 AI 경진대회'}</h1>
          <p className="muted">
            {teacher
              ? '학생의 첫 서비스를 함께 살펴보고, 다음 가능성을 발견해요.'
              : '내가 만든 AI 서비스를 소개하고 함께 성장해요.'}
          </p>
        </div>
        <div className="competition-actions">
          {selectedId && (
            <Button
              type="button"
              onClick={() => {
                setSelectedId('');
                setDetail(null);
              }}
            >
              <ArrowLeft size={16} />
              대회 목록
            </Button>
          )}
          {teacher && (
            <Button
              type="button"
              variant="primary"
              onClick={() => setEditing('new')}
              disabled={!list.classes.length}
            >
              <Plus size={16} />
              대회 만들기
            </Button>
          )}
        </div>
      </div>
      {error && (
        <InlineNotice title="경진대회를 확인하지 못했어요" kind="error">
          {error}
          <div className="competition-actions">
            <Button
              type="button"
              onClick={() => void load(selectedId).catch((e) => setError(e.message))}
            >
              <RefreshCw size={16} />
              다시 불러오기
            </Button>
          </div>
        </InlineNotice>
      )}
      {!selectedId ? (
        <>
          {teacher && <ClassManager classes={list.classes} state={state} onSaved={refresh} />}
          <div className="competition-toolbar">
            <SegmentedControl
              label="대회 목록"
              value={archive}
              onChange={setArchive}
              options={[
                { value: 'current', label: '진행 대회' },
                { value: 'archived', label: '보관한 대회' },
              ]}
            />
            {teacher && (
              <Field label="교실에서 볼 반">
                <select
                  value={list.activeClassId}
                  onChange={(e) =>
                    void api('/competition-classroom', 'PATCH', { classId: e.target.value })
                      .then(refresh)
                      .then(() => onToast('교실의 대회 안내를 변경했어요.'))
                      .catch((e) => setError(e.message))
                  }
                >
                  {list.classes.map((schoolClass) => (
                    <option value={schoolClass.id} key={schoolClass.id}>
                      {schoolClass.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          {loading ? (
            <div className="competition-empty" role="status">
              우리 반 경진대회를 불러오고 있어요…
            </div>
          ) : !visibleContests.length ? (
            <div className="competition-empty">
              <Trophy size={36} />
              <h2>
                {archive === 'archived'
                  ? '보관한 대회가 없어요'
                  : teacher
                    ? '우리 반의 첫 쇼케이스를 열어 보세요'
                    : '아직 참가할 경진대회가 없어요'}
              </h2>
              <p>
                {teacher
                  ? '반과 참가 학생을 확인하고, 대회를 준비 상태로 만든 뒤 공개해 주세요.'
                  : '선생님이 대회를 열면 일정과 출품 안내를 여기에서 확인할 수 있어요.'}
              </p>
              {teacher && archive === 'current' && (
                <Button
                  type="button"
                  onClick={() => setEditing('new')}
                  disabled={!list.classes.length}
                >
                  첫 대회 준비하기
                </Button>
              )}
            </div>
          ) : (
            <div className="competition-cards">
              {visibleContests.map((item) => (
                <article className="competition-card" key={item.id}>
                  <div className="competition-card-top">
                    <span className="competition-card-icon">
                      <Trophy size={22} />
                    </span>
                    <PhaseBadge state={item.state} />
                  </div>
                  <div className="competition-card-meta">
                    <Users size={15} />
                    {list.classes.find((c) => c.id === item.classId)?.name || '나의 반'}
                  </div>
                  <h2>{item.name}</h2>
                  <p>{item.description.slice(0, 150)}</p>
                  <p className="competition-note">제출 마감 · {kst(item.submissionDueAt)}</p>
                  <Button
                    type="button"
                    onClick={() => {
                      setSelectedId(item.id);
                      setDetail(null);
                    }}
                  >
                    대회 자세히 보기
                  </Button>
                </article>
              ))}
            </div>
          )}
        </>
      ) : !competition || !detail ? (
        <div className="competition-empty" role="status">
          대회 안내를 불러오고 있어요…
        </div>
      ) : (
        <>
          <div className="competition-layout">
            <div className="competition-main">
              <section className="panel">
                <div className="competition-heading">
                  <div>
                    <PhaseBadge state={competition.state} />
                    <p className="competition-description">{competition.description}</p>
                  </div>
                  {teacher && (
                    <Button
                      type="button"
                      disabled={[
                        'JUDGING',
                        'JUDGING_CLOSED',
                        'RESULTS_PUBLISHED',
                        'ARCHIVED',
                      ].includes(competition.state)}
                      title="심사 시작 후에는 출품작 보호를 위해 설정을 바꿀 수 없어요."
                      onClick={() => setEditing(competition)}
                    >
                      <Settings2 size={16} />
                      설정 수정
                    </Button>
                  )}
                </div>
                <div className="competition-actions">
                  <a
                    className="button secondary"
                    href={`/competition/${competition.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink size={16} />
                    외부 심사 페이지
                  </a>
                  {teacher && !competition.archived && (
                    <>
                      <Button
                        type="button"
                        onClick={() => {
                          setPendingAction(competition.published ? 'unpublish' : 'publish');
                          setActionReason('');
                        }}
                      >
                        <Flag size={16} />
                        {competition.published ? '접수 취소' : '대회 공개'}
                      </Button>
                      {competition.state === 'JUDGING_CLOSED' && !competition.resultsPublished && (
                        <Button
                          type="button"
                          variant="primary"
                          onClick={() => setPendingAction('publishResults')}
                        >
                          <Trophy size={16} />
                          결과 공개
                        </Button>
                      )}
                      {competition.resultsPublished && (
                        <Button type="button" onClick={() => setPendingAction('retractResults')}>
                          결과 공개 철회
                        </Button>
                      )}
                    </>
                  )}
                </div>
                <p className="competition-note">
                  작품 공개:{' '}
                  {competition.visibility === 'PUBLIC' ? '링크를 아는 방문자' : '초대된 KEY 심사자'}{' '}
                  · 작품별 최소 심사 {competition.minJudges}개 · 공식 KEY 심사 평균 집계
                </p>
              </section>
              {teacher ? (
                <>
                  <section className="panel">
                    <h2>출품과 심사 현황</h2>
                    <div className="competition-stats">
                      <div className="competition-stat">
                        <span>참가 대상</span>
                        <strong>
                          {competition.participantIds.length}
                          <small>명</small>
                        </strong>
                      </div>
                      <div className="competition-stat">
                        <span>제출 완료</span>
                        <strong>
                          {detail.entries.filter((entry) => entry.status === 'SUBMITTED').length}
                          <small>개</small>
                        </strong>
                      </div>
                      <div className="competition-stat">
                        <span>연결한 심사자</span>
                        <strong>
                          {detail.passes?.filter((pass) => pass.usedAt && !pass.revoked).length ||
                            0}
                          <small>명</small>
                        </strong>
                      </div>
                    </div>
                    <div className="competition-entry-list">
                      {competition.participantIds.map((studentId) => {
                        const member = state.members.find((m) => m.id === studentId);
                        const entry = detail.entries.find((entry) => entry.studentId === studentId);
                        const studentExtension = detail.extensions?.find(
                          (item) => item.studentId === studentId,
                        );
                        return (
                          <article className="competition-entry" key={studentId}>
                            <div>
                              <h3>{entry?.title || '아직 제출하지 않았어요'}</h3>
                              <p>
                                {member?.name || '참가 학생'} ·{' '}
                                {entry?.status === 'SUBMITTED'
                                  ? `제출 완료 · 버전 ${entry.revision}`
                                  : entry?.status === 'DRAFT'
                                    ? '임시 저장 중'
                                    : entry?.status === 'WITHDRAWN'
                                      ? '제출 철회'
                                      : '미제출'}
                                {entry?.submittedAt ? ` · ${kst(entry.submittedAt)}` : ''}
                              </p>
                              {studentExtension && <p>개별 연장 · {kst(studentExtension.dueAt)}</p>}
                            </div>
                            {entry && (
                              <Button type="button" onClick={() => setPreview(entry)}>
                                제출 내용 확인
                              </Button>
                            )}
                          </article>
                        );
                      })}
                      {!competition.participantIds.length && (
                        <p className="competition-note">설정에서 참가 학생을 선택해 주세요.</p>
                      )}
                    </div>
                  </section>
                  <JudgePasses
                    key={competition.id}
                    competition={competition}
                    passes={detail.passes || []}
                    entries={detail.entries}
                    onSaved={refresh}
                  />
                  <section className="panel">
                    <div className="competition-heading">
                      <div>
                        <h2>
                          {competition.resultsPublished
                            ? '공개한 결과'
                            : '결과 미리보기 · MASTER 전용'}
                        </h2>
                        <p className="competition-note">
                          공식 KEY 심사의 항목별 평균을 합산해요. 동점은 실무 적용 → 사용 편의 →
                          완성도 → 창의성 순으로 비교하며 모두 같으면 공동 순위예요.
                        </p>
                      </div>
                      <Trophy size={22} />
                    </div>
                    {detail.results ? (
                      <CompetitionResults results={detail.results} />
                    ) : (
                      <p className="competition-note">
                        심사가 시작되면 결과 집계를 확인할 수 있어요.
                      </p>
                    )}
                  </section>
                  <DeadlineExtension
                    competitionId={competition.id}
                    state={{
                      ...state,
                      members: state.members.filter((member) =>
                        competition.participantIds.includes(member.id),
                      ),
                    }}
                    onSaved={refresh}
                  />
                </>
              ) : (
                <section className="panel">
                  <div className="competition-heading">
                    <div>
                      <p className="eyebrow">MY FIRST SHOWCASE</p>
                      <h2>내 출품작</h2>
                      <p className="competition-note">
                        {extension
                          ? `개별 제출 기한 · ${kst(extension.dueAt)}`
                          : `제출 마감 · ${kst(competition.submissionDueAt)}`}
                      </p>
                    </div>
                    {myEntry?.status === 'SUBMITTED' && (
                      <span className="competition-saved">
                        <CheckCircle2 size={17} />
                        제출 완료
                      </span>
                    )}
                  </div>
                  {myEntry ? (
                    <>
                      <h3>{myEntry.title}</h3>
                      <p className="competition-note">
                        {myEntry.displayName} · 버전 {myEntry.revision} ·{' '}
                        {myEntry.status === 'DRAFT'
                          ? '임시 저장'
                          : myEntry.status === 'WITHDRAWN'
                            ? '철회됨'
                            : `최종 제출 ${kst(myEntry.submittedAt || undefined)}`}
                      </p>
                      <div className="competition-actions">
                        <Button type="button" onClick={() => setPreview(myEntry)}>
                          <FileCode2 size={16} />
                          공개 내용 미리보기
                        </Button>
                        {editable && (
                          <Button
                            type="button"
                            variant="primary"
                            onClick={() => setSubmissionOpen(true)}
                          >
                            출품작 수정하기
                          </Button>
                        )}
                        {editable && myEntry.status === 'SUBMITTED' && (
                          <Button
                            type="button"
                            onClick={() => {
                              if (
                                !confirm(
                                  '이 작품의 제출을 철회할까요? 기한 내에 다시 제출할 수 있어요.',
                                )
                              )
                                return;
                              void api(`/competitions/${competition.id}/withdraw`, 'POST', {
                                expectedRevision: myEntry.revision,
                              })
                                .then(refresh)
                                .then(() => onToast('출품을 철회했어요.'))
                                .catch((e) => setError(e.message));
                            }}
                          >
                            제출 철회
                          </Button>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <p>
                        직접 만든 서비스를 소개서와 함께 제출해 주세요. 쉬운 템플릿으로 소개서를
                        작성할 수 있어요.
                      </p>
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => setSubmissionOpen(true)}
                        disabled={!editable}
                      >
                        <Plus size={16} />내 서비스 출품하기
                      </Button>
                    </>
                  )}
                  {!editable && (
                    <p className="competition-privacy-note">
                      {competition.state === 'UPCOMING'
                        ? '작품 접수가 시작되면 출품할 수 있어요.'
                        : '지금은 출품작을 수정할 수 없는 기간이에요. 제출 기한 연장이 필요하면 선생님에게 문의해 주세요.'}{' '}
                      일정과 허용 여부는 서버가 확인해요.
                    </p>
                  )}
                </section>
              )}
              {!teacher && detail.results && (
                <section className="panel">
                  <h2>우리 반 경진대회 결과</h2>
                  <CompetitionResults results={detail.results} />
                </section>
              )}
            </div>
            <aside className="competition-aside">
              <section className="panel">
                <h2>대회 일정</h2>
                <CompetitionSchedule competition={competition} />
                <p className="competition-note">
                  한국 시간(KST)
                  <br />
                  서버 확인: {kst(detail.serverNow)}
                </p>
              </section>
              <section className="panel">
                <h2>어떤 작품을 평가하나요?</h2>
                <p className="competition-note">
                  실무 적용 가능성 35점
                  <br />
                  사용 편의성 30점
                  <br />
                  완성도 20점
                  <br />
                  창의성 15점
                </p>
                <p className="competition-note">
                  합계 100점 · 평가 완료 전 다른 심사자의 점수는 공개하지 않아요.
                </p>
                {competition.awardNames.length > 0 && (
                  <>
                    <h3>시상</h3>
                    <p className="competition-note">{competition.awardNames.join(' · ')}</p>
                  </>
                )}
              </section>
            </aside>
          </div>
          {teacher && detail.audit && (
            <details className="panel competition-class-manager">
              <summary>대회 운영 이력</summary>
              <ul className="competition-audit">
                {detail.audit.map((item) => (
                  <li key={item.id}>
                    <time dateTime={item.createdAt}>{kst(item.createdAt)}</time> · {item.action}
                    <br />
                    {item.detail}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {teacher && !competition.archived && (
            <div className="competition-danger-zone">
              <Button type="button" onClick={() => setPendingAction('archive')}>
                <Archive size={16} />
                대회 보관하기
              </Button>
              <p className="competition-note">
                보관하면 교실의 대회 장식과 진행 안내가 내려가요. 제출물과 심사 기록은 보존해요.
              </p>
            </div>
          )}
        </>
      )}
      {editing && (
        <CompetitionEditor
          key={editing === 'new' ? 'new' : editing.id}
          competition={editing === 'new' ? undefined : editing}
          participantsLocked={
            editing !== 'new' && detail?.competition.id === editing.id && !!detail.entries.length
          }
          classes={list.classes}
          state={state}
          onClose={() => setEditing(null)}
          onSaved={async (id) => {
            await load(id);
            setSelectedId(id);
            await onRefresh();
            onToast('대회 설정을 저장했어요.');
          }}
        />
      )}
      {submissionOpen && competition && (
        <SubmissionEditor
          competition={competition}
          entry={myEntry || null}
          state={state}
          onSaved={async () => {
            await refresh();
            onToast('출품작을 저장했어요.');
          }}
          onClose={() => setSubmissionOpen(false)}
        />
      )}
      {preview && (
        <Modal
          title={preview.title}
          subtitle={`${preview.displayName} · 제출 버전 ${preview.revision}`}
          onClose={() => setPreview(null)}
          wide
        >
          <div className="competition-work-detail">
            <p className="competition-privacy-note">
              이 화면은 제출한 소개서와 결과물만 표시해요. 실제 외부 공개 여부는 대회 상태·공개
              범위·학생 동의를 서버가 확인해요.
            </p>
            <div className="competition-actions">
              <ServiceLink url={preview.serviceUrl} />
              {preview.artifact && (
                <a className="button secondary" href={preview.artifact.downloadUrl}>
                  결과물 다운로드
                </a>
              )}
              {preview.introFile && (
                <a className="button secondary" href={preview.introFile.downloadUrl}>
                  소개서 원본 다운로드
                </a>
              )}
            </div>
            <IntroductionPreview
              html={preview.introHtml}
              title={`${preview.title} 공개 소개서 미리보기`}
            />
          </div>
        </Modal>
      )}
      {pendingAction && (
        <Modal
          title={actionLabels[pendingAction] || '대회 상태 변경'}
          onClose={() => {
            if (!actionBusy) setPendingAction(null);
          }}
        >
          <p className="competition-confirm-warning">
            {pendingAction === 'publishResults'
              ? '결과를 공개하면 학생과 대회 페이지 방문자가 순위와 평균 점수를 확인할 수 있어요. 최소 심사 수와 누락된 작품을 먼저 확인해 주세요.'
              : pendingAction === 'publish'
                ? '공개하면 설정한 일정에 따라 참가 학생의 접수와 외부 심사가 열려요. 반, 일정, 공개 범위를 확인해 주세요.'
                : '운영 상태가 바뀌며 변경 사유가 기록돼요. 기존 제출물과 심사 기록은 삭제하지 않아요.'}
          </p>
          <Field label="변경 사유">
            <textarea
              rows={3}
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              maxLength={500}
            />
          </Field>
          {error && (
            <InlineNotice title="상태를 변경하지 못했어요" kind="error">
              {error}
            </InlineNotice>
          )}
          <div className="form-actions">
            <Button type="button" disabled={actionBusy} onClick={() => setPendingAction(null)}>
              취소
            </Button>
            <Button type="button" variant="primary" busy={actionBusy} onClick={() => void action()}>
              {actionLabels[pendingAction]}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
