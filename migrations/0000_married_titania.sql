CREATE TABLE "activity_type_stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_type_id" integer NOT NULL,
	"stage_id" integer NOT NULL,
	"processing_time_days" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"color" varchar(7) NOT NULL,
	CONSTRAINT "activity_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "capacities" (
	"id" serial PRIMARY KEY NOT NULL,
	"stage_id" integer NOT NULL,
	"week_start" varchar(10) NOT NULL,
	"max_capacity" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"activity_type" varchar(100) NOT NULL,
	"total_samples" integer NOT NULL,
	"material_arrives_date" date NOT NULL,
	"deadline_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"stage_id" integer NOT NULL,
	"week_start" varchar(10) NOT NULL,
	"scheduled_samples" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"order" integer NOT NULL,
	"color" varchar(7) NOT NULL,
	"proceed_with_test_qty" integer,
	"release_remaining_at_stage_id" integer,
	CONSTRAINT "stages_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(100) NOT NULL,
	"password" varchar(255) NOT NULL,
	"email" varchar(255),
	"first_name" varchar(100),
	"last_name" varchar(100),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "activity_type_stages" ADD CONSTRAINT "activity_type_stages_activity_type_id_activity_types_id_fk" FOREIGN KEY ("activity_type_id") REFERENCES "public"."activity_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_type_stages" ADD CONSTRAINT "activity_type_stages_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capacities" ADD CONSTRAINT "capacities_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");