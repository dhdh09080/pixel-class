import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error Plain Node deployment helper is also exercised against real local Git remotes.
import { promoteRailway, deploymentBranch } from '../scripts/promote-railway.mjs';

function fixture(
  run: (git: (...args: string[]) => string, commit: (text: string) => string, cwd: string) => void,
) {
  const cwd = mkdtempSync(join(tmpdir(), 'pixel-deploy-git-'));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init', '--bare', join(cwd, 'remote.git'));
    git('init', '--initial-branch=main', join(cwd, 'work'));
    const work = join(cwd, 'work');
    const workGit = (...args: string[]) =>
      execFileSync('git', args, {
        cwd: work,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    workGit('config', 'user.name', 'Deployment QA');
    workGit('config', 'user.email', 'deployment@example.test');
    workGit('remote', 'add', 'origin', join(cwd, 'remote.git'));
    const commit = (text: string) => {
      writeFileSync(join(work, 'fixture.txt'), text);
      workGit('add', 'fixture.txt');
      workGit('commit', '-m', text);
      return workGit('rev-parse', 'HEAD');
    };
    commit('initial');
    workGit('push', 'origin', 'main');
    run(workGit, commit, work);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test('verified main creates and fast-forwards the deployment branch without force', () =>
  fixture((git, commit, cwd) => {
    const first = git('rev-parse', 'HEAD');
    assert.equal(promoteRailway({ cwd, commit: first }).status, 'promoted');
    assert.equal(promoteRailway({ cwd, commit: first }).status, 'unchanged');
    const next = commit('verified update');
    git('push', 'origin', 'main');
    assert.equal(promoteRailway({ cwd, commit: next }).status, 'promoted');
    assert.equal(git('ls-remote', '--heads', 'origin', deploymentBranch).split(/\s/)[0], next);
  }));

test('a delayed old workflow cannot publish over newer main or deployment history', () =>
  fixture((git, commit, cwd) => {
    const old = git('rev-parse', 'HEAD');
    const next = commit('newer main');
    git('push', 'origin', 'main');
    promoteRailway({ cwd, commit: next });
    assert.equal(promoteRailway({ cwd, commit: old }).status, 'superseded');
    assert.equal(git('ls-remote', '--heads', 'origin', deploymentBranch).split(/\s/)[0], next);
  }));

test('diverged deployment history is preserved and requires explicit repair', () =>
  fixture((git, commit, cwd) => {
    const main = git('rev-parse', 'HEAD');
    git('switch', '-c', deploymentBranch);
    const divergent = commit('independent deployment change');
    git('push', 'origin', deploymentBranch);
    git('switch', 'main');
    assert.throws(() => promoteRailway({ cwd, commit: main }), /diverged/);
    assert.equal(git('ls-remote', '--heads', 'origin', deploymentBranch).split(/\s/)[0], divergent);
  }));

test('invalid deployment SHAs are rejected before Git is invoked', () => {
  for (const commit of ['', undefined, 'main', '--force', 'a'.repeat(39)])
    assert.throws(() => promoteRailway({ cwd: '/nonexistent', commit }), /full verified commit/);
});
