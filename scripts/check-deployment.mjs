import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { deploymentIssues } from '../shared/deployment.ts';
import { aiLimits } from '../server/ai-policy.ts';

// Read-only inspection plus an offline, disposable runtime validator. Never starts or publishes the app service.
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
      if (!stat.isFile() || stat.mode & 0o077 || !stat.size) throw Error();
      if (name !== 'staging_access' && (stat.uid !== 1000 || !(stat.mode & 0o400)))
        issues.push(`SECRET_UID: ${name} must be readable by app UID 1000 only.`);
      if (name === 'master_bootstrap' && stat.size < 32)
        issues.push('BOOTSTRAP: use at least 32 random characters.');
      if (
        name === 'staging_access' &&
        !/^basic_auth\s*\{\s*[A-Za-z0-9_-]+\s+\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}\s*\}$/.test(
          readFileSync(path, 'utf8').trim(),
        )
      )
        issues.push('GATE: staging_access needs a bcrypt basic_auth block.');
    } catch {
      issues.push(
        `SECRET_FILE: ${name} must be a nonempty regular file without group/world permissions.`,
      );
    }
  }
  if (!issues.length) {
    // A CI/operator UID must not need permission to read app-only 0400 secrets.
    // Validate them as the app UID without mounting the school database, using
    // a networkless, read-only process that imports config only (no server/db).
    const validatorName = `pixel-preflight-${randomBytes(8).toString('hex')}`;
    const validate = [
      '--host=unix:///var/run/docker.sock',
      'run',
      '--rm',
      '--name',
      validatorName,
      '--network',
      'none',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges:true',
      '--user',
      '1000:1000',
      '--pids-limit',
      '64',
      '--memory',
      '256m',
      '--tmpfs',
      '/tmp:size=16m,mode=1777',
      '--tmpfs',
      '/app/data:size=16k,mode=0700',
    ];
    for (const key of [
      'NODE_ENV',
      'DEMO_MODE',
      'HOST',
      'COOKIE_SECURE',
      'PUBLIC_ORIGIN',
      'DATABASE_PATH',
      'TRUST_PROXY_HOPS',
      'MASTER_BOOTSTRAP_KEY_FILE',
      'OPENAI_API_KEY_FILE',
      'OPENAI_MODEL',
      'AI_SCHOOL_DAILY_CALLS',
      'AI_MAX_CONCURRENT',
    ])
      if (runtime[key] !== undefined) validate.push('--env', `${key}=${runtime[key]}`);
    for (const [variable, name] of [
      ['MASTER_BOOTSTRAP_KEY_FILE', 'master_bootstrap'],
      ['OPENAI_API_KEY_FILE', 'openai_api_key'],
    ])
      if (runtime[variable])
        validate.push(
          '--mount',
          `type=bind,src=${config.secrets[name].file},dst=/run/secrets/${name},readonly`,
        );
    validate.push(
      '--entrypoint',
      'node',
      config.services.app.image,
      '--import',
      'tsx',
      '-e',
      "import('./server/runtime.ts').catch(()=>process.exit(1))",
    );
    try {
      const checked = spawnSync('docker', validate, { env, encoding: 'utf8', timeout: 30000 });
      if (checked.status !== 0)
        issues.push(
          'RUNTIME_SECRETS: offline app-UID validation failed; check file contents, image and app configuration. Values were not printed.',
        );
    } finally {
      // A killed Docker CLI must not leave its validator running. Only our random name is removed.
      spawnSync('docker', ['--host=unix:///var/run/docker.sock', 'rm', '--force', validatorName], {
        env,
        encoding: 'utf8',
        timeout: 10000,
      });
    }
  }
  if (issues.length) {
    for (const issue of issues) console.error(issue);
    process.exitCode = 1;
  } else
    console.log(
      JSON.stringify({
        ok: true,
        scope: local
          ? 'local configuration and offline runtime validation'
          : 'external host configuration and offline runtime validation',
        runtimeSecretsValidated: true,
        ai: Boolean(runtime.OPENAI_API_KEY_FILE && runtime.OPENAI_MODEL),
        deployed: false,
        next: 'DNS/TLS, firewall, external backup and two-computer acceptance checks are still required.',
      }),
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
