import { IsBoolean, IsString } from 'class-validator';

export class DeleteAccountDto {
  @IsString()
  password!: string;

  @IsBoolean()
  acknowledged!: boolean;

  @IsBoolean()
  confirm_delete!: boolean;
}
