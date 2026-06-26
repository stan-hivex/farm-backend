import { BadRequestException } from '@nestjs/common';
import { SafeInputValidationPipe } from './safe-input.pipe';

describe('SafeInputValidationPipe', () => {
  it('rejects suspicious SQL-like values in request payloads', () => {
    const pipe = new SafeInputValidationPipe();

    expect(() => pipe.transform({ search: "name' OR 1=1 --" }, { type: 'body' } as any)).toThrow(BadRequestException);
  });

  it('allows ordinary values that do not contain suspicious payloads', () => {
    const pipe = new SafeInputValidationPipe();
    const value = { search: 'john doe', amount: 10, nested: { note: 'normal text' } };

    expect(pipe.transform(value, { type: 'body' } as any)).toEqual(value);
  });
});
