#!/usr/bin/env tsx

import { db } from '../db';
import { storage } from '../storage';
import { jobs, schedules, stages, activityTypes, activityTypeStages } from '../../shared/schema';
import { eq } from 'drizzle-orm';

interface TestScenario {
  name: string;
  setup: () => Promise<{ jobId: number; expectedSchedules: any[] }>;
  validate: (schedules: any[]) => boolean;
}

class AutoPlanTestRunner {
  scenarios: TestScenario[] = [];

  addScenario(scenario: TestScenario) {
    this.scenarios.push(scenario);
  }

  async runSingleScenario(index: number) {
    if (index < 0 || index >= this.scenarios.length) {
      throw new Error(`Invalid scenario index: ${index}`);
    }

    const scenario = this.scenarios[index];
    console.log(`🧪 Testing: ${scenario.name}`);
    
    try {
      await this.cleanup();
      const { jobId, expectedSchedules } = await scenario.setup();
      
      // Run auto-planning
      await storage.autoPlanJob(jobId);
      
      // Get actual schedules
      const actualSchedules = await db.select().from(schedules).where(eq(schedules.jobId, jobId));
      
      // Validate results
      const isValid = scenario.validate(actualSchedules);
      
      if (isValid) {
        console.log(`✅ PASSED: ${scenario.name}`);
        return { passed: 1, failed: 0 };
      } else {
        console.log(`❌ FAILED: ${scenario.name}`);
        console.log(`   Expected: ${JSON.stringify(expectedSchedules, null, 2)}`);
        console.log(`   Actual: ${JSON.stringify(actualSchedules, null, 2)}`);
        return { passed: 0, failed: 1 };
      }
      
    } catch (error) {
      console.log(`💥 ERROR: ${scenario.name}`);
      console.log(`   ${error.message}`);
      return { passed: 0, failed: 1 };
    }
  }

  async runAllTests() {
    console.log(`Running ${this.scenarios.length} auto-planning test scenarios...\n`);
    
    let passed = 0;
    let failed = 0;

    for (const scenario of this.scenarios) {
      try {
        console.log(`🧪 Testing: ${scenario.name}`);
        
        // Clean up before test
        await this.cleanup();
        
        // Setup test data and get expected results
        const { jobId, expectedSchedules } = await scenario.setup();
        
        // Run auto-planning
        await storage.autoPlanJob(jobId);
        
        // Get actual schedules
        const actualSchedules = await db.select().from(schedules).where(eq(schedules.jobId, jobId));
        
        // Validate results
        const isValid = scenario.validate(actualSchedules);
        
        if (isValid) {
          console.log(`✅ PASSED: ${scenario.name}`);
          passed++;
        } else {
          console.log(`❌ FAILED: ${scenario.name}`);
          console.log(`   Expected: ${JSON.stringify(expectedSchedules, null, 2)}`);
          console.log(`   Actual: ${JSON.stringify(actualSchedules, null, 2)}`);
          failed++;
        }
        
        console.log('');
      } catch (error) {
        console.log(`💥 ERROR: ${scenario.name}`);
        console.log(`   ${error.message}`);
        failed++;
        console.log('');
      }
    }

    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
    return { passed, failed };
  }

  private async cleanup() {
    await db.delete(schedules);
    await db.delete(jobs);
    await db.delete(activityTypeStages);
    await db.delete(stages);
    await db.delete(activityTypes);
  }
}

// Test scenarios
const testRunner = new AutoPlanTestRunner();

// Scenario 1: Simple linear workflow
testRunner.addScenario({
  name: "Simple linear workflow without holds",
  setup: async () => {
    const activityType = await db.insert(activityTypes).values({
      name: 'LINEAR_TEST',
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
        processingTimeDays: 3
      },
      {
        activityTypeId: activityType[0].id,
        stageId: stage2[0].id,
        processingTimeDays: 2
      }
    ]);

    const job = await db.insert(jobs).values({
      name: 'Linear Test Job',
      description: 'Simple linear workflow',
      activityType: 'LINEAR_TEST',
      totalSamples: 15,
      materialArrivesDate: '2025-06-02',
      deadlineDate: '2025-06-30'
    }).returning();

    return {
      jobId: job[0].id,
      expectedSchedules: [
        { stageId: stage1[0].id, totalSamples: 15 },
        { stageId: stage2[0].id, totalSamples: 15 }
      ]
    };
  },
  validate: (schedules) => {
    // Get the actual stage IDs from the schedules
    const stageIds = Array.from(new Set(schedules.map(s => s.stageId))).sort();
    if (stageIds.length !== 2) return false;
    
    const stage1Total = schedules.filter(s => s.stageId === stageIds[0]).reduce((sum, s) => sum + s.scheduledSamples, 0);
    const stage2Total = schedules.filter(s => s.stageId === stageIds[1]).reduce((sum, s) => sum + s.scheduledSamples, 0);
    return stage1Total === 15 && stage2Total === 15;
  }
});

// Scenario 2: Proceed with test quantity
testRunner.addScenario({
  name: "Proceed with test quantity and release",
  setup: async () => {
    const activityType = await db.insert(activityTypes).values({
      name: 'PROCEED_TEST',
      color: '#FF0000'
    }).returning();

    const stage1 = await db.insert(stages).values({
      name: 'Initial',
      order: 1,
      color: '#FF0000'
    }).returning();

    const stage2 = await db.insert(stages).values({
      name: 'Proceed Stage',
      order: 2,
      color: '#00FF00',
      proceedWithTestQty: 5
    }).returning();

    const stage3 = await db.insert(stages).values({
      name: 'Release Point',
      order: 3,
      color: '#0000FF'
    }).returning();

    const stage4 = await db.insert(stages).values({
      name: 'Final',
      order: 4,
      color: '#FFFF00'
    }).returning();

    // Set release point
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
        processingTimeDays: 1
      },
      {
        activityTypeId: activityType[0].id,
        stageId: stage4[0].id,
        processingTimeDays: 2
      }
    ]);

    const job = await db.insert(jobs).values({
      name: 'Proceed Test Job',
      description: 'Test proceed/release logic',
      activityType: 'PROCEED_TEST',
      totalSamples: 20,
      materialArrivesDate: '2025-06-02',
      deadlineDate: '2025-07-30'
    }).returning();

    return {
      jobId: job[0].id,
      expectedSchedules: [
        { stageId: stage1[0].id, totalSamples: 20 },
        { stageId: stage2[0].id, totalSamples: 5 }, // Only proceed quantity
        { stageId: stage3[0].id, totalSamples: 20 }, // All samples eventually
        { stageId: stage4[0].id, totalSamples: 20 }  // All samples eventually
      ]
    };
  },
  validate: (schedules) => {
    const stageIds = Array.from(new Set(schedules.map(s => s.stageId))).sort();
    if (stageIds.length !== 4) return false;
    
    const stage1Total = schedules.filter(s => s.stageId === stageIds[0]).reduce((sum, s) => sum + s.scheduledSamples, 0);
    const stage2Total = schedules.filter(s => s.stageId === stageIds[1]).reduce((sum, s) => sum + s.scheduledSamples, 0);
    const stage3Total = schedules.filter(s => s.stageId === stageIds[2]).reduce((sum, s) => sum + s.scheduledSamples, 0);
    const stage4Total = schedules.filter(s => s.stageId === stageIds[3]).reduce((sum, s) => sum + s.scheduledSamples, 0);
    
    return stage1Total === 20 && stage2Total === 5 && stage3Total === 20 && stage4Total === 20;
  }
});

// Scenario 3: Multiple proceed points
testRunner.addScenario({
  name: "Multiple proceed points with same release",
  setup: async () => {
    const activityType = await db.insert(activityTypes).values({
      name: 'MULTI_PROCEED',
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
      proceedWithTestQty: 3
    }).returning();

    const stage3 = await db.insert(stages).values({
      name: 'Second Proceed',
      order: 3,
      color: '#0000FF',
      proceedWithTestQty: 2
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

    // Set both proceed stages to release at stage4
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
      name: 'Multi Proceed Job',
      description: 'Multiple proceed points',
      activityType: 'MULTI_PROCEED',
      totalSamples: 30,
      materialArrivesDate: '2025-06-02',
      deadlineDate: '2025-08-30'
    }).returning();

    return {
      jobId: job[0].id,
      expectedSchedules: [
        { stageId: stage1[0].id, totalSamples: 30 },
        { stageId: stage2[0].id, totalSamples: 3 },
        { stageId: stage3[0].id, totalSamples: 2 },
        { stageId: stage4[0].id, totalSamples: 30 },
        { stageId: stage5[0].id, totalSamples: 30 }
      ]
    };
  },
  validate: (schedules) => {
    const stageIds = Array.from(new Set(schedules.map(s => s.stageId))).sort();
    if (stageIds.length !== 5) return false;
    
    const stage1Total = schedules.filter(s => s.stageId === stageIds[0]).reduce((sum, s) => sum + s.scheduledSamples, 0);
    const stage2Total = schedules.filter(s => s.stageId === stageIds[1]).reduce((sum, s) => sum + s.scheduledSamples, 0);
    const stage3Total = schedules.filter(s => s.stageId === stageIds[2]).reduce((sum, s) => sum + s.scheduledSamples, 0);
    const stage4Total = schedules.filter(s => s.stageId === stageIds[3]).reduce((sum, s) => sum + s.scheduledSamples, 0);
    const stage5Total = schedules.filter(s => s.stageId === stageIds[4]).reduce((sum, s) => sum + s.scheduledSamples, 0);
    
    return stage1Total === 30 && stage2Total === 3 && stage3Total === 2 && stage4Total === 30 && stage5Total === 30;
  }
});

// Scenario 4: Specific user scenario - Stage 2 proceeds with 2, releases at Stage 4
testRunner.addScenario({
  name: 'User scenario: Stage 2 proceeds with 2, releases at Stage 4',
  setup: async () => {
    // Create activity type
    const activityType = await db.insert(activityTypes).values({
      name: 'ACTIVITY_TYPE_1',
      color: '#3B82F6'
    }).returning();

    // Create 5 stages
    const stage1 = await db.insert(stages).values({
      name: 'Stage 1',
      order: 1,
      color: '#EF4444'
    }).returning();

    const stage2 = await db.insert(stages).values({
      name: 'Stage 2',
      order: 2,
      color: '#F97316',
      proceedWithTestQty: 2,
      releaseRemainingAtStageId: null // Will be updated after Stage 4 is created
    }).returning();

    const stage3 = await db.insert(stages).values({
      name: 'Stage 3',
      order: 3,
      color: '#EAB308'
    }).returning();

    const stage4 = await db.insert(stages).values({
      name: 'Stage 4',
      order: 4,
      color: '#22C55E'
    }).returning();

    const stage5 = await db.insert(stages).values({
      name: 'Stage 5',
      order: 5,
      color: '#3B82F6'
    }).returning();

    // Update Stage 2 to release remaining at Stage 4
    await db.update(stages)
      .set({ releaseRemainingAtStageId: stage4[0].id })
      .where(eq(stages.id, stage2[0].id));

    // Create activity type stages relationships (all with 5 processing days)
    await db.insert(activityTypeStages).values([
      {
        activityTypeId: activityType[0].id,
        stageId: stage1[0].id,
        processingTimeDays: 5
      },
      {
        activityTypeId: activityType[0].id,
        stageId: stage2[0].id,
        processingTimeDays: 5
      },
      {
        activityTypeId: activityType[0].id,
        stageId: stage3[0].id,
        processingTimeDays: 5
      },
      {
        activityTypeId: activityType[0].id,
        stageId: stage4[0].id,
        processingTimeDays: 5
      },
      {
        activityTypeId: activityType[0].id,
        stageId: stage5[0].id,
        processingTimeDays: 5
      }
    ]);

    // Create job starting June 9th, 2025
    const job = await db.insert(jobs).values({
      name: 'User Test Job',
      description: 'Test job for user scenario',
      activityType: 'ACTIVITY_TYPE_1',
      totalSamples: 15,
      materialArrivesDate: '2025-06-09',
      deadlineDate: '2025-08-01'
    }).returning();

    return {
      jobId: job[0].id,
      expectedSchedules: [
        // Week of June 9th, 2025 - Stage 1: 15 samples
        { weekStart: '2025-06-09', stageId: stage1[0].id, scheduledSamples: 15 },
        // Week of June 16th, 2025 - Stage 2: 2 samples (proceed quantity)
        { weekStart: '2025-06-16', stageId: stage2[0].id, scheduledSamples: 2 },
        // Week of June 23rd, 2025 - Stage 3: 2 samples
        { weekStart: '2025-06-23', stageId: stage3[0].id, scheduledSamples: 2 },
        // Week of June 30th, 2025 - Stage 4: 2 samples + Stage 2: 13 samples (release)
        { weekStart: '2025-06-30', stageId: stage4[0].id, scheduledSamples: 2 },
        { weekStart: '2025-06-30', stageId: stage2[0].id, scheduledSamples: 13 },
        // Week of July 7th, 2025 - Stage 5: 2 samples + Stage 3: 13 samples
        { weekStart: '2025-07-07', stageId: stage5[0].id, scheduledSamples: 2 },
        { weekStart: '2025-07-07', stageId: stage3[0].id, scheduledSamples: 13 },
        // Week of July 14th, 2025 - Stage 4: 13 samples
        { weekStart: '2025-07-14', stageId: stage4[0].id, scheduledSamples: 13 },
        // Week of July 21st, 2025 - Stage 5: 13 samples
        { weekStart: '2025-07-21', stageId: stage5[0].id, scheduledSamples: 13 }
      ]
    };
  },
  validate: (schedules) => {
    // Print the actual schedules for debugging
    console.log('\n=== VALIDATION DEBUG ===');
    console.log('Total schedules:', schedules.length);
    
    // Group by stage and show totals
    const stageIds = Array.from(new Set(schedules.map(s => s.stageId))).sort();
    console.log('Stages found:', stageIds.length);
    
    stageIds.forEach(stageId => {
      const stageSchedules = schedules.filter(s => s.stageId === stageId);
      const total = stageSchedules.reduce((sum, s) => sum + s.scheduledSamples, 0);
      console.log(`Stage ${stageId}: ${total} total samples`);
      stageSchedules.forEach(s => {
        console.log(`  Week ${s.weekStart}: ${s.scheduledSamples} samples`);
      });
    });

    // Get totals by stage
    const stage1Total = schedules.filter(s => s.stageId === stageIds[0]).reduce((sum, s) => sum + s.scheduledSamples, 0);
    const stage2Total = schedules.filter(s => s.stageId === stageIds[1]).reduce((sum, s) => sum + s.scheduledSamples, 0);
    const stage3Total = schedules.filter(s => s.stageId === stageIds[2]).reduce((sum, s) => sum + s.scheduledSamples, 0);
    const stage4Total = schedules.filter(s => s.stageId === stageIds[3]).reduce((sum, s) => sum + s.scheduledSamples, 0);
    const stage5Total = schedules.filter(s => s.stageId === stageIds[4]).reduce((sum, s) => sum + s.scheduledSamples, 0);

    console.log('Stage totals:', { stage1Total, stage2Total, stage3Total, stage4Total, stage5Total });
    
    // Basic validation: all stages should have 15 total samples
    const totalsCorrect = stage1Total === 15 && stage2Total === 15 && stage3Total === 15 && stage4Total === 15 && stage5Total === 15;
    
    // Check that Stage 2 has proceed/release pattern (should have exactly 2 scheduled entries)
    const stage2Schedules = schedules.filter(s => s.stageId === stageIds[1]);
    const hasCorrectStage2Pattern = stage2Schedules.length === 2 && 
                                   stage2Schedules.some(s => s.scheduledSamples === 2) && 
                                   stage2Schedules.some(s => s.scheduledSamples === 13);
    
    console.log('Validation results:');
    console.log('- Totals correct:', totalsCorrect);
    console.log('- Stage 2 pattern correct:', hasCorrectStage2Pattern);
    console.log('========================\n');

    return totalsCorrect && hasCorrectStage2Pattern && stageIds.length === 5;
  }
});

// Run tests with command line support
async function runTests() {
  try {
    // Check if a specifc scenario was requested
    const scenarioArg = process.argv[2];
    
    if (scenarioArg) {
      if (scenarioArg === 'list') {
        console.log('Available test scenarios:');
        testRunner.scenarios.forEach((scenario, index) => {
          console.log(`  ${index + 1}. ${scenario.name}`);
        });
        console.log('\nUsage:');
        console.log('  npx tsx server/tests/testRunner.ts          # Run all tests');
        console.log('  npx tsx server/tests/testRunner.ts [1-3]    # Run specific scenario');
        console.log('  npx tsx server/tests/testRunner.ts list     # List all scenarios');
        return;
      }
      
      const scenarioIndex = parseInt(scenarioArg) - 1;
      if (scenarioIndex >= 0 && scenarioIndex < testRunner.scenarios.length) {
        console.log(`Running single scenario: ${testRunner.scenarios[scenarioIndex].name}\n`);
        const results = await testRunner.runSingleScenario(scenarioIndex);
        process.exit(results.failed > 0 ? 1 : 0);
      } else {
        console.log('Invalid scenario number. Available scenarios:');
        testRunner.scenarios.forEach((scenario, index) => {
          console.log(`  ${index + 1}. ${scenario.name}`);
        });
        process.exit(1);
      }
    } else {
      // Run all tests
      const results = await testRunner.runAllTests();
      process.exit(results.failed > 0 ? 1 : 0);
    }
  } catch (error) {
    console.error('Test runner failed:', error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}

export { testRunner, AutoPlanTestRunner };