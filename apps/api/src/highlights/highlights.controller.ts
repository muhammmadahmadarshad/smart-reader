import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { CreateHighlightDto } from './dto/highlight.dto';
import { HighlightsService } from './highlights.service';
@ApiTags('Highlights')
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller('books/:bookId/highlights')
export class HighlightsController {
  constructor(private readonly highlights: HighlightsService) {}
  @Get()
  @ApiQuery({ name: 'page', type: Number, required: true })
  list(
    @CurrentUser() userId: string,
    @Param('bookId', ParseUUIDPipe) bookId: string,
    @Query('page', ParseIntPipe) page: number,
  ) {
    if (page < 1) throw new BadRequestException('Page must be positive.');
    return this.highlights.list(userId, bookId, page);
  }
  @Post() create(
    @CurrentUser() userId: string,
    @Param('bookId', ParseUUIDPipe) bookId: string,
    @Body() dto: CreateHighlightDto,
  ) {
    return this.highlights.create(userId, bookId, dto);
  }
  @Delete(':id') remove(
    @CurrentUser() userId: string,
    @Param('bookId', ParseUUIDPipe) bookId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.highlights.remove(userId, bookId, id);
  }
}
