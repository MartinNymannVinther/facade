DROP INDEX "accounts_issuer_account_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_account_uq" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN "issuer";