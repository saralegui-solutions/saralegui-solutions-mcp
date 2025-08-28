#!/usr/bin/env node

/**
 * NetSuite Sandbox Credential Manager
 * Securely stores and manages NetSuite credentials with encryption
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import crypto from 'crypto';
import readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const __dirname = dirname(fileURLToPath(import.meta.url));

export class NetSuiteSandboxManager {
  async init(sharedDb = null) {
    if (sharedDb) {
      // Use shared database connection to avoid locking issues
      this.db = sharedDb;
    } else {
      // Create own connection if no shared connection provided
      const dbPath = join(dirname(__dirname), 'database', 'saralegui_assistant.db');
      this.db = await open({
        filename: dbPath,
        driver: sqlite3.Database
      });
    }
    
    await this.setupTables();
    
    // Get encryption key from environment or use default (change in production!)
    this.encryptionKey = process.env.ENCRYPTION_KEY || 'default-dev-key-change-in-production';
  }

  /**
   * Detect client from current working directory or path
   */
  detectClient(providedPath) {
    const currentPath = providedPath || process.cwd();
    
    // ESONUS client
    if (currentPath.includes('/esonus/')) {
      const projectPath = this.findProjectRoot(currentPath, 'esonus');
      return { 
        client: 'esonus', 
        projectPath: projectPath || currentPath 
      };
    }
    
    // Direct clients
    if (currentPath.includes('/clients/direct/')) {
      const parts = currentPath.split('/');
      const directIndex = parts.indexOf('direct');
      if (directIndex >= 0 && parts[directIndex + 1]) {
        const clientName = parts[directIndex + 1];
        const projectPath = this.findProjectRoot(currentPath, clientName);
        return { 
          client: clientName, 
          projectPath: projectPath || currentPath 
        };
      }
    }
    
    // Internal projects
    if (currentPath.includes('/clients/internal/')) {
      const projectPath = this.findProjectRoot(currentPath, 'internal');
      return { 
        client: 'internal', 
        projectPath: projectPath || currentPath 
      };
    }
    
    // Fallback - try to detect from saralegui-solutions-llc structure
    if (currentPath.includes('/saralegui-solutions-llc/')) {
      const parts = currentPath.split('/saralegui-solutions-llc/');
      if (parts[1]) {
        const subPath = parts[1].split('/')[0];
        return { 
          client: subPath, 
          projectPath: join(parts[0], '/saralegui-solutions-llc/', subPath) 
        };
      }
    }
    
    return { client: null, projectPath: currentPath };
  }

  /**
   * Find project root directory for a client
   */
  findProjectRoot(currentPath, clientName) {
    const basePaths = [
      `/home/ben/saralegui-solutions-llc/${clientName}`,
      `/home/ben/saralegui-solutions-llc/clients/direct/${clientName}`,
      `/home/ben/saralegui-solutions-llc/clients/internal`
    ];
    
    for (const basePath of basePaths) {
      if (currentPath.startsWith(basePath)) {
        return basePath;
      }
    }
    
    return currentPath;
  }
  
  async setupTables() {
    // Ensure credentials table exists (updated schema)
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS netsuite_credentials (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        client_name TEXT NOT NULL,
        project_path TEXT NOT NULL,
        account_id TEXT NOT NULL,
        environment TEXT NOT NULL,
        account_alias TEXT,
        encrypted_credentials TEXT NOT NULL,
        is_default INTEGER DEFAULT 0,
        last_used TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(client_name, account_id, environment)
      )
    `);
  }
  
  /**
   * Encrypt data using AES-256-GCM
   */
  encrypt(text) {
    const algorithm = 'aes-256-gcm';
    const salt = crypto.randomBytes(32);
    const key = crypto.scryptSync(this.encryptionKey, salt, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Combine salt, iv, authTag, and encrypted data
    return Buffer.concat([
      salt,
      iv,
      authTag,
      Buffer.from(encrypted, 'hex')
    ]).toString('base64');
  }
  
  /**
   * Decrypt data
   */
  decrypt(encryptedData) {
    const algorithm = 'aes-256-gcm';
    const data = Buffer.from(encryptedData, 'base64');
    
    // Extract components
    const salt = data.slice(0, 32);
    const iv = data.slice(32, 48);
    const authTag = data.slice(48, 64);
    const encrypted = data.slice(64);
    
    const key = crypto.scryptSync(this.encryptionKey, salt, 32);
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, null, 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  /**
   * Interactive credential setup
   */
  async setupCredentialsInteractive(specifiedClient = null) {
    console.log(chalk.blue.bold('\n🔐 NetSuite Multi-Client Credential Setup'));
    console.log(chalk.gray('=' . repeat(50)));
    
    // Detect or use specified client
    const detection = this.detectClient();
    let clientInfo = { 
      client: specifiedClient || detection.client, 
      projectPath: detection.projectPath 
    };
    
    if (!clientInfo.client) {
      console.log(chalk.yellow('\n⚠️  Could not auto-detect client from current directory'));
      console.log(chalk.gray('Current path:'), process.cwd());
    } else {
      console.log(chalk.cyan(`\n✅ Detected client: ${clientInfo.client}`));
      console.log(chalk.gray(`Project path: ${clientInfo.projectPath}`));
    }
    
    console.log(chalk.cyan(`
📋 Prerequisites:
1. Log into your NetSuite Sandbox account
2. Go to Setup → Integration → Manage Integrations
3. Create a new integration for "Saralegui AI Assistant"
4. Enable Token-Based Authentication (TBA)
5. Note down all the credentials
    `));
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const question = (query) => new Promise((resolve) => {
      rl.question(chalk.yellow(query), resolve);
    });
    
    try {
      // Collect client info if not detected
      if (!clientInfo.client) {
        console.log(chalk.yellow('\n📝 Client Information Required:'));
        clientInfo.client = await question('Client name (e.g., esonus, client-name): ');
        clientInfo.projectPath = await question(`Project path [${process.cwd()}]: `) || process.cwd();
      }
      
      // Collect credentials
      console.log(chalk.cyan('\n🔐 Enter your NetSuite credentials:'));
      
      const environment = await question('Environment (sandbox/production) [sandbox]: ') || 'sandbox';
      
      const credentials = {
        accountId: await question('Account ID (e.g., 1234567_SB1): '),
        consumerKey: await question('Consumer Key: '),
        consumerSecret: await question('Consumer Secret: '),
        tokenId: await question('Token ID: '),
        tokenSecret: await question('Token Secret: '),
        restletUrl: await question('RESTlet URL (optional, press Enter to skip): ') || null,
        environment: environment,
        accountAlias: await question(`Account alias [${clientInfo.client}-${environment}]: `) || `${clientInfo.client}-${environment}`
      };
      
      // Validate required fields
      const required = ['accountId', 'consumerKey', 'consumerSecret', 'tokenId', 'tokenSecret'];
      const missing = required.filter(field => !credentials[field]);
      
      if (missing.length > 0) {
        console.error(chalk.red(`\n❌ Missing required fields: ${missing.join(', ')}`));
        return null;
      }
      
      // Store credentials
      const spinner = ora('Encrypting and storing credentials...').start();
      
      try {
        // Check if user wants this as default
        const makeDefault = await question(`Set as default account for ${clientInfo.client}? (y/n) [y]: `) || 'y';
        const isDefault = makeDefault.toLowerCase().startsWith('y') ? 1 : 0;
        
        rl.close();
        
        const encrypted = this.encrypt(JSON.stringify(credentials));
        
        // If setting as default, unset other defaults for this client first
        if (isDefault) {
          await this.db.run(`
            UPDATE netsuite_credentials 
            SET is_default = 0 
            WHERE client_name = ?`,
            [clientInfo.client]
          );
        }
        
        await this.db.run(`
          INSERT OR REPLACE INTO netsuite_credentials 
          (client_name, project_path, account_id, environment, account_alias, encrypted_credentials, is_default)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [clientInfo.client, clientInfo.projectPath, credentials.accountId, credentials.environment, credentials.accountAlias, encrypted, isDefault]
        );
        
        spinner.succeed('Credentials stored securely');
        
        console.log(chalk.green.bold('\n✅ NetSuite credentials configured successfully!'));
        console.log(chalk.gray(`Client: ${clientInfo.client}`));
        console.log(chalk.gray(`Account: ${credentials.accountId}`));
        console.log(chalk.gray(`Environment: ${credentials.environment}`));
        console.log(chalk.gray(`Alias: ${credentials.accountAlias}`));
        console.log(chalk.gray(`Project Path: ${clientInfo.projectPath}`));
        console.log(chalk.gray(`Default Account: ${isDefault ? 'Yes' : 'No'}`));
        
        return { clientInfo, credentials };
        
      } catch (error) {
        spinner.fail('Failed to store credentials');
        console.error(chalk.red('Error:'), error.message);
        return null;
      }
      
    } catch (error) {
      rl.close();
      console.error(chalk.red('Setup failed:'), error.message);
      return null;
    }
  }
  
  /**
   * Store credentials programmatically
   */
  async storeCredentials(accountId, credentials, environment = 'sandbox') {
    try {
      const encrypted = this.encrypt(JSON.stringify(credentials));
      
      await this.db.run(`
        INSERT OR REPLACE INTO netsuite_credentials 
        (account_id, environment, encrypted_credentials)
        VALUES (?, ?, ?)`,
        [accountId, environment, encrypted]
      );
      
      return true;
    } catch (error) {
      console.error(chalk.red('Failed to store credentials:'), error.message);
      return false;
    }
  }
  
  /**
   * Retrieve and decrypt credentials
   */
  async getCredentials(accountId) {
    try {
      const row = await this.db.get(`
        SELECT encrypted_credentials, environment 
        FROM netsuite_credentials 
        WHERE account_id = ?`,
        [accountId]
      );
      
      if (!row) {
        return null;
      }
      
      const decrypted = this.decrypt(row.encrypted_credentials);
      const credentials = JSON.parse(decrypted);
      
      // Update last used timestamp
      await this.db.run(`
        UPDATE netsuite_credentials 
        SET last_used = CURRENT_TIMESTAMP 
        WHERE account_id = ?`,
        [accountId]
      );
      
      return {
        ...credentials,
        environment: row.environment
      };
      
    } catch (error) {
      console.error(chalk.red('Failed to retrieve credentials:'), error.message);
      return null;
    }
  }
  
  /**
   * List all stored accounts
   */
  async listAccounts() {
    const accounts = await this.db.all(`
      SELECT account_id, environment, created_at, last_used
      FROM netsuite_credentials
      ORDER BY last_used DESC
    `);
    
    if (accounts.length === 0) {
      console.log(chalk.yellow('No NetSuite accounts configured'));
      return [];
    }
    
    console.log(chalk.cyan('\n📋 Configured NetSuite Accounts:'));
    console.log(chalk.gray('='.repeat(50)));
    
    accounts.forEach(account => {
      console.log(chalk.white(`\n• ${account.account_id}`));
      console.log(chalk.gray(`  Environment: ${account.environment}`));
      console.log(chalk.gray(`  Created: ${account.created_at}`));
      console.log(chalk.gray(`  Last used: ${account.last_used || 'Never'}`));
    });
    
    return accounts;
  }
  
  /**
   * Remove stored credentials
   */
  async removeCredentials(accountId) {
    try {
      const result = await this.db.run(`
        DELETE FROM netsuite_credentials 
        WHERE account_id = ?`,
        [accountId]
      );
      
      if (result.changes > 0) {
        console.log(chalk.green(`✅ Removed credentials for ${accountId}`));
        return true;
      } else {
        console.log(chalk.yellow(`No credentials found for ${accountId}`));
        return false;
      }
      
    } catch (error) {
      console.error(chalk.red('Failed to remove credentials:'), error.message);
      return false;
    }
  }
  
  /**
   * Test NetSuite connection
   */
  async testConnection(accountId) {
    const credentials = await this.getCredentials(accountId);
    
    if (!credentials) {
      console.error(chalk.red(`No credentials found for ${accountId}`));
      return false;
    }
    
    console.log(chalk.cyan(`\n🔌 Testing connection to ${accountId}...`));
    
    // Here you would implement actual NetSuite API connection test
    // For now, we'll just validate that credentials exist
    
    const requiredFields = ['accountId', 'consumerKey', 'consumerSecret', 'tokenId', 'tokenSecret'];
    const hasAllFields = requiredFields.every(field => credentials[field]);
    
    if (hasAllFields) {
      console.log(chalk.green('✅ Credentials validated successfully'));
      console.log(chalk.gray('Note: Actual API connection test requires NetSuite SDK'));
      return true;
    } else {
      console.log(chalk.red('❌ Missing required credential fields'));
      return false;
    }
  }
  
  /**
   * Export credentials for backup (encrypted)
   */
  async exportCredentials(accountId, outputPath) {
    try {
      const row = await this.db.get(`
        SELECT * FROM netsuite_credentials 
        WHERE account_id = ?`,
        [accountId]
      );
      
      if (!row) {
        console.error(chalk.red(`No credentials found for ${accountId}`));
        return false;
      }
      
      const fs = await import('fs');
      await fs.promises.writeFile(outputPath, JSON.stringify(row, null, 2));
      
      console.log(chalk.green(`✅ Exported encrypted credentials to ${outputPath}`));
      return true;
      
    } catch (error) {
      console.error(chalk.red('Export failed:'), error.message);
      return false;
    }
  }
  
  /**
   * Close database connection
   */
  async close() {
    await this.db.close();
  }
}

// CLI interface
async function main() {
  const manager = new NetSuiteSandboxManager();
  await manager.init();
  
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'setup':
      const specifiedClient = args[1];
      await manager.setupCredentialsInteractive(specifiedClient);
      break;
      
    case 'list':
      await manager.listAccounts();
      break;
      
    case 'test':
      if (!args[1]) {
        console.error(chalk.red('Usage: netsuite_sandbox.js test <account_id>'));
      } else {
        await manager.testConnection(args[1]);
      }
      break;
      
    case 'remove':
      if (!args[1]) {
        console.error(chalk.red('Usage: netsuite_sandbox.js remove <account_id>'));
      } else {
        await manager.removeCredentials(args[1]);
      }
      break;
      
    case 'export':
      if (!args[1] || !args[2]) {
        console.error(chalk.red('Usage: netsuite_sandbox.js export <account_id> <output_file>'));
      } else {
        await manager.exportCredentials(args[1], args[2]);
      }
      break;
      
    default:
      console.log(chalk.cyan('NetSuite Multi-Client Credential Manager'));
      console.log(chalk.gray('\nCommands:'));
      console.log('  setup [client]     - Interactive credential setup (auto-detects client)');
      console.log('  list               - List configured accounts by client');
      console.log('  test <account_id>  - Test connection');
      console.log('  remove <account_id>- Remove credentials');
      console.log('  export <account_id> <file> - Export encrypted backup');
      console.log(chalk.gray('\nExamples:'));
      console.log('  node config/netsuite_sandbox.js setup         # Auto-detect client');
      console.log('  node config/netsuite_sandbox.js setup esonus  # Specific client');
      console.log('  npm run setup:netsuite                        # Via npm script');
  }
  
  await manager.close();
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}

export default NetSuiteSandboxManager;