from pathlib import Path
path = Path(r'C:\farm-backend\src\payments\payments.service.ts')
text = path.read_text(encoding='utf-8')
start = text.index('  async initiateDeposit(')
end = text.index('  async requestWithdrawal(')
new_body = """  async initiateDeposit(
    userId: string,
    dto: { amount_fiat: number; currency: string; paymentMethod?: string; phone?: string },
    ctx?: { deviceRisk?: number; ip?: string; country?: string },
  ) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { email: true, phone: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const reference = generateTxReference();
    const paymentMethod = (dto.paymentMethod || 'CARD').toUpperCase();
    const rate = await this.getExchangeRate(dto.currency, 'FARM');
    const amount_farm = dto.amount_fiat / rate;

    const fraud = await this.assessFraudRisk(userId, {
      amount_fiat: dto.amount_fiat,
      currency: dto.currency,
      ip: ctx?.ip || '',
      deviceRisk: ctx?.deviceRisk,
      country: ctx?.country,
    });
    if (fraud.block) {
      await this.prisma.audit_logs.create({
        data: {
          user_id: userId,
          action: 'deposit_blocked',
          entity_type: 'transaction',
          entity_id: null,
          new_values: { reason: fraud.reason },
        },
      });
      await this.prisma.security_events.create({
        data: {
          user_id: userId,
          event_type: 'fraud_score_high',
          description: f'Blocked deposit attempt: {fraud.reason}',
          severity: 'high',
        },
      });
      raise Exception('Deposit blocked by fraud protection');
    }

    const wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId, is_active: true } });

    if (paymentMethod === 'MOBILE_MONEY') {
      if (!dto.phone) {
        throw new BadRequestException('Phone number is required for mobile money deposits');
      }

      const stkResponse = await this.stkPush.initiatePush({
        phone: dto.phone,
        amount: dto.amount_fiat,
        reference,
        accountReference: reference,
        description: f'Pending STK push deposit via mobile money ({dto.currency} {dto.amount_fiat})',
      });

      const tx = await this.prisma.transactions.create({
        data: {
          transaction_reference: reference,
          receiver_wallet_id: wallet?.id,
          transaction_type: 'deposit',
          status: 'pending',
          amount: amount_farm,
          fee: 0,
          net_amount: amount_farm,
          currency: 'FARM',
          description: f'Pending STK push deposit ({dto.currency} {dto.amount_fiat})',
          metadata: {
            provider: 'stk_push',
            amount_fiat: dto.amount_fiat,
            currency_fiat: dto.currency,
            exchange_rate: rate,
            user_id: userId,
            device_risk: ctx?.deviceRisk ?? None,
            ip: ctx?.ip ?? None,
            phone: dto.phone,
          },
        },
      });

      self.logger.log(f'initiateDeposit: created STK push transaction id={tx.id} reference={reference} amount_farm={amount_farm}')

      await self.prisma.audit_logs.create({
        data: {
          user_id: userId,
          action: 'deposit_initiated',
          entity_type: 'transaction',
          entity_id: tx.id,
          new_values: { reference, amount_fiat: dto.amount_fiat, amount_farm },
        },
      });

      await self.prisma.deposit.create({
        data: {
          userId,
          amount: amount_farm,
          fee: 0,
          total: amount_farm,
          currency: 'FARM',
          paymentMethod: 'MOBILE_MONEY',
          reference,
          status: 'PENDING',
        },
      });

      return {
        data: {
          provider: 'STK_PUSH',
          reference,
          amount_farm: amount_farm.toFixed(4),
          stk_response: stkResponse,
        },
        message: 'Mobile money STK push initiated',
      };
    }

    if (paymentMethod !== 'CARD') {
      throw new BadRequestException(f'Unsupported payment method {paymentMethod}');
    }

    const amountKobo = Math.round(dto.amount_fiat * 100);

    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: user.email || f'{user.phone}@farm.app',
        amount: amountKobo,
        reference,
        callback_url: 'https://your-app/callback',
        metadata: { user_id: userId },
      },
      {
        headers: {
          Authorization: f'Bearer {self.cfg.get('PAYSTACK_SECRET_KEY')}',
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.data?.status) {
      throw new BadRequestException(
        response.data?.message || 'Paystack initialization failed',
      );
    }

    const tx = await self.prisma.transactions.create({
      data: {
        transaction_reference: reference,
        receiver_wallet_id: wallet?.id,
        transaction_type: 'deposit',
        status: 'pending',
        amount: amount_farm,
        fee: 0,
        net_amount: amount_farm,
        currency: 'FARM',
        description: f'Pending deposit via Paystack ({dto.currency} {dto.amount_fiat})',
        metadata: {
          provider: 'paystack',
          amount_fiat: dto.amount_fiat,
          currency_fiat: dto.currency,
          exchange_rate: rate,
          user_id: userId,
          device_risk: ctx?.deviceRisk ?? None,
          ip: ctx?.ip ?? None,
        },
      },
    });

    self.logger.log(f'initiateDeposit: created transaction id={tx.id} reference={reference} amount_farm={amount_farm}')

    await self.prisma.audit_logs.create({
      data: {
        user_id: userId,
        action: 'deposit_initiated',
        entity_type: 'transaction',
        entity_id: tx.id,
        new_values: { reference, amount_fiat: dto.amount_fiat, amount_farm },
      },
    });

    try:
      deposit = await self.prisma.deposit.create({
        data: {
          userId,
          amount: amount_farm,
          fee: 0,
          total: amount_farm,
          currency: 'FARM',
          paymentMethod: 'PAYSTACK',
          reference,
          status: 'PENDING',
        },
      });
      self.logger.log(f'initiateDeposit: created deposit id={deposit.id} reference={reference} amount_farm={amount_farm}')
    except Exception as err:
      self.logger.error(f'initiateDeposit: failed to create deposit for reference={reference}: {err}')

    return {
      data: {
        payment_url: response.data.data.authorization_url,
        reference,
        amount_farm: amount_farm.toFixed(4),
      },
      message: 'Deposit initiated',
    };
  }
"""
path.write_text(text[:start] + new_body + text[end:], encoding='utf-8')
print('updated function body')
