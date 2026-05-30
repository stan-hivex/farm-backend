import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class SetPinDto {
  @ApiProperty({ description: '4-6 digit PIN' }) @IsNotEmpty() @IsString() @Length(4, 6) pin!: string;
  @ApiProperty() @IsNotEmpty() @IsString() @Length(4, 6) confirm_pin!: string;
}