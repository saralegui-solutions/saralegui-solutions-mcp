/**
 * Database Manager for Saralegui MCP Server
 * Provides unified database interface with connection pooling and transaction support
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import chalk from 'chalk';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class DatabaseManager {
  constructor(options = {}) {
    this.dbPath = options.dbPath || join(dirname(__dirname), 'database', 'saralegui_assistant.db');
    this.db = null;
    this.isConnected = false;
    this.transactionStack = [];
    this.connectionPool = new Map(); // For future multi-connection support
    
    // Configuration
    this.config = {
      maxConnections: options.maxConnections || 1, // SQLite doesn't need pooling, but structure for future
      busyTimeout: options.busyTimeout || 5000,
      enableWAL: options.enableWAL !== false, // WAL mode by default
      enableForeignKeys: options.enableForeignKeys !== false
    };
  }

  /**
   * Initialize database connection and setup
   */
  async initialize() {
    if (this.isConnected) {
      return this.db;
    }

    console.error('💾 Initializing Database Manager...');

    try {
      // Ensure database directory exists
      const dbDir = dirname(this.dbPath);
      await fs.mkdir(dbDir, { recursive: true });

      // Open database connection
      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database
      });

      // Configure database
      await this.configureDatabase();
      
      // Verify schema exists
      await this.ensureSchema();

      this.isConnected = true;
      console.error('✅ Database Manager initialized');
      
      return this.db;
    } catch (error) {
      console.error('❌ Database initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Configure database settings
   */
  async configureDatabase() {
    // Enable foreign keys
    if (this.config.enableForeignKeys) {
      await this.db.exec('PRAGMA foreign_keys = ON');
    }

    // Enable WAL mode for better concurrency
    if (this.config.enableWAL) {
      await this.db.exec('PRAGMA journal_mode = WAL');
    }

    // Set busy timeout
    await this.db.exec(`PRAGMA busy_timeout = ${this.config.busyTimeout}`);

    // Optimize SQLite settings
    await this.db.exec('PRAGMA synchronous = NORMAL');
    await this.db.exec('PRAGMA cache_size = -64000'); // 64MB cache
    await this.db.exec('PRAGMA temp_store = memory');
  }

  /**
   * Ensure database schema is properly set up
   */
  async ensureSchema() {
    // Check if tables exist
    const tables = await this.db.all(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `);

    if (tables.length === 0) {
      console.error('📋 Setting up database schema...');
      await this.createSchema();
    }

    // Verify critical tables exist
    const requiredTables = [
      'tool_executions',
      'learned_patterns',
      'generated_tools',
      'user_sessions',
      'knowledge_entries'
    ];

    const existingTables = tables.map(t => t.name);
    const missingTables = requiredTables.filter(table => !existingTables.includes(table));

    if (missingTables.length > 0) {
      console.error(`⚠️  Missing tables: ${missingTables.join(', ')}`);
      await this.createSchema();
    }
  }

  /**
   * Create database schema from schema.sql file
   */
  async createSchema() {
    try {
      const schemaPath = join(dirname(__dirname), 'database', 'schema.sql');
      const schemaSql = await fs.readFile(schemaPath, 'utf-8');
      
      await this.db.exec(schemaSql);
      console.error('✅ Database schema created');
      
      // Apply enhanced learning schema
      await this.applyEnhancedLearningSchema();
    } catch (error) {
      console.error('❌ Failed to create schema:', error.message);
      throw error;
    }
  }

  /**
   * Apply enhanced learning schema
   */
  async applyEnhancedLearningSchema() {
    try {
      const enhancedSchemaPath = join(dirname(__dirname), 'database', 'enhanced_learning_schema.sql');
      const enhancedSchemaSql = await fs.readFile(enhancedSchemaPath, 'utf-8');
      
      await this.db.exec(enhancedSchemaSql);
      console.error('✅ Enhanced learning schema applied');
    } catch (error) {
      console.warn('⚠️ Enhanced learning schema application failed:', error.message);
      // Don't throw - this is an enhancement, not critical
    }
  }

  /**
   * Execute a query with parameters
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} Query result
   */
  async query(sql, params = []) {
    if (!this.isConnected) {
      await this.initialize();
    }

    try {
      // Determine query type
      const queryType = sql.trim().toUpperCase().split(' ')[0];

      switch (queryType) {
        case 'SELECT':
          return await this.db.all(sql, params);
        
        case 'INSERT':
          const insertResult = await this.db.run(sql, params);
          return { 
            lastID: insertResult.lastID, 
            changes: insertResult.changes,
            sql,
            params 
          };
        
        case 'UPDATE':
        case 'DELETE':
          const modifyResult = await this.db.run(sql, params);
          return { 
            changes: modifyResult.changes,
            sql,
            params 
          };
        
        default:
          return await this.db.run(sql, params);
      }
    } catch (error) {
      console.error('❌ Database query failed:', {
        sql: sql.substring(0, 100) + '...',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get a single row
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object|null>} Single row or null
   */
  async get(sql, params = []) {
    if (!this.isConnected) {
      await this.initialize();
    }

    try {
      return await this.db.get(sql, params);
    } catch (error) {
      console.error('❌ Database get failed:', error.message);
      throw error;
    }
  }

  /**
   * Get all rows
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>} Array of rows
   */
  async all(sql, params = []) {
    if (!this.isConnected) {
      await this.initialize();
    }

    try {
      return await this.db.all(sql, params);
    } catch (error) {
      console.error('❌ Database all failed:', error.message);
      throw error;
    }
  }

  /**
   * Run a query (for INSERT, UPDATE, DELETE)
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} Run result with changes/lastID
   */
  async run(sql, params = []) {
    if (!this.isConnected) {
      await this.initialize();
    }

    try {
      return await this.db.run(sql, params);
    } catch (error) {
      console.error('❌ Database run failed:', error.message);
      throw error;
    }
  }

  /**
   * Execute raw SQL (for schema operations)
   * @param {string} sql - Raw SQL
   * @returns {Promise<void>}
   */
  async exec(sql) {
    if (!this.isConnected) {
      await this.initialize();
    }

    try {
      return await this.db.exec(sql);
    } catch (error) {
      console.error('❌ Database exec failed:', error.message);
      throw error;
    }
  }

  /**
   * Start a transaction
   * @returns {Promise<Transaction>} Transaction object
   */
  async beginTransaction() {
    if (!this.isConnected) {
      await this.initialize();
    }

    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      await this.db.exec('BEGIN TRANSACTION');
      
      const transaction = {
        id: transactionId,
        startTime: Date.now(),
        committed: false,
        rolledBack: false,
        
        async commit() {
          if (this.committed || this.rolledBack) {
            throw new Error('Transaction already finalized');
          }
          
          await this.db.exec('COMMIT');
          this.committed = true;
          
          // Remove from stack
          const index = this.transactionStack.findIndex(tx => tx.id === transactionId);
          if (index !== -1) {
            this.transactionStack.splice(index, 1);
          }
        },
        
        async rollback() {
          if (this.committed || this.rolledBack) {
            throw new Error('Transaction already finalized');
          }
          
          await this.db.exec('ROLLBACK');
          this.rolledBack = true;
          
          // Remove from stack
          const index = this.transactionStack.findIndex(tx => tx.id === transactionId);
          if (index !== -1) {
            this.transactionStack.splice(index, 1);
          }
        }
      };

      // Bind the database instance to the transaction
      transaction.db = this.db;
      
      this.transactionStack.push(transaction);
      
      return transaction;
    } catch (error) {
      console.error('❌ Failed to begin transaction:', error.message);
      throw error;
    }
  }

  /**
   * Execute multiple operations in a transaction
   * @param {Function} operations - Async function containing operations
   * @returns {Promise<any>} Result of operations
   */
  async transaction(operations) {
    const tx = await this.beginTransaction();
    
    try {
      const result = await operations(this);
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  /**
   * Create a user session
   * @param {string} sessionId - Session ID
   * @param {Object} context - Session context
   * @returns {Promise<Object>} Session creation result
   */
  async createSession(sessionId, context = {}) {
    return await this.run(`
      INSERT OR REPLACE INTO user_sessions (session_id, context, created_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `, [sessionId, JSON.stringify(context)]);
  }

  /**
   * Get session information
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object|null>} Session data
   */
  async getSession(sessionId) {
    const session = await this.get(`
      SELECT * FROM user_sessions WHERE session_id = ?
    `, [sessionId]);
    
    if (session && session.context) {
      try {
        session.context = JSON.parse(session.context);
      } catch (error) {
        console.warn('Failed to parse session context:', error.message);
        session.context = {};
      }
    }
    
    return session;
  }

  /**
   * Update session context
   * @param {string} sessionId - Session ID
   * @param {Object} context - Updated context
   * @returns {Promise<Object>} Update result
   */
  async updateSession(sessionId, context) {
    return await this.run(`
      UPDATE user_sessions 
      SET context = ?, updated_at = CURRENT_TIMESTAMP
      WHERE session_id = ?
    `, [JSON.stringify(context), sessionId]);
  }

  /**
   * Get database health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      const startTime = Date.now();
      
      // Test basic query
      await this.db.get('SELECT 1 as test');
      
      const queryTime = Date.now() - startTime;
      
      // Get database stats
      const stats = await this.db.all(`
        SELECT 
          name,
          (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=m.name) as table_count
        FROM sqlite_master m
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `);

      return {
        connected: this.isConnected,
        dbPath: this.dbPath,
        queryResponseTime: queryTime,
        tables: stats.length,
        walMode: this.config.enableWAL,
        foreignKeys: this.config.enableForeignKeys,
        activeTransactions: this.transactionStack.length
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
        dbPath: this.dbPath
      };
    }
  }

  /**
   * Backup database
   * @param {string} backupPath - Path to backup file
   * @returns {Promise<boolean>} Success status
   */
  async backup(backupPath) {
    if (!this.isConnected) {
      await this.initialize();
    }

    try {
      console.error(`🔄 Creating database backup: ${backupPath}`);
      
      // Use SQLite BACKUP API through a VACUUM INTO command
      await this.db.exec(`VACUUM INTO '${backupPath}'`);
      
      console.error('✅ Database backup completed');
      return true;
    } catch (error) {
      console.error('❌ Database backup failed:', error.message);
      return false;
    }
  }

  /**
   * Close database connection
   * @returns {Promise<void>}
   */
  async close() {
    if (this.isConnected && this.db) {
      // Rollback any pending transactions
      for (const tx of this.transactionStack) {
        if (!tx.committed && !tx.rolledBack) {
          try {
            await tx.rollback();
          } catch (error) {
            console.warn('Failed to rollback transaction during close:', error.message);
          }
        }
      }
      
      await this.db.close();
      this.isConnected = false;
      this.db = null;
      console.error('🔌 Database connection closed');
    }
  }

  /**
   * Get connection status
   * @returns {boolean} Connection status
   */
  isReady() {
    return this.isConnected && this.db !== null;
  }
}

export default DatabaseManager;