import { Body, Controller, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { SaveProgressDto } from './dto/progress.dto';
import { ReadingProgressService } from './reading-progress.service';
@ApiTags('Reading progress')
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller('books/:bookId')
export class ReadingProgressController {
  constructor(private readonly progress: ReadingProgressService) {}
  @Post('open') open(@CurrentUser() userId: string, @Param('bookId', ParseUUIDPipe) id: string) {
    return this.progress.open(userId, id);
  }
  @Put('progress') save(
    @CurrentUser() userId: string,
    @Param('bookId', ParseUUIDPipe) id: string,
    @Body() dto: SaveProgressDto,
  ) {
    return this.progress.save(userId, id, dto.page);
  }
}
