import { useEffect, useRef } from 'react';
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
  const host = useRef<HTMLDivElement>(null),
    scene = useRef<ClassroomScene | null>(null);
  const latest = useRef({ state, enabled, onAction, onRefresh, onConnection });
  useEffect(() => {
    latest.current = { state, enabled, onAction, onRefresh, onConnection };
    scene.current?.sync(state);
    if (scene.current) {
      scene.current.enabled = enabled;
      if (scene.current.input) scene.current.input.enabled = enabled;
    }
  }, [state, enabled, onAction, onRefresh, onConnection]);
  useEffect(() => {
    let disposed = false;
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
      socket.onopen = () => latest.current.onConnection(true);
      socket.onmessage = (e) => {
        const value = JSON.parse(e.data);
        if (value.type === 'refresh' || value.type === 'online') latest.current.onRefresh();
        else scene.current?.receive(value);
      };
      socket.onclose = () => {
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
            if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(v));
          },
          (x, y) => {
            if (host.current) {
              host.current.dataset.x = String(Math.round(x));
              host.current.dataset.y = String(Math.round(y));
            }
          },
        );
        scene.current.enabled = latest.current.enabled;
        game = new Phaser.Game(gameConfig(host.current, scene.current));
        game.events.once('classroom-ready', () => {
          window.addEventListener('keydown', preventPageScroll, { passive: false });
          connect();
        });
      },
    );
    return () => {
      disposed = true;
      window.removeEventListener('keydown', preventPageScroll);
      clearTimeout(retry);
      socket?.close();
      game?.destroy(true);
      scene.current = null;
    };
  }, []);
  return (
    <div
      className="game-host"
      ref={host}
      role="application"
      aria-label="픽셀 교실. WASD 또는 방향키로 이동, E로 책상 열기, 스페이스로 앉기"
    >
      <div className="game-loading">교실 문을 여는 중이에요…</div>
    </div>
  );
}
