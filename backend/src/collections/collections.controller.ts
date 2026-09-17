import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Owner } from '../auth/owner.decorator.js';
import { ApiProblems } from '../http/api-problems.js';
import { IdParam } from '../http/id.param.js';
import { ListQuery } from '../http/list.dto.js';
import {
  CollectionDto,
  CollectionPageDto,
  CreateCollectionBody,
  ReplaceCollectionBody,
  UpdateCollectionBody,
} from './collection.dto.js';
import { CollectionsService } from './collections.service.js';

@ApiTags('Collections')
@ApiBearerAuth()
@ApiProblems(401)
@Controller('collections')
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  /** Lists the caller's Collections by name, ignoring case. */
  @Get()
  @ApiProblems(400)
  list(@Owner() owner: string, @Query() query: ListQuery): Promise<CollectionPageDto> {
    return this.collections.list(owner, query);
  }

  @Post()
  @ApiProblems(400, 409, 415, 422)
  async create(
    @Owner() owner: string,
    @Body() body: CreateCollectionBody,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CollectionDto> {
    const collection = await this.collections.create(owner, body);
    response.location(`/collections/${collection.id}`);
    return collection;
  }

  @Get(':id')
  @ApiProblems(404)
  get(@Owner() owner: string, @IdParam() id: string): Promise<CollectionDto> {
    return this.collections.get(owner, id);
  }

  @Put(':id')
  @ApiProblems(400, 404, 409, 415, 422)
  replace(
    @Owner() owner: string,
    @IdParam() id: string,
    @Body() body: ReplaceCollectionBody,
  ): Promise<CollectionDto> {
    return this.collections.update(owner, id, body);
  }

  /** Behaves like PUT, because `name` is the only writable field. */
  @Patch(':id')
  @ApiProblems(400, 404, 409, 415, 422)
  update(
    @Owner() owner: string,
    @IdParam() id: string,
    @Body() body: UpdateCollectionBody,
  ): Promise<CollectionDto> {
    return this.collections.update(owner, id, body);
  }

  /** Deletes the Collection. Its Bookmarks are kept, and become Uncategorised. */
  @Delete(':id')
  @HttpCode(204)
  @ApiProblems(404)
  delete(@Owner() owner: string, @IdParam() id: string): Promise<void> {
    return this.collections.delete(owner, id);
  }
}
