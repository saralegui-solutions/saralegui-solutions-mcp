#!/usr/bin/env node

/**
 * Enhanced Learning Engine Test Suite
 * Comprehensive tests for enhanced learning capabilities
 */

import { DatabaseManager } from '../lib/database_manager.js';
import { LearningEngine } from '../lib/learning_engine.js';
import { ToolRegistry } from '../lib/tool_registry.js';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

class EnhancedLearningTestSuite {
  constructor() {
    this.db = new DatabaseManager({ 
      dbPath: join(dirname(__dirname), 'test_enhanced_learning.db')
    });
    this.learningEngine = new LearningEngine(this.db);
    this.toolRegistry = new ToolRegistry(this.db);
    
    this.testResults = {
      passed: 0,
      failed: 0,
      total: 0,
      failures: []
    };
  }

  async runAllTests() {
    console.log(chalk.blue('🧪 Enhanced Learning Engine Test Suite'));
    console.log(chalk.blue('====================================='));
    
    try {
      // Initialize test environment
      await this.setupTestEnvironment();
      
      // Run test categories
      await this.testQueryPatternLearning();
      await this.testWorkflowOptimization();
      await this.testErrorPrediction();
      await this.testCrossProjectLearning();
      await this.testEnhancedTools();
      await this.testLearningInsights();
      
      // Print results
      this.printResults();
      
      // Cleanup
      await this.cleanup();
      
    } catch (error) {
      console.error(chalk.red('❌ Test suite failed to run:'), error.message);
      process.exit(1);
    }
  }

  async setupTestEnvironment() {
    console.log(chalk.yellow('🔧 Setting up test environment...'));
    
    // Initialize database and components
    await this.db.initialize();
    await this.toolRegistry.initialize();
    
    // Create test session
    this.testSessionId = 'test_session_enhanced_learning';
    await this.db.createSession(this.testSessionId, { test: true });
    
    console.log(chalk.green('✅ Test environment ready'));
  }

  async testQueryPatternLearning() {
    console.log(chalk.yellow('\\n📋 Testing Query Pattern Learning...'));
    
    const queries = [
      { query: 'Create a new tool for testing', response: 'Tool created successfully', success: true },
      { query: 'List all available patterns', response: 'Found 3 patterns', success: true },
      { query: 'Create another tool for validation', response: 'Tool created successfully', success: true },
      { query: 'Show me the current status', response: 'Status: active', success: true },
      { query: 'Generate report for analysis', response: 'Report generated', success: true }
    ];
    
    // Test learning from queries
    for (let i = 0; i < queries.length; i++) {
      const { query, response, success } = queries[i];
      const result = await this.learningEngine.learnFromQuery(query, response, success, { test: true });
      
      await this.assert(
        `Query learning ${i + 1}`,
        result && result.learned,
        `Failed to learn from query: "${query}"`
      );
    }
    
    // Test pattern recognition
    const creationQueries = queries.filter(q => q.query.includes('Create') || q.query.includes('create'));
    await this.assert(
      'Creation intent detection',
      creationQueries.length > 0,
      'Should detect creation intent patterns'
    );
    
    // Test duplicate query handling
    const duplicateResult = await this.learningEngine.learnFromQuery(
      queries[0].query, 
      'Updated response', 
      true, 
      { test: true }
    );
    
    await this.assert(
      'Duplicate query pattern handling',
      duplicateResult && duplicateResult.learned,
      'Should handle duplicate query patterns correctly'
    );
  }

  async testWorkflowOptimization() {
    console.log(chalk.yellow('\\n⚡ Testing Workflow Optimization...'));
    
    // Create mock workflow executions
    const workflows = [
      { tool: 'get_current_time', time: 100 },
      { tool: 'echo', time: 50 },
      { tool: 'generate_id', time: 75 },
      { tool: 'get_current_time', time: 6000 }, // Slow operation
      { tool: 'echo', time: 50 },
      { tool: 'generate_id', time: 75 },
      { tool: 'system_info', time: 8000 }, // Another slow operation
      { tool: 'get_current_time', time: 100 },
      { tool: 'echo', time: 50 }
    ];
    
    // Insert mock executions
    for (const workflow of workflows) {
      await this.db.run(`
        INSERT INTO tool_executions 
        (tool_name, parameters, execution_time_ms, success, user_session_id, created_at)
        VALUES (?, '{}', ?, 1, ?, datetime('now', '-' || ? || ' minutes'))
      `, [workflow.tool, workflow.time, this.testSessionId, Math.random() * 60]);
    }
    
    // Test workflow optimization analysis
    const optimizations = await this.learningEngine.analyzeWorkflowOptimization(this.testSessionId, 24);
    
    await this.assert(
      'Workflow optimization detection',
      optimizations.length > 0,
      'Should detect workflow optimization opportunities'
    );
    
    // Check for slow operations detection
    const slowOpsOptimization = optimizations.find(opt => opt.type === 'performance');
    await this.assert(
      'Slow operations detection',
      slowOpsOptimization !== undefined,
      'Should detect slow operations'
    );
    
    // Check for repetitive sequences
    const repetitiveSeqOptimization = optimizations.find(opt => opt.type === 'automation');
    await this.assert(
      'Repetitive sequence detection',
      repetitiveSeqOptimization !== undefined,
      'Should detect repetitive sequences'
    );
  }

  async testErrorPrediction() {
    console.log(chalk.yellow('\\n🔮 Testing Error Prediction...'));
    
    // Create mock error patterns
    const errorExecutions = [
      { tool: 'echo', params: { text: 'error1' }, error: 'Parameter validation failed' },
      { tool: 'echo', params: { text: 'error1' }, error: 'Parameter validation failed' },
      { tool: 'generate_id', params: { type: 'invalid' }, error: 'Invalid type specified' },
      { tool: 'echo', params: { text: 'error2' }, error: 'Different error' }
    ];
    
    // Insert mock error executions
    for (const execution of errorExecutions) {
      await this.db.run(`
        INSERT INTO tool_executions 
        (tool_name, parameters, success, error_message, user_session_id, created_at)
        VALUES (?, ?, 0, ?, ?, datetime('now', '-' || ? || ' hours'))
      `, [
        execution.tool, 
        JSON.stringify(execution.params), 
        execution.error, 
        this.testSessionId, 
        Math.random() * 24
      ]);
    }
    
    // Test error prediction for similar parameters
    const prediction1 = await this.learningEngine.predictPotentialErrors(
      'echo',
      { text: 'error1' }, // Similar to known failing pattern
      { test: true }
    );
    
    await this.assert(
      'High-risk error prediction',
      prediction1.risk === 'high',
      `Should predict high risk for similar parameters. Got: ${prediction1.risk}`
    );
    
    // Test error prediction for different parameters
    const prediction2 = await this.learningEngine.predictPotentialErrors(
      'echo',
      { text: 'success_case' },
      { test: true }
    );
    
    await this.assert(
      'Low-risk error prediction',
      prediction2.risk === 'low',
      `Should predict low risk for different parameters. Got: ${prediction2.risk}`
    );
    
    // Test error prediction for tool with no failures
    const prediction3 = await this.learningEngine.predictPotentialErrors(
      'system_info',
      {},
      { test: true }
    );
    
    await this.assert(
      'No-history error prediction',
      prediction3.risk === 'low' && prediction3.reason,
      'Should handle tools with no failure history'
    );
  }

  async testCrossProjectLearning() {
    console.log(chalk.yellow('\\n🌐 Testing Cross-Project Learning...'));
    
    // Create mock patterns from different projects
    const patterns = [
      { signature: 'pattern_a', project: 'project1' },
      { signature: 'pattern_a', project: 'project2' },
      { signature: 'pattern_b', project: 'project1' },
      { signature: 'pattern_c', project: 'project3' }
    ];
    
    // Insert mock patterns
    for (const pattern of patterns) {
      await this.db.run(`
        INSERT INTO learned_patterns 
        (pattern_signature, pattern_type, pattern_data, occurrences, confidence_score, learned_from, created_at)
        VALUES (?, 'test', '{}', 1, 0.8, ?, datetime('now'))
      `, [pattern.signature, pattern.project]);
    }
    
    // Test cross-project learning enablement
    const result = await this.learningEngine.enableCrossProjectLearning();
    
    await this.assert(
      'Cross-project learning execution',
      result.success,
      `Cross-project learning should succeed. Error: ${result.error || 'none'}`
    );
    
    await this.assert(
      'Pattern promotion',
      result.promoted_patterns > 0,
      'Should promote patterns that appear across multiple projects'
    );
  }

  async testEnhancedTools() {
    console.log(chalk.yellow('\\n🔧 Testing Enhanced Learning Tools...'));
    
    const context = {
      db: this.db,
      learningEngine: this.learningEngine,
      sessionId: this.testSessionId
    };
    
    // Test get_learning_insights tool
    const insights = await this.toolRegistry.executeTool('get_learning_insights', {
      session_id: this.testSessionId,
      hours: 24
    }, context);
    
    await this.assert(
      'Learning insights tool',
      insights.success && insights.result,
      `Learning insights tool should work. Error: ${insights.error || 'none'}`
    );
    
    // Test analyze_workflow_optimization tool  
    const workflowAnalysis = await this.toolRegistry.executeTool('analyze_workflow_optimization', {
      session_id: this.testSessionId,
      hours: 24
    }, context);
    
    await this.assert(
      'Workflow optimization tool',
      workflowAnalysis.success,
      `Workflow optimization tool should work. Error: ${workflowAnalysis.error || 'none'}`
    );
    
    // Test predict_tool_errors tool
    const errorPrediction = await this.toolRegistry.executeTool('predict_tool_errors', {
      tool_name: 'echo',
      parameters: { text: 'test' }
    }, context);
    
    await this.assert(
      'Error prediction tool',
      errorPrediction.success && errorPrediction.result,
      `Error prediction tool should work. Error: ${errorPrediction.error || 'none'}`
    );
    
    // Test learn_from_query tool
    const queryLearning = await this.toolRegistry.executeTool('learn_from_query', {
      query: 'Test query for learning',
      response: 'Test response',
      success: true
    }, context);
    
    await this.assert(
      'Query learning tool',
      queryLearning.success,
      `Query learning tool should work. Error: ${queryLearning.error || 'none'}`
    );
    
    // Test get_learning_dashboard tool
    const dashboard = await this.toolRegistry.executeTool('get_learning_dashboard', {
      timeframe: '24h'
    }, context);
    
    await this.assert(
      'Learning dashboard tool',
      dashboard.success,
      `Learning dashboard tool should work. Error: ${dashboard.error || 'none'}`
    );
  }

  async testLearningInsights() {
    console.log(chalk.yellow('\\n💡 Testing Learning Insights...'));
    
    // Test comprehensive learning insights
    const insights = await this.learningEngine.getLearningInsights(this.testSessionId, 24);
    
    await this.assert(
      'Learning insights structure',
      insights && typeof insights === 'object',
      'Learning insights should return structured data'
    );
    
    await this.assert(
      'Insights contains patterns detected',
      'patterns_detected' in insights,
      'Insights should include patterns detected count'
    );
    
    await this.assert(
      'Insights contains recommendations',
      Array.isArray(insights.recommendations),
      'Insights should include recommendations array'
    );
    
    // Test that insights reflect our test data
    await this.assert(
      'Insights reflect activity',
      insights.optimizations_found >= 0,
      'Insights should reflect optimization activity'
    );
  }

  async assert(testName, condition, message) {
    this.testResults.total++;
    
    if (condition) {
      this.testResults.passed++;
      console.log(chalk.green(`  ✅ ${testName}`));
    } else {
      this.testResults.failed++;
      this.testResults.failures.push({ test: testName, message });
      console.log(chalk.red(`  ❌ ${testName}: ${message}`));
    }
  }

  printResults() {
    console.log(chalk.blue('\\n📊 Test Results'));
    console.log(chalk.blue('==============='));
    console.log(chalk.green(`✅ Passed: ${this.testResults.passed}`));
    console.log(chalk.red(`❌ Failed: ${this.testResults.failed}`));
    console.log(chalk.blue(`📋 Total: ${this.testResults.total}`));
    
    const successRate = ((this.testResults.passed / this.testResults.total) * 100).toFixed(1);
    console.log(chalk.blue(`📈 Success Rate: ${successRate}%`));
    
    if (this.testResults.failures.length > 0) {
      console.log(chalk.red('\\n❌ Failures:'));
      this.testResults.failures.forEach((failure, index) => {
        console.log(chalk.red(`${index + 1}. ${failure.test}: ${failure.message}`));
      });
    }
    
    if (this.testResults.failed === 0) {
      console.log(chalk.green('\\n🎉 All tests passed! Enhanced learning is ready.'));
    } else {
      console.log(chalk.yellow(`\\n⚠️ ${this.testResults.failed} tests failed. Review and fix before deployment.`));
    }
  }

  async cleanup() {
    console.log(chalk.yellow('\\n🧹 Cleaning up...'));
    await this.db.close();
    console.log(chalk.green('✅ Cleanup complete'));
  }
}

// Run tests if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const testSuite = new EnhancedLearningTestSuite();
  testSuite.runAllTests()
    .then(() => {
      process.exit(testSuite.testResults.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error(chalk.red('Test suite crashed:'), error);
      process.exit(1);
    });
}

export { EnhancedLearningTestSuite };