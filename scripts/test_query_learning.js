#!/usr/bin/env node

/**
 * Test Query Learning Functionality
 */

import { DatabaseManager } from '../lib/database_manager.js';
import { LearningEngine } from '../lib/learning_engine.js';
import chalk from 'chalk';

async function testQueryLearning() {
  console.log(chalk.blue.bold('🧠 Query Learning Test'));
  console.log(chalk.blue('======================'));
  
  const db = new DatabaseManager({ dbPath: 'database/saralegui_assistant.db' });
  const learningEngine = new LearningEngine(db);
  
  try {
    await db.initialize();
    
    console.log(chalk.yellow('📝 Testing query learning with sample queries...'));
    
    const queries = [
      { query: 'Create a new validation rule for JavaScript', response: 'Rule created successfully', success: true },
      { query: 'List all current patterns', response: 'Found 5 patterns', success: true },
      { query: 'Create another validation rule for TypeScript', response: 'Rule created successfully', success: true },
      { query: 'Generate a report on system performance', response: 'Report generated', success: true },
      { query: 'Help me understand the system', response: 'System explanation provided', success: true }
    ];
    
    for (let i = 0; i < queries.length; i++) {
      const { query, response, success } = queries[i];
      console.log(chalk.gray(`\\n   Learning from: "${query}"`));
      
      const result = await learningEngine.learnFromQuery(query, response, success, { 
        test: true, 
        timestamp: new Date().toISOString() 
      });
      
      if (result && result.learned) {
        console.log(chalk.green(`   ✅ Learned pattern with intent: ${result.intent}`));
      } else {
        console.log(chalk.yellow('   ⚠️ Pattern already known or learning disabled'));
      }
    }
    
    // Check learned patterns
    console.log(chalk.cyan('\\n📊 Checking learned patterns...'));
    const patterns = await db.all(`
      SELECT pattern_text, intent, occurrences, success_rate
      FROM query_patterns 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    if (patterns.length > 0) {
      console.log(chalk.green(`\\n✅ Found ${patterns.length} learned query patterns:`));
      patterns.forEach((pattern, index) => {
        console.log(chalk.white(`   ${index + 1}. Intent: ${pattern.intent}`));
        console.log(chalk.gray(`      Pattern: "${pattern.pattern_text}"`));
        console.log(chalk.gray(`      Occurrences: ${pattern.occurrences}, Success Rate: ${(pattern.success_rate * 100).toFixed(1)}%`));
      });
    } else {
      console.log(chalk.yellow('\\n⚠️ No patterns found in database'));
    }
    
    // Test intent classification
    console.log(chalk.cyan('\\n🎯 Testing intent classification...'));
    const testQueries = [
      'Create a new tool',
      'Show me all patterns',
      'Help with configuration',
      'Delete old data',
      'Update the settings'
    ];
    
    for (const testQuery of testQueries) {
      const intent = learningEngine.classifyQueryIntent(testQuery);
      console.log(chalk.white(`   "${testQuery}" → ${intent}`));
    }
    
    console.log(chalk.green('\\n🎉 Query learning test completed successfully!'));
    
    await db.close();
    
  } catch (error) {
    console.error(chalk.red('❌ Query learning test failed:'), error.message);
    await db.close();
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testQueryLearning().catch(console.error);
}

export { testQueryLearning };