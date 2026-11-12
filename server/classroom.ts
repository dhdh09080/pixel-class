import { get, list, put, members, id } from './db.js';
import type { Desk, Member } from '../shared/types.js';
import { worldSize, nextDeskSlot, type WorldSize } from '../shared/world.js';
export function roomSize(schoolId: string, desks = list<Desk>('desk', schoolId)): WorldSize {
  const saved = get<WorldSize>('classroom', `room-${schoolId}`, schoolId);
  const next = worldSize(desks, saved);
  if (!saved || saved.height !== next.height)
    put('classroom', { id: `room-${schoolId}`, ...next }, schoolId);
  return next;
}
export function allocateDesk(user: Member) {
  const taken = new Set(
    members(user.schoolId)
      .filter((m) => m.id !== user.id)
      .map((m) => m.deskId),
  );
  const desks = list<Desk>('desk', user.schoolId);
  let desk =
    desks.find((d) => d.id === user.previousDeskId && !taken.has(d.id)) ||
    desks.find((d) => !taken.has(d.id));
  if (!desk) {
    const slot = nextDeskSlot(desks);
    if (!slot) throw new Error('교실 확장 가능한 책상 영역이 모두 사용 중입니다.');
    desk = { id: id(), schoolId: user.schoolId, ...slot };
    put('desk', desk, user.schoolId);
  }
  user.deskId = desk.id;
  roomSize(user.schoolId);
}
