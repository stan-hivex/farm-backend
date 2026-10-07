import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class AdminPasswordResetCompleteDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  firebase_id_token!: string;

  @ApiProperty({ minLength: 12 })
  @IsString()
  @MinLength(12)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{12,}$/, {
    message: 'Password must be at least 12 characters and include uppercase, lowercase, number, and symbol',
  })
  password!: string;

  @ApiProperty({ minLength: 12 })
  @IsString()
  @MinLength(12)
  confirm_password!: string;
}
