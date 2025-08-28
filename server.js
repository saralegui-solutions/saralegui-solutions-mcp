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
      
      // Security validation
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