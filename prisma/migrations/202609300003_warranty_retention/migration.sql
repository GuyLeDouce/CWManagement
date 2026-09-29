CREATE OR REPLACE FUNCTION cw_warranty_file() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."warrantyRequestId" IS NOT NULL THEN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Warranty evidence must be retained'; END IF;
  IF NEW."storageKey" <> OLD."storageKey" OR NEW."projectId" <> OLD."projectId" OR NEW."warrantyRequestId" IS DISTINCT FROM OLD."warrantyRequestId" OR NEW."visibility" <> OLD."visibility" OR NEW."archivedAt" IS DISTINCT FROM OLD."archivedAt" THEN RAISE EXCEPTION 'Warranty evidence cannot be rewritten or reclassified'; END IF;
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE FUNCTION cw_warranty_project_file() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."warrantyRequestId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "WarrantyRequest" WHERE "id" = NEW."warrantyRequestId" AND "projectId" = NEW."projectId") THEN RAISE EXCEPTION 'Warranty attachment project mismatch'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER cw_warranty_file_project BEFORE INSERT OR UPDATE ON "StoredFile" FOR EACH ROW EXECUTE FUNCTION cw_warranty_project_file();
