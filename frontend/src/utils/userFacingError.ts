const unsafeDetailPattern =
  /(\bhttp\s*\d{3}\b|[{}`]|stack=|access[_-]?token|authorization|bearer|secret|password|client[_-]?secret|signed|sig=|sas|x-amz-|at\s+\w+\.)/i;

export function toUserFacingError(error: unknown, action: string): string {
  if (typeof error === 'string' && isCuratedMessage(error)) {
    return error;
  }

  if (error instanceof Error && isCuratedMessage(error.message)) {
    return error.message;
  }

  return `${action} failed. Try again or contact an administrator if this keeps happening.`;
}

function isCuratedMessage(message: string): boolean {
  const normalized = message.trim();
  return normalized.length > 0 && normalized.length <= 140 && !unsafeDetailPattern.test(normalized);
}
