#!/usr/bin/env node

/**
 * Database initialization script for Saralegui MCP Server
 * Creates and initializes the SQLite database with the learning schema
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function initializeDatabase() {
  console.log('🗄️  Initializing Saralegui MCP database...');
  
  try {
    // Create database file
    const dbPath = path.join(__dirname, 'saralegui_assistant.db');
    
    // Open database connection
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
    
    console.log('📂 Database file created at:', dbPath);
    
    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf-8');
    
    // Split schema into individual statements (SQLite doesn't support multiple statements in exec)
    const statements = schema
      .split(';')
      .filter(stmt => stmt.trim())
      .map(stmt => stmt.trim() + ';');
    
    console.log(`📝 Executing ${statements.length} SQL statements...`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Skip comments
      if (statement.startsWith('--')) continue;
      
      try {
        await db.exec(statement);
        
        // Log progress for important tables
        if (statement.includes('CREATE TABLE')) {
          const tableName = statement.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1];
          if (tableName) {
            console.log(`  ✅ Created table: ${tableName}`);
          }
        }
      } catch (error) {
        console.error(`  ❌ Error executing statement ${i + 1}:`, error.message);
        console.error('  Statement:', statement.substring(0, 100) + '...');
      }
    }
    
    // Verify tables were created
    const tables = await db.all(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      ORDER BY name
    `);
    
    console.log('\n📊 Database tables created:');
    tables.forEach(table => {
      console.log(`  • ${table.name}`);
    });
    
    // Get row counts for seed data
    const knowledgeCount = await db.get('SELECT COUNT(*) as count FROM knowledge_entries');
    console.log(`\n📚 Knowledge entries: ${knowledgeCount.count}`);
    
    // Close database
    await db.close();
    
    console.log('\n✅ Database initialization complete!');
    console.log('📍 Database location:', dbPath);
    
    // Create a simple config file with the database path
    const configPath = path.join(dirname(__dirname), 'config', 'database.json');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    
    await fs.writeFile(configPath, JSON.stringify({
      development: {
        type: 'sqlite',
        database: dbPath
      },
      production: {
        type: 'sqlite',
        database: dbPath
      },
      test: {
        type: 'sqlite',
        database: ':memory:'
      }
    }, null, 2));
    
    console.log('📝 Database config saved to:', configPath);
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initializeDatabase();
}

export { initializeDatabase };