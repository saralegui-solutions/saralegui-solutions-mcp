#!/usr/bin/env node

/**
 * NetSuite Setup Validation Test
 * Tests credential storage, retrieval, and UI improvements
 */

import { NetSuiteSandboxManager } from '../config/netsuite_sandbox.js';
import chalk from 'chalk';

class NetSuiteSetupTester {
  constructor() {
    this.manager = new NetSuiteSandboxManager();
  }

  async init() {
    await this.manager.init();
  }

  /**
   * Test if rockwest credentials were stored correctly
   */
  async testCredentialStorage() {
    console.log(chalk.cyan('\n🧪 Testing Credential Storage...'));
    console.log(chalk.gray('─'.repeat(40)));

    try {
      // Query the database for rockwest credentials
      const credentials = await this.manager.db.get(`
        SELECT client_name, account_id, environment, account_alias, is_default, created_at
        FROM netsuite_credentials 
        WHERE client_name = ?
        ORDER BY created_at DESC
        LIMIT 1
      `, ['rockwest']);

      if (!credentials) {
        console.log(chalk.red('❌ No credentials found for rockwest'));
        return false;
      }

      console.log(chalk.green('✅ Credentials found in database'));
      console.log(chalk.gray(`   Client: ${credentials.client_name}`));
      console.log(chalk.gray(`   Account ID: ${credentials.account_id}`));
      console.log(chalk.gray(`   Environment: ${credentials.environment}`));
      console.log(chalk.gray(`   Alias: ${credentials.account_alias}`));
      console.log(chalk.gray(`   Is Default: ${credentials.is_default ? 'Yes' : 'No'}`));
      console.log(chalk.gray(`   Created: ${credentials.created_at}`));

      return true;

    } catch (error) {
      console.log(chalk.red(`❌ Database query failed: ${error.message}`));
      return false;
    }
  }

  /**
   * Test credential decryption
   */
  async testCredentialDecryption() {
    console.log(chalk.cyan('\n🔓 Testing Credential Decryption...'));
    console.log(chalk.gray('─'.repeat(40)));

    try {
      // Get encrypted credentials
      const result = await this.manager.db.get(`
        SELECT encrypted_credentials
        FROM netsuite_credentials 
        WHERE client_name = ? AND account_id = ?
      `, ['rockwest', '7134233_SB1']);

      if (!result) {
        console.log(chalk.red('❌ No encrypted credentials found'));
        return false;
      }

      console.log(chalk.gray(`   Encrypted data length: ${result.encrypted_credentials.length} chars`));

      // Try to decrypt
      const decrypted = this.manager.decrypt(result.encrypted_credentials);
      const credentials = JSON.parse(decrypted);

      if (credentials.accountId && credentials.consumerKey && credentials.tokenId) {
        console.log(chalk.green('✅ Credentials decrypt successfully'));
        console.log(chalk.gray(`   Account ID: ${credentials.accountId}`));
        console.log(chalk.gray(`   Consumer Key: ${credentials.consumerKey.substring(0, 10)}...`));
        console.log(chalk.gray(`   Token ID: ${credentials.tokenId.substring(0, 10)}...`));
        return true;
      } else {
        console.log(chalk.red('❌ Decrypted credentials are incomplete'));
        console.log(chalk.gray(`   Keys found: ${Object.keys(credentials).join(', ')}`));
        return false;
      }

    } catch (error) {
      console.log(chalk.red(`❌ Decryption failed: ${error.message}`));
      
      // Check if it's an authentication error (common with encryption key mismatch)
      if (error.message.includes('authenticate data')) {
        console.log(chalk.yellow('   This might be due to an encryption key mismatch'));
        console.log(chalk.yellow('   The data was encrypted with a different key than used for decryption'));
      }
      
      return false;
    }
  }

  /**
   * Test the list functionality
   */
  async testListFunction() {
    console.log(chalk.cyan('\n📋 Testing List Function...'));
    console.log(chalk.gray('─'.repeat(40)));

    try {
      // Call the listAccounts method (correct method name)
      const credentials = await this.manager.listAccounts();
      
      if (credentials && credentials.length > 0) {
        console.log(chalk.green(`✅ Found ${credentials.length} credential(s)`));
        
        const rockwestCreds = credentials.find(c => c.client_name === 'rockwest');
        if (rockwestCreds) {
          console.log(chalk.green('✅ Rockwest credentials found in list'));
          return true;
        } else {
          console.log(chalk.yellow('⚠️  Rockwest not found in credentials list'));
          return false;
        }
      } else {
        console.log(chalk.red('❌ No credentials found'));
        return false;
      }

    } catch (error) {
      console.log(chalk.red(`❌ List function failed: ${error.message}`));
      return false;
    }
  }

  /**
   * Test default account detection
   */
  async testDefaultDetection() {
    console.log(chalk.cyan('\n🎯 Testing Default Account Detection...'));
    console.log(chalk.gray('─'.repeat(40)));

    try {
      // Check if rockwest has a default account
      const defaultCred = await this.manager.db.get(`
        SELECT client_name, account_id, is_default
        FROM netsuite_credentials 
        WHERE client_name = ? AND is_default = 1
      `, ['rockwest']);

      if (defaultCred) {
        console.log(chalk.green('✅ Default account is properly set'));
        console.log(chalk.gray(`   Default for ${defaultCred.client_name}: ${defaultCred.account_id}`));
        return true;
      } else {
        console.log(chalk.yellow('⚠️  No default account set for rockwest'));
        return false;
      }

    } catch (error) {
      console.log(chalk.red(`❌ Default detection failed: ${error.message}`));
      return false;
    }
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log(chalk.blue.bold('\n🚀 NetSuite Setup Validation Tests'));
    console.log(chalk.blue('═'.repeat(50)));

    const tests = [
      { name: 'Credential Storage', test: () => this.testCredentialStorage() },
      { name: 'Credential Decryption', test: () => this.testCredentialDecryption() },
      { name: 'List Function', test: () => this.testListFunction() },
      { name: 'Default Detection', test: () => this.testDefaultDetection() }
    ];

    let passed = 0;
    let total = tests.length;

    for (const { name, test } of tests) {
      try {
        const result = await test();
        if (result) {
          passed++;
        }
      } catch (error) {
        console.log(chalk.red(`❌ Test ${name} crashed: ${error.message}`));
      }
    }

    // Summary
    console.log(chalk.blue('\n═'.repeat(50)));
    if (passed === total) {
      console.log(chalk.green.bold(`🎉 All tests passed! (${passed}/${total})`));
      console.log(chalk.green('✅ NetSuite MCP setup for rockwest is working correctly'));
    } else {
      console.log(chalk.yellow.bold(`⚠️  ${passed}/${total} tests passed`));
      if (passed > 0) {
        console.log(chalk.yellow('Some functionality is working, but there may be issues'));
      } else {
        console.log(chalk.red('❌ Setup validation failed - credentials may not be stored properly'));
      }
    }

    // Close database connection
    if (this.manager.db) {
      await this.manager.db.close();
    }

    return passed === total;
  }
}

// Run tests if called directly
async function main() {
  const tester = new NetSuiteSetupTester();
  
  try {
    await tester.init();
    const success = await tester.runAllTests();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error(chalk.red(`Test runner failed: ${error.message}`));
    process.exit(1);
  }
}

if (process.argv[1] === import.meta.url.replace('file://', '')) {
  main().catch(console.error);
}

export { NetSuiteSetupTester };