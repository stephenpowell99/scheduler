import { pgTable, text, serial, integer, varchar, date, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  activityType: varchar("activity_type", { length: 100 }).notNull(),
  totalSamples: integer("total_samples").notNull(),
  materialArrivesDate: date("material_arrives_date").notNull(),
  deadlineDate: date("deadline_date").notNull(),
});

export const schedules = pgTable("schedules", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  stageId: integer("stage_id").notNull(),
  weekStart: varchar("week_start", { length: 10 }).notNull(), // YYYY-MM-DD format
  scheduledSamples: integer("scheduled_samples").notNull().default(0),
});

export const capacities = pgTable("capacities", {
  id: serial("id").primaryKey(),
  stageId: integer("stage_id").notNull().references(() => stages.id, { onDelete: "cascade" }),
  weekStart: varchar("week_start", { length: 10 }).notNull(), // YYYY-MM-DD format
  maxCapacity: integer("max_capacity").notNull().default(0),
});

export const activityTypes = pgTable("activity_types", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  color: varchar("color", { length: 7 }).notNull(), // hex color
});

export const stages = pgTable("stages", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  order: integer("order").notNull(), // Sequential order of stages
  color: varchar("color", { length: 7 }).notNull(), // hex color
  proceedWithTestQty: integer("proceed_with_test_qty"),
  releaseRemainingAtStageId: integer("release_remaining_at_stage_id"),
});

export const activityTypeStages = pgTable("activity_type_stages", {
  id: serial("id").primaryKey(),
  activityTypeId: integer("activity_type_id").notNull().references(() => activityTypes.id, { onDelete: "cascade" }),
  stageId: integer("stage_id").notNull().references(() => stages.id, { onDelete: "cascade" }),
  processingTimeDays: integer("processing_time_days").notNull().default(0),
});

// Relations
export const jobsRelations = relations(jobs, ({ many }) => ({
  schedules: many(schedules),
}));

export const schedulesRelations = relations(schedules, ({ one }) => ({
  job: one(jobs, {
    fields: [schedules.jobId],
    references: [jobs.id],
  }),
  stage: one(stages, {
    fields: [schedules.stageId],
    references: [stages.id],
  }),
}));

export const stagesRelations = relations(stages, ({ many }) => ({
  schedules: many(schedules),
  activityTypeStages: many(activityTypeStages),
  capacities: many(capacities),
}));

export const activityTypesRelations = relations(activityTypes, ({ many }) => ({
  activityTypeStages: many(activityTypeStages),
}));

export const capacitiesRelations = relations(capacities, ({ one }) => ({
  stage: one(stages, {
    fields: [capacities.stageId],
    references: [stages.id],
  }),
}));

export const activityTypeStagesRelations = relations(activityTypeStages, ({ one }) => ({
  activityType: one(activityTypes, {
    fields: [activityTypeStages.activityTypeId],
    references: [activityTypes.id],
  }),
  stage: one(stages, {
    fields: [activityTypeStages.stageId],
    references: [stages.id],
  }),
}));

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
}).extend({
  autoPlan: z.boolean().optional(),
});

export const insertScheduleSchema = createInsertSchema(schedules).omit({
  id: true,
});

export const insertCapacitySchema = createInsertSchema(capacities).omit({
  id: true,
});

export const insertActivityTypeSchema = createInsertSchema(activityTypes).omit({
  id: true,
});

export const insertStageSchema = createInsertSchema(stages).omit({
  id: true,
});

export const insertActivityTypeStageSchema = createInsertSchema(activityTypeStages).omit({
  id: true,
});

export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Schedule = typeof schedules.$inferSelect;
export type InsertSchedule = z.infer<typeof insertScheduleSchema>;
export type Capacity = typeof capacities.$inferSelect;
export type InsertCapacity = z.infer<typeof insertCapacitySchema>;
export type ActivityType = typeof activityTypes.$inferSelect;
export type InsertActivityType = z.infer<typeof insertActivityTypeSchema>;
export type Stage = typeof stages.$inferSelect;
export type InsertStage = z.infer<typeof insertStageSchema>;
export type ActivityTypeStage = typeof activityTypeStages.$inferSelect;
export type InsertActivityTypeStage = z.infer<typeof insertActivityTypeStageSchema>;

// Additional types for the frontend
export type JobWithSchedules = Job & {
  schedules: (Schedule & { stage: Stage })[];
  remainingSamples: number;
};

export type WeekCapacity = {
  stageId: number;
  stageName: string;
  weekStart: string;
  maxCapacity: number;
  usedCapacity: number;
  remainingCapacity: number;
};

export type StageCapacitySummary = {
  stageId: number;
  stageName: string;
  weekStart: string;
  maxCapacity: number;
  usedCapacity: number;
  remainingCapacity: number;
};

// Session storage table for user authentication
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 100 }).unique().notNull(),
  password: varchar("password", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).unique(),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
