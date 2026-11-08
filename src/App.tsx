import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  Home,
  FolderKanban,
  BookOpen,
  Images,
  Users,
  Settings,
  Bell,
  ChevronRight,
  ArrowUpRight,
  Plus,
  ArrowRight,
  MessageCircle,
  Send,
  CheckCircle2,
  Sparkles,
  HelpCircle,
  Volume2,
  LogOut,
  Wifi,
  WifiOff,
  Sun,
  Compass,
  Flag,
  Keyboard,
  MousePointer2,
  Monitor,
  Check,
  X,
  Mail,
} from 'lucide-react';
import type { AppState, Project, Member } from '../shared/types';
import { progress } from '../shared/types';
import { api, fetchState, ApiError } from './api';
import { Avatar, Status, Progress, CheckRow, Modal, Empty, date } from './components';
import { ProjectCards, ProjectDetail, ProjectForm, type Mutate } from './Projects';
import { MasterPage } from './Master';
import { MaterialsPage } from './Materials';
import { CharacterEditor } from './CharacterEditor';
import { Auth, type Config } from './Auth';
import type { GameAction } from './game/scene';
const Classroom = lazy(() => import('./game/Classroom'));
type Page = 'classroom' | 'projects' | 'materials' | 'gallery' | 'master';
type Overlay =
  | 'project'
  | 'newProject'
  | 'editProject'
  | 'character'
  | 'notices'
  | 'profile'
  | 'guide'
  | 'ai'
  | 'auth'
  | null;
export default function App() {
  const [state, setState] = useState<AppState | null>(null),
    [config, setConfig] = useState<Config | null>(null),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState<Page>('classroom'),
    [overlay, setOverlay] = useState<Overlay>(null),
    [selected, setSelected] = useState(''),
    [profile, setProfile] = useState(''),
    [toast, setToast] = useState(''),
    [connected, setConnected] = useState(false),
    [chat, setChat] = useState(''),
    [chatOpen, setChatOpen] = useState(false),
    [readAt, setReadAt] = useState('');
  const chatEnd = useRef<HTMLDivElement>(null);
  const [projectStartTab, setProjectStartTab] = useState('overview');
  const [characterSaving, setCharacterSaving] = useState(false);
  const [editingSnapshot, setEditingSnapshot] = useState<Project>();
  const loadSequence = useRef(0);
  const currentAccount = useRef<string | undefined>(undefined);
  const resetUi = useCallback(() => {
    setOverlay(null);
    setSelected('');
    setEditingSnapshot(undefined);
  }, []);
  const resetAccountUi = useCallback(() => {
    resetUi();
    setPage('classroom');
    setChat('');
    setChatOpen(false);
    setProfile('');
    setToast('');
    setConnected(false);
  }, [resetUi]);
  const applyState = useCallback(
    (next: AppState) => {
      if (currentAccount.current !== next.me.id) resetAccountUi();
      currentAccount.current = next.me.id;
      setState(next);
    },
    [resetAccountUi],
  );
  const onToast = useCallback((s: string) => setToast(s), []);
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      const next = await fetchState();
      if (sequence === loadSequence.current) {
        applyState(next);
        setConfig({ demo: next.demo, bootstrap: false, aiConfigured: next.aiConfigured });
      }
    } catch (e) {
      if (sequence !== loadSequence.current) return;
      if (e instanceof ApiError && [401, 403].includes(e.status)) {
        resetAccountUi();
        currentAccount.current = undefined;
        setState(null);
      } else setToast((e as Error).message);
    }
  }, [applyState, resetAccountUi]);
  useEffect(() => {
    void (async () => {
      try {
        const c = await api<Config>('/config');
        setConfig(c);
        if (new URLSearchParams(location.search).has('invite')) return;
        try {
          applyState(await fetchState());
        } catch (e) {
          if (
            c.demo &&
            !sessionStorage.getItem('pixel-signed-out') &&
            e instanceof ApiError &&
            e.status === 401
          ) {
            await api('/demo', 'POST', { role: 'STUDENT' });
            await load();
          }
        }
      } catch (e) {
        setToast((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [load, applyState]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 5500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (state?.me.id) setReadAt(localStorage.getItem(`pixel-read-${state.me.id}`) || '');
  }, [state?.me.id]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [state?.messages.length, chatOpen]);
  const mutate: Mutate = useCallback(
    async (path, method = 'POST', body, revision) => {
      try {
        const result = await api(path, method, body, revision);
        await load();
        return result;
      } catch (e) {
        if (e instanceof ApiError && [404, 409].includes(e.status)) await load();
        setToast((e as Error).message);
        throw e;
      }
    },
    [load],
  );
  const openProject = useCallback((id: string, initialTab = 'overview') => {
    setProjectStartTab(initialTab);
    setSelected(id);
    setOverlay('project');
  }, []);
  const action = useCallback((a: GameAction) => {
    if (a.type === 'materials') {
      setPage('materials');
      return;
    }
    if (a.type === 'gallery') {
      setPage('gallery');
      return;
    }
    if (a.type === 'notice') {
      setOverlay('notices');
      return;
    }
    if (a.type === 'ai') {
      setOverlay('ai');
      return;
    }
    if (a.type === 'profile') {
      setProfile(a.memberId || '');
      setOverlay('profile');
      return;
    }
    if (a.type === 'desk') {
      setProfile(a.memberId || '');
      setOverlay('profile');
    }
  }, []);
  useEffect(() => {
    if (!state || state.me.status !== 'ACTIVE' || page === 'classroom') return;
    let disposed = false;
    let socket: WebSocket;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(
        `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/socket`,
      );
      socket.onmessage = (e) => {
        const message = JSON.parse(e.data);
        if (['refresh', 'personal-event', 'online'].includes(message.type)) void load();
      };
      socket.onclose = () => {
        if (!disposed) {
          void load();
          retry = setTimeout(connect, 3000);
        }
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [state?.me.id, state?.me.status, page, load]);
  if (loading)
    return (
      <div className="initial-loading">
        <div className="brand-mark">
          P<span />
        </div>
        <h2>교실 문을 여는 중이에요.</h2>
        <p>오늘은 어떤 아이디어가 자랄까요?</p>
      </div>
    );
  const toastEl = toast && (
    <div className="toast" role="status">
      <CheckCircle2 size={18} />
      <span>{toast}</span>
      <button aria-label="알림 닫기" onClick={() => setToast('')}>
        <X size={15} />
      </button>
    </div>
  );
  if (!state)
    return (
      <>
        {config ? (
          <Auth
            config={config}
            onSuccess={() => {
              resetAccountUi();
              void load();
            }}
            onToast={onToast}
          />
        ) : (
          <div className="initial-loading">
            <h2>서버에 연결하지 못했어요.</h2>
            <p>로컬 서버 실행 상태를 확인해 주세요.</p>
            <button className="button primary" onClick={() => location.reload()}>
              다시 연결하기
            </button>
          </div>
        )}
        {toastEl}
      </>
    );
  const { me, members, projects } = state;
  const own = projects.filter((p) => p.ownerId === me.id);
  const featured = own.find((p) => !['COMPLETED', 'PAUSED'].includes(p.status)) || own[0];
  const selectedProject = projects.find((p) => p.id === selected);
  const editingProject =
    selectedProject?.ownerId === me.id
      ? selectedProject
      : editingSnapshot?.ownerId === me.id && editingSnapshot.id === selected
        ? editingSnapshot
        : undefined;
  const profileMember = members.find((m) => m.id === profile);
  const feedback = own
    .flatMap((p) => p.feedback.map((f) => ({ ...f, projectId: p.id })))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const unread =
    state.messages.filter((m) => m.type === 'NOTICE' && m.createdAt > readAt).length +
    feedback.filter((f) => f.createdAt > readAt).length +
    (state.events || []).filter(
      (e) =>
        ['project.question.answered', 'help.requested'].includes(e.type) &&
        !e.readAt &&
        e.createdAt > readAt,
    ).length;
  const latestNotice = state.messages.filter((m) => m.type === 'NOTICE').at(-1);
  const isActive = me.status === 'ACTIVE';
  const close = resetUi;
  const markRead = () => {
    const value = new Date().toISOString();
    setReadAt(value);
    localStorage.setItem(`pixel-read-${me.id}`, value);
    void mutate('/events/read-all', 'POST').catch(() => {});
  };
  async function switchRole(role: 'MASTER' | 'STUDENT') {
    try {
      await mutate('/demo', 'POST', { role });
      resetAccountUi();
    } catch {}
  }
  async function logout() {
    try {
      await api('/logout', 'POST');
      sessionStorage.setItem('pixel-signed-out', '1');
      resetAccountUi();
      setState(null);
    } catch (e) {
      onToast((e as Error).message);
    }
  }
  const navs = [
    { key: 'classroom', label: '교실', icon: Home },
    {
      key: 'projects',
      label: me.role === 'MASTER' ? '프로젝트' : '내 프로젝트',
      icon: FolderKanban,
    },
    { key: 'materials', label: '자료실', icon: BookOpen },
    { key: 'gallery', label: '전시실', icon: Images },
    ...(me.role === 'MASTER' ? [{ key: 'master', label: '교무실', icon: Users }] : []),
  ];
  return (
    <div className="app">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => setPage('classroom')}
          aria-label="Pixel Class 교실"
        >
          <span className="brand-mark">
            P<span />
          </span>
          <small>
            PIXEL
            <br />
            CLASS
          </small>
        </button>
        <nav>
          {navs.map((n) => (
            <button
              className={`nav-item ${page === n.key ? 'active' : ''}`}
              key={n.key}
              onClick={() =>
                isActive
                  ? setPage(n.key as Page)
                  : onToast('현재 학적에서는 교실 기능을 사용할 수 없어요.')
              }
              aria-label={n.label}
              aria-current={page === n.key ? 'page' : undefined}
            >
              <n.icon size={21} strokeWidth={1.6} />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setOverlay('guide')} aria-label="이용 안내">
            <HelpCircle size={21} />
            <span>이용 안내</span>
          </button>
          <button
            className="sidebar-avatar"
            onClick={() => setOverlay('character')}
            aria-label="나의 캐릭터 꾸미기"
          >
            <Avatar appearance={me.appearance} size={47} />
            <i />
          </button>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumbs">
            <span className="school-symbol">
              <Flag size={15} />
            </span>
            <strong>픽셀 스쿨</strong>
            <ChevronRight size={13} />
            <span>AI 메이커스 1기</span>
            <span className="school-term">2026 가을학기</span>
          </div>
          <div className="topbar-actions">
            {state.demo && (
              <div className="demo-switch">
                <span>로컬 데모</span>
                <button
                  className={me.role === 'STUDENT' ? 'selected' : ''}
                  onClick={() => void switchRole('STUDENT')}
                >
                  학생
                </button>
                <button
                  className={me.role === 'MASTER' ? 'selected' : ''}
                  onClick={() => void switchRole('MASTER')}
                >
                  MASTER
                </button>
              </div>
            )}
            <button
              className="notification-button icon-button"
              aria-label={`알림 ${unread}개`}
              onClick={() => {
                markRead();
                setOverlay('notices');
              }}
            >
              <Bell size={19} />
              {unread > 0 && <b>{unread > 9 ? '9+' : unread}</b>}
            </button>
            <span className="header-divider" />
            <button className="header-profile" onClick={() => setOverlay('character')}>
              <Avatar appearance={me.appearance} size={42} />
              <span>
                <strong>{me.name}</strong>
                <small>{me.role === 'MASTER' ? 'MASTER' : 'STUDENT'}</small>
              </span>
            </button>
            <button
              className="icon-button logout-button"
              aria-label="로그아웃"
              title="로그아웃"
              onClick={() => void logout()}
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <main className="main-content">
          {!isActive ? (
            <div className="inactive-panel">
              <Avatar appearance={me.appearance} size={150} />
              <h1>
                {me.status === 'ON_LEAVE'
                  ? '잠시 쉬어가는 중이에요.'
                  : '여기까지의 도전을 응원해요.'}
              </h1>
              <p>캐릭터와 프로젝트 기록은 보존돼요. 교실 입장은 MASTER에게 문의해 주세요.</p>
              <button className="button primary" onClick={() => setPage('projects')}>
                내 프로젝트 기록 보기
              </button>
              {page === 'projects' &&
                own.map((p) => (
                  <article className="panel" key={p.id}>
                    <h3>{p.title}</h3>
                    <Status status={p.status} />
                    <p>{p.purpose}</p>
                    <p>
                      개발 기록 {p.updates.length}개 · 피드백 {p.feedback.length}개
                    </p>
                  </article>
                ))}
            </div>
          ) : page === 'classroom' ? (
            <>
              <div className="classroom-intro">
                <div>
                  <p className="eyebrow">
                    <span /> A LITTLE PROGRESS, EVERY DAY
                  </p>
                  <h1>
                    오늘도, 한 걸음 더<span className="title-sparkle">✳︎</span>
                  </h1>
                  <p>{me.name}님, 오늘은 어떤 아이디어를 현실로 만들어 볼까요?</p>
                </div>
                <div className="today-label">
                  <Sun size={23} strokeWidth={1.5} />
                  <div>
                    <span>
                      {new Intl.DateTimeFormat('ko-KR', {
                        month: 'long',
                        day: 'numeric',
                        weekday: 'long',
                        timeZone: 'Asia/Seoul',
                      }).format(new Date())}
                    </span>
                    <strong>만들기 좋은 하루예요</strong>
                  </div>
                </div>
              </div>
              {latestNotice && (
                <button className="announcement" onClick={() => setOverlay('notices')}>
                  <span>
                    <Volume2 size={16} />
                    선생님의 한마디
                  </span>
                  <p>{latestNotice.text}</p>
                  <ArrowUpRight size={16} />
                </button>
              )}
              <div className="classroom-layout">
                <div className="classroom-left">
                  <section className="classroom-card">
                    <div className="map-heading">
                      <div>
                        <span className="room-icon">
                          <Home size={18} />
                        </span>
                        <h2>AI 메이커스 교실</h2>
                        <span className="room-badge">1학년 1반</span>
                      </div>
                      <div className="map-online">
                        <span className={`connection-dot ${connected ? 'live' : ''}`} />
                        {connected ? `${state.online.length}명 접속 중` : '연결 중…'}
                        <button
                          className="icon-button"
                          aria-label="교실 조작 안내"
                          onClick={() => setOverlay('guide')}
                        >
                          <Compass size={17} />
                        </button>
                      </div>
                    </div>
                    <Suspense
                      fallback={<div className="game-placeholder">교실을 불러오고 있어요…</div>}
                    >
                      <Classroom
                        key={me.id}
                        state={state}
                        enabled={!overlay}
                        onAction={action}
                        onRefresh={load}
                        onConnection={setConnected}
                      />
                    </Suspense>
                    <div className="map-footer">
                      <span>
                        <i />
                        함께 배우고, 각자의 서비스를 만들어요
                      </span>
                      <div>
                        <span>
                          <kbd>W</kbd>
                          <kbd>A</kbd>
                          <kbd>S</kbd>
                          <kbd>D</kbd> 이동
                        </span>
                        <span>
                          <kbd>E</kbd> 상호작용
                        </span>
                        <span>
                          <kbd>SPACE</kbd> 앉기
                        </span>
                      </div>
                    </div>
                  </section>
                  <section className={`chat-card ${chatOpen ? 'expanded' : ''}`}>
                    <button className="chat-heading" onClick={() => setChatOpen(!chatOpen)}>
                      <span>
                        <MessageCircle size={17} />
                        교실 이야기<small>모두에게 열린 대화</small>
                      </span>
                      <span className="chat-toggle">
                        {chatOpen ? '접기' : '대화 열기'}
                        <ChevronRight size={15} />
                      </span>
                    </button>
                    {chatOpen ? (
                      <>
                        <div className="chat-messages">
                          {state.messages
                            .filter((m) => m.type === 'CHAT')
                            .slice(-30)
                            .map((m) => (
                              <div className="chat-message" key={m.id}>
                                <strong>{m.name}</strong>
                                <p>{m.text}</p>
                                <time>{date(m.createdAt)}</time>
                              </div>
                            ))}
                          {!state.messages.some((m) => m.type === 'CHAT') && (
                            <p className="muted">첫 인사를 건네보세요. 함께 만드는 교실이에요!</p>
                          )}
                          <div ref={chatEnd} />
                        </div>
                        <form
                          className="chat-input"
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (chat.trim())
                              void mutate('/messages', 'POST', {
                                text: chat,
                                type: 'CHAT',
                                recipientId: null,
                              })
                                .then(() => setChat(''))
                                .catch(() => {});
                          }}
                        >
                          <input
                            value={chat}
                            onChange={(e) => setChat(e.target.value)}
                            placeholder="함께 배우는 메이커들에게 한마디"
                            maxLength={1000}
                            aria-label="교실 채팅 메시지"
                          />
                          <button aria-label="채팅 보내기" disabled={!chat.trim()}>
                            <Send size={17} />
                          </button>
                        </form>
                      </>
                    ) : (
                      <p className="chat-preview">
                        {state.messages.filter((m) => m.type === 'CHAT').at(-1) ? (
                          <>
                            <strong>
                              {state.messages.filter((m) => m.type === 'CHAT').at(-1)?.name}
                            </strong>
                            {state.messages.filter((m) => m.type === 'CHAT').at(-1)?.text}
                          </>
                        ) : (
                          '막힌 부분도, 작은 성공도 함께 나눠요. 👋'
                        )}
                      </p>
                    )}
                  </section>
                </div>
                <aside className="learning-sidebar">
                  <section className="my-project-widget">
                    <div className="widget-heading">
                      <span>
                        <FolderKanban size={17} />
                        나의 프로젝트
                      </span>
                      <button
                        className="icon-button"
                        onClick={() => setOverlay('newProject')}
                        aria-label="프로젝트 추가"
                      >
                        <Plus size={17} />
                      </button>
                    </div>
                    {featured ? (
                      <>
                        <div className="widget-project-title">
                          <Status status={featured.status} />
                          <h3>{featured.title}</h3>
                          <p>{featured.purpose}</p>
                        </div>
                        <div className="between progress-label">
                          <span>아이디어가 자라는 중</span>
                          <strong>
                            {progress(featured)}
                            <small>%</small>
                          </strong>
                        </div>
                        <Progress value={progress(featured)} />
                        <div className="widget-tasks">
                          <h4>오늘의 작은 한 걸음</h4>
                          {featured.tasks
                            .filter((t) => !t.done)
                            .slice(0, 2)
                            .map((t) => (
                              <CheckRow
                                key={t.id}
                                done={t.done}
                                text={t.text}
                                onChange={() =>
                                  void mutate(`/projects/${featured.id}/tasks/${t.id}`, 'PATCH', {
                                    done: true,
                                  }).catch(() => {})
                                }
                              />
                            ))}
                          {!featured.tasks.some((t) => !t.done) && (
                            <p className="muted">새로운 할 일을 추가해 볼까요?</p>
                          )}
                        </div>
                        <button className="widget-open" onClick={() => openProject(featured.id)}>
                          프로젝트 이어가기
                          <ArrowRight size={17} />
                        </button>
                      </>
                    ) : (
                      <div className="start-project">
                        <FolderKanban size={36} />
                        <h3>아이디어를 심어 볼까요?</h3>
                        <p>작은 불편함도 좋은 시작이에요.</p>
                        <button className="button primary" onClick={() => setOverlay('newProject')}>
                          첫 프로젝트 만들기
                          <Plus size={15} />
                        </button>
                      </div>
                    )}
                  </section>
                  <section className="feedback-widget">
                    <div className="widget-heading">
                      <span>
                        <Mail size={17} />
                        도착한 피드백
                      </span>
                      <span className="count-dot">{feedback.length}</span>
                    </div>
                    {feedback[0] ? (
                      <>
                        <span className="feedback-author">♛ {feedback[0].name}</span>
                        <p>“{feedback[0].text}”</p>
                        <button
                          className="text-button"
                          onClick={() => openProject(feedback[0].projectId)}
                        >
                          피드백 자세히 보기
                          <ArrowUpRight size={14} />
                        </button>
                      </>
                    ) : (
                      <p className="muted">
                        선생님의 조언과 다음 과제가
                        <br />
                        여기에 도착해요.
                      </p>
                    )}
                  </section>
                  <button className="ai-widget" onClick={() => setOverlay('ai')}>
                    <span className="ai-icon">
                      <Sparkles size={24} />
                    </span>
                    <div>
                      <strong>막혔다면, AI 조교에게</strong>
                      <p>다음 한 걸음을 함께 찾아봐요</p>
                    </div>
                    <ArrowUpRight size={17} />
                  </button>
                  <button
                    className={`help-button ${me.help ? 'requested' : ''}`}
                    onClick={() =>
                      void mutate('/me', 'PATCH', { help: !me.help })
                        .then(() =>
                          onToast(
                            me.help
                              ? '도움 요청을 해제했어요.'
                              : 'MASTER에게 도움 요청을 알렸어요.',
                          ),
                        )
                        .catch(() => {})
                    }
                  >
                    <HelpCircle size={17} />
                    {me.help ? '도움 요청 중 · 해제하기' : '선생님, 도움이 필요해요'}
                    <span>{me.help ? '✓' : '↗'}</span>
                  </button>
                  <div className="work-status">
                    <label htmlFor="work-status">나의 작업 상태</label>
                    <select
                      id="work-status"
                      value={me.workStatus}
                      onChange={(e) =>
                        void mutate('/me', 'PATCH', { workStatus: e.target.value }).catch(() => {})
                      }
                    >
                      <option value="IDLE">편하게 둘러보는 중</option>
                      <option value="BUILDING">프로젝트 진행 중</option>
                      <option value="MENTORING">MASTER 상담 중</option>
                    </select>
                  </div>
                </aside>
              </div>
              <footer className="page-footer">
                <span>
                  <span className="mini-pixel">✦</span> Learn AI. Build Your Own Service.
                </span>
                <span>한 걸음의 배움, 나만의 가능성.</span>
              </footer>
            </>
          ) : page === 'projects' ? (
            <ProjectCards
              state={state}
              onOpen={openProject}
              onCreate={() => setOverlay('newProject')}
            />
          ) : page === 'materials' ? (
            <MaterialsPage state={state} mutate={mutate} onToast={onToast} />
          ) : page === 'gallery' ? (
            <ProjectCards
              state={state}
              onOpen={openProject}
              onCreate={() => setOverlay('newProject')}
              gallery
            />
          ) : me.role === 'MASTER' ? (
            <MasterPage state={state} mutate={mutate} onProject={openProject} onToast={onToast} />
          ) : null}
        </main>
        <div className="environment-bar">
          <span>
            {connected ? <Wifi size={12} /> : <Monitor size={12} />}{' '}
            {state.demo ? '로컬 데모 · 공용 체험 데이터' : '로컬 학교 · SQLite 저장소'}
            <i />
            변경사항은 서버에 저장돼요
          </span>
          <div>
            {state.demo && (
              <button onClick={() => setOverlay('auth')}>
                실제 계정으로 입학
                <ArrowUpRight size={12} />
              </button>
            )}
            <span>PIXEL CLASS v0.4</span>
          </div>
        </div>
      </div>
      {overlay === 'newProject' && (
        <ProjectForm
          onClose={close}
          mutate={mutate}
          onSaved={(id) => {
            openProject(id);
            onToast('새로운 프로젝트를 시작했어요!');
          }}
        />
      )}
      {overlay === 'editProject' && editingProject && (
        <ProjectForm
          project={editingProject}
          unavailable={!selectedProject || !isActive}
          onClose={() => setOverlay('project')}
          mutate={mutate}
          onSaved={() => {
            setOverlay('project');
            onToast('프로젝트를 저장했어요.');
          }}
        />
      )}
      {overlay === 'project' && selectedProject && (
        <ProjectDetail
          key={`${selectedProject.id}-${projectStartTab}`}
          initialTab={projectStartTab}
          project={selectedProject}
          state={state}
          onClose={close}
          onEdit={() => {
            setEditingSnapshot(selectedProject);
            setOverlay('editProject');
          }}
          onDeleted={() => {
            close();
            onToast('프로젝트를 삭제했어요.');
          }}
          mutate={mutate}
          onToast={onToast}
        />
      )}
      {((overlay === 'project' && !selectedProject) ||
        (overlay === 'editProject' && !editingProject)) && (
        <Modal title="프로젝트를 열 수 없어요" onClose={close}>
          <Empty
            icon={<FolderKanban />}
            title="삭제되었거나 접근 권한이 바뀌었어요"
            description="최신 프로젝트 목록에서 다시 확인해 주세요."
          >
            <button
              className="button primary"
              onClick={() => {
                setPage('projects');
                close();
              }}
            >
              프로젝트 목록으로
            </button>
          </Empty>
        </Modal>
      )}
      {overlay === 'character' && (
        <Modal
          title="교실 속 나의 모습"
          subtitle="나의 캐릭터는 계정에 연결되어 계속 함께해요."
          onClose={() => {
            if (!characterSaving) close();
          }}
          wide
        >
          <CharacterEditor
            member={me}
            busy={characterSaving}
            onCancel={close}
            onSave={(name, appearance) => {
              setCharacterSaving(true);
              void mutate('/me', 'PATCH', { name, appearance })
                .then(() => {
                  close();
                  onToast('나의 모습을 저장했어요.');
                })
                .catch(() => {})
                .finally(() => setCharacterSaving(false));
            }}
          />
        </Modal>
      )}
      {overlay === 'profile' && (
        <Modal
          title={
            profileMember
              ? `${profileMember.name}${profileMember.id === me.id ? '님의 책상' : '님의 공간'}`
              : '아직 비어 있는 책상'
          }
          onClose={close}
        >
          {profileMember ? (
            <>
              <div className="profile-hero">
                <Avatar appearance={profileMember.appearance} size={130} />
                <div>
                  <span className="eyebrow">{profileMember.role}</span>
                  <h3>{profileMember.name}</h3>
                  <p>
                    {state.online.includes(profileMember.id) ? '지금 교실에 있어요' : '오프라인'}
                  </p>
                  <span className="membership">
                    {profileMember.workStatus === 'BUILDING'
                      ? '프로젝트 진행 중'
                      : profileMember.workStatus === 'MENTORING'
                        ? 'MASTER 상담 중'
                        : '편하게 둘러보는 중'}
                  </span>
                </div>
              </div>
              {projects
                .filter((p) => p.ownerId === profileMember.id)
                .map((p) => (
                  <button className="profile-project" key={p.id} onClick={() => openProject(p.id)}>
                    <FolderKanban size={21} />
                    <span>
                      <strong>{p.title}</strong>
                      <small>{p.purpose}</small>
                    </span>
                    <Status status={p.status} />
                    <ArrowUpRight size={16} />
                  </button>
                ))}
              {!projects.some((p) => p.ownerId === profileMember.id) && (
                <Empty
                  icon={<FolderKanban />}
                  title={
                    profileMember.id === me.id
                      ? '아직 프로젝트가 없어요'
                      : '아직 공개된 프로젝트가 없어요'
                  }
                  description="지금은 새로운 아이디어를 준비하는 중이에요."
                />
              )}
              {profileMember.id === me.id && (
                <button className="button primary" onClick={() => setOverlay('newProject')}>
                  <Plus size={16} />
                  프로젝트 만들기
                </button>
              )}
            </>
          ) : (
            <Empty
              icon={<Users />}
              title="새로운 메이커를 기다려요"
              description="입학하면 빈 책상이 자동으로 배정돼요."
            />
          )}
        </Modal>
      )}
      {overlay === 'notices' && (
        <Modal
          title="교실에서 도착한 소식"
          onClose={() => {
            markRead();
            close();
          }}
        >
          <div className="notifications">
            {(state.events || [])
              .filter((e) => e.type === 'help.requested')
              .slice()
              .reverse()
              .map(
                (e) =>
                  e.type === 'help.requested' && (
                    <button
                      className="notification-feedback"
                      key={e.id}
                      onClick={() => {
                        markRead();
                        setPage('master');
                        close();
                      }}
                    >
                      <span className="notice-type">학생 도움 요청</span>
                      <p>{e.payload.name}님이 도움이 필요해요.</p>
                      <small>
                        {date(e.createdAt)} · 교무실에서 질문과 프로젝트를 확인해 주세요.
                      </small>
                    </button>
                  ),
              )}
            {(state.events || [])
              .filter((e) => e.type === 'project.question.answered')
              .slice()
              .reverse()
              .map(
                (e) =>
                  e.type === 'project.question.answered' && (
                    <button
                      className="notification-feedback"
                      key={e.id}
                      onClick={() => {
                        markRead();
                        openProject(e.payload.projectId);
                      }}
                    >
                      <span className="notice-type">질문에 답변이 도착했어요</span>
                      <p>{e.payload.preview}</p>
                      <small>
                        {e.payload.mentorName} · {date(e.createdAt)}
                      </small>
                    </button>
                  ),
              )}
            {state.messages
              .filter((m) => m.type === 'NOTICE')
              .slice()
              .reverse()
              .map((m) => (
                <article key={m.id}>
                  <span className="notice-type">
                    <Volume2 size={13} />
                    MASTER 공지{m.recipientId ? ' · 나에게' : ''}
                  </span>
                  <p>{m.text}</p>
                  <small>
                    {m.name} · {date(m.createdAt)}
                  </small>
                </article>
              ))}
            {feedback.map((f) => (
              <button
                className="notification-feedback"
                key={f.id}
                onClick={() => {
                  markRead();
                  openProject(f.projectId);
                }}
              >
                <span className="notice-type">
                  <Mail size={13} />새 피드백
                </span>
                <p>{f.text}</p>
                <small>
                  {f.name} · {date(f.createdAt)}
                </small>
              </button>
            ))}
            {!latestNotice && !feedback.length && (
              <Empty icon={<Bell />} title="새로운 소식을 기다리고 있어요" />
            )}
            <button
              className="button secondary"
              onClick={() => {
                markRead();
                close();
              }}
            >
              <Check size={16} />
              모두 확인했어요
            </button>
          </div>
        </Modal>
      )}
      {overlay === 'ai' && (
        <Modal
          title="어떤 프로젝트를 함께 볼까요?"
          subtitle="프로젝트를 선택한 뒤 AI 조교 탭에서 질문해 주세요."
          onClose={close}
        >
          {!state.aiConfigured && (
            <div className="info-banner">
              <Sparkles size={20} />
              <div>
                <strong>AI 연결이 아직 준비되지 않았어요</strong>
                <p>
                  서버에 OpenAI API 키와 모델을 설정해야 실제 응답을 받을 수 있어요. 임의의 AI
                  답변을 표시하지 않아요.
                </p>
              </div>
            </div>
          )}
          {(me.role === 'MASTER' ? projects : own).map((p) => (
            <button className="profile-project" key={p.id} onClick={() => openProject(p.id)}>
              <FolderKanban size={20} />
              <strong>{p.title}</strong>
              <ArrowUpRight size={17} />
            </button>
          ))}
          {!own.length && me.role === 'STUDENT' && (
            <button className="button primary" onClick={() => setOverlay('newProject')}>
              첫 프로젝트 등록하기
              <Plus size={16} />
            </button>
          )}
        </Modal>
      )}
      {overlay === 'guide' && (
        <Modal
          title="우리 교실, 이렇게 즐겨요"
          subtitle="작은 아이디어로 시작해도 괜찮아요."
          onClose={close}
        >
          <div className="guide-grid">
            {[
              {
                icon: Keyboard,
                title: '자유롭게 걸어보세요',
                text: 'WASD 또는 방향키로 이동해요. 책상과 가구에는 부딪히고, 통로로 지나갈 수 있어요.',
              },
              {
                icon: MousePointer2,
                title: '책상을 클릭해 보세요',
                text: '내 책상에서는 프로젝트를, 친구 책상에서는 공개된 소개를 볼 수 있어요. 가까이서 E를 눌러도 열려요.',
              },
              {
                icon: BookOpen,
                title: '교실 곳곳의 배움',
                text: '왼쪽 책장은 자료실, 오른쪽 게시판은 전시실이에요. 보라색 로봇은 AI 조교예요.',
              },
              {
                icon: CheckCircle2,
                title: '나의 속도로 완성해요',
                text: '프로젝트의 할 일을 완료하면 진행률이 올라가요. 질문을 남기거나 선생님에게 도움을 요청해 보세요.',
              },
            ].map((g) => (
              <article key={g.title}>
                <g.icon size={24} />
                <h3>{g.title}</h3>
                <p>{g.text}</p>
              </article>
            ))}
          </div>
          {state.demo && (
            <div className="info-banner">
              <Monitor size={20} />
              <div>
                <strong>지금은 로컬 데모 학교예요</strong>
                <p>
                  상단의 학생 / MASTER 버튼으로 역할을 체험해 보세요. 체험 계정의 데이터는 함께
                  공유해요. 실제 학교 운영 시 DEMO_MODE=false로 시작하세요.
                </p>
              </div>
            </div>
          )}
        </Modal>
      )}
      {overlay === 'auth' && config && (
        <Modal title="나의 계정으로 입학하기" onClose={close} wide>
          <Auth
            config={config}
            embedded
            onSuccess={() => {
              resetAccountUi();
              void load();
            }}
            onToast={onToast}
          />
        </Modal>
      )}
      {toastEl}
    </div>
  );
}
