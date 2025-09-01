#!/usr/bin/env node

/**
 * Smart Dashboard Startup Script
 * Checks if dashboard is already running before starting
 */

import { LearningAPI } from './learning-api.js';
import fetch from 'node-fetch';

async function checkIfRunning(port = 3001) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout
        
        const response = await fetch(`http://localhost:${port}/api/health`, {
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
            const data = await response.json();
            return data.status === 'healthy';
        }
    } catch (error) {
        // Service not running or timeout
    }
    return false;
}

async function main() {
    const port = process.env.PORT || 3001;
    
    console.log('🧠 Learning Dashboard Startup');
    console.log('============================');
    
    // Check if already running
    const isRunning = await checkIfRunning(port);
    
    if (isRunning) {
        console.log(`✅ Dashboard is already running!`);
        console.log(`📊 Access at: http://localhost:${port}`);
        console.log(`🔍 API Health: http://localhost:${port}/api/health`);
        console.log(`💡 To restart: pkill -f learning-api && npm run dashboard`);
        process.exit(0);
    }
    
    console.log(`🚀 Starting new dashboard instance on port ${port}...`);
    
    // Start new instance
    const api = new LearningAPI();
    await api.start();
}

main().catch(error => {
    console.error('❌ Startup failed:', error.message);
    process.exit(1);
});