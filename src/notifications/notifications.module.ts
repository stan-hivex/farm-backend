import { Module } from '@nestjs/common';

import { NotificationsService }
from './notifications.service';

import { NotificationsController }
from './notifications.controller';

import { FirebaseService } from './firebase.service';

@Module({

  controllers: [
    NotificationsController,
  ],

  providers: [
    NotificationsService,
    FirebaseService,
  ],

  exports: [
    NotificationsService,
    FirebaseService,
  ],
})

export class NotificationsModule {}