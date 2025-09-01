#!/usr/bin/env node

/**
 * Saralegui MCP Server with Learning Capabilities
 * Main server entry point for the Model Context Protocol server
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { LearningEngine } from './lib/learning_engine.js';
import { ToolRegistry } from './lib/tool_registry.js';
import { DatabaseManager } from './lib/database_manager.js';
import { SecurityManager } from './lib/security_manager.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import fs from 'fs/promises';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class SaraleguiMCPServer {
  constructor() {
    this.server = new Server({
      name: 'saralegui-solutions',
      version: '1.0.0'
    }, {
      capabilities: {
        tools: {},
        resources: {}
      }
    });
    
    // Initialize components
    this.db = new DatabaseManager();
    this.learningEngine = new LearningEngine(this.db);
    this.toolRegistry = new ToolRegistry(this.db);
    this.securityManager = new SecurityManager(this.db);
    
    // Initialize framework integration
    this.frameworkPath = '/home/ben/saralegui-solutions-llc/shared/MCPBestPracticesFramework';
    this.frameworkEnabled = true;
    
    this.sessionId = this.generateSessionId();
    this.context = {
      activeProject: null,
      recentActions: [],
      sessionStart: new Date()
    };
  }

  async initialize() {
    console.error('🚀 Initializing Saralegui MCP Server...');
    
    try {
      // Initialize database
      await this.db.initialize();
      
      // Initialize components
      await this.toolRegistry.initialize();
      await this.securityManager.initialize();
      
      // Set up handlers
      await this.setupHandlers();
      
      // Start session
      await this.db.createSession(this.sessionId, this.context);
      
      console.error('✅ Server initialized successfully');
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      throw error;
    }
  }

  async setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = await this.toolRegistry.listTools();
      return { tools };
    });

    // Execute tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      console.error(`📋 Executing tool: ${name}`);
      
      // Enhanced security validation for AI queries
      if (name === 'ai_query' || name === 'intelligent_query') {
        const queryValidation = await this.validateAIQuery(args);
        if (!queryValidation.valid) {
          throw new Error(`AI query validation failed: ${queryValidation.reason}`);
        }
      }
      
      // Standard security validation
      const securityCheck = await this.securityManager.validateToolExecution(
        this.sessionId, 
        name, 
        args
      );
      
      if (!securityCheck.allowed) {
        throw new Error(`Security validation failed: ${securityCheck.reasons.join(', ')}`);
      }
      
      // Track execution start
      const executionId = await this.learningEngine.startExecution(
        name, 
        args, 
        this.sessionId
      );
      
      // Track execution for security
      this.securityManager.trackExecutionStart(this.sessionId, executionId);
      
      const startTime = Date.now();
      let result;
      let success = false;
      
      try {
        // Execute tool via registry
        result = await this.toolRegistry.executeTool(name, args, {
          sessionId: this.sessionId,
          db: this.db,
          learningEngine: this.learningEngine
        });
        
        success = result.success !== false;
      } catch (error) {
        result = {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        };
      } finally {
        const executionTime = Date.now() - startTime;
        
        // Complete execution tracking
        await this.learningEngine.completeExecution(
          executionId, 
          result, 
          success, 
          executionTime
        );
        
        // Track execution end for security
        this.securityManager.trackExecutionEnd(this.sessionId, executionId);
        
        // Trigger pattern detection if enough executions
        this.triggerPatternDetection();
      }
      
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    });

    // List resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'knowledge://patterns',
            name: 'Learned Patterns',
            description: 'Detected patterns from tool usage',
            mimeType: 'application/json'
          },
          {
            uri: 'knowledge://tools', 
            name: 'Available Tools',
            description: 'All available tools and their metadata',
            mimeType: 'application/json'
          },
          {
            uri: 'knowledge://docs',
            name: 'Knowledge Base',
            description: 'Accumulated knowledge and documentation',
            mimeType: 'text/markdown'
          },
          {
            uri: 'knowledge://ai-capabilities',
            name: 'AI Learning Capabilities',
            description: 'Real-time learning engine statistics and capabilities',
            mimeType: 'application/json'
          },
          {
            uri: 'knowledge://text-interface',
            name: 'Text Interface Guide',
            description: 'AI-powered text interface usage and examples',
            mimeType: 'text/markdown'
          },
          {
            uri: 'knowledge://learning-stats',
            name: 'Learning Statistics',
            description: 'Live learning engine metrics and pattern data',
            mimeType: 'application/json'
          },
          {
            uri: 'framework://compliance',
            name: 'Framework Compliance',
            description: 'MCP Best Practices Framework compliance metrics and status',
            mimeType: 'application/json'
          },
          {
            uri: 'framework://patterns-config',
            name: 'Framework Patterns',
            description: 'Framework pattern definitions and enforcement rules',
            mimeType: 'application/json'
          },
          {
            uri: 'framework://monitoring',
            name: 'Framework Monitoring',
            description: 'Real-time framework monitoring dashboard',
            mimeType: 'application/json'
          },
          {
            uri: 'framework://templates',
            name: 'Action Templates',
            description: 'Best practices templates for common actions',
            mimeType: 'text/markdown'
          },
          {
            uri: 'framework://project-configs',
            name: 'Project Configurations',
            description: 'Project-specific framework configurations and status',
            mimeType: 'application/json'
          }
        ]
      };
    });

    // Read resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      
      if (uri === 'knowledge://patterns') {
        const patterns = await this.db.all(`
          SELECT pattern_signature, pattern_type, occurrences, confidence_score, created_at
          FROM learned_patterns
          ORDER BY occurrences DESC, confidence_score DESC
        `);
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(patterns, null, 2)
            }
          ]
        };
      }
      
      if (uri === 'knowledge://tools') {
        const tools = await this.toolRegistry.listTools();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(tools, null, 2)
            }
          ]
        };
      }
      
      if (uri === 'knowledge://docs') {
        const docs = await this.db.all(`
          SELECT title, content, created_at, tags
          FROM knowledge_entries
          ORDER BY created_at DESC
        `);
        const markdown = docs.map(doc => 
          `## ${doc.title}\n\n${doc.content}\n\n**Tags:** ${doc.tags || 'None'}\n**Created:** ${doc.created_at}\n\n---\n`
        ).join('\n');
        
        return {
          contents: [
            {
              uri,
              mimeType: 'text/markdown',
              text: markdown
            }
          ]
        };
      }
      
      if (uri === 'knowledge://ai-capabilities') {
        // Get real-time learning engine capabilities
        const patterns = await this.db.all('SELECT COUNT(*) as count FROM learned_patterns');
        const tools = await this.db.all('SELECT COUNT(*) as count FROM generated_tools WHERE is_active = 1');
        const executions = await this.db.all('SELECT COUNT(*) as count FROM tool_executions');
        
        const capabilities = {
          learning_engine: {
            status: "active",
            pattern_threshold: 2,
            auto_generation_threshold: 3,
            confidence_threshold: 0.6
          },
          statistics: {
            learned_patterns: patterns[0]?.count || 0,
            generated_tools: tools[0]?.count || 0,
            tool_executions: executions[0]?.count || 0
          },
          capabilities: [
            "Real-time pattern detection",
            "Automatic tool generation",
            "Knowledge base integration",
            "Contextual AI responses",
            "Workflow optimization suggestions"
          ],
          last_updated: new Date().toISOString()
        };
        
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(capabilities, null, 2)
            }
          ]
        };
      }
      
      if (uri === 'knowledge://text-interface') {
        const guide = `# AI-Powered Text Interface Guide

## Quick Start
Launch the intelligent text interface:
\`\`\`bash
npm run chat
\`\`\`

## AI Commands
- \`ask What can you tell me about the learning engine?\` - Get AI insights
- \`status\` - Show system status with AI integration data
- \`help\` - Show all available commands

## Example Interactions
The AI provides intelligent responses based on real-time learning data:

\`\`\`
Claudia> ask How many patterns have been detected?
🤖 Claudia: Currently tracking learning progress with real-time statistics...
\`\`\`

## Features
- ✅ Real-time learning statistics
- ✅ Pattern recognition and reporting  
- ✅ Intelligent query processing
- ✅ Contextual AI responses
- ✅ Knowledge base integration

Last updated: ${new Date().toISOString()}`;

        return {
          contents: [
            {
              uri,
              mimeType: 'text/markdown',
              text: guide
            }
          ]
        };
      }
      
      if (uri === 'knowledge://learning-stats') {
        // Get detailed learning statistics
        const patterns = await this.db.all(`
          SELECT pattern_type, occurrences, confidence_score, created_at
          FROM learned_patterns
          ORDER BY created_at DESC
          LIMIT 10
        `);
        
        const tools = await this.db.all(`
          SELECT tool_name, usage_count, success_rate, created_at
          FROM generated_tools
          WHERE is_active = 1
          ORDER BY created_at DESC
          LIMIT 10
        `);
        
        const stats = {
          summary: {
            total_patterns: patterns.length,
            total_tools: tools.length,
            last_updated: new Date().toISOString()
          },
          recent_patterns: patterns,
          generated_tools: tools,
          learning_metrics: {
            pattern_detection_active: true,
            auto_generation_enabled: true,
            confidence_threshold: 0.6
          }
        };
        
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(stats, null, 2)
            }
          ]
        };
      }
      
      // Framework resources
      if (uri === 'framework://compliance') {
        const compliance = await this.getFrameworkCompliance();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(compliance, null, 2)
            }
          ]
        };
      }
      
      if (uri === 'framework://patterns-config') {
        const patterns = await this.getFrameworkPatterns();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(patterns, null, 2)
            }
          ]
        };
      }
      
      if (uri === 'framework://monitoring') {
        const monitoring = await this.getFrameworkMonitoring();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(monitoring, null, 2)
            }
          ]
        };
      }
      
      if (uri === 'framework://templates') {
        const templates = await this.getFrameworkTemplates();
        return {
          contents: [
            {
              uri,
              mimeType: 'text/markdown',
              text: templates
            }
          ]
        };
      }
      
      if (uri === 'framework://project-configs') {
        const configs = await this.getProjectConfigurations();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(configs, null, 2)
            }
          ]
        };
      }
      
      throw new Error(`Unknown resource: ${uri}`);
    });
  }

  // Trigger pattern detection asynchronously
  triggerPatternDetection() {
    // Run pattern detection in background every 10 executions
    setImmediate(async () => {
      try {
        const recentCount = await this.db.get(`
          SELECT COUNT(*) as count 
          FROM tool_executions 
          WHERE user_session_id = ? AND created_at > datetime('now', '-1 hour')
        `, [this.sessionId]);
        
        if (recentCount?.count > 0 && recentCount.count % 10 === 0) {
          console.error('🔍 Triggering background pattern detection...');
          await this.learningEngine.detectPatterns(this.sessionId, 24);
        }
      } catch (error) {
        console.warn('⚠️ Background pattern detection failed:', error.message);
      }
    });
  }

  async validateAIQuery(args) {
    try {
      const query = args.query || args.text || args.message || '';
      
      // Check for malicious patterns
      const suspiciousPatterns = [
        /system\s*prompt/i,
        /ignore\s*instructions/i,
        /jailbreak/i,
        /roleplay/i,
        /<script/i,
        /javascript:/i,
        /data:text\/html/i
      ];
      
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(query)) {
          return {
            valid: false,
            reason: 'Query contains potentially malicious content'
          };
        }
      }
      
      // Length validation
      if (query.length > 2000) {
        return {
          valid: false,
          reason: 'Query exceeds maximum length (2000 characters)'
        };
      }
      
      // Rate limiting (simple session-based)
      const now = Date.now();
      if (!this.lastQueryTime) this.lastQueryTime = 0;
      if (!this.queryCount) this.queryCount = 0;
      
      // Reset count every minute
      if (now - this.lastQueryTime > 60000) {
        this.queryCount = 0;
      }
      
      this.queryCount++;
      this.lastQueryTime = now;
      
      if (this.queryCount > 10) {
        return {
          valid: false,
          reason: 'Rate limit exceeded (10 queries per minute)'
        };
      }
      
      return { valid: true };
      
    } catch (error) {
      return {
        valid: false,
        reason: `Validation error: ${error.message}`
      };
    }
  }

  updateContext(updates) {
    this.context = { ...this.context, ...updates };
    
    // Update session in database
    this.db.updateSession(this.sessionId, this.context).catch(err => {
      console.error('Failed to update session context:', err);
    });
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Framework integration methods
  async getFrameworkCompliance() {
    if (!this.frameworkEnabled) {
      return { enabled: false, message: 'Framework disabled' };
    }

    try {
      // Read patterns log to calculate compliance
      const logPath = path.join(this.frameworkPath, 'monitoring/patterns.log');
      const content = await fs.readFile(logPath, 'utf8');
      const patterns = content.split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line))
        .filter(p => {
          const patternTime = new Date(p.timestamp);
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - 7); // Last 7 days
          return patternTime >= cutoff;
        });

      const totalActions = patterns.length;
      const successfulActions = patterns.filter(p => p.success).length;
      const averageCompliance = patterns.reduce((sum, p) => sum + (p.compliance_score || 80), 0) / Math.max(1, patterns.length);

      return {
        enabled: true,
        timeframe: '7d',
        total_actions: totalActions,
        successful_actions: successfulActions,
        success_rate: totalActions > 0 ? (successfulActions / totalActions * 100).toFixed(1) : 0,
        average_compliance_score: averageCompliance.toFixed(1),
        last_updated: new Date().toISOString(),
        framework_version: '1.0.0',
        integration_status: 'active'
      };
    } catch (error) {
      return {
        enabled: true,
        error: error.message,
        status: 'error_reading_logs'
      };
    }
  }

  async getFrameworkPatterns() {
    if (!this.frameworkEnabled) {
      return { enabled: false };
    }

    try {
      const patternsPath = path.join(this.frameworkPath, 'config/patterns.json');
      const content = await fs.readFile(patternsPath, 'utf8');
      const patterns = JSON.parse(content);
      
      return {
        enabled: true,
        loaded_at: new Date().toISOString(),
        ...patterns
      };
    } catch (error) {
      return {
        enabled: true,
        error: error.message,
        status: 'error_loading_patterns'
      };
    }
  }

  async getFrameworkMonitoring() {
    if (!this.frameworkEnabled) {
      return { enabled: false };
    }

    try {
      // Get current monitoring status
      const metricsPath = path.join(this.frameworkPath, 'monitoring/metrics.json');
      let metrics = {};
      
      try {
        const content = await fs.readFile(metricsPath, 'utf8');
        metrics = JSON.parse(content);
      } catch {
        // Create empty metrics if file doesn't exist
        metrics = {
          timestamp: new Date().toISOString(),
          status: 'initializing'
        };
      }

      return {
        enabled: true,
        framework_status: 'active',
        monitoring_active: true,
        last_update: metrics.timestamp || new Date().toISOString(),
        metrics: metrics,
        dashboard_url: 'framework://monitoring',
        alerts_active: true
      };
    } catch (error) {
      return {
        enabled: true,
        error: error.message,
        status: 'monitoring_error'
      };
    }
  }

  async getFrameworkTemplates() {
    if (!this.frameworkEnabled) {
      return '# Framework Disabled\n\nFramework integration is currently disabled.';
    }

    try {
      // Return a summary of available templates
      const templatesList = [
        '# MCP Best Practices Framework Templates',
        '',
        '## Available Action Templates',
        '',
        '### 1. NetSuite Script Development',
        '- Pre-action documentation with ESONUS naming conventions',
        '- Governance monitoring and error handling patterns',
        '- Required structure validation',
        '',
        '### 2. API Integration',
        '- Authentication and rate limiting patterns',
        '- Error handling and retry logic',
        '- Security validation requirements',
        '',
        '### 3. Database Migration',
        '- Rollback procedures and data validation',
        '- Performance monitoring during migration',
        '- Transaction management patterns',
        '',
        '### 4. Deployment Pipeline',
        '- Health checks and monitoring integration',
        '- Automated rollback triggers',
        '- Performance baseline validation',
        '',
        '### 5. Incident Response',
        '- Escalation procedures and communication patterns',
        '- Root cause analysis frameworks',
        '- Post-incident learning integration',
        '',
        '### 6. Performance Optimization',
        '- Baseline measurement and comparison',
        '- Bottleneck identification patterns',
        '- Optimization validation methods',
        '',
        '## Usage',
        'Templates are automatically applied based on action type and client configuration.',
        'Framework learning engine tracks successful patterns and suggests optimizations.',
        '',
        `*Last updated: ${new Date().toISOString()}*`
      ].join('\n');

      return templatesList;
    } catch (error) {
      return `# Framework Templates Error\n\nError loading templates: ${error.message}`;
    }
  }

  async getProjectConfigurations() {
    if (!this.frameworkEnabled) {
      return { enabled: false };
    }

    try {
      // Analyze project configurations based on discovered projects
      const projectsBasePath = '/home/ben/saralegui-solutions-llc';
      const clients = ['esonus', 'products', 'infrastructure'];
      const configurations = {};

      for (const client of clients) {
        const clientPath = path.join(projectsBasePath, client);
        try {
          await fs.access(clientPath);
          const projects = await fs.readdir(clientPath, { withFileTypes: true });
          
          configurations[client] = {
            path: clientPath,
            projects: projects
              .filter(dirent => dirent.isDirectory())
              .map(dirent => ({
                name: dirent.name,
                path: path.join(clientPath, dirent.name),
                framework_config_exists: false, // Would check for .mcp-config.json
                estimated_compliance: this.estimateProjectCompliance(client, dirent.name)
              }))
          };
        } catch {
          configurations[client] = {
            path: clientPath,
            error: 'Client directory not accessible',
            projects: []
          };
        }
      }

      return {
        enabled: true,
        scan_timestamp: new Date().toISOString(),
        base_path: projectsBasePath,
        clients: configurations,
        framework_version: '1.0.0',
        total_projects: Object.values(configurations)
          .reduce((sum, client) => sum + client.projects?.length || 0, 0)
      };
    } catch (error) {
      return {
        enabled: true,
        error: error.message,
        status: 'config_scan_error'
      };
    }
  }

  estimateProjectCompliance(client, projectName) {
    // Simplified compliance estimation based on known patterns
    let score = 60; // Base score
    
    // ESONUS client projects
    if (client === 'esonus') {
      if (projectName.startsWith('eso_') || projectName === 'escalon') {
        score += 10; // Naming convention bonus
      }
      if (projectName === 'escalon') {
        score -= 20; // Known structural issues
      }
    }
    
    // Products/infrastructure
    if (client === 'products' || client === 'infrastructure') {
      if (projectName.includes('mcp') || projectName.includes('ai')) {
        score += 15; // Infrastructure bonus
      }
    }
    
    return Math.min(100, Math.max(0, score));
  }

  async start() {
    await this.initialize();
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error('✅ Saralegui MCP Server started');
    console.error(`📍 Session ID: ${this.sessionId}`);
    console.error('🎯 Ready to accept commands');
  }
}

// Start the server
const server = new SaraleguiMCPServer();
server.start().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});