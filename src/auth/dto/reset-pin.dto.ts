import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  Length,
} from 'class-validator';

export class ResetPinDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  otp!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  password!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @Length(4, 6)
  new_pin!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @Length(4, 6)
  confirm_pin!: string;
}