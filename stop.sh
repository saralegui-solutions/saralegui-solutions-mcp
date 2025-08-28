#!/bin/bash

echo "Stopping Saralegui AI Assistant..."

# Kill node processes
pkill -f "node server.js" 2>/dev/null
pkill -f "node claudia/index.js" 2>/dev/null

echo "✅ Services stopped"
