import assert from 'node:assert/strict';

/** Read-only proof that the deployed public UI contains this release's judge-progress feature. */
export async function verifyPublicRelease(base, html, fetcher = fetch) {
  const entryAsset = html.match(
    /<script[^>]+src="(\/competition-assets\/[A-Za-z0-9_-]+\.js)"/i,
  )?.[1];
  assert.ok(entryAsset, 'The public entry must use the same-origin competition asset namespace.');
  const options = { signal: AbortSignal.timeout(10000) };
  const entry = await fetcher(new URL(entryAsset, base), options);
  assert.equal(entry.status, 200, 'The public entry asset must load without a school session.');
  const code = await entry.text();
  const component = code.match(/PublicCompetition-[A-Za-z0-9_-]+\.js/)?.[0];
  assert.ok(component, 'The public entry must reference the competition screen.');
  const featureAsset = '/competition-assets/' + component;
  const response = await fetcher(new URL(featureAsset, base), {
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200, 'The current public competition module must be available.');
  assert.match(
    await response.text(),
    /다음 미평가 작품/,
    'The deployed UI is missing the current judge-progress feature.',
  );
  return { entryAsset, featureAsset };
}
