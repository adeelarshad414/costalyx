import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultPort = 8080;
const defaultRoot = process.cwd();

export function buildSecurityHeaders(env = process.env) {
  const connectOrigins = [
    ...parseOriginList(env.COSTALYX_FRONTEND_CONNECT_ORIGINS),
    normalizeOrigin(env.VITE_API_BASE_URL),
    normalizeOrigin(env.VITE_KEYCLOAK_URL)
  ].filter(Boolean);
  const frameOrigins = [normalizeOrigin(env.VITE_KEYCLOAK_URL)].filter(Boolean);
  const connectSrc = unique(["'self'", ...connectOrigins]).join(' ');
  const frameSrc = unique(["'self'", ...frameOrigins]).join(' ');

  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      `connect-src ${connectSrc}`,
      `frame-src ${frameSrc}`,
      "worker-src 'self'",
      "manifest-src 'self'"
    ].join('; '),
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  };
}

export function createStaticServer({ root = defaultRoot, env = process.env } = {}) {
  const absoluteRoot = path.resolve(root);
  const securityHeaders = buildSecurityHeaders(env);

  return createServer(async (request, response) => {
    try {
      for (const [name, value] of Object.entries(securityHeaders)) {
        response.setHeader(name, value);
      }

      const filePath = await resolveRequestPath(absoluteRoot, request.url ?? '/');
      response.setHeader('Content-Type', contentType(filePath));
      createReadStream(filePath)
        .on('error', () => {
          response.statusCode = 500;
          response.end('Internal Server Error');
        })
        .pipe(response);
    } catch (error) {
      const statusCode = error instanceof HttpError ? error.statusCode : 500;
      response.statusCode = statusCode;
      response.end(statusCode === 404 ? 'Not Found' : 'Internal Server Error');
    }
  });
}

async function resolveRequestPath(root, requestUrl) {
  const url = new URL(requestUrl, 'http://localhost');
  const decodedPath = decodeURIComponent(url.pathname);
  const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const candidate = path.resolve(root, `.${normalizedPath}`);

  if (!candidate.startsWith(`${root}${path.sep}`) && candidate !== root) {
    throw new HttpError(404);
  }

  const filePath = await existingFile(candidate);
  if (filePath) {
    return filePath;
  }

  const indexPath = path.join(root, 'index.html');
  const index = await existingFile(indexPath);
  if (!index) {
    throw new HttpError(404);
  }
  return index;
}

async function existingFile(filePath) {
  try {
    const info = await stat(filePath);
    if (info.isFile()) {
      return filePath;
    }
    if (info.isDirectory()) {
      return existingFile(path.join(filePath, 'index.html'));
    }
  } catch {
    return null;
  }
  return null;
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const types = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.webmanifest': 'application/manifest+json'
  };
  return types[extension] ?? 'application/octet-stream';
}

function parseOriginList(value) {
  if (!value?.trim()) {
    return [];
  }
  return value
    .split(',')
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);
}

function normalizeOrigin(value) {
  if (!value?.trim()) {
    return '';
  }
  try {
    return new URL(value.trim()).origin;
  } catch {
    return '';
  }
}

function unique(values) {
  return [...new Set(values)];
}

class HttpError extends Error {
  constructor(statusCode) {
    super(`HTTP ${statusCode}`);
    this.statusCode = statusCode;
  }
}

const thisFile = fileURLToPath(import.meta.url);
const entryFile = process.argv[1] ? fileURLToPath(pathToFileURL(process.argv[1])) : '';

if (thisFile === entryFile) {
  const port = Number(process.env.PORT ?? defaultPort);
  createStaticServer().listen(port, '0.0.0.0');
}
