#!/bin/bash

# NetSuite MCP Server Startup Script
# Provides reliable startup with proper error handling and logging

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_FILE="$SCRIPT_DIR/mcp-netsuite-server.js"
DB_FILE="$SCRIPT_DIR/database/saralegui_assistant.db"
LOG_FILE="$SCRIPT_DIR/logs/netsuite-mcp.log"
PID_FILE="/tmp/netsuite-mcp.pid"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ️  [$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}" >&2
}

log_success() {
    echo -e "${GREEN}✅ [$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}" >&2
}

log_warning() {
    echo -e "${YELLOW}⚠️  [$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}" >&2
}

log_error() {
    echo -e "${RED}❌ [$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}" >&2
}

# Create logs directory if it doesn't exist
mkdir -p "$SCRIPT_DIR/logs"

# Function to check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Node.js version
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        log_error "Node.js version 18+ required, found: $(node --version)"
        exit 1
    fi
    
    # Check if server file exists
    if [ ! -f "$SERVER_FILE" ]; then
        log_error "NetSuite MCP server file not found: $SERVER_FILE"
        exit 1
    fi
    
    # Check database exists
    if [ ! -f "$DB_FILE" ]; then
        log_warning "Database file not found, will be created: $DB_FILE"
    fi
    
    log_success "Prerequisites check passed"
}

# Function to check if server is already running
check_existing_server() {
    if [ -f "$PID_FILE" ]; then
        local existing_pid=$(cat "$PID_FILE")
        if ps -p "$existing_pid" > /dev/null 2>&1; then
            log_error "NetSuite MCP server already running (PID: $existing_pid)"
            exit 1
        else
            log_warning "Removing stale PID file"
            rm -f "$PID_FILE"
        fi
    fi
}

# Function to setup environment
setup_environment() {
    log_info "Setting up environment..."
    
    # Set environment variables
    export NODE_ENV="${NODE_ENV:-production}"
    export MCP_MODE="netsuite"
    export DB_PATH="$DB_FILE"
    
    # Ensure proper permissions
    chmod +x "$SERVER_FILE"
    
    log_success "Environment configured"
}

# Function to start the server
start_server() {
    log_info "Starting NetSuite MCP Server..."
    
    # Create PID file
    echo $$ > "$PID_FILE"
    
    # Start server with proper error handling
    if [ "$1" = "--debug" ]; then
        log_info "Starting in debug mode..."
        node "$SERVER_FILE" 2>&1 | tee -a "$LOG_FILE"
    else
        # Normal mode - forward stdio for MCP protocol
        node "$SERVER_FILE" 2>> "$LOG_FILE"
    fi
}

# Cleanup function
cleanup() {
    log_info "Cleaning up..."
    if [ -f "$PID_FILE" ]; then
        rm -f "$PID_FILE"
    fi
}

# Set trap for cleanup on exit
trap cleanup EXIT

# Health check function
health_check() {
    log_info "Running health check..."
    
    # Test basic functionality
    echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | timeout 5 node "$SERVER_FILE" > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        log_success "Health check passed"
        return 0
    else
        log_error "Health check failed"
        return 1
    fi
}

# Main execution
main() {
    log_info "🚀 NetSuite MCP Server Startup Script"
    log_info "======================================"
    
    # Handle command line arguments
    case "$1" in
        "health")
            check_prerequisites
            setup_environment
            health_check
            exit $?
            ;;
        "stop")
            if [ -f "$PID_FILE" ]; then
                local pid=$(cat "$PID_FILE")
                if ps -p "$pid" > /dev/null 2>&1; then
                    log_info "Stopping server (PID: $pid)"
                    kill "$pid"
                    rm -f "$PID_FILE"
                    log_success "Server stopped"
                else
                    log_warning "Server not running"
                    rm -f "$PID_FILE"
                fi
            else
                log_warning "No PID file found, server may not be running"
            fi
            exit 0
            ;;
        "restart")
            $0 stop
            sleep 2
            $0 start
            exit $?
            ;;
        "status")
            if [ -f "$PID_FILE" ]; then
                local pid=$(cat "$PID_FILE")
                if ps -p "$pid" > /dev/null 2>&1; then
                    log_success "Server is running (PID: $pid)"
                    exit 0
                else
                    log_warning "PID file exists but server not running"
                    exit 1
                fi
            else
                log_info "Server is not running"
                exit 1
            fi
            ;;
        "debug")
            log_info "Starting in debug mode..."
            check_prerequisites
            check_existing_server
            setup_environment
            start_server --debug
            ;;
        "")
            # Default: normal startup
            check_prerequisites
            check_existing_server
            setup_environment
            start_server
            ;;
        *)
            echo "Usage: $0 [start|stop|restart|status|health|debug]"
            echo ""
            echo "Commands:"
            echo "  start   - Start the NetSuite MCP server (default)"
            echo "  stop    - Stop the running server"
            echo "  restart - Restart the server"
            echo "  status  - Check if server is running"
            echo "  health  - Run health check"
            echo "  debug   - Start in debug mode with verbose logging"
            exit 1
            ;;
    esac
}

# Execute main function with all arguments
main "$@"