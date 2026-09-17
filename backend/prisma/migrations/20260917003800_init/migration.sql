-- Hand-edited: case-insensitive Collection names (Prisma does not manage
-- extensions without the postgresqlExtensions preview feature).
CREATE EXTENSION IF NOT EXISTS citext;

-- CreateTable
CREATE TABLE "collections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" TEXT NOT NULL,
    "name" CITEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookmarks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "collection_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collections_id_owner_id_key" ON "collections"("id", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "collections_owner_id_name_key" ON "collections"("owner_id", "name");

-- CreateIndex
CREATE INDEX "bookmarks_owner_id_created_at_id_idx" ON "bookmarks"("owner_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "bookmarks_owner_id_collection_id_idx" ON "bookmarks"("owner_id", "collection_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookmarks_id_owner_id_key" ON "bookmarks"("id", "owner_id");

-- AddForeignKey
-- Hand-edited: SET NULL only on collection_id (Postgres 15+). A plain SET NULL
-- would also null owner_id. Deleting a Collection keeps its Bookmarks, and they
-- become Uncategorised. ON UPDATE NO ACTION: an Owner never changes. See
-- DECISIONS.md.
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_collection_id_owner_id_fkey" FOREIGN KEY ("collection_id", "owner_id") REFERENCES "collections"("id", "owner_id") ON DELETE SET NULL ("collection_id") ON UPDATE NO ACTION;
