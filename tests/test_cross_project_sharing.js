#!/usr/bin/env node

/**
 * Cross-Project Rule Sharing Test Suite
 * Tests the multi-scale learning system across different project scopes
 */

import { ValidationRuleManager } from '../lib/validation_rule_manager.js';
import { RulePropagationEngine } from '../lib/rule_propagation_engine.js';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

class CrossProjectSharingTest {
    constructor() {
        this.dbPath = path.join(process.env.HOME, 'saralegui-solutions-mcp/database/saralegui_assistant.db');
        this.testDbPath = path.join(process.env.HOME, 'saralegui-solutions-mcp/database/test_cross_project.db');
        this.db = null;
        this.ruleManager = null;
        this.propagationEngine = null;
        this.testResults = {
            passed: 0,
            failed: 0,
            tests: []
        };
    }

    async initialize() {
        console.log('🧪 Initializing cross-project sharing test suite...');

        // Copy the main database for testing
        if (fs.existsSync(this.dbPath)) {
            fs.copyFileSync(this.dbPath, this.testDbPath);
        }

        // Connect to test database
        this.db = new sqlite3.Database(this.testDbPath, (err) => {
            if (err) {
                throw new Error(`Failed to connect to test database: ${err.message}`);
            }
        });

        // Initialize managers
        this.ruleManager = new ValidationRuleManager(this.db);
        this.propagationEngine = new RulePropagationEngine(this.db);

        console.log('✅ Test suite initialized');
    }

    async runAllTests() {
        console.log('🚀 Running cross-project rule sharing tests...\n');

        const tests = [
            this.testRuleCreationAndScoping.bind(this),
            this.testRulePropagation.bind(this),
            this.testCrossClientSharing.bind(this),
            this.testScopeIsolation.bind(this),
            this.testRuleEffectiveness.bind(this),
            this.testAutomaticLearning.bind(this),
            this.testRuleDeactivation.bind(this)
        ];

        for (const test of tests) {
            try {
                await test();
            } catch (error) {
                this.recordTest(test.name, false, error.message);
            }
        }

        this.printResults();
        await this.cleanup();
    }

    async testRuleCreationAndScoping() {
        console.log('📋 Test 1: Rule Creation and Scoping');

        // Test creating rules at different scopes
        const testRule1 = await this.ruleManager.learnFromError({
            errorMessage: 'SyntaxError: Expected ( but found . this.TEST_FIELD = "value";',
            codeSnippet: 'this.TEST_FIELD = "value";',
            filePath: 'test/project1/file.js',
            projectPath: '/test/project1',
            clientName: 'client1',
            fix: 'getTEST_FIELD = () => "value";'
        });

        if (!testRule1) {
            throw new Error('Failed to create test rule');
        }

        // Verify rule was created with correct scope
        const rule = await this.ruleManager.dbGet(
            'SELECT * FROM validation_rules WHERE rule_id = ?', 
            [testRule1.rule_id || testRule1]
        );

        if (!rule) {
            throw new Error('Rule not found in database');
        }

        if (rule.scope !== 'global') {
            throw new Error(`Expected global scope, got ${rule.scope}`);
        }

        this.recordTest('testRuleCreationAndScoping', true, 'Rule created with correct scope');
    }

    async testRulePropagation() {
        console.log('📋 Test 2: Rule Propagation');

        // Create a project-level rule
        const projectRule = await this.ruleManager.createValidationRule({
            scope: 'project',
            category: 'performance',
            priority: 'warning',
            technology: 'suitescript',
            pattern: 'search\\.create\\(\\{[^}]*type:\\s*search\\.Type\\.[A-Z_]+',
            message: 'Consider using saved search for performance',
            suggestion: 'Use saved search instead of dynamic search',
            autoFix: false,
            learnedFrom: '/test/project1',
            confidence: 0.8
        });

        // Simulate successful applications to make it eligible for promotion
        for (let i = 0; i < 6; i++) {
            await this.ruleManager.trackRuleApplication(
                projectRule,
                '/test/project1',
                'client1',
                `test/file${i}.js`,
                10 + i,
                true, // success
                50 // execution time
            );
        }

        // Run propagation
        const result = await this.propagationEngine.propagateEffectiveRules();

        if (result.promoted < 1) {
            throw new Error('Expected at least one rule to be promoted');
        }

        this.recordTest('testRulePropagation', true, `${result.promoted} rules promoted successfully`);
    }

    async testCrossClientSharing() {
        console.log('📋 Test 3: Cross-Client Rule Sharing');

        // Test that organization-level rules are shared across clients
        const orgRule = await this.ruleManager.createValidationRule({
            scope: 'organization',
            category: 'security',
            priority: 'error',
            technology: 'netsuite',
            pattern: 'password.*=.*["\'][^"\']{1,8}["\']',
            message: 'Password too short for security requirements',
            suggestion: 'Use passwords with at least 8 characters',
            autoFix: false,
            learnedFrom: 'organization-policy',
            confidence: 0.95
        });

        // Test rule retrieval for different clients
        const client1Rules = await this.ruleManager.getRulesForScope(
            ['global', 'organization', 'client'],
            ['netsuite'],
            'client1',
            '/client1/project'
        );

        const client2Rules = await this.ruleManager.getRulesForScope(
            ['global', 'organization', 'client'],
            ['netsuite'],
            'client2',
            '/client2/project'
        );

        const orgRuleInClient1 = client1Rules.find(r => r.rule_id === orgRule);
        const orgRuleInClient2 = client2Rules.find(r => r.rule_id === orgRule);

        if (!orgRuleInClient1 || !orgRuleInClient2) {
            throw new Error('Organization rule not shared across clients');
        }

        this.recordTest('testCrossClientSharing', true, 'Organization rules shared across clients');
    }

    async testScopeIsolation() {
        console.log('📋 Test 4: Scope Isolation');

        // Create client-specific rule
        const clientSpecificRule = await this.ruleManager.createValidationRule({
            scope: 'client',
            category: 'style',
            priority: 'suggestion',
            technology: 'javascript',
            pattern: 'var\\s+\\w+',
            message: 'Use let or const instead of var',
            suggestion: 'Replace var with let or const',
            autoFix: true,
            autoFixPattern: 's/var\\s+(\\w+)/let $1/g',
            learnedFrom: '/client1/specific-project',
            confidence: 0.7
        });

        // Test that client-specific rule is NOT available to other clients
        const otherClientRules = await this.ruleManager.getRulesForScope(
            ['global', 'organization', 'client'],
            ['javascript'],
            'other-client',
            '/other-client/project'
        );

        const clientRuleInOtherClient = otherClientRules.find(r => r.rule_id === clientSpecificRule);

        if (clientRuleInOtherClient) {
            throw new Error('Client-specific rule leaked to other client');
        }

        this.recordTest('testScopeIsolation', true, 'Scope isolation working correctly');
    }

    async testRuleEffectiveness() {
        console.log('📋 Test 5: Rule Effectiveness Tracking');

        // Create rule and track applications
        const testRule = await this.ruleManager.createValidationRule({
            scope: 'project',
            category: 'syntax',
            priority: 'error',
            technology: 'javascript',
            pattern: 'console\\.log\\s*\\(',
            message: 'Remove console.log from production code',
            suggestion: 'Use proper logging framework',
            autoFix: false,
            learnedFrom: '/test/effectiveness',
            confidence: 0.6
        });

        // Track successful applications
        for (let i = 0; i < 5; i++) {
            await this.ruleManager.trackRuleApplication(
                testRule,
                '/test/effectiveness',
                'test-client',
                `test/file${i}.js`,
                10 + i,
                true, // success
                25
            );
        }

        // Track failed applications
        for (let i = 0; i < 2; i++) {
            await this.ruleManager.trackRuleApplication(
                testRule,
                '/test/effectiveness',
                'test-client',
                `test/file${i + 5}.js`,
                10 + i,
                false, // failure
                35
            );
        }

        // Check effectiveness calculation
        const updatedRule = await this.ruleManager.dbGet(
            'SELECT * FROM validation_rules WHERE rule_id = ?',
            [testRule]
        );

        if (updatedRule.effectiveness_score <= 0) {
            throw new Error('Effectiveness score not calculated correctly');
        }

        this.recordTest('testRuleEffectiveness', true, `Effectiveness score: ${updatedRule.effectiveness_score.toFixed(2)}`);
    }

    async testAutomaticLearning() {
        console.log('📋 Test 6: Automatic Learning from Patterns');

        // Create multiple similar error patterns
        const similarErrors = [
            {
                errorMessage: 'ReferenceError: require is not defined',
                codeSnippet: 'const fs = require("fs");',
                filePath: 'test/learning/file1.js'
            },
            {
                errorMessage: 'ReferenceError: require is not defined',
                codeSnippet: 'const path = require("path");',
                filePath: 'test/learning/file2.js'
            },
            {
                errorMessage: 'ReferenceError: require is not defined', 
                codeSnippet: 'const crypto = require("crypto");',
                filePath: 'test/learning/file3.js'
            }
        ];

        let rulesCreated = 0;
        for (const error of similarErrors) {
            const rule = await this.ruleManager.learnFromError({
                ...error,
                projectPath: '/test/learning',
                clientName: 'learning-client'
            });

            if (rule && typeof rule === 'string') {
                rulesCreated++;
            }
        }

        if (rulesCreated === 0) {
            throw new Error('No rules created from similar error patterns');
        }

        this.recordTest('testAutomaticLearning', true, `Created ${rulesCreated} rules from patterns`);
    }

    async testRuleDeactivation() {
        console.log('📋 Test 7: Rule Deactivation');

        // Create a rule with poor performance
        const poorRule = await this.ruleManager.createValidationRule({
            scope: 'project',
            category: 'test',
            priority: 'warning',
            technology: 'javascript',
            pattern: 'function\\s+\\w+',
            message: 'Test rule with poor performance',
            suggestion: 'This rule performs poorly',
            autoFix: false,
            learnedFrom: '/test/deactivation',
            confidence: 0.2
        });

        // Track many failed applications
        for (let i = 0; i < 15; i++) {
            await this.ruleManager.trackRuleApplication(
                poorRule,
                '/test/deactivation',
                'test-client',
                `test/file${i}.js`,
                10 + i,
                false, // all failures
                100
            );
        }

        // Run deactivation check
        const result = await this.propagationEngine.deactivateIneffectiveRules();

        if (result.deactivated < 1) {
            throw new Error('Expected poor performing rule to be deactivated');
        }

        this.recordTest('testRuleDeactivation', true, `${result.deactivated} ineffective rules deactivated`);
    }

    recordTest(testName, passed, details) {
        const result = { testName, passed, details };
        this.testResults.tests.push(result);
        
        if (passed) {
            this.testResults.passed++;
            console.log(`✅ ${testName}: ${details}`);
        } else {
            this.testResults.failed++;
            console.log(`❌ ${testName}: ${details}`);
        }
    }

    printResults() {
        console.log('\n📊 Test Results Summary:');
        console.log('─'.repeat(50));
        console.log(`✅ Passed: ${this.testResults.passed}`);
        console.log(`❌ Failed: ${this.testResults.failed}`);
        console.log(`📋 Total: ${this.testResults.tests.length}`);
        
        const successRate = (this.testResults.passed / this.testResults.tests.length) * 100;
        console.log(`📈 Success Rate: ${successRate.toFixed(1)}%`);
        
        if (this.testResults.failed > 0) {
            console.log('\n❌ Failed Tests:');
            this.testResults.tests
                .filter(t => !t.passed)
                .forEach(t => console.log(`   - ${t.testName}: ${t.details}`));
        }
        
        console.log('─'.repeat(50));
        
        if (this.testResults.failed === 0) {
            console.log('🎉 All tests passed! Cross-project rule sharing is working correctly.');
        } else {
            console.log('⚠️  Some tests failed. Please review the implementation.');
        }
    }

    async cleanup() {
        console.log('\n🧹 Cleaning up test environment...');
        
        if (this.db) {
            this.db.close();
        }
        
        if (fs.existsSync(this.testDbPath)) {
            fs.unlinkSync(this.testDbPath);
        }
        
        console.log('✅ Cleanup completed');
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const test = new CrossProjectSharingTest();
    
    test.initialize()
        .then(() => test.runAllTests())
        .catch(error => {
            console.error('❌ Test suite failed:', error.message);
            process.exit(1);
        });
}

export default CrossProjectSharingTest;