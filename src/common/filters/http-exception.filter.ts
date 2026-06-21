import {
  ExceptionFilter, Catch, ArgumentsHost,
  HttpException, HttpStatus, Injectable,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { MonitoringService } from '../../monitoring/monitoring.service';

@Injectable()
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly monitoring: MonitoringService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === 'object' && body !== null && 'message' in body
          ? (body as any).message
          : exception.message;
    } else if (exception instanceof Error) {
      console.error('[UnhandledException]', exception.message, exception.stack);
    } else {
      console.error('[UnhandledException:NonError]', JSON.stringify(exception));
    }

    if (status >= 500) {
      const user = (req as any).user as any;
      const requestId = (req as any).requestId;
      const ip = req.get('x-forwarded-for')?.split(',')[0].trim() ?? req.ip ?? '0.0.0.0';
      const msg = Array.isArray(message) ? message.join(', ') : message;

      setImmediate(() =>
        this.monitoring.logError({
          requestId, userId: user?.user_id, ipAddress: ip,
          endpoint: req.originalUrl, method: req.method, statusCode: status,
          errorType: exception instanceof Error ? exception.constructor.name : 'UnknownError',
          errorMessage: msg,
          stackTrace: exception instanceof Error ? exception.stack : undefined,
          metadata: { path: req.originalUrl },
        }).catch(() => {}),
      );
    }

    res.status(status).json({
      success: false,
      error: Array.isArray(message) ? message.join(', ') : message,
      code: status,
    });
  }
}
