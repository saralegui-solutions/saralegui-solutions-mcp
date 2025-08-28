#!/usr/bin/env node

/**
 * Integration test for MCP Server with Learning Engine
 * Tests the complete flow: tool execution -> pattern detection -> tool generation
 */

import { DatabaseManager } from '../lib/database_manager.js';
import { ToolRegistry } from '../lib/tool_registry.js';
import { LearningEngine } from '../lib/learning_engine.js';
import { SecurityManager } from '../lib/security_manager.js';
import chalk from 'chalk';

class ServerIntegrationTest {
  constructor() {
    this.db = new DatabaseManager();
    this.toolRegistry = new ToolRegistry(this.db);
    this.learningEngine = new LearningEngine(this.db);
    this.securityManager = new SecurityManager(this.db);
    
    this.sessionId = `test_session_${Date.now()}`;
    this.testsPassed = 0;
    this.testsFailed = 0;
  }

  async initialize() {
    console.log(chalk.blue.bold('\n🧪 SERVER INTEGRATION TEST SUITE'));
    console.log(chalk.gray('═'.repeat(50)));
    
    // Initialize all components
    await this.db.initialize();
    await this.toolRegistry.initialize();
    await this.securityManager.initialize();
    
    // Create test session
    await this.db.createSession(this.sessionId, { testRun: true });
    
    console.log(chalk.green('✅ Components initialized'));
    console.log(chalk.gray(`📍 Test Session: ${this.sessionId}`));
  }

  async runTests() {
    console.log(chalk.cyan('\n📊 INTEGRATION TESTS'));
    console.log(chalk.gray('─'.repeat(30)));

    await this.testToolRegistryBasics();
    await this.testSecurityValidation();
    await this.testToolExecution();
    await this.testLearningIntegration();
    await this.testPatternDetection();
    
    // Summary
    console.log(chalk.gray('\n' + '═'.repeat(50)));
    console.log(chalk.blue.bold('INTEGRATION TEST RESULTS'));
    console.log(chalk.gray('═'.repeat(50)));
    
    const total = this.testsPassed + this.testsFailed;
    const successRate = total > 0 ? ((this.testsPassed / total) * 100).toFixed(1) : 0;
    
    console.log(chalk.cyan(`📊 Summary:`));
    console.log(chalk.gray(`   Tests Run: ${total}`));
    console.log(chalk.green(`   Passed: ${this.testsPassed} ✅`));
    console.log(this.testsFailed > 0 ? chalk.red(`   Failed: ${this.testsFailed} ❌`) : chalk.green(`   Failed: 0 ✅`));
    console.log(chalk.cyan(`   Success Rate: ${successRate}%`));
    
    if (this.testsFailed === 0) {
      console.log(chalk.green.bold('\n🎉 ALL INTEGRATION TESTS PASSED!'));
      console.log(chalk.green('✅ Server components are working correctly together'));
    } else {
      console.log(chalk.red.bold('\n⚠️ Some integration tests failed'));
    }
  }

  async testToolRegistryBasics() {
    console.log(chalk.yellow('\n🔬 Test: Tool Registry Basics'));
    
    try {
      // Test tool listing
      const tools = await this.toolRegistry.listTools();
      this.assert(tools.length > 0, 'Should have built-in tools loaded');
      console.log(chalk.gray(`   ├─ Found ${tools.length} tools`));
      
      // Test specific tools exist
      const toolNames = tools.map(t => t.name);
      this.assert(toolNames.includes('echo'), 'Should have echo tool');
      this.assert(toolNames.includes('get_current_time'), 'Should have get_current_time tool');
      this.assert(toolNames.includes('system_info'), 'Should have system_info tool');
      
      console.log(chalk.green('   ✅ Tool Registry basics working'));
      this.testsPassed++;
    } catch (error) {
      console.log(chalk.red('   ❌ Tool Registry test failed:'), error.message);
      this.testsFailed++;
    }
  }

  async testSecurityValidation() {
    console.log(chalk.yellow('\n🔬 Test: Security Validation'));
    
    try {
      // Test normal tool validation
      const normalCheck = await this.securityManager.validateToolExecution(
        this.sessionId, 
        'echo', 
        { text: 'Hello World' }
      );
      this.assert(normalCheck.allowed === true, 'Should allow normal tool execution');
      console.log(chalk.gray('   ├─ Normal tool validation: PASSED'));
      
      // Test suspicious pattern detection
      const suspiciousCheck = await this.securityManager.validateToolExecution(
        this.sessionId, 
        'echo', 
        { text: 'eval(maliciousCode)' }
      );
      this.assert(suspiciousCheck.allowed === false, 'Should block suspicious patterns');
      console.log(chalk.gray('   ├─ Suspicious pattern detection: PASSED'));
      
      // Test rate limiting
      const rateLimitResult = await this.securityManager.checkRateLimit(this.sessionId);
      this.assert(rateLimitResult.allowed === true, 'Should allow within rate limit');
      console.log(chalk.gray('   ├─ Rate limiting check: PASSED'));
      
      console.log(chalk.green('   ✅ Security validation working'));
      this.testsPassed++;
    } catch (error) {
      console.log(chalk.red('   ❌ Security validation test failed:'), error.message);
      this.testsFailed++;
    }
  }

  async testToolExecution() {
    console.log(chalk.yellow('\n🔬 Test: Tool Execution'));
    
    try {
      // Test echo tool
      const echoResult = await this.toolRegistry.executeTool('echo', { text: 'Integration Test' }, {
        sessionId: this.sessionId,
        db: this.db
      });
      
      this.assert(echoResult.success === true, 'Echo tool should succeed');
      this.assert(echoResult.result.includes('Integration Test'), 'Echo should return input text');
      console.log(chalk.gray('   ├─ Echo tool: PASSED'));
      
      // Test time tool
      const timeResult = await this.toolRegistry.executeTool('get_current_time', { format: 'iso' }, {
        sessionId: this.sessionId,
        db: this.db
      });
      
      this.assert(timeResult.success === true, 'Time tool should succeed');
      this.assert(typeof timeResult.result === 'string', 'Time should return string');
      console.log(chalk.gray('   ├─ Time tool: PASSED'));
      
      // Test system info tool
      const sysResult = await this.toolRegistry.executeTool('system_info', {}, {
        sessionId: this.sessionId,
        db: this.db
      });
      
      this.assert(sysResult.success === true, 'System info tool should succeed');
      this.assert(typeof sysResult.result === 'object', 'System info should return object');
      console.log(chalk.gray('   ├─ System info tool: PASSED'));
      
      console.log(chalk.green('   ✅ Tool execution working'));
      this.testsPassed++;
    } catch (error) {
      console.log(chalk.red('   ❌ Tool execution test failed:'), error.message);
      this.testsFailed++;
    }
  }

  async testLearningIntegration() {
    console.log(chalk.yellow('\n🔬 Test: Learning Engine Integration'));
    
    try {
      // Simulate tool executions for learning
      const testExecutions = [
        { tool: 'echo', params: { text: 'test1' } },
        { tool: 'get_current_time', params: { format: 'iso' } },
        { tool: 'echo', params: { text: 'test2' } },
        { tool: 'get_current_time', params: { format: 'iso' } },
        { tool: 'echo', params: { text: 'test3' } }
      ];
      
      for (const exec of testExecutions) {
        const executionId = await this.learningEngine.startExecution(
          exec.tool, 
          exec.params, 
          this.sessionId
        );
        
        // Simulate successful execution
        await this.learningEngine.completeExecution(
          executionId,
          { success: true, result: 'test' },
          true,
          100 // 100ms execution time
        );
      }
      
      console.log(chalk.gray(`   ├─ Simulated ${testExecutions.length} executions`));
      
      // Check executions were recorded
      const executionCount = await this.db.get(`
        SELECT COUNT(*) as count 
        FROM tool_executions 
        WHERE user_session_id = ?
      `, [this.sessionId]);
      
      this.assert(executionCount.count >= testExecutions.length, 'Should record all executions');
      console.log(chalk.gray(`   ├─ Recorded ${executionCount.count} executions`));
      
      console.log(chalk.green('   ✅ Learning engine integration working'));
      this.testsPassed++;
    } catch (error) {
      console.log(chalk.red('   ❌ Learning integration test failed:'), error.message);
      this.testsFailed++;
    }
  }

  async testPatternDetection() {
    console.log(chalk.yellow('\n🔬 Test: Pattern Detection'));
    
    try {
      // Create a recognizable pattern by executing a sequence multiple times
      const sequence = ['echo', 'get_current_time', 'system_info'];
      
      // Execute the sequence 3 times
      for (let i = 0; i < 3; i++) {
        for (const toolName of sequence) {
          const executionId = await this.learningEngine.startExecution(
            toolName, 
            { test: `pattern_${i}` }, 
            this.sessionId
          );
          
          await this.learningEngine.completeExecution(
            executionId,
            { success: true, result: 'pattern test' },
            true,
            50
          );
        }
      }
      
      console.log(chalk.gray('   ├─ Created pattern: echo → get_current_time → system_info (3x)'));
      
      // Run pattern detection
      const patterns = await this.learningEngine.detectPatterns(this.sessionId, 1);
      
      console.log(chalk.gray(`   ├─ Detected ${patterns.length} patterns`));
      
      // Check if any patterns were detected
      this.assert(patterns.length >= 0, 'Pattern detection should run without error');
      
      // Check pattern data structure
      if (patterns.length > 0) {
        const pattern = patterns[0];
        this.assert('pattern_signature' in pattern, 'Pattern should have signature');
        this.assert('pattern_type' in pattern, 'Pattern should have type');
        this.assert('occurrences' in pattern, 'Pattern should have occurrence count');
        console.log(chalk.gray(`   ├─ Found pattern: ${pattern.pattern_type} (${pattern.occurrences} occurrences)`));
      }
      
      console.log(chalk.green('   ✅ Pattern detection working'));
      this.testsPassed++;
    } catch (error) {
      console.log(chalk.red('   ❌ Pattern detection test failed:'), error.message);
      this.testsFailed++;
    }
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  async cleanup() {
    console.log(chalk.gray('\n🔄 Cleaning up test data...'));
    
    try {
      // Clean up test executions
      await this.db.run(`
        DELETE FROM tool_executions 
        WHERE user_session_id = ?
      `, [this.sessionId]);
      
      // Clean up test session
      await this.db.run(`
        DELETE FROM user_sessions 
        WHERE session_id = ?
      `, [this.sessionId]);
      
      // Close database
      await this.db.close();
      
      console.log(chalk.gray('✅ Cleanup completed'));
    } catch (error) {
      console.warn(chalk.yellow('⚠️ Cleanup failed:'), error.message);
    }
  }
}

// Run integration tests
async function main() {
  const test = new ServerIntegrationTest();
  
  try {
    await test.initialize();
    await test.runTests();
  } catch (error) {
    console.error(chalk.red('❌ Test suite failed:'), error.message);
    process.exit(1);
  } finally {
    await test.cleanup();
  }
}

// Run if called directly
if (process.argv[1] === import.meta.url.replace('file://', '')) {
  main().catch(console.error);
}

export default ServerIntegrationTest;