/**
 * Rule Propagation Engine
 * Automatically promotes effective validation rules across scopes
 */

import { ValidationRuleManager } from './validation_rule_manager.js';

export class RulePropagationEngine extends ValidationRuleManager {
    constructor(db) {
        super(db);
        this.propagationInterval = 24 * 60 * 60 * 1000; // 24 hours
        this.isRunning = false;
        this.propagationTimer = null;
    }

    /**
     * Start automatic rule propagation
     */
    startAutoPropagation() {
        if (this.isRunning) {
            console.log('🔄 Rule propagation already running');
            return;
        }

        this.isRunning = true;
        console.log('🚀 Starting automatic rule propagation...');

        // Run immediately
        this.runPropagationCycle();

        // Schedule regular runs
        this.propagationTimer = setInterval(() => {
            this.runPropagationCycle();
        }, this.propagationInterval);

        console.log(`⏰ Scheduled propagation every ${this.propagationInterval / 1000 / 60 / 60} hours`);
    }

    /**
     * Stop automatic rule propagation
     */
    stopAutoPropagation() {
        if (this.propagationTimer) {
            clearInterval(this.propagationTimer);
            this.propagationTimer = null;
        }
        this.isRunning = false;
        console.log('⏹️  Stopped automatic rule propagation');
    }

    /**
     * Run a complete propagation cycle
     */
    async runPropagationCycle() {
        console.log('🔄 Starting rule propagation cycle...');
        
        const startTime = Date.now();
        const stats = {
            rulesAnalyzed: 0,
            rulesPromoted: 0,
            rulesDeactivated: 0,
            newRulesLearned: 0
        };

        try {
            // 1. Propagate effective rules to broader scopes
            const promotionResults = await this.propagateEffectiveRules();
            stats.rulesPromoted = promotionResults.promoted || 0;

            // 2. Analyze recent errors for new patterns
            const learningResults = await this.learnFromRecentErrors();
            stats.newRulesLearned = learningResults.newRules || 0;

            // 3. Deactivate ineffective rules
            const cleanupResults = await this.deactivateIneffectiveRules();
            stats.rulesDeactivated = cleanupResults.deactivated || 0;

            // 4. Update rule confidence scores
            await this.updateRuleConfidenceScores();

            // 5. Generate propagation report
            const duration = Date.now() - startTime;
            await this.logPropagationCycle(stats, duration);

            console.log(`✅ Propagation cycle completed in ${duration}ms`);
            console.log(`📊 Stats: ${stats.rulesPromoted} promoted, ${stats.newRulesLearned} learned, ${stats.rulesDeactivated} deactivated`);

        } catch (error) {
            console.error('❌ Propagation cycle failed:', error.message);
            await this.logPropagationError(error);
        }
    }

    /**
     * Enhanced rule propagation with detailed analysis
     */
    async propagateEffectiveRules() {
        console.log('📈 Analyzing rules for promotion...');

        const query = `
            SELECT 
                r.*,
                COUNT(ra.id) as applications,
                SUM(CASE WHEN ra.success = 1 THEN 1 ELSE 0 END) as successes,
                SUM(CASE WHEN ra.false_positive = 1 THEN 1 ELSE 0 END) as false_positives,
                SUM(CASE WHEN ra.fix_applied = 1 THEN 1 ELSE 0 END) as fixes_applied,
                AVG(ra.execution_time_ms) as avg_execution_time,
                COUNT(DISTINCT ra.project_path) as projects_used,
                COUNT(DISTINCT ra.client_name) as clients_used
            FROM validation_rules r
            JOIN rule_applications ra ON r.rule_id = ra.rule_id
            WHERE r.scope IN ('project', 'client', 'organization')
            AND r.is_active = 1
            AND ra.applied_at > datetime('now', '-7 days')
            GROUP BY r.rule_id
            HAVING applications >= ?
            ORDER BY r.effectiveness_score DESC, applications DESC
        `;

        const candidateRules = await this.dbAll(query, [this.autoLearnThreshold]);
        let promoted = 0;

        for (const rule of candidateRules) {
            const shouldPromote = await this.analyzeRuleForPromotion(rule);
            
            if (shouldPromote) {
                const newScope = this.calculateNewScope(rule);
                
                if (newScope !== rule.scope) {
                    await this.promoteRule(rule.rule_id, newScope);
                    
                    // Log the promotion
                    await this.logRulePromotion(rule, newScope);
                    
                    console.log(`📈 Promoted rule ${rule.rule_id} from ${rule.scope} to ${newScope}`);
                    promoted++;
                }
            }
        }

        return { promoted };
    }

    /**
     * Analyze if a rule should be promoted
     */
    async analyzeRuleForPromotion(rule) {
        const {
            applications, successes, false_positives,
            projects_used, clients_used, effectiveness_score
        } = rule;

        const successRate = applications > 0 ? (successes / applications) : 0;
        const falsePositiveRate = applications > 0 ? (false_positives / applications) : 0;

        // Promotion criteria
        const criteria = {
            minSuccessRate: 0.7,
            maxFalsePositiveRate: 0.1,
            minEffectivenessScore: 0.75,
            minProjects: rule.scope === 'project' ? 2 : 3,
            minClients: rule.scope === 'client' ? 2 : 1
        };

        return (
            successRate >= criteria.minSuccessRate &&
            falsePositiveRate <= criteria.maxFalsePositiveRate &&
            effectiveness_score >= criteria.minEffectivenessScore &&
            projects_used >= criteria.minProjects &&
            (rule.scope !== 'client' || clients_used >= criteria.minClients)
        );
    }

    /**
     * Learn from recent errors in the system
     */
    async learnFromRecentErrors() {
        console.log('🧠 Learning from recent error patterns...');

        // This would integrate with error logging systems
        // For now, we'll check for common patterns in recent rule applications
        
        const query = `
            SELECT 
                ra.file_path,
                ra.line_number,
                ra.user_feedback,
                r.pattern_text,
                r.category
            FROM rule_applications ra
            JOIN validation_rules r ON ra.rule_id = r.rule_id
            WHERE ra.applied_at > datetime('now', '-24 hours')
            AND ra.success = 0
            AND ra.user_feedback IS NOT NULL
        `;

        const recentErrors = await this.dbAll(query);
        let newRules = 0;

        // Analyze patterns in failed validations
        for (const error of recentErrors) {
            if (error.user_feedback.includes('false positive')) {
                // Learn to refine existing rules
                await this.refineRulePattern(error);
            } else if (error.user_feedback.includes('missing pattern')) {
                // Create new rule for missing pattern
                const newRule = await this.createRuleFromFeedback(error);
                if (newRule) {
                    newRules++;
                }
            }
        }

        return { newRules };
    }

    /**
     * Deactivate rules that are consistently ineffective
     */
    async deactivateIneffectiveRules() {
        console.log('🗑️  Cleaning up ineffective rules...');

        const query = `
            SELECT 
                r.rule_id,
                r.confidence,
                r.effectiveness_score,
                COUNT(ra.id) as applications,
                SUM(CASE WHEN ra.success = 1 THEN 1 ELSE 0 END) as successes,
                SUM(CASE WHEN ra.false_positive = 1 THEN 1 ELSE 0 END) as false_positives
            FROM validation_rules r
            LEFT JOIN rule_applications ra ON r.rule_id = ra.rule_id
            WHERE r.is_active = 1
            AND ra.applied_at > datetime('now', '-30 days')
            GROUP BY r.rule_id
            HAVING applications >= 10
            ORDER BY effectiveness_score ASC
        `;

        const rules = await this.dbAll(query);
        let deactivated = 0;

        for (const rule of rules) {
            const shouldDeactivate = this.shouldDeactivateRule(rule);
            
            if (shouldDeactivate) {
                await this.deactivateRule(rule.rule_id);
                console.log(`🗑️  Deactivated ineffective rule: ${rule.rule_id}`);
                deactivated++;
            }
        }

        return { deactivated };
    }

    /**
     * Check if a rule should be deactivated
     */
    shouldDeactivateRule(rule) {
        const { applications, successes, false_positives, effectiveness_score } = rule;
        
        const successRate = applications > 0 ? (successes / applications) : 0;
        const falsePositiveRate = applications > 0 ? (false_positives / applications) : 0;

        // Deactivation criteria
        return (
            effectiveness_score < 0.2 ||
            (successRate < 0.3 && applications > 20) ||
            falsePositiveRate > 0.5
        );
    }

    /**
     * Update confidence scores based on recent performance
     */
    async updateRuleConfidenceScores() {
        const query = `
            UPDATE validation_rules
            SET confidence = CASE
                WHEN effectiveness_score > 0.8 THEN MIN(1.0, confidence + 0.1)
                WHEN effectiveness_score < 0.3 THEN MAX(0.1, confidence - 0.1)
                ELSE confidence
            END,
            updated_at = CURRENT_TIMESTAMP
            WHERE is_active = 1
        `;

        await this.dbRun(query);
    }

    /**
     * Deactivate a rule
     */
    async deactivateRule(ruleId) {
        const query = `
            UPDATE validation_rules 
            SET is_active = 0,
                updated_at = CURRENT_TIMESTAMP
            WHERE rule_id = ?
        `;
        
        await this.dbRun(query, [ruleId]);
    }

    /**
     * Log rule promotion event
     */
    async logRulePromotion(rule, newScope) {
        const logEntry = {
            event: 'rule_promotion',
            rule_id: rule.rule_id,
            old_scope: rule.scope,
            new_scope: newScope,
            effectiveness_score: rule.effectiveness_score,
            applications: rule.applications,
            success_rate: rule.applications > 0 ? (rule.successes / rule.applications) : 0,
            timestamp: new Date().toISOString()
        };

        // Add to knowledge base
        await this.dbRun(`
            INSERT INTO knowledge_entries (entry_type, title, content, tags)
            VALUES (?, ?, ?, ?)
        `, [
            'rule_promotion',
            `Rule promoted: ${rule.rule_id}`,
            JSON.stringify(logEntry, null, 2),
            JSON.stringify(['rule-promotion', 'learning', newScope, rule.category])
        ]);
    }

    /**
     * Log propagation cycle results
     */
    async logPropagationCycle(stats, duration) {
        const logEntry = {
            event: 'propagation_cycle',
            stats,
            duration,
            timestamp: new Date().toISOString()
        };

        await this.dbRun(`
            INSERT INTO knowledge_entries (entry_type, title, content, tags)
            VALUES (?, ?, ?, ?)
        `, [
            'system_activity',
            'Rule propagation cycle completed',
            JSON.stringify(logEntry, null, 2),
            JSON.stringify(['propagation', 'learning', 'automation'])
        ]);
    }

    /**
     * Log propagation errors
     */
    async logPropagationError(error) {
        const logEntry = {
            event: 'propagation_error',
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        };

        await this.dbRun(`
            INSERT INTO knowledge_entries (entry_type, title, content, tags)
            VALUES (?, ?, ?, ?)
        `, [
            'error',
            'Rule propagation failed',
            JSON.stringify(logEntry, null, 2),
            JSON.stringify(['propagation', 'error', 'system'])
        ]);
    }

    /**
     * Get propagation statistics
     */
    async getPropagationStats(days = 7) {
        const query = `
            SELECT 
                COUNT(*) as total_rules,
                SUM(CASE WHEN scope = 'global' THEN 1 ELSE 0 END) as global_rules,
                SUM(CASE WHEN scope = 'organization' THEN 1 ELSE 0 END) as organization_rules,
                SUM(CASE WHEN scope = 'client' THEN 1 ELSE 0 END) as client_rules,
                SUM(CASE WHEN scope = 'project' THEN 1 ELSE 0 END) as project_rules,
                AVG(effectiveness_score) as avg_effectiveness,
                AVG(confidence) as avg_confidence
            FROM validation_rules 
            WHERE is_active = 1
            AND updated_at > datetime('now', '-${days} days')
        `;

        const stats = await this.dbGet(query);
        
        const recentPromotions = await this.dbAll(`
            SELECT content FROM knowledge_entries 
            WHERE entry_type = 'rule_promotion'
            AND created_at > datetime('now', '-${days} days')
        `);

        return {
            ...stats,
            recent_promotions: recentPromotions.length,
            promotion_details: recentPromotions.map(p => JSON.parse(p.content))
        };
    }
}

export default RulePropagationEngine;