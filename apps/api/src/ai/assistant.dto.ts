import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SegmentDto } from '../annotations/dto/annotation.dto';
import type { ConnectionProvider } from './entities/ai.entities';
import type { AiAction } from './contracts';
export class ConnectionDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @ApiProperty({ enum: ['openai', 'anthropic', 'gemini', 'ollama', 'compatible'] })
  @IsIn(['openai', 'anthropic', 'gemini', 'ollama', 'compatible'])
  provider!: ConnectionProvider;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) baseUrl?: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(150) model!: string;
  @ApiPropertyOptional({
    description: 'Write-only key; omitted on edit preserves it; empty removes it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  apiKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() streaming?: boolean;
}
export class ModelDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(150) model!: string;
}
export class PreferenceDto extends ModelDto {
  @ApiProperty() @IsUUID() connectionId!: string;
}
class PagesDto {
  @ApiProperty() @IsInt() @Min(1) first!: number;
  @ApiProperty() @IsInt() @Min(1) last!: number;
}
class AnchorsDto {
  @ApiProperty() @IsUUID() bookId!: string;
  @ApiProperty() @IsUUID() documentVersion!: string;
  @ApiProperty({ enum: [2] }) @IsIn([2]) coordinateVersion!: 2;
  @ApiProperty({ type: [SegmentDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SegmentDto)
  segments!: SegmentDto[];
}
export class SelectionDto {
  @ApiProperty() @IsUUID() bookId!: string;
  @ApiProperty() @IsUUID() documentVersion!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(10000) selectedText!: string;
  @ApiProperty({ type: PagesDto }) @ValidateNested() @Type(() => PagesDto) pages!: PagesDto;
  @ApiPropertyOptional({ type: AnchorsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AnchorsDto)
  anchors?: AnchorsDto;
  @ApiPropertyOptional() @IsOptional() @IsUUID() annotationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) question?: string;
  @ApiProperty({ enum: ['EXPLAIN', 'GIVE_EXAMPLE', 'TRANSLATE', 'ASK_FOLLOWUP'] })
  @IsIn(['EXPLAIN', 'GIVE_EXAMPLE', 'TRANSLATE', 'ASK_FOLLOWUP'])
  action!: AiAction;
  @ApiProperty() @IsString() @MaxLength(35) language!: string;
}
export class AskDto extends PreferenceDto {
  @ApiProperty({
    description: 'Stable UUID for one request; retry after interruption requires a new UUID.',
  })
  @IsUUID()
  requestId!: string;
  @ApiProperty() @IsUUID() conversationId!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(2000) question!: string;
  @ApiPropertyOptional({ type: SelectionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SelectionDto)
  selection?: SelectionDto;
}
