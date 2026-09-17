import type { components } from './schema';

export type Bookmark = components['schemas']['BookmarkDto'];
export type Collection = components['schemas']['CollectionDto'];
export type Problem = components['schemas']['ProblemDto'];
export type ValidationProblem = components['schemas']['ValidationProblemDto'];

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** The API's largest page. */
export const MAX_LIMIT = 100;
