#!/usr/bin/env node

/**
 * Environment Configuration Test Suite
 * Tests .env.local loading, API key validation, and feature flags
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class EnvironmentTestSuite {
  constructor() {
    this.results = [];
    this.stats = {
      total: 0,
      passed: 0,
      failed: 0,
      startTime: null,
      endTime: null
    };
    this.originalEnv = { ...process.env };
  }
  
  async runAllTests() {
    console.log('\n🌍 ENVIRONMENT CONFIGURATION TEST SUITE v1.0.0');
    console.log('═'.repeat(50));
    console.log('\nInitializing test environment...');
    
    this.stats.startTime = Date.now();
    
    // Run test categories
    await this.runEnvFileTests();
    await this.runApiKeyValidationTests();
    await this.runFeatureFlagTests();
    await this.runPushoverConfigTests();
    await this.runPathConfigTests();
    await this.runSecurityConfigTests();
    
    this.stats.endTime = Date.now();
    
    // Restore original environment
    process.env = { ...this.originalEnv };
    
    // Display final results
    this.displayResults();
    
    return this.stats.failed === 0;
  }
  
  async runEnvFileTests() {
    console.log('\n📄 ENVIRONMENT FILE TESTS');
    console.log('─'.repeat(40));
    
    await this.test('Environment File Exists', async () => {
      const envPath = join(__dirname, '..', '.env.local');
      
      try {
        const stats = await fs.stat(envPath);
        this.assert(stats.isFile(), '.env.local should exist and be a file');
        return true;
      } catch (error) {
        throw new Error('.env.local file not found');
      }
    });
    
    await this.test('Environment File Loading', async () => {
      const envPath = join(__dirname, '..', '.env.local');
      
      // Load environment variables
      const result = dotenv.config({ path: envPath });
      
      this.assert(!result.error, `Environment should load without errors: ${result.error?.message || ''}`);
      this.assert(result.parsed, 'Environment should parse successfully');
      
      return true;
    });
    
    await this.test('Required Environment Variables Present', async () => {
      const envPath = join(__dirname, '..', '.env.local');
      const envConfig = dotenv.config({ path: envPath });
      
      const requiredVars = [
        'OPENAI_API_KEY',
        'ELEVENLABS_API_KEY', 
        'PUSHOVER_TOKEN',
        'PUSHOVER_USER',
        'NODE_ENV',
        'ENCRYPTION_KEY'
      ];
      
      const missing = [];
      for (const varName of requiredVars) {
        if (!envConfig.parsed[varName]) {
          missing.push(varName);
        }
      }
      
      this.assert(missing.length === 0, `Missing required variables: ${missing.join(', ')}`);
      
      return true;
    });
    
    await this.test('Environment Variable Format Validation', async () => {
      const envPath = join(__dirname, '..', '.env.local');
      const envConfig = dotenv.config({ path: envPath });
      
      // OpenAI API key should start with 'sk-'
      if (envConfig.parsed.OPENAI_API_KEY && !envConfig.parsed.OPENAI_API_KEY.includes('your-key-here')) {
        this.assert(envConfig.parsed.OPENAI_API_KEY.startsWith('sk-'), 
                   'OpenAI API key should start with sk-');
      }
      
      // ElevenLabs API key should start with 'sk_'  
      if (envConfig.parsed.ELEVENLABS_API_KEY && !envConfig.parsed.ELEVENLABS_API_KEY.includes('your-')) {
        this.assert(envConfig.parsed.ELEVENLABS_API_KEY.startsWith('sk_'), 
                   'ElevenLabs API key should start with sk_');
      }
      
      // Encryption key should be at least 32 characters
      if (envConfig.parsed.ENCRYPTION_KEY) {
        this.assert(envConfig.parsed.ENCRYPTION_KEY.length >= 32, 
                   'Encryption key should be at least 32 characters');
      }
      
      return true;
    });
  }
  
  async runApiKeyValidationTests() {
    console.log('\n🔑 API KEY VALIDATION TESTS');
    console.log('─'.repeat(40));
    
    await this.test('OpenAI API Key Configuration', async () => {
      const envPath = join(__dirname, '..', '.env.local');
      const envConfig = dotenv.config({ path: envPath });
      
      const apiKey = envConfig.parsed.OPENAI_API_KEY;
      
      this.assert(apiKey, 'OpenAI API key should be present');
      this.assert(!apiKey.includes('your-key-here'), 'OpenAI API key should not be placeholder');
      this.assert(apiKey.length > 20, 'OpenAI API key should be reasonable length');
      
      return true;
    });
    
    await this.test('ElevenLabs API Key Configuration', async () => {
      const envPath = join(__dirname, '..', '.env.local');
      const envConfig = dotenv.config({ path: envPath });
      
      const apiKey = envConfig.parsed.ELEVENLABS_API_KEY;
      
      this.assert(apiKey, 'ElevenLabs API key should be present');
      this.assert(!apiKey.includes('your-'), 'ElevenLabs API key should not be placeholder');
      this.assert(apiKey.length > 20, 'ElevenLabs API key should be reasonable length');
      
      return true;
    });
    
    await this.test('API Key Security Validation', async () => {
      const envPath = join(__dirname, '..', '.env.local');
      const envFileContent = await fs.readFile(envPath, 'utf8');
      
      // Check that file doesn't contain obvious placeholder text
      this.assert(!envFileContent.includes('INSERT_YOUR_KEY_HERE'), 
                 'Environment file should not contain placeholder text');
      this.assert(!envFileContent.includes('REPLACE_WITH_ACTUAL_KEY'), 
                 'Environment file should not contain placeholder text');
      
      return true;
    });
  }
  
  async runFeatureFlagTests() {
    console.log('\n🏳️ FEATURE FLAG TESTS');
    console.log('─'.repeat(40));
    
    await this.test('Voice Feature Flag Configuration', async () => {
      const envPath = join(__dirname, '..', '.env.local');
      const envConfig = dotenv.config({ path: envPath });
      
      const enableVoice = envConfig.parsed.ENABLE_VOICE;
      
      this.assert(enableVoice !== undefined, 'ENABLE_VOICE should be defined');
      this.assert(['true', 'false'].includes(enableVoice), 'ENABLE_VOICE should be true or false');
      
      // For WSL compatibility, should default to false
      this.assert(enableVoice === 'false', 'ENABLE_VOICE should be false for WSL compatibility');
      
      return true;
    });
    
    await this.test('Learning Engine Feature Flag', async () => {
      const envPath = join(__dirname, '..', '.env.local');
      const envConfig = dotenv.config({ path: envPath });
      
      const enableLearning = envConfig.parsed.ENABLE_LEARNING;
      
      this.assert(enableLearning !== undefined, 'ENABLE_LEARNING should be defined');
      this.assert(['true', 'false'].includes(enableLearning), 'ENABLE_LEARNING should be true or false');
      
      return true;
    });
    
    await this.test('Feature Flag Consistency', async () => {
      const envPath = join(__dirname, '..', '.env.local');
      const envConfig = dotenv.config({ path: envPath });
      
      // Test that related flags are consistent
      const enableVoice = envConfig.parsed.ENABLE_VOICE === 'true';
      const enableLearning = envConfig.parsed.ENABLE_LEARNING === 'true';
      const enableResourceManager = envConfig.parsed.ENABLE_RESOURCE_MANAGER === 'true';
      
      // Learning should be enabled if we have an advanced setup
      if (enableResourceManager) {
        this.assert(enableLearning, 'Learning should be enabled when resource manager is enabled');
      }
      
      return true;
    });
  }
  
  async runPushoverConfigTests() {
    console.log('\n📱 PUSHOVER CONFIGURATION TESTS');
    console.log('─'.repeat(40));
    
    await this.test('Pushover Token Configuration', async () => {
      const envPath = join(__dirname, '..', '.env.local');
      const envConfig = dotenv.config({ path: envPath });
      
      const pushoverToken = envConfig.parsed.PUSHOVER_TOKEN;
      const pushoverUser = envConfig.parsed.PUSHOVER_USER;
      
      this.assert(pushoverToken, 'Pushover token should be present');
      this.assert(pushoverUser, 'Pushover user key should be present');
      
      this.assert(pushoverToken.length > 10, 'Pushover token should be reasonable length');
      this.assert(pushoverUser.length > 10, 'Pushover user key should be reasonable length');
      
      return true;
    });
    
    await this.test('Pushover Token Format', async () => {
      const envPath = join(__dirname, '..', '.env.local');
      const envConfig = dotenv.config({ path: envPath });
      
      const pushoverToken = envConfig.parsed.PUSHOVER_TOKEN;
      const pushoverUser = envConfig.parsed.PUSHOVER_USER;
      
      // Pushover tokens are alphanumeric
      this.assert(/^[a-zA-Z0-9]+$/.test(pushoverToken), 'Pushover token should be alphanumeric');
      this.assert(/^[a-zA-Z0-9]+$/.test(pushoverUser), 'Pushover user key should be alphanumeric');
      
      return true;
    });
  }
  
  async runPathConfigTests() {
    console.log('\n📁 PATH CONFIGURATION TESTS');
    console.log('─'.repeat(40));
    
    await this.test('Database Path Configuration', async () => {
      const envPath = join(__dirname, '..', '.env.local');
      const envConfig = dotenv.config({ path: envPath });
      
      const dbPath = envConfig.parsed.DATABASE_PATH;
      
      this.assert(dbPath, 'Database path should be configured');
      this.assert(dbPath.includes('.db'), 'Database path should reference a .db file');
      
      return true;
    });
    
    await this.test('Project Path Configuration', async () => {
      const envPath = join(__dirname, '..', '.env.local');
      const envConfig = dotenv.config({ path: envPath });
      
      const projectBase = envConfig.parsed.PROJECT_BASE;
      const claudeAssistantPath = envConfig.parsed.CLAUDE_ASSISTANT_PATH;
      
      this.assert(projectBase, 'Project base path should be configured');
      this.assert(claudeAssistantPath, 'Claude assistant path should be configured');
      
      this.assert(projectBase.includes('/home/ben'), 'Project base should be in home directory');
      this.assert(claudeAssistantPath.includes('claude-assistant'), 'Claude assistant path should reference correct directory');
      
      return true;
    });
  }
  
  async runSecurityConfigTests() {
    console.log('\n🔒 SECURITY CONFIGURATION TESTS');
    console.log('─'.repeat(40));
    
    await this.test('Encryption Key Security', async () => {
      const envPath = join(__dirname, '..', '.env.local');
      const envConfig = dotenv.config({ path: envPath });
      
      const encryptionKey = envConfig.parsed.ENCRYPTION_KEY;
      
      this.assert(encryptionKey, 'Encryption key should be present');
      this.assert(encryptionKey.length >= 32, 'Encryption key should be at least 32 characters');
      this.assert(!encryptionKey.includes('change-me'), 'Encryption key should not be default placeholder');
      
      return true;
    });
    
    await this.test('Environment Security', async () => {
      const envPath = join(__dirname, '..', '.env.local');
      const envConfig = dotenv.config({ path: envPath });
      
      const nodeEnv = envConfig.parsed.NODE_ENV;
      
      this.assert(nodeEnv, 'NODE_ENV should be set');
      this.assert(['development', 'production', 'test'].includes(nodeEnv), 
                 'NODE_ENV should be valid environment');
      
      return true;
    });
    
    await this.test('Rate Limit Configuration', async () => {
      const envPath = join(__dirname, '..', '.env.local');
      const envConfig = dotenv.config({ path: envPath });
      
      const openaiRateLimit = parseInt(envConfig.parsed.OPENAI_RATE_LIMIT) || 0;
      const elevenlabsRateLimit = parseInt(envConfig.parsed.ELEVENLABS_RATE_LIMIT) || 0;
      
      this.assert(openaiRateLimit > 0, 'OpenAI rate limit should be configured');
      this.assert(elevenlabsRateLimit > 0, 'ElevenLabs rate limit should be configured');
      this.assert(openaiRateLimit <= 100, 'OpenAI rate limit should be reasonable');
      this.assert(elevenlabsRateLimit <= 50, 'ElevenLabs rate limit should be reasonable');
      
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
      console.log('🎉 ALL TESTS PASSED! Environment configuration is correct.');
    } else {
      console.log(`❌ ${this.stats.failed} test(s) failed. Please check the configuration.`);
    }
    console.log('═'.repeat(50));
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const suite = new EnvironmentTestSuite();
  suite.runAllTests()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error('Test suite crashed:', error);
      process.exit(1);
    });
}

export default EnvironmentTestSuite;