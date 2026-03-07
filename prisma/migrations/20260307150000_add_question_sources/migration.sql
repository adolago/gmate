-- CreateTable
CREATE TABLE "QuestionSource" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "homepageUrl" TEXT,
    "license" TEXT NOT NULL,
    "redistributable" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionSource_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Question"
ADD COLUMN     "sourceExternalId" TEXT,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceMetadata" JSONB,
ADD COLUMN     "sourceUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "QuestionSource_slug_key" ON "QuestionSource"("slug");

-- CreateIndex
CREATE INDEX "Question_sourceId_idx" ON "Question"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Question_sourceId_sourceExternalId_key" ON "Question"("sourceId", "sourceExternalId");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "QuestionSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
