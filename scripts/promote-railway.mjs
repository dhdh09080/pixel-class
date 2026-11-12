import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { appendFileSync } from 'node:fs';

export const deploymentBranch = 'deploy/railway-verified';

/** Called only by the trusted main workflow after the complete verification job. */
export function promoteRailway({ commit, cwd = process.cwd() }) {
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw Error('A full verified commit SHA is required.');
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('fetch', '--no-tags', 'origin', 'main');
  if (git('rev-parse', 'FETCH_HEAD') !== commit) return { status: 'superseded', commit };
  const ref = 'refs/heads/' + deploymentBranch;
  const previous = git('ls-remote', '--heads', 'origin', ref).split(/\s/)[0];
  if (previous === commit) return { status: 'unchanged', commit };
  if (previous) {
    git('fetch', '--no-tags', 'origin', ref);
    const ancestry = spawnSync('git', ['merge-base', '--is-ancestor', previous, commit], { cwd });
    if (ancestry.status !== 0)
      throw Error('Deployment branch diverged; refusing to overwrite its history.');
  }
  git('push', 'origin', `${commit}:${ref}`);
  return { status: 'promoted', commit, branch: deploymentBranch };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = promoteRailway({ commit: process.env.GITHUB_SHA });
    console.log(JSON.stringify(result));
    if (process.env.GITHUB_OUTPUT && result.status !== 'superseded')
      appendFileSync(process.env.GITHUB_OUTPUT, `commit=${result.commit}\n`);
  } catch {
    console.error(
      'Verified deployment promotion failed. Inspect branch permissions and ancestry; no force push is used.',
    );
    process.exitCode = 1;
  }
}
