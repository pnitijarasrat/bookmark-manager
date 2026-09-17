// What a repository's list method takes and returns.

// A decoded list request.
export type ListOptions<Key> = { limit: number; after?: Key; q?: string };

// One page from a repository. `hasMore` says whether another page follows.
export type Page<T> = { items: T[]; hasMore: boolean };
