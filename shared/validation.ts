import { z } from 'zod';
export const httpUrl = z.union([
  z.literal(''),
  z.url().refine((v) => /^https?:\/\//.test(v), 'http/https 링크만 입력해 주세요.'),
]);
export const analysisSchema = z.object({
  productType: z.enum(['', 'WEB', 'DESKTOP', 'AUTOMATION']),
  frontend: z.boolean().nullable(),
  backend: z.boolean().nullable(),
  database: z.boolean().nullable(),
  externalApi: z.boolean().nullable(),
  aiModel: z.boolean().nullable(),
  deployment: z.boolean().nullable(),
  difficulty: z.enum(['', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED']),
});
export const roadmapSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(100),
      text: z.string().trim().min(1).max(200),
      description: z.string().max(2000),
      done: z.boolean(),
    }),
  )
  .max(60)
  .refine(
    (steps) => new Set(steps.map((s) => s.id)).size === steps.length,
    '단계 ID가 중복됩니다.',
  );
export const workLogSchema = z.object({
  completed: z.string().max(4000),
  inProgress: z.string().max(4000),
  next: z.string().max(4000),
  blockers: z.string().max(4000),
  references: z.string().max(4000),
});
export const submissionSchema = z.object({
  overview: z.string().trim().min(1).max(4000),
  serviceUrl: httpUrl,
  githubUrl: httpUrl,
  features: z.string().max(4000),
  aiTools: z.string().max(1000),
  lessons: z.string().max(4000),
  attachmentIds: z.array(z.string().max(100)).max(10),
});
export const questionStatusSchema = z.enum(['NEW', 'ACKNOWLEDGED', 'ANSWERED', 'RESOLVED']);
