export type BackupInfo = {
  state: 'missing' | 'unverified' | 'verified' | 'stale';
  sizeBytes: number;
  sha256: string | null;
  verifiedAt: string | null;
  lastAttemptAt: string | null;
  lastFailure: string | null;
  storageLocation: 'same-volume';
  externallyStored: false;
};
export type OperationsStatus = {
  observedAt: string;
  lastExport: { fileName: string; sha256: string; preparedAt: string } | null;
  usedBytes: number;
  limitBytes: number;
  freeBytes: number;
  backupAt: string | null;
  backup: BackupInfo;
  runtime: {
    uptimeSeconds: number;
    rssBytes: number;
    heapUsedBytes: number;
    databaseBytes: number;
    walBytes: number;
    database: 'sqlite';
    instances: 1;
  };
  ai: {
    enabled: boolean;
    configured: boolean;
    usedToday: number;
    dailyLimit: number;
    maxConcurrent: number;
  };
};
