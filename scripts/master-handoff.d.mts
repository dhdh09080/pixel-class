export interface MasterHandoffInput {
  operationId: string;
  email: string;
  passwordHash: string;
  expectedAccessDigest: string;
}
export function handoffMaster(
  database: string,
  input: MasterHandoffInput,
  accessSecret: string | undefined,
): Promise<{
  ok: true;
  applied: boolean;
  alreadyApplied: boolean;
  backupVerified?: true;
  accessMatchesExpected: boolean;
}>;
