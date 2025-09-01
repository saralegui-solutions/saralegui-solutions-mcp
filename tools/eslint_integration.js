#!/usr/bin/env node

/**
 * ESLint Integration Tool
 * Automatically extends existing .eslintrc.js files with learned validation rules
 */

import fs from 'fs';
import path from 'path';
import { ValidationRuleManager } from '../lib/validation_rule_manager.js';
import { ProjectDetectionSystem } from '../lib/project_detection_system.js';
import sqlite3 from 'sqlite3';

class ESLintIntegration {
    constructor() {
        this.dbPath = path.join(process.env.HOME, 'saralegui-solutions-mcp/database/saralegui_assistant.db');
        this.db = null;
        this.ruleManager = null;
        this.projectDetector = null;
    }

    async initialize() {
        console.log('🔧 Initializing ESLint Integration...');
        
        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                throw new Error(`Failed to connect to database: ${err.message}`);
            }
        });

        this.ruleManager = new ValidationRuleManager(this.db);
        this.projectDetector = new ProjectDetectionSystem();
        await this.projectDetector.initialize();
        
        console.log('✅ ESLint Integration initialized');
    }

    /**
     * Extend existing ESLint config with learned rules
     */
    async extendESLintConfig(projectPath = process.cwd()) {
        const eslintConfigPath = path.join(projectPath, '.eslintrc.js');
        
        if (!fs.existsSync(eslintConfigPath)) {
            console.log('❌ No .eslintrc.js found in project');
            console.log('💡 Creating new ESLint config...');
            return await this.createNewESLintConfig(projectPath);
        }

        console.log('🔍 Found existing .eslintrc.js, extending with learned rules...');
        
        // Detect project details
        const detection = this.projectDetector.detectNetSuiteProject(projectPath);
        if (!detection.isNetSuiteProject) {
            console.log('⚠️  Not a NetSuite project, skipping learned rules integration');
            return;
        }

        // Get validation rules for this project
        const scopes = this.ruleManager.determineScopesForProject(
            detection.indicators.clientName,
            projectPath
        );

        const rules = await this.ruleManager.getRulesForScope(
            scopes,
            ['javascript', 'suitescript'],
            detection.indicators.clientName,
            projectPath
        );

        console.log(`📋 Found ${rules.length} learned validation rules to integrate`);

        // Read existing config
        const existingConfig = await this.readESLintConfig(eslintConfigPath);
        
        // Generate learned rules
        const learnedRules = this.generateLearnedESLintRules(rules);
        
        // Merge configurations
        const mergedConfig = this.mergeESLintConfigs(existingConfig, learnedRules, detection);
        
        // Create backup
        const backupPath = `${eslintConfigPath}.backup.${Date.now()}`;
        fs.copyFileSync(eslintConfigPath, backupPath);
        console.log(`📄 Backed up original config to: ${path.basename(backupPath)}`);
        
        // Write merged config
        await this.writeESLintConfig(eslintConfigPath, mergedConfig);
        
        console.log('✅ Successfully extended ESLint config with learned rules');
        return {
            rulesAdded: learnedRules.rules ? Object.keys(learnedRules.rules).length : 0,
            backupPath,
            configPath: eslintConfigPath
        };
    }

    /**
     * Read and parse existing ESLint config
     */
    async readESLintConfig(configPath) {
        try {
            // Since we need to read a .js config file, we'll read it as text and parse it
            const configContent = fs.readFileSync(configPath, 'utf8');
            
            // Simple parsing - extract the module.exports object
            // This is a simplified approach, in production you'd use a proper parser
            const match = configContent.match(/module\.exports\s*=\s*({[\s\S]*});?\s*$/m);
            
            if (match) {
                // Use eval to parse the object (careful in production!)
                const configObject = eval(`(${match[1]})`);
                return configObject;
            } else {
                console.warn('⚠️  Could not parse ESLint config, using empty base');
                return {};
            }
        } catch (error) {
            console.error('❌ Failed to read ESLint config:', error.message);
            return {};
        }
    }

    /**
     * Generate ESLint rules from learned validation rules
     */
    generateLearnedESLintRules(validationRules) {
        const eslintRules = {};
        const comments = [];
        
        for (const rule of validationRules) {
            const eslintRuleName = `learned/${rule.rule_id}`;
            
            // Convert priority to ESLint severity
            let severity;
            switch (rule.priority) {
                case 'error':
                    severity = 'error';
                    break;
                case 'warning':
                    severity = 'warn';
                    break;
                default:
                    severity = 'off'; // suggestions disabled by default
            }

            eslintRules[eslintRuleName] = severity;
            
            // Add comment for documentation
            comments.push(`// ${rule.rule_id}: ${rule.message}`);
        }

        return {
            rules: eslintRules,
            comments,
            plugins: ['@saralegui/learned-rules'], // Custom plugin for learned rules
            settings: {
                'learned-rules': {
                    dbPath: this.dbPath,
                    autoUpdate: true
                }
            }
        };
    }

    /**
     * Merge existing ESLint config with learned rules
     */
    mergeESLintConfigs(existingConfig, learnedRules, projectDetection) {
        const merged = { ...existingConfig };
        
        // Merge rules
        merged.rules = {
            ...existingConfig.rules,
            ...learnedRules.rules
        };
        
        // Merge plugins
        merged.plugins = [
            ...(existingConfig.plugins || []),
            ...(learnedRules.plugins || [])
        ];
        
        // Merge settings
        merged.settings = {
            ...existingConfig.settings,
            ...learnedRules.settings
        };
        
        // Add learned rules section comment
        merged._learnedRulesInfo = {
            generated: new Date().toISOString(),
            client: projectDetection.indicators.clientName,
            rulesCount: Object.keys(learnedRules.rules).length,
            confidence: projectDetection.confidence
        };
        
        return merged;
    }

    /**
     * Write ESLint config back to file
     */
    async writeESLintConfig(configPath, config) {
        const configString = this.formatESLintConfig(config);
        fs.writeFileSync(configPath, configString);
    }

    /**
     * Format ESLint config object as JavaScript
     */
    formatESLintConfig(config) {
        const { _learnedRulesInfo, ...cleanConfig } = config;
        
        let output = '// ESLint Configuration\n';
        
        if (_learnedRulesInfo) {
            output += `// Enhanced with ${_learnedRulesInfo.rulesCount} learned validation rules\n`;
            output += `// Client: ${_learnedRulesInfo.client}\n`;
            output += `// Generated: ${_learnedRulesInfo.generated}\n`;
            output += '\n';
        }
        
        output += 'module.exports = ';
        output += JSON.stringify(cleanConfig, null, 2);
        output += ';\n';
        
        return output;
    }

    /**
     * Create new ESLint config with learned rules
     */
    async createNewESLintConfig(projectPath) {
        const detection = this.projectDetector.detectNetSuiteProject(projectPath);
        
        if (!detection.isNetSuiteProject) {
            console.log('❌ Not a NetSuite project, cannot create learned rules config');
            return null;
        }

        const scopes = this.ruleManager.determineScopesForProject(
            detection.indicators.clientName,
            projectPath
        );

        const rules = await this.ruleManager.getRulesForScope(
            scopes,
            ['javascript', 'suitescript'],
            detection.indicators.clientName,
            projectPath
        );

        const learnedRules = this.generateLearnedESLintRules(rules);
        
        // Create base NetSuite config
        const baseConfig = {
            extends: ['eslint:recommended'],
            parserOptions: {
                ecmaVersion: 2022,
                sourceType: 'script'
            },
            env: {
                node: true,
                amd: true
            },
            globals: {
                N: 'readonly',
                define: 'readonly',
                require: 'readonly',
                log: 'readonly',
                runtime: 'readonly',
                search: 'readonly',
                record: 'readonly'
            },
            rules: {
                'no-undef': 'error',
                'no-unused-vars': 'warn',
                'no-console': 'off'
            }
        };

        const mergedConfig = this.mergeESLintConfigs(baseConfig, learnedRules, detection);
        
        const configPath = path.join(projectPath, '.eslintrc.js');
        await this.writeESLintConfig(configPath, mergedConfig);
        
        console.log('✅ Created new ESLint config with learned rules');
        return {
            rulesAdded: Object.keys(learnedRules.rules).length,
            configPath
        };
    }

    /**
     * Watch for ESLint rule violations and learn from them
     */
    async watchESLintErrors(projectPath = process.cwd()) {
        console.log('👁️  Watching for ESLint errors to learn from...');
        
        // This would integrate with ESLint's programmatic API
        // For now, we'll create a simple file watcher
        const { ESLint } = await import('eslint');
        
        const eslint = new ESLint({ 
            cwd: projectPath,
            useEslintrc: true
        });
        
        // Find JavaScript files to lint
        const files = await this.findJavaScriptFiles(projectPath);
        
        for (const file of files) {
            try {
                const results = await eslint.lintFiles([file]);
                
                for (const result of results) {
                    for (const message of result.messages) {
                        // Learn from ESLint errors
                        if (message.severity === 2) { // Error level
                            await this.learnFromESLintError(message, result.filePath);
                        }
                    }
                }
            } catch (error) {
                console.error(`❌ ESLint error on ${file}:`, error.message);
            }
        }
    }

    /**
     * Learn from ESLint errors
     */
    async learnFromESLintError(eslintMessage, filePath) {
        const errorDetails = {
            errorMessage: `${eslintMessage.ruleId}: ${eslintMessage.message}`,
            codeSnippet: eslintMessage.source || '',
            filePath,
            lineNumber: eslintMessage.line,
            projectPath: path.dirname(filePath),
            clientName: this.projectDetector.extractClientName(filePath)
        };

        try {
            const rule = await this.ruleManager.learnFromError(errorDetails);
            if (rule) {
                console.log(`🧠 Learned new rule from ESLint error: ${rule.rule_id || rule}`);
            }
        } catch (error) {
            console.error('❌ Failed to learn from ESLint error:', error.message);
        }
    }

    /**
     * Find JavaScript files in project
     */
    async findJavaScriptFiles(directory) {
        const files = [];
        const jsPattern = /\\.js$/;
        
        const scanDirectory = (dir) => {
            if (!fs.existsSync(dir)) return;
            
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory()) {
                    if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
                        scanDirectory(fullPath);
                    }
                } else if (entry.isFile() && jsPattern.test(entry.name)) {
                    files.push(fullPath);
                }
            }
        };
        
        scanDirectory(directory);
        return files;
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
    const projectPath = process.argv[3] || process.cwd();
    
    const integration = new ESLintIntegration();
    
    const runCommand = async () => {
        await integration.initialize();
        
        try {
            switch (command) {
                case 'extend':
                    const result = await integration.extendESLintConfig(projectPath);
                    if (result) {
                        console.log(`🎉 Added ${result.rulesAdded} learned rules to ESLint config`);
                    }
                    break;
                    
                case 'watch':
                    await integration.watchESLintErrors(projectPath);
                    break;
                    
                case 'create':
                    const created = await integration.createNewESLintConfig(projectPath);
                    if (created) {
                        console.log(`🎉 Created ESLint config with ${created.rulesAdded} learned rules`);
                    }
                    break;
                    
                default:
                    console.log('Usage:');
                    console.log('  extend [project_path]  - Extend existing .eslintrc.js with learned rules');
                    console.log('  create [project_path]  - Create new .eslintrc.js with learned rules');
                    console.log('  watch [project_path]   - Watch for ESLint errors and learn from them');
                    process.exit(1);
            }
        } finally {
            await integration.close();
        }
    };
    
    runCommand().catch(error => {
        console.error('❌ ESLint integration failed:', error.message);
        process.exit(1);
    });
}

export default ESLintIntegration;