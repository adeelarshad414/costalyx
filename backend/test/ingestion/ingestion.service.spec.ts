import { CostModelService } from '../../src/cost-model/cost-model.service';
import { IngestionService } from '../../src/ingestion/ingestion.service';

describe('IngestionService', () => {
  it('loads a fixture source URI through the provider adapter and persists normalized rows', () => {
    const costModel = new CostModelService();
    const service = new IngestionService(costModel);

    const batch = service.createBatch({
      provider: 'aws',
      sourceUri: 'backend/test/fixtures/aws-cur-sample.csv',
      idempotencyKey: 'service-fixture'
    });

    expect(batch.status).toBe('complete');
    expect(batch.ingestedRows).toBe(3);
    expect(costModel.listRecords({ page: 1, pageSize: 25 }).meta.total).toBe(3);
  });
});
