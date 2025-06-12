import {
  Job,
  InsertJob,
  Schedule,
  InsertSchedule,
  Capacity,
  InsertCapacity,
  ActivityType,
  InsertActivityType,
  Stage,
  InsertStage,
  ActivityTypeStage,
  InsertActivityTypeStage,
  JobWithSchedules,
  WeekCapacity,
  StageCapacitySummary,
  User,
  InsertUser,
  jobs,
  schedules,
  capacities,
  activityTypes,
  stages,
  activityTypeStages,
  users,
} from "../shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  // Jobs
  getJobs(): Promise<Job[]>;
  getJob(id: number): Promise<Job | undefined>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(id: number, job: Partial<InsertJob>): Promise<Job | undefined>;
  deleteJob(id: number): Promise<boolean>;

  // Schedules
  getSchedules(): Promise<Schedule[]>;
  getSchedulesByJob(jobId: number): Promise<Schedule[]>;
  getSchedulesByWeek(weekStart: string): Promise<Schedule[]>;
  getSchedulesByJobAndStage(
    jobId: number,
    stageId: number,
  ): Promise<Schedule[]>;
  createSchedule(schedule: InsertSchedule): Promise<Schedule>;
  updateSchedule(
    jobId: number,
    stageId: number,
    weekStart: string,
    scheduledSamples: number,
  ): Promise<Schedule | undefined>;
  deleteSchedule(
    jobId: number,
    stageId: number,
    weekStart: string,
  ): Promise<boolean>;

  // Capacities
  getCapacities(): Promise<Capacity[]>;
  getCapacitiesByWeek(weekStart: string): Promise<Capacity[]>;
  createOrUpdateCapacity(capacity: InsertCapacity): Promise<Capacity>;
  deleteCapacity(stageId: number, weekStart: string): Promise<boolean>;

  // Activity Types
  getActivityTypes(): Promise<ActivityType[]>;
  createActivityType(activityType: InsertActivityType): Promise<ActivityType>;
  deleteActivityType(name: string): Promise<boolean>;

  // Stages
  getStages(): Promise<Stage[]>;
  createStage(stage: InsertStage): Promise<Stage>;
  updateStage(
    id: number,
    stage: Partial<InsertStage>,
  ): Promise<Stage | undefined>;
  deleteStage(id: number): Promise<boolean>;

  // Activity Type Stages
  getActivityTypeStages(): Promise<ActivityTypeStage[]>;
  getActivityTypeStagesByActivityType(
    activityTypeId: number,
  ): Promise<ActivityTypeStage[]>;
  createActivityTypeStage(
    activityTypeStage: InsertActivityTypeStage,
  ): Promise<ActivityTypeStage>;
  updateActivityTypeStage(
    id: number,
    processingTimeDays: number,
  ): Promise<ActivityTypeStage | undefined>;
  deleteActivityTypeStage(id: number): Promise<boolean>;
  deleteActivityTypeStagesByActivityType(
    activityTypeId: number,
  ): Promise<boolean>;

  // Complex queries
  getJobsWithSchedules(): Promise<JobWithSchedules[]>;
  getWeekCapacities(weekStarts: string[]): Promise<WeekCapacity[]>;
  getStageCapacitySummary(
    weekStarts: string[],
    stageId?: number,
  ): Promise<StageCapacitySummary[]>;

  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(insertUser: InsertUser): Promise<User>;

  // Auto-planning
  autoPlanJob(jobId: number): Promise<void>;

  // Schedule shifting
  shiftJobSchedule(jobId: number, weeks: number): Promise<void>;

  // Schedule moving
  moveSchedule(jobId: number, stageId: number, fromWeek: string, toWeek: string, quantity: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getJobs(): Promise<Job[]> {
    return await db.select().from(jobs);
  }

  async getJob(id: number): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job || undefined;
  }

  async createJob(insertJob: InsertJob): Promise<Job> {
    const [job] = await db.insert(jobs).values(insertJob).returning();
    return job;
  }

  async updateJob(
    id: number,
    jobUpdate: Partial<InsertJob>,
  ): Promise<Job | undefined> {
    const [job] = await db
      .update(jobs)
      .set(jobUpdate)
      .where(eq(jobs.id, id))
      .returning();
    return job || undefined;
  }

  async deleteJob(id: number): Promise<boolean> {

    console.log("DELETING JOB");

    // Delete related schedules first
    await db.delete(schedules).where(eq(schedules.jobId, id));

    const result = await db.delete(jobs).where(eq(jobs.id, id));    

    return true;
  }

  async getSchedules(): Promise<Schedule[]> {
    return await db.select().from(schedules);
  }

  async getSchedulesByJob(jobId: number): Promise<Schedule[]> {
    return await db.select().from(schedules).where(eq(schedules.jobId, jobId));
  }

  async getSchedulesByWeek(weekStart: string): Promise<Schedule[]> {
    return await db
      .select()
      .from(schedules)
      .where(eq(schedules.weekStart, weekStart));
  }

  async createSchedule(insertSchedule: InsertSchedule): Promise<Schedule> {
    const [schedule] = await db
      .insert(schedules)
      .values(insertSchedule)
      .returning();
    return schedule;
  }

  async updateSchedule(
    jobId: number,
    stageId: number,
    weekStart: string,
    scheduledSamples: number,
  ): Promise<Schedule | undefined> {
    // Validate sequential stage rules
    await this.validateSequentialStageRules(
      jobId,
      stageId,
      weekStart,
      scheduledSamples,
    );

    // First try to update existing schedule
    const [existingSchedule] = await db
      .update(schedules)
      .set({ scheduledSamples })
      .where(
        and(
          eq(schedules.jobId, jobId),
          eq(schedules.stageId, stageId),
          eq(schedules.weekStart, weekStart),
        ),
      )
      .returning();

    // If no existing schedule found, create a new one
    if (!existingSchedule) {
      const [newSchedule] = await db
        .insert(schedules)
        .values({
          jobId,
          stageId,
          weekStart,
          scheduledSamples,
        })
        .returning();
      return newSchedule;
    }

    return existingSchedule;
  }

  private async validateSequentialStageRules(
    jobId: number,
    stageId: number,
    weekStart: string,
    scheduledSamples: number,
  ): Promise<void> {
    // Get the job and its activity type
    const jobWithActivityType = await db
      .select({
        job: jobs,
        activityType: activityTypes,
      })
      .from(jobs)
      .innerJoin(activityTypes, eq(jobs.activityType, activityTypes.name))
      .where(eq(jobs.id, jobId));
    
    if (!jobWithActivityType[0]) {
      throw new Error("Job not found");
    }

    const { job, activityType } = jobWithActivityType[0];

    // Get the current stage
    const [currentStage] = await db
      .select()
      .from(stages)
      .where(eq(stages.id, stageId));
    if (!currentStage) {
      throw new Error("Stage not found");
    }

    // Get the stages that are applicable to this job's activity type
    const applicableStages = await db
      .select({
        stage: stages,
        activityTypeStage: activityTypeStages,
      })
      .from(activityTypeStages)
      .innerJoin(stages, eq(activityTypeStages.stageId, stages.id))
      .where(eq(activityTypeStages.activityTypeId, activityType.id))
      .orderBy(stages.order);

    // Find the current stage in the applicable stages
    const currentStageIndex = applicableStages.findIndex(
      (s) => s.stage.id === currentStage.id
    );
    if (currentStageIndex === -1) {
      throw new Error("Current stage not found in job's applicable stages");
    }

    // Check if this is the first applicable stage for this job
    if (currentStageIndex === 0) {
      return; // No validation needed for the first applicable stage
    }

    // Get the previous applicable stage
    const previousApplicableStage = applicableStages[currentStageIndex - 1];
    if (!previousApplicableStage) {
      return; // No previous stage to validate against
    }

    // Get all schedules for this job
    const jobSchedules = await db
      .select({
        schedules,
        stage: stages,
      })
      .from(schedules)
      .innerJoin(stages, eq(schedules.stageId, stages.id))
      .where(eq(schedules.jobId, jobId));

    // Calculate total samples from previous applicable stage (all time)
    const previousStageSchedules = jobSchedules.filter(
      (s) => s.stage.id === previousApplicableStage.stage.id,
    );
    const totalPreviousStageOutput = previousStageSchedules.reduce(
      (sum, s) => sum + s.schedules.scheduledSamples, 0
    );

    // Calculate total samples already scheduled for current stage (excluding the one being updated)
    const currentStageSchedules = jobSchedules.filter(
      (s) => s.stage.id === stageId && s.schedules.weekStart !== weekStart,
    );
    const totalCurrentStageScheduled = currentStageSchedules.reduce(
      (sum, s) => sum + s.schedules.scheduledSamples, 0
    );

    // Check if the new schedule would exceed available samples from previous stage
    const totalCurrentStageAfterUpdate = totalCurrentStageScheduled + scheduledSamples;
    
    if (totalCurrentStageAfterUpdate > totalPreviousStageOutput) {
      const actuallyAvailable = totalPreviousStageOutput - totalCurrentStageScheduled;
      throw new Error(
        `Cannot schedule ${scheduledSamples} samples in ${currentStage.name} for week ${weekStart}. ` +
          `Only ${actuallyAvailable} samples are available from previous stage (${previousApplicableStage.stage.name}).`,
      );
    }
  }

  async deleteSchedule(
    jobId: number,
    stageId: number,
    weekStart: string,
  ): Promise<boolean> {
    const result = await db
      .delete(schedules)
      .where(
        and(
          eq(schedules.jobId, jobId),
          eq(schedules.stageId, stageId),
          eq(schedules.weekStart, weekStart),
        ),
      );
    return true;
  }

  async getSchedulesByJobAndStage(
    jobId: number,
    stageId: number,
  ): Promise<Schedule[]> {
    return await db
      .select()
      .from(schedules)
      .where(and(eq(schedules.jobId, jobId), eq(schedules.stageId, stageId)));
  }

  async getCapacities(): Promise<Capacity[]> {
    return await db.select().from(capacities);
  }

  async getCapacitiesByWeek(weekStart: string): Promise<Capacity[]> {
    return await db
      .select()
      .from(capacities)
      .where(eq(capacities.weekStart, weekStart));
  }

  async createOrUpdateCapacity(
    insertCapacity: InsertCapacity,
  ): Promise<Capacity> {
    // First check if a capacity already exists
    const [existingCapacity] = await db
      .select()
      .from(capacities)
      .where(
        and(
          eq(capacities.stageId, insertCapacity.stageId),
          eq(capacities.weekStart, insertCapacity.weekStart),
        ),
      );

    if (existingCapacity) {
      // Update existing capacity
      const [updatedCapacity] = await db
        .update(capacities)
        .set({ maxCapacity: insertCapacity.maxCapacity })
        .where(
          and(
            eq(capacities.stageId, insertCapacity.stageId),
            eq(capacities.weekStart, insertCapacity.weekStart),
          ),
        )
        .returning();
      return updatedCapacity;
    } else {
      // Create new capacity
      const [newCapacity] = await db
        .insert(capacities)
        .values(insertCapacity)
        .returning();
      return newCapacity;
    }
  }

  async deleteCapacity(stageId: number, weekStart: string): Promise<boolean> {
    const result = await db
      .delete(capacities)
      .where(
        and(
          eq(capacities.stageId, stageId),
          eq(capacities.weekStart, weekStart),
        ),
      );
    return true;
  }

  async getActivityTypes(): Promise<ActivityType[]> {
    return await db.select().from(activityTypes);
  }

  async createActivityType(
    insertActivityType: InsertActivityType,
  ): Promise<ActivityType> {
    const [activityType] = await db
      .insert(activityTypes)
      .values(insertActivityType)
      .returning();
    return activityType;
  }

  async deleteActivityType(name: string): Promise<boolean> {
    const result = await db
      .delete(activityTypes)
      .where(eq(activityTypes.name, name));
    return true;
  }

  async getStages(): Promise<Stage[]> {
    return await db.select().from(stages).orderBy(stages.order);
  }

  async createStage(insertStage: InsertStage): Promise<Stage> {
    const [stage] = await db.insert(stages).values(insertStage).returning();
    return stage;
  }

  async updateStage(
    id: number,
    stageUpdate: Partial<InsertStage>,
  ): Promise<Stage | undefined> {
    const [stage] = await db
      .update(stages)
      .set(stageUpdate)
      .where(eq(stages.id, id))
      .returning();
    return stage;
  }

  async deleteStage(id: number): Promise<boolean> {
    const result = await db.delete(stages).where(eq(stages.id, id));
    return true;
  }

  async getActivityTypeStages(): Promise<ActivityTypeStage[]> {
    return await db.select().from(activityTypeStages);
  }

  async getActivityTypeStagesByActivityType(
    activityTypeId: number,
  ): Promise<ActivityTypeStage[]> {
    return await db
      .select()
      .from(activityTypeStages)
      .where(eq(activityTypeStages.activityTypeId, activityTypeId));
  }

  async createActivityTypeStage(
    insertActivityTypeStage: InsertActivityTypeStage,
  ): Promise<ActivityTypeStage> {
    const [activityTypeStage] = await db
      .insert(activityTypeStages)
      .values(insertActivityTypeStage)
      .returning();
    return activityTypeStage;
  }

  async updateActivityTypeStage(
    id: number,
    processingTimeDays: number,
  ): Promise<ActivityTypeStage | undefined> {
    const [activityTypeStage] = await db
      .update(activityTypeStages)
      .set({ processingTimeDays })
      .where(eq(activityTypeStages.id, id))
      .returning();
    return activityTypeStage || undefined;
  }

  async deleteActivityTypeStage(id: number): Promise<boolean> {
    const result = await db
      .delete(activityTypeStages)
      .where(eq(activityTypeStages.id, id));
    return true;
  }

  async deleteActivityTypeStagesByActivityType(
    activityTypeId: number,
  ): Promise<boolean> {
    const result = await db
      .delete(activityTypeStages)
      .where(eq(activityTypeStages.activityTypeId, activityTypeId));
    return true;
  }

  async getJobsWithSchedules(): Promise<JobWithSchedules[]> {
    const allJobs = await this.getJobs();

    const jobsWithSchedules = await Promise.all(
      allJobs.map(async (job) => {
        const jobSchedules = await db
          .select({
            schedule: schedules,
            stage: stages,
          })
          .from(schedules)
          .innerJoin(stages, eq(schedules.stageId, stages.id))
          .where(eq(schedules.jobId, job.id));

        const schedulesWithStages = jobSchedules.map((row) => ({
          ...row.schedule,
          stage: row.stage,
        }));

        const scheduledSamples = schedulesWithStages.reduce(
          (sum, s) => sum + s.scheduledSamples,
          0,
        );
        const remainingSamples = job.totalSamples - scheduledSamples;

        return {
          ...job,
          schedules: schedulesWithStages,
          remainingSamples: Math.max(0, remainingSamples),
        };
      }),
    );

    return jobsWithSchedules;
  }

  async getWeekCapacities(weekStarts: string[]): Promise<WeekCapacity[]> {
    const result: WeekCapacity[] = [];
    const allSchedules = await this.getSchedules();
    const allStages = await this.getStages();
    const allCapacities = await this.getCapacities();

    for (const weekStart of weekStarts) {
      const weekSchedules = allSchedules.filter(
        (s) => s.weekStart === weekStart,
      );

      // Group schedules by stage for this week
      const schedulesByStage = new Map<number, number>();
      for (const schedule of weekSchedules) {
        const current = schedulesByStage.get(schedule.stageId) || 0;
        schedulesByStage.set(
          schedule.stageId,
          current + schedule.scheduledSamples,
        );
      }

      // Get capacity for each stage
      for (const stage of allStages) {
        const capacity = allCapacities.find(
          (c) => c.stageId === stage.id && c.weekStart === weekStart,
        );
        const maxCapacity = capacity?.maxCapacity || 0;
        const usedCapacity = schedulesByStage.get(stage.id) || 0;

        result.push({
          stageId: stage.id,
          stageName: stage.name,
          weekStart,
          maxCapacity,
          usedCapacity,
          remainingCapacity: maxCapacity - usedCapacity,
        });
      }
    }

    return result;
  }

  async getStageCapacitySummary(
    weekStarts: string[],
    stageId?: number,
  ): Promise<StageCapacitySummary[]> {
    const result: StageCapacitySummary[] = [];
    const allStages = await this.getStages();
    const allSchedules = await this.getSchedules();
    const allCapacities = await this.getCapacities();

    // Filter stages if stageId is provided
    const stagesToProcess = stageId
      ? allStages.filter((s) => s.id === stageId)
      : allStages;

    for (const weekStart of weekStarts) {
      for (const stage of stagesToProcess) {
        // Get schedules for this week and stage
        const weekStageSchedules = allSchedules.filter(
          (s) => s.weekStart === weekStart && s.stageId === stage.id,
        );

        const usedCapacity = weekStageSchedules.reduce(
          (sum, s) => sum + s.scheduledSamples,
          0,
        );

        // Get capacity for this stage and week
        const capacity = allCapacities.find(
          (c) => c.stageId === stage.id && c.weekStart === weekStart,
        );
        const maxCapacity = capacity?.maxCapacity || 0;

        result.push({
          stageId: stage.id,
          stageName: stage.name,
          weekStart,
          maxCapacity,
          usedCapacity,
          remainingCapacity: maxCapacity - usedCapacity,
        });
      }
    }

    return result;
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  private getWeekStart(date: Date): string {
    // Always treat as local time
    const weekStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = weekStart.getDay();
    // Adjust for Monday as start of week (day 0 = Sunday, day 1 = Monday)
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
    weekStart.setDate(diff);
    weekStart.setHours(0, 0, 0, 0);
    // Format as YYYY-MM-DD in local time
    const yyyy = weekStart.getFullYear();
    const mm = String(weekStart.getMonth() + 1).padStart(2, '0');
    const dd = String(weekStart.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private addBusinessDays(startDate: Date, businessDays: number): Date {
    if (businessDays === 0) {
      return new Date(startDate);
    }

    const result = new Date(startDate);
    let daysAdded = 0;

    while (daysAdded < businessDays) {
      result.setDate(result.getDate() + 1);

      // Skip weekends (Saturday = 6, Sunday = 0)
      const dayOfWeek = result.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        daysAdded++;
      }
    }

    return result;
  }

  private async scheduleQuantityForWeek(
    jobId: number,
    stageId: number,
    weekStart: string,
    quantity: number,
  ): Promise<void> {
    // Check if schedule already exists
    const existingSchedule = await db
      .select()
      .from(schedules)
      .where(
        and(
          eq(schedules.jobId, jobId),
          eq(schedules.stageId, stageId),
          eq(schedules.weekStart, weekStart),
        ),
      )
      .limit(1);

    if (existingSchedule.length > 0) {
      // Update existing schedule
      await db
        .update(schedules)
        .set({
          scheduledSamples: existingSchedule[0].scheduledSamples + quantity,
        })
        .where(
          and(
            eq(schedules.jobId, jobId),
            eq(schedules.stageId, stageId),
            eq(schedules.weekStart, weekStart),
          ),
        );
    } else {
      // Create new schedule
      await db.insert(schedules).values({
        jobId,
        stageId,
        weekStart,
        scheduledSamples: quantity,
      });
    }
  }

  async autoPlanJob(jobId: number): Promise<void> {
    // Get job details
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }

    // First get the activity type ID from the name
    const [activityType] = await db
      .select({ id: activityTypes.id })
      .from(activityTypes)
      .where(eq(activityTypes.name, job.activityType))
      .limit(1);

    if (!activityType) {
      throw new Error(`Activity type '${job.activityType}' not found`);
    }

    // Get activity type and its stages
    const jobStagesData = await db
      .select({
        id: activityTypeStages.id,
        stageId: activityTypeStages.stageId,
        processingTimeDays: activityTypeStages.processingTimeDays,
        stage: {
          id: stages.id,
          name: stages.name,
          order: stages.order,
          proceedWithTestQty: stages.proceedWithTestQty,
          releaseRemainingAtStageId: stages.releaseRemainingAtStageId,
        },
      })
      .from(activityTypeStages)
      .innerJoin(stages, eq(activityTypeStages.stageId, stages.id))
      .where(eq(activityTypeStages.activityTypeId, activityType.id))
      .orderBy(stages.order);

    if (jobStagesData.length === 0) {
      throw new Error(`No stages found for activity type ${job.activityType}`);
    }

    // Clear existing schedules for this job
    await db.delete(schedules).where(eq(schedules.jobId, jobId));

    // Batch-based auto-planning logic
    interface Batch {
      qty: number;
      lastScheduledStage: number | null;
      held: boolean;
      schedulingCompleted: boolean;
      lastScheduledDate: Date | null;
      releaseQtyHeldAtStage: number | null;
    }

    const batches: Batch[] = [
      {
        qty: job.totalSamples,
        lastScheduledStage: null,
        held: false,
        schedulingCompleted: false,
        lastScheduledDate: null,
        releaseQtyHeldAtStage: null,
      },
    ];

    // Keep looping until all batches are completed
    let maxIterations = 100; // Reduced for debugging
    let iterations = 0;

    console.log(
      "AUTO-PLAN: Starting with job stages:",
      jobStagesData.map((s) => ({
        stageId: s.stageId,
        name: s.stage.name,
        order: s.stage.order,
        proceedWithTestQty: s.stage.proceedWithTestQty,
        releaseRemainingAtStageId: s.stage.releaseRemainingAtStageId,
        processingDays: s.processingTimeDays,
      })),
    );

    while (
      batches.some((b) => !b.schedulingCompleted) &&
      iterations < maxIterations
    ) {
      iterations++;

      console.log(`\n=== ITERATION ${iterations} ===`);

      // Log current schedules in database for this job
      const currentSchedules = await db
        .select()
        .from(schedules)
        .where(eq(schedules.jobId, jobId));
      console.log(
        `Current schedules in database (${currentSchedules.length} total):`,
      );
      if (currentSchedules.length === 0) {
        console.log("  (No schedules yet)");
      } else {
        currentSchedules.forEach((schedule) => {
          console.log(
            `  Stage ${schedule.stageId}, Week ${schedule.weekStart}: ${schedule.scheduledSamples} samples`,
          );
        });
      }
      console.log(
        "Batches before sorting:",
        batches.map((b, i) => ({
          index: i,
          qty: b.qty,
          lastStage: b.lastScheduledStage,
          held: b.held,
          completed: b.schedulingCompleted,
          releaseAt: b.releaseQtyHeldAtStage,
          lastScheduledDate:
            b.lastScheduledDate?.toISOString().split("T")[0] || null,
        })),
      );

      let progressMade = false;

      // Sort batches to process non-held ones first
      batches.sort((a, b) => {
        if (a.held && !b.held) return 1;
        if (!a.held && b.held) return -1;
        return 0;
      });

      console.log(
        "Batches after sorting:",
        batches.map((b, i) => ({
          index: i,
          qty: b.qty,
          lastStage: b.lastScheduledStage,
          held: b.held,
          completed: b.schedulingCompleted,
          releaseAt: b.releaseQtyHeldAtStage,
          lastScheduledDate:
            b.lastScheduledDate?.toISOString().split("T")[0] || null,
        })),
      );

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];

        console.log(`\nProcessing batch ${i}:`, {
          qty: batch.qty,
          lastStage: batch.lastScheduledStage,
          held: batch.held,
          completed: batch.schedulingCompleted,
          releaseAt: batch.releaseQtyHeldAtStage,
          lastScheduledDate:
            batch.lastScheduledDate?.toISOString().split("T")[0] || null,
        });

        // Skip held batches
        if (batch.held || batch.schedulingCompleted) {
          console.log(
            `Skipping batch ${i}: held=${batch.held}, completed=${batch.schedulingCompleted}`,
          );
          continue;
        }

        // find processing time for previous stage
        const previousStageIndex =
          batch.lastScheduledStage == null
            ? 0
            : jobStagesData.findIndex(
                (s) => s.stageId === batch.lastScheduledStage,
              );

        let processingTimeForPreviousStage = 0;
        if (batch.lastScheduledStage != null) {
          console.log("previous job index: " + previousStageIndex);
          processingTimeForPreviousStage =
            jobStagesData[previousStageIndex].processingTimeDays;
        }

        const calculateNextSchedulingDateFrom =
          batch.lastScheduledDate == null
            ? new Date(job.materialArrivesDate)
            : batch.lastScheduledDate;

        // remember what the previous stage was for this batch if its not the first stage
        const previousStageId = batch.lastScheduledStage ?? null;

        // Determine next stage to schedule
        const nextStageIndex =
          batch.lastScheduledStage === null
            ? 0
            : jobStagesData.findIndex(
                (s) => s.stageId === batch.lastScheduledStage,
              ) + 1;

        console.log(
          `Next stage index for batch ${i}: ${nextStageIndex} (total stages: ${jobStagesData.length})`,
        );
        const nextStage = jobStagesData[nextStageIndex];

        // fine the next date to schedule for for this batch
        const forDate = this.addBusinessDays(
          calculateNextSchedulingDateFrom,
          processingTimeForPreviousStage,
        );

        console.log(
          `Schedule date for batch ${i}: ${forDate.toISOString().split("T")[0]}`,
        );

        console.log(`Processing stage:`, {
          stageId: nextStage.stageId,
          name: nextStage.stage.name,
          proceedWithTestQty: nextStage.stage.proceedWithTestQty,
          releaseRemainingAtStageId: nextStage.stage.releaseRemainingAtStageId,
        });

        var schedulingQty = batch.qty;
        var heldQty = 0;

        // only schedule the amount that can proceed, if defined. hold the rest
        if (nextStage.stage.proceedWithTestQty != null) {
          heldQty = Math.max(batch.qty - nextStage.stage.proceedWithTestQty, 0);
          schedulingQty = Math.min(
            nextStage.stage.proceedWithTestQty,
            schedulingQty,
          );
        }

        // schedule the batch for the next stage
        var weekStart = this.getWeekStart(forDate);
        await this.scheduleQuantityForWeek(
          jobId,
          nextStage.stageId,
          weekStart,
          schedulingQty,
        );

        // and update the batch information
        batch.qty = schedulingQty;
        batch.lastScheduledStage = nextStage.stageId;
        batch.lastScheduledDate = forDate;

        // if this is the last stage, mark the batch as completed
        if (nextStageIndex === jobStagesData.length - 1)
          batch.schedulingCompleted = true;

        // create a new held batch if required
        if (heldQty != 0) {
          batches.push({
            qty: heldQty,
            lastScheduledStage: previousStageId,
            held: true,
            schedulingCompleted: false,
            lastScheduledDate: null,
            releaseQtyHeldAtStage: nextStage.stage.releaseRemainingAtStageId,
          });
        }

        // now check what other held ones need to be released
        const releasedBatches = [];
        for (let j = 0; j < batches.length; j++) {
          const heldBatch = batches[j];
          if (
            heldBatch.held &&
            heldBatch.releaseQtyHeldAtStage === batch.lastScheduledStage
          ) {
            console.log(
              `Releasing held batch ${j} (${heldBatch.qty} samples) because stage ${batch.lastScheduledStage} was reached`,
            );

            // find the next stage for this held batch
            const releaseToStageIndex =
              jobStagesData.findIndex(
                (s) => s.stageId === heldBatch.lastScheduledStage,
              ) + 1;
            const releaseToStage = jobStagesData[releaseToStageIndex];

            // update the details of the held batch
            heldBatch.held = false;
            heldBatch.releaseQtyHeldAtStage = null;
            heldBatch.lastScheduledDate = batch.lastScheduledDate;
            heldBatch.lastScheduledStage = releaseToStage.stageId;
            if (releaseToStageIndex == jobStagesData.length - 1)
              heldBatch.schedulingCompleted = true;

            // record we have done this for logging
            releasedBatches.push(j);

            // schedule the held batch for the next stage
            await this.scheduleQuantityForWeek(
              jobId,
              releaseToStage.stageId,
              weekStart,
              heldBatch.qty,
            );
          }
        }
        if (releasedBatches.length > 0) {
          console.log(
            `Released ${releasedBatches.length} held batches: ${releasedBatches.join(", ")}`,
          );
        }
      }

      console.log(
        `End of iteration ${iterations}: progressMade=${progressMade}`,
      );

      // If no progress was made in this iteration, we're stuck
      if (!progressMade && iterations > 10) {
        console.error(
          "DEADLOCK DETECTED: No progress made, batches stuck:",
          batches.map((b, i) => ({
            index: i,
            qty: b.qty,
            lastStage: b.lastScheduledStage,
            held: b.held,
            completed: b.schedulingCompleted,
            releaseAt: b.releaseQtyHeldAtStage,
            lastScheduledDate:
              b.lastScheduledDate?.toISOString().split("T")[0] || null,
          })),
        );
        throw new Error("Auto-planning deadlock: no progress possible");
      }
    }

    console.log("AUTO-PLAN: Algorithm completed successfully");

    if (iterations >= maxIterations) {
      throw new Error("Auto-planning exceeded maximum iterations");
    }
  }

  async shiftJobSchedule(jobId: number, weeks: number): Promise<void> {
    // Get all schedules for this job
    const jobSchedules = await db
      .select()
      .from(schedules)
      .where(eq(schedules.jobId, jobId));

    if (jobSchedules.length === 0) {
      throw new Error("No schedules found for this job");
    }

    for (const schedule of jobSchedules) {
      const currentWeekStart = new Date(schedule.weekStart);
      const newWeekStart = new Date(currentWeekStart);
      newWeekStart.setDate(newWeekStart.getDate() + (weeks * 7));
      const newWeekStartString = newWeekStart.toISOString().split("T")[0];

      await db
        .update(schedules)
        .set({ weekStart: newWeekStartString })
        .where(eq(schedules.id, schedule.id));
    }
  }

  async moveSchedule(jobId: number, stageId: number, fromWeek: string, toWeek: string, quantity: number): Promise<void> {
    // Get current schedules
    const fromSchedule = await db
      .select()
      .from(schedules)
      .where(
        and(
          eq(schedules.jobId, jobId),
          eq(schedules.stageId, stageId),
          eq(schedules.weekStart, fromWeek),
        ),
      );

    if (fromSchedule.length === 0) {
      throw new Error("Source schedule not found");
    }

    if (fromSchedule[0].scheduledSamples < quantity) {
      throw new Error("Not enough samples in source week");
    }

    const toSchedule = await db
      .select()
      .from(schedules)
      .where(
        and(
          eq(schedules.jobId, jobId),
          eq(schedules.stageId, stageId),
          eq(schedules.weekStart, toWeek),
        ),
      );

    // Temporarily reduce the source schedule for validation
    const newFromQuantity = fromSchedule[0].scheduledSamples - quantity;
    await db
      .update(schedules)
      .set({ scheduledSamples: newFromQuantity })
      .where(
        and(
          eq(schedules.jobId, jobId),
          eq(schedules.stageId, stageId),
          eq(schedules.weekStart, fromWeek),
        ),
      );

    try {
      // Now validate and update/create the destination schedule
      if (toSchedule.length > 0) {
        // Update existing schedule
        const newToQuantity = toSchedule[0].scheduledSamples + quantity;
        await this.validateSequentialStageRules(jobId, stageId, toWeek, newToQuantity);
        await db
          .update(schedules)
          .set({ scheduledSamples: newToQuantity })
          .where(
            and(
              eq(schedules.jobId, jobId),
              eq(schedules.stageId, stageId),
              eq(schedules.weekStart, toWeek),
            ),
          );
      } else {
        // Create new schedule
        await this.validateSequentialStageRules(jobId, stageId, toWeek, quantity);
        await db.insert(schedules).values({
          jobId,
          stageId,
          weekStart: toWeek,
          scheduledSamples: quantity,
        });
      }

      // Clean up the source schedule if it's now zero
      if (newFromQuantity === 0) {
        await db
          .delete(schedules)
          .where(
            and(
              eq(schedules.jobId, jobId),
              eq(schedules.stageId, stageId),
              eq(schedules.weekStart, fromWeek),
            ),
          );
      }
    } catch (error) {
      // Restore the original source schedule if validation fails
      await db
        .update(schedules)
        .set({ scheduledSamples: fromSchedule[0].scheduledSamples })
        .where(
          and(
            eq(schedules.jobId, jobId),
            eq(schedules.stageId, stageId),
            eq(schedules.weekStart, fromWeek),
          ),
        );
      throw error;
    }
  }
}

export const storage = new DatabaseStorage();
