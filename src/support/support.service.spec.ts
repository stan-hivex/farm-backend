import { NotFoundException } from '@nestjs/common';
import { SupportService } from './support.service';

describe('SupportService', () => {
  it('creates an enquiry with an uploaded attachment', async () => {
    const ticket = { id: 'ticket-1', subject: 'Broken item' };
    const tx: any = {
      support_tickets: {
        create: jest.fn().mockResolvedValue(ticket),
      },
      support_messages: {
        create: jest.fn().mockResolvedValue({ id: 'attachment-1' }),
      },
    };
    const prisma: any = {
      $transaction: jest.fn((work) => work(tx)),
    };
    const cloudinary = {
      uploadSupportAttachment: jest
        .fn()
        .mockResolvedValue('https://res.cloudinary.com/demo/image/upload/photo.jpg'),
    };
    const service = new SupportService(
      prisma,
      { sendNotification: jest.fn() } as any,
      cloudinary as any,
    );

    await expect(
      service.createTicket('user-1', 'Broken item', '', {
        attachmentBase64: Buffer.from('photo').toString('base64'),
        attachmentMimeType: 'image/jpeg',
      }),
    ).resolves.toEqual({
      data: ticket,
      message: 'Your enquiry has been sent to support.',
    });
    expect(tx.support_tickets.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: 'user-1',
          message: null,
        }),
      }),
    );
    expect(tx.support_messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sender_id: 'user-1',
          attachment_url:
            'https://res.cloudinary.com/demo/image/upload/photo.jpg',
        }),
      }),
    );
  });

  it('lists admin enquiries with customer details and conversation history', async () => {
    const tickets = [{ id: 'ticket-1', support_messages: [] }];
    const prisma: any = {
      support_tickets: {
        findMany: jest.fn().mockResolvedValue(tickets),
      },
    };
    const notifications = { sendNotification: jest.fn() };
    const service = new SupportService(prisma, notifications as any, {} as any);

    await expect(service.listAdminTickets()).resolves.toEqual({
      data: tickets,
    });
    expect(prisma.support_tickets.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { created_at: 'desc' },
        include: expect.objectContaining({
          users_support_tickets_user_idTousers: expect.any(Object),
          support_messages: expect.any(Object),
        }),
      }),
    );
  });

  it('stores an admin reply and marks the ticket answered', async () => {
    const admin = {
      id: 'admin-1',
      first_name: 'Alex',
      last_name: 'Admin',
      username: 'alexadmin',
      role: 'admin',
    };
    const tx: any = {
      support_messages: {
        create: jest.fn().mockResolvedValue({
          id: 'reply-1',
          users: admin,
        }),
      },
      support_tickets: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma: any = {
      support_tickets: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ticket-1',
          user_id: 'user-1',
          subject: 'Help',
        }),
      },
      $transaction: jest.fn((work) => work(tx)),
    };
    const notifications = {
      sendNotification: jest.fn().mockResolvedValue({ id: 'notification-1' }),
    };
    const service = new SupportService(prisma, notifications as any, {} as any);

    await service.replyToTicketAsAdmin(
      'ticket-1',
      'admin-1',
      '  We can help.  ',
    );

    expect(tx.support_messages.create).toHaveBeenCalledWith({
      data: {
        ticket_id: 'ticket-1',
        sender_id: 'admin-1',
        message: 'We can help.',
        attachment_url: null,
      },
      include: {
        users: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            username: true,
            role: true,
          },
        },
      },
    });
    expect(tx.support_tickets.update).toHaveBeenCalledWith({
      where: { id: 'ticket-1' },
      data: {
        status: 'answered',
        assigned_to: 'admin-1',
        closed_at: null,
      },
    });
    expect(notifications.sendNotification).toHaveBeenCalledWith('user-1', {
      type: 'admin',
      title: 'Support replied',
      body: 'Alex Admin replied to your support enquiry: Help.',
      entityId: 'ticket-1',
      metadata: {
        category: 'support_reply',
        ticketId: 'ticket-1',
      },
    });
  });

  it('returns the saved admin reply even if notification delivery fails', async () => {
    const reply = {
      id: 'reply-1',
      message: 'We can help.',
      users: {
        first_name: 'Alex',
        last_name: 'Admin',
        username: 'alexadmin',
        role: 'admin',
      },
    };
    const tx: any = {
      support_messages: {
        create: jest.fn().mockResolvedValue(reply),
      },
      support_tickets: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma: any = {
      support_tickets: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ticket-1',
          user_id: 'user-1',
          subject: 'Help',
        }),
      },
      $transaction: jest.fn((work) => work(tx)),
    };
    const notifications = {
      sendNotification: jest.fn().mockRejectedValue(new Error('Push failed')),
    };
    const service = new SupportService(prisma, notifications as any, {} as any);

    await expect(
      service.replyToTicketAsAdmin('ticket-1', 'admin-1', 'We can help.'),
    ).resolves.toEqual({ data: reply, message: 'Reply sent.' });
    expect(tx.support_messages.create).toHaveBeenCalled();
    expect(tx.support_tickets.update).toHaveBeenCalled();
  });

  it('stores a user reply and reopens the ticket', async () => {
    const tx: any = {
      support_messages: {
        create: jest.fn().mockResolvedValue({ id: 'reply-2' }),
      },
      support_tickets: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma: any = {
      support_tickets: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ticket-1',
          user_id: 'user-1',
          subject: 'Help',
        }),
      },
      $transaction: jest.fn((work) => work(tx)),
    };
    const notifications = { sendNotification: jest.fn() };
    const service = new SupportService(prisma, notifications as any, {} as any);

    await service.replyToTicketAsUser('ticket-1', 'user-1', 'More details');

    expect(tx.support_messages.create).toHaveBeenCalledWith({
      data: {
        ticket_id: 'ticket-1',
        sender_id: 'user-1',
        message: 'More details',
        attachment_url: null,
      },
      include: {
        users: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            username: true,
            role: true,
          },
        },
      },
    });
    expect(tx.support_tickets.update).toHaveBeenCalledWith({
      where: { id: 'ticket-1' },
      data: {
        status: 'open',
        closed_at: null,
      },
    });
    expect(notifications.sendNotification).not.toHaveBeenCalled();
  });

  it('uploads and saves a support attachment with a message reply', async () => {
    const tx: any = {
      support_messages: {
        create: jest.fn().mockResolvedValue({ id: 'reply-with-media' }),
      },
      support_tickets: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma: any = {
      support_tickets: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ticket-1',
          user_id: 'user-1',
          subject: 'Help',
        }),
      },
      $transaction: jest.fn((work) => work(tx)),
    };
    const cloudinary = {
      uploadSupportAttachment: jest
        .fn()
        .mockResolvedValue('https://res.cloudinary.com/demo/image/upload/photo.jpg'),
    };
    const service = new SupportService(
      prisma,
      { sendNotification: jest.fn() } as any,
      cloudinary as any,
    );

    await service.replyToTicketAsUser('ticket-1', 'user-1', 'See attached', {
      attachmentBase64: Buffer.from('photo').toString('base64'),
      attachmentMimeType: 'image/jpeg',
    });

    expect(cloudinary.uploadSupportAttachment).toHaveBeenCalledWith(
      'image/jpeg',
      Buffer.from('photo').toString('base64'),
      'ticket-1',
    );
    expect(tx.support_messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticket_id: 'ticket-1',
          message: 'See attached',
          attachment_url:
            'https://res.cloudinary.com/demo/image/upload/photo.jpg',
        }),
      }),
    );
  });

  it('does not allow users to reply to another user’s ticket', async () => {
    const tx: any = {
      support_messages: { create: jest.fn() },
      support_tickets: { update: jest.fn() },
    };
    const prisma: any = {
      support_tickets: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ticket-1',
          user_id: 'owner-1',
        }),
      },
      $transaction: jest.fn((work) => work(tx)),
    };
    const service = new SupportService(
      prisma,
      { sendNotification: jest.fn() } as any,
      {} as any,
    );

    await expect(
      service.replyToTicketAsUser('ticket-1', 'other-user', 'Reply'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
