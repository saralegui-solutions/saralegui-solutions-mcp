/**
 * Learning Engine for Pattern Detection and Tool Generation
 * Analyzes execution patterns and automatically generates tools
 */

export class LearningEngine {
  constructor(db) {
    this.db = db;
    this.patternThreshold = 2; // Create tool suggestion after 2 occurrences
    this.autoGenerateThreshold = 3; // Auto-generate tool after 3 occurrences
    this.confidenceThreshold = 0.6; // Minimum confidence for auto-generation
    
    // Enhanced learning thresholds
    this.queryPatternThreshold = 3; // Query pattern recognition
    this.workflowOptimizationThreshold = 5; // Workflow optimization detection
    this.errorPredictionThreshold = 2; // Error pattern prediction
    
    // Learning modes
    this.learningModes = {
      patterns: true,
      queries: true,
      workflows: true,
      errors: true,
      crossProject: true
    };
    
    // Cache for performance
    this.patternCache = new Map();
    this.queryCache = new Map();
    this.lastCacheUpdate = 0;
  }

  async startExecution(toolName, parameters, sessionId) {
    const context = await this.gatherContext(sessionId);
    
    const execution = await this.db.run(`
      INSERT INTO tool_executions (tool_name, parameters, context, user_session_id)
      VALUES (?, ?, ?, ?)
    `, [toolName, JSON.stringify(parameters), JSON.stringify(context), sessionId]);
    
    return execution.lastID;
  }

  async completeExecution(executionId, result, success, executionTime) {
    await this.db.run(`
      UPDATE tool_executions
      SET result = ?,
          success = ?,
          error_message = ?,
          execution_time_ms = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      JSON.stringify(result),
      success ? 1 : 0,
      success ? null : (result.error || 'Unknown error'),
      executionTime,
      executionId
    ]);
  }

  async detectPatterns(sessionId, hoursBack = 24) {
    console.error('🔍 Analyzing execution patterns...');
    
    // Get recent executions
    const recentExecutions = await this.db.all(`
      SELECT tool_name, parameters, context, result
      FROM tool_executions
      WHERE created_at > datetime('now', '-${hoursBack} hours')
        AND success = 1
      ORDER BY created_at DESC
      LIMIT 100
    `);
    
    if (recentExecutions.length < 2) {
      console.error('Not enough executions for pattern detection');
      return [];
    }
    
    // Analyze for sequential patterns
    const patterns = await this.analyzeSequences(recentExecutions);
    
    // Analyze for parameter patterns
    const paramPatterns = await this.analyzeParameterPatterns(recentExecutions);
    
    // Combine all patterns
    const allPatterns = [...patterns, ...paramPatterns];
    
    // Record detected patterns
    const recordedPatterns = [];
    for (const pattern of allPatterns) {
      const recorded = await this.recordPattern(pattern);
      if (recorded) {
        recordedPatterns.push(recorded);
      }
    }
    
    console.error(`✅ Detected ${recordedPatterns.length} patterns`);
    return recordedPatterns;
  }

  async analyzeSequences(executions) {
    const patterns = [];
    const sequences = new Map();
    
    // Look for repeated sequences of 2-5 actions
    for (let length = 2; length <= Math.min(5, executions.length); length++) {
      for (let i = 0; i <= executions.length - length; i++) {
        const sequence = executions.slice(i, i + length);
        const signature = this.generateSignature(sequence);
        
        if (sequences.has(signature)) {
          const existing = sequences.get(signature);
          existing.count++;
          existing.lastSeen = new Date();
        } else {
          sequences.set(signature, {
            sequence,
            signature,
            count: 1,
            firstSeen: new Date(),
            lastSeen: new Date()
          });
        }
      }
    }
    
    // Filter patterns that meet threshold
    for (const [signature, data] of sequences) {
      if (data.count >= this.patternThreshold) {
        patterns.push({
          type: 'sequence',
          signature,
          occurrences: data.count,
          sequence: data.sequence,
          suggestion: this.generateToolSuggestion(data.sequence),
          confidence: Math.min(1.0, data.count * 0.2)
        });
      }
    }
    
    return patterns;
  }

  async analyzeParameterPatterns(executions) {
    const patterns = [];
    const toolGroups = new Map();
    
    // Group executions by tool
    for (const exec of executions) {
      if (!toolGroups.has(exec.tool_name)) {
        toolGroups.set(exec.tool_name, []);
      }
      toolGroups.get(exec.tool_name).push(exec);
    }
    
    // Look for parameter patterns within each tool
    for (const [toolName, execs] of toolGroups) {
      if (execs.length >= this.patternThreshold) {
        const paramPattern = this.findParameterPattern(execs);
        if (paramPattern) {
          patterns.push({
            type: 'parameter',
            signature: `param_pattern_${toolName}_${Date.now()}`,
            occurrences: execs.length,
            toolName,
            parameterPattern: paramPattern,
            suggestion: this.generateParameterToolSuggestion(toolName, paramPattern),
            confidence: Math.min(1.0, execs.length * 0.15)
          });
        }
      }
    }
    
    return patterns;
  }

  findParameterPattern(executions) {
    // Analyze parameters to find common patterns
    const allParams = executions.map(e => JSON.parse(e.parameters));
    
    if (allParams.length < 2) return null;
    
    // Find common keys
    const commonKeys = this.findCommonKeys(allParams);
    
    // Find varying keys
    const varyingKeys = this.findVaryingKeys(allParams);
    
    // Find patterns in values
    const valuePatterns = this.findValuePatterns(allParams);
    
    if (commonKeys.length > 0 || valuePatterns.length > 0) {
      return {
        commonKeys,
        varyingKeys,
        valuePatterns
      };
    }
    
    return null;
  }

  findCommonKeys(paramArrays) {
    if (paramArrays.length === 0) return [];
    
    const firstKeys = Object.keys(paramArrays[0]);
    return firstKeys.filter(key => 
      paramArrays.every(params => key in params)
    );
  }

  findVaryingKeys(paramArrays) {
    const allKeys = new Set();
    paramArrays.forEach(params => {
      Object.keys(params).forEach(key => allKeys.add(key));
    });
    
    const commonKeys = this.findCommonKeys(paramArrays);
    return Array.from(allKeys).filter(key => !commonKeys.includes(key));
  }

  findValuePatterns(paramArrays) {
    const patterns = [];
    const commonKeys = this.findCommonKeys(paramArrays);
    
    for (const key of commonKeys) {
      const values = paramArrays.map(p => p[key]);
      
      // Check if all values are the same
      if (values.every(v => v === values[0])) {
        patterns.push({
          key,
          type: 'constant',
          value: values[0]
        });
      }
      // Check if values follow a pattern (e.g., all strings, all numbers)
      else if (values.every(v => typeof v === typeof values[0])) {
        patterns.push({
          key,
          type: 'variable',
          dataType: typeof values[0]
        });
      }
    }
    
    return patterns;
  }

  generateSignature(sequence) {
    // Create a unique signature for a sequence of actions
    return sequence
      .map(s => `${s.tool_name}:${this.normalizeParams(s.parameters)}`)
      .join('->');
  }

  normalizeParams(params) {
    // Extract key parameter patterns, ignore values that change
    try {
      const parsed = typeof params === 'string' ? JSON.parse(params) : params;
      const normalized = {};
      
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string' && value.length > 20) {
          normalized[key] = '<string>';
        } else if (typeof value === 'number') {
          normalized[key] = '<number>';
        } else if (typeof value === 'boolean') {
          normalized[key] = '<boolean>';
        } else if (Array.isArray(value)) {
          normalized[key] = '<array>';
        } else if (typeof value === 'object' && value !== null) {
          normalized[key] = '<object>';
        } else {
          normalized[key] = value;
        }
      }
      
      return JSON.stringify(normalized);
    } catch {
      return '{}';
    }
  }

  async recordPattern(pattern) {
    try {
      // Check if pattern already exists
      const existing = await this.db.get(`
        SELECT id, occurrences, confidence_score
        FROM learned_patterns
        WHERE pattern_signature = ?
      `, [pattern.signature]);
      
      if (existing) {
        // Update existing pattern
        const newOccurrences = existing.occurrences + 1;
        const newConfidence = Math.min(1.0, existing.confidence_score + 0.1);
        
        await this.db.run(`
          UPDATE learned_patterns
          SET occurrences = ?,
              last_seen = CURRENT_TIMESTAMP,
              confidence_score = ?
          WHERE id = ?
        `, [newOccurrences, newConfidence, existing.id]);
        
        // Check if we should auto-generate a tool
        if (newOccurrences >= this.autoGenerateThreshold && 
            newConfidence >= this.confidenceThreshold) {
          await this.autoGenerateTool(pattern, existing.id);
        }
        
        return { 
          ...pattern, 
          id: existing.id, 
          occurrences: newOccurrences,
          pattern_signature: pattern.signature,
          pattern_type: pattern.type,
          confidence_score: newConfidence
        };
      } else {
        // Insert new pattern
        const result = await this.db.run(`
          INSERT INTO learned_patterns 
            (pattern_signature, pattern_type, pattern_data, occurrences, 
             tool_suggestion, confidence_score, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          pattern.signature,
          pattern.type,
          JSON.stringify(pattern),
          pattern.occurrences,
          JSON.stringify(pattern.suggestion),
          pattern.confidence,
          JSON.stringify(pattern.metadata || {})
        ]);
        
        return { 
          ...pattern, 
          id: result.lastID,
          pattern_signature: pattern.signature,
          pattern_type: pattern.type,
          confidence_score: pattern.confidence,
          tool_suggestion: JSON.stringify(pattern.suggestion)
        };
      }
    } catch (error) {
      console.error('Error recording pattern:', error);
      return null;
    }
  }

  generateToolSuggestion(sequence) {
    // Generate a tool suggestion based on the sequence
    const steps = sequence.map(s => ({
      action: s.tool_name,
      params: JSON.parse(s.parameters)
    }));
    
    const toolName = this.generateToolName(sequence);
    
    return {
      name: `auto_${toolName}`,
      description: `Automated sequence of ${sequence.length} actions`,
      steps,
      parameters: this.extractCommonParameters(sequence)
    };
  }

  generateParameterToolSuggestion(toolName, paramPattern) {
    return {
      name: `auto_${toolName}_preset`,
      description: `Preset configuration for ${toolName}`,
      baseTool: toolName,
      presetParams: paramPattern.valuePatterns
        .filter(p => p.type === 'constant')
        .reduce((acc, p) => ({ ...acc, [p.key]: p.value }), {}),
      variableParams: paramPattern.varyingKeys
    };
  }

  generateToolName(sequence) {
    // Create a meaningful name from the sequence
    const actions = sequence.map(s => {
      const parts = s.tool_name.split('_');
      return parts[0] || s.tool_name;
    });
    
    // Take first letter of each action
    if (actions.length <= 3) {
      return actions.join('_').toLowerCase();
    } else {
      return actions.map(a => a[0]).join('').toLowerCase() + '_sequence';
    }
  }

  extractCommonParameters(sequence) {
    // Find parameters that vary across the sequence
    const allParams = new Set();
    
    sequence.forEach(s => {
      try {
        const params = JSON.parse(s.parameters);
        Object.keys(params).forEach(key => allParams.add(key));
      } catch {
        // Ignore parse errors
      }
    });
    
    return Array.from(allParams);
  }

  async autoGenerateTool(pattern, patternId) {
    console.error(`🔧 Auto-generating tool from pattern ${patternId}...`);
    
    const toolCode = this.generateToolCode(pattern.suggestion || pattern);
    const toolName = pattern.suggestion?.name || `auto_tool_${Date.now()}`;
    
    try {
      const result = await this.db.run(`
        INSERT INTO generated_tools 
          (tool_name, tool_category, source_pattern_id, code_content, config)
        VALUES (?, ?, ?, ?, ?)
      `, [
        toolName,
        'automated',
        patternId,
        toolCode,
        JSON.stringify(pattern.suggestion || {})
      ]);
      
      // Update pattern with tool reference
      await this.db.run(`
        UPDATE learned_patterns
        SET tool_id = ?, auto_created = 1
        WHERE id = ?
      `, [result.lastID, patternId]);
      
      // Add to knowledge base
      await this.addToKnowledgeBase(toolName, pattern);
      
      console.error(`✅ Tool ${toolName} generated successfully`);
      
      return {
        id: result.lastID,
        tool_name: toolName
      };
    } catch (error) {
      console.error('Error generating tool:', error);
      return null;
    }
  }

  async generateToolFromPattern(patternId) {
    const pattern = await this.db.get(`
      SELECT * FROM learned_patterns WHERE id = ?
    `, [patternId]);
    
    if (!pattern) {
      throw new Error(`Pattern ${patternId} not found`);
    }
    
    const patternData = JSON.parse(pattern.pattern_data);
    return await this.autoGenerateTool(patternData, patternId);
  }

  generateToolCode(suggestion) {
    // Generate actual executable tool code
    if (suggestion.steps) {
      // Sequence-based tool
      return `
export async function ${suggestion.name}(params, context) {
  const results = [];
  const errors = [];
  
  ${suggestion.steps.map((step, i) => `
  // Step ${i + 1}: ${step.action}
  try {
    const result${i} = await context.execute('${step.action}', {
      ...${JSON.stringify(step.params)},
      ...params
    });
    results.push({ step: ${i + 1}, action: '${step.action}', result: result${i} });
  } catch (error) {
    errors.push({ step: ${i + 1}, action: '${step.action}', error: error.message });
  }`).join('\n')}
  
  return {
    success: errors.length === 0,
    results,
    errors,
    summary: errors.length === 0 
      ? \`Completed ${suggestion.steps.length} actions successfully\`
      : \`Completed with \${errors.length} errors\`
  };
}`;
    } else if (suggestion.baseTool) {
      // Parameter preset tool
      return `
export async function ${suggestion.name}(params, context) {
  // Preset tool for ${suggestion.baseTool}
  const presetParams = ${JSON.stringify(suggestion.presetParams || {})};
  const mergedParams = { ...presetParams, ...params };
  
  return await context.execute('${suggestion.baseTool}', mergedParams);
}`;
    } else {
      // Generic tool template
      return `
export async function ${suggestion.name}(params, context) {
  // Auto-generated tool
  return {
    success: true,
    message: 'Tool executed',
    params
  };
}`;
    }
  }

  async addToKnowledgeBase(toolName, pattern) {
    const content = `
Auto-generated tool based on detected usage pattern.

**Pattern Type**: ${pattern.type}
**Occurrences**: ${pattern.occurrences || pattern.count}
**Confidence**: ${(pattern.confidence * 100).toFixed(1)}%
**Learning Mode**: ${this.getLearningModeForPattern(pattern)}

This tool was automatically generated to streamline a frequently used sequence of actions.

**Usage Context**: ${pattern.context || 'General usage patterns'}
**Optimization Potential**: ${this.calculateOptimizationPotential(pattern)}%
    `.trim();
    
    await this.db.run(`
      INSERT INTO knowledge_entries (entry_type, title, content, tags)
      VALUES (?, ?, ?, ?)
    `, [
      'documentation',
      `Auto-generated tool: ${toolName}`,
      content,
      JSON.stringify(['auto-generated', 'tool', toolName, pattern.type, 'enhanced-learning'])
    ]);
  }

  getLearningModeForPattern(pattern) {
    const modes = [];
    if (pattern.type === 'sequence') modes.push('workflow-optimization');
    if (pattern.type === 'parameter') modes.push('parameter-learning');
    if (pattern.queryBased) modes.push('query-learning');
    return modes.length > 0 ? modes.join(', ') : 'general';
  }

  calculateOptimizationPotential(pattern) {
    let potential = 50; // Base potential
    potential += (pattern.occurrences || 1) * 10; // More occurrences = more potential
    potential += (pattern.confidence || 0.5) * 30; // Higher confidence = more potential
    potential = Math.min(95, Math.max(10, potential)); // Clamp between 10-95%
    return Math.round(potential);
  }

  async gatherContext(sessionId) {
    // Gather current context
    const session = await this.db.get(`
      SELECT context FROM user_sessions WHERE session_id = ?
    `, [sessionId]);
    
    const recentActions = await this.getRecentActions(5);
    
    return {
      timestamp: new Date().toISOString(),
      sessionId,
      sessionContext: session ? JSON.parse(session.context) : {},
      recentActions
    };
  }

  async getRecentActions(limit) {
    const actions = await this.db.all(`
      SELECT tool_name, parameters, created_at
      FROM tool_executions
      WHERE success = 1
      ORDER BY created_at DESC
      LIMIT ?
    `, [limit]);
    
    return actions.map(a => ({
      tool: a.tool_name,
      params: JSON.parse(a.parameters),
      timestamp: a.created_at
    }));
  }

  // ========== ENHANCED LEARNING METHODS ==========

  /**
   * Learn from query patterns and natural language requests
   */
  async learnFromQuery(query, response, success, context = {}) {
    if (!this.learningModes.queries) return null;

    try {
      const queryPattern = this.analyzeQueryPattern(query);
      const queryIntent = this.classifyQueryIntent(query);
      
      const existingPattern = await this.db.get(`
        SELECT * FROM query_patterns 
        WHERE pattern_hash = ? AND intent = ?
      `, [queryPattern.hash, queryIntent]);

      if (existingPattern) {
        // Update existing pattern
        await this.db.run(`
          UPDATE query_patterns 
          SET occurrences = occurrences + 1,
              success_rate = (success_count + ?) / (occurrences + 1),
              success_count = success_count + ?,
              last_seen = CURRENT_TIMESTAMP,
              response_template = ?
          WHERE id = ?
        `, [success ? 1 : 0, success ? 1 : 0, response, existingPattern.id]);
      } else {
        // Create new pattern
        await this.db.run(`
          INSERT INTO query_patterns 
          (pattern_hash, intent, pattern_text, response_template, occurrences, 
           success_count, success_rate, context, created_at)
          VALUES (?, ?, ?, ?, 1, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
          queryPattern.hash, queryIntent, queryPattern.normalized, 
          response, success ? 1 : 0, success ? 1 : 0, JSON.stringify(context)
        ]);
      }

      return {
        pattern: queryPattern,
        intent: queryIntent,
        learned: true
      };
    } catch (error) {
      console.warn('Query learning failed:', error.message);
      return null;
    }
  }

  /**
   * Analyze workflow patterns for optimization opportunities  
   */
  async analyzeWorkflowOptimization(sessionId, hoursBack = 24) {
    if (!this.learningModes.workflows) return [];

    const workflows = await this.db.all(`
      SELECT tool_name, parameters, execution_time_ms, created_at
      FROM tool_executions
      WHERE user_session_id = ? 
        AND created_at > datetime('now', '-${hoursBack} hours')
        AND success = 1
      ORDER BY created_at ASC
    `, [sessionId]);

    const optimizations = [];
    
    // Detect slow operations
    const slowOperations = workflows.filter(w => w.execution_time_ms > 5000);
    if (slowOperations.length > 0) {
      optimizations.push({
        type: 'performance',
        issue: 'slow_operations',
        operations: slowOperations,
        suggestion: 'Consider caching or optimization for slow operations',
        potential_savings: this.calculateTimeSavings(slowOperations)
      });
    }

    // Detect repetitive sequences
    const sequences = this.findWorkflowSequences(workflows);
    for (const seq of sequences) {
      if (seq.occurrences >= this.workflowOptimizationThreshold) {
        optimizations.push({
          type: 'automation',
          issue: 'repetitive_sequence',
          sequence: seq.pattern,
          occurrences: seq.occurrences,
          suggestion: `Create macro for ${seq.pattern.length}-step sequence`,
          potential_savings: seq.occurrences * seq.pattern.length * 30 // 30s per avoided step
        });
      }
    }

    // Store optimization insights
    for (const opt of optimizations) {
      await this.storeOptimizationInsight(opt);
    }

    return optimizations;
  }

  /**
   * Predict potential errors based on historical patterns
   */
  async predictPotentialErrors(toolName, parameters, context = {}) {
    if (!this.learningModes.errors) return { risk: 'unknown', confidence: 0 };

    try {
      // Get historical failures for this tool
      const failures = await this.db.all(`
        SELECT parameters, error_message, context
        FROM tool_executions
        WHERE tool_name = ? AND success = 0
        ORDER BY created_at DESC
        LIMIT 20
      `, [toolName]);

      if (failures.length === 0) {
        return { risk: 'low', confidence: 0.8, reason: 'No historical failures' };
      }

      // Analyze parameter similarities
      let riskScore = 0;
      let maxConfidence = 0;
      const reasons = [];

      for (const failure of failures) {
        try {
          const failureParams = JSON.parse(failure.parameters);
          const similarity = this.calculateParameterSimilarity(parameters, failureParams);
          
          if (similarity > 0.7) {
            riskScore += similarity;
            maxConfidence = Math.max(maxConfidence, similarity);
            reasons.push(`Similar to failure: ${failure.error_message}`);
          }
        } catch (e) {
          // Skip malformed parameter data
          continue;
        }
      }

      const avgRisk = riskScore / failures.length;
      let riskLevel = 'low';
      if (avgRisk > 0.5) riskLevel = 'high';
      else if (avgRisk > 0.2) riskLevel = 'medium';

      return {
        risk: riskLevel,
        confidence: maxConfidence,
        reasons: reasons.slice(0, 3), // Top 3 reasons
        historical_failures: failures.length
      };
    } catch (error) {
      return { risk: 'unknown', confidence: 0, error: error.message };
    }
  }

  /**
   * Enable cross-project learning by generalizing patterns
   */
  async enableCrossProjectLearning() {
    if (!this.learningModes.crossProject) return false;

    try {
      // Find patterns that appear across multiple projects
      const crossPatterns = await this.db.all(`
        SELECT pattern_signature, pattern_type, COUNT(DISTINCT learned_from) as project_count
        FROM learned_patterns
        WHERE learned_from IS NOT NULL AND learned_from != ''
        GROUP BY pattern_signature, pattern_type
        HAVING project_count > 1
      `);

      for (const pattern of crossPatterns) {
        // Promote to global pattern
        await this.db.run(`
          UPDATE learned_patterns 
          SET scope = 'global', 
              confidence_score = confidence_score * 1.2,
              metadata = JSON_SET(metadata, '$.cross_project', true)
          WHERE pattern_signature = ?
        `, [pattern.pattern_signature]);
      }

      return {
        success: true,
        promoted_patterns: crossPatterns.length,
        message: `Promoted ${crossPatterns.length} patterns to global scope`
      };
    } catch (error) {
      console.error('Cross-project learning failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get learning insights and recommendations
   */
  async getLearningInsights(sessionId = null, hoursBack = 24) {
    const insights = {
      patterns_detected: 0,
      tools_generated: 0,
      optimizations_found: 0,
      error_predictions: 0,
      recommendations: []
    };

    try {
      // Pattern insights
      const patternCount = await this.db.get(`
        SELECT COUNT(*) as count FROM learned_patterns 
        WHERE created_at > datetime('now', '-${hoursBack} hours')
      `);
      insights.patterns_detected = patternCount?.count || 0;

      // Tool generation insights
      const toolCount = await this.db.get(`
        SELECT COUNT(*) as count FROM generated_tools 
        WHERE created_at > datetime('now', '-${hoursBack} hours') AND is_active = 1
      `);
      insights.tools_generated = toolCount?.count || 0;

      // Recent optimizations
      if (sessionId) {
        const optimizations = await this.analyzeWorkflowOptimization(sessionId, hoursBack);
        insights.optimizations_found = optimizations.length;
        
        if (optimizations.length > 0) {
          insights.recommendations.push({
            type: 'optimization',
            priority: 'high',
            message: `Found ${optimizations.length} workflow optimization opportunities`,
            details: optimizations.slice(0, 3)
          });
        }
      }

      // Cross-project opportunities
      const crossProjectResult = await this.enableCrossProjectLearning();
      if (crossProjectResult.success && crossProjectResult.promoted_patterns > 0) {
        insights.recommendations.push({
          type: 'cross_project',
          priority: 'medium',
          message: `${crossProjectResult.promoted_patterns} patterns promoted to global scope`,
          details: crossProjectResult
        });
      }

      return insights;
    } catch (error) {
      console.error('Failed to generate learning insights:', error.message);
      return insights;
    }
  }

  // ========== UTILITY METHODS ==========

  analyzeQueryPattern(query) {
    const normalized = query.toLowerCase()
      .replace(/\d+/g, 'NUM')
      .replace(/['"]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    const hash = this.simpleHash(normalized);
    
    return { normalized, hash };
  }

  classifyQueryIntent(query) {
    const q = query.toLowerCase();
    
    if (q.includes('create') || q.includes('generate') || q.includes('make')) return 'creation';
    if (q.includes('list') || q.includes('show') || q.includes('get')) return 'retrieval';
    if (q.includes('update') || q.includes('modify') || q.includes('change')) return 'modification';
    if (q.includes('delete') || q.includes('remove')) return 'deletion';
    if (q.includes('help') || q.includes('how') || q.includes('what')) return 'help';
    if (q.includes('test') || q.includes('check') || q.includes('validate')) return 'validation';
    
    return 'general';
  }

  findWorkflowSequences(workflows) {
    const sequences = new Map();
    
    // Look for sequences of 2-4 operations
    for (let len = 2; len <= 4 && len <= workflows.length; len++) {
      for (let i = 0; i <= workflows.length - len; i++) {
        const sequence = workflows.slice(i, i + len);
        const pattern = sequence.map(w => w.tool_name).join('->');
        
        if (sequences.has(pattern)) {
          sequences.get(pattern).occurrences++;
        } else {
          sequences.set(pattern, {
            pattern: sequence.map(w => ({ tool: w.tool_name, avgTime: w.execution_time_ms })),
            occurrences: 1
          });
        }
      }
    }
    
    return Array.from(sequences.values());
  }

  calculateTimeSavings(operations) {
    const totalTime = operations.reduce((sum, op) => sum + (op.execution_time_ms || 0), 0);
    return Math.round(totalTime * 0.3); // Assume 30% improvement potential
  }

  calculateParameterSimilarity(params1, params2) {
    const keys1 = Object.keys(params1);
    const keys2 = Object.keys(params2);
    const allKeys = new Set([...keys1, ...keys2]);
    
    let matches = 0;
    for (const key of allKeys) {
      if (key in params1 && key in params2) {
        if (params1[key] === params2[key]) {
          matches += 1;
        } else if (typeof params1[key] === typeof params2[key]) {
          matches += 0.5; // Partial match for same type
        }
      }
    }
    
    return matches / allKeys.size;
  }

  async storeOptimizationInsight(optimization) {
    await this.db.run(`
      INSERT INTO optimization_insights 
      (type, issue, suggestion, potential_savings, data, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      optimization.type,
      optimization.issue,
      optimization.suggestion,
      optimization.potential_savings || 0,
      JSON.stringify(optimization)
    ]);
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
}