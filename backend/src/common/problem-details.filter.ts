import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<{ url: string }>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : undefined;
    const detail = this.extractDetail(exceptionResponse, status);
    const title = this.titleForStatus(status);

    response.status(status).type('application/problem+json').json({
      type: `https://api.costalyx.local/errors/${title.toLowerCase().replaceAll(' ', '-')}`,
      title,
      status,
      detail,
      instance: request.url
    });
  }

  private extractDetail(exceptionResponse: unknown, status: number): string {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }
    if (exceptionResponse && typeof exceptionResponse === 'object' && 'message' in exceptionResponse) {
      const message = (exceptionResponse as { message?: string | string[] }).message;
      return Array.isArray(message) ? message.join('; ') : message ?? this.titleForStatus(status);
    }
    return status === HttpStatus.INTERNAL_SERVER_ERROR
      ? 'An unexpected error occurred.'
      : this.titleForStatus(status);
  }

  private titleForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'Validation Error';
      case HttpStatus.UNAUTHORIZED:
        return 'Unauthorized';
      case HttpStatus.FORBIDDEN:
        return 'Forbidden';
      case HttpStatus.NOT_FOUND:
        return 'Not Found';
      case HttpStatus.CONFLICT:
        return 'Conflict';
      default:
        return status >= 500 ? 'Internal Server Error' : 'Request Error';
    }
  }
}
