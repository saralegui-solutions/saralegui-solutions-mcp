#!/bin/bash

##############################################################################
# Saralegui AI Assistant - Complete Setup Script
# One-command installation and configuration
##############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_NAME="Saralegui AI Assistant"

# Print colored output
print_header() {
    echo -e "\n${BLUE}════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════${NC}\n"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${CYAN}ℹ️  $1${NC}"
}

# Check if running in correct directory
check_directory() {
    if [ ! -f "$SCRIPT_DIR/package.json" ]; then
        print_error "Please run this script from the saralegui-solutions-mcp directory"
        exit 1
    fi
}

# Check Node.js version
check_node() {
    print_header "Checking Node.js"
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        print_info "Please install Node.js 18+ from https://nodejs.org"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js version 18+ required (found v$NODE_VERSION)"
        exit 1
    fi
    
    print_success "Node.js $(node -v) detected"
}

# Check and install system dependencies
install_system_deps() {
    print_header "Installing System Dependencies"
    
    # Detect OS
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
        DISTRO=$(lsb_release -si 2>/dev/null || echo "Unknown")
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    else
        OS="unknown"
    fi
    
    print_info "Detected OS: $OS"
    
    # Check for required tools
    MISSING_TOOLS=""
    
    # Check sox for audio recording
    if ! command -v sox &> /dev/null; then
        MISSING_TOOLS="$MISSING_TOOLS sox"
    else
        print_success "sox (audio recording) installed"
    fi
    
    # Check for audio player
    AUDIO_PLAYER=""
    for player in aplay paplay play ffplay mpg123; do
        if command -v $player &> /dev/null; then
            AUDIO_PLAYER=$player
            break
        fi
    done
    
    if [ -z "$AUDIO_PLAYER" ]; then
        MISSING_TOOLS="$MISSING_TOOLS audio-player"
    else
        print_success "Audio player ($AUDIO_PLAYER) installed"
    fi
    
    # Check sqlite3
    if ! command -v sqlite3 &> /dev/null; then
        MISSING_TOOLS="$MISSING_TOOLS sqlite3"
    else
        print_success "SQLite3 installed"
    fi
    
    # Install missing tools
    if [ ! -z "$MISSING_TOOLS" ]; then
        print_warning "Missing tools: $MISSING_TOOLS"
        
        if [ "$OS" == "linux" ]; then
            print_info "Installing with apt-get..."
            
            # Build install command
            INSTALL_CMD="sudo apt-get update && sudo apt-get install -y"
            
            if [[ $MISSING_TOOLS == *"sox"* ]]; then
                INSTALL_CMD="$INSTALL_CMD sox"
            fi
            
            if [[ $MISSING_TOOLS == *"audio-player"* ]]; then
                INSTALL_CMD="$INSTALL_CMD alsa-utils pulseaudio-utils"
            fi
            
            if [[ $MISSING_TOOLS == *"sqlite3"* ]]; then
                INSTALL_CMD="$INSTALL_CMD sqlite3"
            fi
            
            echo "Running: $INSTALL_CMD"
            eval $INSTALL_CMD || print_warning "Some packages failed to install"
            
        elif [ "$OS" == "macos" ]; then
            if ! command -v brew &> /dev/null; then
                print_error "Homebrew not found. Please install from https://brew.sh"
                exit 1
            fi
            
            print_info "Installing with Homebrew..."
            
            if [[ $MISSING_TOOLS == *"sox"* ]]; then
                brew install sox || true
            fi
            
            if [[ $MISSING_TOOLS == *"sqlite3"* ]]; then
                brew install sqlite3 || true
            fi
            
            if [[ $MISSING_TOOLS == *"audio-player"* ]]; then
                brew install ffmpeg || true
            fi
        fi
    fi
}

# Install Node.js dependencies
install_node_deps() {
    print_header "Installing Node.js Dependencies"
    
    cd "$SCRIPT_DIR"
    
    print_info "Running npm install..."
    npm install
    
    print_success "Node.js dependencies installed"
}

# Initialize database
init_database() {
    print_header "Initializing Database"
    
    cd "$SCRIPT_DIR"
    
    print_info "Creating SQLite database..."
    node database/init_sqlite.js
    
    print_success "Database initialized"
}

# Check API keys
check_api_keys() {
    print_header "Checking API Keys"
    
    if [ ! -f "$SCRIPT_DIR/.env.local" ]; then
        print_warning ".env.local not found"
        
        # Check if template exists
        if [ -f "$SCRIPT_DIR/.env.template" ]; then
            cp "$SCRIPT_DIR/.env.template" "$SCRIPT_DIR/.env.local"
            print_info "Created .env.local from template"
        fi
    fi
    
    # Source the env file
    if [ -f "$SCRIPT_DIR/.env.local" ]; then
        export $(cat "$SCRIPT_DIR/.env.local" | grep -v '^#' | xargs)
    fi
    
    # Check OpenAI key
    if [ -z "$OPENAI_API_KEY" ] || [[ "$OPENAI_API_KEY" == *"your-key-here"* ]]; then
        print_warning "OpenAI API key not configured"
        print_info "Edit .env.local and add your OPENAI_API_KEY"
        print_info "Get your key from: https://platform.openai.com/api-keys"
        OPENAI_CONFIGURED=false
    else
        print_success "OpenAI API key configured"
        OPENAI_CONFIGURED=true
    fi
    
    # Check ElevenLabs key
    if [ -z "$ELEVENLABS_API_KEY" ] || [[ "$ELEVENLABS_API_KEY" == *"your-"* ]]; then
        print_warning "ElevenLabs API key not configured (voice synthesis will use fallback)"
        ELEVENLABS_CONFIGURED=false
    else
        print_success "ElevenLabs API key configured"
        ELEVENLABS_CONFIGURED=true
    fi
}

# Test microphone
test_microphone() {
    print_header "Testing Microphone"
    
    if ! command -v sox &> /dev/null; then
        print_warning "Sox not installed, skipping microphone test"
        return
    fi
    
    print_info "Recording 3-second test..."
    sox -d /tmp/mic_test.wav trim 0 3 2>/dev/null || {
        print_warning "Microphone test failed"
        return
    }
    
    if [ -f /tmp/mic_test.wav ]; then
        FILE_SIZE=$(stat -f%z /tmp/mic_test.wav 2>/dev/null || stat -c%s /tmp/mic_test.wav 2>/dev/null || echo "0")
        
        if [ "$FILE_SIZE" -gt 1000 ]; then
            print_success "Microphone test successful"
            rm /tmp/mic_test.wav
        else
            print_warning "Microphone recording too small, check microphone"
        fi
    fi
}

# Create helper scripts
create_helpers() {
    print_header "Creating Helper Scripts"
    
    # Create start script
    cat > "$SCRIPT_DIR/start.sh" << 'EOF'
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
EOF
    chmod +x "$SCRIPT_DIR/start.sh"
    
    # Create stop script
    cat > "$SCRIPT_DIR/stop.sh" << 'EOF'
#!/bin/bash

echo "Stopping Saralegui AI Assistant..."

# Kill node processes
pkill -f "node server.js" 2>/dev/null
pkill -f "node claudia/index.js" 2>/dev/null

echo "✅ Services stopped"
EOF
    chmod +x "$SCRIPT_DIR/stop.sh"
    
    # Create test script
    cat > "$SCRIPT_DIR/test_all.sh" << 'EOF'
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
EOF
    chmod +x "$SCRIPT_DIR/test_all.sh"
    
    print_success "Helper scripts created"
}

# Final summary
show_summary() {
    print_header "Setup Complete!"
    
    echo -e "${GREEN}${PROJECT_NAME} has been successfully installed!${NC}"
    echo ""
    echo "📁 Installation directory: $SCRIPT_DIR"
    echo ""
    
    echo -e "${CYAN}Configuration Status:${NC}"
    
    if [ "$OPENAI_CONFIGURED" == "true" ]; then
        echo "  ✅ OpenAI Whisper: Configured"
    else
        echo "  ⚠️  OpenAI Whisper: Not configured"
    fi
    
    if [ "$ELEVENLABS_CONFIGURED" == "true" ]; then
        echo "  ✅ ElevenLabs Voice: Configured"
    else
        echo "  ℹ️  ElevenLabs Voice: Using fallback"
    fi
    
    echo "  ✅ SQLite Database: Ready"
    echo "  ✅ MCP Server: Installed"
    echo ""
    
    echo -e "${CYAN}Next Steps:${NC}"
    
    STEP_NUM=1
    
    if [ "$OPENAI_CONFIGURED" != "true" ]; then
        echo "  $STEP_NUM. Add your OpenAI API key to .env.local"
        echo "     Get it from: https://platform.openai.com/api-keys"
        STEP_NUM=$((STEP_NUM + 1))
    fi
    
    echo "  $STEP_NUM. Test your microphone:"
    echo "     ${GREEN}npm run test:mic${NC}"
    STEP_NUM=$((STEP_NUM + 1))
    
    echo "  $STEP_NUM. Configure NetSuite (optional):"
    echo "     ${GREEN}npm run setup:netsuite${NC}"
    STEP_NUM=$((STEP_NUM + 1))
    
    echo "  $STEP_NUM. Start the system:"
    echo "     ${GREEN}./start.sh${NC}"
    echo ""
    
    echo -e "${CYAN}Available Commands:${NC}"
    echo "  ./start.sh           - Start all services"
    echo "  ./stop.sh            - Stop all services"
    echo "  ./test_all.sh        - Run all tests"
    echo "  npm run test:mic     - Test microphone"
    echo "  npm run setup:netsuite - Configure NetSuite"
    echo "  npm run db:init      - Reinitialize database"
    echo ""
    
    echo -e "${YELLOW}Documentation:${NC}"
    echo "  • API Setup: See comments in .env.local"
    echo "  • Voice Commands: Say 'Hey Claudia' to activate"
    echo "  • MCP Integration: Ready for Claude Desktop"
    echo ""
    
    echo -e "${GREEN}🎉 Setup complete! Ready to use Saralegui AI Assistant${NC}"
}

# Main execution
main() {
    print_header "Saralegui AI Assistant Setup"
    
    check_directory
    check_node
    install_system_deps
    install_node_deps
    init_database
    check_api_keys
    test_microphone
    create_helpers
    show_summary
}

# Run main function
main "$@"