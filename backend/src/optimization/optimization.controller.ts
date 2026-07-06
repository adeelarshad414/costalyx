import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Query, Req } from '@nestjs/common';
import { RequiredRole } from '../security/roles.decorator';
import type { AuthenticatedUser } from '../security/token-verifier';
import { ListRecommendationsQueryDto, UpdateRecommendationDto } from './dto/recommendation.dto';
import { OptimizationService } from './optimization.service';
import { PageQueryDto } from '../governance/dto/page-query.dto';

interface AuthenticatedRequest {
  user: AuthenticatedUser;
}

@Controller('api/v1')
export class OptimizationController {
  constructor(private readonly optimization: OptimizationService) {}

  @Get('recommendations')
  @RequiredRole('viewer')
  listRecommendations(@Query() query: ListRecommendationsQueryDto, @Req() request: AuthenticatedRequest) {
    return this.optimization.listRecommendations({ ...query, tenantId: request.user.tenantId });
  }

  @Patch('recommendations/:id')
  @RequiredRole('analyst')
  updateRecommendation(
    @Param('id') id: string,
    @Body() body: UpdateRecommendationDto,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    return this.optimization.updateRecommendation(id, body, request.user, requireIdempotencyKey(idempotencyKey));
  }

  @Get('realized-savings')
  @RequiredRole('viewer')
  listRealizedSavings(@Query() query: PageQueryDto, @Req() request: AuthenticatedRequest) {
    return this.optimization.listRealizedSavings({ ...query, tenantId: request.user.tenantId });
  }
}

function requireIdempotencyKey(value: string | undefined): string {
  if (!value) {
    throw new BadRequestException('Idempotency-Key header is required.');
  }
  return value;
}
