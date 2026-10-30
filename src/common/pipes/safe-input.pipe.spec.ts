import { BadRequestException } from '@nestjs/common';
import { SafeInputValidationPipe } from './safe-input.pipe';

describe('SafeInputValidationPipe', () => {
  it('rejects suspicious SQL-like values in request payloads', () => {
    const pipe = new SafeInputValidationPipe();

    expect(() =>
      pipe.transform({ search: "name' OR 1=1 --" }, { type: 'body' } as any),
    ).toThrow(BadRequestException);
  });

  it('allows ordinary values that do not contain suspicious payloads', () => {
    const pipe = new SafeInputValidationPipe();
    const value = {
      search: 'john doe',
      amount: 10,
      nested: { note: 'normal text' },
    };

    expect(pipe.transform(value, { type: 'body' } as any)).toEqual(value);
  });

  it('accepts LiteAPI offer/prebook ids that contain "--"', () => {
    const pipe = new SafeInputValidationPipe();
    const value = {
      offer_id: 'AwJ2MQAAAABq5k7z--Pi5beAdfaPpT-2gVAHFTXybl_a_YoPGqDYoN==',
      prebook_id: 'UN1hW--DZeE',
    };
    expect(pipe.transform({ ...value }, { type: 'body' } as any)).toEqual(
      value,
    );
  });

  it('still screens other fields next to an offer id', () => {
    const pipe = new SafeInputValidationPipe();
    expect(() =>
      pipe.transform(
        { offer_id: 'abc--def', note: 'x; drop table users' },
        { type: 'body' } as any,
      ),
    ).toThrow(BadRequestException);
  });
});
