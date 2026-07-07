export type OperatorReadinessStatus = 'ready' | 'attention' | 'blocked';
export type OperatorReadinessCategory = 'runtime' | 'cloud' | 'supporting-service';

export interface OperatorReadinessEnvironment {
  appEnv: string;
  nodeEnv: string;
  useMocks: boolean;
  liveCloudProbes: boolean;
}

export interface OperatorReadinessCheck {
  id: string;
  label: string;
  category: OperatorReadinessCategory;
  status: OperatorReadinessStatus;
  detail: string;
  remediation?: string;
}

export interface OperatorNextAction {
  label: string;
  command?: string;
  detail: string;
}

export interface OperatorReadiness {
  status: OperatorReadinessStatus;
  generatedAt: string;
  environment: OperatorReadinessEnvironment;
  checks: OperatorReadinessCheck[];
  blockers: string[];
  nextActions: OperatorNextAction[];
}
