import { defineRailway, project, service, github, volume, preserve } from 'railway/iac';

// Scoped IaC: review `railway config plan` before apply. Never manage unrelated resources.
export const partial = 'pixel-class';
export default defineRailway(() => {
  const data = volume('school-data', { sizeMB: 1024 });
  const app = service('pixel-class', {
    source: github('dhdh09080/pixel-class', { branch: 'main', checkSuites: true }),
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
    replicas: 1,
    healthcheck: '/api/health',
    healthcheckTimeout: 60,
    deploy: {
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 5,
      sleepApplication: false,
      requiredMountPath: '/app/data',
      overlapSeconds: 0,
      drainingSeconds: 15,
    },
    volumeMounts: { '/app/data': data },
    // Generated HTTPS domain must be created separately; no raw TCP proxy or CDN.
    env: {
      PIXEL_RUNTIME: 'railway',
      NODE_ENV: 'production',
      DEMO_MODE: 'false',
      HOST: '0.0.0.0',
      PORT: '8080',
      COOKIE_SECURE: 'true',
      TRUST_PROXY_HOPS: '1',
      DATABASE_PATH: '/app/data/school.sqlite',
      DATABASE_MODE: 'existing',
      RAILWAY_RUN_UID: '0',
      AI_ENABLED: 'false',
      AI_SCHOOL_DAILY_CALLS: '3',
      AI_MAX_CONCURRENT: '1',
      PUBLIC_ORIGIN: preserve(),
      MASTER_BOOTSTRAP_KEY: { preserveExisting: true, isSealed: true },
      STAGING_ACCESS_KEY: { preserveExisting: true, isSealed: true },
    },
  });
  return project('pixel-class', { resources: [app, data] });
});
