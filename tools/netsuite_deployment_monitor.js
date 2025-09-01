#!/usr/bin/env node

/**
 * NetSuite Deployment Monitor
 * Captures deployment errors and learns validation rules from them
 */

import fs from 'fs';
import path from 'path';
import { ValidationRuleManager } from '../lib/validation_rule_manager.js';
import { ProjectDetectionSystem } from '../lib/project_detection_system.js';
import sqlite3 from 'sqlite3';

class NetSuiteDeploymentMonitor {
    constructor() {
        this.dbPath = path.join(process.env.HOME, 'saralegui-solutions-mcp/database/saralegui_assistant.db');
        this.db = null;
        this.ruleManager = null;
        this.projectDetector = null;
        
        // Common NetSuite deployment error patterns
        this.errorPatterns = [
            {
                name: 'syntax_error',
                pattern: /SyntaxError: (.+) at line (\d+)/,
                extract: (match, content) => ({
                    error: match[1],
                    line: parseInt(match[2]),
                    type: 'syntax'
                })
            },
            {
                name: 'class_property_assignment',
                pattern: /Expected \( but found \. (.+)/,
                extract: (match, content) => ({
                    error: 'Invalid class property assignment',
                    line: this.findLineNumber(content, match[1]),
                    type: 'syntax',
                    suggestion: 'Use getter method syntax'
                })
            },
            {
                name: 'governance_limit',
                pattern: /USAGE_LIMIT_EXCEEDED|governance limit exceeded/i,
                extract: (match, content) => ({
                    error: 'NetSuite governance limit exceeded',
                    line: 0,
                    type: 'performance',
                    suggestion: 'Optimize script to reduce governance unit usage'
                })
            },
            {
                name: 'missing_module',
                pattern: /Module "(.+)" not found/,
                extract: (match, content) => ({
                    error: `Module "${match[1]}" not found`,
                    line: 0,
                    type: 'module',
                    suggestion: `Add missing module: ${match[1]}`
                })
            },
            {
                name: 'invalid_record_type',
                pattern: /Invalid record type: (.+)/,
                extract: (match, content) => ({
                    error: `Invalid record type: ${match[1]}`,
                    line: 0,
                    type: 'netsuite-api',
                    suggestion: 'Check NetSuite record type documentation'
                })
            }
        ];
    }

    async initialize() {
        console.log('🔧 Initializing NetSuite Deployment Monitor...');
        
        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                throw new Error(`Failed to connect to database: ${err.message}`);
            }
        });

        this.ruleManager = new ValidationRuleManager(this.db);
        this.projectDetector = new ProjectDetectionSystem();
        await this.projectDetector.initialize();
        
        console.log('✅ NetSuite Deployment Monitor initialized');
    }

    /**
     * Process deployment error log
     */
    async processDeploymentError(errorLog, projectPath = process.cwd()) {
        console.log('🔍 Processing NetSuite deployment error...');
        
        const detection = this.projectDetector.detectNetSuiteProject(projectPath);
        if (!detection.isNetSuiteProject) {
            console.log('⚠️  Not a NetSuite project, skipping error processing');
            return null;
        }

        const errors = this.parseErrorLog(errorLog);
        const learnedRules = [];

        for (const error of errors) {
            console.log(`❌ ${error.type}: ${error.message}`);
            
            try {
                const rule = await this.learnFromDeploymentError(error, projectPath, detection);
                if (rule) {
                    learnedRules.push(rule);
                    console.log(`🧠 Learned new rule: ${rule.rule_id || rule}`);
                }
            } catch (err) {
                console.error('❌ Failed to learn from error:', err.message);
            }
        }

        console.log(`✅ Processed ${errors.length} errors, learned ${learnedRules.length} rules`);
        return learnedRules;
    }

    /**
     * Parse deployment error log into structured errors
     */
    parseErrorLog(errorLog) {
        const errors = [];
        const lines = errorLog.split('\n');
        
        for (const line of lines) {
            for (const pattern of this.errorPatterns) {
                const match = line.match(pattern.pattern);
                if (match) {
                    const errorDetails = pattern.extract(match, errorLog);
                    errors.push({
                        ...errorDetails,
                        pattern: pattern.name,
                        originalLine: line.trim(),
                        timestamp: new Date()
                    });
                    break;
                }
            }
        }

        return errors;
    }

    /**
     * Learn validation rule from deployment error
     */
    async learnFromDeploymentError(error, projectPath, detection) {
        const errorDetails = {
            errorMessage: error.error,
            codeSnippet: this.extractCodeSnippet(error, projectPath),
            filePath: this.guessFileFromError(error, projectPath),
            lineNumber: error.line,
            projectPath,
            clientName: detection.indicators.clientName,
            fix: error.suggestion
        };

        return await this.ruleManager.learnFromError(errorDetails);
    }

    /**
     * Extract code snippet from error context
     */
    extractCodeSnippet(error, projectPath) {
        // Try to find the problematic code
        if (error.pattern === 'class_property_assignment') {
            // We know this is about class property assignment
            return 'this.PROPERTY_NAME = "value";';
        }
        
        if (error.originalLine) {
            // Extract code from the error line
            const codeMatch = error.originalLine.match(/['"`]([^'"`]*)/);
            if (codeMatch) {
                return codeMatch[1];
            }
        }

        return error.originalLine || '';
    }

    /**
     * Guess which file caused the error
     */
    guessFileFromError(error, projectPath) {
        // Try to extract file path from error message
        const filePathPattern = /(?:in|at)\s+([^:\s]+\.js)/;
        const match = error.originalLine.match(filePathPattern);
        
        if (match) {
            return path.resolve(projectPath, match[1]);
        }

        return path.join(projectPath, 'unknown.js');
    }

    /**
     * Find line number in content
     */
    findLineNumber(content, searchText) {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(searchText)) {
                return i + 1;
            }
        }
        return 0;
    }

    /**
     * Monitor NetSuite deployment logs
     */
    async monitorDeploymentLogs(logDirectory) {
        console.log(`👁️  Monitoring NetSuite deployment logs in: ${logDirectory}`);
        
        if (!fs.existsSync(logDirectory)) {
            console.log('❌ Log directory does not exist');
            return;
        }

        // Watch for new log files
        fs.watch(logDirectory, async (eventType, filename) => {
            if (eventType === 'change' && filename && filename.endsWith('.log')) {
                const logPath = path.join(logDirectory, filename);
                console.log(`📄 New deployment log detected: ${filename}`);
                
                try {
                    const logContent = fs.readFileSync(logPath, 'utf8');
                    await this.processDeploymentError(logContent);
                } catch (error) {
                    console.error('❌ Failed to process log file:', error.message);
                }
            }
        });

        console.log('✅ Log monitoring started');
    }

    /**
     * Parse Server Script Log format
     */
    parseServerScriptLog(logContent) {
        const errors = [];
        const serverScriptPattern = /Server Script Log:\s*(.+?)(?:\n|$)/g;
        
        let match;
        while ((match = serverScriptPattern.exec(logContent)) !== null) {
            const logLine = match[1];
            
            // Parse different types of server script errors
            const syntaxMatch = logLine.match(/SyntaxError: (.+?) at (\d+):(\d+)/);
            if (syntaxMatch) {
                errors.push({
                    type: 'syntax',
                    message: syntaxMatch[1],
                    line: parseInt(syntaxMatch[2]),
                    column: parseInt(syntaxMatch[3]),
                    pattern: 'server_script_syntax',
                    originalLine: logLine,
                    timestamp: new Date()
                });
            }
            
            // Parse our specific class property error
            const classPropertyMatch = logLine.match(/Expected \( but found \./);
            if (classPropertyMatch) {
                errors.push({
                    type: 'syntax',
                    message: 'Invalid class property assignment syntax',
                    line: 0,
                    pattern: 'class_property_assignment',
                    suggestion: 'Use getter method syntax: getPropertyName = () => value',
                    originalLine: logLine,
                    timestamp: new Date()
                });
            }
        }

        return errors;
    }

    /**
     * Create deployment hook script
     */
    createDeploymentHook(projectPath) {
        const hookScript = `#!/bin/bash
# NetSuite Deployment Hook
# Automatically captures deployment errors and learns from them

DEPLOYMENT_LOG_FILE="$1"
PROJECT_PATH="$2"

if [ -z "$DEPLOYMENT_LOG_FILE" ]; then
    echo "Usage: $0 <deployment_log_file> [project_path]"
    exit 1
fi

if [ -z "$PROJECT_PATH" ]; then
    PROJECT_PATH=$(pwd)
fi

echo "🚀 Processing NetSuite deployment log: $DEPLOYMENT_LOG_FILE"
echo "📁 Project path: $PROJECT_PATH"

# Run the deployment monitor
node "${path.dirname(process.argv[1])}/netsuite_deployment_monitor.js" process-log "$DEPLOYMENT_LOG_FILE" "$PROJECT_PATH"

echo "✅ Deployment error processing completed"
`;

        const hookPath = path.join(projectPath, 'deployment-hook.sh');
        fs.writeFileSync(hookPath, hookScript);
        fs.chmodSync(hookPath, 0o755);
        
        console.log(`✅ Created deployment hook script: ${hookPath}`);
        console.log('💡 Add this to your deployment process to automatically learn from errors');
        
        return hookPath;
    }

    /**
     * Generate deployment error report
     */
    async generateErrorReport(projectPath = process.cwd()) {
        const detection = this.projectDetector.detectNetSuiteProject(projectPath);
        
        const report = {
            project: projectPath,
            client: detection.indicators?.clientName,
            timestamp: new Date().toISOString(),
            errors: [],
            recommendations: []
        };

        // Get recent rule applications
        const query = `
            SELECT 
                r.rule_id,
                r.message,
                r.category,
                r.priority,
                COUNT(ra.id) as applications,
                SUM(CASE WHEN ra.success = 0 THEN 1 ELSE 0 END) as failures
            FROM validation_rules r
            JOIN rule_applications ra ON r.rule_id = ra.rule_id
            WHERE ra.project_path = ?
            AND ra.applied_at > datetime('now', '-7 days')
            GROUP BY r.rule_id
            ORDER BY failures DESC, applications DESC
            LIMIT 10
        `;

        const recentErrors = await new Promise((resolve, reject) => {
            this.db.all(query, [projectPath], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        report.errors = recentErrors;

        // Generate recommendations
        if (recentErrors.length > 0) {
            report.recommendations.push({
                type: 'validation',
                priority: 'high',
                title: 'Run Pre-deployment Validation',
                description: `${recentErrors.length} recent validation issues detected. Run validation before deployment.`
            });
        }

        const syntaxErrors = recentErrors.filter(e => e.category === 'syntax');
        if (syntaxErrors.length > 0) {
            report.recommendations.push({
                type: 'setup',
                priority: 'medium',
                title: 'Enable Real-time Linting',
                description: 'Configure ESLint to catch syntax errors before deployment.'
            });
        }

        return report;
    }

    async close() {
        if (this.db) {
            this.db.close();
        }
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const command = process.argv[2];
    const arg1 = process.argv[3];
    const arg2 = process.argv[4];
    
    const monitor = new NetSuiteDeploymentMonitor();
    
    const runCommand = async () => {
        await monitor.initialize();
        
        try {
            switch (command) {
                case 'process-log':
                    if (!arg1) {
                        throw new Error('Usage: process-log <log_file> [project_path]');
                    }
                    const logContent = fs.readFileSync(arg1, 'utf8');
                    const projectPath = arg2 || process.cwd();
                    await monitor.processDeploymentError(logContent, projectPath);
                    break;
                    
                case 'monitor':
                    const logDirectory = arg1 || './logs';
                    await monitor.monitorDeploymentLogs(logDirectory);
                    // Keep process running
                    process.stdin.resume();
                    break;
                    
                case 'create-hook':
                    const hookProjectPath = arg1 || process.cwd();
                    monitor.createDeploymentHook(hookProjectPath);
                    break;
                    
                case 'report':
                    const reportProjectPath = arg1 || process.cwd();
                    const report = await monitor.generateErrorReport(reportProjectPath);
                    console.log('📊 Deployment Error Report:');
                    console.log(JSON.stringify(report, null, 2));
                    break;
                    
                default:
                    console.log('Usage:');
                    console.log('  process-log <log_file> [project_path]  - Process deployment error log');
                    console.log('  monitor [log_directory]                - Monitor deployment logs directory');
                    console.log('  create-hook [project_path]            - Create deployment hook script');
                    console.log('  report [project_path]                 - Generate error report');
                    process.exit(1);
            }
        } finally {
            if (command !== 'monitor') {
                await monitor.close();
            }
        }
    };
    
    runCommand().catch(error => {
        console.error('❌ Deployment monitoring failed:', error.message);
        process.exit(1);
    });
}

export default NetSuiteDeploymentMonitor;