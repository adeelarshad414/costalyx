export interface Dimension {
  id: string;
  orgId: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface DimensionMapping {
  id: string;
  dimensionId: string;
  tagKey: string;
  tagValuePattern: string | null;
}

export type ResourceTagSource = 'native' | 'manual' | 'inferred';

export interface ResourceTag {
  resourceId: string;
  tagKey: string;
  tagValue: string;
  source: ResourceTagSource;
}

export interface DimensionMatchSummary {
  matchingResourceIds: Set<string>;
  taggedResourceIds: Set<string>;
}
