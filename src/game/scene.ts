import Phaser from 'phaser';
import type { AppState, Member } from '../../shared/types';
import { WORLD, canStand } from '../../shared/world';
import { characterCanvas, type Direction } from './character';
import { worldCanvas, deskCanvas, robotCanvas } from './worldArt';
export type GameAction = {
  type: 'desk' | 'profile' | 'materials' | 'gallery' | 'ai' | 'notice';
  memberId?: string;
};
type Player = {
  sprite: Phaser.GameObjects.Sprite;
  name: Phaser.GameObjects.Text;
  shadow: Phaser.GameObjects.Ellipse;
  dot: Phaser.GameObjects.Arc;
  member: Member;
  tx: number;
  ty: number;
  direction: Direction;
  moving: boolean;
  seated: boolean;
};
export class ClassroomScene extends Phaser.Scene {
  dataState: AppState;
  players = new Map<string, Player>();
  desks: Phaser.GameObjects.GameObject[] = [];
  keys?: Record<string, Phaser.Input.Keyboard.Key>;
  enabled = true;
  seated = false;
  lastSend = 0;
  target: { x: number; y: number } | null = null;
  onAction: (action: GameAction) => void;
  onMove: (v: unknown) => void;
  onPosition: (x: number, y: number) => void;
  constructor(
    state: AppState,
    onAction: (action: GameAction) => void,
    onMove: (v: unknown) => void,
    onPosition: (x: number, y: number) => void,
  ) {
    super('Classroom');
    this.dataState = state;
    this.onAction = (action) => {
      if (this.enabled && !document.querySelector('dialog[open]')) onAction(action);
    };
    this.onMove = onMove;
    this.onPosition = onPosition;
  }
  create() {
    this.textures.addCanvas('world', worldCanvas());
    this.textures.addCanvas('desk', deskCanvas());
    this.textures.addCanvas('robot', robotCanvas());
    this.add.image(0, 0, 'world').setOrigin(0).setScale(2);
    this.add
      .text(560, 88, 'Learn AI. Build Your Own Service.', {
        fontFamily: 'monospace',
        fontSize: '17px',
        color: '#e8efd5',
      })
      .setOrigin(0.5);
    this.add
      .text(560, 116, '오늘도, 한 걸음 더 나만의 서비스에 가까이!', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#c6d8bc',
      })
      .setOrigin(0.5);
    const label = (x: number, y: number, text: string, color = '#566b52') =>
      this.add
        .text(x, y, text, {
          fontFamily: 'sans-serif',
          fontSize: '13px',
          fontStyle: 'bold',
          color,
          backgroundColor: '#edf1d9',
          padding: { x: 10, y: 5 },
        })
        .setOrigin(0.5)
        .setDepth(1);
    label(120, 218, '교안 자료실');
    label(1018, 195, '프로젝트 전시실');
    label(1002, 355, '✦ AI 조교', '#77728f');
    label(107, 584, '잠깐, 쉬어가기');
    const npc = this.add
      .sprite(1002, 422, 'robot')
      .setScale(1.3)
      .setOrigin(0.5, 1)
      .setDepth(422)
      .setInteractive({ useHandCursor: true });
    this.tweens.add({
      targets: npc,
      y: 418,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    npc.on('pointerdown', () => this.onAction({ type: 'ai' }));
    this.add
      .zone(120, 285, 125, 100)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.onAction({ type: 'materials' }));
    this.add
      .zone(1015, 270, 110, 130)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.onAction({ type: 'gallery' }));
    this.add
      .zone(555, 100, 365, 115)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.onAction({ type: 'notice' }));
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
    this.input.keyboard!.removeCapture([
      'W',
      'A',
      'S',
      'D',
      'UP',
      'DOWN',
      'LEFT',
      'RIGHT',
      'SPACE',
      'E',
    ]);
    this.input.on(
      'pointerdown',
      (pointer: Phaser.Input.Pointer, objects: Phaser.GameObjects.GameObject[]) => {
        if (!objects.length && this.enabled) {
          const p = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
          this.target = { x: p.x, y: p.y };
          this.seated = false;
        }
      },
    );
    this.sync(this.dataState);
    this.input.enabled = this.enabled;
    this.game.events.emit('classroom-ready');
  }
  sync(state: AppState) {
    this.dataState = state;
    if (!this.sys.isActive()) return;
    this.desks.forEach((d) => d.destroy());
    this.desks = [];
    for (const d of state.desks) {
      const owner = state.members.find((m) => m.deskId === d.id);
      const image = this.add
        .image(d.x, d.y + 58, 'desk')
        .setOrigin(0.5, 1)
        .setScale(2)
        .setDepth(d.y + 35)
        .setInteractive({ useHandCursor: true });
      image.on('pointerdown', () => this.onAction({ type: 'desk', memberId: owner?.id }));
      const label = this.add
        .text(
          d.x,
          d.y + 88,
          owner ? `${owner.id === state.me.id ? '나의 책상' : owner.name}` : '빈 자리',
          {
            fontFamily: 'sans-serif',
            fontSize: '12px',
            color: owner?.id === state.me.id ? '#426c4a' : '#806e53',
            backgroundColor: owner?.id === state.me.id ? '#e2ecc9' : '#e6cda1',
            padding: { x: 8, y: 3 },
          },
        )
        .setOrigin(0.5)
        .setDepth(1);
      this.desks.push(image, label);
    }
    for (const [key, p] of this.players)
      if (!state.members.some((m) => m.id === key && m.status === 'ACTIVE')) {
        p.sprite.destroy();
        p.name.destroy();
        p.shadow.destroy();
        p.dot.destroy();
        this.players.delete(key);
      }
    for (const member of state.members.filter((m) => m.status === 'ACTIVE')) {
      let p = this.players.get(member.id);
      const texturePrefix = `char-${member.id}-${JSON.stringify(member.appearance)}`;
      for (const direction of ['down', 'up', 'left', 'right'] as Direction[])
        for (let frame = 0; frame < 3; frame++) {
          const key = `${texturePrefix}-${direction}-${frame}`;
          if (!this.textures.exists(key))
            this.textures.addCanvas(key, characterCanvas(member.appearance, direction, frame));
        }
      const seatKey = `${texturePrefix}-sit`;
      if (!this.textures.exists(seatKey))
        this.textures.addCanvas(seatKey, characterCanvas(member.appearance, 'down', 0, true));
      if (!p) {
        const d = state.desks.find((d) => d.id === member.deskId);
        const isMe = member.id === state.me.id;
        const x = isMe ? 560 : d?.x || 372,
          y = isMe ? 625 : d ? d.y + 81 : 245;
        const sprite = this.add
          .sprite(x, y, `${texturePrefix}-down-0`)
          .setOrigin(0.5, 1)
          .setScale(1.15)
          .setInteractive({ useHandCursor: true });
        sprite.on('pointerdown', () => this.onAction({ type: 'profile', memberId: member.id }));
        const name = this.add
          .text(x, y - 82, '', {
            fontFamily: 'sans-serif',
            fontSize: '12px',
            fontStyle: 'bold',
            padding: { x: 10, y: 5 },
          })
          .setOrigin(0.5);
        const shadow = this.add.ellipse(x, y - 2, 34, 10, 0x716b4b, 0.18);
        const dot = this.add.circle(x, y - 82, 3, 0x84a881);
        p = {
          sprite,
          name,
          shadow,
          dot,
          member,
          tx: x,
          ty: y,
          direction: 'down',
          moving: false,
          seated: false,
        };
        this.players.set(member.id, p);
      }
      p.member = member;
      p.sprite.setData('prefix', texturePrefix);
      const isMe = member.id === state.me.id;
      const displayName =
        Array.from(member.name).length > 10
          ? Array.from(member.name).slice(0, 9).join('') + '…'
          : member.name;
      p.name
        .setText(
          `${member.role === 'MASTER' ? '♛ ' : ''}${displayName}${isMe ? ' · 나' : ''}${member.help ? ' !' : ''}`,
        )
        .setStyle({
          color: isMe ? '#fff8dd' : member.role === 'MASTER' ? '#705331' : '#445648',
          backgroundColor: isMe ? '#3f6550' : member.role === 'MASTER' ? '#eed7a0' : '#edf0da',
        });
      p.dot.setFillStyle(state.online.includes(member.id) ? 0x8cbd73 : 0xa6a998);
    }
  }
  receive(value: {
    type: string;
    userId?: string;
    x?: number;
    y?: number;
    direction?: Direction;
    moving?: boolean;
    seated?: boolean;
    players?: unknown[];
  }) {
    if (value.type === 'positions')
      for (const p of value.players || []) this.receive({ type: 'move', ...(p as object) });
    if (value.type === 'move' && value.userId !== this.dataState.me.id) {
      const p = this.players.get(value.userId!);
      if (p) {
        p.tx = value.x!;
        p.ty = value.y!;
        p.direction = value.direction!;
        p.moving = !!value.moving;
        p.seated = !!value.seated;
      }
    }
  }
  update(time: number, delta: number) {
    const me = this.players.get(this.dataState.me.id);
    if (!me) return;
    let dx = 0,
      dy = 0;
    const el = document.activeElement;
    const typing =
      el instanceof HTMLElement && (el.matches('input,textarea,select') || el.isContentEditable);
    if (this.enabled && !typing && this.keys) {
      dx =
        (this.keys.D.isDown || this.keys.RIGHT.isDown ? 1 : 0) -
        (this.keys.A.isDown || this.keys.LEFT.isDown ? 1 : 0);
      dy =
        (this.keys.S.isDown || this.keys.DOWN.isDown ? 1 : 0) -
        (this.keys.W.isDown || this.keys.UP.isDown ? 1 : 0);
      if (dx || dy) {
        this.target = null;
        this.seated = false;
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.E)) {
        const desk = this.dataState.desks.find(
          (d) => Math.hypot(d.x - me.sprite.x, d.y - me.sprite.y) < 130,
        );
        if (desk)
          this.onAction({
            type: 'desk',
            memberId: this.dataState.members.find((m) => m.deskId === desk.id)?.id,
          });
        else if (me.sprite.x > 880 && me.sprite.y < 465) this.onAction({ type: 'ai' });
        else if (me.sprite.x < 220 && me.sprite.y < 400) this.onAction({ type: 'materials' });
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) {
        const desk = this.dataState.desks.find(
          (d) => Math.hypot(d.x - me.sprite.x, d.y + 78 - me.sprite.y) < 75,
        );
        if (desk) {
          this.seated = !this.seated;
          me.direction = 'up';
        }
      }
      if (this.target && !dx && !dy) {
        const distance = Math.hypot(this.target.x - me.sprite.x, this.target.y - me.sprite.y);
        if (distance < 5) this.target = null;
        else {
          dx = (this.target.x - me.sprite.x) / distance;
          dy = (this.target.y - me.sprite.y) / distance;
        }
      }
    }
    const length = Math.hypot(dx, dy);
    const speed = (165 * Math.min(delta, 40)) / 1000;
    if (length > 0) {
      dx /= length;
      dy /= length;
      me.direction =
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      const oldX = me.sprite.x,
        oldY = me.sprite.y;
      if (canStand(oldX + dx * speed, oldY, this.dataState.desks)) me.sprite.x += dx * speed;
      if (canStand(me.sprite.x, oldY + dy * speed, this.dataState.desks)) me.sprite.y += dy * speed;
      if (this.target && oldX === me.sprite.x && oldY === me.sprite.y) this.target = null;
    }
    me.moving = length > 0 && this.enabled && !typing;
    me.seated = this.seated;
    if (time - this.lastSend > 85) {
      this.lastSend = time;
      this.onMove({
        x: me.sprite.x,
        y: me.sprite.y,
        direction: me.direction,
        moving: me.moving,
        seated: me.seated,
      });
      this.onPosition(me.sprite.x, me.sprite.y);
    }
    for (const [key, p] of this.players) {
      if (key !== this.dataState.me.id) {
        p.sprite.x = Phaser.Math.Linear(p.sprite.x, p.tx, Math.min(1, delta * 0.012));
        p.sprite.y = Phaser.Math.Linear(p.sprite.y, p.ty, Math.min(1, delta * 0.012));
      }
      const prefix = p.sprite.getData('prefix') as string;
      const frame = p.moving ? 1 + (Math.floor(time / 180) % 2) : 0;
      p.sprite.setTexture(p.seated ? `${prefix}-sit` : `${prefix}-${p.direction}-${frame}`);
      p.sprite.setDepth(p.sprite.y);
      p.name.setPosition(p.sprite.x, p.sprite.y - 84).setDepth(p.sprite.y + 1);
      p.shadow.setPosition(p.sprite.x, p.sprite.y - 2).setDepth(p.sprite.y - 1);
      p.dot.setPosition(p.sprite.x, p.sprite.y - 91).setDepth(p.sprite.y + 2);
    }
  }
}
export const gameConfig = (
  parent: HTMLElement,
  scene: ClassroomScene,
): Phaser.Types.Core.GameConfig => ({
  type: Phaser.CANVAS,
  parent,
  width: WORLD.width,
  height: WORLD.height,
  backgroundColor: '#b4c6a6',
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene,
  render: { antialias: false },
  audio: { noAudio: true },
});
