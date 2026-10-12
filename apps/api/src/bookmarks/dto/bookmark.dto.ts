import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsString, Length, Min } from 'class-validator';
export class RenameBookmarkDto {
  @ApiProperty({ maxLength: 120 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 120)
  label!: string;
}
export class CreateBookmarkDto extends RenameBookmarkDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  page!: number;
}
