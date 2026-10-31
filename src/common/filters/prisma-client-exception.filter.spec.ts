import { Prisma } from '@prisma/client';
import { PrismaClientExceptionFilter } from './prisma-client-exception.filter';

function run(code: string) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host: any = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  };
  new PrismaClientExceptionFilter().catch(
    new Prisma.PrismaClientKnownRequestError('x', {
      code,
      clientVersion: 'test',
    }),
    host,
  );
  return (status.mock.calls[0] as any[])[0];
}

describe('PrismaClientExceptionFilter', () => {
  it('malformed id -> 400, missing -> 404, other -> 500', () => {
    expect(run('P2023')).toBe(400);
    expect(run('P2025')).toBe(404);
    expect(run('P2002')).toBe(500);
  });
});
