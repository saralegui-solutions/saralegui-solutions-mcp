#!/usr/bin/env node

/**
 * Simple API server for Learning Dashboard
 * Serves data from the existing MCP learning database
 */

import express from 'express';
import { DatabaseManager } from '../lib/database_manager.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class LearningAPI {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3001;
        this.db = new DatabaseManager({ 
            dbPath: path.join(__dirname, '../database/saralegui_assistant.db') 
        });
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        // Enable CORS for local development
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Content-Type');
            next();
        });
        
        this.app.use(express.json());
        this.app.use(express.static(__dirname));
    }

    setupRoutes() {
        // Serve the dashboard HTML
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'learning-dashboard.html'));
        });

        // API endpoint for learning data
        this.app.get('/api/learning-data', async (req, res) => {
            try {
                const data = await this.getLearningData();
                res.json(data);
            } catch (error) {
                console.error('Error fetching learning data:', error);
                res.status(500).json({ error: 'Failed to fetch learning data' });
            }
        });

        // API endpoint for query patterns
        this.app.get('/api/query-patterns', async (req, res) => {
            try {
                const patterns = await this.getQueryPatterns();
                res.json(patterns);
            } catch (error) {
                console.error('Error fetching query patterns:', error);
                res.status(500).json({ error: 'Failed to fetch query patterns' });
            }
        });

        // API endpoint for optimization insights
        this.app.get('/api/optimizations', async (req, res) => {
            try {
                const optimizations = await this.getOptimizations();
                res.json(optimizations);
            } catch (error) {
                console.error('Error fetching optimizations:', error);
                res.status(500).json({ error: 'Failed to fetch optimizations' });
            }
        });

        // API endpoint for learned patterns
        this.app.get('/api/learned-patterns', async (req, res) => {
            try {
                const patterns = await this.getLearnedPatterns();
                res.json(patterns);
            } catch (error) {
                console.error('Error fetching learned patterns:', error);
                res.status(500).json({ error: 'Failed to fetch learned patterns' });
            }
        });

        // Health check endpoint
        this.app.get('/api/health', (req, res) => {
            res.json({ status: 'healthy', timestamp: new Date().toISOString() });
        });
    }

    async getLearningData() {
        const [queryPatterns, optimizations, learnedPatterns] = await Promise.all([
            this.getQueryPatterns(),
            this.getOptimizations(), 
            this.getLearnedPatterns()
        ]);

        // Calculate metrics
        const totalSavings = optimizations.reduce((sum, opt) => sum + (opt.potential_savings || 0), 0);
        const avgSuccessRate = queryPatterns.length > 0 
            ? queryPatterns.reduce((sum, p) => sum + p.success_rate, 0) / queryPatterns.length 
            : 0;
        const avgConfidence = learnedPatterns.length > 0
            ? learnedPatterns.reduce((sum, p) => sum + (p.confidence_score || 0), 0) / learnedPatterns.length
            : avgSuccessRate; // Fallback to query success rate

        return {
            queryPatterns,
            optimizations,
            learnedPatterns,
            metrics: {
                totalSavings,
                avgConfidence: Math.round(avgConfidence * 100),
                totalPatterns: queryPatterns.length + learnedPatterns.length,
                lastUpdate: new Date().toISOString()
            }
        };
    }

    async getQueryPatterns() {
        try {
            return await this.db.all(`
                SELECT pattern_text, intent, occurrences, success_rate, last_seen
                FROM query_patterns 
                ORDER BY last_seen DESC, occurrences DESC
            `);
        } catch (error) {
            console.warn('Query patterns table may not exist yet:', error.message);
            return [];
        }
    }

    async getOptimizations() {
        try {
            return await this.db.all(`
                SELECT type, issue, suggestion, potential_savings, created_at
                FROM optimization_insights 
                ORDER BY created_at DESC
            `);
        } catch (error) {
            console.warn('Optimization insights table may not exist yet:', error.message);
            return [];
        }
    }

    async getLearnedPatterns() {
        try {
            return await this.db.all(`
                SELECT pattern_signature, pattern_type, occurrences, confidence_score, created_at, learned_from
                FROM learned_patterns 
                ORDER BY created_at DESC
                LIMIT 20
            `);
        } catch (error) {
            console.warn('Learned patterns table may not exist yet:', error.message);
            return [];
        }
    }

    async start() {
        try {
            await this.db.initialize();
            
            this.app.listen(this.port, () => {
                console.log(`🧠 Learning Dashboard API running on http://localhost:${this.port}`);
                console.log(`📊 Dashboard available at: http://localhost:${this.port}`);
                console.log(`🔗 API endpoints:`);
                console.log(`   GET /api/learning-data - Complete learning data`);
                console.log(`   GET /api/query-patterns - Query learning patterns`);
                console.log(`   GET /api/optimizations - Workflow optimizations`);
                console.log(`   GET /api/learned-patterns - Behavioral patterns`);
                console.log(`   GET /api/health - Health check`);
            }).on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.log(`🔄 Dashboard already running on port ${this.port}`);
                    console.log(`📊 Access at: http://localhost:${this.port}`);
                    console.log(`💡 Use 'pkill -f learning-api' to stop the existing instance`);
                    process.exit(0);
                } else {
                    console.error('Failed to start Learning API:', err);
                    process.exit(1);
                }
            });
        } catch (error) {
            console.error('Failed to start Learning API:', error);
            process.exit(1);
        }
    }

    async checkIfRunning() {
        try {
            const response = await fetch(`http://localhost:${this.port}/api/health`);
            if (response.ok) {
                return true;
            }
        } catch (error) {
            // Service not running
        }
        return false;
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down Learning Dashboard API...');
    process.exit(0);
});

// Create and start API if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const api = new LearningAPI();
    api.start().catch(error => {
        console.error('Failed to start API:', error);
        process.exit(1);
    });
}

export { LearningAPI };