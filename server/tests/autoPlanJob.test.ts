import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../db';
import { storage } from '../storage';
import { jobs, schedules, stages, activityTypes, activityTypeStages } from '@shared/schema';
import { eq } from 'drizzle-orm';

describe('autoPlanJob', () => {
  // Clean up before and after each test
  beforeEach(async () => {
    await db.delete(schedules);
    await db.delete(jobs);
    await db.delete(activityTypeStages);
    await db.delete(stages);
    await db.delete(activityTypes);
  });

  afterEach(async () => {
    await db.delete(schedules);
    await db.delete(jobs);
    await db.delete(activityTypeStages);
    await db.delete(stages);
    await db.delete(activityTypes);
  });

  it('should plan a simple job without proceed/release stages', async () => {
    // Setup test data
    const activityType = await db.insert(activityTypes).values({
      name: 'TEST_ACTIVITY',
      color: '#FF0000'
    }).returning();

    const stage1 = await db.insert(stages).values({
      name: 'Stage 1',
      order: 1,
      color: '#FF0000'
    }).returning();

    const stage2 = await db.insert(stages).values({
      name: 'Stage 2', 
      order: 2,
      color: '#00FF00'
    }).returning();

    await db.insert(activityTypeStages).values([
      {
        activityTypeId: activityType[0].id,
        stageId: stage1[0].id,
        processingTimeDays: 5
      },
      {
        activityTypeId: activityType[0].id,
        stageId: stage2[0].id,
        processingTimeDays: 3
      }
    ]);

    const job = await db.insert(jobs).values({
      name: 'Test Job',
      description: 'Test description',
      activityType: 'TEST_ACTIVITY',
      totalSamples: 10,
      materialArrivesDate: '2025-06-02',
      deadlineDate: '2025-06-30'
    }).returning();

    // Execute auto-planning
    await storage.autoPlanJob(job[0].id);

    // Verify schedules were created
    const createdSchedules = await db.select().from(schedules).where(eq(schedules.jobId, job[0].id));
    
    expect(createdSchedules).toHaveLength(2);
    expect(createdSchedules.find(s => s.stageId === stage1[0].id)?.scheduledSamples).toBe(10);
    expect(createdSchedules.find(s => s.stageId === stage2[0].id)?.scheduledSamples).toBe(10);
  });

  it('should handle proceed with test quantity and release stages', async () => {
    // Setup test data with proceed/release logic
    const activityType = await db.insert(activityTypes).values({
      name: 'TEST_PROCEED',
      color: '#FF0000'
    }).returning();

    const stage1 = await db.insert(stages).values({
      name: 'Stage 1',
      order: 1,
      color: '#FF0000'
    }).returning();

    const stage2 = await db.insert(stages).values({
      name: 'Stage 2 - Proceed',
      order: 2,
      color: '#00FF00',
      proceedWithTestQty: 3,
      releaseRemainingAtStageId: null // Will set after stage3 is created
    }).returning();

    const stage3 = await db.insert(stages).values({
      name: 'Stage 3 - Release Point',
      order: 3,
      color: '#0000FF'
    }).returning();

    const stage4 = await db.insert(stages).values({
      name: 'Stage 4',
      order: 4,
      color: '#FFFF00'
    }).returning();

    // Update stage2 to reference stage3 as release point
    await db.update(stages)
      .set({ releaseRemainingAtStageId: stage3[0].id })
      .where(eq(stages.id, stage2[0].id));

    await db.insert(activityTypeStages).values([
      {
        activityTypeId: activityType[0].id,
        stageId: stage1[0].id,
        processingTimeDays: 2
      },
      {
        activityTypeId: activityType[0].id,
        stageId: stage2[0].id,
        processingTimeDays: 3
      },
      {
        activityTypeId: activityType[0].id,
        stageId: stage3[0].id,
        processingTimeDays: 2
      },
      {
        activityTypeId: activityType[0].id,
        stageId: stage4[0].id,
        processingTimeDays: 1
      }
    ]);

    const job = await db.insert(jobs).values({
      name: 'Test Proceed Job',
      description: 'Test proceed/release logic',
      activityType: 'TEST_PROCEED',
      totalSamples: 10,
      materialArrivesDate: '2025-06-02',
      deadlineDate: '2025-07-30'
    }).returning();

    // Execute auto-planning
    await storage.autoPlanJob(job[0].id);

    // Verify schedules
    const createdSchedules = await db.select().from(schedules).where(eq(schedules.jobId, job[0].id));
    
    // Should have schedules for all stages
    expect(createdSchedules.length).toBeGreaterThan(0);
    
    // Check that stage2 has the proceed quantity (3 samples)
    const stage2Schedules = createdSchedules.filter(s => s.stageId === stage2[0].id);
    const stage2Total = stage2Schedules.reduce((sum, s) => sum + s.scheduledSamples, 0);
    expect(stage2Total).toBe(3);

    // Check that stage4 has all samples eventually (3 + 7 = 10)
    const stage4Schedules = createdSchedules.filter(s => s.stageId === stage4[0].id);
    const stage4Total = stage4Schedules.reduce((sum, s) => sum + s.scheduledSamples, 0);
    expect(stage4Total).toBe(10);
  });

  it('should handle multiple proceed/release stages in sequence', async () => {
    // Setup complex scenario with multiple proceed points
    const activityType = await db.insert(activityTypes).values({
      name: 'COMPLEX_TEST',
      color: '#FF0000'
    }).returning();

    const stage1 = await db.insert(stages).values({
      name: 'Initial',
      order: 1,
      color: '#FF0000'
    }).returning();

    const stage2 = await db.insert(stages).values({
      name: 'First Proceed',
      order: 2,
      color: '#00FF00',
      proceedWithTestQty: 2
    }).returning();

    const stage3 = await db.insert(stages).values({
      name: 'Second Proceed', 
      order: 3,
      color: '#0000FF',
      proceedWithTestQty: 1
    }).returning();

    const stage4 = await db.insert(stages).values({
      name: 'Release Point',
      order: 4,
      color: '#FFFF00'
    }).returning();

    const stage5 = await db.insert(stages).values({
      name: 'Final',
      order: 5,
      color: '#FF00FF'
    }).returning();

    // Set release points
    await db.update(stages)
      .set({ releaseRemainingAtStageId: stage4[0].id })
      .where(eq(stages.id, stage2[0].id));

    await db.update(stages)
      .set({ releaseRemainingAtStageId: stage4[0].id })
      .where(eq(stages.id, stage3[0].id));

    await db.insert(activityTypeStages).values([
      {
        activityTypeId: activityType[0].id,
        stageId: stage1[0].id,
        processingTimeDays: 1
      },
      {
        activityTypeId: activityType[0].id,
        stageId: stage2[0].id,
        processingTimeDays: 2
      },
      {
        activityTypeId: activityType[0].id,
        stageId: stage3[0].id,
        processingTimeDays: 2
      },
      {
        activityTypeId: activityType[0].id,
        stageId: stage4[0].id,
        processingTimeDays: 1
      },
      {
        activityTypeId: activityType[0].id,
        stageId: stage5[0].id,
        processingTimeDays: 1
      }
    ]);

    const job = await db.insert(jobs).values({
      name: 'Complex Test Job',
      description: 'Multiple proceed/release points',
      activityType: 'COMPLEX_TEST',
      totalSamples: 20,
      materialArrivesDate: '2025-06-02',
      deadlineDate: '2025-08-30'
    }).returning();

    // Execute auto-planning
    await storage.autoPlanJob(job[0].id);

    // Verify schedules
    const createdSchedules = await db.select().from(schedules).where(eq(schedules.jobId, job[0].id));
    
    // Check total samples are preserved
    const stage1Total = createdSchedules.filter(s => s.stageId === stage1[0].id)
      .reduce((sum, s) => sum + s.scheduledSamples, 0);
    expect(stage1Total).toBe(20);

    // Check proceed quantities
    const stage2Total = createdSchedules.filter(s => s.stageId === stage2[0].id)
      .reduce((sum, s) => sum + s.scheduledSamples, 0);
    expect(stage2Total).toBe(2);

    const stage3Total = createdSchedules.filter(s => s.stageId === stage3[0].id)
      .reduce((sum, s) => sum + s.scheduledSamples, 0);
    expect(stage3Total).toBe(1);

    // Check final stage gets all samples
    const stage5Total = createdSchedules.filter(s => s.stageId === stage5[0].id)
      .reduce((sum, s) => sum + s.scheduledSamples, 0);
    expect(stage5Total).toBe(20);
  });

  it('should throw error for invalid activity type', async () => {
    const job = await db.insert(jobs).values({
      name: 'Invalid Job',
      description: 'Test invalid activity type',
      activityType: 'NONEXISTENT',
      totalSamples: 5,
      materialArrivesDate: '2025-06-02',
      deadlineDate: '2025-06-30'
    }).returning();

    await expect(storage.autoPlanJob(job[0].id)).rejects.toThrow('Activity type NONEXISTENT not found');
  });

  it('should throw error for activity type with no stages', async () => {
    const activityType = await db.insert(activityTypes).values({
      name: 'NO_STAGES',
      color: '#FF0000'
    }).returning();

    const job = await db.insert(jobs).values({
      name: 'No Stages Job',
      description: 'Test activity type with no stages',
      activityType: 'NO_STAGES',
      totalSamples: 5,
      materialArrivesDate: '2025-06-02',
      deadlineDate: '2025-06-30'
    }).returning();

    await expect(storage.autoPlanJob(job[0].id)).rejects.toThrow('No stages found for activity type NO_STAGES');
  });
});