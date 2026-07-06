import { BadRequestException, Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { RequiredRole } from '../security/roles.decorator';
import { CreateIngestionBatchDto } from './dto/create-ingestion-batch.dto';
import { IngestionService } from './ingestion.service';

@Controller('api/v1/ingestion/batches')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @RequiredRole('admin')
  createBatch(
    @Body() body: CreateIngestionBatchDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required.');
    }
    return this.ingestionService.createBatch({ ...body, idempotencyKey });
  }

  @Get(':id')
  @RequiredRole('viewer')
  getBatch(@Param('id') id: string) {
    return this.ingestionService.getBatch(id);
  }

  @Get(':id/errors')
  @RequiredRole('analyst')
  listErrors() {
    return { data: [], meta: { total: 0, page: 1, pageSize: 25 } };
  }
}
