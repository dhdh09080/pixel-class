export const approvalRegistrationEnabled = () => process.env.APPROVAL_REGISTRATION_ENABLED === 'true';
export function isPublicEnrollmentRequest(method: string, path: string, enabled = approvalRegistrationEnabled()) {
  if (!enabled) return false;
  if (method === 'GET') return ['/join', '/api/enrollment/config', '/api/enrollment/session'].includes(path);
  return method === 'POST' && ['/api/enrollment/register', '/api/enrollment/login', '/api/enrollment/logout', '/api/enrollment/enter', '/api/enrollment/recover'].includes(path);
}
