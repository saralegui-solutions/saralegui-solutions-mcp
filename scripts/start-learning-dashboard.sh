#!/bin/bash

# Start Learning Dashboard
# Simple script to launch the learning visualization dashboard

cd "$(dirname "$0")/.."

echo "🧠 Starting MCP Learning Dashboard..."
echo "📊 Dashboard will be available at: http://localhost:3001"
echo "🔄 Press Ctrl+C to stop"
echo ""

# Check if database exists
if [ ! -f "database/saralegui_assistant.db" ]; then
    echo "⚠️  Database not found. Initializing..."
    npm run db:init
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start the dashboard API
node dashboard/learning-api.js