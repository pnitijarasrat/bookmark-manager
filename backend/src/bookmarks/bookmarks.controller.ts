import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Owner } from '../auth/owner.decorator.js';
import { ApiProblems } from '../http/api-problems.js';
import { IdParam } from '../http/id.param.js';
import { ListQuery } from '../http/list.dto.js';
import {
  BookmarkDto,
  BookmarkListQuery,
  BookmarkPageDto,
  CreateBookmarkBody,
  ReplaceBookmarkBody,
  UpdateBookmarkBody,
} from './bookmark.dto.js';
import { BookmarksService, parseCollectionFilter } from './bookmarks.service.js';

@ApiTags('Bookmarks')
@ApiBearerAuth()
@ApiProblems(401)
@Controller('bookmarks')
export class BookmarksController {
  constructor(private readonly bookmarks: BookmarksService) {}

  /** Lists the caller's Bookmarks, newest first. */
  @Get()
  @ApiProblems(400, 404)
  list(@Owner() owner: string, @Query() query: BookmarkListQuery): Promise<BookmarkPageDto> {
    const { collectionId, ...rest } = query;
    return this.bookmarks.list(owner, rest, parseCollectionFilter(collectionId));
  }

  @Post()
  @ApiProblems(400, 404, 415, 422)
  async create(
    @Owner() owner: string,
    @Body() body: CreateBookmarkBody,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BookmarkDto> {
    const bookmark = await this.bookmarks.create(owner, body);
    response.location(`/bookmarks/${bookmark.id}`);
    return bookmark;
  }

  @Get(':id')
  @ApiProblems(404)
  get(@Owner() owner: string, @IdParam() id: string): Promise<BookmarkDto> {
    return this.bookmarks.get(owner, id);
  }

  /** A full replace. Never creates. */
  @Put(':id')
  @ApiProblems(400, 404, 415, 422)
  replace(
    @Owner() owner: string,
    @IdParam() id: string,
    @Body() body: ReplaceBookmarkBody,
  ): Promise<BookmarkDto> {
    return this.bookmarks.update(owner, id, body);
  }

  /** A partial update. `{}` changes nothing. */
  @Patch(':id')
  @ApiProblems(400, 404, 415, 422)
  update(
    @Owner() owner: string,
    @IdParam() id: string,
    @Body() body: UpdateBookmarkBody,
  ): Promise<BookmarkDto> {
    return this.bookmarks.update(owner, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiProblems(404)
  delete(@Owner() owner: string, @IdParam() id: string): Promise<void> {
    return this.bookmarks.delete(owner, id);
  }
}

@ApiTags('Collections')
@ApiBearerAuth()
@ApiProblems(401)
@Controller('collections/:id/bookmarks')
export class CollectionBookmarksController {
  constructor(private readonly bookmarks: BookmarksService) {}

  /** The Bookmarks in one Collection, the same as GET /bookmarks?collectionId=:id. */
  @Get()
  @ApiProblems(400, 404)
  list(@Owner() owner: string, @IdParam() id: string, @Query() query: ListQuery): Promise<BookmarkPageDto> {
    return this.bookmarks.list(owner, query, id);
  }
}
