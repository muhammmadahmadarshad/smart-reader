import { ApiProperty } from '@nestjs/swagger';
import { SegmentDto, ANNOTATION_COLORS } from './annotation.dto';
export class AnnotationResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) bookId!: string;
  @ApiProperty({ enum: ['HIGHLIGHT', 'NOTE'] }) kind!: string;
  @ApiProperty({ type: String, nullable: true, maxLength: 10000 }) selectedText!: string | null;
  @ApiProperty({ type: String, nullable: true, maxLength: 5000 }) noteText!: string | null;
  @ApiProperty({ enum: ANNOTATION_COLORS, nullable: true }) color!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) documentVersion!: string | null;
  @ApiProperty({
    type: Number,
    enum: [1, 2],
    nullable: true,
    description: '1: migrated normalized rectangles; 2: PDF user-space rectangles',
  })
  coordinateVersion!: number | null;
  @ApiProperty({ type: [SegmentDto], nullable: true }) segments!: SegmentDto[] | null;
  @ApiProperty({ type: Number, nullable: true }) firstPage!: number | null;
  @ApiProperty({ minimum: 1 }) version!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
export class AnnotationListResponseDto {
  @ApiProperty({ type: [AnnotationResponseDto] }) items!: AnnotationResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}
