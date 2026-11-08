import type { AIMessage } from '../shared/types.js';

export function aiLimits(env: Record<string, string | undefined>) {
  const integer = (name: string, fallback: number, max: number) => {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    if (!/^[1-9]\d*$/.test(raw) || Number(raw) > max)
      throw new Error(`${name} must be an integer between 1 and ${max}.`);
    return Number(raw);
  };
  return {
    schoolDailyCalls: integer('AI_SCHOOL_DAILY_CALLS', 60, 1000),
    concurrentCalls: integer('AI_MAX_CONCURRENT', 2, 10),
  };
}

/** Bounded context is a cost guard, not a dollar budget or a token estimate.
 * Keep the newest question and recent complete messages before older history. */
export function mentoringInput(
  context: string,
  messages: AIMessage[],
  redact: (s: string) => string,
) {
  const history = messages.filter((m) => m.role !== 'error').slice(-10);
  let remaining = 16000;
  const recent: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const message of history.toReversed()) {
    if (remaining <= 0) break;
    const content = redact(message.text).slice(0, Math.min(4000, remaining));
    recent.unshift({ role: message.role as 'user' | 'assistant', content });
    remaining -= content.length;
  }
  // A dedicated 6000-character project allowance cannot displace the current question.
  return [{ role: 'user' as const, content: redact(context).slice(0, 6000) }, ...recent];
}
