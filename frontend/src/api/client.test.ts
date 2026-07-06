import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCostalyxClient } from './client';

describe('createCostalyxClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends bearer auth from the Keycloak session and never uses the local test-role header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } })
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createCostalyxClient({
      baseUrl: 'http://api.test/api/v1',
      getAccessToken: async () => 'signed-keycloak-token'
    });

    await client.listCostRecords();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/cost-records',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer signed-keycloak-token'
        }
      })
    );
    expect(JSON.stringify(fetchMock.mock.calls[0][1])).not.toContain('x-costalyx-role');
  });

  it('creates ingestion batches with bearer auth and an idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'batch-1',
        provider: 'aws',
        status: 'complete',
        sourceUri: 'backend/test/fixtures/aws-cur-sample.csv',
        createdAt: '2026-07-03T00:00:00.000Z',
        completedAt: '2026-07-03T00:00:00.000Z',
        ingestedRows: 1,
        duplicateRows: 0
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createCostalyxClient({
      baseUrl: 'http://api.test/api/v1',
      getAccessToken: async () => 'signed-keycloak-token'
    });

    await client.createIngestionBatch({
      provider: 'aws',
      sourceUri: 'backend/test/fixtures/aws-cur-sample.csv',
      idempotencyKey: 'ingestion-key-1'
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/ingestion/batches',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer signed-keycloak-token',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'ingestion-key-1'
        },
        body: JSON.stringify({ provider: 'aws', sourceUri: 'backend/test/fixtures/aws-cur-sample.csv' })
      })
    );
  });

  it('runs anomaly scans and updates anomaly status with bearer auth and idempotency keys', async () => {
    const anomaly = {
      id: '11111111-1111-4111-8111-111111111111',
      tenantId: '00000000-0000-4000-8000-000000000001',
      type: 'usage',
      severity: 'medium',
      status: 'open',
      detectedAt: '2026-07-06T00:00:00.000Z',
      windowStart: '2026-07-01T00:00:00.000Z',
      windowEnd: '2026-07-06T00:00:00.000Z',
      evidence: {
        fingerprint: 'usage:row-1',
        costRecordIds: ['22222222-2222-4222-8222-222222222222'],
        pricingRows: [
          {
            costRecordId: '22222222-2222-4222-8222-222222222222',
            resourceId: 's3-usage-001',
            hourlyRateUsd: '0.01000000',
            usageHours: '50.0000',
            validFrom: '2026-07-06T00:00:00.000Z',
            validTo: null
          }
        ],
        metrics: { ratioPercent: '500.00' }
      },
      explanationMd: 'Usage reached 50.0000 hours, 500.00% of the trailing median 10.0000 hours.',
      assignedOwnerId: null
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ created: [anomaly], totalOpen: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [anomaly], meta: { total: 1, page: 1, pageSize: 50 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...anomaly, status: 'false_positive' }) });
    vi.stubGlobal('fetch', fetchMock);

    const client = createCostalyxClient({
      baseUrl: 'http://api.test/api/v1',
      getAccessToken: async () => 'signed-keycloak-token'
    });

    await client.scanBillingAnomalies?.();
    await client.listAnomalies?.({ status: 'open', type: 'usage', pageSize: 50 });
    await client.updateAnomalyStatus?.({
      id: anomaly.id,
      status: 'false_positive',
      falsePositiveReason: 'seasonal',
      idempotencyKey: 'anomaly-key-1'
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/api/v1/billing-agent/anomaly-scan',
      expect.objectContaining({
        method: 'POST',
        headers: { Accept: 'application/json', Authorization: 'Bearer signed-keycloak-token' }
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/v1/anomalies?type=usage&status=open&pageSize=50',
      expect.objectContaining({
        headers: { Accept: 'application/json', Authorization: 'Bearer signed-keycloak-token' }
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `http://api.test/api/v1/anomalies/${anomaly.id}`,
      expect.objectContaining({
        method: 'PATCH',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer signed-keycloak-token',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'anomaly-key-1'
        },
        body: JSON.stringify({ status: 'false_positive', falsePositiveReason: 'seasonal' })
      })
    );
  });

  it('uses bearer auth and idempotency keys for stakeholder statement workflows', async () => {
    const statement = {
      id: '33333333-3333-4333-8333-333333333333',
      tenantId: '00000000-0000-4000-8000-000000000001',
      stakeholderId: '44444444-4444-4444-8444-444444444444',
      stakeholderName: 'Finance Partner',
      stakeholderEmail: 'finance-partner@example.test',
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2026-06-30T23:59:59.000Z',
      status: 'pending_approval',
      totalUsd: '10.00',
      generatedAt: '2026-07-06T00:00:00.000Z',
      approvedBy: null,
      sentAt: null,
      narrativeMd: 'Finance Partner is assigned $10.00 for June.',
      openAnomalyCount: 0,
      lineItems: [],
      reconciliation: {
        tenantTotalUsd: '10.00',
        allocatedUniqueUsd: '10.00',
        unallocatedUsd: '0.00',
        overlapUsd: '0.00',
        reconcilesToTenantTotal: true
      },
      scopeWarnings: [],
      varianceTopMovers: [],
      dispute: null,
      sendEvidence: null
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ statements: [statement], reconciliation: statement.reconciliation, scopeWarnings: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [statement], meta: { total: 1, page: 1, pageSize: 50 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...statement, status: 'approved', approvedBy: 'actor-1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...statement, status: 'sent', approvedBy: 'actor-1', sentAt: '2026-07-06T00:00:00.000Z' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...statement,
          status: 'disputed',
          dispute: {
            previousStatus: 'sent',
            note: 'Allocation review requested.',
            disputedAt: '2026-07-06T00:00:00.000Z',
            disputedBy: 'actor-1'
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: '55555555-5555-4555-8555-555555555555',
              tenantId: statement.tenantId,
              runType: 'statement_generation',
              startedAt: '2026-07-06T00:00:00.000Z',
              finishedAt: '2026-07-06T00:00:01.000Z',
              inputsSummary: { periodStart: statement.periodStart, periodEnd: statement.periodEnd },
              actionsTaken: [],
              actionsProposed: [{ action: 'statement_generation', count: 1, capped: false, statementIds: [statement.id] }],
              errors: []
            }
          ],
          meta: { total: 1, page: 1, pageSize: 5 }
        })
      });
    vi.stubGlobal('fetch', fetchMock);

    const client = createCostalyxClient({
      baseUrl: 'http://api.test/api/v1',
      getAccessToken: async () => 'signed-keycloak-token'
    });

    await client.generateBillingStatements?.({
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2026-06-30T23:59:59.000Z',
      idempotencyKey: 'statement-generate-key'
    });
    await client.listBillingStatements?.({ status: 'pending_approval', pageSize: 50 });
    await client.approveBillingStatement?.({ id: statement.id, idempotencyKey: 'statement-approve-key' });
    await client.sendBillingStatement?.({ id: statement.id, idempotencyKey: 'statement-send-key' });
    await client.disputeBillingStatement?.({
      id: statement.id,
      note: 'Allocation review requested.',
      idempotencyKey: 'statement-dispute-key'
    });
    await client.listAgentRuns?.({ runType: 'statement_generation', page: 1, pageSize: 5 });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/api/v1/billing-statements/generate',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer signed-keycloak-token',
          'Idempotency-Key': 'statement-generate-key'
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/v1/billing-statements?status=pending_approval&pageSize=50',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer signed-keycloak-token' }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `http://api.test/api/v1/billing-statements/${statement.id}/approve`,
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'Idempotency-Key': 'statement-approve-key' }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      `http://api.test/api/v1/billing-statements/${statement.id}/send`,
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'Idempotency-Key': 'statement-send-key' }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      `http://api.test/api/v1/billing-statements/${statement.id}/dispute`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Idempotency-Key': 'statement-dispute-key' }),
        body: JSON.stringify({ note: 'Allocation review requested.' })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      'http://api.test/api/v1/agent-runs?runType=statement_generation&page=1&pageSize=5',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
          Authorization: 'Bearer signed-keycloak-token'
        })
      })
    );
  });

  it('loads fixed roles and exports cost records with bearer auth', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ name: 'viewer', fixed: true }] })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'id,provider\n'
      });
    vi.stubGlobal('fetch', fetchMock);

    const client = createCostalyxClient({
      baseUrl: 'http://api.test/api/v1',
      getAccessToken: async () => 'signed-keycloak-token'
    });

    await expect(client.listRoles()).resolves.toEqual({ data: [{ name: 'viewer', fixed: true }] });
    await expect(client.exportCostRecords()).resolves.toBe('id,provider\n');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/api/v1/roles',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer signed-keycloak-token'
        }
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/v1/cost-records/export',
      expect.objectContaining({
        headers: {
          Accept: 'text/csv',
          Authorization: 'Bearer signed-keycloak-token'
        }
      })
    );
  });

  it('sends bearer auth and idempotency keys for tenant cloud portfolio routes', async () => {
    const cloudConnection = {
      id: '11111111-1111-4111-8111-111111111111',
      tenantId: '00000000-0000-4000-8000-000000000001',
      externalId: 'costalyx:00000000-0000-4000-8000-000000000001:11111111-1111-4111-8111-111111111111',
      provider: 'aws',
      displayName: 'AWS production payer',
      externalTenantId: '123456789012',
      accessMode: 'aws_assume_role',
      readOnlyPrincipal: 'arn:aws:iam::123456789012:role/CostalyxReadOnlyBilling',
      billingExportUri: 's3://customer-cur/costalyx/',
      status: 'ready_for_live_probe',
      lastValidatedAt: null,
      lastValidationAttemptedAt: '2026-07-06T00:00:00.000Z',
      lastValidationCode: 'live_probes_disabled',
      lastValidationMessage:
        'Structural validation passed. Set COSTALYX_LIVE_CLOUD_PROBES=enabled in the Costalyx runtime to run AWS STS and CUR S3 probes.',
      createdAt: '2026-07-06T00:00:00.000Z'
    };
    const onboarding = {
      provider: 'aws',
      connectionId: cloudConnection.id,
      externalId: cloudConnection.externalId,
      status: 'ready',
      brokerPrincipalArn: 'arn:aws:iam::999999999999:role/CostalyxBroker',
      billingExportUri: cloudConnection.billingExportUri,
      trustPolicy: { Version: '2012-10-17', Statement: [] },
      permissionsPolicy: { Version: '2012-10-17', Statement: [] },
      customerSteps: ['Create or update the AWS IAM role trust policy with the generated external ID.']
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'tenant-1', name: 'Acme', slug: 'acme', plan: 'business', createdAt: '2026-07-06T00:00:00.000Z' }] })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'tenant-1', name: 'Acme', slug: 'acme', plan: 'business', createdAt: '2026-07-06T00:00:00.000Z' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [cloudConnection], meta: { total: 1, page: 1, pageSize: 50 } })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => cloudConnection })
      .mockResolvedValueOnce({ ok: true, json: async () => cloudConnection })
      .mockResolvedValueOnce({ ok: true, json: async () => onboarding })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              tenantId: cloudConnection.tenantId,
              cloudConnectionId: cloudConnection.id,
              runType: 'validation',
              status: 'succeeded',
              startedAt: '2026-07-06T00:00:00.000Z',
              completedAt: '2026-07-06T00:00:00.000Z',
              evidence: { code: 'live_probes_disabled' },
              createdAt: '2026-07-06T00:00:00.000Z'
            }
          ],
          meta: { total: 1, page: 1, pageSize: 5 }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 1 } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 1 } })
      });
    vi.stubGlobal('fetch', fetchMock);

    const client = createCostalyxClient({
      baseUrl: 'http://api.test/api/v1',
      getAccessToken: async () => 'signed-keycloak-token'
    });

    await client.listTenants?.();
    await client.createTenant?.({ name: 'Acme', slug: 'acme', idempotencyKey: 'tenant-key-1' });
    await client.listCloudConnections?.({ page: 1, pageSize: 50 });
    await client.createCloudConnection?.({
      provider: 'aws',
      displayName: cloudConnection.displayName,
      externalTenantId: cloudConnection.externalTenantId,
      accessMode: 'aws_assume_role',
      readOnlyPrincipal: cloudConnection.readOnlyPrincipal,
      billingExportUri: cloudConnection.billingExportUri,
      idempotencyKey: 'connection-key-1'
    });
    await client.validateCloudConnection?.({ id: cloudConnection.id, idempotencyKey: 'validation-key-1' });
    await client.getCloudConnectionOnboarding?.({ id: cloudConnection.id });
    await client.listCloudConnectionRuns?.({ id: cloudConnection.id, page: 1, pageSize: 5 });
    await client.listAccounts?.({ page: 1, pageSize: 1 });
    await client.listAccountGroups?.({ page: 1, pageSize: 1 });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/api/v1/tenants',
      expect.objectContaining({
        headers: { Accept: 'application/json', Authorization: 'Bearer signed-keycloak-token' }
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/v1/tenants',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer signed-keycloak-token',
          'Idempotency-Key': 'tenant-key-1'
        }),
        body: JSON.stringify({ name: 'Acme', slug: 'acme' })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/api/v1/cloud-connections?page=1&pageSize=50',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer signed-keycloak-token' })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://api.test/api/v1/cloud-connections',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer signed-keycloak-token',
          'Idempotency-Key': 'connection-key-1'
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      `http://api.test/api/v1/cloud-connections/${cloudConnection.id}/validation`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer signed-keycloak-token',
          'Idempotency-Key': 'validation-key-1'
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      `http://api.test/api/v1/cloud-connections/${cloudConnection.id}/onboarding`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
          Authorization: 'Bearer signed-keycloak-token'
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      `http://api.test/api/v1/cloud-connections/${cloudConnection.id}/runs?page=1&pageSize=5`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
          Authorization: 'Bearer signed-keycloak-token'
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      8,
      'http://api.test/api/v1/accounts?page=1&pageSize=1',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer signed-keycloak-token' })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      9,
      'http://api.test/api/v1/account-groups?page=1&pageSize=1',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer signed-keycloak-token' })
      })
    );
  });

  it('loads cost explorer flow with filters, dimensions, and bearer auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        nodes: [{ id: 'service:Amazon EC2', label: 'Amazon EC2', costTotalUsd: '0.41600000' }],
        links: []
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createCostalyxClient({
      baseUrl: 'http://api.test/api/v1',
      getAccessToken: async () => 'signed-keycloak-token'
    });

    await client.getCostExplorerFlow({
      provider: 'aws',
      dimensions: ['service', 'leaseType'],
      costFloorUsd: '0.01000000'
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/cost-explorer/flow?provider=aws&dimensions=service%2CleaseType&costFloorUsd=0.01000000',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer signed-keycloak-token'
        }
      })
    );
  });

  it('sends bearer auth and idempotency keys for dynamic allocation mutations', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'dimension-1', orgId: 'org-1', name: 'Team', createdBy: 'actor-1', createdAt: '2026-07-03T00:00:00.000Z' }],
          meta: { total: 1, page: 1, pageSize: 25 }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'dimension-1', orgId: 'org-1', name: 'Team', createdBy: 'actor-1', createdAt: '2026-07-03T00:00:00.000Z' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'mapping-1', dimensionId: 'dimension-1', tagKey: 'owner', tagValuePattern: 'platform' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ resourceId: 'i-aws-prod-001', tagKey: 'owner', tagValue: 'platform', source: 'manual' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ totalCostUsd: '0.41600000', resourceCount: 1, untaggedCount: 2, inactiveCount: 0, isEstimate: false })
      });
    vi.stubGlobal('fetch', fetchMock);

    const client = createCostalyxClient({
      baseUrl: 'http://api.test/api/v1',
      getAccessToken: async () => 'signed-keycloak-token'
    });

    await client.listDimensions();
    await client.createDimension({ name: 'Team', idempotencyKey: 'dimension-key-1' });
    await client.createDimensionMapping({
      dimensionId: 'dimension-1',
      tagKey: 'owner',
      tagValuePattern: 'platform',
      idempotencyKey: 'mapping-key-1'
    });
    await client.upsertResourceTag({
      resourceId: 'i-aws-prod-001',
      tagKey: 'owner',
      tagValue: 'platform',
      source: 'manual',
      idempotencyKey: 'tag-key-1'
    });
    await client.getCostSummary({ dimension: 'dimension-1' });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/v1/dimensions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer signed-keycloak-token',
          'Idempotency-Key': 'dimension-key-1'
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/api/v1/dimensions/dimension-1/mappings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer signed-keycloak-token',
          'Idempotency-Key': 'mapping-key-1'
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://api.test/api/v1/resource-tags',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer signed-keycloak-token',
          'Idempotency-Key': 'tag-key-1'
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'http://api.test/api/v1/cost-records/summary?dimension=dimension-1',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer signed-keycloak-token' })
      })
    );
  });

  it('sends bearer auth and idempotency keys for optimization recommendations', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'recommendation-1', type: 'rightsizing', resourceId: 'i-1', estimatedSavingsUsd: '1.00000000', status: 'open', createdAt: '2026-07-04T00:00:00.000Z' }],
          meta: { total: 1, page: 1, pageSize: 25 }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'recommendation-1',
          type: 'rightsizing',
          resourceId: 'i-1',
          estimatedSavingsUsd: '1.00000000',
          status: 'applied',
          createdAt: '2026-07-04T00:00:00.000Z'
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } })
      });
    vi.stubGlobal('fetch', fetchMock);

    const client = createCostalyxClient({
      baseUrl: 'http://api.test/api/v1',
      getAccessToken: async () => 'signed-keycloak-token'
    });

    await client.listRecommendations({ status: 'open' });
    await client.updateRecommendation({
      id: 'recommendation-1',
      status: 'applied',
      idempotencyKey: 'recommendation-key-1'
    });
    await client.listRealizedSavings();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/api/v1/recommendations?status=open',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer signed-keycloak-token' })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/v1/recommendations/recommendation-1',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          Authorization: 'Bearer signed-keycloak-token',
          'Idempotency-Key': 'recommendation-key-1'
        }),
        body: JSON.stringify({ status: 'applied' })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/api/v1/realized-savings',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer signed-keycloak-token' })
      })
    );
  });

  it('sends bearer auth for executive summary and idempotency keys for TCO estimates', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalSpendUsd: '50.15600000',
          revenueBaselineUsd: '1000.00000000',
          spendAsRevenuePercent: '5.0156',
          budgetBaselineUsd: '100.00000000',
          budgetUsedPercent: '50.1560',
          trend: { direction: 'up', deltaUsd: '49.64000000' },
          topMovers: []
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '%PDF-1.4 executive'
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          aws: { monthlyCostUsd: '49.64000000', isEstimate: false, assumptions: ['rate from workloadSpec'] },
          azure: { monthlyCostUsd: '70.08000000', isEstimate: true, assumptions: ['rate from workloadSpec'] },
          gcp: { monthlyCostUsd: '34.67500000', isEstimate: true, assumptions: ['rate from workloadSpec'] },
          tolerancePercent: '0.0000'
        })
      });
    vi.stubGlobal('fetch', fetchMock);

    const client = createCostalyxClient({
      baseUrl: 'http://api.test/api/v1',
      getAccessToken: async () => 'signed-keycloak-token'
    });

    await client.getExecutiveSummary({ revenueBaselineUsd: '1000.00000000', budgetBaselineUsd: '100.00000000' });
    await expect(client.exportExecutiveSummaryPdf()).resolves.toBe('%PDF-1.4 executive');
    await client.estimateTco({
      workloadSpec: {
        usageHours: '730.0000',
        providerHourlyRatesUsd: { aws: '0.06800000', azure: '0.09600000', gcp: '0.04750000' }
      },
      idempotencyKey: 'tco-key-1'
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/api/v1/executive-summary?revenueBaselineUsd=1000.00000000&budgetBaselineUsd=100.00000000',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer signed-keycloak-token'
        }
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/v1/executive-summary/export',
      expect.objectContaining({
        headers: {
          Accept: 'application/pdf',
          Authorization: 'Bearer signed-keycloak-token'
        }
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/api/v1/tco/estimate',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer signed-keycloak-token',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'tco-key-1'
        }
      })
    );
  });

  it('sends bearer auth, active view scope, and idempotency for reporting views', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'report-1', name: 'Cost Detail', category: 'cost' }],
          meta: { total: 1, page: 1, pageSize: 25 }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          reportId: 'report-1',
          generatedAt: '2026-07-04T00:00:00.000Z',
          rows: [{ provider: 'aws', resourceId: 'db-prod-001', costTotalUsd: '49.64000000' }]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'view-1', name: 'AWS Viewer Scope', filterJson: { provider: 'aws' }, sharedRoleScope: ['viewer'] }],
          meta: { total: 1, page: 1, pageSize: 25 }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'view-1',
          name: 'AWS Viewer Scope',
          filterJson: { provider: 'aws' },
          sharedRoleScope: ['viewer']
        })
      });
    vi.stubGlobal('fetch', fetchMock);

    const client = createCostalyxClient({
      baseUrl: 'http://api.test/api/v1',
      getAccessToken: async () => 'signed-keycloak-token'
    });

    await client.listReports({ category: 'cost' });
    await client.runReport({ id: 'report-1', activeViewId: 'view-1' });
    await client.listViews();
    await client.createView({
      name: 'AWS Viewer Scope',
      filterJson: { provider: 'aws' },
      sharedRoleScope: ['viewer'],
      idempotencyKey: 'view-key-1'
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/api/v1/reports?category=cost',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer signed-keycloak-token'
        }
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/v1/reports/report-1/run',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer signed-keycloak-token',
          'X-Costalyx-View-Id': 'view-1'
        }
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://api.test/api/v1/views',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer signed-keycloak-token',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'view-key-1'
        },
        body: JSON.stringify({
          name: 'AWS Viewer Scope',
          filterJson: { provider: 'aws' },
          sharedRoleScope: ['viewer']
        })
      })
    );
  });
});
