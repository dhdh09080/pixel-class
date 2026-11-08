type Service = {
  image?: string;
  ports?: { target?: number; host_ip?: string }[];
  network_mode?: string;
  secrets?: (string | { source: string; target?: string })[];
  privileged?: boolean;
  read_only?: boolean;
  cap_drop?: string[];
  security_opt?: string[];
  scale?: number;
  deploy?: { replicas?: number };
  environment?: Record<string, string>;
  volumes?: { type?: string; source?: string; target?: string; read_only?: boolean }[];
};
export type DeploymentConfig = { services: Record<string, Service> };

/** Inspect the resolved Compose model, not just defaults in an example file. */
export function deploymentIssues(config: DeploymentConfig, local = false) {
  const issues: string[] = [];
  const loopback = (value: string) => {
    const host = value.toLowerCase().replace(/^\[|\]$/g, '');
    return (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === '::1' ||
      /^127(?:\.\d{1,3}){3}$/.test(host) ||
      host.startsWith('::ffff:127.')
    );
  };
  const app = config.services?.app,
    gateway = config.services?.https;
  if (!app || !gateway) return ['SERVICES: app and https are required.'];
  const env = app.environment || {};
  const mounted = (service: Service, source: string, target = source) =>
    service.secrets?.some((secret) =>
      typeof secret === 'string'
        ? secret === source && source === target
        : secret.source === source && (secret.target || secret.source) === target,
    );
  if (!mounted(gateway, 'staging_access'))
    issues.push('GATE_MOUNT: the gateway must mount its staging access secret.');
  for (const [variable, secret] of [
    ['MASTER_BOOTSTRAP_KEY_FILE', 'master_bootstrap'],
    ['OPENAI_API_KEY_FILE', 'openai_api_key'],
  ])
    if (env[variable] && (env[variable] !== `/run/secrets/${secret}` || !mounted(app, secret)))
      issues.push(`SECRET_MOUNT: ${variable} must match its active server-only mount.`);

  if (app.ports?.length || app.network_mode === 'host')
    issues.push('APP_PORT: app must not publish a port or use host networking.');
  if ((app.scale ?? 1) !== 1 || (app.deploy?.replicas ?? 1) !== 1)
    issues.push('REPLICAS: SQLite requires one application instance.');
  if (
    !app.read_only ||
    app.privileged ||
    !app.cap_drop?.includes('ALL') ||
    !app.security_opt?.some((v) => /^no-new-privileges(?::true)?$/.test(v))
  )
    issues.push(
      'SANDBOX: app needs read-only root, no privileges, dropped capabilities and no-new-privileges.',
    );
  const data = app.volumes?.filter(
    (v) => v.type === 'volume' && v.target === '/app/data' && !v.read_only,
  );
  if (
    data?.length !== 1 ||
    !data[0].source ||
    app.volumes?.some((v) => v.target?.startsWith('/app/data/')) ||
    !/^\/app\/data\/[^/]+\.sqlite$/.test(env.DATABASE_PATH || '')
  )
    issues.push(
      'STORAGE: one persistent data volume and a SQLite path inside /app/data are required.',
    );
  if (
    env.NODE_ENV !== 'production' ||
    env.DEMO_MODE !== 'false' ||
    env.COOKIE_SECURE !== 'true' ||
    env.TRUST_PROXY_HOPS !== '1' ||
    env.ALLOW_INSECURE_LOCALHOST === 'true'
  )
    issues.push(
      'RUNTIME: require production, private accounts, Secure cookies and exactly one trusted proxy.',
    );
  try {
    const url = new URL(env.PUBLIC_ORIGIN);
    if (
      url.origin !== env.PUBLIC_ORIGIN ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (!local && (loopback(url.hostname) || ['0.0.0.0', '[::]'].includes(url.hostname)))
    )
      throw Error();
  } catch {
    issues.push('ORIGIN: exact HTTPS origin required; localhost is only valid with --local.');
  }
  const https = gateway.ports?.filter((p) => p.target === 443) || [];
  if (!https.length || (!local && https.every((p) => loopback(p.host_ip || ''))))
    issues.push(
      'INGRESS: remote clients need HTTPS bound to the intended external or VPN interface.',
    );
  if (
    !local &&
    !(
      /@sha256:[a-f0-9]{64}$/.test(app.image || '') || /^sha256:[a-f0-9]{64}$/.test(app.image || '')
    )
  )
    issues.push('IMAGE: external release requires an immutable application image digest.');
  if (env.MASTER_BOOTSTRAP_KEY || env.OPENAI_API_KEY)
    issues.push('SECRETS: use server-only files instead of plaintext Compose environment values.');
  if (Boolean(env.OPENAI_API_KEY_FILE) !== Boolean(env.OPENAI_MODEL))
    issues.push('AI_PAIR: configure both AI key file and model, or neither.');
  return issues;
}
