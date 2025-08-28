#!/bin/bash

# Test Runner Script for Learning Engine
# Provides a simple way to run and visualize test results

echo "════════════════════════════════════════════════════════"
echo "     SARALEGUI MCP - LEARNING ENGINE TEST RUNNER"
echo "════════════════════════════════════════════════════════"
echo ""

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Navigate to project directory
cd "$(dirname "$0")/.." || exit 1

echo "📁 Working directory: $(pwd)"
echo ""

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Create test database if it doesn't exist
if [ ! -d "database" ]; then
    mkdir -p database
fi

# Run the test with optional parameters
if [ "$1" == "--verbose" ]; then
    echo "🔍 Running tests in verbose mode..."
    NODE_ENV=test node test/test_learning_engine.js --verbose
elif [ "$1" == "--quick" ]; then
    echo "⚡ Running quick tests..."
    NODE_ENV=test node test/test_learning_engine.js --quick
elif [ "$1" == "--help" ]; then
    echo "Usage: ./test/run_tests.sh [options]"
    echo ""
    echo "Options:"
    echo "  --verbose    Show detailed output for each test"
    echo "  --quick      Run only essential tests"
    echo "  --help       Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./test/run_tests.sh           # Run all tests"
    echo "  ./test/run_tests.sh --verbose # Run with detailed output"
    echo "  ./test/run_tests.sh --quick   # Run quick test suite"
else
    echo "🧪 Running complete test suite..."
    echo ""
    NODE_ENV=test node test/test_learning_engine.js
fi

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Test run completed successfully!"
    echo ""
    echo "💡 Next steps:"
    echo "   1. Review the test output above"
    echo "   2. If all tests pass, the Learning Engine is ready"
    echo "   3. Run 'npm start' to start the MCP server"
else
    echo ""
    echo "❌ Some tests failed. Please review the output above."
    echo ""
    echo "💡 Troubleshooting:"
    echo "   1. Check if all files are properly created"
    echo "   2. Ensure Node.js 18+ is installed"
    echo "   3. Try running with --verbose for more details"
    exit 1
fi