/**
 * Project Detection System
 * Automatically detects NetSuite projects and activates validation rules
 */

import fs from 'fs';
import path from 'path';
import { ValidationRuleManager } from './validation_rule_manager.js';
import sqlite3 from 'sqlite3';

export class ProjectDetectionSystem {
    constructor() {
        this.dbPath = path.join(process.env.HOME, 'saralegui-solutions-mcp/database/saralegui_assistant.db');
        this.db = null;
        this.ruleManager = null;
        this.isActive = false;
        this.watchedDirectories = new Set();
        this.currentProject = null;
        
        // NetSuite project indicators
        this.netSuiteIndicators = [
            'src/FileCabinet/SuiteScripts',
            '.eslintrc.js',
            'manifest.xml',
            /.*(_ue|_sl|_mr|_cs|_wfas|_rl)\.js$/,
            /.*\/netsuite-modules\/.*\.js$/
        ];
    }

    async initialize() {
        console.log('🔍 Initializing Project Detection System...');
        
        // Connect to database
        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                console.error('Failed to connect to MCP database:', err.message);
                return;
            }
        });
        
        this.ruleManager = new ValidationRuleManager(this.db);
        this.isActive = true;
        
        console.log('✅ Project Detection System initialized');
    }

    /**
     * Detect if current directory is a NetSuite project
     */
    detectNetSuiteProject(directory = process.cwd()) {
        console.log(`🔍 Scanning directory: ${directory}`);
        
        const indicators = {
            hasManifest: false,
            hasSuiteScripts: false,
            hasNetSuiteFiles: false,
            hasESLintConfig: false,
            clientName: null,
            projectType: null
        };

        try {
            // Check for manifest.xml
            if (fs.existsSync(path.join(directory, 'manifest.xml'))) {
                indicators.hasManifest = true;
            }

            // Check for SuiteScripts directory structure
            const suiteScriptsPath = this.findSuiteScriptsDirectory(directory);
            if (suiteScriptsPath) {
                indicators.hasSuiteScripts = true;
                indicators.clientName = this.extractClientName(suiteScriptsPath);
            }

            // Check for NetSuite file patterns
            const netSuiteFiles = this.findNetSuiteFiles(directory);
            if (netSuiteFiles.length > 0) {
                indicators.hasNetSuiteFiles = true;
                indicators.projectType = this.determineProjectType(netSuiteFiles);
            }

            // Check for ESLint config
            if (fs.existsSync(path.join(directory, '.eslintrc.js'))) {
                indicators.hasESLintConfig = true;
            }

            const confidence = this.calculateProjectConfidence(indicators);
            
            return {
                isNetSuiteProject: confidence > 0.6,
                confidence,
                indicators,
                directory,
                recommendations: this.generateRecommendations(indicators)
            };

        } catch (error) {
            console.error('Error detecting project:', error.message);
            return {
                isNetSuiteProject: false,
                confidence: 0,
                indicators,
                directory,
                error: error.message
            };
        }
    }

    /**
     * Find SuiteScripts directory in project
     */
    findSuiteScriptsDirectory(baseDir) {
        const commonPaths = [
            'src/FileCabinet/SuiteScripts',
            'FileCabinet/SuiteScripts', 
            'SuiteScripts',
            'src/SuiteScripts'
        ];

        for (const relativePath of commonPaths) {
            const fullPath = path.join(baseDir, relativePath);
            if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isDirectory()) {
                return fullPath;
            }
        }

        return null;
    }

    /**
     * Extract client name from project path
     */
    extractClientName(suiteScriptsPath) {
        // Look for client directory name in SuiteScripts structure
        const pathParts = suiteScriptsPath.split(path.sep);
        
        // Common patterns: .../SuiteScripts/ClientName/...
        const suiteScriptsIndex = pathParts.findIndex(part => part === 'SuiteScripts');
        if (suiteScriptsIndex !== -1 && pathParts[suiteScriptsIndex + 1]) {
            return pathParts[suiteScriptsIndex + 1];
        }
        
        // Try to extract from parent directories
        const clientIndicators = ['esonus', 'escalon'];
        for (const indicator of clientIndicators) {
            if (pathParts.includes(indicator)) {
                return indicator;
            }
        }

        // Fallback to directory name
        return path.basename(path.dirname(suiteScriptsPath));
    }

    /**
     * Find NetSuite specific files
     */
    findNetSuiteFiles(directory) {
        const netSuiteFiles = [];
        const netSuitePattern = /.*(_ue|_sl|_mr|_cs|_wfas|_rl)\.js$/;

        const scanDirectory = (dir) => {
            if (!fs.existsSync(dir)) return;
            
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory()) {
                    // Skip node_modules and other irrelevant directories
                    if (!['node_modules', '.git', '.vscode', 'dist', 'build'].includes(entry.name)) {
                        scanDirectory(fullPath);
                    }
                } else if (entry.isFile()) {
                    if (netSuitePattern.test(entry.name)) {
                        netSuiteFiles.push(fullPath);
                    }
                }
            }
        };

        scanDirectory(directory);
        return netSuiteFiles;
    }

    /**
     * Determine project type based on files found
     */
    determineProjectType(netSuiteFiles) {
        const fileTypes = new Set();
        
        netSuiteFiles.forEach(file => {
            const match = file.match(/_([a-z]+)\.js$/);
            if (match) {
                fileTypes.add(match[1]);
            }
        });

        // Map to descriptive project types
        const typeMap = {
            'ue': 'User Event',
            'sl': 'Suitelet',
            'mr': 'Map/Reduce',
            'cs': 'Client Script',
            'wfas': 'Workflow Action Script',
            'rl': 'Restlet'
        };

        const types = Array.from(fileTypes).map(type => typeMap[type] || type);
        return types.length > 0 ? types.join(', ') : 'Unknown';
    }

    /**
     * Calculate confidence score for NetSuite project detection
     */
    calculateProjectConfidence(indicators) {
        let confidence = 0;

        if (indicators.hasManifest) confidence += 0.4;
        if (indicators.hasSuiteScripts) confidence += 0.3;
        if (indicators.hasNetSuiteFiles) confidence += 0.3;
        if (indicators.hasESLintConfig) confidence += 0.1;
        if (indicators.clientName) confidence += 0.1;

        return Math.min(1.0, confidence);
    }

    /**
     * Generate recommendations for project setup
     */
    generateRecommendations(indicators) {
        const recommendations = [];

        if (!indicators.hasESLintConfig) {
            recommendations.push({
                type: 'setup',
                priority: 'high',
                title: 'Add ESLint Configuration',
                description: 'Create .eslintrc.js with NetSuite-specific rules',
                action: 'create_eslint_config'
            });
        }

        if (indicators.hasNetSuiteFiles && !indicators.hasSuiteScripts) {
            recommendations.push({
                type: 'warning',
                priority: 'medium',
                title: 'SuiteScripts Directory Structure',
                description: 'NetSuite files found but standard directory structure missing',
                action: 'verify_structure'
            });
        }

        if (indicators.clientName) {
            recommendations.push({
                type: 'info',
                priority: 'low',
                title: 'Client-Specific Rules',
                description: `Load validation rules for client: ${indicators.clientName}`,
                action: 'load_client_rules'
            });
        }

        return recommendations;
    }

    /**
     * Auto-activate validation for detected NetSuite projects
     */
    async autoActivateValidation(projectPath = process.cwd()) {
        const detection = this.detectNetSuiteProject(projectPath);
        
        if (!detection.isNetSuiteProject) {
            console.log('⏭️  Not a NetSuite project, skipping validation activation');
            return null;
        }

        console.log(`🎯 NetSuite project detected (${(detection.confidence * 100).toFixed(1)}% confidence)`);
        console.log(`📁 Project: ${projectPath}`);
        console.log(`👤 Client: ${detection.indicators.clientName}`);
        console.log(`🔧 Type: ${detection.indicators.projectType}`);

        // Activate validation rules
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

        console.log(`📋 Loaded ${rules.length} validation rules`);

        // Process recommendations
        for (const recommendation of detection.recommendations) {
            await this.processRecommendation(recommendation, detection);
        }

        this.currentProject = {
            path: projectPath,
            client: detection.indicators.clientName,
            type: detection.indicators.projectType,
            rules: rules.length,
            activated: new Date()
        };

        return this.currentProject;
    }

    /**
     * Process a recommendation action
     */
    async processRecommendation(recommendation, detection) {
        console.log(`💡 ${recommendation.title}: ${recommendation.description}`);

        switch (recommendation.action) {
            case 'create_eslint_config':
                await this.createESLintConfig(detection);
                break;
                
            case 'load_client_rules':
                // Already handled in main activation
                break;
                
            case 'verify_structure':
                console.log('⚠️  Please verify your SuiteScripts directory structure');
                break;
        }
    }

    /**
     * Create ESLint configuration for NetSuite project
     */
    async createESLintConfig(detection) {
        const configPath = path.join(detection.directory, '.eslintrc.js');
        
        if (fs.existsSync(configPath)) {
            console.log('📝 ESLint config already exists, skipping creation');
            return;
        }

        const config = `module.exports = {
    extends: [
        'eslint:recommended'
    ],
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'script' // NetSuite uses CommonJS
    },
    env: {
        node: true,
        amd: true // NetSuite's module system
    },
    globals: {
        // NetSuite global objects
        N: 'readonly',
        define: 'readonly',
        require: 'readonly',
        
        // SuiteScript 2.x modules
        log: 'readonly',
        runtime: 'readonly',
        search: 'readonly',
        record: 'readonly',
        file: 'readonly',
        email: 'readonly',
        url: 'readonly',
        https: 'readonly',
        render: 'readonly',
        format: 'readonly',
        
        // Browser globals for client scripts
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        
        // NetSuite UI objects
        nlapiGetContext: 'readonly',
        nlapiGetUser: 'readonly'
    },
    rules: {
        // NetSuite-specific rules
        'no-undef': 'error',
        'no-unused-vars': 'warn',
        'no-console': 'off', // Console is used in NetSuite debugging
        
        // Code quality
        'no-var': 'error',
        'prefer-const': 'error',
        'eqeqeq': 'error',
        'curly': 'error',
        
        // NetSuite governance
        'max-statements': ['warn', 100], // Governance limit consideration
        'max-depth': ['warn', 6],
        'complexity': ['warn', 15]
    },
    overrides: [
        {
            files: ['**/*_cs.js'], // Client scripts
            env: {
                browser: true
            },
            rules: {
                'no-alert': 'warn'
            }
        },
        {
            files: ['**/*_ue.js', '**/*_sl.js', '**/*_mr.js'], // Server scripts
            rules: {
                'no-alert': 'error' // No browser alerts in server scripts
            }
        }
    ]
};
`;

        fs.writeFileSync(configPath, config);
        console.log('✅ Created ESLint configuration for NetSuite project');
    }

    /**
     * Monitor directory for NetSuite projects
     */
    async monitorDirectory(directory = process.cwd()) {
        if (this.watchedDirectories.has(directory)) {
            console.log(`👁️  Already monitoring: ${directory}`);
            return;
        }

        console.log(`👁️  Monitoring directory for NetSuite projects: ${directory}`);
        this.watchedDirectories.add(directory);

        // Initial scan
        await this.autoActivateValidation(directory);

        // Watch for changes (simplified - in production would use fs.watch)
        // For now, just scan periodically
        setInterval(async () => {
            const detection = this.detectNetSuiteProject(directory);
            if (detection.isNetSuiteProject && !this.currentProject) {
                console.log('🔄 New NetSuite project detected, activating validation...');
                await this.autoActivateValidation(directory);
            }
        }, 30000); // Check every 30 seconds
    }

    /**
     * Get current project status
     */
    getCurrentProject() {
        return this.currentProject;
    }

    /**
     * Deactivate validation for current project
     */
    deactivateValidation() {
        if (this.currentProject) {
            console.log(`⏹️  Deactivated validation for: ${this.currentProject.path}`);
            this.currentProject = null;
        }
    }
}

export default ProjectDetectionSystem;