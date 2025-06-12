#!/usr/bin/env node

// Simple test runner for auto-planning scenarios
import { execSync } from 'child_process';

console.log('🚀 Running Auto-Planning Tests...\n');

try {
  // Run the test runner
  execSync('npx tsx server/tests/testRunner.ts', { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
  
  console.log('\n✅ All tests completed successfully!');
} catch (error) {
  console.log('\n❌ Some tests failed. Check output above for details.');
  process.exit(1);
}