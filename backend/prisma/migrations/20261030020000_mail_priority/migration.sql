ALTER TABLE "email_templates" ADD COLUMN "priority" TEXT;
ALTER TABLE "email_templates" ADD CONSTRAINT "email_template_priority_valid" CHECK ("priority" IS NULL OR "priority" IN ('NORMAL','HIGH'));
