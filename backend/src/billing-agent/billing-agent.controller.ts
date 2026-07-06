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
  Req,
  Res
} from '@nestjs/common';
import type { Response } from 'express';
import { RequiredRole } from '../security/roles.decorator';
import type { AuthenticatedUser } from '../security/token-verifier';
import { BillingAgentService } from './billing-agent.service';
import { ListAnomaliesQueryDto, UpdateAnomalyStatusDto } from './dto/anomaly.dto';
import {
  CreateBillingScopeDto,
  CreateStatementStakeholderDto,
  DisputeStatementDto,
  GenerateStatementsDto,
  ListStatementsQueryDto
} from './dto/statement.dto';

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

  @Post('billing-statement-stakeholders')
  @RequiredRole('admin')
  createStatementStakeholder(
    @Body() body: CreateStatementStakeholderDto,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    return this.billingAgent.createStatementStakeholder(body, request.user, requireIdempotencyKey(idempotencyKey));
  }

  @Get('billing-statement-stakeholders')
  @RequiredRole('admin')
  listStatementStakeholders(@Req() request: AuthenticatedRequest) {
    return this.billingAgent.listStatementStakeholders(request.user.tenantId);
  }

  @Post('billing-scopes')
  @RequiredRole('admin')
  createBillingScope(
    @Body() body: CreateBillingScopeDto,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    return this.billingAgent.createBillingScope(body, request.user, requireIdempotencyKey(idempotencyKey));
  }

  @Get('billing-scopes')
  @RequiredRole('admin')
  listBillingScopes(@Req() request: AuthenticatedRequest) {
    return this.billingAgent.listBillingScopes(request.user.tenantId);
  }

  @Post('billing-statements/generate')
  @RequiredRole('analyst')
  generateStatements(
    @Body() body: GenerateStatementsDto,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    return this.billingAgent.generateStatements(body, request.user, requireIdempotencyKey(idempotencyKey));
  }

  @Get('billing-statements')
  @RequiredRole('viewer')
  listStatements(@Query() query: ListStatementsQueryDto, @Req() request: AuthenticatedRequest) {
    return this.billingAgent.listStatements({ ...query, tenantId: request.user.tenantId });
  }

  @Get('billing-statements/:id/export.csv')
  @RequiredRole('viewer')
  async exportStatementCsv(@Param('id') id: string, @Req() request: AuthenticatedRequest, @Res() response: Response) {
    response.type('text/csv').send(await this.billingAgent.exportStatementCsv(id, request.user.tenantId));
  }

  @Get('billing-statements/:id/export.pdf')
  @RequiredRole('viewer')
  async exportStatementPdf(@Param('id') id: string, @Req() request: AuthenticatedRequest, @Res() response: Response) {
    response.type('application/pdf').send(await this.billingAgent.exportStatementPdf(id, request.user.tenantId));
  }

  @Get('billing-statements/:id')
  @RequiredRole('viewer')
  getStatement(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.billingAgent.getStatement(id, request.user.tenantId);
  }

  @Post('billing-statements/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequiredRole('admin')
  approveStatement(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    return this.billingAgent.approveStatement(id, request.user, requireIdempotencyKey(idempotencyKey));
  }

  @Post('billing-statements/:id/send')
  @HttpCode(HttpStatus.OK)
  @RequiredRole('admin')
  sendStatement(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    return this.billingAgent.sendStatement(id, request.user, requireIdempotencyKey(idempotencyKey));
  }

  @Post('billing-statements/:id/dispute')
  @HttpCode(HttpStatus.OK)
  @RequiredRole('analyst')
  disputeStatement(
    @Param('id') id: string,
    @Body() body: DisputeStatementDto,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    return this.billingAgent.disputeStatement(id, body.note, request.user, requireIdempotencyKey(idempotencyKey));
  }
}

function requireIdempotencyKey(value: string | undefined): string {
  if (!value) {
    throw new BadRequestException('Idempotency-Key header is required.');
  }
  return value;
}
