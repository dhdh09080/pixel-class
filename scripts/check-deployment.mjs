import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { deploymentIssues } from '../shared/deployment.ts';
import { aiLimits } from '../server/ai-policy.ts';

// Read-only inspection. Never starts, recreates, deletes, or publishes a service.
const args = process.argv.slice(2);
const take = (flag) => {
  const i = args.indexOf(flag);
  return i < 0 ? undefined : args[i + 1];
};
try {
  const file = take('--env-file');
  if (!file)
    throw Error(
      'Usage: npm run deploy:check -- --env-file /private/compose.env [--local] [--ai] [--compose-file OVERRIDE]',
    );
  const local = args.includes('--local');
  const compose = ['compose', '--env-file', resolve(file), '-f', 'compose.yaml'];
  if (args.includes('--ai')) compose.push('-f', 'deploy/compose.ai.yaml');
  if (local) compose.push('-f', 'deploy/compose.test.yaml');
  for (let i = 0; i < args.length; i++)
    if (args[i] === '--compose-file') {
      if (!args[i + 1] || args[i + 1].startsWith('--'))
        throw Error('OVERRIDE: --compose-file requires a path.');
      compose.push('-f', resolve(args[++i]));
    }
  compose.push('config', '--format', 'json');
  const env = { ...process.env };
  for (const key of [
    'DOCKER_HOST',
    'DOCKER_CONTEXT',
    'DOCKER_TLS',
    'DOCKER_TLS_VERIFY',
    'DOCKER_CERT_PATH',
  ])
    delete env[key];
  const result = spawnSync('docker', ['--host=unix:///var/run/docker.sock', ...compose], {
    env,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  // Compose errors may contain interpolated values. Do not echo raw output.
  if (result.status !== 0)
    throw Error(
      'COMPOSE: cannot resolve configuration; check required paths, domain and Compose version. Values were not printed.',
    );
  const config = JSON.parse(result.stdout);
  const issues = deploymentIssues(config, local);
  const runtime = config.services?.app?.environment || {};
  aiLimits(runtime);
  for (const name of [
    ...(runtime.MASTER_BOOTSTRAP_KEY_FILE ? ['master_bootstrap'] : []),
    'staging_access',
    ...(runtime.OPENAI_API_KEY_FILE ? ['openai_api_key'] : []),
  ]) {
    const path = config.secrets?.[name]?.file;
    if (!path) {
      issues.push(`SECRET_FILE: ${name} is missing.`);
      continue;
    }
    try {
      const stat = statSync(path);
      const value = readFileSync(path, 'utf8').trim();
      if (!stat.isFile() || stat.mode & 0o077 || !value) throw Error();
      if (name !== 'staging_access' && (stat.uid !== 1000 || !(stat.mode & 0o400)))
        issues.push(`SECRET_UID: ${name} must be readable by app UID 1000 only.`);
      if (name === 'master_bootstrap' && value.length < 32)
        issues.push('BOOTSTRAP: use at least 32 random characters.');
      if (
        name === 'staging_access' &&
        !/^basic_auth\s*\{\s*[A-Za-z0-9_-]+\s+\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}\s*\}$/.test(value)
      )
        issues.push('GATE: staging_access needs a bcrypt basic_auth block.');
    } catch {
      issues.push(
        `SECRET_FILE: ${name} must be a nonempty regular file without group/world permissions.`,
      );
    }
  }
  if (issues.length) {
    for (const issue of issues) console.error(issue);
    process.exitCode = 1;
  } else
    console.log(
      JSON.stringify({
        ok: true,
        scope: local ? 'local configuration only' : 'external host configuration only',
        ai: Boolean(runtime.OPENAI_API_KEY_FILE && runtime.OPENAI_MODEL),
        deployed: false,
        next: 'DNS/TLS, firewall, external backup and two-computer acceptance checks are still required.',
      }),
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
