import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const message =
        typeof res === 'object' && 'message' in (res as object)
          ? (res as any).message
          : exception.message;

      return response.status(status).json({
        success: false,
        error: Array.isArray(message) ? message.join(', ') : message,
        code: status,
      });
    }

    const message =
      exception instanceof Error ? exception.message : 'Internal server error';

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: message,
      code: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  }
}
