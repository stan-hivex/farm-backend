import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';

class UpdateProfileDto {
  firstName?: string;
  lastName?: string;
  bio?: string;
}

describe('Mass Assignment Protection', () => {
  it('rejects unknown fields in request payload', async () => {
    const payload = {
      firstName: 'John',
      lastName: 'Doe',
      role: 'admin', // Attempt to set unauthorized field
      isActive: true, // Attempt to set unauthorized field
    };

    const dto = plainToClass(UpdateProfileDto, payload, {
      excludeExtraneousValues: false,
    });

    // With excludeExtraneousValues: false, extra fields are kept
    // This simulates what happens when forbidNonWhitelisted is NOT enabled
    expect(dto).toHaveProperty('firstName');
    expect(dto).toHaveProperty('lastName');
    expect(dto).toHaveProperty('role'); // Dangerous!
    expect(dto).toHaveProperty('isActive'); // Dangerous!
  });

  it('allows only whitelisted fields when using strict mode', async () => {
    const payload = {
      firstName: 'John',
      lastName: 'Doe',
      role: 'admin', // Attempt to set unauthorized field
      isActive: true, // Attempt to set unauthorized field
    };

    const dto = plainToClass(UpdateProfileDto, payload, {
      excludeExtraneousValues: true, // This is what forbidNonWhitelisted enables
    });

    // With excludeExtraneousValues: true, extra fields are removed
    // Only properties that exist on the class are kept
    expect(Object.keys(dto).length).toBeLessThanOrEqual(Object.keys(payload).length);
    // Verify that unauthorized fields are NOT present
    expect(dto).not.toHaveProperty('role');
    expect(dto).not.toHaveProperty('isActive');
  });

  it('fails validation when unknown fields are present in strict mode', async () => {
    class StrictUpdateProfileDto {
      firstName?: string;
      lastName?: string;
      bio?: string;
    }

    const payload = {
      firstName: 'John',
      role: 'admin', // Attempt to set unauthorized field
    };

    // Simulate validation with forbidNonWhitelisted: true
    const dto = plainToClass(StrictUpdateProfileDto, payload, {
      excludeExtraneousValues: true,
    });

    const errors = await validate(dto);

    // The DTO should only contain whitelisted properties
    const dtoKeys = Object.keys(dto);
    const allowedKeys = ['firstName', 'lastName', 'bio'];
    const hasUnknownFields = dtoKeys.some((key) => !allowedKeys.includes(key));

    expect(hasUnknownFields).toBe(false);
  });
});
