#!/usr/bin/env node

/**
 * Script to add NetSuite validation safety rules to MCP database
 * Ensures safe application of wrapExecution pattern across projects
 */

import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function addNetSuiteSafetyRules() {
    const dbPath = path.join(__dirname, '../database/learning.db');
    const db = new sqlite3.Database(dbPath);
    
    // Promisify database methods
    const run = promisify(db.run.bind(db));
    const get = promisify(db.get.bind(db));

    try {
        console.log('🔒 Adding NetSuite Safety Rules to MCP Database...');

        // Check if validation_rules table exists
        const tableExists = await get(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='validation_rules'
        `);

        if (!tableExists) {
            console.log('📋 Creating validation_rules table...');
            await run(`
                CREATE TABLE IF NOT EXISTS validation_rules (
                    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                    rule_name TEXT UNIQUE NOT NULL,
                    scope TEXT NOT NULL,
                    technology TEXT NOT NULL,
                    pattern TEXT NOT NULL,
                    fix_pattern TEXT,
                    severity TEXT DEFAULT 'warning',
                    auto_fix INTEGER DEFAULT 0,
                    applies_on_edit INTEGER DEFAULT 1,
                    is_active INTEGER DEFAULT 1,
                    safety_checks TEXT DEFAULT '{}',
                    warning_message TEXT,
                    description TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
        }

        // Add the wrapExecution safety rule
        const wrapExecutionRule = {
            rule_name: 'require_wrapExecution_for_netsuite_apis',
            scope: 'global',
            technology: 'suitescript',
            pattern: '/(search|record|file|email|https|render|runtime|url)\\.(create|load|save|send|get|post|lookupFields|runPaged)/',
            fix_pattern: 'this.wrapExecution(\'$METHOD_NAME\', () => $ORIGINAL_CALL, $PARAMS)',
            severity: 'error',
            auto_fix: 0,  // Never auto-fix - require manual confirmation
            applies_on_edit: 1,
            safety_checks: JSON.stringify({
                require_active_development: true,
                check_last_modified: true,
                require_git_changes: true,
                prompt_before_fix: true,
                min_days_since_edit: 30
            }),
            warning_message: '⚠️ DANGER: Modifying dormant code can cause production instability. Only fix files you are actively editing.',
            description: 'NetSuite API calls must use wrapExecution for error handling - ONLY apply to active development'
        };

        await run(`
            INSERT OR REPLACE INTO validation_rules (
                rule_name, scope, technology, pattern, fix_pattern, 
                severity, auto_fix, applies_on_edit, safety_checks, 
                warning_message, description
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            wrapExecutionRule.rule_name,
            wrapExecutionRule.scope,
            wrapExecutionRule.technology,
            wrapExecutionRule.pattern,
            wrapExecutionRule.fix_pattern,
            wrapExecutionRule.severity,
            wrapExecutionRule.auto_fix,
            wrapExecutionRule.applies_on_edit,
            wrapExecutionRule.safety_checks,
            wrapExecutionRule.warning_message,
            wrapExecutionRule.description
        ]);

        // Add @NModuleScope rule
        const moduleScopeRule = {
            rule_name: 'require_nmodulescope_declaration',
            scope: 'global',
            technology: 'suitescript',
            pattern: '/@NApiVersion\\s+2\\.[01].*@NScriptType\\s+\\w+(?!.*@NModuleScope)/s',
            fix_pattern: 'Add @NModuleScope Public after @NScriptType',
            severity: 'error',
            auto_fix: 1,  // Can safely auto-fix this
            applies_on_edit: 1,
            safety_checks: JSON.stringify({
                safe_to_autofix: true,
                check_suitescript_header_only: true
            }),
            warning_message: 'SuiteScript files require @NModuleScope declaration for proper deployment',
            description: 'Ensure all SuiteScript files have @NModuleScope declaration'
        };

        await run(`
            INSERT OR REPLACE INTO validation_rules (
                rule_name, scope, technology, pattern, fix_pattern, 
                severity, auto_fix, applies_on_edit, safety_checks, 
                warning_message, description
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            moduleScopeRule.rule_name,
            moduleScopeRule.scope,
            moduleScopeRule.technology,
            moduleScopeRule.pattern,
            moduleScopeRule.fix_pattern,
            moduleScopeRule.severity,
            moduleScopeRule.auto_fix,
            moduleScopeRule.applies_on_edit,
            moduleScopeRule.safety_checks,
            moduleScopeRule.warning_message,
            moduleScopeRule.description
        ]);

        // Add NetSuite best practices rule
        const bestPracticesRule = {
            rule_name: 'netsuite_error_handler_inheritance',
            scope: 'global',
            technology: 'suitescript',
            pattern: '/class\\s+\\w+\\s*{[^}]*constructor\\s*\\([^}]*}(?!.*extends\\s+ErrorHandler)/s',
            fix_pattern: 'Extend ErrorHandler class for consistent error handling',
            severity: 'warning',
            auto_fix: 0,
            applies_on_edit: 1,
            safety_checks: JSON.stringify({
                require_active_development: true,
                check_class_structure: true
            }),
            warning_message: 'Classes should extend ErrorHandler for consistent error handling across the project',
            description: 'Ensure classes extend ErrorHandler when they perform NetSuite operations'
        };

        await run(`
            INSERT OR REPLACE INTO validation_rules (
                rule_name, scope, technology, pattern, fix_pattern, 
                severity, auto_fix, applies_on_edit, safety_checks, 
                warning_message, description
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            bestPracticesRule.rule_name,
            bestPracticesRule.scope,
            bestPracticesRule.technology,
            bestPracticesRule.pattern,
            bestPracticesRule.fix_pattern,
            bestPracticesRule.severity,
            bestPracticesRule.auto_fix,
            bestPracticesRule.applies_on_edit,
            bestPracticesRule.safety_checks,
            bestPracticesRule.warning_message,
            bestPracticesRule.description
        ]);

        console.log('✅ Successfully added NetSuite safety rules to MCP database!');
        console.log('📋 Rules added:');
        console.log('  1. wrapExecution requirement (with safety guards)');
        console.log('  2. @NModuleScope declaration requirement');
        console.log('  3. ErrorHandler inheritance best practice');

    } catch (error) {
        console.error('❌ Error adding safety rules:', error);
        process.exit(1);
    } finally {
        db.close();
    }
}

// Run the script
addNetSuiteSafetyRules().catch(console.error);