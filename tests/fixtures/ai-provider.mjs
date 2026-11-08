// Deterministic local provider substitute, loaded only by the isolated QA process.
// This fixture never makes a network request or represents a real model response.
import { existsSync, writeFileSync } from 'node:fs';
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (String(input) !== 'https://api.openai.com/v1/responses') return original(input, init);
  writeFileSync(process.env.AI_TEST_MARKER, JSON.stringify(init.body));
  for (let i = 0; i < 400 && !existsSync(process.env.AI_TEST_RELEASE); i++)
    await new Promise((r) => setTimeout(r, 10));
  return new Response(
    JSON.stringify({ output: [{ content: [{ text: 'TEST STUB — 실제 모델 응답이 아닙니다.' }] }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
