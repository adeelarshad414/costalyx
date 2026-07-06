import { IsIn, IsOptional } from 'class-validator';
import { PageQueryDto } from '../../governance/dto/page-query.dto';
import type { RecommendationStatus } from '../optimization.types';

const recommendationStatuses: RecommendationStatus[] = ['open', 'applied', 'dismissed'];

export class ListRecommendationsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(recommendationStatuses)
  status?: RecommendationStatus;
}

export class UpdateRecommendationDto {
  @IsIn(['applied', 'dismissed'])
  status!: 'applied' | 'dismissed';
}
