/**
 * Security Manager for Saralegui MCP Server
 * Handles authentication, rate limiting, input validation, and security policies
 */

import crypto from 'crypto';
import chalk from 'chalk';

export class SecurityManager {
  constructor(database) {
    this.db = database;
    this.rateLimits = new Map(); // sessionId -> { calls: [], windowStart: timestamp }
    this.blockedSessions = new Set();
    this.trustedSessions = new Set();
    
    // Security configuration
    this.config = {
      // Rate limiting
      defaultRateLimit: parseInt(process.env.RATE_LIMIT_DEFAULT) || 100, // requests per window
      rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000, // 1 minute
      highPrivilegeRateLimit: parseInt(process.env.RATE_LIMIT_HIGH) || 500,
      
      // Input validation
      maxParameterSize: parseInt(process.env.MAX_PARAM_SIZE) || 1024 * 1024, // 1MB
      maxParameterDepth: parseInt(process.env.MAX_PARAM_DEPTH) || 10,
      allowedToolNamePattern: /^[a-zA-Z_][a-zA-Z0-9_-]*$/,
      
      // Security policies
      blockSuspiciousPatterns: process.env.BLOCK_SUSPICIOUS !== 'false',
      enableAuditLogging: process.env.AUDIT_LOGGING !== 'false',
      enableThreatDetection: process.env.THREAT_DETECTION !== 'false',
      
      // Tool execution security
      maxExecutionTime: parseInt(process.env.MAX_EXECUTION_TIME) || 30000, // 30 seconds
      maxConcurrentExecutions: parseInt(process.env.MAX_CONCURRENT_EXEC) || 5,
      
      // Dangerous operations
      dangerousTools: [
        'exec', 'shell', 'eval', 'system', 'process',
        'file_delete', 'file_write', 'db_drop', 'db_delete'
      ],
      requireConfirmationTools: [
        'generate_tool', 'delete_tool', 'modify_schema', 'reset_database'
      ]
    };

    // Active executions tracking
    this.activeExecutions = new Map(); // sessionId -> Set of execution IDs
    
    // Threat detection patterns
    this.suspiciousPatterns = [
      /eval\s*\(/i,
      /exec\s*\(/i,
      /system\s*\(/i,
      /require\s*\(/i,
      /import\s*\(/i,
      /__proto__/i,
      /constructor/i,
      /process\.exit/i,
      /fs\.unlink/i,
      /fs\.rm/i,
      /child_process/i,
      /\.\.\/\.\.\//,  // Path traversal
      /\x00/,          // Null bytes
      /<script/i,      // XSS attempts
      /javascript:/i   // XSS attempts
    ];
  }

  /**
   * Initialize security manager
   */
  async initialize() {
    console.error('🛡️ Initializing Security Manager...');
    
    try {
      // Create security tables if they don't exist
      await this.createSecurityTables();
      
      // Load trusted sessions from database
      await this.loadTrustedSessions();
      
      // Start cleanup intervals
      this.startCleanupTasks();
      
      console.error('✅ Security Manager initialized');
    } catch (error) {
      console.error('❌ Security Manager initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Create security-related database tables
   */
  async createSecurityTables() {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS security_events (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        session_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        severity TEXT DEFAULT 'info',
        details TEXT,
        tool_name TEXT,
        parameters TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_security_events_session 
      ON security_events(session_id, created_at);
      
      CREATE INDEX IF NOT EXISTS idx_security_events_type 
      ON security_events(event_type, created_at);
      
      CREATE TABLE IF NOT EXISTS trusted_sessions (
        session_id TEXT PRIMARY KEY,
        trust_level TEXT DEFAULT 'basic',
        granted_by TEXT,
        expires_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS rate_limit_violations (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        session_id TEXT NOT NULL,
        limit_type TEXT,
        violation_count INTEGER DEFAULT 1,
        window_start TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  /**
   * Load trusted sessions from database
   */
  async loadTrustedSessions() {
    try {
      const trustedSessions = await this.db.all(`
        SELECT session_id, trust_level 
        FROM trusted_sessions 
        WHERE expires_at IS NULL OR expires_at > datetime('now')
      `);

      for (const session of trustedSessions) {
        this.trustedSessions.add(session.session_id);
      }

      if (trustedSessions.length > 0) {
        console.error(`🔐 Loaded ${trustedSessions.length} trusted sessions`);
      }
    } catch (error) {
      console.warn('⚠️  Could not load trusted sessions:', error.message);
    }
  }

  /**
   * Validate tool execution request
   * @param {string} sessionId - Session identifier
   * @param {string} toolName - Name of the tool to execute
   * @param {Object} parameters - Tool parameters
   * @returns {Promise<Object>} Validation result
   */
  async validateToolExecution(sessionId, toolName, parameters = {}) {
    const validationResult = {
      allowed: true,
      reasons: [],
      severity: 'info',
      requiresConfirmation: false,
      warnings: []
    };

    try {
      // 1. Check if session is blocked
      if (this.blockedSessions.has(sessionId)) {
        validationResult.allowed = false;
        validationResult.reasons.push('Session is blocked');
        validationResult.severity = 'critical';
        await this.logSecurityEvent(sessionId, 'blocked_session_attempt', 'critical', {
          toolName,
          parameters: this.sanitizeForLogging(parameters)
        });
        return validationResult;
      }

      // 2. Rate limiting check
      const rateLimitResult = await this.checkRateLimit(sessionId);
      if (!rateLimitResult.allowed) {
        validationResult.allowed = false;
        validationResult.reasons.push(`Rate limit exceeded: ${rateLimitResult.message}`);
        validationResult.severity = 'warning';
        return validationResult;
      }

      // 3. Validate tool name
      if (!this.config.allowedToolNamePattern.test(toolName)) {
        validationResult.allowed = false;
        validationResult.reasons.push('Invalid tool name format');
        validationResult.severity = 'high';
        await this.logSecurityEvent(sessionId, 'invalid_tool_name', 'high', { toolName });
        return validationResult;
      }

      // 4. Check for dangerous tools
      if (this.config.dangerousTools.includes(toolName)) {
        if (!this.trustedSessions.has(sessionId)) {
          validationResult.allowed = false;
          validationResult.reasons.push('Dangerous tool requires trusted session');
          validationResult.severity = 'high';
          await this.logSecurityEvent(sessionId, 'dangerous_tool_denied', 'high', { toolName });
          return validationResult;
        } else {
          validationResult.warnings.push('Executing dangerous tool with trusted session');
        }
      }

      // 5. Check for tools requiring confirmation
      if (this.config.requireConfirmationTools.includes(toolName)) {
        validationResult.requiresConfirmation = true;
        validationResult.warnings.push('Tool requires explicit confirmation');
      }

      // 6. Validate parameters
      const paramValidation = await this.validateParameters(parameters, toolName);
      if (!paramValidation.valid) {
        validationResult.allowed = false;
        validationResult.reasons.push(...paramValidation.errors);
        validationResult.severity = paramValidation.severity;
        return validationResult;
      }

      // 7. Check concurrent executions
      const concurrentCheck = this.checkConcurrentExecutions(sessionId);
      if (!concurrentCheck.allowed) {
        validationResult.allowed = false;
        validationResult.reasons.push('Too many concurrent executions');
        validationResult.severity = 'warning';
        return validationResult;
      }

      // 8. Threat detection
      if (this.config.enableThreatDetection) {
        const threatResult = await this.detectThreats(sessionId, toolName, parameters);
        if (threatResult.detected) {
          validationResult.allowed = false;
          validationResult.reasons.push('Threat detected: ' + threatResult.reason);
          validationResult.severity = 'critical';
          return validationResult;
        }
      }

      // Log successful validation for audit trail
      if (this.config.enableAuditLogging) {
        await this.logSecurityEvent(sessionId, 'tool_execution_allowed', 'info', {
          toolName,
          parameterKeys: Object.keys(parameters),
          trusted: this.trustedSessions.has(sessionId)
        });
      }

    } catch (error) {
      console.error('❌ Security validation error:', error.message);
      validationResult.allowed = false;
      validationResult.reasons.push('Security validation failed');
      validationResult.severity = 'critical';
    }

    return validationResult;
  }

  /**
   * Check rate limits for a session
   */
  async checkRateLimit(sessionId) {
    const now = Date.now();
    const window = this.config.rateLimitWindow;
    const limit = this.trustedSessions.has(sessionId) 
      ? this.config.highPrivilegeRateLimit 
      : this.config.defaultRateLimit;

    // Get or create rate limit tracking
    let sessionLimits = this.rateLimits.get(sessionId);
    if (!sessionLimits) {
      sessionLimits = {
        calls: [],
        windowStart: now
      };
      this.rateLimits.set(sessionId, sessionLimits);
    }

    // Clean old calls outside current window
    sessionLimits.calls = sessionLimits.calls.filter(callTime => 
      now - callTime < window
    );

    // Check if we're within limits
    if (sessionLimits.calls.length >= limit) {
      // Log rate limit violation
      await this.logRateLimitViolation(sessionId, 'execution', limit, sessionLimits.calls.length);
      
      return {
        allowed: false,
        message: `Rate limit exceeded (${sessionLimits.calls.length}/${limit} in ${window}ms)`,
        current: sessionLimits.calls.length,
        limit,
        resetTime: now + window
      };
    }

    // Record this call
    sessionLimits.calls.push(now);

    return {
      allowed: true,
      current: sessionLimits.calls.length,
      limit,
      remaining: limit - sessionLimits.calls.length
    };
  }

  /**
   * Validate tool parameters
   */
  async validateParameters(parameters, toolName) {
    const result = {
      valid: true,
      errors: [],
      severity: 'info'
    };

    try {
      // Check parameter size
      const paramString = JSON.stringify(parameters);
      if (paramString.length > this.config.maxParameterSize) {
        result.valid = false;
        result.errors.push(`Parameter size too large: ${paramString.length} > ${this.config.maxParameterSize}`);
        result.severity = 'high';
      }

      // Check parameter depth
      const depth = this.getObjectDepth(parameters);
      if (depth > this.config.maxParameterDepth) {
        result.valid = false;
        result.errors.push(`Parameter depth too deep: ${depth} > ${this.config.maxParameterDepth}`);
        result.severity = 'high';
      }

      // Check for suspicious patterns in parameters
      if (this.config.blockSuspiciousPatterns) {
        const suspiciousContent = this.findSuspiciousPatterns(paramString);
        if (suspiciousContent.length > 0) {
          result.valid = false;
          result.errors.push(`Suspicious patterns detected: ${suspiciousContent.join(', ')}`);
          result.severity = 'critical';
        }
      }

      // Type validation for common parameters
      if (parameters.command && typeof parameters.command !== 'string') {
        result.errors.push('Command parameter must be a string');
        result.severity = 'medium';
      }

      if (parameters.path) {
        const pathValidation = this.validatePath(parameters.path);
        if (!pathValidation.valid) {
          result.valid = false;
          result.errors.push(pathValidation.error);
          result.severity = 'high';
        }
      }

    } catch (error) {
      result.valid = false;
      result.errors.push('Parameter validation failed: ' + error.message);
      result.severity = 'critical';
    }

    return result;
  }

  /**
   * Validate file paths for path traversal attacks
   */
  validatePath(path) {
    if (typeof path !== 'string') {
      return { valid: false, error: 'Path must be a string' };
    }

    // Check for path traversal
    if (path.includes('../') || path.includes('..\\')) {
      return { valid: false, error: 'Path traversal detected' };
    }

    // Check for absolute paths to sensitive directories
    const sensitivePaths = ['/etc', '/root', '/proc', '/sys', 'C:\\Windows', 'C:\\System32'];
    for (const sensitivePath of sensitivePaths) {
      if (path.startsWith(sensitivePath)) {
        return { valid: false, error: 'Access to sensitive path denied' };
      }
    }

    return { valid: true };
  }

  /**
   * Check concurrent executions for a session
   */
  checkConcurrentExecutions(sessionId) {
    const activeSet = this.activeExecutions.get(sessionId);
    const currentCount = activeSet ? activeSet.size : 0;

    if (currentCount >= this.config.maxConcurrentExecutions) {
      return {
        allowed: false,
        current: currentCount,
        max: this.config.maxConcurrentExecutions
      };
    }

    return {
      allowed: true,
      current: currentCount,
      max: this.config.maxConcurrentExecutions
    };
  }

  /**
   * Track execution start
   */
  trackExecutionStart(sessionId, executionId) {
    if (!this.activeExecutions.has(sessionId)) {
      this.activeExecutions.set(sessionId, new Set());
    }
    this.activeExecutions.get(sessionId).add(executionId);

    // Set timeout to automatically clean up
    setTimeout(() => {
      this.trackExecutionEnd(sessionId, executionId);
    }, this.config.maxExecutionTime);
  }

  /**
   * Track execution end
   */
  trackExecutionEnd(sessionId, executionId) {
    const activeSet = this.activeExecutions.get(sessionId);
    if (activeSet) {
      activeSet.delete(executionId);
      if (activeSet.size === 0) {
        this.activeExecutions.delete(sessionId);
      }
    }
  }

  /**
   * Detect threats in tool execution requests
   */
  async detectThreats(sessionId, toolName, parameters) {
    const result = {
      detected: false,
      reason: '',
      severity: 'info'
    };

    try {
      // Check for suspicious patterns in all parameter values
      const paramString = JSON.stringify(parameters);
      const suspiciousPatterns = this.findSuspiciousPatterns(paramString);
      
      if (suspiciousPatterns.length > 0) {
        result.detected = true;
        result.reason = `Suspicious patterns: ${suspiciousPatterns.join(', ')}`;
        result.severity = 'critical';
        
        await this.logSecurityEvent(sessionId, 'threat_detected', 'critical', {
          toolName,
          patterns: suspiciousPatterns,
          parameters: this.sanitizeForLogging(parameters)
        });
        
        return result;
      }

      // Check for rapid successive dangerous tool calls
      const recentEvents = await this.getRecentSecurityEvents(sessionId, 60000); // Last minute
      const dangerousToolCalls = recentEvents.filter(event => 
        event.event_type === 'tool_execution_allowed' && 
        event.tool_name && 
        this.config.dangerousTools.includes(event.tool_name)
      );

      if (dangerousToolCalls.length > 3) {
        result.detected = true;
        result.reason = 'Rapid dangerous tool usage detected';
        result.severity = 'high';
        
        await this.logSecurityEvent(sessionId, 'rapid_dangerous_usage', 'high', {
          toolName,
          recentDangerousCallCount: dangerousToolCalls.length
        });
      }

    } catch (error) {
      console.error('❌ Threat detection error:', error.message);
    }

    return result;
  }

  /**
   * Find suspicious patterns in text
   */
  findSuspiciousPatterns(text) {
    const found = [];
    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(text)) {
        found.push(pattern.source);
      }
    }
    return found;
  }

  /**
   * Get object depth for validation
   */
  getObjectDepth(obj, currentDepth = 0) {
    if (typeof obj !== 'object' || obj === null) {
      return currentDepth;
    }

    let maxDepth = currentDepth;
    for (const key in obj) {
      const depth = this.getObjectDepth(obj[key], currentDepth + 1);
      maxDepth = Math.max(maxDepth, depth);
    }

    return maxDepth;
  }

  /**
   * Log security event
   */
  async logSecurityEvent(sessionId, eventType, severity, details = {}) {
    try {
      await this.db.run(`
        INSERT INTO security_events 
          (session_id, event_type, severity, details, tool_name, parameters)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        sessionId,
        eventType,
        severity,
        JSON.stringify(details),
        details.toolName || null,
        details.parameters ? JSON.stringify(details.parameters) : null
      ]);
    } catch (error) {
      console.error('❌ Failed to log security event:', error.message);
    }
  }

  /**
   * Log rate limit violation
   */
  async logRateLimitViolation(sessionId, limitType, limit, currentCount) {
    try {
      await this.db.run(`
        INSERT INTO rate_limit_violations 
          (session_id, limit_type, violation_count, window_start)
        VALUES (?, ?, ?, datetime('now'))
      `, [sessionId, limitType, currentCount]);
      
      console.warn(chalk.yellow(`⚠️  Rate limit violation: ${sessionId} (${currentCount}/${limit})`));
    } catch (error) {
      console.error('❌ Failed to log rate limit violation:', error.message);
    }
  }

  /**
   * Get recent security events for a session
   */
  async getRecentSecurityEvents(sessionId, windowMs = 3600000) {
    const since = new Date(Date.now() - windowMs).toISOString();
    
    return await this.db.all(`
      SELECT * FROM security_events 
      WHERE session_id = ? AND created_at > ?
      ORDER BY created_at DESC
    `, [sessionId, since]);
  }

  /**
   * Block a session
   */
  async blockSession(sessionId, reason, blockedBy = 'system') {
    this.blockedSessions.add(sessionId);
    
    await this.logSecurityEvent(sessionId, 'session_blocked', 'critical', {
      reason,
      blockedBy
    });
    
    console.warn(chalk.red(`🚫 Session blocked: ${sessionId} (${reason})`));
  }

  /**
   * Unblock a session
   */
  unblockSession(sessionId) {
    const wasBlocked = this.blockedSessions.delete(sessionId);
    
    if (wasBlocked) {
      console.log(chalk.green(`✅ Session unblocked: ${sessionId}`));
    }
    
    return wasBlocked;
  }

  /**
   * Add trusted session
   */
  async addTrustedSession(sessionId, trustLevel = 'basic', grantedBy = 'system', expiresAt = null) {
    this.trustedSessions.add(sessionId);
    
    await this.db.run(`
      INSERT OR REPLACE INTO trusted_sessions 
        (session_id, trust_level, granted_by, expires_at)
      VALUES (?, ?, ?, ?)
    `, [sessionId, trustLevel, grantedBy, expiresAt]);
    
    await this.logSecurityEvent(sessionId, 'trust_granted', 'info', {
      trustLevel,
      grantedBy
    });
    
    console.log(chalk.green(`🔐 Trusted session added: ${sessionId} (${trustLevel})`));
  }

  /**
   * Remove trusted session
   */
  async removeTrustedSession(sessionId) {
    this.trustedSessions.delete(sessionId);
    
    await this.db.run(`
      DELETE FROM trusted_sessions WHERE session_id = ?
    `, [sessionId]);
    
    console.log(chalk.yellow(`🔓 Trusted session removed: ${sessionId}`));
  }

  /**
   * Get security status for a session
   */
  getSessionSecurityStatus(sessionId) {
    return {
      sessionId,
      blocked: this.blockedSessions.has(sessionId),
      trusted: this.trustedSessions.has(sessionId),
      activeExecutions: this.activeExecutions.get(sessionId)?.size || 0,
      rateLimit: this.rateLimits.get(sessionId) || null
    };
  }

  /**
   * Get security statistics
   */
  async getSecurityStats(hoursBack = 24) {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
    
    try {
      const eventStats = await this.db.all(`
        SELECT event_type, severity, COUNT(*) as count
        FROM security_events 
        WHERE created_at > ?
        GROUP BY event_type, severity
        ORDER BY count DESC
      `, [since]);

      const violationStats = await this.db.all(`
        SELECT limit_type, COUNT(*) as violations, SUM(violation_count) as total_violations
        FROM rate_limit_violations 
        WHERE created_at > ?
        GROUP BY limit_type
      `, [since]);

      return {
        period: `${hoursBack} hours`,
        blockedSessions: this.blockedSessions.size,
        trustedSessions: this.trustedSessions.size,
        activeExecutions: Array.from(this.activeExecutions.values()).reduce((sum, set) => sum + set.size, 0),
        events: eventStats,
        violations: violationStats
      };
    } catch (error) {
      console.error('❌ Failed to get security stats:', error.message);
      return null;
    }
  }

  /**
   * Sanitize data for logging (remove sensitive information)
   */
  sanitizeForLogging(data) {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const sanitized = {};
    const sensitiveKeys = ['password', 'token', 'key', 'secret', 'credential'];
    
    for (const [key, value] of Object.entries(data)) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > 100) {
        sanitized[key] = value.substring(0, 100) + '...';
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  /**
   * Start cleanup tasks
   */
  startCleanupTasks() {
    // Clean up old rate limit entries every 5 minutes
    setInterval(() => {
      const now = Date.now();
      const window = this.config.rateLimitWindow;
      
      for (const [sessionId, limits] of this.rateLimits.entries()) {
        limits.calls = limits.calls.filter(callTime => now - callTime < window);
        
        // Remove empty entries
        if (limits.calls.length === 0) {
          this.rateLimits.delete(sessionId);
        }
      }
    }, 5 * 60 * 1000);

    // Clean up old security events every hour
    setInterval(async () => {
      try {
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
        await this.db.run(`
          DELETE FROM security_events 
          WHERE created_at < ? AND severity NOT IN ('critical', 'high')
        `, [cutoff]);
      } catch (error) {
        console.warn('⚠️  Failed to clean up old security events:', error.message);
      }
    }, 60 * 60 * 1000);
  }

  /**
   * Get configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('🔧 Security configuration updated');
  }
}

export default SecurityManager;