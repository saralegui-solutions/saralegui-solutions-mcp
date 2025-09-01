#!/usr/bin/env node

/**
 * Project Validation Tool
 * Integrates with MCP learning system to validate project code using learned rules
 */

import { ValidationRuleManager } from '../lib/validation_rule_manager.js';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

class ProjectValidator {
    constructor(dbPath = null) {
        this.dbPath = dbPath || path.join(process.env.HOME, 'saralegui-solutions-mcp/database/saralegui_assistant.db');
        this.db = null;
        this.ruleManager = null;
    }

    async initialize() {
        console.log('🔧 Initializing Project Validator...');
        
        // Open database connection
        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                throw new Error(`Failed to connect to database: ${err.message}`);
            }
        });

        // Initialize rule manager
        this.ruleManager = new ValidationRuleManager(this.db);
        
        console.log('✅ Project Validator initialized');
    }

    async validateProject(projectPath, options = {}) {
        const {
            clientName = this.extractClientName(projectPath),
            technologies = ['javascript', 'suitescript'],
            filePatterns = ['**/*.js'],
            excludePatterns = ['**/node_modules/**', '**/dist/**', '**/build/**']
        } = options;

        console.log(`🔍 Validating project: ${projectPath}`);
        console.log(`📋 Client: ${clientName}`);
        console.log(`🛠  Technologies: ${technologies.join(', ')}`);

        const results = {
            projectPath,
            clientName,
            totalFiles: 0,
            validatedFiles: 0,
            errors: [],
            warnings: [],
            suggestions: [],
            performance: {
                startTime: Date.now(),
                endTime: null,
                duration: 0
            }
        };

        try {
            // Find files to validate
            const filesToValidate = await this.findFilesToValidate(projectPath, filePatterns, excludePatterns);
            results.totalFiles = filesToValidate.length;

            console.log(`📁 Found ${filesToValidate.length} files to validate`);

            // Validate each file
            for (const filePath of filesToValidate) {
                try {
                    const fileResults = await this.validateFile(filePath, clientName, projectPath, technologies);
                    
                    results.errors.push(...fileResults.errors);
                    results.warnings.push(...fileResults.warnings);
                    results.suggestions.push(...fileResults.suggestions);
                    results.validatedFiles++;

                    if (fileResults.errors.length > 0 || fileResults.warnings.length > 0) {
                        console.log(`⚠️  ${path.relative(projectPath, filePath)}: ${fileResults.errors.length} errors, ${fileResults.warnings.length} warnings`);
                    }
                } catch (error) {
                    console.error(`❌ Failed to validate ${filePath}: ${error.message}`);
                    results.errors.push({
                        file: filePath,
                        line: 0,
                        column: 0,
                        message: `Validation failed: ${error.message}`,
                        severity: 'error',
                        category: 'validation'
                    });
                }
            }

            results.performance.endTime = Date.now();
            results.performance.duration = results.performance.endTime - results.performance.startTime;

            // Print summary
            this.printValidationSummary(results);

            return results;

        } catch (error) {
            console.error('❌ Project validation failed:', error.message);
            throw error;
        }
    }

    async validateFile(filePath, clientName, projectPath, technologies) {
        const content = fs.readFileSync(filePath, 'utf8');
        
        return await this.ruleManager.validateCode(
            content, 
            filePath, 
            clientName, 
            projectPath, 
            technologies
        );
    }

    async findFilesToValidate(projectPath, filePatterns, excludePatterns) {
        const { glob } = await import('glob');
        const files = [];

        for (const pattern of filePatterns) {
            const matchedFiles = await glob(pattern, {
                cwd: projectPath,
                ignore: excludePatterns,
                absolute: true
            });
            files.push(...matchedFiles);
        }

        // Remove duplicates and return
        return [...new Set(files)];
    }

    extractClientName(projectPath) {
        // Extract client name from path
        const pathParts = projectPath.split(path.sep);
        
        // Look for known client patterns
        const clientIndicators = ['esonus', 'escalon'];
        for (const indicator of clientIndicators) {
            if (pathParts.includes(indicator)) {
                return indicator;
            }
        }

        // Fallback to directory name
        return path.basename(projectPath);
    }

    printValidationSummary(results) {
        console.log('\n📊 Validation Summary:');
        console.log('─'.repeat(50));
        console.log(`📁 Project: ${results.projectPath}`);
        console.log(`👤 Client: ${results.clientName}`);
        console.log(`📄 Files: ${results.validatedFiles}/${results.totalFiles}`);
        console.log(`⏱️  Duration: ${results.performance.duration}ms`);
        console.log('');
        
        if (results.errors.length > 0) {
            console.log(`❌ Errors: ${results.errors.length}`);
        }
        
        if (results.warnings.length > 0) {
            console.log(`⚠️  Warnings: ${results.warnings.length}`);
        }
        
        if (results.suggestions.length > 0) {
            console.log(`💡 Suggestions: ${results.suggestions.length}`);
        }

        if (results.errors.length === 0 && results.warnings.length === 0) {
            console.log('✅ No issues found!');
        }
        
        console.log('─'.repeat(50));
    }

    async learnFromError(errorDetails) {
        console.log('🧠 Learning from error pattern...');
        
        try {
            const rule = await this.ruleManager.learnFromError(errorDetails);
            
            if (rule) {
                console.log(`✅ Created new validation rule: ${rule.rule_id || rule}`);
                return rule;
            } else {
                console.log('ℹ️  No new rule created (similar pattern exists)');
                return null;
            }
        } catch (error) {
            console.error('❌ Failed to learn from error:', error.message);
            throw error;
        }
    }

    async propagateRules() {
        console.log('📈 Propagating effective rules to broader scopes...');
        
        try {
            await this.ruleManager.propagateEffectiveRules();
            console.log('✅ Rule propagation completed');
        } catch (error) {
            console.error('❌ Rule propagation failed:', error.message);
            throw error;
        }
    }

    async close() {
        if (this.db) {
            this.db.close();
            console.log('📂 Database connection closed');
        }
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const validator = new ProjectValidator();
    
    const runCommand = async () => {
        await validator.initialize();
        
        try {
            switch (command) {
                case 'validate':
                    const projectPath = args[1] || process.cwd();
                    const clientName = args[2];
                    
                    const options = {};
                    if (clientName) options.clientName = clientName;
                    
                    await validator.validateProject(projectPath, options);
                    break;
                    
                case 'learn':
                    const errorMessage = args[1];
                    const codeSnippet = args[2];
                    const filePath = args[3];
                    
                    if (!errorMessage || !codeSnippet) {
                        throw new Error('Usage: learn "error message" "code snippet" [file path]');
                    }
                    
                    await validator.learnFromError({
                        errorMessage,
                        codeSnippet,
                        filePath: filePath || 'unknown',
                        projectPath: process.cwd(),
                        clientName: validator.extractClientName(process.cwd())
                    });
                    break;
                    
                case 'propagate':
                    await validator.propagateRules();
                    break;
                    
                default:
                    console.log('Usage:');
                    console.log('  validate [project_path] [client_name]  - Validate project');
                    console.log('  learn "error" "code" [file]           - Learn from error');
                    console.log('  propagate                             - Propagate effective rules');
                    process.exit(1);
            }
        } finally {
            await validator.close();
        }
    };
    
    runCommand().catch(error => {
        console.error('❌ Command failed:', error.message);
        process.exit(1);
    });
}

export default ProjectValidator;