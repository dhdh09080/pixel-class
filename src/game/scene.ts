import { CHARACTER_SCALE, CHARACTER_HEIGHT, CHARACTER_ART_VERSION } from './character';
import Phaser from 'phaser';
import { NameplateLayoutCache } from '../../shared/nameplates';
import type { AppState, Member } from '../../shared/types';
import {
  WORLD,
  canStand,
  worldSize,
  spawnPoint,
  findPath,
  segmentClear,
  type Point,
} from '../../shared/world';
import { characterCanvas, type Direction } from './character';
import { worldCanvas, deskCanvas, robotCanvas, WORLD_ART_SCALE } from './worldArt';
import {
  competitionBannerCanvas,
  competitionBoardCanvas,
  competitionTrophyCanvas,
} from './competitionArt';
import { competitionStateLabels } from '../../shared/competitions';
export type GameAction = {
  type: 'desk' | 'profile' | 'materials' | 'gallery' | 'ai' | 'notice' | 'competition';
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
  walkDistance: number;
};
export class ClassroomScene extends Phaser.Scene {
  dataState: AppState;
  players = new Map<string, Player>();
  desks: Phaser.GameObjects.GameObject[] = [];
  keys?: Record<string, Phaser.Input.Keyboard.Key>;
  enabled = true;
  seated = false;
  pendingSeat?: string;
  virtualDirection = { x: 0, y: 0 };
  reducedMotion = false;
  lastSend = 0;
  lastPose = '';
  lastPoseSentAt = 0;
  path: Point[] = [];
  movementTrail: Point[] = [];
  sentPosition?: Point;
  worldImage?: Phaser.GameObjects.Image;
  layoutKey = '';
  worldHeight = 0;
  frameCount = 0;
  nameplateLayout = new NameplateLayoutCache();
  competitionObjects: Phaser.GameObjects.GameObject[] = [];
  competitionKey = '';
  onAction: (action: GameAction) => void;
  onMove: (v: unknown) => void;
  onPosition: (x: number, y: number) => void;
  onReady: () => void;
  constructor(
    state: AppState,
    onAction: (action: GameAction) => void,
    onMove: (v: unknown) => void,
    onPosition: (x: number, y: number) => void,
    onReady: () => void = () => {},
  ) {
    super('Classroom');
    this.dataState = state;
    this.onAction = (action) => {
      if (this.enabled && !document.querySelector('dialog[open]')) onAction(action);
    };
    this.onMove = onMove;
    this.onPosition = onPosition;
    this.onReady = onReady;
  }
  create() {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const applyMotion = () => {
      this.reducedMotion = motion.matches;
      this.tweens.timeScale = motion.matches ? 0 : 1;
      this.cameras.main.setLerp(motion.matches ? 1 : 0.08, motion.matches ? 1 : 0.08);
    };
    motion.addEventListener('change', applyMotion);
    this.events.once('shutdown', () => motion.removeEventListener('change', applyMotion));
    applyMotion();
    const room = this.dataState.world || worldSize(this.dataState.desks);
    this.worldHeight = room.height;
    this.textures.addCanvas('world', worldCanvas(room.height));
    this.textures.addCanvas('desk', deskCanvas());
    this.textures.addCanvas('robot', robotCanvas());
    this.worldImage = this.add.image(0, 0, 'world').setOrigin(0).setScale(WORLD_ART_SCALE);
    this.cameras.main.setBounds(0, 0, room.width, room.height);
    this.input.on('wheel', (_p: unknown, _o: unknown, _x: number, y: number) => {
      if (this.enabled) {
        this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom - y * 0.001, 0.65, 1.8));
        const me = this.players.get(this.dataState.me.id);
        if (me) this.onPosition(me.sprite.x, me.sprite.y);
      }
    });
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
        color: '#e0ead0',
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
    label(1002, 355, '✦ AI 조교', '#5c5276');
    label(107, 584, '잠깐, 쉬어가기');
    const npc = this.add
      .sprite(1002, 422, 'robot')
      .setScale(1.3 * WORLD_ART_SCALE)
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
    this.highlight(npc, 1002, 389, 60, 75);
    npc.on('pointerdown', (pointer: Phaser.Input.Pointer) =>
      this.pointerAction(pointer, { type: 'ai' }),
    );
    const library = this.add
      .zone(120, 285, 125, 100)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', (pointer: Phaser.Input.Pointer) =>
        this.pointerAction(pointer, { type: 'materials' }),
      );
    this.highlight(library, 120, 285, 125, 100);
    const gallery = this.add
      .zone(1015, 270, 110, 130)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', (pointer: Phaser.Input.Pointer) =>
        this.pointerAction(pointer, { type: 'gallery' }),
      );
    this.highlight(gallery, 1015, 270, 110, 130);
    const board = this.add
      .zone(555, 100, 365, 115)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', (pointer: Phaser.Input.Pointer) =>
        this.pointerAction(pointer, { type: 'notice' }),
      );
    this.highlight(board, 555, 100, 365, 115);
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
        if (!objects.length && this.enabled && pointer.event?.target instanceof HTMLCanvasElement) {
          const p = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
          this.navigate({ x: p.x, y: p.y });
          this.seated = false;
        }
      },
    );
    this.sync(this.dataState, true);
    this.input.enabled = this.enabled;
    const me = this.players.get(this.dataState.me.id);
    if (me)
      this.cameras.main.startFollow(
        me.sprite,
        true,
        this.reducedMotion ? 1 : 0.08,
        this.reducedMotion ? 1 : 0.08,
      );
    this.onReady();
  }
  sync(state: AppState, initializing = false) {
    this.dataState = state;
    if (!initializing && !this.sys.isActive()) return;
    this.syncCompetition();
    const room = state.world || worldSize(state.desks);
    if (room.height !== this.worldHeight) {
      const key = `world-${room.height}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, worldCanvas(room.height));
      const previous = this.worldImage?.texture.key;
      this.worldImage?.setTexture(key);
      if (previous && previous !== key) this.textures.remove(previous);
      this.worldHeight = room.height;
      this.cameras.main.setBounds(0, 0, room.width, room.height);
    }
    const layoutKey = JSON.stringify([
      state.desks,
      state.members.map((m) => [m.id, m.name, m.deskId]),
      state.me.id,
    ]);
    if (layoutKey !== this.layoutKey) {
      this.layoutKey = layoutKey;
      this.desks.forEach((d) => d.destroy());
      this.desks = [];
      for (const [deskIndex, d] of state.desks.entries()) {
        const owner = state.members.find((m) => m.deskId === d.id);
        const image = this.add
          .image(d.x, d.y + 58, 'desk')
          .setOrigin(0.5, 1)
          .setScale(WORLD_ART_SCALE)
          .setDepth(d.y + 35)
          .setInteractive({ useHandCursor: true });
        const glow = this.highlight(image, d.x, d.y + 7, 134, 116);
        this.desks.push(glow);
        image.on('pointerdown', (pointer: Phaser.Input.Pointer) =>
          this.pointerAction(pointer, { type: 'desk', memberId: owner?.id }),
        );
        const label = this.add
          .text(
            d.x,
            d.y + 88,
            owner
              ? owner.id === state.me.id
                ? '나의 책상'
                : `${deskIndex + 1}번 자리`
              : '빈 자리',
            {
              fontFamily: 'sans-serif',
              fontSize: '12px',
              color: owner?.id === state.me.id ? '#426c4a' : '#65513a',
              backgroundColor: owner?.id === state.me.id ? '#e2ecc9' : '#e6cda1',
              padding: { x: 8, y: 3 },
            },
          )
          .setOrigin(0.5)
          .setDepth(1);
        this.desks.push(image, label);
      }
    }
    for (const [key, p] of this.players)
      if (!state.members.some((m) => m.id === key && m.status === 'ACTIVE')) {
        p.sprite.destroy();
        p.name.destroy();
        p.shadow.destroy();
        p.dot.destroy();
        this.players.delete(key);
      }
    const usedCharacterTextures = new Set<string>();
    for (const member of state.members.filter((m) => m.status === 'ACTIVE')) {
      let p = this.players.get(member.id);
      const texturePrefix = `char-${CHARACTER_ART_VERSION}-${JSON.stringify(member.appearance)}`;
      for (const direction of ['down', 'up', 'left', 'right'] as Direction[])
        for (let frame = 0; frame < 3; frame++) {
          const key = `${texturePrefix}-${direction}-${frame}`;
          usedCharacterTextures.add(key);
          if (!this.textures.exists(key))
            this.textures.addCanvas(key, characterCanvas(member.appearance, direction, frame));
        }
      const seatKey = `${texturePrefix}-sit`;
      usedCharacterTextures.add(seatKey);
      if (!this.textures.exists(seatKey))
        this.textures.addCanvas(seatKey, characterCanvas(member.appearance, 'up', 0, true));
      if (!p) {
        const d = state.desks.find((d) => d.id === member.deskId);
        const isMe = member.id === state.me.id;
        const spawn = spawnPoint(room);
        const x = isMe ? spawn.x : d?.x || 372,
          y = isMe ? spawn.y : d ? d.y + 81 : 245;
        const sprite = this.add
          .sprite(x, y, `${texturePrefix}-down-0`)
          .setOrigin(0.5, 1)
          .setScale(CHARACTER_SCALE)
          .setInteractive({ useHandCursor: true });
        sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) =>
          this.pointerAction(pointer, { type: 'profile', memberId: member.id }),
        );
        const name = this.add
          .text(x, y - 82, '', {
            fontFamily: 'sans-serif',
            fontSize: '14px',
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
          walkDistance: 0,
        };
        this.players.set(member.id, p);
      }
      if (member.id !== state.me.id && !state.online.includes(member.id)) {
        const assigned = state.desks.find((d) => d.id === member.deskId);
        if (assigned) {
          p.tx = assigned.x;
          p.ty = assigned.y + 81;
          p.sprite.setPosition(p.tx, p.ty);
          p.moving = false;
        }
      }
      p.member = member;
      p.sprite.setData('prefix', texturePrefix);
      p.sprite.setTexture(p.seated ? seatKey : `${texturePrefix}-${p.direction}-0`);
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
    // Sprites have switched to current appearance keys before obsolete canvases are released.
    for (const key of this.textures.getTextureKeys())
      if (key.startsWith('char-') && !usedCharacterTextures.has(key)) this.textures.remove(key);
    const current = this.players.get(state.me.id);
    if (current) this.onPosition(current.sprite.x, current.sprite.y);
  }
  syncCompetition() {
    // The server chooses only the account's active class event. No new movement obstacles.
    const event = this.dataState.competitionEvent;
    const visible = event && !['DRAFT', 'ARCHIVED'].includes(event.state) ? event : undefined;
    const key = JSON.stringify(visible || null);
    if (this.competitionKey === key) return;
    this.competitionKey = key;
    this.competitionObjects.forEach((object) => object.destroy());
    this.competitionObjects = [];
    if (!visible) return;
    for (const [texture, canvas] of [
      ['competition-banner', competitionBannerCanvas()],
      ['competition-board', competitionBoardCanvas()],
      ['competition-board-result', competitionBoardCanvas(true)],
      ['competition-trophy', competitionTrophyCanvas()],
    ] as const)
      if (!this.textures.exists(texture)) this.textures.addCanvas(texture, canvas);
    const title =
      Array.from(visible.name).length > 23
        ? Array.from(visible.name).slice(0, 22).join('') + '…'
        : visible.name;
    const banner = this.add
      .image(560, 16, 'competition-banner')
      .setDepth(3)
      .setInteractive({ useHandCursor: true });
    const bannerText = this.add
      .text(560, 16, title, {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#fff8df',
      })
      .setOrigin(0.5)
      .setDepth(4);
    const result = visible.state === 'RESULTS_PUBLISHED';
    const board = this.add
      .image(790, 108, result ? 'competition-board-result' : 'competition-board')
      .setDepth(3)
      .setInteractive({ useHandCursor: true });
    const caption = this.add
      .text(790, 95, result ? '우리 반의 성취' : 'AI 쇼케이스', {
        fontFamily: 'sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#385b43',
      })
      .setOrigin(0.5)
      .setDepth(4);
    const phase = this.add
      .text(790, 116, competitionStateLabels[visible.state], {
        fontFamily: 'sans-serif',
        fontSize: '11px',
        color: '#635a3d',
      })
      .setOrigin(0.5)
      .setDepth(4);
    const deadline = new Date(
      visible.state === 'JUDGING' ? visible.judgingEndsAt : visible.submissionDueAt,
    ).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' });
    const footer = this.add
      .text(
        790,
        139,
        result
          ? (visible.winners?.[0] || '결과 확인하기').slice(0, 11)
          : visible.state === 'JUDGING'
            ? `${deadline} 심사 마감`
            : `${deadline} 제출 마감`,
        { fontFamily: 'sans-serif', fontSize: '10px', color: '#5f6c4f' },
      )
      .setOrigin(0.5)
      .setDepth(4);
    if (['JUDGING', 'JUDGING_CLOSED', 'RESULTS_PUBLISHED'].includes(visible.state)) {
      const trophy = this.add.image(790, 67, 'competition-trophy').setScale(0.8).setDepth(5);
      this.competitionObjects.push(trophy);
    }
    for (const object of [banner, board])
      object.on('pointerdown', (pointer: Phaser.Input.Pointer) =>
        this.pointerAction(pointer, { type: 'competition' }),
      );
    this.competitionObjects.push(
      banner,
      bannerText,
      board,
      caption,
      phase,
      footer,
      this.highlight(board, 790, 108, 96, 124),
    );
  }
  highlight(
    target: Phaser.GameObjects.GameObject,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    const outline = this.add
      .rectangle(x, y, width, height, 0xf7f3d5, 0.06)
      .setStrokeStyle(2, 0xf8f0c5, 0.95)
      .setDepth(9000)
      .setVisible(false);
    target.on('pointerover', () => outline.setVisible(this.enabled));
    target.on('pointerout', () => outline.setVisible(false));
    target.on('pointerdown', () => outline.setVisible(false));
    return outline;
  }
  recordMovement(point: Point) {
    const anchor =
      this.movementTrail.length > 1
        ? this.movementTrail[this.movementTrail.length - 2]
        : this.sentPosition;
    if (
      this.movementTrail.length &&
      anchor &&
      segmentClear(anchor, point, this.dataState.desks, this.dataState.world)
    )
      this.movementTrail[this.movementTrail.length - 1] = { ...point };
    else this.movementTrail.push({ ...point });
  }
  pointerAction(pointer: Phaser.Input.Pointer, action: GameAction) {
    if (pointer.event?.target instanceof HTMLCanvasElement) this.onAction(action);
  }
  navigate(target: Point) {
    this.pendingSeat = undefined;
    const me = this.players.get(this.dataState.me.id);
    if (me)
      this.path = findPath(
        { x: me.sprite.x, y: me.sprite.y },
        target,
        this.dataState.desks,
        this.dataState.world,
      );
    this.seated = false;
  }
  touchMove(x: number, y: number) {
    this.virtualDirection = { x, y };
    if (x || y) {
      this.path = [];
      this.pendingSeat = undefined;
      this.seated = false;
    }
  }
  sitAt(deskId: string) {
    const desk = this.dataState.desks.find((d) => d.id === deskId);
    if (!desk) return;
    this.navigate({ x: desk.x, y: desk.y + 80 });
    this.pendingSeat = desk.id;
  }
  command(action: 'self' | 'desk' | 'master' | 'zoomIn' | 'zoomOut' | 'sit') {
    const me = this.players.get(this.dataState.me.id);
    if (!me || !this.enabled) return;
    if (action === 'zoomIn' || action === 'zoomOut') {
      this.cameras.main.setZoom(
        Phaser.Math.Clamp(this.cameras.main.zoom + (action === 'zoomIn' ? 0.15 : -0.15), 0.65, 1.8),
      );
      this.onPosition(me.sprite.x, me.sprite.y);
      return;
    }
    this.cameras.main.startFollow(
      me.sprite,
      true,
      this.reducedMotion ? 1 : 0.08,
      this.reducedMotion ? 1 : 0.08,
    );
    if (action === 'sit') {
      if (this.seated) {
        this.seated = false;
        this.pendingSeat = undefined;
      } else if (this.dataState.me.deskId) this.sitAt(this.dataState.me.deskId);
    }
    if (action === 'desk') {
      const d = this.dataState.desks.find((d) => d.id === this.dataState.me.deskId);
      if (d) this.navigate({ x: d.x, y: d.y + 80 });
    }
    if (action === 'master') {
      const master = [...this.players.values()].find((p) => p.member.role === 'MASTER');
      if (master) this.navigate({ x: master.sprite.x, y: master.sprite.y });
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
    if (value.type === 'relocate') {
      const me = this.players.get(this.dataState.me.id);
      if (me) {
        me.sprite.setPosition(value.x!, value.y!);
        this.movementTrail = [];
        this.sentPosition = { x: value.x!, y: value.y! };
        this.path = [];
        this.onPosition(value.x!, value.y!);
      }
      return;
    }
    if (value.type === 'positions') {
      for (const raw of value.players || []) {
        const player = raw as { userId: string; x: number; y: number };
        if (player.userId === this.dataState.me.id) {
          const me = this.players.get(player.userId);
          if (me) {
            me.sprite.setPosition(player.x, player.y);
            this.movementTrail = [];
            this.sentPosition = { x: player.x, y: player.y };
            this.path = [];
            this.onPosition(player.x, player.y);
          }
        } else this.receive({ type: 'move', ...(raw as object) });
      }
      return;
    }
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
    if (!this.sentPosition) this.sentPosition = { x: me.sprite.x, y: me.sprite.y };
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
        this.path = [];
        this.pendingSeat = undefined;
        this.seated = false;
      }
      if (this.virtualDirection.x || this.virtualDirection.y) {
        dx = this.virtualDirection.x;
        dy = this.virtualDirection.y;
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
          if (this.seated) {
            this.seated = false;
            this.pendingSeat = undefined;
          } else this.sitAt(desk.id);
        }
      }
      if (this.path.length && !dx && !dy) {
        const target = this.path[0];
        const distance = Math.hypot(target.x - me.sprite.x, target.y - me.sprite.y);
        if (distance < 4) this.path.shift();
        else {
          dx = (target.x - me.sprite.x) / distance;
          dy = (target.y - me.sprite.y) / distance;
        }
      }
    }
    const length = Math.hypot(dx, dy);
    const speed = (165 * Math.min(delta, 40)) / 1000;
    let distanceMoved = 0;
    if (length > 0) {
      dx /= length;
      dy /= length;
      me.direction =
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      const oldX = me.sprite.x,
        oldY = me.sprite.y;
      if (canStand(oldX + dx * speed, oldY, this.dataState.desks, this.dataState.world)) {
        me.sprite.x += dx * speed;
        if (me.sprite.x !== oldX) this.recordMovement({ x: me.sprite.x, y: me.sprite.y });
      }
      if (canStand(me.sprite.x, oldY + dy * speed, this.dataState.desks, this.dataState.world)) {
        me.sprite.y += dy * speed;
        if (me.sprite.y !== oldY) this.recordMovement({ x: me.sprite.x, y: me.sprite.y });
      }
      if (this.path.length && oldX === me.sprite.x && oldY === me.sprite.y) this.path = [];
      distanceMoved = Math.hypot(me.sprite.x - oldX, me.sprite.y - oldY);
    }
    const seat = this.dataState.desks.find((d) => d.id === this.pendingSeat);
    if (this.enabled && seat && Math.hypot(me.sprite.x - seat.x, me.sprite.y - seat.y - 80) < 5) {
      this.seated = true;
      this.path = [];
      this.pendingSeat = undefined;
      me.direction = 'up';
    }
    me.walkDistance += distanceMoved;
    me.moving = distanceMoved > 0.01 && this.enabled && !typing && !this.seated;
    me.seated = this.seated;
    const pose = JSON.stringify([me.sprite.x, me.sprite.y, me.direction, me.moving, me.seated]);
    if (
      time - this.lastSend > 85 &&
      (pose !== this.lastPose || time - this.lastPoseSentAt > 20000)
    ) {
      this.lastSend = time;
      this.lastPoseSentAt = time;
      this.lastPose = pose;
      this.onMove({
        x: me.sprite.x,
        y: me.sprite.y,
        direction: me.direction,
        moving: me.moving,
        seated: me.seated,
        trail: this.movementTrail.slice(0, 32),
      });
      this.movementTrail = [];
      this.sentPosition = { x: me.sprite.x, y: me.sprite.y };
      this.onPosition(me.sprite.x, me.sprite.y);
    }
    const priority = (p: Player) =>
      p.member.id === this.dataState.me.id
        ? 0
        : p.member.role === 'MASTER'
          ? 1
          : p.member.help
            ? 2
            : this.dataState.online.includes(p.member.id)
              ? 3
              : 4;
    const ordered = [...this.players].sort(([, a], [, b]) => priority(a) - priority(b));
    for (const [key, p] of ordered) {
      if (key !== this.dataState.me.id) {
        const beforeX = p.sprite.x,
          beforeY = p.sprite.y;
        p.sprite.x = Phaser.Math.Linear(p.sprite.x, p.tx, Math.min(1, delta * 0.012));
        p.sprite.y = Phaser.Math.Linear(p.sprite.y, p.ty, Math.min(1, delta * 0.012));
        p.walkDistance += Math.hypot(p.sprite.x - beforeX, p.sprite.y - beforeY);
      }
    }
    const camera = this.cameras.main,
      scale = 1 / Math.max(0.8, camera.zoom);
    const placements = this.nameplateLayout.layout(
      ordered
        .filter(([, p]) => camera.worldView.contains(p.sprite.x, p.sprite.y - 35))
        .map(([id, p]) => ({
          id,
          anchor: {
            x: p.sprite.x,
            y: p.sprite.y - 84 - (p.seated ? 32 : 0),
            width: p.name.width * scale,
            height: p.name.height * scale,
          },
        })),
      camera.worldView,
    );
    for (const [key, p] of ordered) {
      const prefix = p.sprite.getData('prefix') as string;
      const frame =
        p.moving && !this.reducedMotion ? [0, 1, 0, 2][Math.floor(p.walkDistance / 18) % 4] : 0;
      p.sprite.setOrigin(0.5, p.seated ? 1 + 32 / (CHARACTER_HEIGHT * CHARACTER_SCALE) : 1);
      const texture = p.seated ? `${prefix}-sit` : `${prefix}-${p.direction}-${frame}`;
      if (p.sprite.texture.key !== texture) p.sprite.setTexture(texture);
      p.sprite.setDepth(p.sprite.y - (p.seated ? 40 : 0));
      const visible = this.cameras.main.worldView.contains(p.sprite.x, p.sprite.y - 35);
      p.sprite.setVisible(visible);
      p.shadow.setVisible(visible);
      p.name.setVisible(visible);
      p.dot.setVisible(visible);
      p.name.setScale(scale);
      const placement = placements.get(key);
      p.name.setVisible(!!placement);
      p.dot.setVisible(!!placement);
      const labelY = placement?.y ?? p.sprite.y - 84;
      p.name.setPosition(placement?.x ?? p.sprite.x, labelY).setDepth(10000 + labelY);
      p.shadow.setPosition(p.sprite.x, p.sprite.y - 2).setDepth(p.sprite.y - 1);
      p.dot.setPosition(placement?.x ?? p.sprite.x, labelY - 8).setDepth(10001 + labelY);
    }
  }
}
export const gameConfig = (
  parent: HTMLElement,
  scene: ClassroomScene,
): Phaser.Types.Core.GameConfig => {
  const mobile = window.matchMedia('(max-width: 720px)').matches;
  return {
    type: Phaser.CANVAS,
    parent,
    width: mobile ? parent.clientWidth : WORLD.width,
    height: mobile ? parent.clientHeight : WORLD.height,
    backgroundColor: '#b4c6a6',
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    scale: {
      mode: mobile ? Phaser.Scale.RESIZE : Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene,
    render: { antialias: false },
    audio: { noAudio: true },
  };
};
