import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req
} from '@nestjs/common';
import { RequiredRole } from '../security/roles.decorator';
import type { AuthenticatedUser } from '../security/token-verifier';
import { BillingAgentService } from './billing-agent.service';
import { ListAnomaliesQueryDto, UpdateAnomalyStatusDto } from './dto/anomaly.dto';

interface AuthenticatedRequest {
  user: AuthenticatedUser;
}

@Controller('api/v1')
export class BillingAgentController {
  constructor(private readonly billingAgent: BillingAgentService) {}

  @Post('billing-agent/anomaly-scan')
  @HttpCode(HttpStatus.OK)
  @RequiredRole('analyst')
  scanAnomalies(@Req() request: AuthenticatedRequest) {
    return this.billingAgent.scanAnomalies(request.user.tenantId);
  }

  @Get('anomalies')
  @RequiredRole('viewer')
  listAnomalies(@Query() query: ListAnomaliesQueryDto, @Req() request: AuthenticatedRequest) {
    return this.billingAgent.listAnomalies({ ...query, tenantId: request.user.tenantId });
  }

  @Patch('anomalies/:id')
  @RequiredRole('analyst')
  updateAnomalyStatus(
    @Param('id') id: string,
    @Body() body: UpdateAnomalyStatusDto,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required.');
    }
    return this.billingAgent.updateAnomalyStatus(id, body, request.user, idempotencyKey);
  }
}
