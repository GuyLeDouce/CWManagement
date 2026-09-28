ALTER TYPE "QuickBooksMode" ADD VALUE 'PILOT';
ALTER TYPE "QuickBooksMode" ADD VALUE 'PAUSED';
ALTER TABLE "QuickBooksConnection" ADD COLUMN "pilotConfig" JSONB,
  ADD COLUMN "backupConfirmedAt" TIMESTAMPTZ(3), ADD COLUMN "liveValidatedAt" TIMESTAMPTZ(3),
  ADD COLUMN "lastAuthFailureAt" TIMESTAMPTZ(3);
ALTER TABLE "QuickBooksSyncRun" ADD COLUMN "mode" "QuickBooksMode" NOT NULL DEFAULT 'DISCOVERY';
ALTER TABLE "QuickBooksRequest" ADD COLUMN "statusCode" TEXT, ADD COLUMN "result" TEXT;
ALTER TABLE "QuickBooksBillMirror" ADD COLUMN "lineDecisions" JSONB, ADD COLUMN "suppressedAt" TIMESTAMPTZ(3);
CREATE TABLE "QuickBooksValidationResult" (
  "id" TEXT PRIMARY KEY, "connectionId" TEXT NOT NULL REFERENCES "QuickBooksConnection"("id") ON DELETE RESTRICT,
  "step" TEXT NOT NULL, "passed" BOOLEAN NOT NULL, "note" TEXT NOT NULL, "recordIds" TEXT NOT NULL,
  "desktopVersion" TEXT NOT NULL, "connectorVersion" TEXT NOT NULL, "companyHash" TEXT NOT NULL, "scopeHash" TEXT NOT NULL,
  "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "QuickBooksValidationResult_connectionId_step_createdAt_idx" ON "QuickBooksValidationResult"("connectionId", "step", "createdAt");
CREATE FUNCTION cw_qb_validation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'QuickBooks live validation evidence is append-only'; END;
$$;
CREATE TRIGGER "QuickBooksValidationResult_immutable" BEFORE UPDATE OR DELETE ON "QuickBooksValidationResult"
FOR EACH ROW EXECUTE FUNCTION cw_qb_validation_immutable();
-- Existing ACTIVE installations must deliberately re-activate after reviewing the pilot controls.
UPDATE "QuickBooksConnection" SET "mode" = 'DISCOVERY';
CREATE FUNCTION cw_qb_result_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."completedAt" IS NOT NULL AND (NEW."statusCode" IS DISTINCT FROM OLD."statusCode" OR NEW.result IS DISTINCT FROM OLD.result) THEN
  RAISE EXCEPTION 'Completed QuickBooks request diagnostics are immutable';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER cw_qb_result_immutable BEFORE UPDATE ON "QuickBooksRequest" FOR EACH ROW EXECUTE FUNCTION cw_qb_result_immutable();
