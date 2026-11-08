import { useEffect, useRef, useState } from 'react';
import type { AppState } from '../../shared/types';
import type { ClassroomScene, GameAction } from './scene';
export default function Classroom({
  state,
  enabled,
  onAction,
  onRefresh,
  onConnection,
}: {
  state: AppState;
  enabled: boolean;
  onAction: (action: GameAction) => void;
  onRefresh: () => void;
  onConnection: (connected: boolean) => void;
}) {
  const [focus, setFocus] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null),
    scene = useRef<ClassroomScene | null>(null);
  const ready = useRef(false);
  const stopTouch = () => scene.current?.touchMove(0, 0);
  const latest = useRef({ state, enabled, onAction, onRefresh, onConnection });
  useEffect(() => {
    latest.current = { state, enabled, onAction, onRefresh, onConnection };
    scene.current?.sync(state);
    if (scene.current) {
      scene.current.enabled = enabled && ready.current;
      if (scene.current.input) scene.current.input.enabled = enabled && ready.current;
      if (!enabled) scene.current.touchMove(0, 0);
    }
  }, [state, enabled, onAction, onRefresh, onConnection]);
  useEffect(() => {
    let disposed = false;
    latest.current.onConnection(false);
    let game: import('phaser').Game | undefined;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout>;
    const preventPageScroll = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        latest.current.enabled &&
        !target?.closest('input,textarea,select,button,a,[contenteditable=true]') &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)
      )
        event.preventDefault();
    };
    const connect = () => {
      if (
        disposed ||
        (socket &&
          (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING))
      )
        return;
      socket = new WebSocket(
        `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/socket`,
      );
      socket.onmessage = (e) => {
        if (disposed) return;
        const value = JSON.parse(e.data);
        if (value.type === 'positions') {
          scene.current?.receive(value);
          ready.current = true;
          if (scene.current) {
            scene.current.enabled = latest.current.enabled;
            scene.current.input.enabled = latest.current.enabled;
          }
          latest.current.onConnection(true);
        } else if (value.type === 'refresh' || value.type === 'online') latest.current.onRefresh();
        else scene.current?.receive(value);
      };
      socket.onclose = () => {
        if (disposed) return;
        scene.current?.touchMove(0, 0);
        if (scene.current) {
          scene.current.enabled = false;
          scene.current.input.enabled = false;
          scene.current.input.keyboard?.resetKeys();
        }
        ready.current = false;
        latest.current.onConnection(false);
        if (!disposed) {
          latest.current.onRefresh();
          retry = setTimeout(connect, 3000);
        }
      };
    };
    Promise.all([import('phaser'), import('./scene')]).then(
      ([{ default: Phaser }, { ClassroomScene, gameConfig }]) => {
        if (disposed || !host.current) return;
        scene.current = new ClassroomScene(
          latest.current.state,
          (action) => latest.current.onAction(action),
          (v) => {
            if (ready.current && socket?.readyState === WebSocket.OPEN)
              socket.send(JSON.stringify(v));
          },
          (x, y) => {
            if (host.current) {
              host.current.dataset.x = String(Math.round(x));
              host.current.dataset.y = String(Math.round(y));
              host.current.dataset.zoom = String(scene.current?.cameras.main.zoom || 1);
              host.current.dataset.worldHeight = String(scene.current?.worldHeight || 0);
              host.current.dataset.seated = String(scene.current?.seated || false);
              const textures = scene.current?.textures.getTextureKeys() || [];
              host.current.dataset.characterTextures = String(
                textures.filter((key) => key.startsWith('char-')).length,
              );
              host.current.dataset.worldTextures = String(
                textures.filter((key) => key === 'world' || key.startsWith('world-')).length,
              );
            }
          },
          () => {
            if (disposed) return;
            window.addEventListener('keydown', preventPageScroll, { passive: false });
            connect();
          },
        );
        scene.current.enabled = false;
        game = new Phaser.Game(gameConfig(host.current, scene.current));
      },
    );
    const stop = () => {
      scene.current?.touchMove(0, 0);
      scene.current?.input.keyboard?.resetKeys();
    };
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', stop);
    return () => {
      disposed = true;
      latest.current.onConnection(false);
      ready.current = false;
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', stop);
      window.removeEventListener('keydown', preventPageScroll);
      clearTimeout(retry);
      socket?.close();
      game?.destroy(true);
      scene.current = null;
    };
  }, []);
  return (
    <div ref={container} className={`game-container ${focus ? 'focus-mode' : ''}`}>
      <div className="game-toolbar" aria-label="교실 이동과 화면 조절">
        <button onClick={() => scene.current?.command('self')}>내 위치</button>
        <button disabled={!state.me.deskId} onClick={() => scene.current?.command('desk')}>
          내 책상으로
        </button>
        <button onClick={() => scene.current?.command('master')}>선생님에게</button>
        <button disabled={!state.me.deskId} onClick={() => scene.current?.command('sit')}>
          책상에 앉기
        </button>
        <span />
        <button aria-label="교실 축소" onClick={() => scene.current?.command('zoomOut')}>
          −
        </button>
        <button aria-label="교실 확대" onClick={() => scene.current?.command('zoomIn')}>
          ＋
        </button>
        <button onClick={() => setFocus(!focus)}>{focus ? '집중 모드 종료' : '집중 모드'}</button>
        <button
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void container.current?.requestFullscreen().catch(() => {});
          }}
        >
          전체 화면
        </button>
      </div>
      <div
        className="game-host"
        ref={host}
        role="application"
        aria-label="픽셀 교실. WASD 또는 방향키로 이동, E로 책상 열기, 스페이스로 앉기"
      >
        <div className="game-loading">교실 문을 여는 중이에요…</div>
        <div className="touch-controls" role="group" aria-label="교실 터치 이동">
          {[
            { label: '위쪽', x: 0, y: -1, symbol: '↑', position: 'up' },
            { label: '왼쪽', x: -1, y: 0, symbol: '←', position: 'left' },
            { label: '멈추기', x: 0, y: 0, symbol: '·', position: 'stop' },
            { label: '오른쪽', x: 1, y: 0, symbol: '→', position: 'right' },
            { label: '아래쪽', x: 0, y: 1, symbol: '↓', position: 'down' },
          ].map((d) => (
            <button
              key={d.position}
              type="button"
              disabled={!enabled}
              className={`touch-button touch-${d.position}`}
              aria-label={d.position === 'stop' ? '터치 이동 멈추기' : `터치로 ${d.label} 이동`}
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture?.(e.pointerId);
                if (enabled && ready.current) scene.current?.touchMove(d.x, d.y);
              }}
              onPointerUp={stopTouch}
              onPointerCancel={stopTouch}
              onLostPointerCapture={stopTouch}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  scene.current?.touchMove(d.x, d.y);
                }
              }}
              onKeyUp={stopTouch}
              onBlur={stopTouch}
            >
              {d.symbol}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
