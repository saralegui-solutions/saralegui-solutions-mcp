#!/usr/bin/env node

/**
 * Enhanced Database initialization for Saralegui MCP Server
 * Uses sqlite3/sqlite for async operations with modern Node.js
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import chalk from 'chalk';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function initializeDatabase() {
  console.log(chalk.blue('💾 Initializing Saralegui MCP SQLite database...'));
  
  const dbPath = join(__dirname, 'saralegui_assistant.db');
  
  try {
    // Create database with sqlite3/sqlite
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
    
    // Enable foreign keys and WAL mode for better performance
    await db.exec('PRAGMA foreign_keys = ON');
    await db.exec('PRAGMA journal_mode = WAL');
    
    console.log(chalk.green('✅ Database file created at:'), dbPath);
    
    // Create tables with enhanced SQLite schema
    await db.exec(`
      -- Tool execution tracking
      CREATE TABLE IF NOT EXISTS tool_executions (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        tool_name TEXT NOT NULL,
        tool_version TEXT DEFAULT '1.0.0',
        parameters TEXT DEFAULT '{}',
        context TEXT DEFAULT '{}',
        result TEXT,
        success INTEGER DEFAULT 0,
        error_message TEXT,
        execution_time_ms INTEGER,
        user_session_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Pattern detection and learning
      CREATE TABLE IF NOT EXISTS learned_patterns (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        pattern_signature TEXT UNIQUE NOT NULL,
        pattern_type TEXT,
        pattern_data TEXT,
        occurrences INTEGER DEFAULT 1,
        first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
        last_seen TEXT DEFAULT CURRENT_TIMESTAMP,
        tool_suggestion TEXT,
        auto_created INTEGER DEFAULT 0,
        tool_id TEXT,
        confidence_score REAL DEFAULT 0.0,
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Generated tools registry
      CREATE TABLE IF NOT EXISTS generated_tools (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        tool_name TEXT UNIQUE NOT NULL,
        tool_category TEXT,
        source_pattern_id TEXT REFERENCES learned_patterns(id),
        code_content TEXT NOT NULL,
        config TEXT DEFAULT '{}',
        usage_count INTEGER DEFAULT 0,
        success_rate REAL DEFAULT 0.0,
        average_execution_time_ms INTEGER,
        is_active INTEGER DEFAULT 1,
        version INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Knowledge base entries
      CREATE TABLE IF NOT EXISTS knowledge_entries (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        entry_type TEXT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT,
        related_tools TEXT,
        usage_count INTEGER DEFAULT 0,
        helpful_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- NetSuite credentials (encrypted)
      CREATE TABLE IF NOT EXISTS netsuite_credentials (
        account_id TEXT PRIMARY KEY,
        environment TEXT NOT NULL,
        encrypted_credentials TEXT NOT NULL,
        last_used TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Voice command history
      CREATE TABLE IF NOT EXISTS voice_commands (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        raw_audio_text TEXT,
        interpreted_command TEXT,
        actual_command TEXT,
        confidence_score REAL,
        execution_result TEXT,
        user_feedback TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- User sessions
      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        session_id TEXT UNIQUE NOT NULL,
        context TEXT DEFAULT '{}',
        active_project TEXT,
        preferences TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_activity TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_tool_executions_tool_name ON tool_executions(tool_name);
      CREATE INDEX IF NOT EXISTS idx_tool_executions_created_at ON tool_executions(created_at);
      CREATE INDEX IF NOT EXISTS idx_patterns_signature ON learned_patterns(pattern_signature);
      CREATE INDEX IF NOT EXISTS idx_patterns_occurrences ON learned_patterns(occurrences);
      CREATE INDEX IF NOT EXISTS idx_knowledge_type ON knowledge_entries(entry_type);
      CREATE INDEX IF NOT EXISTS idx_voice_commands_created ON voice_commands(created_at);
    `);
    
    console.log(chalk.green('✅ Tables and indexes created'));
    
    // Insert initial knowledge base entries
    const initialKnowledge = [
      {
        title: 'System Overview',
        type: 'documentation',
        content: 'Saralegui MCP Server with AI learning capabilities, voice integration, and automatic tool generation.',
        tags: JSON.stringify(['system', 'overview', 'mcp'])
      },
      {
        title: 'Voice Commands Setup',
        type: 'documentation',
        content: 'Voice commands use OpenAI Whisper for transcription and ElevenLabs for synthesis. Say "Hey Claudia" to activate.',
        tags: JSON.stringify(['voice', 'whisper', 'elevenlabs'])
      },
      {
        title: 'NetSuite Integration',
        type: 'documentation',
        content: 'NetSuite sandbox credentials are encrypted and stored securely. Use npm run setup:netsuite to configure.',
        tags: JSON.stringify(['netsuite', 'security', 'credentials'])
      }
    ];
    
    for (const entry of initialKnowledge) {
      await db.run(
        `INSERT OR IGNORE INTO knowledge_entries (title, entry_type, content, tags)
         VALUES (?, ?, ?, ?)`,
        [entry.title, entry.type, entry.content, entry.tags]
      );
    }
    
    // Verify database setup
    const tables = await db.all(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      ORDER BY name
    `);
    
    console.log(chalk.cyan('\n📊 Database tables created:'));
    for (const table of tables) {
      const count = await db.get(`SELECT COUNT(*) as count FROM ${table.name}`);
      console.log(chalk.gray(`  • ${table.name}: ${count.count} records`));
    }
    
    // Create database config
    const configPath = join(dirname(__dirname), 'config', 'database.json');
    await fs.mkdir(dirname(configPath), { recursive: true });
    
    await fs.writeFile(configPath, JSON.stringify({
      development: {
        type: 'sqlite',
        database: dbPath,
        options: {
          verbose: console.log,
          fileMustExist: false
        }
      },
      production: {
        type: 'sqlite',
        database: dbPath,
        options: {
          verbose: null,
          fileMustExist: true
        }
      },
      test: {
        type: 'sqlite',
        database: ':memory:'
      }
    }, null, 2));
    
    console.log(chalk.green('✅ Database config saved to:'), configPath);
    
    await db.close();
    
    console.log(chalk.green.bold('\n✨ Database initialization complete!'));
    console.log(chalk.gray('Database location:'), dbPath);
    
    return dbPath;
    
  } catch (error) {
    console.error(chalk.red('❌ Database initialization failed:'), error);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initializeDatabase();
}