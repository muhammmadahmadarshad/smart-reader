import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  HttpException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { Readable } from 'node:stream';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { StorageService } from '../storage/storage.service';
import { BooksService } from './books.service';
import { ListBooksDto, RenameBookDto } from './dto/books.dto';
@ApiTags('Books')
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller('books')
export class BooksController {
  constructor(
    private readonly books: BooksService,
    private readonly storage: StorageService,
  ) {}
  @Get('config') config() {
    return { maxUploadBytes: this.books.maxBytes };
  }
  @Get() list(@CurrentUser() userId: string, @Query() query: ListBooksDto) {
    return this.books.list(userId, query);
  }
  @Post()
  @Throttle({ default: { limit: 6, ttl: 60000 } })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  upload(@CurrentUser() userId: string, @UploadedFile() file?: Express.Multer.File) {
    return this.books.upload(userId, file);
  }
  @Get(':id') get(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.books.get(userId, id);
  }
  @Patch(':id') rename(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameBookDto,
  ) {
    return this.books.rename(userId, id, dto.title);
  }
  @Delete(':id') remove(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.books.remove(userId, id);
  }
  @Get(':id/file')
  @Throttle({ default: { limit: 600, ttl: 60000 } })
  async file(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('range') range: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const book = await this.books.owned(userId, id, true);
    response.setHeader('Accept-Ranges', 'bytes');
    if (range && !/^bytes=(\d+-\d*|-\d+)$/.test(range))
      throw new HttpException('Invalid byte range.', 416);
    try {
      const object = await this.storage.get(book.objectKey, range);
      if (object.ContentRange) {
        response.status(206);
        response.setHeader('Content-Range', object.ContentRange);
      }
      return new StreamableFile(object.Body as Readable, {
        type: 'application/pdf',
        disposition: `inline; filename="${id}.pdf"`,
        length: object.ContentLength,
      });
    } catch (error) {
      if (
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 416
      ) {
        response.setHeader('Content-Range', `bytes */${book.size}`);
        throw new HttpException('Requested range is outside the document.', 416);
      }
      throw new ServiceUnavailableException(
        'The document is temporarily unavailable. Please try again.',
      );
    }
  }
}
