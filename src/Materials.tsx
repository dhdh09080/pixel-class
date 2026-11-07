import { useRef, useState, type FormEvent } from 'react';
import {
  Search,
  Upload,
  FileText,
  Download,
  Eye,
  BookOpen,
  Trash2,
  RefreshCw,
  ArrowUpRight,
} from 'lucide-react';
import type { AppState, Material } from '../shared/types';
import { Modal, Field, Empty, date } from './components';
import type { Mutate } from './Projects';
export function MaterialsPage({
  state,
  mutate,
  onToast,
}: {
  state: AppState;
  mutate: Mutate;
  onToast: (s: string) => void;
}) {
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState('전체'),
    [upload, setUpload] = useState(false),
    [replace, setReplace] = useState<Material>(),
    [deleting, setDeleting] = useState('');
  const [topicEditor, setTopicEditor] = useState<Material>();
  const categories = ['전체', ...new Set(state.materials.map((m) => m.category))];
  const materials = state.materials.filter(
    (m) =>
      `${m.title} ${m.description}`.toLowerCase().includes(query.toLowerCase()) &&
      (category === '전체' || category === m.category),
  );
  return (
    <section className="materials-page">
      <div className="page-section-title">
        <div>
          <p className="eyebrow">LEARNING LIBRARY</p>
          <h1>배움이 쌓이는 자료실</h1>
          <p className="muted">지금 필요한 만큼, 하나씩 배워 가세요.</p>
        </div>
        {state.me.role === 'MASTER' && (
          <button
            className="button primary"
            onClick={() => {
              setReplace(undefined);
              setUpload(true);
            }}
          >
            <Upload size={17} />
            교안 올리기
          </button>
        )}
      </div>
      <div className="library-banner">
        <div className="book-illustration">
          <BookOpen size={65} strokeWidth={1.4} />
          <span>✦</span>
        </div>
        <div>
          <p className="eyebrow">작은 배움이 만드는 큰 변화</p>
          <h2>
            모르는 건 괜찮아요.
            <br />
            여기서부터 시작하면 되니까요.
          </h2>
          <p>프로젝트를 만들며 필요한 개념을 찾아보세요.</p>
        </div>
        <span className="library-number">
          {String(state.materials.length).padStart(2, '0')}
          <small>개의 배움</small>
        </span>
      </div>
      <div className="library-controls">
        <div className="search-input">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="어떤 자료를 찾고 있나요?"
            aria-label="교안 제목 검색"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="교안 카테고리"
        >
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="materials-grid">
        {materials.map((m) => (
          <article className="material-card" key={m.id}>
            <div className="between">
              <span className="file-icon">
                <FileText size={25} />
              </span>
              <span className="membership">{m.category}</span>
            </div>
            <h3>{m.title}</h3>
            <p>{m.description}</p>
            <div className="material-topics">
              {(m.topics || []).map((t) => (
                <span className="membership" key={t}>
                  {t}
                </span>
              ))}
            </div>
            <div className="material-meta">
              <span>
                {m.fileName.split('.').pop()?.toUpperCase()} · v{m.version}
              </span>
              <small>
                {m.size ? `${Math.ceil(m.size / 1024)}KB` : '시작 가이드'} · {date(m.createdAt)}
              </small>
            </div>
            <div className="material-actions">
              <a className="button small secondary" href={`/api/materials/${m.id}/download`}>
                <Download size={14} />
                다운로드
              </a>
              {m.mime === 'application/pdf' || m.mime.startsWith('image/') ? (
                <a
                  className="icon-button"
                  title="미리보기"
                  aria-label={`${m.title} 미리보기`}
                  href={`/api/materials/${m.id}/download?preview=1`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Eye size={17} />
                </a>
              ) : null}
              {state.me.role === 'MASTER' && (
                <>
                  <button
                    className="icon-button"
                    aria-label={`${m.title} 기술 주제 설정`}
                    onClick={() => setTopicEditor(m)}
                  >
                    <BookOpen size={15} />
                  </button>
                  <button
                    className="icon-button"
                    title="새 버전 업로드"
                    aria-label={`${m.title} 새 버전 업로드`}
                    onClick={() => {
                      setReplace(m);
                      setUpload(true);
                    }}
                  >
                    <RefreshCw size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`${m.title} 삭제`}
                    onClick={() => setDeleting(m.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>
            {deleting === m.id && (
              <div className="delete-confirm">
                <span>자료를 삭제할까요?</span>
                <button
                  className="text-button danger-text"
                  onClick={() =>
                    void mutate(`/materials/${m.id}`, 'DELETE')
                      .then(() => setDeleting(''))
                      .catch(() => {})
                  }
                >
                  삭제 확인
                </button>
                <button className="text-button" onClick={() => setDeleting('')}>
                  취소
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {!materials.length && (
        <Empty
          icon={<BookOpen />}
          title="아직 일치하는 자료가 없어요"
          description="다른 검색어나 카테고리를 선택해 보세요."
        />
      )}
      {topicEditor && (
        <MaterialTopicEditor
          material={topicEditor}
          mutate={mutate}
          onClose={() => setTopicEditor(undefined)}
        />
      )}
      {upload && (
        <UploadForm
          replace={replace}
          onClose={() => setUpload(false)}
          mutate={mutate}
          onToast={onToast}
        />
      )}
    </section>
  );
}
function UploadForm({
  replace,
  onClose,
  mutate,
  onToast,
}: {
  replace?: Material;
  onClose: () => void;
  mutate: Mutate;
  onToast: (s: string) => void;
}) {
  const [title, setTitle] = useState(replace?.title || ''),
    [description, setDescription] = useState(replace?.description || ''),
    [category, setCategory] = useState(replace?.category || '시작하기'),
    [visibility, setVisibility] = useState<'ACTIVE' | 'ALL'>(replace?.visibility || 'ACTIVE'),
    [file, setFile] = useState<File>(),
    [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [topics, setTopics] = useState<string[]>(replace?.topics || []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      onToast('5MB 이하 파일을 선택해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const content = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      await mutate('/materials', 'POST', {
        title,
        description,
        category,
        visibility,
        fileName: file.name,
        content,
        replaceId: replace?.id,
        topics,
      });
      onToast('교안을 안전하게 저장했어요.');
      onClose();
    } catch {
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={replace ? '교안 새 버전 올리기' : '함께 볼 교안을 올려 주세요'}
      subtitle="PDF, 문서, 이미지, TXT, MD · 최대 5MB"
      onClose={onClose}
    >
      <form className="project-form" onSubmit={submit}>
        <Field label="교안 제목 *">
          <input
            required
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="설명">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </Field>
        <div className="form-grid">
          <Field label="카테고리">
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
              maxLength={40}
              list="categories"
            />
            <datalist id="categories">
              {['시작하기', 'AI 도구', 'API와 서버', '데이터베이스', '배포하기'].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="공개 범위">
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as 'ACTIVE' | 'ALL')}
            >
              <option value="ACTIVE">재학생과 MASTER</option>
              <option value="ALL">학교 구성원 (현재 재학생만 접근)</option>
            </select>
          </Field>
        </div>
        <TopicChoices topics={topics} onChange={setTopics} />
        <button type="button" className="upload-zone" onClick={() => input.current?.click()}>
          <Upload size={28} />
          <strong>{file?.name || '파일 선택하기'}</strong>
          <span>
            {replace
              ? `업로드하면 v${replace.version + 1}로 저장돼요.`
              : '교안 파일은 학교 구성원에게만 제공돼요.'}
          </span>
        </button>
        <input
          type="file"
          ref={input}
          className="visually-hidden"
          accept=".pdf,.pptx,.docx,.xlsx,.png,.jpg,.jpeg,.webp,.txt,.md"
          onChange={(e) => setFile(e.target.files?.[0])}
        />
        <button className="button primary" disabled={!file || busy}>
          {busy ? '업로드 중…' : '교안 저장하기'}
          <ArrowUpRight size={16} />
        </button>
      </form>
    </Modal>
  );
}

const materialTopics = [
  'API 기초',
  'DB 기초',
  'Codex 사용법',
  '서버와 호스팅',
  'GitHub 사용법',
  '웹 개발 기초',
  'AI 프롬프트 작성',
];
function TopicChoices({
  topics,
  onChange,
}: {
  topics: string[];
  onChange: (topics: string[]) => void;
}) {
  return (
    <fieldset className="topic-choices">
      <legend>프로젝트에 연결할 기술 주제</legend>
      {materialTopics.map((t) => (
        <label key={t}>
          <input
            type="checkbox"
            checked={topics.includes(t)}
            onChange={(e) =>
              onChange(e.target.checked ? [...topics, t] : topics.filter((v) => v !== t))
            }
          />
          {t}
        </label>
      ))}
    </fieldset>
  );
}
function MaterialTopicEditor({
  material,
  mutate,
  onClose,
}: {
  material: Material;
  mutate: Mutate;
  onClose: () => void;
}) {
  const [topics, setTopics] = useState(material.topics || []);
  return (
    <Modal title="교안에 기술 주제 연결" subtitle={material.title} onClose={onClose}>
      <form
        className="project-form"
        onSubmit={(e) => {
          e.preventDefault();
          void mutate(`/materials/${material.id}`, 'PATCH', { topics })
            .then(onClose)
            .catch(() => {});
        }}
      >
        <TopicChoices topics={topics} onChange={setTopics} />
        <p className="muted">
          프로젝트의 필요 기술과 주제가 겹치면 기술·로드맵 화면에 이 교안을 추천해요. 규칙 기반
          연결이며 AI 분석이 아니에요.
        </p>
        <button className="button primary">기술 주제 저장</button>
      </form>
    </Modal>
  );
}
