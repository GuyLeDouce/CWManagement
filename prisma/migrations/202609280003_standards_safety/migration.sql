-- CreateTable
CREATE TABLE "ProjectSpecification" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "clientVisible" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProjectSpecification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectSpecification_projectId_clientVisible_idx" ON "ProjectSpecification"("projectId", "clientVisible");

-- AddForeignKey
ALTER TABLE "ProjectSpecification" ADD CONSTRAINT "ProjectSpecification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
