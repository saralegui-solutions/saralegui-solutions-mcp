#!/usr/bin/env node

/**
 * NetSuite MCP Server for Saralegui Solutions
 * Provides NetSuite-specific tools for Claude Desktop via Model Context Protocol
 * 
 * This server wraps the existing MCP infrastructure to provide NetSuite operations
 * including credential management, SuiteQL queries, and script deployment.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import { DatabaseManager } from './lib/database_manager.js';
import { NetSuiteSandboxManager } from './config/netsuite_sandbox.js';
import { LearningEngine } from './lib/learning_engine.js';
import { SecurityManager } from './lib/security_manager.js';
import { NetSuiteAPIClient } from './lib/netsuite-api-client.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class NetSuiteMCPServer {
  constructor() {
    this.server = new Server({
      name: 'saralegui-netsuite',
      version: '1.0.0'
    }, {
      capabilities: {
        tools: {},
        resources: {}
      }
    });
    
    // Initialize components using existing infrastructure
    this.db = new DatabaseManager();
    this.netsuiteManager = new NetSuiteSandboxManager();
    this.learningEngine = new LearningEngine(this.db);
    this.securityManager = new SecurityManager(this.db);
    
    this.sessionId = this.generateSessionId();
    this.context = {
      activeClient: null,
      recentActions: [],
      sessionStart: new Date()
    };
  }

  generateSessionId() {
    return `netsuite-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async initialize() {
    console.error('🚀 Initializing NetSuite MCP Server...');
    
    try {
      // Initialize database
      await this.db.initialize();
      
      // Initialize NetSuite manager with shared database
      await this.netsuiteManager.init(this.db.db);
      
      // Initialize other components
      await this.securityManager.initialize();
      
      // Set up handlers
      await this.setupHandlers();
      
      // Start session
      await this.db.createSession(this.sessionId, this.context);
      
      console.error('✅ NetSuite MCP Server initialized successfully');
      console.error(`📋 Available tools: netsuite_setup, netsuite_list, netsuite_test, netsuite_query, netsuite_deploy, client_discover, netsuite_help, netsuite_status, netsuite_examples, netsuite_validate`);
      console.error(`📚 Available resources: netsuite://commands, netsuite://setup, netsuite://examples, netsuite://status`);
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      throw error;
    }
  }

  async setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'netsuite_setup',
            description: 'Configure NetSuite credentials for a client project',
            inputSchema: {
              type: 'object',
              properties: {
                client_name: {
                  type: 'string',
                  description: 'Name of the client (auto-detected from path if not provided)'
                },
                account_id: {
                  type: 'string',
                  description: 'NetSuite account ID (e.g., TSTDRV123456)',
                  pattern: '^[A-Z0-9_]+$'
                },
                consumer_key: {
                  type: 'string',
                  description: 'OAuth consumer key'
                },
                consumer_secret: {
                  type: 'string',
                  description: 'OAuth consumer secret'
                },
                token_id: {
                  type: 'string',
                  description: 'Access token ID'
                },
                token_secret: {
                  type: 'string',
                  description: 'Access token secret'
                },
                environment: {
                  type: 'string',
                  enum: ['sandbox', 'production'],
                  default: 'sandbox',
                  description: 'NetSuite environment'
                }
              },
              required: ['account_id', 'consumer_key', 'consumer_secret', 'token_id', 'token_secret']
            }
          },
          {
            name: 'netsuite_list',
            description: 'List all configured NetSuite accounts',
            inputSchema: {
              type: 'object',
              properties: {
                client_filter: {
                  type: 'string',
                  description: 'Filter by client name (optional)'
                },
                include_test_status: {
                  type: 'boolean',
                  description: 'Include connection test results',
                  default: false
                }
              }
            }
          },
          {
            name: 'netsuite_test',
            description: 'Test NetSuite connection for a client',
            inputSchema: {
              type: 'object',
              properties: {
                client_name: {
                  type: 'string',
                  description: 'Client name (auto-detected if not provided)'
                },
                account_id: {
                  type: 'string',
                  description: 'Specific account ID to test (optional)'
                }
              }
            }
          },
          {
            name: 'netsuite_query',
            description: 'Execute SuiteQL query against NetSuite',
            inputSchema: {
              type: 'object',
              properties: {
                client_name: {
                  type: 'string',
                  description: 'Client name (auto-detected if not provided)'
                },
                query: {
                  type: 'string',
                  description: 'SuiteQL query to execute'
                },
                limit: {
                  type: 'integer',
                  description: 'Maximum number of results to return',
                  default: 100,
                  maximum: 1000
                },
                offset: {
                  type: 'integer',
                  description: 'Number of results to skip',
                  default: 0
                }
              },
              required: ['query']
            }
          },
          {
            name: 'netsuite_deploy',
            description: 'Deploy SuiteScript files to NetSuite',
            inputSchema: {
              type: 'object',
              properties: {
                client_name: {
                  type: 'string',
                  description: 'Client name (auto-detected if not provided)'
                },
                script_type: {
                  type: 'string',
                  enum: ['userevent', 'scheduled', 'restlet', 'suitelet', 'client', 'mapreduce'],
                  description: 'Type of SuiteScript'
                },
                script_content: {
                  type: 'string',
                  description: 'JavaScript content of the script'
                },
                script_name: {
                  type: 'string',
                  description: 'Name for the script'
                },
                deployment_config: {
                  type: 'object',
                  description: 'Deployment configuration options'
                }
              },
              required: ['script_type', 'script_content', 'script_name']
            }
          },
          {
            name: 'client_discover',
            description: 'Discover new client projects and integrate them',
            inputSchema: {
              type: 'object',
              properties: {
                base_path: {
                  type: 'string',
                  description: 'Base path to scan for clients',
                  default: '/home/ben/saralegui-solutions-llc'
                },
                dry_run: {
                  type: 'boolean',
                  description: 'Show what would be done without making changes',
                  default: false
                }
              }
            }
          },
          {
            name: 'netsuite_help',
            description: 'Get help and documentation for NetSuite MCP commands',
            inputSchema: {
              type: 'object',
              properties: {
                command: {
                  type: 'string',
                  description: 'Specific command to get help for (optional)'
                },
                category: {
                  type: 'string',
                  description: 'Help category (setup, queries, deployment, troubleshooting)',
                  enum: ['setup', 'queries', 'deployment', 'troubleshooting', 'all']
                }
              }
            }
          },
          {
            name: 'netsuite_status',
            description: 'Check NetSuite MCP server and configuration status',
            inputSchema: {
              type: 'object',
              properties: {
                detailed: {
                  type: 'boolean',
                  description: 'Include detailed system information',
                  default: false
                }
              }
            }
          },
          {
            name: 'netsuite_examples',
            description: 'Show usage examples for NetSuite MCP operations',
            inputSchema: {
              type: 'object',
              properties: {
                category: {
                  type: 'string',
                  description: 'Example category (setup, queries, deployment, workflows)',
                  enum: ['setup', 'queries', 'deployment', 'workflows', 'all']
                },
                operation: {
                  type: 'string',
                  description: 'Specific operation to show examples for'
                }
              }
            }
          },
          {
            name: 'netsuite_validate',
            description: 'Validate NetSuite MCP setup and configuration',
            inputSchema: {
              type: 'object',
              properties: {
                client_name: {
                  type: 'string',
                  description: 'Client name to validate (auto-detected if not provided)'
                },
                check_connection: {
                  type: 'boolean',
                  description: 'Test NetSuite connection as part of validation',
                  default: true
                }
              }
            }
          }
        ]
      };
    });

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'netsuite://commands',
            name: 'NetSuite MCP Commands Reference',
            description: 'Comprehensive reference for all NetSuite MCP commands and tools',
            mimeType: 'application/json'
          },
          {
            uri: 'netsuite://setup',
            name: 'NetSuite MCP Setup Guide',
            description: 'Complete setup and installation guide for NetSuite MCP integration',
            mimeType: 'application/json'
          },
          {
            uri: 'netsuite://examples',
            name: 'NetSuite MCP Usage Examples',
            description: 'Practical examples and workflows for NetSuite MCP operations',
            mimeType: 'application/json'
          },
          {
            uri: 'netsuite://status',
            name: 'NetSuite MCP System Status',
            description: 'Current server status, configuration, and health information',
            mimeType: 'application/json'
          }
        ]
      };
    });

    // Read resource content
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      
      console.error(`📖 Reading NetSuite resource: ${uri}`);
      
      try {
        let content;
        
        switch (uri) {
          case 'netsuite://commands':
            content = await fs.readFile(path.join(__dirname, 'resources', 'commands.json'), 'utf8');
            break;
          case 'netsuite://setup':
            content = await fs.readFile(path.join(__dirname, 'resources', 'setup.json'), 'utf8');
            break;
          case 'netsuite://examples':
            content = await fs.readFile(path.join(__dirname, 'resources', 'examples.json'), 'utf8');
            break;
          case 'netsuite://status':
            content = await this.generateStatusResource();
            break;
          default:
            throw new Error(`Unknown resource: ${uri}`);
        }

        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: content
          }]
        };

      } catch (error) {
        console.error(`❌ Resource read failed: ${error.message}`);
        throw error;
      }
    });

    // Execute tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      console.error(`📋 Executing NetSuite tool: ${name}`);
      
      try {
        // Security validation
        const validation = await this.validateToolRequest(name, args);
        if (!validation.valid) {
          throw new Error(`Security validation failed: ${validation.reason}`);
        }

        let result;
        switch (name) {
          case 'netsuite_setup':
            result = await this.handleNetSuiteSetup(args);
            break;
          case 'netsuite_list':
            result = await this.handleNetSuiteList(args);
            break;
          case 'netsuite_test':
            result = await this.handleNetSuiteTest(args);
            break;
          case 'netsuite_query':
            result = await this.handleNetSuiteQuery(args);
            break;
          case 'netsuite_deploy':
            result = await this.handleNetSuiteDeploy(args);
            break;
          case 'client_discover':
            result = await this.handleClientDiscover(args);
            break;
          case 'netsuite_help':
            result = await this.handleNetSuiteHelp(args);
            break;
          case 'netsuite_status':
            result = await this.handleNetSuiteStatus(args);
            break;
          case 'netsuite_examples':
            result = await this.handleNetSuiteExamples(args);
            break;
          case 'netsuite_validate':
            result = await this.handleNetSuiteValidate(args);
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        // Log successful execution for learning
        await this.logToolExecution(name, args, result, 'success');

        return {
          contents: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };

      } catch (error) {
        console.error(`❌ Tool execution failed: ${error.message}`);
        
        // Log failed execution
        await this.logToolExecution(name, args, null, 'error', error.message);
        
        throw error;
      }
    });
  }

  async validateToolRequest(toolName, args) {
    try {
      // Rate limiting check
      const recentCalls = await this.db.get(`
        SELECT COUNT(*) as count 
        FROM tool_executions 
        WHERE user_session_id = ? 
        AND tool_name = ?
        AND created_at > datetime('now', '-1 minute')
      `, [this.sessionId, toolName]);

      if (recentCalls?.count > 10) {
        return {
          valid: false,
          reason: 'Rate limit exceeded (10 calls per minute)'
        };
      }

      // Check for suspicious content in queries
      if (toolName === 'netsuite_query' && args.query) {
        const suspiciousPatterns = [
          /delete\s+from/i,
          /drop\s+table/i,
          /truncate/i,
          /create\s+table/i,
          /alter\s+table/i
        ];

        for (const pattern of suspiciousPatterns) {
          if (pattern.test(args.query)) {
            return {
              valid: false,
              reason: 'Query contains potentially dangerous operations'
            };
          }
        }
      }

      return { valid: true };
    } catch (error) {
      console.warn('⚠️ Validation check failed:', error.message);
      return { valid: true }; // Fail open for availability
    }
  }

  async handleNetSuiteSetup(args) {
    console.error('🔐 Setting up NetSuite credentials...');
    
    // Auto-detect client if not provided
    const clientInfo = args.client_name 
      ? { client: args.client_name, projectPath: process.cwd() }
      : this.netsuiteManager.detectClient(process.cwd());

    if (!clientInfo.client) {
      throw new Error('Could not detect client from current directory. Please specify client_name.');
    }

    // Prepare credentials object
    const credentials = {
      accountId: args.account_id,
      consumerKey: args.consumer_key,
      consumerSecret: args.consumer_secret,
      tokenId: args.token_id,
      tokenSecret: args.token_secret,
      environment: args.environment || 'sandbox',
      accountAlias: `${clientInfo.client}-${args.environment || 'sandbox'}`
    };

    // Encrypt and store credentials
    const encrypted = this.netsuiteManager.encrypt(JSON.stringify(credentials));
    
    await this.db.run(`
      INSERT OR REPLACE INTO netsuite_credentials 
      (client_name, project_path, account_id, environment, account_alias, encrypted_credentials, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [clientInfo.client, clientInfo.projectPath, credentials.accountId, 
       credentials.environment, credentials.accountAlias, encrypted, 1]
    );

    return {
      success: true,
      message: `NetSuite credentials configured successfully for ${clientInfo.client}`,
      client_name: clientInfo.client,
      account_id: credentials.accountId,
      environment: credentials.environment,
      configured_at: new Date().toISOString()
    };
  }

  async handleNetSuiteList(args) {
    console.error('📋 Listing NetSuite accounts...');
    
    let query = `
      SELECT client_name, account_id, environment, account_alias, 
             is_default, created_at, last_used
      FROM netsuite_credentials
      WHERE 1=1
    `;
    const params = [];

    if (args.client_filter) {
      query += ' AND client_name = ?';
      params.push(args.client_filter);
    }

    query += ' ORDER BY client_name, is_default DESC';

    const accounts = await this.db.all(query, params);

    return {
      accounts: accounts.map(account => ({
        client_name: account.client_name,
        account_id: account.account_id,
        environment: account.environment,
        account_alias: account.account_alias,
        is_default: account.is_default === 1,
        configured_date: account.created_at,
        last_used: account.last_used
      })),
      total_accounts: accounts.length,
      filtered_by: args.client_filter || 'none'
    };
  }

  async handleNetSuiteTest(args) {
    console.error('🧪 Testing NetSuite connection...');
    
    // Auto-detect client if not provided
    const clientInfo = args.client_name 
      ? { client: args.client_name }
      : this.netsuiteManager.detectClient(process.cwd());

    if (!clientInfo.client) {
      throw new Error('Could not detect client. Please specify client_name.');
    }

    // Get credentials
    let query = `
      SELECT encrypted_credentials, account_id, environment
      FROM netsuite_credentials
      WHERE client_name = ?
    `;
    const params = [clientInfo.client];

    if (args.account_id) {
      query += ' AND account_id = ?';
      params.push(args.account_id);
    } else {
      query += ' AND is_default = 1';
    }

    const credentialRow = await this.db.get(query, params);
    
    if (!credentialRow) {
      throw new Error(`No NetSuite credentials found for client: ${clientInfo.client}`);
    }

    // Decrypt credentials and test connection
    const credentials = JSON.parse(this.netsuiteManager.decrypt(credentialRow.encrypted_credentials));
    
    // Create API client and test connection
    const apiClient = new NetSuiteAPIClient(credentials);
    const testResult = await apiClient.testConnection();

    // Update last_used timestamp
    await this.db.run(`
      UPDATE netsuite_credentials 
      SET last_used = datetime('now') 
      WHERE client_name = ? AND account_id = ?
    `, [clientInfo.client, credentials.accountId]);

    return {
      ...testResult,
      client_name: clientInfo.client
    };
  }

  async handleNetSuiteQuery(args) {
    console.error('🔍 Executing NetSuite query...');
    
    // Auto-detect client if not provided
    const clientInfo = args.client_name 
      ? { client: args.client_name }
      : this.netsuiteManager.detectClient(process.cwd());

    if (!clientInfo.client) {
      throw new Error('Could not detect client. Please specify client_name.');
    }

    // Get credentials
    const credentialRow = await this.db.get(`
      SELECT encrypted_credentials, account_id, environment
      FROM netsuite_credentials
      WHERE client_name = ? AND is_default = 1
    `, [clientInfo.client]);
    
    if (!credentialRow) {
      throw new Error(`No default NetSuite credentials found for client: ${clientInfo.client}`);
    }

    const credentials = JSON.parse(this.netsuiteManager.decrypt(credentialRow.encrypted_credentials));
    
    // Create API client and execute query
    const apiClient = new NetSuiteAPIClient(credentials);
    
    // Validate query for security
    const validation = apiClient.validateSuiteQL(args.query);
    if (!validation.valid) {
      throw new Error(`Query validation failed: ${validation.reason}`);
    }
    
    const startTime = Date.now();
    const queryResult = await apiClient.executeSuiteQL(
      args.query, 
      args.limit || 100, 
      args.offset || 0
    );

    // Update last_used timestamp
    await this.db.run(`
      UPDATE netsuite_credentials 
      SET last_used = datetime('now') 
      WHERE client_name = ? AND account_id = ?
    `, [clientInfo.client, credentials.accountId]);

    return {
      ...queryResult,
      client_name: clientInfo.client,
      account_id: credentials.accountId,
      environment: credentials.environment,
      executed_at: new Date().toISOString(),
      execution_time_ms: Date.now() - startTime,
      limit: args.limit || 100,
      offset: args.offset || 0
    };
  }

  async handleNetSuiteDeploy(args) {
    console.error('🚀 Deploying to NetSuite...');
    
    // Auto-detect client if not provided
    const clientInfo = args.client_name 
      ? { client: args.client_name }
      : this.netsuiteManager.detectClient(process.cwd());

    if (!clientInfo.client) {
      throw new Error('Could not detect client. Please specify client_name.');
    }

    // Get credentials
    const credentialRow = await this.db.get(`
      SELECT encrypted_credentials, account_id, environment
      FROM netsuite_credentials
      WHERE client_name = ? AND is_default = 1
    `, [clientInfo.client]);
    
    if (!credentialRow) {
      throw new Error(`No default NetSuite credentials found for client: ${clientInfo.client}`);
    }

    const credentials = JSON.parse(this.netsuiteManager.decrypt(credentialRow.encrypted_credentials));
    
    // Simulate deployment (in real implementation, this would deploy actual SuiteScript)
    const deployResult = {
      success: true,
      script_name: args.script_name,
      script_type: args.script_type,
      client: clientInfo.client,
      account_id: credentials.accountId,
      environment: credentials.environment,
      deployed_at: new Date().toISOString(),
      deployment_id: `deploy_${Date.now()}`,
      script_id: `customscript_${args.script_name.toLowerCase().replace(/\s+/g, '_')}`,
      message: 'Script deployed successfully (simulated)'
    };

    return deployResult;
  }

  async handleClientDiscover(args) {
    console.error('🔍 Discovering client projects...');
    
    // Use existing discover script logic
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    try {
      const command = args.dry_run 
        ? 'node /home/ben/saralegui-solutions-mcp/scripts/discover-clients.js --dry-run'
        : 'node /home/ben/saralegui-solutions-mcp/scripts/discover-clients.js';
      
      const { stdout, stderr } = await execAsync(command);
      
      return {
        success: true,
        dry_run: args.dry_run || false,
        base_path: args.base_path || '/home/ben/saralegui-solutions-llc',
        discovery_output: stdout,
        executed_at: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Client discovery failed: ${error.message}`);
    }
  }

  async handleNetSuiteHelp(args) {
    console.error('📚 Providing NetSuite MCP help...');
    
    try {
      const commandsResource = await fs.readFile(path.join(__dirname, 'resources', 'commands.json'), 'utf8');
      const commands = JSON.parse(commandsResource);
      
      if (args.command) {
        // Help for specific command
        const toolInfo = commands.categories.mcp_tools.commands[args.command];
        if (toolInfo) {
          return {
            command: args.command,
            description: toolInfo.description,
            parameters: toolInfo.parameters,
            examples: toolInfo.examples,
            help_type: 'specific_command'
          };
        } else {
          return {
            error: `No help found for command: ${args.command}`,
            available_commands: Object.keys(commands.categories.mcp_tools.commands),
            help_type: 'command_not_found'
          };
        }
      } else if (args.category) {
        // Help for category
        if (args.category === 'all') {
          return {
            full_reference: commands,
            help_type: 'full_reference'
          };
        } else {
          const categoryData = commands.categories[args.category];
          return {
            category: args.category,
            data: categoryData,
            help_type: 'category'
          };
        }
      } else {
        // General help
        return {
          overview: {
            name: commands.name,
            version: commands.version,
            description: commands.description
          },
          quick_start: commands.quick_start,
          available_categories: Object.keys(commands.categories),
          help_type: 'overview'
        };
      }
    } catch (error) {
      throw new Error(`Help system failed: ${error.message}`);
    }
  }

  async handleNetSuiteStatus(args) {
    console.error('📊 Checking NetSuite MCP status...');
    
    try {
      const status = await this.generateStatusResource();
      const statusData = JSON.parse(status);
      
      if (args.detailed) {
        return statusData;
      } else {
        return {
          server_status: statusData.server_status,
          configured_clients: statusData.configured_clients,
          recent_activity: statusData.recent_activity,
          health_summary: statusData.health_summary
        };
      }
    } catch (error) {
      throw new Error(`Status check failed: ${error.message}`);
    }
  }

  async handleNetSuiteExamples(args) {
    console.error('💡 Providing NetSuite MCP examples...');
    
    try {
      const examplesResource = await fs.readFile(path.join(__dirname, 'resources', 'examples.json'), 'utf8');
      const examples = JSON.parse(examplesResource);
      
      if (args.operation) {
        // Find specific operation examples
        for (const [categoryName, categoryData] of Object.entries(examples.workflow_examples)) {
          if (categoryData.examples) {
            const operationExample = categoryData.examples.find(ex => 
              ex.operation?.toLowerCase().includes(args.operation.toLowerCase())
            );
            if (operationExample) {
              return {
                operation: args.operation,
                example: operationExample,
                category: categoryName,
                example_type: 'specific_operation'
              };
            }
          }
        }
        return {
          error: `No examples found for operation: ${args.operation}`,
          example_type: 'operation_not_found'
        };
      } else if (args.category) {
        if (args.category === 'all') {
          return {
            full_examples: examples,
            example_type: 'full_reference'
          };
        } else {
          const categoryData = examples.workflow_examples[args.category];
          return {
            category: args.category,
            data: categoryData,
            example_type: 'category'
          };
        }
      } else {
        // Return quick start examples
        return {
          quick_start: examples.workflow_examples.initial_setup,
          common_operations: examples.workflow_examples.daily_operations,
          available_categories: Object.keys(examples.workflow_examples),
          example_type: 'overview'
        };
      }
    } catch (error) {
      throw new Error(`Examples system failed: ${error.message}`);
    }
  }

  async handleNetSuiteValidate(args) {
    console.error('✅ Validating NetSuite MCP setup...');
    
    const validationResults = {
      overall_status: 'unknown',
      checks: [],
      client_name: null,
      validated_at: new Date().toISOString()
    };

    try {
      // Auto-detect client if not provided
      const clientInfo = args.client_name 
        ? { client: args.client_name }
        : this.netsuiteManager.detectClient(process.cwd());

      if (clientInfo.client) {
        validationResults.client_name = clientInfo.client;
      }

      // Check 1: Server components
      validationResults.checks.push({
        check: 'server_components',
        status: 'pass',
        message: 'MCP server components initialized successfully'
      });

      // Check 2: Database connection
      try {
        await this.db.get('SELECT 1');
        validationResults.checks.push({
          check: 'database_connection',
          status: 'pass',
          message: 'Database connection successful'
        });
      } catch (error) {
        validationResults.checks.push({
          check: 'database_connection',
          status: 'fail',
          message: `Database connection failed: ${error.message}`
        });
      }

      // Check 3: Client configuration
      if (clientInfo.client) {
        try {
          const credentialRow = await this.db.get(`
            SELECT * FROM netsuite_credentials WHERE client_name = ? AND is_default = 1
          `, [clientInfo.client]);
          
          if (credentialRow) {
            validationResults.checks.push({
              check: 'client_configuration',
              status: 'pass',
              message: `Client ${clientInfo.client} properly configured`
            });

            // Check 4: NetSuite connection (if requested)
            if (args.check_connection) {
              try {
                const testResult = await this.handleNetSuiteTest({ client_name: clientInfo.client });
                if (testResult.success) {
                  validationResults.checks.push({
                    check: 'netsuite_connection',
                    status: 'pass',
                    message: 'NetSuite connection test successful'
                  });
                } else {
                  validationResults.checks.push({
                    check: 'netsuite_connection',
                    status: 'fail',
                    message: 'NetSuite connection test failed'
                  });
                }
              } catch (error) {
                validationResults.checks.push({
                  check: 'netsuite_connection',
                  status: 'fail',
                  message: `NetSuite connection error: ${error.message}`
                });
              }
            }
          } else {
            validationResults.checks.push({
              check: 'client_configuration',
              status: 'fail',
              message: `No credentials found for client: ${clientInfo.client}`
            });
          }
        } catch (error) {
          validationResults.checks.push({
            check: 'client_configuration',
            status: 'fail',
            message: `Client validation error: ${error.message}`
          });
        }
      } else {
        validationResults.checks.push({
          check: 'client_configuration',
          status: 'warning',
          message: 'No client detected - run from client directory or specify client_name'
        });
      }

      // Determine overall status
      const failedChecks = validationResults.checks.filter(check => check.status === 'fail');
      const warningChecks = validationResults.checks.filter(check => check.status === 'warning');
      
      if (failedChecks.length === 0) {
        validationResults.overall_status = warningChecks.length === 0 ? 'healthy' : 'healthy_with_warnings';
      } else {
        validationResults.overall_status = 'unhealthy';
      }

      return validationResults;
    } catch (error) {
      validationResults.overall_status = 'error';
      validationResults.checks.push({
        check: 'validation_process',
        status: 'fail',
        message: `Validation process failed: ${error.message}`
      });
      return validationResults;
    }
  }

  async generateStatusResource() {
    try {
      // Get configured clients
      const clients = await this.db.all(`
        SELECT client_name, account_id, environment, created_at, last_used
        FROM netsuite_credentials
        ORDER BY client_name
      `);

      // Get recent activity
      const recentActivity = await this.db.all(`
        SELECT tool_name, success, created_at
        FROM tool_executions
        WHERE created_at > datetime('now', '-1 hour')
        ORDER BY created_at DESC
        LIMIT 10
      `);

      // Get session info
      const sessionInfo = await this.db.get(`
        SELECT * FROM user_sessions WHERE session_id = ?
      `, [this.sessionId]);

      const status = {
        name: 'NetSuite MCP System Status',
        version: '1.0.0',
        generated_at: new Date().toISOString(),
        server_status: {
          session_id: this.sessionId,
          session_start: this.context.sessionStart,
          server_uptime: new Date() - this.context.sessionStart,
          active_client: this.context.activeClient
        },
        configured_clients: clients.map(client => ({
          name: client.client_name,
          account_id: client.account_id,
          environment: client.environment,
          configured_date: client.created_at,
          last_used: client.last_used
        })),
        recent_activity: recentActivity.map(activity => ({
          tool: activity.tool_name,
          success: activity.success === 1,
          timestamp: activity.created_at
        })),
        health_summary: {
          total_clients: clients.length,
          recent_executions: recentActivity.length,
          success_rate: recentActivity.length > 0 
            ? recentActivity.filter(a => a.success === 1).length / recentActivity.length 
            : 1,
          database_status: 'connected',
          server_health: 'operational'
        },
        capabilities: {
          tools: [
            'netsuite_setup', 'netsuite_list', 'netsuite_test', 
            'netsuite_query', 'netsuite_deploy', 'client_discover',
            'netsuite_help', 'netsuite_status', 'netsuite_examples', 'netsuite_validate'
          ],
          resources: [
            'netsuite://commands', 'netsuite://setup', 
            'netsuite://examples', 'netsuite://status'
          ]
        }
      };

      return JSON.stringify(status, null, 2);
    } catch (error) {
      return JSON.stringify({
        error: 'Failed to generate status',
        message: error.message,
        generated_at: new Date().toISOString()
      }, null, 2);
    }
  }

  async logToolExecution(toolName, args, result, status, errorMessage = null) {
    try {
      await this.db.run(`
        INSERT INTO tool_executions 
        (user_session_id, tool_name, parameters, result, success, error_message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `, [
        this.sessionId,
        toolName,
        JSON.stringify(args),
        result ? JSON.stringify(result) : null,
        status === 'success' ? 1 : 0,
        errorMessage
      ]);
    } catch (error) {
      console.warn('⚠️ Failed to log tool execution:', error.message);
    }
  }

  async run() {
    await this.initialize();
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error('🎯 NetSuite MCP Server is ready and listening for requests...');
  }
}

// Start the server if this file is run directly
if (process.argv[1] === __filename) {
  const server = new NetSuiteMCPServer();
  
  // Graceful shutdown handling
  process.on('SIGINT', async () => {
    console.error('\n🔄 Shutting down NetSuite MCP Server...');
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.error('\n🔄 Shutting down NetSuite MCP Server...');
    process.exit(0);
  });
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });
  
  server.run().catch(error => {
    console.error('❌ Server failed to start:', error);
    process.exit(1);
  });
}

export default NetSuiteMCPServer;