#!/usr/bin/env node

/**
 * Database Migration Script for Validation Rules
 * Adds validation rules support to existing Saralegui MCP database
 */

import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ValidationRulesMigration {
    constructor(dbPath = null) {
        // Use provided path or default to user's home directory
        this.dbPath = dbPath || path.join(process.env.HOME, 'saralegui-solutions-mcp/database/saralegui_assistant.db');
        this.schemaPath = path.join(__dirname, 'validation_rules_schema.sql');
        this.db = null;
    }

    async migrate() {
        console.log('🔄 Starting validation rules migration...');
        console.log(`📂 Database path: ${this.dbPath}`);
        
        // Ensure database directory exists
        const dbDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
            console.log(`📁 Created database directory: ${dbDir}`);
        }
        
        try {
            // Open database connection
            await this.openDatabase();
            
            // Check if migration is needed
            const needsMigration = await this.checkMigrationNeeded();
            
            if (!needsMigration) {
                console.log('✅ Validation rules tables already exist. Skipping migration.');
                await this.closeDatabase();
                return;
            }
            
            // Read and execute schema
            await this.executeSchemaMigration();
            
            // Verify migration
            await this.verifyMigration();
            
            console.log('✅ Validation rules migration completed successfully!');
            
        } catch (error) {
            console.error('❌ Migration failed:', error.message);
            throw error;
        } finally {
            await this.closeDatabase();
        }
    }

    async openDatabase() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    reject(new Error(`Failed to open database: ${err.message}`));
                } else {
                    console.log('📂 Database connection opened');
                    resolve();
                }
            });
        });
    }

    async closeDatabase() {
        if (this.db) {
            return new Promise((resolve) => {
                this.db.close((err) => {
                    if (err) {
                        console.error('Warning: Error closing database:', err.message);
                    } else {
                        console.log('📂 Database connection closed');
                    }
                    resolve();
                });
            });
        }
    }

    async checkMigrationNeeded() {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='validation_rules'
            `;
            
            this.db.get(query, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(!row); // Need migration if table doesn't exist
                }
            });
        });
    }

    async executeSchemaMigration() {
        const schemaSQL = fs.readFileSync(this.schemaPath, 'utf8');
        
        // Remove all types of comments and clean up
        const cleanSQL = schemaSQL
            .split('\n')
            .map(line => {
                // Remove full line comments
                if (line.trim().startsWith('--')) {
                    return '';
                }
                // Remove inline comments
                const commentIndex = line.indexOf('--');
                if (commentIndex !== -1) {
                    return line.substring(0, commentIndex).trim();
                }
                return line;
            })
            .join('\n');
            
        // Split the schema into individual statements, handling BEGIN/END blocks
        const statements = [];
        let currentStatement = '';
        let inBeginBlock = false;
        
        const lines = cleanSQL.split(';');
        
        for (let line of lines) {
            line = line.replace(/\s+/g, ' ').trim();
            if (!line) continue;
            
            currentStatement += line;
            
            // Check if we're entering a BEGIN block
            if (line.toUpperCase().includes('BEGIN')) {
                inBeginBlock = true;
            }
            
            // Check if we're exiting a BEGIN block  
            if (inBeginBlock && line.toUpperCase().includes('END')) {
                inBeginBlock = false;
                statements.push(currentStatement);
                currentStatement = '';
            } else if (!inBeginBlock) {
                // Normal statement end
                statements.push(currentStatement);
                currentStatement = '';
            } else {
                // Inside BEGIN block, add semicolon back
                currentStatement += ';';
            }
        }
        
        // Add any remaining statement
        if (currentStatement.trim()) {
            statements.push(currentStatement.trim());
        }

        console.log(`📋 Executing ${statements.length} schema statements...`);
        
        // Group statements by type for proper execution order  
        const tableStatements = statements.filter(s => s.toUpperCase().includes('CREATE TABLE'));
        const indexStatements = statements.filter(s => s.toUpperCase().includes('CREATE INDEX'));
        const triggerStatements = statements.filter(s => s.toUpperCase().includes('CREATE TRIGGER'));
        const viewStatements = statements.filter(s => s.toUpperCase().includes('CREATE VIEW'));
        const insertStatements = statements.filter(s => s.toUpperCase().includes('INSERT'));
        const pragmaStatements = statements.filter(s => s.toUpperCase().includes('PRAGMA'));

        console.log(`📊 Statement breakdown:`);
        console.log(`   - PRAGMA: ${pragmaStatements.length}`);
        console.log(`   - Tables: ${tableStatements.length}`);
        console.log(`   - Indexes: ${indexStatements.length}`);
        console.log(`   - Triggers: ${triggerStatements.length}`);
        console.log(`   - Views: ${viewStatements.length}`);
        console.log(`   - Inserts: ${insertStatements.length}`);
        
        // Debug first few statements
        console.log(`🔍 First 3 statements preview:`);
        statements.slice(0, 3).forEach((stmt, i) => {
            console.log(`   ${i + 1}: ${stmt.substring(0, 80)}...`);
        });

        // Execute in proper order
        const orderedStatements = [
            ...pragmaStatements,
            ...tableStatements,
            ...indexStatements,
            ...triggerStatements,
            ...viewStatements,
            ...insertStatements
        ];
        
        console.log(`📋 Executing in proper dependency order...`);
        for (let i = 0; i < orderedStatements.length; i++) {
            const statement = orderedStatements[i];
            await this.executeStatement(statement + ';', i + 1);
        }
    }

    async executeStatement(statement, index) {
        return new Promise((resolve, reject) => {
            this.db.run(statement, (err) => {
                if (err) {
                    console.error(`❌ Statement ${index} failed:`, statement);
                    reject(err);
                } else {
                    console.log(`✅ Statement ${index} executed successfully`);
                    resolve();
                }
            });
        });
    }

    async verifyMigration() {
        const expectedTables = [
            'validation_rules',
            'rule_applications',
            'validation_scopes',
            'rule_effectiveness',
            'code_patterns',
            'rule_categories'
        ];

        console.log('🔍 Verifying migration...');
        
        for (const tableName of expectedTables) {
            const exists = await this.tableExists(tableName);
            if (exists) {
                console.log(`✅ Table '${tableName}' created successfully`);
            } else {
                throw new Error(`❌ Table '${tableName}' was not created`);
            }
        }

        // Check if initial data was inserted
        const ruleCount = await this.getTableCount('validation_rules');
        const categoryCount = await this.getTableCount('rule_categories');
        const scopeCount = await this.getTableCount('validation_scopes');

        console.log(`📊 Migration results:`);
        console.log(`   - ${ruleCount} validation rules created`);
        console.log(`   - ${categoryCount} rule categories created`);
        console.log(`   - ${scopeCount} validation scopes created`);
    }

    async tableExists(tableName) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name=?
            `;
            
            this.db.get(query, [tableName], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(!!row);
                }
            });
        });
    }

    async getTableCount(tableName) {
        return new Promise((resolve, reject) => {
            this.db.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row.count);
                }
            });
        });
    }

    async testValidationRuleInsertion() {
        console.log('🧪 Testing validation rule insertion...');
        
        const testRule = {
            rule_id: 'test-rule-' + Date.now(),
            scope: 'global',
            category: 'syntax',
            priority: 'error',
            technology: 'javascript',
            pattern_text: 'console\\.log\\s*\\(',
            message: 'Avoid console.log in production code',
            suggestion: 'Use proper logging framework',
            confidence: 0.8,
            learned_from: 'migration-test'
        };

        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO validation_rules (
                    rule_id, scope, category, priority, technology,
                    pattern_text, message, suggestion, confidence, learned_from
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            this.db.run(query, [
                testRule.rule_id,
                testRule.scope,
                testRule.category,
                testRule.priority,
                testRule.technology,
                testRule.pattern_text,
                testRule.message,
                testRule.suggestion,
                testRule.confidence,
                testRule.learned_from
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    console.log('✅ Test rule inserted successfully');
                    resolve(this.lastID);
                }
            });
        });
    }
}

// Command line interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const migration = new ValidationRulesMigration();
    
    migration.migrate()
        .then(() => {
            console.log('\n🎉 Migration completed successfully!');
            console.log('You can now use the validation rules system.');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Migration failed:', error.message);
            process.exit(1);
        });
}

export { ValidationRulesMigration };
export default ValidationRulesMigration;