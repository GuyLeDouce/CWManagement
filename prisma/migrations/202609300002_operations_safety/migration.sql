ALTER TABLE "Opportunity" ADD CONSTRAINT opportunity_probability CHECK ("probability" BETWEEN 0 AND 100);
ALTER TABLE "Opportunity" ADD CONSTRAINT opportunity_value CHECK ("estimatedValue" >= 0);
ALTER TABLE "WarrantyRequest" ADD CONSTRAINT warranty_client_fk FOREIGN KEY ("clientContactId") REFERENCES "Contact"("id") ON DELETE RESTRICT;
ALTER TABLE "WarrantyRequest" ADD CONSTRAINT warranty_trade_fk FOREIGN KEY ("assignedTradeId") REFERENCES "Contact"("id") ON DELETE RESTRICT;
ALTER TABLE "WarrantyRequest" ADD CONSTRAINT warranty_assignee_fk FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "WarrantyRequest" ADD CONSTRAINT warranty_creator_fk FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "WarrantyUpdate" ADD CONSTRAINT warranty_actor_fk FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT;
CREATE FUNCTION cw_warranty_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Warranty evidence is append-only';
END; $$;
CREATE TRIGGER cw_warranty_update_immutable BEFORE UPDATE OR DELETE ON "WarrantyUpdate" FOR EACH ROW EXECUTE FUNCTION cw_warranty_evidence();
CREATE FUNCTION cw_warranty_file() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."warrantyRequestId" IS NOT NULL THEN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Warranty evidence must be retained'; END IF;
  IF NEW."storageKey" <> OLD."storageKey" OR NEW."projectId" <> OLD."projectId" OR NEW."warrantyRequestId" IS DISTINCT FROM OLD."warrantyRequestId" OR NEW."visibility" <> OLD."visibility" OR NEW."archivedAt" IS DISTINCT FROM OLD."archivedAt" THEN RAISE EXCEPTION 'Warranty evidence cannot be rewritten or reclassified'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER cw_warranty_file_retained BEFORE UPDATE OR DELETE ON "StoredFile" FOR EACH ROW EXECUTE FUNCTION cw_warranty_file();
ALTER TABLE "Jobsite" ADD CONSTRAINT warranty_dates CHECK ("warrantyStartDate" IS NULL OR "warrantyExpirationDate" IS NULL OR "warrantyExpirationDate" >= "warrantyStartDate");
