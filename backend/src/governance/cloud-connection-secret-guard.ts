const secretFieldNamePattern =
  /(access[_-]?key|client[_-]?secret|private[_-]?key|secret[_-]?access[_-]?key|session[_-]?token|password|service[_-]?account)/i;
const secretValuePattern =
  /(AKIA|ASIA)[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"private_key"|"client_secret"|"type"\s*:\s*"service_account"/i;
const secretQueryKeys = new Set([
  'access_token',
  'awsaccesskeyid',
  'client_secret',
  'code',
  'password',
  'se',
  'sig',
  'signature',
  'sp',
  'sr',
  'st',
  'sv',
  'token',
  'x-amz-credential',
  'x-amz-security-token',
  'x-amz-signature'
]);

export function findCloudConnectionSecretMaterial(input: Record<string, unknown>): string[] {
  const findings = new Set<string>();
  visit(input, [], findings);
  return [...findings].sort();
}

function visit(value: unknown, path: string[], findings: Set<string>): void {
  if (typeof value === 'string') {
    inspectString(value, path, findings);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, [...path, String(index)], findings));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      visit(child, [...path, key], findings);
    }
  }
}

function inspectString(value: string, path: string[], findings: Set<string>): void {
  const field = path[path.length - 1] ?? 'value';
  const location = path.join('.') || field;
  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }
  if (secretFieldNamePattern.test(field) || secretValuePattern.test(trimmed) || hasBase64CredentialBlob(trimmed)) {
    findings.add(location);
    return;
  }
  if (hasSecretBearingUrl(trimmed, field)) {
    findings.add(location);
  }
}

function hasSecretBearingUrl(value: string, field: string): boolean {
  try {
    const url = new URL(value);
    if (field === 'billingExportUri' && (url.search || url.hash)) {
      return true;
    }
    for (const key of url.searchParams.keys()) {
      if (secretQueryKeys.has(key.toLowerCase())) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function hasBase64CredentialBlob(value: string): boolean {
  const compact = value.replace(/\s+/g, '');
  if (compact.length < 120 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    return false;
  }
  try {
    const decoded = Buffer.from(compact, 'base64').toString('utf8');
    return secretValuePattern.test(decoded) || /aws_access_key_id|private_key|client_secret|service_account/i.test(decoded);
  } catch {
    return false;
  }
}
