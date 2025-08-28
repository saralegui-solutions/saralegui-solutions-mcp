-- Saralegui AI Assistant Database Schema for SQLite
-- Learning system for pattern detection and tool generation

-- Enable foreign key support
PRAGMA foreign_keys = ON;

-- Tool execution tracking
CREATE TABLE IF NOT EXISTS tool_executions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tool_name TEXT NOT NULL,
    tool_version TEXT DEFAULT '1.0.0',
    parameters TEXT NOT NULL DEFAULT '{}', -- JSON string
    context TEXT NOT NULL DEFAULT '{}', -- JSON string
    result TEXT, -- JSON string
    success INTEGER DEFAULT 0, -- Boolean: 0 or 1
    error_message TEXT,
    execution_time_ms INTEGER,
    user_session_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Pattern detection and learning
CREATE TABLE IF NOT EXISTS learned_patterns (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    pattern_signature TEXT UNIQUE NOT NULL,
    pattern_type TEXT, -- 'sequence', 'error_recovery', 'optimization'
    pattern_data TEXT, -- JSON string containing full pattern details
    occurrences INTEGER DEFAULT 1,
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    tool_suggestion TEXT, -- JSON string
    auto_created INTEGER DEFAULT 0, -- Boolean
    tool_id TEXT,
    confidence_score REAL DEFAULT 0.0,
    metadata TEXT DEFAULT '{}', -- JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tool_id) REFERENCES generated_tools(id)
);

-- Generated tools registry
CREATE TABLE IF NOT EXISTS generated_tools (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tool_name TEXT UNIQUE NOT NULL,
    tool_category TEXT,
    source_pattern_id TEXT,
    code_content TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}', -- JSON string
    usage_count INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 0.0,
    average_execution_time_ms INTEGER,
    is_active INTEGER DEFAULT 1, -- Boolean
    version INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_pattern_id) REFERENCES learned_patterns(id)
);

-- Knowledge base entries
CREATE TABLE IF NOT EXISTS knowledge_entries (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    entry_type TEXT, -- 'solution', 'error', 'optimization', 'documentation'
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT, -- JSON array as string
    related_tools TEXT, -- JSON array of tool IDs
    usage_count INTEGER DEFAULT 0,
    helpful_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Session management for context
CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    session_id TEXT UNIQUE NOT NULL,
    context TEXT DEFAULT '{}', -- JSON string
    active_project TEXT,
    preferences TEXT DEFAULT '{}', -- JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Secure credential storage (encrypted)
CREATE TABLE IF NOT EXISTS secure_credentials (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    account_id TEXT UNIQUE NOT NULL,
    encrypted_data TEXT NOT NULL, -- Encrypted JSON with credentials
    encryption_method TEXT DEFAULT 'AES-256-GCM',
    key_derivation TEXT DEFAULT 'PBKDF2',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_accessed DATETIME
);

-- Workflow patterns for complex operations
CREATE TABLE IF NOT EXISTS workflow_patterns (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    workflow_name TEXT UNIQUE NOT NULL,
    workflow_type TEXT, -- 'manual', 'learned', 'imported'
    steps TEXT NOT NULL, -- JSON array of steps
    parameters TEXT, -- JSON object of required parameters
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    average_duration_ms INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Voice command history (for improving recognition)
CREATE TABLE IF NOT EXISTS voice_commands (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    raw_audio_text TEXT, -- Transcribed text from Whisper
    interpreted_command TEXT, -- What we understood
    actual_command TEXT, -- What the user meant (for corrections)
    confidence_score REAL,
    execution_result TEXT, -- JSON string
    user_feedback TEXT, -- 'correct', 'incorrect', null
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tool_executions_tool_name ON tool_executions(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_executions_created_at ON tool_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_executions_session ON tool_executions(user_session_id);
CREATE INDEX IF NOT EXISTS idx_patterns_signature ON learned_patterns(pattern_signature);
CREATE INDEX IF NOT EXISTS idx_patterns_occurrences ON learned_patterns(occurrences DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON learned_patterns(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_type ON knowledge_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_created ON knowledge_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_tools_active ON generated_tools(is_active, tool_name);
CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON user_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_voice_commands_created ON voice_commands(created_at DESC);

-- Create triggers for updating timestamps
CREATE TRIGGER IF NOT EXISTS update_tool_executions_timestamp 
AFTER UPDATE ON tool_executions
BEGIN
    UPDATE tool_executions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_generated_tools_timestamp 
AFTER UPDATE ON generated_tools
BEGIN
    UPDATE generated_tools SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_knowledge_entries_timestamp 
AFTER UPDATE ON knowledge_entries
BEGIN
    UPDATE knowledge_entries SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_credentials_timestamp 
AFTER UPDATE ON secure_credentials
BEGIN
    UPDATE secure_credentials SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Initial seed data for knowledge base
INSERT OR IGNORE INTO knowledge_entries (entry_type, title, content, tags) VALUES
('documentation', 'System Overview', 'Saralegui MCP Server with learning capabilities for pattern detection and automatic tool generation.', '["system", "overview", "mcp"]'),
('documentation', 'Pattern Detection', 'The system detects patterns after 2 occurrences and suggests tool creation after 3 occurrences with 60% confidence.', '["patterns", "learning", "automation"]'),
('documentation', 'Voice Commands', 'Voice commands are processed using OpenAI Whisper for transcription and can trigger any registered tool.', '["voice", "whisper", "commands"]');

-- Create view for pattern analysis
CREATE VIEW IF NOT EXISTS pattern_analysis AS
SELECT 
    p.pattern_signature,
    p.pattern_type,
    p.occurrences,
    p.confidence_score,
    g.tool_name as generated_tool,
    g.usage_count as tool_usage,
    g.success_rate as tool_success_rate
FROM learned_patterns p
LEFT JOIN generated_tools g ON p.tool_id = g.id
ORDER BY p.occurrences DESC, p.confidence_score DESC;

-- Create view for execution analytics
CREATE VIEW IF NOT EXISTS execution_analytics AS
SELECT 
    tool_name,
    COUNT(*) as total_executions,
    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_executions,
    AVG(execution_time_ms) as avg_execution_time,
    MAX(created_at) as last_executed
FROM tool_executions
GROUP BY tool_name
ORDER BY total_executions DESC;