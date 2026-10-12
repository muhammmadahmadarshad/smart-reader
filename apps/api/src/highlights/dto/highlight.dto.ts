import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
export class HighlightRectangleDto {
  @ApiProperty() @IsNumber() @Min(0) @Max(1) x!: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(1) y!: number;
  @ApiProperty() @IsNumber() @Min(0.000001) @Max(1) width!: number;
  @ApiProperty() @IsNumber() @Min(0.000001) @Max(1) height!: number;
}
export class CreateHighlightDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) page!: number;
  @ApiProperty({ maxLength: 10000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 10000)
  text!: string;
  @ApiProperty({ type: [HighlightRectangleDto], maxItems: 500 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => HighlightRectangleDto)
  rectangles!: HighlightRectangleDto[];
}
