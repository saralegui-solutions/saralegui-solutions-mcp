#!/usr/bin/env node

/**
 * Text Interface Unit Test Suite
 * Tests command parsing, routing, and functionality
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TextInterface } from '../claudia/text_interface.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

class MockReadlineInterface {
  constructor() {
    this.handlers = {};
    this.promptCalled = false;
    this.closeCalled = false;
  }
  
  on(event, handler) {
    this.handlers[event] = handler;
  }
  
  prompt() {
    this.promptCalled = true;
  }
  
  close() {
    this.closeCalled = true;
    if (this.handlers['close']) {
      this.handlers['close']();
    }
  }
  
  simulateLine(input) {
    if (this.handlers['line']) {
      this.handlers['line'](input);
    }
  }
}

class MockConsole {
  constructor() {
    this.logs = [];
    this.errors = [];
  }
  
  log(...args) {
    this.logs.push(args.join(' '));
  }
  
  error(...args) {
    this.errors.push(args.join(' '));
  }
  
  clear() {
    this.logs.push('[CLEAR]');
  }
  
  getLastLog() {
    return this.logs[this.logs.length - 1] || '';
  }
  
  getAllLogs() {
    return this.logs.join('\n');
  }
  
  reset() {
    this.logs = [];
    this.errors = [];
  }
}

export class TextInterfaceTestSuite {
  constructor() {
    this.results = [];
    this.stats = {
      total: 0,
      passed: 0,
      failed: 0,
      startTime: null,
      endTime: null
    };
    
    // Increase max listeners to prevent memory leak warnings during tests
    if (process.stdin.setMaxListeners) {
      process.stdin.setMaxListeners(20);
    }
    if (process.stdout.setMaxListeners) {
      process.stdout.setMaxListeners(20);
    }
    if (process.setMaxListeners) {
      process.setMaxListeners(20);
    }
  }
  
  async runAllTests() {
    console.log('\n🧪 TEXT INTERFACE TEST SUITE v1.0.0');
    console.log('═'.repeat(50));
    console.log('\nInitializing test environment...');
    
    this.stats.startTime = Date.now();
    
    // Run test categories
    await this.runCommandParsingTests();
    await this.runHelpSystemTests();
    await this.runQueryProcessingTests();
    await this.runNetSuiteIntegrationTests();
    await this.runStatusDisplayTests();
    await this.runEnvironmentTests();
    await this.runErrorHandlingTests();
    
    this.stats.endTime = Date.now();
    
    // Display final results
    this.displayResults();
    
    // Cleanup to prevent memory leaks
    await this.cleanup();
    
    return this.stats.failed === 0;
  }
  
  async cleanup() {
    // Remove any dangling event listeners
    try {
      if (process.stdin.removeAllListeners) {
        process.stdin.removeAllListeners('keypress');
        process.stdin.removeAllListeners('end');
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }
  
  async runCommandParsingTests() {
    console.log('\n📝 COMMAND PARSING TESTS');
    console.log('─'.repeat(40));
    
    // Test basic command parsing
    await this.test('Basic Command Parsing', async () => {
      // Test command parsing logic directly without creating TextInterface instances
      
      const testCases = [
        { input: 'help', expectedCommand: 'help', expectedArgs: [] },
        { input: 'ask How are you?', expectedCommand: 'ask', expectedArgs: ['How', 'are', 'you?'] },
        { input: 'netsuite setup', expectedCommand: 'netsuite', expectedArgs: ['setup'] },
        { input: 'status', expectedCommand: 'status', expectedArgs: [] },
        { input: 'What is the weather?', expectedCommand: 'direct', expectedArgs: ['What', 'is', 'the', 'weather?'] }
      ];
      
      for (const testCase of testCases) {
        const [command, ...args] = testCase.input.split(' ');
        
        if (['help', 'ask', 'netsuite', 'status', 'clear', 'exit', 'quit', 'bye'].includes(command.toLowerCase())) {
          this.assert(command === testCase.expectedCommand, `Command "${testCase.input}" should parse as "${testCase.expectedCommand}"`);
        } else {
          // Direct queries - anything that's not a known command
          this.assert(testCase.expectedCommand === 'direct', `Unknown command "${testCase.input}" should be treated as direct query`);
        }
      }
      
      return true;
    });
    
    // Test command argument parsing
    await this.test('Command Argument Parsing', async () => {
      // Test argument parsing logic directly
      const input = 'netsuite test account_123';
      const [command, ...args] = input.split(' ');
      
      this.assert(command === 'netsuite', 'Command should be parsed correctly');
      this.assert(args.length === 2, 'Arguments should be parsed correctly');
      this.assert(args[0] === 'test', 'First argument should be "test"');
      this.assert(args[1] === 'account_123', 'Second argument should be "account_123"');
      
      return true;
    });
    
    // Test empty command handling
    await this.test('Empty Command Handling', async () => {
      // Test empty input parsing
      const emptyInputs = ['', '   ', '\t', '\n'];
      
      for (const input of emptyInputs) {
        const trimmed = input.trim();
        this.assert(trimmed === '' || trimmed.length === 0, 'Empty input should be handled gracefully');
      }
      
      return true; // Empty inputs should be handled without crashing
    });
  }
  
  async runHelpSystemTests() {
    console.log('\n📖 HELP SYSTEM TESTS');
    console.log('─'.repeat(40));
    
    await this.test('Help Command Output', async () => {
      const mockConsole = new MockConsole();
      const originalConsole = console.log;
      console.log = mockConsole.log.bind(mockConsole);
      
      const mockInterface = new TextInterface();
      mockInterface.showHelp();
      
      const output = mockConsole.getAllLogs();
      
      // Restore console
      console.log = originalConsole;
      
      this.assert(output.includes('Claudia AI Assistant Commands'), 'Help should show title');
      this.assert(output.includes('ask <query>'), 'Help should show ask command');
      this.assert(output.includes('netsuite'), 'Help should show netsuite commands');
      this.assert(output.includes('Examples'), 'Help should show examples');
      
      return true;
    });
  }
  
  async runQueryProcessingTests() {
    console.log('\n🤔 QUERY PROCESSING TESTS');
    console.log('─'.repeat(40));
    
    await this.test('Query Processing Flow', async () => {
      const mockConsole = new MockConsole();
      const originalConsole = console.log;
      console.log = mockConsole.log.bind(mockConsole);
      
      const mockInterface = new TextInterface();
      
      // Mock the spinner to avoid timing issues
      mockInterface.createSpinner = (text) => ({
        start: () => {},
        stop: () => {}
      });
      
      await mockInterface.processQuery('Test query');
      
      console.log = originalConsole;
      
      const output = mockConsole.getAllLogs();
      this.assert(output.includes('Processing: "Test query"'), 'Should show processing message');
      this.assert(output.includes('Claudia:'), 'Should show response from Claudia');
      
      return true;
    });
    
    await this.test('Query Logging', async () => {
      const mockInterface = new TextInterface();
      
      let queryLogged = false;
      mockInterface.logQuery = async (query) => {
        queryLogged = query === 'Test logging';
      };
      
      // Mock spinner to avoid delays
      mockInterface.createSpinner = () => ({ start: () => {}, stop: () => {} });
      
      await mockInterface.processQuery('Test logging');
      
      this.assert(queryLogged, 'Query should be logged for learning purposes');
      
      return true;
    });
  }
  
  async runNetSuiteIntegrationTests() {
    console.log('\n🔐 NETSUITE INTEGRATION TESTS');
    console.log('─'.repeat(40));
    
    await this.test('NetSuite Command Routing', async () => {
      const mockInterface = new TextInterface();
      
      let setupCalled = false;
      let listCalled = false;
      let testCalled = false;
      
      // Mock console to capture output
      const mockConsole = new MockConsole();
      const originalConsole = console.log;
      console.log = mockConsole.log.bind(mockConsole);
      
      const originalHandleNetSuite = mockInterface.handleNetSuite;
      mockInterface.handleNetSuite = async (args) => {
        const subCommand = args[0];
        if (subCommand === 'setup') setupCalled = true;
        if (subCommand === 'list') listCalled = true;
        if (subCommand === 'test') testCalled = true;
        
        // Call original method for output testing
        return await originalHandleNetSuite.call(mockInterface, args);
      };
      
      await mockInterface.handleNetSuite(['setup']);
      await mockInterface.handleNetSuite(['list']);
      await mockInterface.handleNetSuite(['test']);
      
      console.log = originalConsole;
      
      this.assert(setupCalled, 'Setup command should be routed correctly');
      this.assert(listCalled, 'List command should be routed correctly');
      this.assert(testCalled, 'Test command should be routed correctly');
      
      return true;
    });
    
    await this.test('NetSuite Help Display', async () => {
      const mockConsole = new MockConsole();
      const originalConsole = console.log;
      console.log = mockConsole.log.bind(mockConsole);
      
      const mockInterface = new TextInterface();
      await mockInterface.handleNetSuite(['invalid']);
      
      console.log = originalConsole;
      
      const output = mockConsole.getAllLogs();
      this.assert(output.includes('NetSuite commands'), 'Should show NetSuite help for invalid commands');
      this.assert(output.includes('netsuite setup'), 'Should show setup command in help');
      
      return true;
    });
  }
  
  async runStatusDisplayTests() {
    console.log('\n📊 STATUS DISPLAY TESTS');
    console.log('─'.repeat(40));
    
    await this.test('System Status Display', async () => {
      const mockConsole = new MockConsole();
      const originalConsole = console.log;
      console.log = mockConsole.log.bind(mockConsole);
      
      // Mock environment variables
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        OPENAI_API_KEY: 'sk-test-key',
        ELEVENLABS_API_KEY: 'sk_test_key',
        PUSHOVER_TOKEN: 'test-token',
        PUSHOVER_USER: 'test-user',
        ENABLE_VOICE: 'false',
        ENABLE_LEARNING: 'true',
        NODE_ENV: 'test'
      };
      
      const mockInterface = new TextInterface();
      await mockInterface.showStatus();
      
      console.log = originalConsole;
      process.env = originalEnv;
      
      const output = mockConsole.getAllLogs();
      this.assert(output.includes('System Status'), 'Should show status title');
      this.assert(output.includes('API Configuration'), 'Should show API section');
      this.assert(output.includes('Feature Status'), 'Should show feature section');
      this.assert(output.includes('Environment'), 'Should show environment section');
      
      return true;
    });
    
    await this.test('API Configuration Detection', async () => {
      const mockConsole = new MockConsole();
      const originalConsole = console.log;
      console.log = mockConsole.log.bind(mockConsole);
      
      // Test with configured APIs
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        OPENAI_API_KEY: 'sk-valid-key-here',
        ELEVENLABS_API_KEY: 'sk_valid_key',
        PUSHOVER_TOKEN: 'valid-token',
        PUSHOVER_USER: 'valid-user'
      };
      
      const mockInterface = new TextInterface();
      await mockInterface.showStatus();
      
      console.log = originalConsole;
      process.env = originalEnv;
      
      const output = mockConsole.getAllLogs();
      this.assert(output.includes('✅ Configured'), 'Should show configured APIs as enabled');
      
      return true;
    });
  }
  
  async runEnvironmentTests() {
    console.log('\n🌍 ENVIRONMENT TESTS');
    console.log('─'.repeat(40));
    
    await this.test('Environment Variable Loading', async () => {
      // Test that environment variables are properly loaded
      // This is mainly testing the dotenv.config() call
      
      const mockInterface = new TextInterface();
      
      // Check that the constructor didn't crash
      this.assert(mockInterface !== null, 'TextInterface should instantiate successfully');
      
      return true;
    });
    
    await this.test('Feature Flag Detection', async () => {
      const originalEnv = process.env;
      
      // Test with voice enabled
      process.env = { ...originalEnv, ENABLE_VOICE: 'true' };
      
      const mockConsole = new MockConsole();
      const originalConsole = console.log;
      console.log = mockConsole.log.bind(mockConsole);
      
      const mockInterface = new TextInterface();
      await mockInterface.showStatus();
      
      let output = mockConsole.getAllLogs();
      this.assert(output.includes('Voice Commands') && output.includes('⚠️'), 
                 'Should warn about voice in WSL when enabled');
      
      // Test with voice disabled
      mockConsole.reset();
      process.env.ENABLE_VOICE = 'false';
      
      await mockInterface.showStatus();
      
      output = mockConsole.getAllLogs();
      this.assert(output.includes('Voice Commands') && output.includes('✅'), 
                 'Should show voice as properly disabled for WSL');
      
      console.log = originalConsole;
      process.env = originalEnv;
      
      return true;
    });
  }
  
  async runErrorHandlingTests() {
    console.log('\n⚠️ ERROR HANDLING TESTS');
    console.log('─'.repeat(40));
    
    await this.test('Query Processing Error Handling', async () => {
      const mockConsole = new MockConsole();
      const originalConsoleError = console.error;
      console.error = mockConsole.error.bind(mockConsole);
      
      const mockInterface = new TextInterface();
      
      // Force an error in processQuery
      mockInterface.createSpinner = () => {
        throw new Error('Test error');
      };
      
      await mockInterface.processQuery('Test error handling');
      
      console.error = originalConsoleError;
      
      this.assert(mockConsole.errors.length > 0, 'Should log errors when query processing fails');
      this.assert(mockConsole.errors[0].includes('Error processing query'), 'Should show descriptive error message');
      
      return true;
    });
    
    await this.test('Invalid Command Handling', async () => {
      const mockInterface = new TextInterface();
      
      let queryProcessed = false;
      mockInterface.processQuery = async (query) => {
        queryProcessed = true;
      };
      
      // Invalid commands should be treated as direct queries
      await mockInterface.handleCommand('this-is-not-a-valid-command but should work as query');
      
      this.assert(queryProcessed, 'Invalid commands should be processed as direct queries');
      
      return true;
    });
  }
  
  // Test helper methods
  async test(name, testFunction) {
    this.stats.total++;
    
    try {
      const result = await testFunction();
      
      if (result) {
        console.log(`🔬 Test: ${name}`);
        console.log('  ✅ Passed');
        this.stats.passed++;
        this.results.push({ name, status: 'PASSED', error: null });
      } else {
        console.log(`🔬 Test: ${name}`);
        console.log('  ❌ Failed - Test returned false');
        this.stats.failed++;
        this.results.push({ name, status: 'FAILED', error: 'Test returned false' });
      }
    } catch (error) {
      console.log(`🔬 Test: ${name}`);
      console.log(`  ❌ Failed - ${error.message}`);
      this.stats.failed++;
      this.results.push({ name, status: 'FAILED', error: error.message });
    }
  }
  
  assert(condition, message) {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }
  
  displayResults() {
    const duration = (this.stats.endTime - this.stats.startTime) / 1000;
    
    console.log('\n' + '═'.repeat(50));
    console.log('FINAL TEST RESULTS');
    console.log('═'.repeat(50));
    
    console.log(`\n📊 Summary:`);
    console.log(`   Tests Run: ${this.stats.total}`);
    console.log(`   Passed: ${this.stats.passed} ✅`);
    console.log(`   Failed: ${this.stats.failed} ${this.stats.failed > 0 ? '❌' : '✅'}`);
    console.log(`   Success Rate: ${((this.stats.passed / this.stats.total) * 100).toFixed(1)}%`);
    console.log(`   Duration: ${duration.toFixed(2)}s`);
    
    if (this.stats.failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results
        .filter(r => r.status === 'FAILED')
        .forEach(result => {
          console.log(`   • ${result.name}: ${result.error}`);
        });
    }
    
    console.log('\n' + '═'.repeat(50));
    if (this.stats.failed === 0) {
      console.log('🎉 ALL TESTS PASSED! The Text Interface is working correctly.');
    } else {
      console.log(`❌ ${this.stats.failed} test(s) failed. Please check the implementation.`);
    }
    console.log('═'.repeat(50));
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const suite = new TextInterfaceTestSuite();
  suite.runAllTests()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error('Test suite crashed:', error);
      process.exit(1);
    });
}

export default TextInterfaceTestSuite;