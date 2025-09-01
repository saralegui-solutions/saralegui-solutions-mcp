#!/usr/bin/env node

/**
 * Test Workflow Optimization Functionality
 */

import { DatabaseManager } from '../lib/database_manager.js';
import { LearningEngine } from '../lib/learning_engine.js';
import chalk from 'chalk';

async function testWorkflowOptimization() {
  console.log(chalk.blue.bold('⚡ Workflow Optimization Test'));
  console.log(chalk.blue('============================='));
  
  const db = new DatabaseManager({ dbPath: 'database/saralegui_assistant.db' });
  const learningEngine = new LearningEngine(db);
  
  try {
    await db.initialize();
    
    const sessionId = `workflow_test_${Date.now()}`;
    await db.createSession(sessionId, { workflowTest: true });
    
    console.log(chalk.yellow('🔧 Creating sample workflow executions...'));
    
    // Create realistic workflow data
    const workflows = [
      { tool: 'get_current_time', time: 150, desc: 'Time check' },
      { tool: 'generate_id', time: 100, desc: 'ID generation' },
      { tool: 'echo', time: 50, desc: 'Echo message' },
      { tool: 'system_info', time: 8000, desc: 'System info (slow!)' }, // Slow operation
      { tool: 'get_current_time', time: 150, desc: 'Another time check' },
      { tool: 'generate_id', time: 100, desc: 'Another ID' },
      { tool: 'echo', time: 50, desc: 'Another echo' },
      { tool: 'list_patterns', time: 6000, desc: 'Pattern listing (slow!)' }, // Another slow operation
      { tool: 'get_current_time', time: 150, desc: 'Final time check' },
      { tool: 'echo', time: 50, desc: 'Final echo' }
    ];
    
    // Insert workflow executions
    for (let i = 0; i < workflows.length; i++) {
      const workflow = workflows[i];
      await db.run(`
        INSERT INTO tool_executions 
        (tool_name, parameters, execution_time_ms, success, user_session_id, created_at)
        VALUES (?, '{"demo": true}', ?, 1, ?, datetime('now', '-' || ? || ' minutes'))
      `, [workflow.tool, workflow.time, sessionId, i * 2]);
      
      console.log(chalk.gray(`   ⏱️ ${workflow.desc}: ${workflow.time}ms`));
    }
    
    console.log(chalk.yellow('\\n🔍 Analyzing workflow patterns...'));
    
    const optimizations = await learningEngine.analyzeWorkflowOptimization(sessionId, 24);
    
    console.log(chalk.cyan(`\\n📊 Analysis Results:`));
    console.log(chalk.white(`   Found ${optimizations.length} optimization opportunities`));
    
    if (optimizations.length > 0) {
      optimizations.forEach((opt, index) => {
        console.log(chalk.white(`\\n   ${index + 1}. ${opt.type.toUpperCase()}: ${opt.issue}`));
        console.log(chalk.white(`      💡 Suggestion: ${opt.suggestion}`));
        console.log(chalk.white(`      ⏱️  Potential Savings: ${opt.potential_savings}ms`));
        
        if (opt.operations && opt.operations.length > 0) {
          console.log(chalk.gray(`      🐌 Slow operations detected: ${opt.operations.length}`));
          opt.operations.forEach(op => {
            console.log(chalk.gray(`         - ${op.tool_name}: ${op.execution_time_ms}ms`));
          });
        }
        if (opt.occurrences) {
          console.log(chalk.gray(`      🔄 Pattern occurrences: ${opt.occurrences}`));
        }
      });
      
      // Check stored insights
      console.log(chalk.cyan('\\n📝 Checking stored optimization insights...'));
      const storedInsights = await db.all(`
        SELECT type, issue, suggestion, potential_savings
        FROM optimization_insights 
        ORDER BY created_at DESC 
        LIMIT 5
      `);
      
      if (storedInsights.length > 0) {
        console.log(chalk.green(`   ✅ Found ${storedInsights.length} stored insights:`));
        storedInsights.forEach((insight, index) => {
          console.log(chalk.white(`   ${index + 1}. ${insight.type}: ${insight.issue}`));
          console.log(chalk.gray(`      Savings: ${insight.potential_savings}ms`));
        });
      }
    } else {
      console.log(chalk.yellow('   ℹ️ No optimization opportunities detected'));
    }
    
    console.log(chalk.green('\\n🎉 Workflow optimization test completed!'));
    
    await db.close();
    
  } catch (error) {
    console.error(chalk.red('❌ Workflow optimization test failed:'), error.message);
    await db.close();
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testWorkflowOptimization().catch(console.error);
}

export { testWorkflowOptimization };