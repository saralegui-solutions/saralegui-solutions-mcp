/**
 * Validation Rule Manager for Multi-Scale Learning System
 * Manages validation rules across global, organization, client, and project scopes
 */

import { LearningEngine } from './learning_engine.js';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import crypto from 'crypto';

export class ValidationRuleManager extends LearningEngine {
    constructor(db) {
        super(db);
        this.ruleCache = new Map(); // Cache for frequently accessed rules
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
        this.patternCompileCache = new Map(); // Compiled regex patterns cache
        
        // Rule auto-learning thresholds
        this.autoLearnThreshold = 3; // Create rule after 3 occurrences
        this.highConfidenceThreshold = 0.8; // Auto-propagate at high confidence
        this.lowConfidenceThreshold = 0.3; // Disable rule at low confidence
    }

    /**
     * Get validation rules for a specific scope and technology
     */
    async getRulesForScope(scopes, technologies = ['javascript', 'suitescript'], clientName = null, projectPath = null) {
        const cacheKey = `${scopes.join('|')}|${technologies.join('|')}|${clientName}|${projectPath}`;
        
        // Check cache first
        if (this.ruleCache.has(cacheKey)) {
            const cached = this.ruleCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheExpiry) {
                return cached.rules;
            }
        }

        const placeholders = scopes.map(() => '?').join(',');
        const techPlaceholders = technologies.map(() => '?').join(',');
        
        const query = `
            SELECT r.*, rc.description as category_description
            FROM validation_rules r
            LEFT JOIN rule_categories rc ON r.category = rc.category_name AND r.technology = rc.technology
            WHERE r.scope IN (${placeholders})
            AND r.technology IN (${techPlaceholders})
            AND r.is_active = 1
            ORDER BY 
                CASE r.scope 
                    WHEN 'project' THEN 1
                    WHEN 'client' THEN 2  
                    WHEN 'organization' THEN 3
                    WHEN 'global' THEN 4
                END,
                r.priority = 'error' DESC,
                r.priority = 'warning' DESC,
                r.effectiveness_score DESC,
                r.confidence DESC
        `;

        const params = [...scopes, ...technologies];
        const rules = await this.dbAll(query, params);
        
        // Compile regex patterns and cache
        const compiledRules = rules.map(rule => ({
            ...rule,
            compiledPattern: this.compilePattern(rule.pattern_text, rule.pattern_type),
            autoFixPattern: rule.auto_fix_pattern ? new RegExp(rule.auto_fix_pattern, 'g') : null
        }));

        // Cache the results
        this.ruleCache.set(cacheKey, {
            rules: compiledRules,
            timestamp: Date.now()
        });

        return compiledRules;
    }

    /**
     * Apply validation rules to code content
     */
    async validateCode(content, filePath, clientName, projectPath, technologies = ['javascript']) {
        const scopes = this.determineScopesForProject(clientName, projectPath);
        const rules = await this.getRulesForScope(scopes, technologies, clientName, projectPath);
        
        const results = {
            errors: [],
            warnings: [],
            suggestions: [],
            performance: {
                rulesApplied: 0,
                executionTime: 0,
                cacheHits: 0
            }
        };

        const startTime = Date.now();
        
        for (const rule of rules) {
            const ruleStartTime = Date.now();
            
            try {
                const matches = await this.applyRule(rule, content, filePath);
                
                for (const match of matches) {
                    const issue = {
                        ruleId: rule.rule_id,
                        line: match.line,
                        column: match.column,
                        message: rule.message,
                        suggestion: rule.suggestion,
                        autoFix: rule.auto_fix,
                        autoFixReplacement: match.autoFixReplacement,
                        severity: rule.priority,
                        category: rule.category,
                        matchedText: match.text
                    };

                    // Categorize by priority
                    if (rule.priority === 'error') {
                        results.errors.push(issue);
                    } else if (rule.priority === 'warning') {
                        results.warnings.push(issue);
                    } else {
                        results.suggestions.push(issue);
                    }

                    // Track rule application
                    await this.trackRuleApplication(
                        rule.rule_id,
                        projectPath,
                        clientName,
                        filePath,
                        match.line,
                        true, // success - found a match
                        Date.now() - ruleStartTime
                    );
                }

                results.performance.rulesApplied++;
                
            } catch (error) {
                console.error(`Error applying rule ${rule.rule_id}:`, error.message);
                
                // Track failed rule application
                await this.trackRuleApplication(
                    rule.rule_id,
                    projectPath,
                    clientName,
                    filePath,
                    0,
                    false, // failed
                    Date.now() - ruleStartTime
                );
            }
        }

        results.performance.executionTime = Date.now() - startTime;
        return results;
    }

    /**
     * Apply a single rule to content
     */
    async applyRule(rule, content, filePath) {
        const matches = [];
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNumber = i + 1;
            
            let match;
            const pattern = rule.compiledPattern;
            
            if (!pattern) continue;
            
            // Reset regex lastIndex for global patterns
            pattern.lastIndex = 0;
            
            while ((match = pattern.exec(line)) !== null) {
                const matchResult = {
                    line: lineNumber,
                    column: match.index + 1,
                    text: match[0],
                    autoFixReplacement: null
                };

                // Generate auto-fix if available
                if (rule.auto_fix && rule.auto_fix_pattern) {
                    matchResult.autoFixReplacement = this.generateAutoFix(
                        line, 
                        rule.auto_fix_pattern, 
                        match
                    );
                }

                matches.push(matchResult);

                // Prevent infinite loops with global regex
                if (!pattern.global) break;
            }
        }

        return matches;
    }

    /**
     * Learn new validation rule from error pattern
     */
    async learnFromError(errorDetails, context) {
        const {
            errorMessage,
            codeSnippet,
            filePath,
            lineNumber,
            projectPath,
            clientName,
            fix
        } = errorDetails;

        // Extract pattern from error
        const pattern = await this.extractPatternFromError(errorDetails);
        
        if (!pattern) {
            console.log('Could not extract pattern from error');
            return null;
        }

        // Check if similar rule already exists
        const existingRule = await this.findSimilarRule(pattern);
        
        if (existingRule) {
            // Update existing rule confidence and occurrences
            await this.updateRuleOccurrence(existingRule.rule_id);
            return existingRule;
        }

        // Determine scope for new rule
        const scope = this.determineRuleScope(pattern, context);
        
        // Create new rule
        const rule = await this.createValidationRule({
            scope,
            category: this.categorizePattern(pattern, errorMessage),
            priority: this.determinePriority(errorMessage),
            technology: this.determineTechnology(filePath, context),
            pattern: pattern.pattern,
            message: this.generateRuleMessage(errorMessage),
            suggestion: fix || this.generateSuggestion(pattern, errorMessage),
            autoFix: !!fix,
            autoFixPattern: fix ? this.generateAutoFixPattern(pattern, fix) : null,
            learnedFrom: projectPath,
            confidence: pattern.confidence || 0.6
        });

        // Track pattern occurrence
        await this.trackCodePattern(pattern, context);

        return rule;
    }

    /**
     * Create a new validation rule
     */
    async createValidationRule(ruleData) {
        const ruleId = this.generateRuleId(ruleData);
        
        const query = `
            INSERT INTO validation_rules (
                rule_id, scope, category, priority, technology,
                pattern_text, pattern_type, message, suggestion,
                auto_fix, auto_fix_pattern, learned_from, confidence,
                created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            ruleId,
            ruleData.scope,
            ruleData.category,
            ruleData.priority,
            ruleData.technology,
            ruleData.pattern,
            ruleData.patternType || 'regex',
            ruleData.message,
            ruleData.suggestion,
            ruleData.autoFix ? 1 : 0,
            ruleData.autoFixPattern,
            ruleData.learnedFrom,
            ruleData.confidence,
            'learning-system'
        ];

        await this.dbRun(query, params);
        
        // Clear cache to force reload
        this.ruleCache.clear();

        console.log(`✅ Created new validation rule: ${ruleId}`);
        return ruleId;
    }

    /**
     * Propagate rules across scopes based on effectiveness
     */
    async propagateEffectiveRules() {
        const query = `
            SELECT r.*, 
                   COUNT(ra.id) as applications,
                   SUM(CASE WHEN ra.success = 1 THEN 1 ELSE 0 END) as successes,
                   AVG(r.effectiveness_score) as avg_effectiveness
            FROM validation_rules r
            JOIN rule_applications ra ON r.rule_id = ra.rule_id
            WHERE r.scope IN ('project', 'client')
            AND r.effectiveness_score > ?
            AND r.confidence > ?
            GROUP BY r.rule_id
            HAVING applications >= ?
            ORDER BY avg_effectiveness DESC
        `;

        const candidateRules = await this.dbAll(query, [
            0.7, // High effectiveness
            this.highConfidenceThreshold,
            this.autoLearnThreshold
        ]);

        for (const rule of candidateRules) {
            const newScope = this.calculateNewScope(rule);
            
            if (newScope !== rule.scope) {
                await this.promoteRule(rule.rule_id, newScope);
                console.log(`📈 Promoted rule ${rule.rule_id} from ${rule.scope} to ${newScope}`);
            }
        }
    }

    /**
     * Track rule application for effectiveness measurement
     */
    async trackRuleApplication(ruleId, projectPath, clientName, filePath, lineNumber, success, executionTime) {
        const query = `
            INSERT INTO rule_applications (
                rule_id, project_path, client_name, file_path, line_number,
                success, applied_at, execution_time_ms
            ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
        `;

        await this.dbRun(query, [
            ruleId, projectPath, clientName, filePath, lineNumber,
            success ? 1 : 0, executionTime
        ]);
    }

    /**
     * Helper methods
     */
    compilePattern(patternText, patternType = 'regex') {
        const cacheKey = `${patternText}|${patternType}`;
        
        if (this.patternCompileCache.has(cacheKey)) {
            return this.patternCompileCache.get(cacheKey);
        }

        let compiledPattern = null;
        
        try {
            if (patternType === 'regex') {
                compiledPattern = new RegExp(patternText, 'gm');
            }
            // Add support for AST patterns in the future
            
            this.patternCompileCache.set(cacheKey, compiledPattern);
        } catch (error) {
            console.error(`Failed to compile pattern: ${patternText}`, error);
        }

        return compiledPattern;
    }

    determineScopesForProject(clientName, projectPath) {
        const scopes = ['global'];
        
        if (clientName) {
            scopes.push('organization', 'client');
        }
        
        if (projectPath) {
            scopes.push('project');
        }

        return scopes;
    }

    generateRuleId(ruleData) {
        const hash = crypto
            .createHash('md5')
            .update(`${ruleData.pattern}|${ruleData.category}|${ruleData.technology}`)
            .digest('hex')
            .substring(0, 8);
            
        return `${ruleData.category}-${ruleData.technology}-${hash}`;
    }

    categorizePattern(pattern, errorMessage) {
        const message = errorMessage.toLowerCase();
        
        if (message.includes('syntax')) return 'syntax';
        if (message.includes('performance') || message.includes('governance')) return 'performance';
        if (message.includes('security')) return 'security';
        if (message.includes('style') || message.includes('convention')) return 'style';
        if (message.includes('netsuite') || message.includes('api')) return 'netsuite-api';
        
        return 'general';
    }

    determinePriority(errorMessage) {
        const message = errorMessage.toLowerCase();
        
        if (message.includes('error') || message.includes('syntax')) return 'error';
        if (message.includes('warning') || message.includes('performance')) return 'warning';
        
        return 'suggestion';
    }

    determineTechnology(filePath, context) {
        const ext = filePath ? filePath.split('.').pop().toLowerCase() : '';
        
        if (ext === 'js') {
            if (context && (context.includes('netsuite') || context.includes('suitescript'))) {
                return 'suitescript';
            }
            return 'javascript';
        }
        
        return 'general';
    }

    /**
     * Extract pattern from error details
     */
    async extractPatternFromError(errorDetails) {
        const { errorMessage, codeSnippet, filePath } = errorDetails;
        
        if (!codeSnippet) return null;
        
        // NetSuite-specific patterns
        if (errorMessage.includes('Expected ( but found .') && codeSnippet.includes('this.')) {
            // Class property assignment error
            return {
                pattern: 'this\\.\\w+\\s*=\\s*[^;]+;',
                patternType: 'regex',
                confidence: 0.9,
                category: 'syntax',
                description: 'Invalid class property assignment'
            };
        }
        
        // SuiteScript governance patterns  
        if (errorMessage.includes('governance') || errorMessage.includes('USAGE_LIMIT_EXCEEDED')) {
            return {
                pattern: '\\b(search\\.create|record\\.load|record\\.save)\\b',
                patternType: 'regex', 
                confidence: 0.8,
                category: 'performance',
                description: 'Potential governance issue'
            };
        }
        
        // Generic patterns
        if (errorMessage.includes('undefined') && codeSnippet) {
            // Extract the undefined variable/property
            const undefinedMatch = codeSnippet.match(/(\w+)\s+is\s+not\s+defined|Cannot\s+read\s+property\s+'(\w+)'/);
            if (undefinedMatch) {
                const variable = undefinedMatch[1] || undefinedMatch[2];
                return {
                    pattern: `\\b${variable}\\b`,
                    patternType: 'regex',
                    confidence: 0.7,
                    category: 'general',
                    description: `Undefined variable: ${variable}`
                };
            }
        }
        
        return null;
    }

    /**
     * Find similar existing rule
     */
    async findSimilarRule(pattern) {
        const query = `
            SELECT * FROM validation_rules 
            WHERE pattern_text = ? 
            AND technology = ?
            AND is_active = 1
            LIMIT 1
        `;
        
        return await this.dbGet(query, [pattern.pattern, pattern.technology || 'javascript']);
    }

    /**
     * Update rule occurrence count and confidence
     */
    async updateRuleOccurrence(ruleId) {
        const query = `
            UPDATE validation_rules 
            SET occurrences = occurrences + 1,
                confidence = MIN(1.0, confidence + 0.05),
                updated_at = CURRENT_TIMESTAMP
            WHERE rule_id = ?
        `;
        
        await this.dbRun(query, [ruleId]);
    }

    /**
     * Determine appropriate scope for a new rule based on pattern and context
     */
    determineRuleScope(pattern, context) {
        const { projectPath, clientName, errorMessage } = context;
        
        // Global scope rules (syntax errors, fundamental language issues)
        if (pattern.category === 'syntax' || 
            errorMessage.includes('SyntaxError') ||
            errorMessage.includes('ReferenceError')) {
            return 'global';
        }
        
        // NetSuite-specific rules should be organization-wide
        if (pattern.category === 'performance' && 
            (errorMessage.includes('governance') || errorMessage.includes('USAGE_LIMIT'))) {
            return 'organization';
        }
        
        // Client-specific patterns
        if (clientName && pattern.category === 'netsuite-api') {
            return 'client';
        }
        
        // Project-specific by default
        return 'project';
    }

    /**
     * Generate auto-fix pattern for common issues
     */
    generateAutoFixPattern(pattern, fix) {
        if (!fix) return null;
        
        // Class property assignment fix
        if (pattern.pattern.includes('this\\.\\w+\\s*=')) {
            return 's/this\\.(\\w+)\\s*=\\s*([^;]+);/get$1 = () => $2;/g';
        }
        
        // Generic replacement pattern
        return `s/${pattern.pattern}/${fix}/g`;
    }

    /**
     * Generate auto-fix replacement for a match
     */
    generateAutoFix(line, autoFixPattern, match) {
        try {
            if (autoFixPattern.startsWith('s/')) {
                // Sed-style replacement
                const parts = autoFixPattern.split('/');
                if (parts.length >= 4) {
                    const searchPattern = new RegExp(parts[1], parts[3] || '');
                    const replacement = parts[2];
                    return line.replace(searchPattern, replacement);
                }
            }
            return null;
        } catch (error) {
            console.error('Auto-fix generation failed:', error);
            return null;
        }
    }

    /**
     * Promote rule to broader scope
     */
    async promoteRule(ruleId, newScope) {
        const query = `
            UPDATE validation_rules 
            SET scope = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE rule_id = ?
        `;
        
        await this.dbRun(query, [newScope, ruleId]);
    }

    /**
     * Calculate new scope for rule promotion
     */
    calculateNewScope(rule) {
        const { scope, effectiveness_score, applications, successes } = rule;
        
        const successRate = applications > 0 ? (successes / applications) : 0;
        
        // Only promote highly effective rules
        if (effectiveness_score < 0.8 || successRate < 0.7) {
            return scope;
        }
        
        // Promotion ladder
        switch (scope) {
            case 'project':
                return applications >= 5 ? 'client' : 'project';
            case 'client':
                return applications >= 10 ? 'organization' : 'client';
            case 'organization':
                return applications >= 20 ? 'global' : 'organization';
            default:
                return scope;
        }
    }

    /**
     * Track code patterns for learning
     */
    async trackCodePattern(pattern, context) {
        const signature = crypto
            .createHash('md5')
            .update(pattern.pattern + pattern.category)
            .digest('hex');

        const query = `
            INSERT OR REPLACE INTO code_patterns (
                pattern_signature, pattern_text, pattern_context,
                file_type, project_path, client_name,
                frequency, classification, confidence
            ) VALUES (?, ?, ?, ?, ?, ?, 
                COALESCE((SELECT frequency + 1 FROM code_patterns WHERE pattern_signature = ?), 1),
                ?, ?)
        `;

        const params = [
            signature,
            pattern.pattern,
            JSON.stringify(context),
            this.determineTechnology(context.filePath, context),
            context.projectPath,
            context.clientName,
            signature, // for the COALESCE query
            'bad', // classification for error patterns
            pattern.confidence
        ];

        await this.dbRun(query, params);
    }

    // Database helper methods
    async dbAll(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async dbRun(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(query, params, function(err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    async dbGet(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(query, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }
}

export default ValidationRuleManager;