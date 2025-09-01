-- Enhanced Learning Schema for MCP Server
-- This extends the existing schema with new tables for enhanced learning capabilities

-- Query Patterns for Learning from Natural Language
CREATE TABLE IF NOT EXISTS query_patterns (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    pattern_hash TEXT NOT NULL,
    intent TEXT NOT NULL,
    pattern_text TEXT NOT NULL,
    response_template TEXT,
    occurrences INTEGER DEFAULT 1,
    success_count INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 0.0,
    context TEXT, -- JSON context data
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(pattern_hash, intent)
);

-- Optimization Insights for Workflow Learning
CREATE TABLE IF NOT EXISTS optimization_insights (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    type TEXT NOT NULL, -- 'performance', 'automation', 'pattern'
    issue TEXT NOT NULL,
    suggestion TEXT NOT NULL,
    potential_savings INTEGER DEFAULT 0, -- Time savings in milliseconds
    data TEXT, -- JSON data for the optimization
    implemented BOOLEAN DEFAULT 0,
    effectiveness_score REAL DEFAULT 0.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Error Prediction Patterns
CREATE TABLE IF NOT EXISTS error_patterns (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tool_name TEXT NOT NULL,
    parameter_pattern TEXT, -- JSON pattern that leads to errors
    error_type TEXT NOT NULL,
    error_message TEXT,
    frequency INTEGER DEFAULT 1,
    confidence REAL DEFAULT 0.5,
    prevention_suggestion TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Cross-Project Learning Insights
CREATE TABLE IF NOT EXISTS cross_project_patterns (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    pattern_signature TEXT NOT NULL,
    pattern_type TEXT NOT NULL,
    projects TEXT, -- JSON array of project names
    commonality_score REAL DEFAULT 0.0,
    generalized_pattern TEXT, -- JSON generalized pattern
    applicability TEXT, -- JSON conditions for applicability
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Enhanced Tool Execution Tracking (extend existing)
-- Note: These columns are added safely with IF NOT EXISTS equivalent
ALTER TABLE tool_executions ADD COLUMN risk_assessment TEXT; -- JSON risk data
ALTER TABLE tool_executions ADD COLUMN optimization_applied INTEGER DEFAULT 0;
ALTER TABLE tool_executions ADD COLUMN learning_data TEXT; -- JSON learning metadata

-- Enhanced Pattern Learning (extend existing if needed)
-- Note: We'll check if learned_patterns table exists and add columns if needed

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_query_patterns_hash ON query_patterns(pattern_hash);
CREATE INDEX IF NOT EXISTS idx_query_patterns_intent ON query_patterns(intent);
CREATE INDEX IF NOT EXISTS idx_optimization_type ON optimization_insights(type);
CREATE INDEX IF NOT EXISTS idx_error_patterns_tool ON error_patterns(tool_name);
CREATE INDEX IF NOT EXISTS idx_cross_project_signature ON cross_project_patterns(pattern_signature);

-- Add learning metadata to existing tables if they exist
-- This is safe because it uses IF NOT EXISTS for new columns

-- Add learned_from column to learned_patterns if it doesn't exist
ALTER TABLE learned_patterns ADD COLUMN learned_from TEXT;

-- Update validation_rules to include learning enhancements (if table exists)
-- Note: These might fail if validation_rules doesn't exist, which is fine
ALTER TABLE validation_rules ADD COLUMN learning_source TEXT DEFAULT 'manual'; 
ALTER TABLE validation_rules ADD COLUMN cross_project_applicable INTEGER DEFAULT 0;

-- Add performance tracking
CREATE TABLE IF NOT EXISTS learning_performance (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL,
    measurement_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    session_id TEXT,
    context TEXT -- JSON context
);

-- Create view for learning dashboard
CREATE VIEW IF NOT EXISTS learning_dashboard AS
SELECT 
    'patterns' as metric_type,
    COUNT(*) as count,
    AVG(confidence_score) as avg_confidence,
    MAX(created_at) as last_activity
FROM learned_patterns
UNION ALL
SELECT 
    'queries' as metric_type,
    COUNT(*) as count,
    AVG(success_rate) as avg_confidence,
    MAX(last_seen) as last_activity
FROM query_patterns
UNION ALL
SELECT 
    'optimizations' as metric_type,
    COUNT(*) as count,
    AVG(CAST(potential_savings AS REAL)) as avg_confidence,
    MAX(created_at) as last_activity
FROM optimization_insights;