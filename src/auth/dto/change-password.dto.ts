import { IsString, IsNotEmpty, Matches, MaxLength } from 'class-validator';

/** Uses the same strength policy as registration and password reset. */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  current_password!: string;

  @IsString()
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{12,}$/, {
    message:
      'Password must be at least 12 characters and include uppercase, lowercase, number, and symbol',
  })
  new_password!: string;

  @IsString()
  @IsNotEmpty()
  confirm_password!: string;
}
