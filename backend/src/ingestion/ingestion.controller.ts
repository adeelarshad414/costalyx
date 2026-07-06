import { BadRequestException, Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { RequiredRole } from '../security/roles.decorator';
import type { AuthenticatedUser } from '../security/token-verifier';
import { CreateIngestionBatchDto } from './dto/create-ingestion-batch.dto';
import { IngestionService } from './ingestion.service';

interface AuthenticatedRequest {
  user: AuthenticatedUser;
}

@Controller('api/v1/ingestion/batches')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @RequiredRole('admin')
  createBatch(
    @Body() body: CreateIngestionBatchDto,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required.');
    }
    return this.ingestionService.createBatch({ ...body, tenantId: request.user.tenantId, idempotencyKey, actor: request.user });
  }

  @Get(':id')
  @RequiredRole('viewer')
  getBatch(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.ingestionService.getBatch(id, request.user.tenantId);
  }

  @Get(':id/errors')
  @RequiredRole('analyst')
  listErrors() {
    return { data: [], meta: { total: 0, page: 1, pageSize: 25 } };
  }
}
