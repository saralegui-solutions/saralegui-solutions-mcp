#!/bin/bash

echo "Starting Saralegui AI Assistant..."

# Start MCP server
echo "Starting MCP server..."
node server.js &
SERVER_PID=$!

# Wait for server to initialize
sleep 2

# Start Claudia voice assistant (if configured)
if [ -f claudia/index.js ]; then
    echo "Starting Claudia voice assistant..."
    node claudia/index.js &
    CLAUDIA_PID=$!
fi

echo ""
echo "✅ System running"
echo "Server PID: $SERVER_PID"
[ ! -z "$CLAUDIA_PID" ] && echo "Claudia PID: $CLAUDIA_PID"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for interrupt
trap "kill $SERVER_PID $CLAUDIA_PID 2>/dev/null; exit" INT
wait
