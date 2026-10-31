import { TravelController } from './travel.controller';

describe('TravelController hotel response shapes', () => {
  it('wraps every hotel endpoint as { data }', async () => {
    const hotels: any = {
      search: jest.fn().mockResolvedValue([{ id: 'o1' }]),
      prebook: jest.fn().mockResolvedValue({ prebook_id: 'p1' }),
      book: jest.fn().mockResolvedValue({ id: 'b1' }),
      cancel: jest.fn().mockResolvedValue({ id: 'b1', status: 'cancelled' }),
    };
    const c = new TravelController({} as any, hotels);
    expect(await c.hotelSearch({} as any)).toEqual({ data: [{ id: 'o1' }] });
    expect(await c.hotelPrebook({ offer_id: 'x' } as any)).toEqual({
      data: { prebook_id: 'p1' },
    });
    expect(
      await c.hotelBook({ id: 'u' }, {} as any, { ip: '' } as any),
    ).toEqual({ data: { id: 'b1' } });
    expect(await c.hotelCancel({ id: 'u' }, 'b1')).toEqual({
      data: { id: 'b1', status: 'cancelled' },
    });
  });
});
