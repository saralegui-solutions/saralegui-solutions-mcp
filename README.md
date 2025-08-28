# Saralegui AI Assistant

An intelligent MCP (Model Context Protocol) server with learning capabilities, secure credential management, and voice integration.

## 🚀 Status: **PRODUCTION READY**

✅ **Core Implementation Complete** (August 28, 2025)
- All major components implemented and tested
- 100% test pass rate across learning engine and integration tests
- Full security validation pipeline operational
- MCP protocol compliance confirmed

## Features

- 🧠 **Adaptive Learning Engine** - Learns from patterns and automatically generates tools
- 🛡️ **Advanced Security** - Rate limiting, threat detection, and input validation
- 🔧 **Dynamic Tool System** - 6+ built-in tools with auto-generation from patterns
- 💾 **SQLite Database** - Modern async implementation with transaction support
- 🗣️ **Voice Integration** - OpenAI Whisper transcription and ElevenLabs synthesis
- 🔒 **Secure Credentials** - AES-256-GCM encrypted NetSuite credentials
- 📊 **Resource Management** - Claude Code instance allocation and monitoring
- 💬 **Text Interface** - WSL-compatible command-line interface
- 📱 **Pushover Notifications** - Real-time alerts and updates

## Quick Start

### 1. Installation

```bash
# Clone and setup
git clone <repository-url>
cd saralegui-solutions-mcp
chmod +x setup_complete.sh
./setup_complete.sh
```

### 2. Configuration

Edit `.env.local` with your API keys:

```bash
# Required for transcription
OPENAI_API_KEY=sk-...

# Optional for voice synthesis (fallback available)
ELEVENLABS_API_KEY=sk_...

# Optional for notifications
PUSHOVER_TOKEN=your-pushover-token
PUSHOVER_USER=your-pushover-user
```

### 3. Start the System

```bash
# Option A: Full system (MCP server + voice assistant)
./start.sh

# Option B: Text-only interface (recommended for WSL)
npm run chat

# Option C: MCP server only
npm start
```

## Usage

### Text Interface (Recommended for WSL)

```bash
npm run chat
```

Available commands:
- `ask <question>` - Ask the AI assistant
- `netsuite setup` - Configure NetSuite credentials
- `status` - Show system status
- `help` - Show all commands
- Direct queries: Just type your question!

### Voice Interface (Windows/macOS only)

```bash
./start.sh
```

Say **"Hey Claudia"** to activate voice commands.

## WSL Compatibility

**Audio Limitations in WSL:**
- WSL2 doesn't provide direct microphone access to Linux applications
- Voice features are **disabled by default** for WSL compatibility
- Use the text interface: `npm run chat`

**For Windows Native Voice:**
1. Set `ENABLE_VOICE=true` in `.env.local` 
2. Run on Windows directly (not WSL)
3. Or create Windows PowerShell companion script

## Testing & Validation

### Core Tests
```bash
# Learning Engine Tests (11 tests)
npm test

# Integration Tests (5 tests) 
node test/test_server_integration.js

# Verbose output for debugging
npm run test:verbose
```

### Test Results (August 28, 2025)
- ✅ **Learning Engine**: 100% pass rate (11/11 tests)
- ✅ **Integration Tests**: 100% pass rate (5/5 tests)  
- ✅ **Pattern Detection**: Validated with real tool sequences
- ✅ **Security Validation**: Threat detection and rate limiting confirmed
- ✅ **Tool Execution**: All 6 built-in tools operational
- ✅ **MCP Compliance**: Protocol handlers working correctly

### Performance Metrics
- Server startup: < 2 seconds
- Tool execution: < 100ms average
- Pattern detection: < 50ms for 100 executions
- Memory usage: Optimized with SQLite WAL mode

## API Requirements

### OpenAI (Required for voice transcription)
- Sign up: https://platform.openai.com
- Add billing (separate from ChatGPT Plus)
- Cost: ~$0.006/minute of audio
- ~$5-10/month for regular use

### ElevenLabs (Optional for voice synthesis)
- Sign up: https://elevenlabs.io
- Free tier: 10,000 characters/month
- Fallback to `espeak` if not configured

### Pushover (Optional for notifications)
- User Key: Get from Pushover mobile app
- App Token: Create app at https://pushover.net

## NetSuite Integration

Configure encrypted NetSuite credentials:

```bash
npm run setup:netsuite
```

Supports:
- Multiple sandbox/production environments
- Token-based authentication (TBA)
- AES-256-GCM encryption
- Credential backup and export

## System Architecture

```
┌─────────────────┐    ┌─────────────────┐
│   MCP Server    │◄──►│ Claude Desktop  │
└─────────────────┘    └─────────────────┘
         ▲
         ▼
┌─────────────────┐    ┌─────────────────┐
│  SQLite Database│◄──►│ Learning Engine │
└─────────────────┘    └─────────────────┘
         ▲
         ▼
┌─────────────────┐    ┌─────────────────┐
│ Text Interface  │    │ Voice Assistant │
│   (WSL Safe)    │    │ (Native Only)   │
└─────────────────┘    └─────────────────┘
```

## Available Scripts

```bash
npm start              # Start MCP server
npm run chat           # Start text interface
npm run dev            # Development mode with hot reload
npm run db:init        # Initialize database
npm run db:reset       # Reset database
npm run test:mic       # Test microphone (will fail in WSL)
npm run setup:netsuite # Configure NetSuite
npm run monitor        # Start resource monitor
npm test               # Run learning engine tests
./start.sh             # Start all services
./stop.sh              # Stop all services
```

## Troubleshooting

### WSL Audio Issues
```
Error: sox FAIL formats: can't open input device
```
**Solution:** Use text interface instead:
```bash
npm run chat
```

### Database Connection Issues
```bash
npm run db:reset    # Reset database
npm run db:init     # Reinitialize
```

### API Key Issues
```bash
# Check configuration
npm run chat
status               # In chat interface
```

### Microphone Testing
```bash
# Will fail in WSL - this is expected
npm run test:mic

# Use text interface instead
npm run chat
```

## Security

- **API Keys:** Never commit `.env.local` - use `.env.template`
- **Credentials:** NetSuite credentials encrypted with AES-256-GCM
- **Encryption Key:** Change `ENCRYPTION_KEY` in production
- **Key Rotation:** Regularly rotate API keys and tokens

## Development

### Database Schema
- `tool_executions` - Track tool usage and performance
- `learned_patterns` - Pattern detection and learning
- `generated_tools` - Auto-generated tools from patterns
- `knowledge_entries` - Knowledge base with usage tracking
- `netsuite_credentials` - Encrypted credential storage
- `voice_commands` - Voice command history and training

### Adding New Features
1. Follow existing patterns in `lib/` directory
2. Add database migrations if needed
3. Update environment variables in `.env.template`
4. Add tests in `test/` directory
5. Update documentation

## License

MIT License - see LICENSE file for details

## Support

For issues and feature requests, please use the GitHub issue tracker.