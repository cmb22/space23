CREATE TABLE IF NOT EXISTS "teacher_profiles" (
  "id" serial PRIMARY KEY,
  "teacher_id" integer NOT NULL UNIQUE REFERENCES "users"("id"),
  "bio" text,
  "languages" text[] NOT NULL DEFAULT '{}',
  "timezone" varchar(64) NOT NULL DEFAULT 'Europe/Berlin',
  "currency" varchar(8) NOT NULL DEFAULT 'EUR',
  "avatar_url" text,
  "youtube_url" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "lesson_offers" (
  "id" serial PRIMARY KEY,
  "teacher_id" integer NOT NULL REFERENCES "users"("id"),
  "duration_minutes" integer NOT NULL,
  "price_cents" integer NOT NULL,
  "currency" varchar(8) NOT NULL DEFAULT 'EUR',
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("teacher_id", "duration_minutes")
);

CREATE INDEX IF NOT EXISTS "lesson_offers_teacher_id_idx" ON "lesson_offers"("teacher_id");