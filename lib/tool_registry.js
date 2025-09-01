/**
 * Tool Registry for Saralegui MCP Server
 * Manages built-in and dynamically generated tools
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import vm from 'vm';
import chalk from 'chalk';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class ToolRegistry {
  constructor(database) {
    this.db = database;
    this.tools = new Map();
    this.builtInTools = new Map();
    this.generatedTools = new Map();
    this.toolsDir = join(dirname(__dirname), 'tools');
    this.tempToolsDir = join(dirname(__dirname), 'temp', 'generated-tools');
    
    // Tool categories
    this.categories = {
      builtin: 'Built-in Tools',
      generated: 'Auto-generated Tools', 
      custom: 'Custom Tools',
      netsuite: 'NetSuite Tools',
      file: 'File System Tools',
      code: 'Code Generation Tools'
    };
  }

  /**
   * Initialize the tool registry
   */
  async initialize() {
    console.error('🔧 Initializing Tool Registry...');
    
    try {
      // Ensure tools directory exists
      await fs.mkdir(this.toolsDir, { recursive: true });
      await fs.mkdir(this.tempToolsDir, { recursive: true });
      
      // Load built-in tools
      await this.loadBuiltInTools();
      
      // Load generated tools from database
      await this.loadGeneratedTools();
      
      console.error(`✅ Tool Registry initialized: ${this.tools.size} tools loaded`);
    } catch (error) {
      console.error('❌ Tool Registry initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Load built-in tools from files
   */
  async loadBuiltInTools() {
    // Define built-in tools inline for now
    const builtInToolDefinitions = [
      {
        name: 'echo',
        description: 'Echo back the input text',
        category: 'builtin',
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Text to echo back'
            }
          },
          required: ['text']
        },
        handler: async (params) => {
          return {
            success: true,
            result: `Echo: ${params.text}`,
            timestamp: new Date().toISOString()
          };
        }
      },
      {
        name: 'get_current_time',
        description: 'Get the current date and time',
        category: 'builtin',
        parameters: {
          type: 'object',
          properties: {
            format: {
              type: 'string',
              description: 'Time format (iso, locale, unix)',
              enum: ['iso', 'locale', 'unix'],
              default: 'iso'
            }
          }
        },
        handler: async (params) => {
          const now = new Date();
          let result;
          
          switch (params.format) {
            case 'locale':
              result = now.toLocaleString();
              break;
            case 'unix':
              result = Math.floor(now.getTime() / 1000);
              break;
            case 'iso':
            default:
              result = now.toISOString();
              break;
          }
          
          return {
            success: true,
            result,
            timestamp: now.toISOString()
          };
        }
      },
      {
        name: 'generate_id',
        description: 'Generate a unique ID',
        category: 'builtin',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'ID type (uuid, short, timestamp)',
              enum: ['uuid', 'short', 'timestamp'],
              default: 'short'
            },
            prefix: {
              type: 'string',
              description: 'Optional prefix for the ID'
            }
          }
        },
        handler: async (params) => {
          let id;
          const prefix = params.prefix || '';
          
          switch (params.type) {
            case 'uuid':
              // Simple UUID v4 implementation
              id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
              });
              break;
            case 'timestamp':
              id = Date.now().toString();
              break;
            case 'short':
            default:
              id = Math.random().toString(36).substr(2, 9);
              break;
          }
          
          return {
            success: true,
            result: prefix + id,
            type: params.type,
            timestamp: new Date().toISOString()
          };
        }
      },
      {
        name: 'system_info',
        description: 'Get system information',
        category: 'builtin',
        parameters: {
          type: 'object',
          properties: {}
        },
        handler: async (params) => {
          const os = await import('os');
          
          return {
            success: true,
            result: {
              platform: os.platform(),
              arch: os.arch(),
              cpus: os.cpus().length,
              totalMemory: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
              freeMemory: `${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
              uptime: `${(os.uptime() / 3600).toFixed(2)} hours`,
              nodeVersion: process.version
            },
            timestamp: new Date().toISOString()
          };
        }
      },
      {
        name: 'list_patterns',
        description: 'List detected patterns from the learning engine',
        category: 'builtin',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of patterns to return',
              default: 10
            },
            type: {
              type: 'string',
              description: 'Pattern type filter',
              enum: ['sequence', 'parameter', 'all'],
              default: 'all'
            }
          }
        },
        handler: async (params, context) => {
          try {
            let whereClause = '';
            let queryParams = [];
            
            if (params.type && params.type !== 'all') {
              whereClause = 'WHERE pattern_type = ?';
              queryParams.push(params.type);
            }
            
            queryParams.push(params.limit || 10);
            
            const patterns = await context.db.all(`
              SELECT 
                pattern_signature,
                pattern_type,
                occurrences,
                confidence_score,
                tool_id,
                auto_created,
                created_at
              FROM learned_patterns
              ${whereClause}
              ORDER BY occurrences DESC, confidence_score DESC
              LIMIT ?
            `, queryParams);
            
            return {
              success: true,
              result: {
                patterns,
                total: patterns.length,
                filter: params.type || 'all'
              },
              timestamp: new Date().toISOString()
            };
          } catch (error) {
            return {
              success: false,
              error: error.message,
              timestamp: new Date().toISOString()
            };
          }
        }
      },
      {
        name: 'get_tool_usage',
        description: 'Get tool usage statistics',
        category: 'builtin',
        parameters: {
          type: 'object',
          properties: {
            hours: {
              type: 'number',
              description: 'Number of hours to look back',
              default: 24
            }
          }
        },
        handler: async (params, context) => {
          try {
            const since = new Date(Date.now() - (params.hours || 24) * 60 * 60 * 1000).toISOString();
            
            const usage = await context.db.all(`
              SELECT 
                tool_name,
                COUNT(*) as total_executions,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_executions,
                AVG(execution_time_ms) as avg_execution_time,
                MAX(created_at) as last_used
              FROM tool_executions
              WHERE created_at > ?
              GROUP BY tool_name
              ORDER BY total_executions DESC
            `, [since]);
            
            return {
              success: true,
              result: {
                usage,
                period: `${params.hours || 24} hours`,
                total_tools: usage.length,
                total_executions: usage.reduce((sum, tool) => sum + tool.total_executions, 0)
              },
              timestamp: new Date().toISOString()
            };
          } catch (error) {
            return {
              success: false,
              error: error.message,
              timestamp: new Date().toISOString()
            };
          }
        }
      },
      // ========== ENHANCED LEARNING TOOLS ==========
      {
        name: 'get_learning_insights',
        description: 'Get comprehensive learning insights and recommendations',
        category: 'builtin',
        parameters: {
          type: 'object',
          properties: {
            session_id: {
              type: 'string',
              description: 'Session ID to analyze (optional)'
            },
            hours: {
              type: 'number',
              description: 'Hours to look back for analysis',
              default: 24
            },
            include_recommendations: {
              type: 'boolean',
              description: 'Include optimization recommendations',
              default: true
            }
          }
        },
        handler: async (params, context) => {
          try {
            const insights = await context.learningEngine.getLearningInsights(
              params.session_id || context.sessionId,
              params.hours || 24
            );
            
            return {
              success: true,
              result: insights,
              timestamp: new Date().toISOString()
            };
          } catch (error) {
            return {
              success: false,
              error: error.message,
              timestamp: new Date().toISOString()
            };
          }
        }
      },
      {
        name: 'analyze_workflow_optimization',
        description: 'Analyze workflow patterns for optimization opportunities',
        category: 'builtin',
        parameters: {
          type: 'object',
          properties: {
            session_id: {
              type: 'string',
              description: 'Session ID to analyze'
            },
            hours: {
              type: 'number',
              description: 'Hours to look back',
              default: 24
            }
          }
        },
        handler: async (params, context) => {
          try {
            const optimizations = await context.learningEngine.analyzeWorkflowOptimization(
              params.session_id || context.sessionId,
              params.hours || 24
            );
            
            return {
              success: true,
              result: {
                optimizations,
                total_found: optimizations.length,
                potential_time_savings: optimizations.reduce((sum, opt) => sum + (opt.potential_savings || 0), 0)
              },
              timestamp: new Date().toISOString()
            };
          } catch (error) {
            return {
              success: false,
              error: error.message,
              timestamp: new Date().toISOString()
            };
          }
        }
      },
      {
        name: 'predict_tool_errors',
        description: 'Predict potential errors for a tool execution',
        category: 'builtin',
        parameters: {
          type: 'object',
          properties: {
            tool_name: {
              type: 'string',
              description: 'Name of the tool to analyze',
              required: true
            },
            parameters: {
              type: 'object',
              description: 'Parameters that would be passed to the tool',
              required: true
            },
            context: {
              type: 'object',
              description: 'Additional context for prediction'
            }
          },
          required: ['tool_name', 'parameters']
        },
        handler: async (params, context) => {
          try {
            const prediction = await context.learningEngine.predictPotentialErrors(
              params.tool_name,
              params.parameters,
              params.context || {}
            );
            
            return {
              success: true,
              result: prediction,
              tool_analyzed: params.tool_name,
              timestamp: new Date().toISOString()
            };
          } catch (error) {
            return {
              success: false,
              error: error.message,
              timestamp: new Date().toISOString()
            };
          }
        }
      },
      {
        name: 'learn_from_query',
        description: 'Learn from a natural language query and response',
        category: 'builtin',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The natural language query',
              required: true
            },
            response: {
              type: 'string',
              description: 'The response that was given',
              required: true
            },
            success: {
              type: 'boolean',
              description: 'Whether the response was successful',
              default: true
            },
            context: {
              type: 'object',
              description: 'Additional context about the interaction'
            }
          },
          required: ['query', 'response']
        },
        handler: async (params, context) => {
          try {
            const learning = await context.learningEngine.learnFromQuery(
              params.query,
              params.response,
              params.success !== false,
              params.context || {}
            );
            
            return {
              success: true,
              result: learning || { learned: false, reason: 'Query learning disabled' },
              timestamp: new Date().toISOString()
            };
          } catch (error) {
            return {
              success: false,
              error: error.message,
              timestamp: new Date().toISOString()
            };
          }
        }
      },
      {
        name: 'enable_cross_project_learning',
        description: 'Enable cross-project learning and promote common patterns',
        category: 'builtin',
        parameters: {
          type: 'object',
          properties: {}
        },
        handler: async (params, context) => {
          try {
            const result = await context.learningEngine.enableCrossProjectLearning();
            
            return {
              success: result.success || false,
              result: result,
              timestamp: new Date().toISOString()
            };
          } catch (error) {
            return {
              success: false,
              error: error.message,
              timestamp: new Date().toISOString()
            };
          }
        }
      },
      {
        name: 'get_learning_dashboard',
        description: 'Get learning dashboard data and metrics',
        category: 'builtin',
        parameters: {
          type: 'object',
          properties: {
            timeframe: {
              type: 'string',
              description: 'Timeframe for analysis',
              enum: ['1h', '24h', '7d', '30d'],
              default: '24h'
            }
          }
        },
        handler: async (params, context) => {
          try {
            const timeframes = {
              '1h': 1,
              '24h': 24,
              '7d': 24 * 7,
              '30d': 24 * 30
            };
            
            const hours = timeframes[params.timeframe] || 24;
            
            // Get dashboard data
            const dashboard = await context.db.all(`
              SELECT * FROM learning_dashboard
            `);
            
            // Get recent activity
            const recentActivity = await context.db.all(`
              SELECT 
                'pattern_detection' as activity_type,
                created_at as timestamp,
                pattern_type as details
              FROM learned_patterns
              WHERE created_at > datetime('now', '-${hours} hours')
              UNION ALL
              SELECT 
                'tool_generation' as activity_type,
                created_at as timestamp,
                tool_name as details
              FROM generated_tools
              WHERE created_at > datetime('now', '-${hours} hours') AND is_active = 1
              ORDER BY timestamp DESC
              LIMIT 10
            `);
            
            return {
              success: true,
              result: {
                dashboard_metrics: dashboard,
                recent_activity: recentActivity,
                timeframe: params.timeframe,
                total_metrics: dashboard.length
              },
              timestamp: new Date().toISOString()
            };
          } catch (error) {
            return {
              success: false,
              error: error.message,
              timestamp: new Date().toISOString()
            };
          }
        }
      }
    ];

    // Register built-in tools
    for (const toolDef of builtInToolDefinitions) {
      this.registerTool(toolDef);
      this.builtInTools.set(toolDef.name, toolDef);
    }

    console.error(`✅ Loaded ${builtInToolDefinitions.length} built-in tools`);
  }

  /**
   * Load generated tools from database
   */
  async loadGeneratedTools() {
    try {
      const generatedTools = await this.db.all(`
        SELECT 
          tool_name,
          tool_category,
          code_content,
          config,
          created_at
        FROM generated_tools
        WHERE is_active = 1
        ORDER BY created_at DESC
      `);

      let loadedCount = 0;
      
      for (const toolData of generatedTools) {
        try {
          const tool = await this.loadGeneratedTool(toolData);
          if (tool) {
            this.registerTool(tool);
            this.generatedTools.set(tool.name, tool);
            loadedCount++;
          }
        } catch (error) {
          console.warn(`⚠️  Failed to load generated tool ${toolData.tool_name}:`, error.message);
        }
      }

      if (loadedCount > 0) {
        console.error(`✅ Loaded ${loadedCount} generated tools`);
      }
    } catch (error) {
      console.warn('⚠️  Could not load generated tools:', error.message);
    }
  }

  /**
   * Load a single generated tool from database
   */
  async loadGeneratedTool(toolData) {
    try {
      // Parse tool configuration
      let config = {};
      try {
        config = JSON.parse(toolData.config || '{}');
      } catch (error) {
        console.warn(`Failed to parse config for tool ${toolData.tool_name}`);
      }

      // Create a safe execution context for the tool
      const toolContext = vm.createContext({
        console: {
          log: (...args) => console.log(`[${toolData.tool_name}]`, ...args),
          error: (...args) => console.error(`[${toolData.tool_name}]`, ...args),
          warn: (...args) => console.warn(`[${toolData.tool_name}]`, ...args)
        },
        setTimeout,
        setInterval,
        clearTimeout,
        clearInterval,
        Date,
        Math,
        JSON,
        Promise,
        // Add common utilities
        fetch: (await import('node-fetch')).default
      });

      // Execute the tool code in the safe context
      const script = new vm.Script(toolData.code_content);
      script.runInContext(toolContext);

      // Extract the function from context
      const functionName = this.extractFunctionName(toolData.code_content);
      const toolFunction = toolContext[functionName];

      if (!toolFunction || typeof toolFunction !== 'function') {
        throw new Error(`Tool function ${functionName} not found or not a function`);
      }

      // Create tool definition
      const tool = {
        name: toolData.tool_name,
        description: config.description || `Auto-generated tool: ${toolData.tool_name}`,
        category: toolData.tool_category || 'generated',
        parameters: config.parameters || {
          type: 'object',
          properties: {},
          additionalProperties: true
        },
        generated: true,
        sourcePattern: config.sourcePattern,
        createdAt: toolData.created_at,
        handler: toolFunction
      };

      return tool;
    } catch (error) {
      console.error(`Failed to load generated tool ${toolData.tool_name}:`, error.message);
      return null;
    }
  }

  /**
   * Extract function name from generated code
   */
  extractFunctionName(code) {
    // Look for export function pattern
    const exportMatch = code.match(/export\s+(?:async\s+)?function\s+(\w+)/);
    if (exportMatch) {
      return exportMatch[1];
    }

    // Look for function declaration
    const funcMatch = code.match(/(?:async\s+)?function\s+(\w+)/);
    if (funcMatch) {
      return funcMatch[1];
    }

    // Default function name
    return 'main';
  }

  /**
   * Register a tool in the registry
   */
  registerTool(toolDefinition) {
    if (!toolDefinition.name) {
      throw new Error('Tool must have a name');
    }

    if (!toolDefinition.handler || typeof toolDefinition.handler !== 'function') {
      throw new Error('Tool must have a handler function');
    }

    // Validate MCP tool format
    const mcpTool = {
      name: toolDefinition.name,
      description: toolDefinition.description || 'No description provided',
      inputSchema: toolDefinition.parameters || {
        type: 'object',
        properties: {},
        additionalProperties: true
      }
    };

    // Store both MCP format and full definition
    this.tools.set(toolDefinition.name, {
      mcpDefinition: mcpTool,
      fullDefinition: toolDefinition
    });
  }

  /**
   * Execute a tool by name
   */
  async executeTool(toolName, parameters = {}, context = {}) {
    const tool = this.tools.get(toolName);
    
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found`);
    }

    const { fullDefinition } = tool;
    
    try {
      console.error(`🔧 Executing tool: ${toolName}`);
      
      // Prepare execution context
      const execContext = {
        ...context,
        db: this.db,
        toolName,
        parameters
      };

      // Call the tool handler
      const startTime = Date.now();
      const result = await fullDefinition.handler(parameters, execContext);
      const executionTime = Date.now() - startTime;

      // Ensure result format
      if (result && typeof result === 'object' && 'success' in result) {
        return {
          ...result,
          tool: toolName,
          executionTime
        };
      } else {
        // Wrap raw results
        return {
          success: true,
          result,
          tool: toolName,
          executionTime,
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      console.error(`❌ Tool execution failed: ${toolName}`, error.message);
      
      return {
        success: false,
        error: error.message,
        tool: toolName,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * List all available tools in MCP format
   */
  listTools() {
    return Array.from(this.tools.values()).map(tool => tool.mcpDefinition);
  }

  /**
   * Get detailed tool information
   */
  getToolInfo(toolName) {
    const tool = this.tools.get(toolName);
    
    if (!tool) {
      return null;
    }

    const { fullDefinition, mcpDefinition } = tool;
    
    return {
      ...mcpDefinition,
      category: fullDefinition.category,
      generated: fullDefinition.generated || false,
      createdAt: fullDefinition.createdAt,
      sourcePattern: fullDefinition.sourcePattern
    };
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category) {
    return Array.from(this.tools.values())
      .filter(tool => tool.fullDefinition.category === category)
      .map(tool => tool.mcpDefinition);
  }

  /**
   * Remove a tool from the registry
   */
  removeTool(toolName) {
    const removed = this.tools.delete(toolName);
    
    if (removed) {
      this.builtInTools.delete(toolName);
      this.generatedTools.delete(toolName);
      console.error(`🗑️  Tool removed: ${toolName}`);
    }
    
    return removed;
  }

  /**
   * Reload generated tools from database
   */
  async reloadGeneratedTools() {
    // Clear existing generated tools
    for (const [toolName, tool] of this.tools.entries()) {
      if (tool.fullDefinition.generated) {
        this.tools.delete(toolName);
        this.generatedTools.delete(toolName);
      }
    }

    // Reload from database
    await this.loadGeneratedTools();
    
    console.error('🔄 Generated tools reloaded');
  }

  /**
   * Get registry statistics
   */
  getStats() {
    const tools = Array.from(this.tools.values());
    const categories = {};
    
    for (const tool of tools) {
      const category = tool.fullDefinition.category || 'uncategorized';
      categories[category] = (categories[category] || 0) + 1;
    }

    return {
      totalTools: this.tools.size,
      builtInTools: this.builtInTools.size,
      generatedTools: this.generatedTools.size,
      categories,
      categoryNames: this.categories
    };
  }

  /**
   * Validate tool definition
   */
  validateTool(toolDefinition) {
    const errors = [];

    if (!toolDefinition.name) {
      errors.push('Tool must have a name');
    }

    if (!toolDefinition.description) {
      errors.push('Tool must have a description');
    }

    if (!toolDefinition.handler || typeof toolDefinition.handler !== 'function') {
      errors.push('Tool must have a handler function');
    }

    if (toolDefinition.parameters && toolDefinition.parameters.type !== 'object') {
      errors.push('Tool parameters must be an object schema');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get tool execution context
   */
  createExecutionContext(additionalContext = {}) {
    return {
      db: this.db,
      registry: this,
      ...additionalContext,
      
      // Utility functions
      execute: (toolName, params) => this.executeTool(toolName, params, additionalContext),
      listTools: () => this.listTools(),
      getToolInfo: (toolName) => this.getToolInfo(toolName)
    };
  }
}

export default ToolRegistry;