#!/usr/bin/env node

import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function resetDatabase() {
  const client = await pool.connect();

  try {
    console.log('🗑️ Deleting all jobs and schedules...');
    await client.query('DELETE FROM schedules');
    await client.query('DELETE FROM jobs');

    console.log('🗑️ Deleting all stages and activity types...');
    await client.query('DELETE FROM activity_type_stages');
    await client.query('DELETE FROM capacities');
    await client.query('DELETE FROM stages');
    await client.query('DELETE FROM activity_types');

    console.log('🏗️ Creating stages...');
    const stageNames = [
      'Initial Machining',
      'Straining',
      'Final Machining',
      'Specimen Preparation',
      'Testing',
      'Post-test Analysis'
    ];

    const colors = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6'];

    const stageIds = [];
    for (let i = 0; i < stageNames.length; i++) {
      const result = await client.query(
        'INSERT INTO stages (name, "order", color) VALUES ($1, $2, $3) RETURNING id',
        [stageNames[i], i + 1, colors[i]]
      );
      stageIds.push(result.rows[0].id);
      console.log(`  ✅ Created stage: ${stageNames[i]}`);
    }

    console.log('🏗️ Creating activity types...');
    const activityTypeNames = [
      'SENT',
      'SENB',
      'Tensile RT',
      'Tensile non-ambient',
      'CT DCPD',
      'CT TO/US',
      'In-situ SENB',
      'In-situ CT',
      'Routine Mech'
    ];

    const activityColors = ['#DC2626', '#EA580C', '#D97706', '#65A30D', '#059669', '#0891B2', '#0284C7', '#7C3AED', '#C026D3'];

    for (let i = 0; i < activityTypeNames.length; i++) {
      const activityResult = await client.query(
        'INSERT INTO activity_types (name, color) VALUES ($1, $2) RETURNING id',
        [activityTypeNames[i], activityColors[i]]
      );
      const activityTypeId = activityResult.rows[0].id;
      console.log(`  ✅ Created activity type: ${activityTypeNames[i]}`);

      // Create relationships with all stages (5 day processing time)
      for (const stageId of stageIds) {
        await client.query(
          'INSERT INTO activity_type_stages (activity_type_id, stage_id, processing_time_days) VALUES ($1, $2, $3)',
          [activityTypeId, stageId, 5]
        );
      }
      console.log(`    🔗 Linked to all ${stageIds.length} stages with 5-day processing time`);
    }

    console.log('📊 Creating capacity for next 52 weeks...');
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1); // Get this Monday

    for (let week = 0; week < 52; week++) {
      const weekStart = new Date(monday);
      weekStart.setDate(monday.getDate() + (week * 7));
      const weekStartStr = weekStart.toISOString().split('T')[0];

      for (const stageId of stageIds) {
        await client.query(
          'INSERT INTO capacities (stage_id, week_start, max_capacity) VALUES ($1, $2, $3)',
          [stageId, weekStartStr, 50]
        );
      }

      if (week % 10 === 0) {
        console.log(`  ✅ Created capacity for week ${week + 1}/52`);
      }
    }

    console.log('✅ Database reset completed successfully!');
    console.log(`📋 Summary:`);
    console.log(`   - ${stageNames.length} stages created`);
    console.log(`   - ${activityTypeNames.length} activity types created`);
    console.log(`   - ${stageIds.length * activityTypeNames.length} activity-stage relationships created`);
    console.log(`   - ${52 * stageIds.length} capacity entries created (52 weeks × ${stageIds.length} stages)`);

  } catch (error) {
    console.error('❌ Error resetting database:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

resetDatabase();