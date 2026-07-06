export type CsvRow = Record<string, string>;

export function parseCsv(raw: string): CsvRow[] {
  const lines = raw.trim().split(/\r?\n/);
  const headers = splitCsvLine(lines[0] ?? '');
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

export function required(row: CsvRow, key: string): string {
  const value = row[key];
  if (value === undefined || value === '') {
    throw new Error(`Missing required billing export field ${key}`);
  }
  return value;
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}
