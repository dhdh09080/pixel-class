/** Local store used by existing synchronous SQLite unit-of-work services. Every read is school scoped. */
export interface RecordRepository {
  readonly backend: 'sqlite';
  get<T>(kind: string, id: string, schoolId: string): T | undefined;
  list<T>(kind: string, schoolId: string): T[];
  put<T extends { id: string }>(kind: string, record: T, schoolId: string): void;
  remove(kind: string, id: string, schoolId: string): void;
}
/** Future network adapter port. Services must await it; admission/status changes require transactional RPCs. */
export interface RemoteRecordRepository {
  readonly backend: 'postgres' | 'supabase';
  get<T>(kind: string, id: string, schoolId: string): Promise<T | undefined>;
  list<T>(kind: string, schoolId: string): Promise<T[]>;
  put<T extends { id: string }>(kind: string, record: T, schoolId: string): Promise<void>;
  remove(kind: string, id: string, schoolId: string): Promise<void>;
  admit(command: {
    schoolId: string;
    profileId: string;
    keyHash: string;
  }): Promise<{ deskId: string }>;
  changeMembership(command: {
    schoolId: string;
    profileId: string;
    actorId: string;
    status: string;
    reason: string;
    releaseDesk: boolean;
  }): Promise<void>;
}
