#!/usr/bin/env node

/**
 * Comprehensive Test Runner for New Functionality
 * Runs all test suites for text interface, environment, WSL compatibility, and E2E tests
 */

import { fileURLToPath } from 'url';
import chalk from 'chalk';

import TextInterfaceTestSuite from './test_text_interface.js';
import EnvironmentTestSuite from './test_environment.js'; 
import WSLCompatibilityTestSuite from './test_wsl_compatibility.js';
import E2ETestSuite from './test_e2e.js';

const __dirname = fileURLToPath(import.meta.url);

class ComprehensiveTestRunner {
  constructor() {
    this.results = {
      textInterface: null,
      environment: null,
      wslCompatibility: null,
      e2e: null
    };
    this.overallStats = {
      totalSuites: 4,
      passedSuites: 0,
      failedSuites: 0,
      totalTests: 0,
      totalPassed: 0,
      totalFailed: 0,
      startTime: null,
      endTime: null
    };
  }
  
  async runAllTestSuites() {
    console.log(chalk.blue.bold('╔══════════════════════════════════════════════════════════════╗'));
    console.log(chalk.blue.bold('║              SARALEGUI AI ASSISTANT TEST RUNNER             ║'));
    console.log(chalk.blue.bold('║                   New Features Validation                   ║'));
    console.log(chalk.blue.bold('╚══════════════════════════════════════════════════════════════╝'));
    console.log();
    
    this.overallStats.startTime = Date.now();
    
    console.log(chalk.cyan('🚀 Running comprehensive test validation...'));
    console.log(chalk.gray('This will test all new functionality added to the system.'));
    console.log();
    
    // Run each test suite
    await this.runTextInterfaceTests();
    await this.runEnvironmentTests();
    await this.runWSLCompatibilityTests();
    await this.runE2ETests();
    
    this.overallStats.endTime = Date.now();
    
    // Display comprehensive results
    this.displayOverallResults();
    
    return this.overallStats.failedSuites === 0;
  }
  
  async runTextInterfaceTests() {
    console.log(chalk.yellow('💬 STARTING TEXT INTERFACE TESTS'));
    console.log(chalk.gray('Testing command parsing, user interaction, and WSL compatibility...'));
    
    try {
      const suite = new TextInterfaceTestSuite();
      const success = await suite.runAllTests();
      
      this.results.textInterface = {
        success,
        stats: suite.stats
      };
      
      this.updateOverallStats('textInterface', success, suite.stats);
      
    } catch (error) {
      console.error(chalk.red(`Text Interface Test Suite failed: ${error.message}`));
      this.results.textInterface = { success: false, error: error.message };
      this.overallStats.failedSuites++;
    }
  }
  
  async runEnvironmentTests() {
    console.log(chalk.yellow('\n🌍 STARTING ENVIRONMENT CONFIGURATION TESTS'));
    console.log(chalk.gray('Testing API keys, feature flags, and configuration validation...'));
    
    try {
      const suite = new EnvironmentTestSuite();
      const success = await suite.runAllTests();
      
      this.results.environment = {
        success,
        stats: suite.stats
      };
      
      this.updateOverallStats('environment', success, suite.stats);
      
    } catch (error) {
      console.error(chalk.red(`Environment Test Suite failed: ${error.message}`));
      this.results.environment = { success: false, error: error.message };
      this.overallStats.failedSuites++;
    }
  }
  
  async runWSLCompatibilityTests() {
    console.log(chalk.yellow('\n🐧 STARTING WSL COMPATIBILITY TESTS'));
    console.log(chalk.gray('Testing audio fallbacks, voice disabling, and Linux subsystem compatibility...'));
    
    try {
      const suite = new WSLCompatibilityTestSuite();
      const success = await suite.runAllTests();
      
      this.results.wslCompatibility = {
        success,
        stats: suite.stats
      };
      
      this.updateOverallStats('wslCompatibility', success, suite.stats);
      
    } catch (error) {
      console.error(chalk.red(`WSL Compatibility Test Suite failed: ${error.message}`));
      this.results.wslCompatibility = { success: false, error: error.message };
      this.overallStats.failedSuites++;
    }
  }
  
  async runE2ETests() {
    console.log(chalk.yellow('\n🔄 STARTING END-TO-END INTEGRATION TESTS'));
    console.log(chalk.gray('Testing system startup, database connectivity, and component integration...'));
    
    try {
      const suite = new E2ETestSuite();
      const success = await suite.runAllTests();
      
      this.results.e2e = {
        success,
        stats: suite.stats
      };
      
      this.updateOverallStats('e2e', success, suite.stats);
      
    } catch (error) {
      console.error(chalk.red(`E2E Test Suite failed: ${error.message}`));
      this.results.e2e = { success: false, error: error.message };
      this.overallStats.failedSuites++;
    }
  }
  
  updateOverallStats(suiteName, success, stats) {
    if (success) {
      this.overallStats.passedSuites++;
    } else {
      this.overallStats.failedSuites++;
    }
    
    if (stats) {
      this.overallStats.totalTests += stats.total || 0;
      this.overallStats.totalPassed += stats.passed || 0;
      this.overallStats.totalFailed += stats.failed || 0;
    }
  }
  
  displayOverallResults() {
    const duration = (this.overallStats.endTime - this.overallStats.startTime) / 1000;
    
    console.log('\n' + chalk.blue('═'.repeat(70)));
    console.log(chalk.blue.bold('              COMPREHENSIVE TEST RESULTS'));
    console.log(chalk.blue('═'.repeat(70)));
    
    console.log(chalk.cyan('\n📊 OVERALL SUMMARY:'));
    console.log(`   Test Suites: ${this.overallStats.totalSuites}`);
    console.log(`   Suites Passed: ${this.overallStats.passedSuites} ${this.overallStats.passedSuites === this.overallStats.totalSuites ? '✅' : '⚠️'}`);
    console.log(`   Suites Failed: ${this.overallStats.failedSuites} ${this.overallStats.failedSuites === 0 ? '✅' : '❌'}`);
    console.log(`   Total Tests: ${this.overallStats.totalTests}`);
    console.log(`   Tests Passed: ${this.overallStats.totalPassed} ✅`);
    console.log(`   Tests Failed: ${this.overallStats.totalFailed} ${this.overallStats.totalFailed === 0 ? '✅' : '❌'}`);
    console.log(`   Success Rate: ${((this.overallStats.totalPassed / this.overallStats.totalTests) * 100).toFixed(1)}%`);
    console.log(`   Duration: ${duration.toFixed(2)}s`);
    
    console.log(chalk.cyan('\n📋 DETAILED RESULTS:'));
    
    // Text Interface Results
    if (this.results.textInterface?.success) {
      console.log(`   💬 Text Interface: ${chalk.green('✅ PASSED')} (${this.results.textInterface.stats.passed}/${this.results.textInterface.stats.total})`);
    } else {
      console.log(`   💬 Text Interface: ${chalk.red('❌ FAILED')} ${this.results.textInterface?.error || ''}`);
    }
    
    // Environment Results
    if (this.results.environment?.success) {
      console.log(`   🌍 Environment Config: ${chalk.green('✅ PASSED')} (${this.results.environment.stats.passed}/${this.results.environment.stats.total})`);
    } else {
      console.log(`   🌍 Environment Config: ${chalk.red('❌ FAILED')} ${this.results.environment?.error || ''}`);
    }
    
    // WSL Compatibility Results  
    if (this.results.wslCompatibility?.success) {
      console.log(`   🐧 WSL Compatibility: ${chalk.green('✅ PASSED')} (${this.results.wslCompatibility.stats.passed}/${this.results.wslCompatibility.stats.total})`);
    } else {
      console.log(`   🐧 WSL Compatibility: ${chalk.red('❌ FAILED')} ${this.results.wslCompatibility?.error || ''}`);
    }
    
    // E2E Integration Results
    if (this.results.e2e?.success) {
      console.log(`   🔄 E2E Integration: ${chalk.green('✅ PASSED')} (${this.results.e2e.stats.passed}/${this.results.e2e.stats.total})`);
    } else {
      console.log(`   🔄 E2E Integration: ${chalk.red('❌ FAILED')} ${this.results.e2e?.error || ''}`);
    }
    
    console.log(chalk.cyan('\n🎯 FEATURE VALIDATION:'));
    
    const features = [
      { name: '💬 Text-based Command Interface', status: this.results.textInterface?.success },
      { name: '🔑 Pushover Integration', status: this.results.environment?.success },
      { name: '🐧 WSL Audio Fallback', status: this.results.wslCompatibility?.success },
      { name: '🔗 System Integration', status: this.results.e2e?.success },
      { name: '📝 Command Parsing', status: this.results.textInterface?.success },
      { name: '🔒 Environment Security', status: this.results.environment?.success }
    ];
    
    features.forEach(feature => {
      const status = feature.status ? chalk.green('✅ WORKING') : chalk.red('❌ ISSUES');
      console.log(`   ${feature.name}: ${status}`);
    });
    
    console.log('\n' + chalk.blue('═'.repeat(70)));
    
    if (this.overallStats.failedSuites === 0) {
      console.log(chalk.green.bold('🎉 ALL NEW FEATURES VALIDATED SUCCESSFULLY!'));
      console.log(chalk.green('✅ Text interface is fully functional'));
      console.log(chalk.green('✅ Environment configuration is correct'));  
      console.log(chalk.green('✅ WSL compatibility is confirmed'));
      console.log(chalk.green('✅ System integration is working'));
      console.log(chalk.cyan('\n💡 You can now use: npm run chat'));
    } else {
      console.log(chalk.red.bold(`❌ ${this.overallStats.failedSuites} TEST SUITE(S) FAILED`));
      console.log(chalk.yellow('Please review the failed tests above and fix any issues.'));
    }
    
    console.log(chalk.blue('═'.repeat(70)));
  }
}

// Export for use in other files
export { ComprehensiveTestRunner };

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const runner = new ComprehensiveTestRunner();
  runner.runAllTestSuites()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error(chalk.red('Test runner crashed:'), error);
      process.exit(1);
    });
}