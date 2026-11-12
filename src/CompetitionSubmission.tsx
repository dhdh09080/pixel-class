import { useRef, useState } from 'react';
import type { AppState } from '../shared/types';
import type { Competition, CompetitionEntry } from '../shared/competitions';
import { api } from './api';
import { Field, Modal } from './components';
import { Button, InlineNotice, SegmentedControl } from './ui';
import {
  emptyIntro,
  introFields,
  kst,
  readCompetitionFile,
  type IntroValues,
  type UploadValue,
} from './competition-ui';
export function SubmissionEditor({
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
