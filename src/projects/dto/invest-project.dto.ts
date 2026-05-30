import { IsNumber, IsPositive, IsUUID } from 'class-validator';

export class InvestProjectDto {
  @IsUUID()
  project_id!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;
}