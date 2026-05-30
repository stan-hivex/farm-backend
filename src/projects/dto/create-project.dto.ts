import { IsString, IsNumber, IsOptional, IsPositive } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsNumber()
  @IsPositive()
  total_value!: number;

  @IsNumber()
  @IsPositive()
  token_price!: number;

  @IsOptional()
  @IsNumber()
  duration_months?: number;
}