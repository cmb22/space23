ALTER TABLE "availability_rules" ALTER COLUMN "valid_from" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "availability_rules" ALTER COLUMN "valid_from" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "availability_rules" ALTER COLUMN "valid_to" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "availability_rules" ALTER COLUMN "valid_to" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "availability_rules" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "availability_rules" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "languages" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "video_url" text;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "video_source" varchar(16) DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "availability_rules" DROP COLUMN "updated_at";