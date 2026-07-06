import { BadRequestException, Body, Controller, Get, Header, Headers, HttpCode, Post, Query } from '@nestjs/common';
import { RequiredRole } from '../security/roles.decorator';
import { ExecutiveSummaryQueryDto, TcoEstimateDto } from './dto/executive.dto';
import { ExecutiveService } from './executive.service';

@Controller('api/v1')
export class ExecutiveController {
  constructor(private readonly executive: ExecutiveService) {}

  @Get('executive-summary')
  @RequiredRole('viewer')
  getExecutiveSummary(@Query() query: ExecutiveSummaryQueryDto) {
    return this.executive.getExecutiveSummary(query);
  }

  @Get('executive-summary/export')
  @Header('Content-Type', 'text/plain; charset=utf-8; profile="application/pdf"')
  @RequiredRole('viewer')
  exportExecutiveSummary() {
    return this.executive.exportExecutiveSummary();
  }

  @Post('tco/estimate')
  @HttpCode(200)
  @RequiredRole('viewer')
  estimateTco(@Body() body: TcoEstimateDto, @Headers('idempotency-key') idempotencyKey: string | undefined) {
    return this.executive.estimateTco(body, requireIdempotencyKey(idempotencyKey));
  }
}

function requireIdempotencyKey(value: string | undefined): string {
  if (!value) {
    throw new BadRequestException('Idempotency-Key header is required.');
  }
  return value;
}
