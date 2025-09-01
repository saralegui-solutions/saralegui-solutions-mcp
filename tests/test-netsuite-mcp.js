#!/usr/bin/env node

/**
 * NetSuite MCP Server Test Suite
 * Comprehensive unit and integration tests for NetSuite MCP functionality
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const execAsync = promisify(exec);

class NetSuiteMCPTester {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.serverPath = path.join(this.projectRoot, 'mcp-netsuite-server.js');
    this.startupScriptPath = path.join(this.projectRoot, 'start-netsuite-mcp.sh');
    this.testTimeout = 30000; // 30 seconds
    this.testsPassed = 0;
    this.testsFailed = 0;
    this.testResults = [];
  }

  log(message, type = 'info') {
    const colors = {
      info: '\x1b[36m',    // cyan
      success: '\x1b[32m', // green
      error: '\x1b[31m',   // red
      warning: '\x1b[33m', // yellow
      reset: '\x1b[0m'
    };
    
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
    console.log(`${colors[type]}[${timestamp}] ${message}${colors.reset}`);
  }

  async test(name, testFn, category = 'unit') {
    const startTime = Date.now();
    
    try {
      await Promise.race([
        testFn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Test timeout after ${this.testTimeout}ms`)), this.testTimeout)
        )
      ]);
      
      const duration = Date.now() - startTime;
      this.log(`✓ ${name} (${duration}ms)`, 'success');
      this.testsPassed++;
      this.testResults.push({ name, status: 'passed', duration, category });
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log(`✗ ${name} (${duration}ms): ${error.message}`, 'error');
      this.testsFailed++;
      this.testResults.push({ name, status: 'failed', duration, category, error: error.message });
    }
  }

  async runMCPCommand(command, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const child = spawn('node', [this.serverPath], {
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'test' }
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Command timeout after ${timeout}ms`));
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      // Send the command to the server
      child.stdin.write(JSON.stringify(command) + '\n');
      child.stdin.end();
    });
  }

  async runTests() {
    this.log('🧪 Starting NetSuite MCP Server Test Suite\n', 'info');

    // Unit Tests - Server Initialization
    await this.test('Server file exists and is readable', async () => {
      await fs.access(this.serverPath, fs.constants.R_OK);
    }, 'unit');

    await this.test('Server file has correct imports', async () => {
      const content = await fs.readFile(this.serverPath, 'utf-8');
      if (!content.includes('@modelcontextprotocol/sdk')) {
        throw new Error('Missing MCP SDK import');
      }
      if (!content.includes('NetSuiteSandboxManager')) {
        throw new Error('Missing NetSuiteSandboxManager import');
      }
    }, 'unit');

    await this.test('Startup script exists and is executable', async () => {
      const stats = await fs.stat(this.startupScriptPath);
      if (!(stats.mode & parseInt('111', 8))) {
        throw new Error('Startup script is not executable');
      }
    }, 'unit');

    // Unit Tests - Tool Discovery
    await this.test('Server can list available tools', async () => {
      const command = {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1
      };

      const result = await this.runMCPCommand(command);
      
      if (result.code !== 0) {
        throw new Error(`Server failed to start: ${result.stderr}`);
      }

      // Parse the JSON response from stdout
      const lines = result.stdout.trim().split('\n');
      const jsonLine = lines.find(line => line.trim().startsWith('{'));
      
      if (!jsonLine) {
        throw new Error('No JSON response found in output');
      }

      const response = JSON.parse(jsonLine);
      
      if (!response.result || !response.result.tools) {
        throw new Error('Invalid tools list response format');
      }

      const tools = response.result.tools;
      const expectedTools = [
        'netsuite_setup',
        'netsuite_list', 
        'netsuite_test',
        'netsuite_query',
        'netsuite_deploy',
        'client_discover'
      ];

      for (const expectedTool of expectedTools) {
        const tool = tools.find(t => t.name === expectedTool);
        if (!tool) {
          throw new Error(`Missing expected tool: ${expectedTool}`);
        }
        if (!tool.description) {
          throw new Error(`Tool ${expectedTool} missing description`);
        }
        if (!tool.inputSchema) {
          throw new Error(`Tool ${expectedTool} missing input schema`);
        }
      }
    }, 'unit');

    // Unit Tests - Input Validation
    await this.test('netsuite_setup validates required fields', async () => {
      const command = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'netsuite_setup',
          arguments: {
            account_id: 'TEST123'
            // Missing required fields
          }
        },
        id: 2
      };

      const result = await this.runMCPCommand(command);
      
      // Should fail due to missing required fields
      if (result.code === 0) {
        throw new Error('Expected validation error for missing required fields');
      }
    }, 'unit');

    await this.test('netsuite_query validates query parameter', async () => {
      const command = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'netsuite_query',
          arguments: {
            // Missing required query parameter
          }
        },
        id: 3
      };

      const result = await this.runMCPCommand(command);
      
      // Should fail due to missing query
      if (result.code === 0) {
        throw new Error('Expected validation error for missing query parameter');
      }
    }, 'unit');

    // Unit Tests - Security Validation
    await this.test('Dangerous SQL queries are blocked', async () => {
      const command = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'netsuite_query',
          arguments: {
            query: 'DELETE FROM customers WHERE id = 1',
            client_name: 'test'
          }
        },
        id: 4
      };

      const result = await this.runMCPCommand(command);
      
      // Should fail due to dangerous query
      if (result.code === 0) {
        const lines = result.stdout.trim().split('\n');
        const jsonLine = lines.find(line => line.trim().startsWith('{'));
        const response = JSON.parse(jsonLine);
        
        if (!response.error || !response.error.message.includes('dangerous')) {
          throw new Error('Expected security validation error for dangerous query');
        }
      }
    }, 'unit');

    // Integration Tests - Startup Script
    await this.test('Startup script health check works', async () => {
      const { stdout, stderr } = await execAsync(`${this.startupScriptPath} health`);
      
      // Health check should complete without critical errors
      if (stderr.includes('❌') && !stderr.includes('Database file not found')) {
        throw new Error(`Health check failed: ${stderr}`);
      }
    }, 'integration');

    await this.test('Startup script status command works', async () => {
      const { stdout, stderr } = await execAsync(`${this.startupScriptPath} status`);
      
      // Status command should complete (server not running is expected)
      if (!stderr.includes('Server is not running') && !stderr.includes('Server is running')) {
        throw new Error('Status command did not return expected message');
      }
    }, 'integration');

    // Integration Tests - Tool Execution (Mock Mode)
    await this.test('netsuite_list returns valid response format', async () => {
      const command = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'netsuite_list',
          arguments: {}
        },
        id: 5
      };

      const result = await this.runMCPCommand(command);
      
      if (result.code !== 0) {
        throw new Error(`Tool execution failed: ${result.stderr}`);
      }

      const lines = result.stdout.trim().split('\n');
      const jsonLine = lines.find(line => line.trim().startsWith('{'));
      const response = JSON.parse(jsonLine);
      
      if (!response.result || !response.result.contents) {
        throw new Error('Invalid response format');
      }

      const content = JSON.parse(response.result.contents[0].text);
      
      if (!content.hasOwnProperty('accounts') || !content.hasOwnProperty('total_accounts')) {
        throw new Error('Response missing required fields');
      }
    }, 'integration');

    await this.test('client_discover dry run works', async () => {
      const command = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'client_discover',
          arguments: {
            dry_run: true,
            base_path: '/home/ben/saralegui-solutions-llc'
          }
        },
        id: 6
      };

      const result = await this.runMCPCommand(command, 10000); // Longer timeout for discovery
      
      if (result.code !== 0) {
        throw new Error(`Client discovery failed: ${result.stderr}`);
      }

      const lines = result.stdout.trim().split('\n');
      const jsonLine = lines.find(line => line.trim().startsWith('{'));
      const response = JSON.parse(jsonLine);
      
      if (!response.result || !response.result.contents) {
        throw new Error('Invalid response format');
      }

      const content = JSON.parse(response.result.contents[0].text);
      
      if (!content.hasOwnProperty('dry_run') || content.dry_run !== true) {
        throw new Error('Dry run flag not properly handled');
      }
    }, 'integration');

    // Performance Tests
    await this.test('Server starts within reasonable time', async () => {
      const startTime = Date.now();
      
      const command = {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 7
      };

      await this.runMCPCommand(command, 3000); // 3 second timeout
      
      const duration = Date.now() - startTime;
      if (duration > 2000) {
        throw new Error(`Server startup took too long: ${duration}ms`);
      }
    }, 'performance');

    await this.test('Tool execution completes quickly', async () => {
      const startTime = Date.now();
      
      const command = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'netsuite_list',
          arguments: {}
        },
        id: 8
      };

      await this.runMCPCommand(command, 2000); // 2 second timeout
      
      const duration = Date.now() - startTime;
      if (duration > 1500) {
        throw new Error(`Tool execution took too long: ${duration}ms`);
      }
    }, 'performance');

    // Error Handling Tests
    await this.test('Invalid tool name returns proper error', async () => {
      const command = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'invalid_tool',
          arguments: {}
        },
        id: 9
      };

      const result = await this.runMCPCommand(command);
      
      if (result.code === 0) {
        const lines = result.stdout.trim().split('\n');
        const jsonLine = lines.find(line => line.trim().startsWith('{'));
        const response = JSON.parse(jsonLine);
        
        if (!response.error || !response.error.message.includes('Unknown tool')) {
          throw new Error('Expected error for invalid tool name');
        }
      }
    }, 'unit');

    await this.test('Malformed JSON request is handled gracefully', async () => {
      return new Promise((resolve, reject) => {
        const child = spawn('node', [this.serverPath], {
          stdio: 'pipe',
          env: { ...process.env, NODE_ENV: 'test' }
        });

        let responseReceived = false;

        child.stdout.on('data', (data) => {
          responseReceived = true;
          child.kill('SIGTERM');
          resolve();
        });

        child.stderr.on('data', (data) => {
          const output = data.toString();
          if (output.includes('❌') || output.includes('error')) {
            responseReceived = true;
            child.kill('SIGTERM');
            resolve(); // Server properly handled the error
          }
        });

        setTimeout(() => {
          if (!responseReceived) {
            child.kill('SIGKILL');
            reject(new Error('Server did not handle malformed JSON within timeout'));
          }
        }, 3000);

        // Send malformed JSON
        child.stdin.write('{ invalid json\n');
        child.stdin.end();
      });
    }, 'unit');

    // Generate test report
    this.generateTestReport();
  }

  generateTestReport() {
    this.log('\n📊 Test Results Summary', 'info');
    this.log('═'.repeat(50), 'info');
    
    const categories = [...new Set(this.testResults.map(r => r.category))];
    
    categories.forEach(category => {
      const categoryTests = this.testResults.filter(r => r.category === category);
      const passed = categoryTests.filter(r => r.status === 'passed').length;
      const failed = categoryTests.filter(r => r.status === 'failed').length;
      
      this.log(`${category.toUpperCase()}: ${passed} passed, ${failed} failed`, 
                failed > 0 ? 'warning' : 'success');
    });
    
    this.log(`\nOVERALL: ${this.testsPassed} passed, ${this.testsFailed} failed`, 
              this.testsFailed === 0 ? 'success' : 'error');
    
    if (this.testsFailed === 0) {
      this.log('\n🎉 All tests passed! NetSuite MCP Server is ready for deployment.', 'success');
    } else {
      this.log('\n⚠️  Some tests failed. Please review and fix issues before deployment.', 'warning');
      
      // Show failed tests
      const failedTests = this.testResults.filter(r => r.status === 'failed');
      if (failedTests.length > 0) {
        this.log('\nFailed Tests:', 'error');
        failedTests.forEach(test => {
          this.log(`  • ${test.name}: ${test.error}`, 'error');
        });
      }
    }
    
    // Performance summary
    const avgDuration = this.testResults.reduce((sum, r) => sum + r.duration, 0) / this.testResults.length;
    this.log(`\nAverage test duration: ${Math.round(avgDuration)}ms`, 'info');
    
    return this.testsFailed === 0;
  }
}

// Main execution
async function main() {
  const tester = new NetSuiteMCPTester();
  
  try {
    const success = await tester.runTests();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('❌ Test runner failed:', error.message);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (process.argv[1] === __filename) {
  main();
}

export default NetSuiteMCPTester;