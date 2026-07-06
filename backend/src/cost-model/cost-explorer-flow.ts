import type {
  CostExplorerDimension,
  CostExplorerFlow,
  CostExplorerLink,
  CostExplorerNode,
  NormalizedCostRecord
} from './cost-record.types';
import { formatDecimal } from './decimal';

const defaultDimensions: CostExplorerDimension[] = ['service', 'leaseType'];

export function buildCostExplorerFlow(input: {
  records: NormalizedCostRecord[];
  dimensions?: CostExplorerDimension[];
  costFloorUsd?: string;
}): CostExplorerFlow {
  const dimensions = normalizeDimensions(input.dimensions);
  const costFloor = Number(input.costFloorUsd ?? '0');
  const nodeTotals = new Map<string, { label: string; total: number }>();
  const linkTotals = new Map<string, CostExplorerLink & { total: number }>();

  input.records.forEach((record) => {
    const cost = Number(record.costTotalUsd);
    const path = dimensions.map((dimension) => dimensionValue(record, dimension));
    path.forEach((node) => incrementNode(nodeTotals, node.id, node.label, cost));

    if (path.length === 1) {
      const source = { id: 'total:all', label: 'All spend' };
      incrementNode(nodeTotals, source.id, source.label, cost);
      incrementLink(linkTotals, source.id, path[0].id, cost);
      return;
    }

    const source = path[0];
    const target = path[1];
    incrementLink(linkTotals, source.id, target.id, cost);
  });

  const links = [...linkTotals.values()]
    .filter((link) => link.total >= costFloor)
    .map(({ total, ...link }) => ({ ...link, costTotalUsd: formatDecimal(total, 8) }));
  const linkedNodeIds = new Set(links.flatMap((link) => [link.source, link.target]));
  const nodes: CostExplorerNode[] = [...nodeTotals.entries()]
    .filter(([id]) => linkedNodeIds.has(id))
    .map(([id, node]) => ({ id, label: node.label, costTotalUsd: formatDecimal(node.total, 8) }));

  return { nodes, links };
}

function normalizeDimensions(dimensions: CostExplorerDimension[] = defaultDimensions): CostExplorerDimension[] {
  const allowed = new Set<CostExplorerDimension>([
    'provider',
    'account',
    'service',
    'leaseType',
    'transactionType',
    'usageFamily'
  ]);
  const deduped = dimensions.filter((dimension, index) => allowed.has(dimension) && dimensions.indexOf(dimension) === index);
  return deduped.length > 0 ? deduped.slice(0, 2) : defaultDimensions;
}

function dimensionValue(record: NormalizedCostRecord, dimension: CostExplorerDimension) {
  const labelByDimension: Record<CostExplorerDimension, string> = {
    provider: record.provider,
    account: record.accountExternalId,
    service: record.serviceName,
    leaseType: record.leaseType,
    transactionType: record.transactionType,
    usageFamily: record.usageFamily
  };
  const label = labelByDimension[dimension] || 'Unspecified';
  return { id: `${dimension}:${label}`, label };
}

function incrementNode(
  nodeTotals: Map<string, { label: string; total: number }>,
  id: string,
  label: string,
  cost: number
): void {
  const current = nodeTotals.get(id) ?? { label, total: 0 };
  current.total += cost;
  nodeTotals.set(id, current);
}

function incrementLink(
  linkTotals: Map<string, CostExplorerLink & { total: number }>,
  source: string,
  target: string,
  cost: number
): void {
  const id = `${source}->${target}`;
  const current = linkTotals.get(id) ?? { source, target, costTotalUsd: '0.00000000', total: 0 };
  current.total += cost;
  linkTotals.set(id, current);
}
