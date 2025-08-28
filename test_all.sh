#!/bin/bash

echo "Running all tests..."

# Test microphone
echo "1. Testing microphone..."
npm run test:mic

# Test database
echo "2. Testing database..."
node -e "import('./database/init_sqlite.js').then(m => console.log('Database OK'))"

# Test learning engine
echo "3. Testing learning engine..."
npm test

echo "✅ All tests complete"
