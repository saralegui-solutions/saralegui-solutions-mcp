-- Validation Rules Extension for Saralegui MCP Database
-- Multi-scale learning system for validation rules across projects and clients

-- Enable foreign key support
PRAGMA foreign_keys = ON;

-- Core validation rules table
CREATE TABLE IF NOT EXISTS validation_rules (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    rule_id TEXT UNIQUE NOT NULL,           -- Unique identifier for the rule
    scope TEXT NOT NULL,                    -- 'global', 'organization', 'client', 'project'
    category TEXT NOT NULL,                 -- 'syntax', 'performance', 'security', 'style', 'netsuite'
    priority TEXT NOT NULL,                 -- 'error', 'warning', 'suggestion'
    technology TEXT NOT NULL,               -- 'javascript', 'netsuite', 'suitescript', 'general'
    pattern_text TEXT NOT NULL,             -- Regex pattern as text
    pattern_type TEXT DEFAULT 'regex',      -- 'regex', 'ast', 'function'
    message TEXT NOT NULL,                  -- Error/warning message
    suggestion TEXT,                        -- How to fix the issue
    auto_fix BOOLEAN DEFAULT 0,             -- Whether auto-fix is available
    auto_fix_pattern TEXT,                  -- Auto-fix replacement pattern
    learned_from TEXT,                      -- Project/context where this was discovered
    confidence REAL DEFAULT 0.5,           -- Confidence score (0.0-1.0)
    occurrences INTEGER DEFAULT 1,         -- How many times this pattern was seen
    effectiveness_score REAL DEFAULT 0.0,  -- How effective this rule has been
    metadata TEXT DEFAULT '{}',            -- JSON metadata for additional context
    is_active BOOLEAN DEFAULT 1,           -- Whether rule is currently active
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT DEFAULT 'system'       -- User or system that created this rule
);

-- Rule applications tracking
CREATE TABLE IF NOT EXISTS rule_applications (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    rule_id TEXT NOT NULL,
    project_path TEXT NOT NULL,
    client_name TEXT NOT NULL,
    file_path TEXT,                         -- Specific file where rule was applied
    line_number INTEGER,                    -- Line number where issue was found
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL,               -- Whether the rule correctly identified an issue
    false_positive BOOLEAN DEFAULT 0,      -- Whether this was a false positive
    user_feedback TEXT,                     -- User feedback about the rule
    fix_applied BOOLEAN DEFAULT 0,          -- Whether an auto-fix was applied
    execution_time_ms INTEGER,             -- Time taken to apply rule
    FOREIGN KEY (rule_id) REFERENCES validation_rules(rule_id) ON DELETE CASCADE
);

-- Client and project scope definitions
CREATE TABLE IF NOT EXISTS validation_scopes (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    scope_name TEXT UNIQUE NOT NULL,        -- Client name or project identifier
    scope_type TEXT NOT NULL,               -- 'client', 'project'
    parent_scope TEXT,                      -- Parent scope (e.g., project -> client -> organization)
    configuration TEXT DEFAULT '{}',       -- JSON configuration for this scope
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_scope) REFERENCES validation_scopes(scope_name)
);

-- Rule effectiveness tracking
CREATE TABLE IF NOT EXISTS rule_effectiveness (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    rule_id TEXT NOT NULL,
    time_period DATE NOT NULL,              -- Date for aggregation (daily)
    applications_count INTEGER DEFAULT 0,   -- How many times rule was applied
    true_positives INTEGER DEFAULT 0,       -- Correctly identified issues
    false_positives INTEGER DEFAULT 0,      -- Incorrectly flagged code
    fixes_applied INTEGER DEFAULT 0,        -- Auto-fixes applied
    user_feedback_positive INTEGER DEFAULT 0, -- Positive user feedback
    user_feedback_negative INTEGER DEFAULT 0, -- Negative user feedback
    avg_execution_time_ms INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rule_id) REFERENCES validation_rules(rule_id) ON DELETE CASCADE,
    UNIQUE(rule_id, time_period)
);

-- Pattern learning from code analysis
CREATE TABLE IF NOT EXISTS code_patterns (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    pattern_signature TEXT NOT NULL,        -- Hash of the pattern
    pattern_text TEXT NOT NULL,             -- Actual code pattern found
    pattern_context TEXT,                   -- Surrounding code context
    file_type TEXT,                         -- File extension or type
    project_path TEXT NOT NULL,
    client_name TEXT NOT NULL,
    frequency INTEGER DEFAULT 1,            -- How often this pattern appears
    classification TEXT,                    -- 'good', 'bad', 'neutral', 'unknown'
    confidence REAL DEFAULT 0.0,
    associated_rule_id TEXT,                -- If this pattern generated a rule
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT DEFAULT '{}',
    FOREIGN KEY (associated_rule_id) REFERENCES validation_rules(rule_id)
);

-- Technology-specific rule categories
CREATE TABLE IF NOT EXISTS rule_categories (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    category_name TEXT UNIQUE NOT NULL,
    technology TEXT NOT NULL,
    description TEXT,
    default_priority TEXT DEFAULT 'warning',
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_validation_rules_scope ON validation_rules(scope);
CREATE INDEX IF NOT EXISTS idx_validation_rules_category ON validation_rules(category);
CREATE INDEX IF NOT EXISTS idx_validation_rules_priority ON validation_rules(priority);
CREATE INDEX IF NOT EXISTS idx_validation_rules_technology ON validation_rules(technology);
CREATE INDEX IF NOT EXISTS idx_validation_rules_active ON validation_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_validation_rules_confidence ON validation_rules(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_validation_rules_effectiveness ON validation_rules(effectiveness_score DESC);

CREATE INDEX IF NOT EXISTS idx_rule_applications_rule ON rule_applications(rule_id);
CREATE INDEX IF NOT EXISTS idx_rule_applications_project ON rule_applications(project_path);
CREATE INDEX IF NOT EXISTS idx_rule_applications_client ON rule_applications(client_name);
CREATE INDEX IF NOT EXISTS idx_rule_applications_applied_at ON rule_applications(applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_rule_applications_success ON rule_applications(success);

CREATE INDEX IF NOT EXISTS idx_validation_scopes_type ON validation_scopes(scope_type);
CREATE INDEX IF NOT EXISTS idx_validation_scopes_active ON validation_scopes(is_active);

CREATE INDEX IF NOT EXISTS idx_rule_effectiveness_rule ON rule_effectiveness(rule_id);
CREATE INDEX IF NOT EXISTS idx_rule_effectiveness_period ON rule_effectiveness(time_period DESC);

CREATE INDEX IF NOT EXISTS idx_code_patterns_signature ON code_patterns(pattern_signature);
CREATE INDEX IF NOT EXISTS idx_code_patterns_project ON code_patterns(project_path);
CREATE INDEX IF NOT EXISTS idx_code_patterns_client ON code_patterns(client_name);
CREATE INDEX IF NOT EXISTS idx_code_patterns_classification ON code_patterns(classification);

-- Create triggers for updating timestamps
CREATE TRIGGER IF NOT EXISTS update_validation_rules_timestamp 
AFTER UPDATE ON validation_rules
BEGIN
    UPDATE validation_rules SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_validation_scopes_timestamp 
AFTER UPDATE ON validation_scopes
BEGIN
    UPDATE validation_scopes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Create trigger to update rule effectiveness based on applications
CREATE TRIGGER IF NOT EXISTS update_rule_effectiveness
AFTER INSERT ON rule_applications
BEGIN
    INSERT OR REPLACE INTO rule_effectiveness (
        rule_id, 
        time_period, 
        applications_count,
        true_positives,
        false_positives,
        fixes_applied
    )
    SELECT 
        NEW.rule_id,
        DATE(NEW.applied_at),
        COALESCE(re.applications_count, 0) + 1,
        COALESCE(re.true_positives, 0) + CASE WHEN NEW.success = 1 AND NEW.false_positive = 0 THEN 1 ELSE 0 END,
        COALESCE(re.false_positives, 0) + CASE WHEN NEW.false_positive = 1 THEN 1 ELSE 0 END,
        COALESCE(re.fixes_applied, 0) + CASE WHEN NEW.fix_applied = 1 THEN 1 ELSE 0 END
    FROM (SELECT * FROM rule_effectiveness WHERE rule_id = NEW.rule_id AND time_period = DATE(NEW.applied_at)) re;
    
    -- Update rule confidence based on effectiveness
    UPDATE validation_rules 
    SET effectiveness_score = (
        SELECT CASE 
            WHEN applications_count > 0 THEN 
                (CAST(true_positives AS REAL) / applications_count) * 0.8 + 
                (CAST(fixes_applied AS REAL) / applications_count) * 0.2
            ELSE 0.0 
        END
        FROM rule_effectiveness 
        WHERE rule_id = NEW.rule_id AND time_period = DATE(NEW.applied_at)
    )
    WHERE rule_id = NEW.rule_id;
END;

-- Create views for analysis
CREATE VIEW IF NOT EXISTS rule_performance AS
SELECT 
    r.rule_id,
    r.scope,
    r.category,
    r.priority,
    r.technology,
    r.confidence,
    r.effectiveness_score,
    r.occurrences,
    COUNT(ra.id) as total_applications,
    SUM(CASE WHEN ra.success = 1 THEN 1 ELSE 0 END) as successful_applications,
    SUM(CASE WHEN ra.false_positive = 1 THEN 1 ELSE 0 END) as false_positives,
    SUM(CASE WHEN ra.fix_applied = 1 THEN 1 ELSE 0 END) as fixes_applied,
    r.created_at,
    MAX(ra.applied_at) as last_applied
FROM validation_rules r
LEFT JOIN rule_applications ra ON r.rule_id = ra.rule_id
WHERE r.is_active = 1
GROUP BY r.rule_id
ORDER BY r.effectiveness_score DESC, total_applications DESC;

CREATE VIEW IF NOT EXISTS client_rule_summary AS
SELECT 
    ra.client_name,
    r.category,
    r.priority,
    COUNT(*) as rule_applications,
    SUM(CASE WHEN ra.success = 1 THEN 1 ELSE 0 END) as successful_detections,
    SUM(CASE WHEN ra.fix_applied = 1 THEN 1 ELSE 0 END) as fixes_applied,
    AVG(ra.execution_time_ms) as avg_execution_time
FROM rule_applications ra
JOIN validation_rules r ON ra.rule_id = r.rule_id
GROUP BY ra.client_name, r.category, r.priority
ORDER BY ra.client_name, rule_applications DESC;

-- Insert default rule categories
INSERT OR IGNORE INTO rule_categories (category_name, technology, description, default_priority) VALUES
('syntax', 'javascript', 'JavaScript syntax errors and parsing issues', 'error'),
('syntax', 'suitescript', 'SuiteScript-specific syntax patterns', 'error'),
('performance', 'netsuite', 'NetSuite governance and performance optimization', 'warning'),
('security', 'netsuite', 'NetSuite security best practices', 'warning'),
('style', 'javascript', 'Code style and consistency rules', 'suggestion'),
('netsuite-api', 'netsuite', 'NetSuite API usage patterns', 'warning'),
('documentation', 'general', 'Documentation and comment requirements', 'suggestion'),
('naming', 'general', 'Naming convention enforcement', 'suggestion'),
('error-handling', 'javascript', 'Error handling best practices', 'warning'),
('module-loading', 'suitescript', 'NetSuite module loading patterns', 'warning');

-- Insert default validation scopes
INSERT OR IGNORE INTO validation_scopes (scope_name, scope_type, parent_scope) VALUES
('global', 'organization', NULL),
('saralegui-solutions', 'organization', 'global'),
('escalon', 'client', 'saralegui-solutions'),
('esonus', 'client', 'saralegui-solutions');

-- Insert the initial rule we discovered (class property syntax error)
INSERT OR IGNORE INTO validation_rules (
    rule_id,
    scope,
    category,
    priority,
    technology,
    pattern_text,
    message,
    suggestion,
    auto_fix,
    auto_fix_pattern,
    learned_from,
    confidence,
    occurrences,
    created_by
) VALUES (
    'class-property-assignment-error',
    'global',
    'syntax',
    'error',
    'javascript',
    'this\.\w+\s*=\s*[''"][^''"]+[''"];',
    'Invalid property assignment in class body. JavaScript classes do not allow standalone property assignments.',
    'Use getter method syntax: getPropertyName = () => ''value''',
    1,
    's/this\.(\w+)\s*=\s*([''"])([^''"]+)\2;/get$1 = () => $2$3$2;/',
    'escalon-project',
    0.95,
    1,
    'learning-system'
);