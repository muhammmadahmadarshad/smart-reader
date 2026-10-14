import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
export const ANNOTATION_COLORS = ['#F5E6A8', '#CFE3C6', '#F3D0B5', '#ECCBD3'];
export class RectangleDto {
  @ApiProperty() @IsNumber() x!: number;
  @ApiProperty() @IsNumber() y!: number;
  @ApiProperty() @IsNumber() @Min(0.000001) width!: number;
  @ApiProperty() @IsNumber() @Min(0.000001) height!: number;
}
export class SegmentDto {
  @ApiProperty() @IsInt() @Min(1) page!: number;
  @ApiProperty({ type: [RectangleDto], maxItems: 500 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => RectangleDto)
  rectangles!: RectangleDto[];
}
export class CreateAnnotationDto {
  @ApiProperty({ description: 'Stable UUID reused for retries of the same create operation' })
  @IsUUID()
  clientRequestId!: string;
  @ApiProperty({ enum: ['HIGHLIGHT', 'NOTE'] }) @IsIn(['HIGHLIGHT', 'NOTE']) kind!:
    'HIGHLIGHT' | 'NOTE';
  @ApiPropertyOptional({ maxLength: 10000 })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  @Matches(/^[^\u0000]*$/, { message: 'Text cannot contain null characters.' })
  selectedText?: string | null;
  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Matches(/^[^\u0000]*$/)
  noteText?: string | null;
  @ApiPropertyOptional({ enum: ANNOTATION_COLORS }) @IsOptional() @IsIn(ANNOTATION_COLORS) color?:
    string | null;
  @ApiPropertyOptional({ description: 'Immutable uploaded book UUID' })
  @IsOptional()
  @IsUUID()
  documentVersion?: string | null;
  @ApiPropertyOptional({
    enum: [2],
    description: 'PDF user-space rectangles, bottom-left origin, before page rotation',
  })
  @IsOptional()
  @IsIn([2])
  coordinateVersion?: number | null;
  @ApiPropertyOptional({ type: [SegmentDto], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SegmentDto)
  segments?: SegmentDto[] | null;
}
export class VersionDto {
  @ApiProperty({ description: 'Last observed annotation version; stale writes return 409' })
  @IsInt()
  @Min(1)
  @Max(2147483646)
  version!: number;
}
export class UpdateAnnotationDto extends VersionDto {
  @ApiPropertyOptional({ maxLength: 5000, description: 'Null or empty removes an attached note' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Matches(/^[^\u0000]*$/, { message: 'Text cannot contain null characters.' })
  noteText?: string | null;
  @ApiPropertyOptional({ enum: ANNOTATION_COLORS }) @IsOptional() @IsIn(ANNOTATION_COLORS) color?:
    string | null;
}
export class ListAnnotationsDto {
  @ApiPropertyOptional({ enum: ['all', 'highlights', 'notes'] })
  @IsIn(['all', 'highlights', 'notes'])
  filter: string = 'all';
  @ApiPropertyOptional({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  @Matches(/^[^\u0000]*$/)
  search = '';
  @ApiPropertyOptional({ enum: ANNOTATION_COLORS })
  @IsOptional()
  @IsIn(ANNOTATION_COLORS)
  color?: string;
  @ApiPropertyOptional({ enum: ['page', 'updated'] }) @IsIn(['page', 'updated']) sort = 'page';
  @ApiPropertyOptional({ description: 'Only annotations intersecting this PDF page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  documentPage?: number;
  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}
