import { BadRequestException, Body, Controller, Get, Header, Headers, HttpCode, Post, Query, Req } from '@nestjs/common';
import { RequiredRole } from '../security/roles.decorator';
import type { AuthenticatedUser } from '../security/token-verifier';
import { ExecutiveSummaryQueryDto, TcoEstimateDto } from './dto/executive.dto';
import { ExecutiveService } from './executive.service';

interface AuthenticatedRequest {
  user: AuthenticatedUser;
}

@Controller('api/v1')
export class ExecutiveController {
  constructor(private readonly executive: ExecutiveService) {}

  @Get('executive-summary')
  @RequiredRole('viewer')
  getExecutiveSummary(@Query() query: ExecutiveSummaryQueryDto, @Req() request: AuthenticatedRequest) {
    return this.executive.getExecutiveSummary(request.user.tenantId, query);
  }

  @Get('executive-summary/export')
  @Header('Content-Type', 'text/plain; charset=utf-8; profile="application/pdf"')
  @RequiredRole('viewer')
  exportExecutiveSummary(@Req() request: AuthenticatedRequest) {
    return this.executive.exportExecutiveSummary(request.user.tenantId);
  }

  @Post('tco/estimate')
  @HttpCode(200)
  @RequiredRole('viewer')
  estimateTco(
    @Body() body: TcoEstimateDto,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    return this.executive.estimateTco(body, request.user.tenantId, requireIdempotencyKey(idempotencyKey));
  }
}

function requireIdempotencyKey(value: string | undefined): string {
  if (!value) {
    throw new BadRequestException('Idempotency-Key header is required.');
  }
  return value;
}
