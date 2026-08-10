jest.mock('bullmq', () => {
  const actual = jest.requireActual('bullmq');
  return {
    ...actual,
    Queue: jest.fn().mockImplementation((name, opts) => ({ name, opts })),
    Worker: jest.fn().mockImplementation((name, processor, opts) => ({ name, processor, opts })),
  };
});

import { Queue, Worker } from 'bullmq';
import { BullmqService } from './bullmq.service';

describe('BullmqService', () => {
  const mockRedisClient = { status: 'ready' };
  const mockRedisService = {
    getClient: jest.fn().mockReturnValue(mockRedisClient),
  };

  const QueueMock = Queue as unknown as jest.Mock;
  const WorkerMock = Worker as unknown as jest.Mock;

  let service: BullmqService;

  beforeEach(() => {
    QueueMock.mockClear();
    WorkerMock.mockClear();
    mockRedisService.getClient.mockClear();
    service = new BullmqService(mockRedisService as any);
  });

  it('creates a queue with the centralized Redis client when connection is not provided', () => {
    const queue = service.createQueue('webhook');

    expect(mockRedisService.getClient).toHaveBeenCalled();
    expect(QueueMock).toHaveBeenCalledWith('webhook', expect.objectContaining({ connection: mockRedisClient }));
    expect(queue).toEqual({ name: 'webhook', opts: expect.any(Object) });
  });

  it('creates a worker with the centralized Redis client when connection is not provided', () => {
    const processor = jest.fn();
    const worker = service.createWorker('webhook', processor);

    expect(mockRedisService.getClient).toHaveBeenCalled();
    expect(WorkerMock).toHaveBeenCalledWith('webhook', processor, expect.objectContaining({ connection: mockRedisClient }));
    expect(worker).toEqual({ name: 'webhook', processor, opts: expect.any(Object) });
  });

  it('preserves an explicit connection option when provided', () => {
    const connection = { custom: true };
    service.createQueue('webhook', { connection } as any);

    expect(QueueMock).toHaveBeenCalledWith('webhook', expect.objectContaining({ connection }));
  });
});
