const resolvedBootstrapValues = new Map<string, unknown>();
const inflightBootstrapValues = new Map<string, Promise<unknown>>();

export const bootstrapKeys = {
  workspaceContext: 'workspace:context',
  cloudPortfolio: 'route:cloud-portfolio',
  costs: 'route:costs',
  executive: 'route:executive',
  insights: 'route:insights',
  optimization: 'route:optimization',
  billingAgent: 'route:billing-agent',
  reporting: 'route:reporting',
  allocation: 'route:allocation',
  governance: 'route:governance',
  operator: 'route:operator'
} as const;

export async function primeBootstrapValue<T>(key: string, loader: () => Promise<T>): Promise<T> {
  if (resolvedBootstrapValues.has(key)) {
    return resolvedBootstrapValues.get(key) as T;
  }
  const existingPromise = inflightBootstrapValues.get(key);
  if (existingPromise) {
    return existingPromise as Promise<T>;
  }

  const nextPromise = loader()
    .then((value) => {
      resolvedBootstrapValues.set(key, value);
      inflightBootstrapValues.delete(key);
      return value;
    })
    .catch((error) => {
      inflightBootstrapValues.delete(key);
      throw error;
    });

  inflightBootstrapValues.set(key, nextPromise);
  return nextPromise;
}

export function takeBootstrapValue<T>(key: string): T | undefined {
  if (!resolvedBootstrapValues.has(key)) {
    return undefined;
  }
  const value = resolvedBootstrapValues.get(key) as T;
  resolvedBootstrapValues.delete(key);
  return value;
}

export function clearBootstrapValue(key: string) {
  resolvedBootstrapValues.delete(key);
  inflightBootstrapValues.delete(key);
}

export function clearBootstrapCache() {
  resolvedBootstrapValues.clear();
  inflightBootstrapValues.clear();
}
