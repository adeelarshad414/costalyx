import { CostModelService } from '../../src/cost-model/cost-model.service';
import { InMemoryCostModelRepository } from '../../src/cost-model/in-memory-cost-model.repository';
import { IngestionService } from '../../src/ingestion/ingestion.service';

describe('IngestionService', () => {
  it('loads a fixture source URI through the provider adapter and persists normalized rows', async () => {
    const costModel = new CostModelService(new InMemoryCostModelRepository());
    const service = new IngestionService(costModel);

    const batch = await service.createBatch({
      provider: 'aws',
      sourceUri: 'backend/test/fixtures/aws-cur-sample.csv',
      idempotencyKey: 'service-fixture'
    });

    expect(batch.status).toBe('complete');
    expect(batch.ingestedRows).toBe(3);
    await expect(costModel.listRecords({ page: 1, pageSize: 25 })).resolves.toMatchObject({
      meta: { total: 3 }
    });
  });
});
