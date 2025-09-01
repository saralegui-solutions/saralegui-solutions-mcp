#!/usr/bin/env node

/**
 * Setup script for Multi-Scale Validation Rules Learning System
 * Initializes database, runs migrations, and sets up the validation system
 */

import { ValidationRulesMigration } from './database/migrate_validation_rules.js';
import { RulePropagationEngine } from './lib/rule_propagation_engine.js';
import CrossProjectSharingTest from './tests/test_cross_project_sharing.js';
import fs from 'fs';
import path from 'path';

class ValidationSystemSetup {
    constructor() {
        this.dbPath = path.join(process.env.HOME, 'saralegui-solutions-mcp/database/saralegui_assistant.db');
        this.setupLog = [];
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const logEntry = { timestamp, type, message };
        this.setupLog.push(logEntry);
        
        const emoji = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        }[type] || 'ℹ️';
        
        console.log(`${emoji} ${message}`);
    }

    async setup() {
        this.log('🚀 Starting Multi-Scale Validation Rules Learning System setup...');

        try {
            // 1. Check prerequisites
            await this.checkPrerequisites();

            // 2. Run database migration
            await this.runMigration();

            // 3. Verify database setup
            await this.verifyDatabase();

            // 4. Initialize sample rules
            await this.initializeSampleRules();

            // 5. Test the system
            await this.runTests();

            // 6. Setup automatic propagation (optional)
            await this.setupAutoPropagation();

            // 7. Generate configuration files
            await this.generateConfigs();

            this.log('🎉 Setup completed successfully!', 'success');
            this.printUsageInstructions();

        } catch (error) {
            this.log(`Setup failed: ${error.message}`, 'error');
            throw error;
        }
    }

    async checkPrerequisites() {
        this.log('🔍 Checking prerequisites...');

        // Check if database directory exists
        const dbDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
            this.log(`Created database directory: ${dbDir}`);
        }

        // Check Node.js version
        const nodeVersion = process.version;
        const majorVersion = parseInt(nodeVersion.substring(1).split('.')[0]);
        if (majorVersion < 16) {
            throw new Error(`Node.js 16+ required, found ${nodeVersion}`);
        }

        // Check for required dependencies
        const requiredModules = ['sqlite3', 'glob'];
        for (const module of requiredModules) {
            try {
                await import(module);
            } catch (error) {
                throw new Error(`Required module '${module}' not found. Run: npm install ${module}`);
            }
        }

        this.log('✅ Prerequisites check passed', 'success');
    }

    async runMigration() {
        this.log('🔄 Running database migration...');

        const migration = new ValidationRulesMigration();
        await migration.migrate();

        this.log('✅ Database migration completed', 'success');
    }

    async verifyDatabase() {
        this.log('🔍 Verifying database setup...');

        const sqlite3 = (await import('sqlite3')).default;
        const db = new sqlite3.Database(this.dbPath);

        // Check if key tables exist
        const tables = [
            'validation_rules',
            'rule_applications', 
            'validation_scopes',
            'rule_effectiveness',
            'code_patterns',
            'rule_categories'
        ];

        for (const table of tables) {
            const result = await new Promise((resolve, reject) => {
                db.get(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                    [table],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            if (!result) {
                throw new Error(`Table ${table} not found`);
            }
        }

        db.close();
        this.log('✅ Database verification passed', 'success');
    }

    async initializeSampleRules() {
        this.log('📋 Initializing sample validation rules...');

        const { ValidationRuleManager } = await import('./lib/validation_rule_manager.js');
        const sqlite3 = (await import('sqlite3')).default;
        
        const db = new sqlite3.Database(this.dbPath);
        const ruleManager = new ValidationRuleManager(db);

        // Add some sample rules to demonstrate the system
        const sampleRules = [
            {
                scope: 'global',
                category: 'syntax',
                priority: 'error',
                technology: 'javascript',
                pattern: 'this\\.\\w+\\s*=\\s*[^;]+;',
                message: 'Invalid class property assignment syntax',
                suggestion: 'Use getter method syntax: getPropertyName = () => value',
                autoFix: true,
                autoFixPattern: 's/this\\.(\\w+)\\s*=\\s*([^;]+);/get$1 = () => $2;/g',
                learnedFrom: 'escalon-project',
                confidence: 0.95
            },
            {
                scope: 'organization',
                category: 'performance',
                priority: 'warning',
                technology: 'suitescript',
                pattern: 'search\\.create\\(\\s*\\{[^}]*type:\\s*search\\.Type\\.[A-Z_]+',
                message: 'Consider using saved search for better performance',
                suggestion: 'Use saved searches to reduce governance unit usage',
                autoFix: false,
                learnedFrom: 'netsuite-best-practices',
                confidence: 0.8
            },
            {
                scope: 'global',
                category: 'security',
                priority: 'error',
                technology: 'javascript',
                pattern: 'eval\\s*\\(',
                message: 'Avoid using eval() - security risk',
                suggestion: 'Use safer alternatives like JSON.parse() or Function constructor',
                autoFix: false,
                learnedFrom: 'security-guidelines',
                confidence: 1.0
            }
        ];

        for (const ruleData of sampleRules) {
            try {
                const ruleId = await ruleManager.createValidationRule(ruleData);
                this.log(`Created sample rule: ${ruleId}`);
            } catch (error) {
                this.log(`Failed to create sample rule: ${error.message}`, 'warning');
            }
        }

        db.close();
        this.log('✅ Sample rules initialized', 'success');
    }

    async runTests() {
        this.log('🧪 Running system tests...');

        try {
            const test = new CrossProjectSharingTest();
            await test.initialize();
            await test.runAllTests();
            
            this.log('✅ System tests completed', 'success');
        } catch (error) {
            this.log(`Tests failed: ${error.message}`, 'warning');
            this.log('System may still work but some features might be limited', 'warning');
        }
    }

    async setupAutoPropagation() {
        this.log('🤖 Setting up automatic rule propagation...');

        const response = await this.prompt('Enable automatic rule propagation? (y/n): ');
        
        if (response.toLowerCase() === 'y' || response.toLowerCase() === 'yes') {
            // Create a service script for automatic propagation
            const serviceScript = `#!/usr/bin/env node

import { RulePropagationEngine } from './lib/rule_propagation_engine.js';
import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.join(process.env.HOME, 'saralegui-solutions-mcp/database/saralegui_assistant.db');
const db = new sqlite3.Database(dbPath);
const engine = new RulePropagationEngine(db);

console.log('🚀 Starting automatic rule propagation service...');
engine.startAutoPropagation();

process.on('SIGINT', () => {
    console.log('\\n⏹️  Stopping propagation service...');
    engine.stopAutoPropagation();
    db.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    engine.stopAutoPropagation();
    db.close();
    process.exit(0);
});
`;

            fs.writeFileSync(
                path.join(process.cwd(), 'run_propagation_service.js'),
                serviceScript
            );

            this.log('✅ Auto-propagation service script created', 'success');
            this.log('Run with: node run_propagation_service.js');
        } else {
            this.log('⏭️  Skipped auto-propagation setup');
        }
    }

    async generateConfigs() {
        this.log('⚙️  Generating configuration files...');

        // Generate package.json scripts
        const packageJsonPath = path.join(process.cwd(), 'package.json');
        let packageJson = {};

        if (fs.existsSync(packageJsonPath)) {
            packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        }

        if (!packageJson.scripts) {
            packageJson.scripts = {};
        }

        // Add validation system scripts
        packageJson.scripts['validate-project'] = 'node tools/project_validator.js validate';
        packageJson.scripts['learn-from-error'] = 'node tools/project_validator.js learn';
        packageJson.scripts['propagate-rules'] = 'node tools/project_validator.js propagate';
        packageJson.scripts['test-sharing'] = 'node tests/test_cross_project_sharing.js';

        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

        // Generate VS Code tasks (if requested)
        const response = await this.prompt('Generate VS Code tasks for validation? (y/n): ');
        if (response.toLowerCase() === 'y') {
            this.generateVSCodeTasks();
        }

        this.log('✅ Configuration files generated', 'success');
    }

    generateVSCodeTasks() {
        const tasksDir = path.join(process.cwd(), '.vscode');
        if (!fs.existsSync(tasksDir)) {
            fs.mkdirSync(tasksDir, { recursive: true });
        }

        const tasks = {
            version: "2.0.0",
            tasks: [
                {
                    label: "Validate Current Project",
                    type: "shell",
                    command: "node",
                    args: ["tools/project_validator.js", "validate", "${workspaceFolder}"],
                    group: "build",
                    presentation: {
                        echo: true,
                        reveal: "always",
                        focus: false,
                        panel: "shared"
                    }
                },
                {
                    label: "Propagate Validation Rules",
                    type: "shell",
                    command: "node",
                    args: ["tools/project_validator.js", "propagate"],
                    group: "build"
                },
                {
                    label: "Test Rule Sharing",
                    type: "shell",
                    command: "node",
                    args: ["tests/test_cross_project_sharing.js"],
                    group: "test"
                }
            ]
        };

        fs.writeFileSync(
            path.join(tasksDir, 'tasks.json'),
            JSON.stringify(tasks, null, 2)
        );

        this.log('✅ VS Code tasks created');
    }

    printUsageInstructions() {
        console.log('\n📚 Usage Instructions:');
        console.log('─'.repeat(60));
        console.log('');
        console.log('🔍 Validate a project:');
        console.log('   node tools/project_validator.js validate [path] [client]');
        console.log('');
        console.log('🧠 Learn from an error:');
        console.log('   node tools/project_validator.js learn "error message" "code"');
        console.log('');
        console.log('📈 Propagate rules:');
        console.log('   node tools/project_validator.js propagate');
        console.log('');
        console.log('🧪 Run tests:');
        console.log('   node tests/test_cross_project_sharing.js');
        console.log('');
        console.log('🤖 Start auto-propagation service:');
        console.log('   node run_propagation_service.js');
        console.log('');
        console.log('📊 Database location:');
        console.log(`   ${this.dbPath}`);
        console.log('');
        console.log('🎯 Integration with existing projects:');
        console.log('   1. Add ESLint plugin: eslint-plugin-learned-rules');
        console.log('   2. Import ValidationRuleManager in your MCP tools');
        console.log('   3. Call ruleManager.validateCode() for real-time validation');
        console.log('');
        console.log('─'.repeat(60));
        console.log('✨ The multi-scale learning system is now ready to use!');
    }

    async prompt(question) {
        const readline = await import('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            rl.question(question, (answer) => {
                rl.close();
                resolve(answer);
            });
        });
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const setup = new ValidationSystemSetup();
    
    setup.setup()
        .then(() => {
            console.log('\n🎉 Setup completed successfully!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 Setup failed:', error.message);
            process.exit(1);
        });
}

export default ValidationSystemSetup;