import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Maps client-caused Prisma errors to 4xx instead of 500:
 * - P2023 malformed id (e.g. non-UUID path param) -> 400
 * - P2025 record not found -> 404
 * Everything else keeps the default 500 handling.
 */
export function prismaErrorStatus(code: string): number | null {
  if (code === 'P2023') return HttpStatus.BAD_REQUEST;
  if (code === 'P2025') return HttpStatus.NOT_FOUND;
  return null;
}

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaClientExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaClientExceptionFilter.name);

  catch(e: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const status = prismaErrorStatus(e.code);
    if (status == null) {
      this.logger.error(`Prisma ${e.code}`, e.stack);
      return res
        .status(500)
        .json({ statusCode: 500, message: 'Internal server error' });
    }
    return res.status(status).json({
      statusCode: status,
      message: status === 400 ? 'Invalid id' : 'Not found',
      error: status === 400 ? 'Bad Request' : 'Not Found',
    });
  }
}
