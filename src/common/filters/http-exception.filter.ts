import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = exception instanceof HttpException
      ? exception.getResponse()
      : null;

    let message: string | string[] = 'Internal server error';
    let errors: any = null;

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const r = exceptionResponse as any;
      message = r.message || 'Error';
      errors = Array.isArray(r.message) ? r.message : undefined;
      if (errors) message = 'Validation failed';
    }

    if (status >= 500) {
      this.logger.error(`${req.method} ${req.url} → ${status}`, exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(status).json({
      success: false,
      statusCode: status,
      message,
      errors: errors ?? null,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}