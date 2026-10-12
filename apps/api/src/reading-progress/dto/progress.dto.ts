import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
export class SaveProgressDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  page!: number;
}
