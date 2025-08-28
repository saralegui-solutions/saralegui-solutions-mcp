#!/usr/bin/env node

/**
 * Client Discovery and NetSuite MCP Integration Script
 * 
 * Scans the saralegui-solutions-llc directory structure to find all client projects
 * and automatically adds NetSuite MCP integration to any missing package.json files.
 * 
 * This script handles:
 * - ESONUS subclients (esonus/rockwest, esonus/escalon, etc.)
 * - Direct clients (clients/direct/[name])
 * - Top-level clients (acme_corp, etc.)
 * 
 * Usage:
 *   node scripts/discover-clients.js [--dry-run] [--verbose]
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class ClientDiscovery {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    this.verbose = options.verbose || false;
    this.basePath = '/home/ben/saralegui-solutions-llc';
    this.mcpServerPath = '/home/ben/saralegui-solutions-mcp';
    this.discoveredClients = [];
    this.processedProjects = [];
  }

  log(message, level = 'info') {
    const colors = {
      info: chalk.cyan,
      success: chalk.green,
      warning: chalk.yellow,
      error: chalk.red,
      verbose: chalk.gray
    };

    if (level === 'verbose' && !this.verbose) return;
    
    console.log(colors[level](message));
  }

  /**
   * Main discovery process
   */
  async discover() {
    this.log('🔍 NetSuite MCP Client Discovery Starting...', 'info');
    this.log(`Base path: ${this.basePath}`, 'verbose');
    this.log(`MCP server: ${this.mcpServerPath}`, 'verbose');
    
    if (this.dryRun) {
      this.log('🧪 DRY RUN MODE - No changes will be made', 'warning');
    }

    try {
      // Verify MCP server exists
      await this.verifyMcpServer();
      
      // Discover clients using multiple patterns
      await this.discoverEsonusSubclients();
      await this.discoverDirectClients();
      await this.discoverTopLevelClients();
      
      // Process discovered clients
      await this.processDiscoveredClients();
      
      // Generate summary report
      this.generateSummaryReport();
      
    } catch (error) {
      this.log(`❌ Discovery failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Verify MCP server exists and is accessible
   */
  async verifyMcpServer() {
    try {
      await fs.access(this.mcpServerPath);
      await fs.access(path.join(this.mcpServerPath, 'config/netsuite_sandbox.js'));
      this.log('✅ MCP server verified', 'verbose');
    } catch (error) {
      throw new Error(`MCP server not found at ${this.mcpServerPath}`);
    }
  }

  /**
   * Discover ESONUS subclient projects (esonus/rockwest, esonus/escalon, etc.)
   */
  async discoverEsonusSubclients() {
    this.log('🔍 Scanning ESONUS subclients...', 'verbose');
    
    const esonusPath = path.join(this.basePath, 'esonus');
    
    try {
      const entries = await fs.readdir(esonusPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const clientPath = path.join(esonusPath, entry.name);
          const isNetSuiteProject = await this.isNetSuiteProject(clientPath);
          
          if (isNetSuiteProject) {
            this.discoveredClients.push({
              name: entry.name,
              type: 'esonus-subclient',
              path: clientPath,
              parentClient: 'esonus'
            });
            
            this.log(`Found ESONUS subclient: ${entry.name}`, 'verbose');
          }
        }
      }
    } catch (error) {
      this.log(`Warning: Could not scan ESONUS directory: ${error.message}`, 'warning');
    }
  }

  /**
   * Discover direct client projects (clients/direct/[name])
   */
  async discoverDirectClients() {
    this.log('🔍 Scanning direct clients...', 'verbose');
    
    const directClientsPath = path.join(this.basePath, 'clients/direct');
    
    try {
      const entries = await fs.readdir(directClientsPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const clientPath = path.join(directClientsPath, entry.name);
          const isNetSuiteProject = await this.isNetSuiteProject(clientPath);
          
          if (isNetSuiteProject) {
            this.discoveredClients.push({
              name: entry.name,
              type: 'direct-client',
              path: clientPath
            });
            
            this.log(`Found direct client: ${entry.name}`, 'verbose');
          }
        }
      }
    } catch (error) {
      this.log(`Warning: Could not scan direct clients directory: ${error.message}`, 'warning');
    }
  }

  /**
   * Discover top-level client projects (excluding known system directories)
   */
  async discoverTopLevelClients() {
    this.log('🔍 Scanning top-level clients...', 'verbose');
    
    const excludeDirectories = new Set([
      'esonus', 'clients', 'claude-assistant', 'knowledge-base', 'knowledge_base',
      'shared', 'shared-resources', 'tools', 'products', 'services', 'ai-dev-bridge',
      'first-ai-project', 'internal_tools', 'netsuite-suitescript-framework',
      'temp', 'node_modules', '.git', 'logs', 'scripts', 'docs', 'tests',
      'hooks', 'modules', 'config', 'core', 'claudio-agents', 'create-netsuite-project.sh.old'
    ]);
    
    try {
      const entries = await fs.readdir(this.basePath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() && 
            !entry.name.startsWith('.') && 
            !excludeDirectories.has(entry.name)) {
          
          const clientPath = path.join(this.basePath, entry.name);
          const isNetSuiteProject = await this.isNetSuiteProject(clientPath);
          
          if (isNetSuiteProject) {
            this.discoveredClients.push({
              name: entry.name,
              type: 'top-level-client',
              path: clientPath
            });
            
            this.log(`Found top-level client: ${entry.name}`, 'verbose');
          }
        }
      }
    } catch (error) {
      this.log(`Error scanning top-level clients: ${error.message}`, 'error');
    }
  }

  /**
   * Determine if a directory contains a NetSuite project
   */
  async isNetSuiteProject(projectPath) {
    try {
      // Check for NetSuite project indicators
      const indicators = [
        'src/FileCabinet/SuiteScripts',
        'suitecloud.config.js',
        'project.json',
        'src/deploy.xml',
        'src/manifest.xml'
      ];
      
      for (const indicator of indicators) {
        try {
          await fs.access(path.join(projectPath, indicator));
          return true;
        } catch {
          // Continue checking
        }
      }
      
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Process all discovered clients
   */
  async processDiscoveredClients() {
    this.log(`\n📋 Processing ${this.discoveredClients.length} discovered clients...`, 'info');
    
    for (const client of this.discoveredClients) {
      await this.processClient(client);
    }
  }

  /**
   * Process a single client project
   */
  async processClient(client) {
    this.log(`\n🔧 Processing ${client.name} (${client.type})...`, 'info');
    
    const packageJsonPath = path.join(client.path, 'package.json');
    const hasPackageJson = await this.fileExists(packageJsonPath);
    
    if (hasPackageJson) {
      // Check if it has NetSuite MCP scripts
      const hasNetSuiteMcp = await this.hasNetSuiteMcpScripts(packageJsonPath);
      
      if (hasNetSuiteMcp) {
        this.log(`  ✅ Already has NetSuite MCP integration`, 'success');
      } else {
        this.log(`  🔄 Adding NetSuite MCP scripts to existing package.json`, 'info');
        await this.addNetSuiteMcpScripts(packageJsonPath, client);
      }
    } else {
      this.log(`  📦 Creating package.json with NetSuite MCP integration`, 'info');
      await this.createPackageJsonWithMcp(packageJsonPath, client);
    }
    
    this.processedProjects.push(client);
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if package.json has NetSuite MCP scripts
   */
  async hasNetSuiteMcpScripts(packageJsonPath) {
    try {
      const content = await fs.readFile(packageJsonPath, 'utf8');
      const packageData = JSON.parse(content);
      
      return packageData.scripts && 
             packageData.scripts['setup:netsuite'] &&
             packageData.scripts['setup:netsuite'].includes('netsuite_sandbox.js');
    } catch {
      return false;
    }
  }

  /**
   * Add NetSuite MCP scripts to existing package.json
   */
  async addNetSuiteMcpScripts(packageJsonPath, client) {
    if (this.dryRun) {
      this.log(`  [DRY RUN] Would add NetSuite MCP scripts to ${packageJsonPath}`, 'verbose');
      return;
    }

    try {
      const content = await fs.readFile(packageJsonPath, 'utf8');
      const packageData = JSON.parse(content);
      
      // Add NetSuite MCP scripts
      if (!packageData.scripts) {
        packageData.scripts = {};
      }
      
      packageData.scripts['setup:netsuite'] = `node ${this.mcpServerPath}/config/netsuite_sandbox.js setup ${client.name}`;
      packageData.scripts['list:netsuite'] = `node ${this.mcpServerPath}/config/netsuite_sandbox.js list`;
      packageData.scripts['test:netsuite'] = `node ${this.mcpServerPath}/config/netsuite_sandbox.js test`;
      
      // Add keywords if not present
      if (!packageData.keywords) {
        packageData.keywords = [];
      }
      
      const netsuiteKeywords = ['netsuite', 'suitescript', 'mcp', client.name];
      for (const keyword of netsuiteKeywords) {
        if (!packageData.keywords.includes(keyword)) {
          packageData.keywords.push(keyword);
        }
      }
      
      // Write back to file
      await fs.writeFile(packageJsonPath, JSON.stringify(packageData, null, 2) + '\n');
      this.log(`  ✅ Added NetSuite MCP scripts to existing package.json`, 'success');
      
    } catch (error) {
      this.log(`  ❌ Failed to update package.json: ${error.message}`, 'error');
    }
  }

  /**
   * Create new package.json with NetSuite MCP integration
   */
  async createPackageJsonWithMcp(packageJsonPath, client) {
    if (this.dryRun) {
      this.log(`  [DRY RUN] Would create ${packageJsonPath}`, 'verbose');
      return;
    }

    try {
      const packageData = {
        name: `${client.name}-netsuite-project`,
        version: '1.0.0',
        description: `NetSuite SuiteScript project with MCP integration for ${client.name}`,
        scripts: {
          'setup:netsuite': `node ${this.mcpServerPath}/config/netsuite_sandbox.js setup ${client.name}`,
          'list:netsuite': `node ${this.mcpServerPath}/config/netsuite_sandbox.js list`,
          'test:netsuite': `node ${this.mcpServerPath}/config/netsuite_sandbox.js test`
        },
        keywords: ['netsuite', 'suitescript', 'mcp', client.name],
        private: true
      };
      
      await fs.writeFile(packageJsonPath, JSON.stringify(packageData, null, 2) + '\n');
      this.log(`  ✅ Created new package.json with NetSuite MCP integration`, 'success');
      
    } catch (error) {
      this.log(`  ❌ Failed to create package.json: ${error.message}`, 'error');
    }
  }

  /**
   * Generate summary report
   */
  generateSummaryReport() {
    this.log('\n═══════════════════════════════════════════════════', 'info');
    this.log('📊 CLIENT DISCOVERY SUMMARY', 'info');
    this.log('═══════════════════════════════════════════════════', 'info');
    
    this.log(`\n🔍 Discovery Results:`, 'info');
    this.log(`  • Total clients found: ${this.discoveredClients.length}`, 'info');
    this.log(`  • Projects processed: ${this.processedProjects.length}`, 'info');
    
    // Group by type
    const byType = this.discoveredClients.reduce((acc, client) => {
      acc[client.type] = (acc[client.type] || 0) + 1;
      return acc;
    }, {});
    
    this.log('\n📋 By Client Type:', 'info');
    for (const [type, count] of Object.entries(byType)) {
      this.log(`  • ${type}: ${count} projects`, 'info');
    }
    
    if (this.discoveredClients.length > 0) {
      this.log('\n🏢 Discovered Clients:', 'info');
      for (const client of this.discoveredClients) {
        this.log(`  • ${client.name} (${client.type}) - ${client.path}`, 'verbose');
      }
    }
    
    this.log('\n✅ NetSuite MCP Integration Status:', 'success');
    this.log('All discovered NetSuite projects now have MCP integration available!', 'success');
    
    this.log('\n🚀 Usage:', 'info');
    this.log('From any client project directory:', 'info');
    this.log('  npm run setup:netsuite    # Configure NetSuite credentials', 'info');
    this.log('  npm run list:netsuite     # List NetSuite accounts', 'info');
    this.log('  npm run test:netsuite     # Test NetSuite connection', 'info');
    
    if (this.dryRun) {
      this.log('\n🧪 DRY RUN COMPLETED - No actual changes were made', 'warning');
      this.log('Run without --dry-run to apply changes', 'warning');
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose')
  };

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
NetSuite MCP Client Discovery Script

Automatically discovers NetSuite projects and adds MCP integration.

Usage:
  node scripts/discover-clients.js [options]

Options:
  --dry-run     Show what would be done without making changes
  --verbose     Show detailed output
  --help, -h    Show this help message

Examples:
  node scripts/discover-clients.js --dry-run --verbose
  node scripts/discover-clients.js
`);
    return;
  }

  const discovery = new ClientDiscovery(options);
  
  try {
    await discovery.discover();
  } catch (error) {
    console.error(chalk.red(`Discovery failed: ${error.message}`));
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}

export { ClientDiscovery };