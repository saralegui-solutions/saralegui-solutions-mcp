/**
 * ESLint Plugin for Learned Validation Rules
 * Integrates MCP learned rules with ESLint for real-time validation
 */

import { ValidationRuleManager } from '../lib/validation_rule_manager.js';
import sqlite3 from 'sqlite3';
import path from 'path';

class LearnedRulesPlugin {
    constructor() {
        this.ruleManager = null;
        this.db = null;
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;

        const dbPath = path.join(process.env.HOME, 'saralegui-solutions-mcp/database/saralegui_assistant.db');
        
        this.db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                console.error('Failed to connect to MCP database:', err.message);
                return;
            }
        });

        this.ruleManager = new ValidationRuleManager(this.db);
        this.isInitialized = true;
    }

    createESLintRule(validationRule) {
        return {
            meta: {
                type: validationRule.priority === 'error' ? 'problem' : 'suggestion',
                docs: {
                    description: validationRule.message,
                    category: validationRule.category,
                    recommended: validationRule.confidence > 0.7
                },
                fixable: validationRule.auto_fix ? 'code' : null,
                schema: []
            },

            create(context) {
                return {
                    Program(node) {
                        const sourceCode = context.getSourceCode();
                        const text = sourceCode.getText();
                        
                        // Apply the learned rule pattern
                        if (validationRule.compiledPattern) {
                            const matches = text.matchAll(validationRule.compiledPattern);
                            
                            for (const match of matches) {
                                const start = match.index;
                                const startPos = sourceCode.getLocFromIndex(start);
                                
                                context.report({
                                    node,
                                    loc: startPos,
                                    message: validationRule.message,
                                    fix: validationRule.auto_fix ? (fixer) => {
                                        if (validationRule.autoFixReplacement) {
                                            return fixer.replaceTextRange(
                                                [start, start + match[0].length],
                                                validationRule.autoFixReplacement
                                            );
                                        }
                                        return null;
                                    } : null
                                });
                            }
                        }
                    }
                };
            }
        };
    }

    async generateESLintConfig(projectPath, clientName = null) {
        await this.initialize();
        
        try {
            const scopes = this.ruleManager.determineScopesForProject(clientName, projectPath);
            const rules = await this.ruleManager.getRulesForScope(
                scopes, 
                ['javascript', 'suitescript'], 
                clientName, 
                projectPath
            );

            const eslintRules = {};
            const customRules = {};

            for (const rule of rules) {
                const ruleName = `learned/${rule.rule_id}`;
                
                // Set rule severity based on priority
                let severity;
                switch (rule.priority) {
                    case 'error':
                        severity = 'error';
                        break;
                    case 'warning':
                        severity = 'warn';
                        break;
                    default:
                        severity = 'off'; // suggestions are off by default
                }

                eslintRules[ruleName] = severity;
                customRules[rule.rule_id] = this.createESLintRule(rule);
            }

            const config = {
                plugins: ['learned-rules'],
                rules: eslintRules,
                settings: {
                    'learned-rules': {
                        projectPath,
                        clientName,
                        dbPath: this.dbPath
                    }
                }
            };

            return { config, customRules };

        } catch (error) {
            console.error('Failed to generate ESLint config:', error.message);
            return { config: { rules: {} }, customRules: {} };
        }
    }
}

// ESLint plugin export
const plugin = {
    rules: {},
    
    async generateRules(projectPath, clientName) {
        const generator = new LearnedRulesPlugin();
        const { customRules } = await generator.generateESLintConfig(projectPath, clientName);
        
        // Dynamically add rules to plugin
        Object.assign(this.rules, customRules);
        
        return customRules;
    }
};

// For dynamic loading in ESLint configs
export async function createLearnedRulesConfig(projectPath, clientName = null) {
    const generator = new LearnedRulesPlugin();
    return await generator.generateESLintConfig(projectPath, clientName);
}

export default plugin;
export { LearnedRulesPlugin };