import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import type { AiCapabilities } from './contracts';
class CapabilitiesDto implements AiCapabilities {
  @ApiProperty({ enum: [false] }) generation = false as const;
  @ApiProperty({ enum: [false] }) streaming = false as const;
  @ApiProperty({ enum: [false] }) embeddings = false as const;
  @ApiProperty({ enum: [false] }) retrieval = false as const;
  @ApiProperty({ enum: ['PHASE_5_DISABLED'] }) reason = 'PHASE_5_DISABLED' as const;
}
@ApiTags('AI capabilities')
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller('ai')
export class AiController {
  @Get('capabilities')
  @ApiOperation({ summary: 'Read unavailable AI/RAG capabilities; does not invoke providers' })
  @ApiUnauthorizedResponse({ description: 'Session required' })
  @ApiOkResponse({ type: CapabilitiesDto })
  capabilities(): AiCapabilities {
    return new CapabilitiesDto();
  }
}
