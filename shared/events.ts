import type { Appearance } from './types';
/** Versioned server-origin events shared by web and the future Tauri client. */
type Payloads = {
  'character.updated': { name: string; appearance: Appearance };
  'mentor.feedback.created': {
    projectId: string;
    feedbackId: string;
    mentorName: string;
    preview: string;
  };
  'master.message.created': { messageId: string; senderName: string; preview: string };
  'project.reviewed': { projectId: string; title: string; approved: boolean };
  'help.requested': { memberId: string; name: string };
};
export type PersonalEvent = {
  [K in keyof Payloads]: {
    version: 1;
    id: string;
    schoolId: string;
    userId: string;
    type: K;
    payload: Payloads[K];
    createdAt: string;
    readAt: string | null;
  };
}[keyof Payloads];
export type PersonalEventInput = {
  [K in keyof Payloads]: { type: K; payload: Payloads[K] };
}[keyof Payloads];
export type ClassroomPosition = {
  userId: string;
  x: number;
  y: number;
  direction: 'up' | 'down' | 'left' | 'right';
  moving: boolean;
  seated: boolean;
};
export type ClassroomEvent =
  | { type: 'refresh' }
  | { type: 'online'; online: string[] }
  | ({ type: 'move' } & ClassroomPosition)
  | { type: 'positions'; players: ClassroomPosition[] }
  | { type: 'personal-event'; event: PersonalEvent };
