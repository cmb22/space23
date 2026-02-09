CREATE TABLE IF NOT EXISTS "availability_rules" (
  "id" serial PRIMARY KEY,
  "teacher_id" integer NOT NULL REFERENCES "users"("id"),
  "weekday" integer NOT NULL,
  "start_min" integer NOT NULL,
  "end_min" integer NOT NULL,
  "timezone" varchar(64) NOT NULL DEFAULT 'Europe/Berlin',
  "valid_from" timestamptz NOT NULL,
  "valid_to" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "availability_rules_teacher_id_idx" ON "availability_rules" ("teacher_id");
CREATE INDEX IF NOT EXISTS "availability_rules_valid_to_idx" ON "availability_rules" ("valid_to");