import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const sourceRoot = path.resolve('frontend/src');
const allowedFile = path.join(sourceRoot, 'tokens.css');
const colorPattern = /#[0-9A-Fa-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(|lab\(|lch\(/g;
const ignoredExtensions = new Set(['.map']);
const findings = [];

async function scanDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await scanDirectory(fullPath);
      continue;
    }
    if (fullPath === allowedFile || ignoredExtensions.has(path.extname(fullPath))) {
      continue;
    }
    await scanFile(fullPath);
  }
}

async function scanFile(filePath) {
  const source = await readFile(filePath, 'utf8');
  for (const [index, line] of source.split('\n').entries()) {
    colorPattern.lastIndex = 0;
    const matches = line.match(colorPattern);
    if (matches) {
      findings.push(`${path.relative(process.cwd(), filePath)}:${index + 1}: ${matches.join(', ')}`);
    }
  }
}

await scanDirectory(sourceRoot);

if (findings.length > 0) {
  console.error('Raw color values are only allowed in frontend/src/tokens.css.');
  console.error(findings.join('\n'));
  process.exit(1);
}

console.log('No raw frontend colors outside frontend/src/tokens.css.');
