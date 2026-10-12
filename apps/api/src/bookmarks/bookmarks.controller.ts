import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { CreateBookmarkDto, RenameBookmarkDto } from './dto/bookmark.dto';
import { BookmarksService } from './bookmarks.service';
@ApiTags('Bookmarks')
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller('books/:bookId/bookmarks')
export class BookmarksController {
  constructor(private readonly bookmarks: BookmarksService) {}
  @Get() list(@CurrentUser() userId: string, @Param('bookId', ParseUUIDPipe) bookId: string) {
    return this.bookmarks.list(userId, bookId);
  }
  @Post() create(
    @CurrentUser() userId: string,
    @Param('bookId', ParseUUIDPipe) bookId: string,
    @Body() dto: CreateBookmarkDto,
  ) {
    return this.bookmarks.create(userId, bookId, dto);
  }
  @Patch(':id') rename(
    @CurrentUser() userId: string,
    @Param('bookId', ParseUUIDPipe) bookId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameBookmarkDto,
  ) {
    return this.bookmarks.rename(userId, bookId, id, dto.label);
  }
  @Delete(':id') remove(
    @CurrentUser() userId: string,
    @Param('bookId', ParseUUIDPipe) bookId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bookmarks.remove(userId, bookId, id);
  }
}
