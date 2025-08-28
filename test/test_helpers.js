/**
 * Test Helpers and Data Generators
 * Utilities for creating test data and assertions
 */

export class TestHelpers {
  constructor() {
    this.sessionId = 'test_session_' + Date.now();
  }

  // ═══════════════════════════════════════
  // Data Generators
  // ═══════════════════════════════════════

  /**
   * Generate a sequence pattern that should be detected
   * @param {number} repetitions - How many times to repeat the sequence
   * @param {Array} sequence - Array of tool names to execute in sequence
   */
  generateSequencePattern(repetitions = 3, sequence = null) {
    const defaultSequence = [
      { tool: 'create_project', params: { client: 'esonus', type: 'netsuite' } },
      { tool: 'setup_netsuite', params: { env: 'sandbox', validate: true } },
      { tool: 'deploy', params: { target: 'sandbox' } },
      { tool: 'run_tests', params: { suite: 'smoke' } }
    ];
    
    const actualSequence = sequence || defaultSequence;
    const executions = [];
    
    for (let rep = 0; rep < repetitions; rep++) {
      for (let i = 0; i < actualSequence.length; i++) {
        const exec = actualSequence[i];
        executions.push({
          tool_name: exec.tool,
          parameters: exec.params,
          context: { 
            repetition: rep + 1,
            step: i + 1,
            timestamp: new Date(Date.now() - (repetitions - rep) * 3600000) // Space out over hours
          },
          success: true,
          session_id: this.sessionId
        });
      }
    }
    
    return {
      executions,
      expectedPattern: {
        type: 'sequence',
        length: actualSequence.length,
        occurrences: repetitions,
        minConfidence: repetitions * 0.2, // 0.2 per occurrence
        toolSuggestion: this.expectedToolName(actualSequence)
      }
    };
  }

  /**
   * Generate a parameter pattern (same tool, similar params)
   */
  generateParameterPattern(repetitions = 5, toolName = 'deploy') {
    const executions = [];
    
    // Common parameters that stay the same
    const commonParams = {
      env: 'sandbox',
      validate: true,
      retry: 3
    };
    
    // Variable parameters that change each time
    const variableParams = [
      { user: 'user1', timestamp: Date.now() - 5000 },
      { user: 'user2', timestamp: Date.now() - 4000 },
      { user: 'user3', timestamp: Date.now() - 3000 },
      { user: 'user4', timestamp: Date.now() - 2000 },
      { user: 'user5', timestamp: Date.now() - 1000 }
    ];
    
    for (let i = 0; i < repetitions; i++) {
      executions.push({
        tool_name: toolName,
        parameters: { ...commonParams, ...variableParams[i] },
        context: { iteration: i + 1 },
        success: true,
        session_id: this.sessionId
      });
    }
    
    return {
      executions,
      expectedPattern: {
        type: 'parameter',
        toolName,
        commonKeys: Object.keys(commonParams),
        varyingKeys: ['user', 'timestamp'],
        occurrences: repetitions,
        minConfidence: repetitions * 0.15
      }
    };
  }

  /**
   * Generate mixed success/failure executions (patterns should only detect successes)
   */
  generateMixedPattern() {
    const executions = [];
    
    // Add successful sequence
    for (let i = 0; i < 3; i++) {
      executions.push({
        tool_name: 'backup_data',
        parameters: { source: 'production' },
        success: true,
        session_id: this.sessionId
      });
      executions.push({
        tool_name: 'validate_backup',
        parameters: { checksum: true },
        success: true,
        session_id: this.sessionId
      });
    }
    
    // Add failed attempts (should be ignored)
    for (let i = 0; i < 2; i++) {
      executions.push({
        tool_name: 'backup_data',
        parameters: { source: 'production' },
        success: false,
        error_message: 'Connection timeout',
        session_id: this.sessionId
      });
    }
    
    return {
      executions,
      expectedPattern: {
        type: 'sequence',
        length: 2,
        occurrences: 3, // Only successful ones
        shouldIgnoreFailures: true
      }
    };
  }

  /**
   * Generate NetSuite-specific workflow pattern
   */
  generateNetSuitePattern() {
    const workflow = [
      { tool: 'create_project', params: { client: 'esonus', name: 'ESO_CustomerPortal' } },
      { tool: 'init_suitescript', params: { version: '2.1', modules: ['N/record', 'N/search'] } },
      { tool: 'create_restlet', params: { name: 'CustomerDataRESTlet', auth: 'token' } },
      { tool: 'deploy_to_sandbox', params: { validate: true, runTests: true } },
      { tool: 'generate_docs', params: { format: 'markdown' } }
    ];
    
    return this.generateSequencePattern(3, workflow);
  }

  /**
   * Generate single executions (no pattern should be detected)
   */
  generateSingleExecutions() {
    return {
      executions: [
        { tool_name: 'unique_tool_1', parameters: {}, success: true },
        { tool_name: 'unique_tool_2', parameters: {}, success: true },
        { tool_name: 'unique_tool_3', parameters: {}, success: true }
      ],
      expectedPattern: null // No pattern should be detected
    };
  }

  // ═══════════════════════════════════════
  // Assertion Helpers
  // ═══════════════════════════════════════

  assertPatternDetected(patterns, signature) {
    const found = patterns.find(p => 
      p.pattern_signature === signature || 
      p.pattern_signature.includes(signature)
    );
    
    return {
      success: !!found,
      message: found ? 
        `✅ Pattern detected: ${signature}` : 
        `❌ Pattern not found: ${signature}`,
      pattern: found
    };
  }

  assertOccurrences(pattern, expectedCount) {
    const actual = pattern?.occurrences || 0;
    const success = actual === expectedCount;
    
    return {
      success,
      message: success ? 
        `✅ Occurrences correct: ${actual}` : 
        `❌ Occurrences mismatch - Expected: ${expectedCount}, Got: ${actual}`,
      actual
    };
  }

  assertConfidenceScore(pattern, minConfidence, maxConfidence = 1.0) {
    const confidence = pattern?.confidence_score || 0;
    const success = confidence >= minConfidence && confidence <= maxConfidence;
    
    return {
      success,
      message: success ? 
        `✅ Confidence in range: ${(confidence * 100).toFixed(1)}%` : 
        `❌ Confidence out of range - Expected: ${minConfidence}-${maxConfidence}, Got: ${confidence}`,
      actual: confidence
    };
  }

  assertToolGenerated(tools, expectedName) {
    const found = tools.find(t => 
      t.tool_name === expectedName || 
      t.tool_name.includes(expectedName)
    );
    
    return {
      success: !!found,
      message: found ? 
        `✅ Tool generated: ${found.tool_name}` : 
        `❌ Tool not generated: ${expectedName}`,
      tool: found
    };
  }

  assertNoPatternDetected(patterns) {
    const success = !patterns || patterns.length === 0;
    
    return {
      success,
      message: success ? 
        `✅ No patterns detected (as expected)` : 
        `❌ Unexpected patterns detected: ${patterns.length}`,
      patterns
    };
  }

  // ═══════════════════════════════════════
  // Utility Functions
  // ═══════════════════════════════════════

  expectedToolName(sequence) {
    const actions = sequence.map(s => {
      const parts = s.tool.split('_');
      return parts[0] || s.tool;
    });
    
    if (actions.length <= 3) {
      return `auto_${actions.join('_').toLowerCase()}`;
    } else {
      return `auto_${actions.map(a => a[0]).join('').toLowerCase()}_sequence`;
    }
  }

  formatPattern(pattern) {
    if (!pattern) return 'No pattern';
    
    return `
    Pattern Details:
    ├─ Type: ${pattern.pattern_type || pattern.type}
    ├─ Signature: ${pattern.pattern_signature || pattern.signature}
    ├─ Occurrences: ${pattern.occurrences}
    ├─ Confidence: ${((pattern.confidence_score || 0) * 100).toFixed(1)}%
    └─ Tool Suggestion: ${pattern.tool_suggestion ? JSON.parse(pattern.tool_suggestion).name : 'None'}`;
  }

  formatExecutions(executions) {
    return executions.map((e, i) => 
      `  ${i + 1}. ${e.tool_name}(${JSON.stringify(e.parameters)}) - ${e.success ? '✅' : '❌'}`
    ).join('\n');
  }

  // Create a delay for async operations
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Compare two patterns for equality
  patternsEqual(p1, p2) {
    return p1.pattern_signature === p2.pattern_signature &&
           p1.pattern_type === p2.pattern_type &&
           p1.occurrences === p2.occurrences;
  }

  // Generate execution ID
  generateExecutionId() {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance for convenience
export const testHelpers = new TestHelpers();