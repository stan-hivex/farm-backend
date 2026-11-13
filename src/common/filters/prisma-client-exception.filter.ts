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

export function invalidUuidMessage(message: string): boolean {
  return /uuid|inconsistent column data/i.test(message);
}

@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientValidationError)
export class PrismaClientExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaClientExceptionFilter.name);

  catch(
    e:
      | Prisma.PrismaClientKnownRequestError
      | Prisma.PrismaClientValidationError,
    host: ArgumentsHost,
  ) {
    const res = host.switchToHttp().getResponse();
    if (e instanceof Prisma.PrismaClientValidationError) {
      if (invalidUuidMessage(e.message)) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          statusCode: 400,
          message: 'Invalid id',
          error: 'Bad Request',
        });
      }
      this.logger.error('Prisma validation error', e.stack);
      return res
        .status(500)
        .json({ statusCode: 500, message: 'Internal server error' });
    }
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
