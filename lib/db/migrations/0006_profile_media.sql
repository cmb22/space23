ALTER TABLE "teacher_profiles"
  ADD COLUMN IF NOT EXISTS "avatar_url" text,
  ADD COLUMN IF NOT EXISTS "video_url" text,
  ADD COLUMN IF NOT EXISTS "video_source" varchar(16) NOT NULL DEFAULT 'local';