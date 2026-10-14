import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiConflictResponse,
  ApiOperation,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AnnotationResponseDto, AnnotationListResponseDto } from './dto/annotation-response.dto';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { AnnotationsService } from './annotations.service';
import {
  CreateAnnotationDto,
  ListAnnotationsDto,
  UpdateAnnotationDto,
  VersionDto,
} from './dto/annotation.dto';
@ApiTags('Annotations')
@ApiCookieAuth()
@ApiBadRequestResponse({
  description: 'Invalid input or geometry; JSON body limited to 100 KB (413 when exceeded)',
})
@ApiNotFoundResponse({ description: 'Book or annotation not found for the authenticated user' })
@ApiUnauthorizedResponse({ description: 'Session required' })
@UseGuards(AuthGuard)
@Controller('books/:bookId/annotations')
export class AnnotationsController {
  constructor(private readonly annotations: AnnotationsService) {}
  @Get()
  @ApiOkResponse({ type: AnnotationListResponseDto })
  @ApiOperation({
    summary: 'Search, filter and paginate personal annotations (notes includes attached notes)',
  })
  list(
    @CurrentUser() user: string,
    @Param('bookId', ParseUUIDPipe) book: string,
    @Query() dto: ListAnnotationsDto,
  ) {
    return this.annotations.list(user, book, dto);
  }
  @Get(':id')
  @ApiOkResponse({ type: AnnotationResponseDto })
  get(
    @CurrentUser() user: string,
    @Param('bookId', ParseUUIDPipe) book: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.annotations.get(user, book, id);
  }
  @Post()
  @ApiCreatedResponse({ type: AnnotationResponseDto })
  @ApiConflictResponse({
    description: 'Create request UUID reused with different content or after deletion',
  })
  create(
    @CurrentUser() user: string,
    @Param('bookId', ParseUUIDPipe) book: string,
    @Body() dto: CreateAnnotationDto,
  ) {
    return this.annotations.create(user, book, dto);
  }
  @Patch(':id')
  @ApiOkResponse({ type: AnnotationResponseDto })
  @ApiConflictResponse({ description: 'Stale version: fetch latest and reconcile the draft' })
  update(
    @CurrentUser() user: string,
    @Param('bookId', ParseUUIDPipe) book: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAnnotationDto,
  ) {
    return this.annotations.update(user, book, id, dto);
  }
  @Delete(':id')
  @ApiConflictResponse({ description: 'Stale version: reload before deleting' })
  remove(
    @CurrentUser() user: string,
    @Param('bookId', ParseUUIDPipe) book: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto,
  ) {
    return this.annotations.remove(user, book, id, dto.version);
  }
}
