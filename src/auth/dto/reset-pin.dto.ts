import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class ResetPinDto {
  @ApiProperty({ description: 'Phone number registered to the account' })
  @IsNotEmpty()
  @IsString()
  phone!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  password!: string;

  @ApiProperty({ description: 'One-time code sent for forgotten PIN recovery' })
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  otp!: string;

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
