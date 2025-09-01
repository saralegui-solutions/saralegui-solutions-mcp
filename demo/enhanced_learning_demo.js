#!/usr/bin/env node

/**
 * Enhanced MCP Learning Server Demo
 * Interactive demonstration of enhanced learning capabilities
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DatabaseManager } from '../lib/database_manager.js';
import { LearningEngine } from '../lib/learning_engine.js';
import { ToolRegistry } from '../lib/tool_registry.js';
import chalk from 'chalk';
import readline from 'readline';

class EnhancedLearningDemo {
  constructor() {
    this.db = new DatabaseManager({ dbPath: 'database/saralegui_assistant.db' });
    this.learningEngine = new LearningEngine(this.db);
    this.toolRegistry = new ToolRegistry(this.db);
    
    this.sessionId = `demo_session_${Date.now()}`;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async start() {
    console.log(chalk.blue.bold('🚀 Enhanced MCP Learning Server Demo'));
    console.log(chalk.blue('====================================='));
    console.log(chalk.yellow('Initializing enhanced learning capabilities...\\n'));

    try {
      // Initialize components
      await this.db.initialize();
      await this.toolRegistry.initialize();
      await this.db.createSession(this.sessionId, { demo: true });

      console.log(chalk.green('✅ System initialized successfully!\\n'));
      
      // Show main menu
      await this.showMainMenu();
    } catch (error) {
      console.error(chalk.red('❌ Initialization failed:'), error.message);
      process.exit(1);
    }
  }

  async showMainMenu() {
    console.log(chalk.cyan.bold('🎯 Enhanced Learning Demo Menu'));
    console.log(chalk.cyan('==============================='));
    console.log(chalk.white('1. 🧠 Query Pattern Learning Demo'));
    console.log(chalk.white('2. ⚡ Workflow Optimization Demo'));
    console.log(chalk.white('3. 🔮 Error Prediction Demo'));
    console.log(chalk.white('4. 🌐 Cross-Project Learning Demo'));
    console.log(chalk.white('5. 📊 Learning Insights Dashboard'));
    console.log(chalk.white('6. 🛠️  Test Enhanced Tools'));
    console.log(chalk.white('7. 💡 Interactive Learning Session'));
    console.log(chalk.white('8. 📈 Generate Learning Report'));
    console.log(chalk.white('9. ❌ Exit'));
    
    const choice = await this.prompt('\\n🔢 Select demo (1-9): ');
    
    switch (choice.trim()) {
      case '1':
        await this.demoQueryPatternLearning();
        break;
      case '2':
        await this.demoWorkflowOptimization();
        break;
      case '3':
        await this.demoErrorPrediction();
        break;
      case '4':
        await this.demoCrossProjectLearning();
        break;
      case '5':
        await this.showLearningDashboard();
        break;
      case '6':
        await this.testEnhancedTools();
        break;
      case '7':
        await this.interactiveLearningSession();
        break;
      case '8':
        await this.generateLearningReport();
        break;
      case '9':
        await this.exit();
        return;
      default:
        console.log(chalk.red('❌ Invalid choice. Please select 1-9.'));
    }
    
    await this.prompt('\\n📖 Press Enter to return to main menu...');
    await this.showMainMenu();
  }

  async demoQueryPatternLearning() {
    console.log(chalk.blue.bold('\\n🧠 Query Pattern Learning Demo'));
    console.log(chalk.blue('================================'));
    
    const queries = [
      { query: 'Create a new validation rule for JavaScript', response: 'Created rule successfully', success: true },
      { query: 'List all current patterns', response: 'Found 5 patterns', success: true },
      { query: 'Generate a report on system performance', response: 'Report generated', success: true },
      { query: 'Create another validation rule for TypeScript', response: 'Created rule successfully', success: true },
      { query: 'Show me the learning statistics', response: 'Statistics displayed', success: true }
    ];

    console.log(chalk.yellow('📝 Learning from sample queries...'));
    
    for (let i = 0; i < queries.length; i++) {
      const { query, response, success } = queries[i];
      console.log(chalk.gray(`\\n   Query ${i + 1}: "${query}"`));
      
      const result = await this.learningEngine.learnFromQuery(
        query, 
        response, 
        success, 
        { demo: true, timestamp: new Date().toISOString() }
      );
      
      if (result && result.learned) {
        console.log(chalk.green(`   ✅ Learned pattern with intent: ${result.intent}`));
      } else {
        console.log(chalk.yellow('   ⚠️ Pattern already known or learning disabled'));
      }
    }
    
    console.log(chalk.cyan('\\n🎯 Pattern Analysis Complete!'));
    console.log(chalk.white('The system has learned to recognize:'));
    console.log(chalk.white('• Creation requests (create, generate, make)'));
    console.log(chalk.white('• Retrieval requests (list, show, get)'));
    console.log(chalk.white('• Help requests (help, how, what)'));
    
    // Show learned patterns
    const patterns = await this.db.all(`
      SELECT pattern_text, intent, occurrences 
      FROM query_patterns 
      ORDER BY occurrences DESC 
      LIMIT 5
    `);
    
    if (patterns.length > 0) {
      console.log(chalk.cyan('\\n📋 Top Learned Patterns:'));
      patterns.forEach((pattern, index) => {
        console.log(chalk.white(`   ${index + 1}. ${pattern.intent}: "${pattern.pattern_text}" (${pattern.occurrences} times)`));
      });
    }
  }

  async demoWorkflowOptimization() {
    console.log(chalk.blue.bold('\\n⚡ Workflow Optimization Demo'));
    console.log(chalk.blue('==============================='));
    
    // Create sample workflow data
    console.log(chalk.yellow('🔧 Creating sample workflow executions...'));
    
    const workflows = [
      { tool: 'get_current_time', time: 150, desc: 'Time check' },
      { tool: 'generate_id', time: 100, desc: 'ID generation' },
      { tool: 'echo', time: 50, desc: 'Echo message' },
      { tool: 'system_info', time: 8000, desc: 'System info (slow!)' },
      { tool: 'get_current_time', time: 150, desc: 'Another time check' },
      { tool: 'generate_id', time: 100, desc: 'Another ID' },
      { tool: 'echo', time: 50, desc: 'Another echo' },
      { tool: 'list_patterns', time: 6000, desc: 'Pattern listing (slow!)' },
      { tool: 'get_current_time', time: 150, desc: 'Final time check' }
    ];
    
    // Insert workflow executions
    for (let i = 0; i < workflows.length; i++) {
      const workflow = workflows[i];
      await this.db.run(`
        INSERT INTO tool_executions 
        (tool_name, parameters, execution_time_ms, success, user_session_id, created_at)
        VALUES (?, '{"demo": true}', ?, 1, ?, datetime('now', '-' || ? || ' minutes'))
      `, [workflow.tool, workflow.time, this.sessionId, i * 2]);
      
      console.log(chalk.gray(`   ⏱️ ${workflow.desc}: ${workflow.time}ms`));
    }
    
    console.log(chalk.yellow('\\n🔍 Analyzing workflow patterns...'));
    
    const optimizations = await this.learningEngine.analyzeWorkflowOptimization(this.sessionId, 24);
    
    console.log(chalk.cyan(`\\n📊 Found ${optimizations.length} optimization opportunities:`));
    
    optimizations.forEach((opt, index) => {
      console.log(chalk.white(`\\n   ${index + 1}. ${opt.type.toUpperCase()}: ${opt.issue}`));
      console.log(chalk.white(`      💡 Suggestion: ${opt.suggestion}`));
      console.log(chalk.white(`      ⏱️  Potential Savings: ${opt.potential_savings}ms`));
      
      if (opt.operations) {
        console.log(chalk.gray(`      🐌 Slow operations: ${opt.operations.length} detected`));
      }
      if (opt.occurrences) {
        console.log(chalk.gray(`      🔄 Pattern occurrences: ${opt.occurrences}`));
      }
    });
    
    if (optimizations.length === 0) {
      console.log(chalk.yellow('   ℹ️ No optimization opportunities detected. Try running more varied workflows.'));
    }
  }

  async demoErrorPrediction() {
    console.log(chalk.blue.bold('\\n🔮 Error Prediction Demo'));
    console.log(chalk.blue('=========================='));
    
    // Create some error patterns
    console.log(chalk.yellow('❗ Creating sample error patterns...'));
    
    const errorData = [
      { tool: 'echo', params: { text: 'error_case' }, error: 'Parameter validation failed' },
      { tool: 'echo', params: { text: 'error_case' }, error: 'Parameter validation failed' },
      { tool: 'generate_id', params: { type: 'invalid_type' }, error: 'Invalid type specified' },
      { tool: 'system_info', params: { format: 'bad_format' }, error: 'Format not supported' }
    ];
    
    // Insert error executions
    for (const error of errorData) {
      await this.db.run(`
        INSERT INTO tool_executions 
        (tool_name, parameters, success, error_message, user_session_id, created_at)
        VALUES (?, ?, 0, ?, ?, datetime('now', '-' || ? || ' hours'))
      `, [
        error.tool, 
        JSON.stringify(error.params), 
        error.error, 
        this.sessionId, 
        Math.random() * 12
      ]);
    }
    
    console.log(chalk.yellow('\\n🔍 Testing error prediction...'));
    
    // Test cases
    const testCases = [
      {
        name: 'High Risk Case',
        tool: 'echo',
        params: { text: 'error_case' },
        expected: 'high'
      },
      {
        name: 'Low Risk Case',
        tool: 'echo',
        params: { text: 'safe_case' },
        expected: 'low'
      },
      {
        name: 'Unknown Tool Case',
        tool: 'get_current_time',
        params: { format: 'iso' },
        expected: 'low'
      }
    ];
    
    for (const testCase of testCases) {
      console.log(chalk.white(`\\n   🧪 Testing: ${testCase.name}`));
      console.log(chalk.gray(`      Tool: ${testCase.tool}`));
      console.log(chalk.gray(`      Params: ${JSON.stringify(testCase.params)}`));
      
      const prediction = await this.learningEngine.predictPotentialErrors(
        testCase.tool,
        testCase.params,
        { demo: true }
      );
      
      const riskColor = prediction.risk === 'high' ? chalk.red : 
                       prediction.risk === 'medium' ? chalk.yellow : chalk.green;
      
      console.log(riskColor(`      🎯 Predicted Risk: ${prediction.risk.toUpperCase()}`));
      console.log(chalk.gray(`      🎲 Confidence: ${(prediction.confidence * 100).toFixed(1)}%`));
      
      if (prediction.reasons && prediction.reasons.length > 0) {
        console.log(chalk.gray(`      💭 Reasons: ${prediction.reasons.slice(0, 2).join(', ')}`));
      }
    }
  }

  async demoCrossProjectLearning() {
    console.log(chalk.blue.bold('\\n🌐 Cross-Project Learning Demo'));
    console.log(chalk.blue('=================================='));
    
    console.log(chalk.yellow('🏗️ Creating cross-project patterns...'));
    
    // Create patterns from different projects
    const patterns = [
      { signature: 'js_validation_pattern', project: 'esonus-escalon', type: 'validation' },
      { signature: 'js_validation_pattern', project: 'client-portal', type: 'validation' },
      { signature: 'api_error_handling', project: 'esonus-escalon', type: 'error_handling' },
      { signature: 'api_error_handling', project: 'client-portal', type: 'error_handling' },
      { signature: 'api_error_handling', project: 'infrastructure-tools', type: 'error_handling' },
      { signature: 'unique_pattern', project: 'single-project', type: 'unique' }
    ];
    
    // Insert patterns
    for (const pattern of patterns) {
      try {
        await this.db.run(`
          INSERT INTO learned_patterns 
          (pattern_signature, pattern_type, pattern_data, occurrences, confidence_score, learned_from, created_at)
          VALUES (?, ?, ?, 1, 0.8, ?, datetime('now'))
        `, [
          `${pattern.signature}_${Math.random().toString(36).substr(2, 5)}`, // Make unique
          pattern.type, 
          JSON.stringify({ demo: true, project: pattern.project }), 
          pattern.project
        ]);
        console.log(chalk.gray(`   📁 Added pattern from ${pattern.project}: ${pattern.signature}`));
      } catch (error) {
        // Skip duplicates
        console.log(chalk.gray(`   ⚠️ Skipped duplicate pattern: ${pattern.signature}`));
      }
    }
    
    console.log(chalk.yellow('\\n🔄 Enabling cross-project learning...'));
    
    const result = await this.learningEngine.enableCrossProjectLearning();
    
    if (result.success) {
      console.log(chalk.green(`\\n✅ Cross-project learning successful!`));
      console.log(chalk.white(`   📊 Promoted ${result.promoted_patterns} patterns to global scope`));
      console.log(chalk.white(`   💬 ${result.message}`));
      
      if (result.promoted_patterns > 0) {
        console.log(chalk.cyan('\\n🌟 Benefits of cross-project learning:'));
        console.log(chalk.white('   • Patterns proven across multiple projects'));
        console.log(chalk.white('   • Higher confidence in pattern reliability'));
        console.log(chalk.white('   • Automatic application to new projects'));
        console.log(chalk.white('   • Reduced duplicate learning effort'));
      }
    } else {
      console.log(chalk.red(`\\n❌ Cross-project learning failed: ${result.error}`));
    }
  }

  async showLearningDashboard() {
    console.log(chalk.blue.bold('\\n📊 Learning Insights Dashboard'));
    console.log(chalk.blue('==============================='));
    
    const insights = await this.learningEngine.getLearningInsights(this.sessionId, 24);
    
    console.log(chalk.cyan('\\n📈 Learning Metrics (Last 24 hours):'));
    console.log(chalk.white(`   🧠 Patterns Detected: ${insights.patterns_detected}`));
    console.log(chalk.white(`   🛠️ Tools Generated: ${insights.tools_generated}`));
    console.log(chalk.white(`   ⚡ Optimizations Found: ${insights.optimizations_found}`));
    console.log(chalk.white(`   🔮 Error Predictions: ${insights.error_predictions}`));
    
    if (insights.recommendations.length > 0) {
      console.log(chalk.cyan('\\n💡 Recommendations:'));
      insights.recommendations.forEach((rec, index) => {
        const priorityColor = rec.priority === 'high' ? chalk.red : 
                             rec.priority === 'medium' ? chalk.yellow : chalk.green;
        
        console.log(priorityColor(`   ${index + 1}. [${rec.priority.toUpperCase()}] ${rec.type}`));
        console.log(chalk.white(`      ${rec.message}`));
      });
    } else {
      console.log(chalk.yellow('\\n💡 No specific recommendations at this time.'));
    }
    
    // Get tool usage stats
    console.log(chalk.cyan('\\n🔧 Tool Usage Statistics:'));
    const usage = await this.db.all(`
      SELECT 
        tool_name,
        COUNT(*) as executions,
        AVG(execution_time_ms) as avg_time,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count
      FROM tool_executions
      WHERE user_session_id = ?
      GROUP BY tool_name
      ORDER BY executions DESC
      LIMIT 5
    `, [this.sessionId]);
    
    if (usage.length > 0) {
      usage.forEach((tool, index) => {
        const successRate = ((tool.success_count / tool.executions) * 100).toFixed(1);
        console.log(chalk.white(`   ${index + 1}. ${tool.tool_name}: ${tool.executions} executions, ${successRate}% success, ${tool.avg_time?.toFixed(0) || 0}ms avg`));
      });
    } else {
      console.log(chalk.yellow('   No tool usage data available for this session.'));
    }
  }

  async testEnhancedTools() {
    console.log(chalk.blue.bold('\\n🛠️ Enhanced Learning Tools Test'));
    console.log(chalk.blue('================================='));
    
    const context = {
      db: this.db,
      learningEngine: this.learningEngine,
      sessionId: this.sessionId
    };
    
    const tests = [
      {
        name: 'Learning Insights',
        tool: 'get_learning_insights',
        params: { session_id: this.sessionId, hours: 24 }
      },
      {
        name: 'Error Prediction',
        tool: 'predict_tool_errors',
        params: { tool_name: 'echo', parameters: { text: 'test' } }
      },
      {
        name: 'Query Learning',
        tool: 'learn_from_query',
        params: { 
          query: 'Test enhanced learning system',
          response: 'System tested successfully',
          success: true
        }
      },
      {
        name: 'Learning Dashboard',
        tool: 'get_learning_dashboard',
        params: { timeframe: '24h' }
      }
    ];
    
    for (const test of tests) {
      console.log(chalk.yellow(`\\n🧪 Testing: ${test.name}`));
      
      try {
        const result = await this.toolRegistry.executeTool(test.tool, test.params, context);
        
        if (result.success) {
          console.log(chalk.green(`   ✅ ${test.name} - SUCCESS`));
          
          if (result.result && typeof result.result === 'object') {
            const keys = Object.keys(result.result);
            console.log(chalk.gray(`      📊 Response contains: ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}`));
          }
        } else {
          console.log(chalk.red(`   ❌ ${test.name} - FAILED: ${result.error}`));
        }
      } catch (error) {
        console.log(chalk.red(`   💥 ${test.name} - ERROR: ${error.message}`));
      }
    }
  }

  async interactiveLearningSession() {
    console.log(chalk.blue.bold('\\n💡 Interactive Learning Session'));
    console.log(chalk.blue('================================='));
    console.log(chalk.yellow('Type your queries and see the system learn! (type "exit" to return)\\n'));
    
    while (true) {
      const query = await this.prompt('🤔 Your query: ');
      
      if (query.toLowerCase().trim() === 'exit') {
        break;
      }
      
      if (query.trim() === '') {
        continue;
      }
      
      // Simulate processing
      console.log(chalk.gray('   🤖 Processing query...'));
      
      const response = `Processed query: "${query}"`;
      const success = Math.random() > 0.1; // 90% success rate
      
      // Learn from the query
      const learning = await this.learningEngine.learnFromQuery(query, response, success, { 
        interactive: true,
        timestamp: new Date().toISOString()
      });
      
      if (learning && learning.learned) {
        console.log(chalk.green(`   🧠 Learned new pattern! Intent: ${learning.intent}`));
      } else {
        console.log(chalk.gray('   📝 Pattern already known or learning disabled'));
      }
      
      // Show response
      console.log(success ? chalk.green(`   ✅ ${response}`) : chalk.red(`   ❌ Failed to process query`));
      
      // Check for patterns every few queries
      if (Math.random() > 0.7) {
        const recentPatterns = await this.db.all(`
          SELECT pattern_text, intent, occurrences 
          FROM query_patterns 
          WHERE created_at > datetime('now', '-1 hour')
          ORDER BY occurrences DESC 
          LIMIT 3
        `);
        
        if (recentPatterns.length > 0) {
          console.log(chalk.cyan('   🎯 Recent learning activity:'));
          recentPatterns.forEach(pattern => {
            console.log(chalk.white(`      • ${pattern.intent}: "${pattern.pattern_text}" (${pattern.occurrences}x)`));
          });
        }
      }
      
      console.log(''); // Empty line for readability
    }
  }

  async generateLearningReport() {
    console.log(chalk.blue.bold('\\n📈 Enhanced Learning Report'));
    console.log(chalk.blue('============================'));
    
    const reportData = {
      timestamp: new Date().toISOString(),
      session: this.sessionId,
      metrics: {}
    };
    
    // Get comprehensive metrics
    console.log(chalk.yellow('📊 Gathering learning metrics...'));
    
    // Patterns
    const patterns = await this.db.all(`
      SELECT pattern_type, COUNT(*) as count, AVG(confidence_score) as avg_confidence
      FROM learned_patterns 
      GROUP BY pattern_type
    `);
    reportData.metrics.patterns = patterns;
    
    // Query learning
    const queries = await this.db.all(`
      SELECT intent, COUNT(*) as count, AVG(success_rate) as avg_success
      FROM query_patterns 
      GROUP BY intent
    `);
    reportData.metrics.queries = queries;
    
    // Tool performance
    const tools = await this.db.all(`
      SELECT tool_name, COUNT(*) as executions, AVG(execution_time_ms) as avg_time,
             SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as success_rate
      FROM tool_executions 
      GROUP BY tool_name 
      ORDER BY executions DESC 
      LIMIT 10
    `);
    reportData.metrics.tools = tools;
    
    // Generate report
    console.log(chalk.cyan('\\n📋 Learning Report Summary:'));
    console.log(chalk.white('================================'));
    
    console.log(chalk.cyan('\\n🧠 Pattern Learning:'));
    if (patterns.length > 0) {
      patterns.forEach(pattern => {
        console.log(chalk.white(`   • ${pattern.pattern_type}: ${pattern.count} patterns, ${(pattern.avg_confidence * 100).toFixed(1)}% avg confidence`));
      });
    } else {
      console.log(chalk.gray('   No patterns detected in current session'));
    }
    
    console.log(chalk.cyan('\\n💬 Query Learning:'));
    if (queries.length > 0) {
      queries.forEach(query => {
        console.log(chalk.white(`   • ${query.intent}: ${query.count} queries, ${(query.avg_success * 100).toFixed(1)}% success rate`));
      });
    } else {
      console.log(chalk.gray('   No query patterns learned in current session'));
    }
    
    console.log(chalk.cyan('\\n🔧 Tool Performance:'));
    if (tools.length > 0) {
      tools.slice(0, 5).forEach((tool, index) => {
        console.log(chalk.white(`   ${index + 1}. ${tool.tool_name}: ${tool.executions} runs, ${tool.success_rate.toFixed(1)}% success, ${tool.avg_time?.toFixed(0) || 0}ms avg`));
      });
    } else {
      console.log(chalk.gray('   No tool executions in current session'));
    }
    
    // Learning recommendations
    console.log(chalk.cyan('\\n💡 Learning Recommendations:'));
    console.log(chalk.white('   • Continue using diverse queries to improve pattern recognition'));
    console.log(chalk.white('   • Run workflows repeatedly to detect optimization opportunities'));
    console.log(chalk.white('   • Test error scenarios to build prediction accuracy'));
    console.log(chalk.white('   • Use cross-project learning to share insights'));
    
    console.log(chalk.green('\\n✅ Report generated successfully!'));
  }

  async prompt(question) {
    return new Promise((resolve) => {
      this.rl.question(question, resolve);
    });
  }

  async exit() {
    console.log(chalk.green('\\n👋 Thank you for testing the Enhanced Learning System!'));
    console.log(chalk.yellow('📚 Key features demonstrated:'));
    console.log(chalk.white('   • Query pattern learning and intent recognition'));
    console.log(chalk.white('   • Workflow optimization detection'));
    console.log(chalk.white('   • Error prediction based on historical patterns'));
    console.log(chalk.white('   • Cross-project learning and pattern promotion'));
    console.log(chalk.white('   • Enhanced learning tools and dashboard'));
    
    await this.db.close();
    this.rl.close();
    process.exit(0);
  }
}

// Create and start demo if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const demo = new EnhancedLearningDemo();
  
  process.on('SIGINT', async () => {
    console.log(chalk.yellow('\\n\\n👋 Demo interrupted. Cleaning up...'));
    await demo.db?.close();
    demo.rl?.close();
    process.exit(0);
  });
  
  demo.start().catch(error => {
    console.error(chalk.red('Demo failed:'), error);
    process.exit(1);
  });
}

export { EnhancedLearningDemo };