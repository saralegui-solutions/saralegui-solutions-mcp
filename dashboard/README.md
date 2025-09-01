# 🧠 Learning Dashboard

A real-time web dashboard for visualizing MCP Learning System patterns and insights.

## 📊 Features

- **Real-time Learning Metrics** - Live statistics on patterns, optimizations, and confidence scores
- **Query Pattern Visualization** - Shows learned natural language patterns with intent classification
- **Workflow Optimization Insights** - Performance bottlenecks and automation opportunities
- **Learning Activity Monitor** - Current learning modes and system status
- **Existing Data Focus** - Uses only real database data, minimal test samples

## 🚀 Quick Start

### Option 1: Using npm scripts
```bash
# Start the dashboard (recommended)
npm run dashboard

# Or use the startup script
npm run dashboard:start
```

### Option 2: Direct execution
```bash
# Start the API server directly
node dashboard/learning-api.js

# Or use the shell script
./scripts/start-learning-dashboard.sh
```

### Option 3: Manual startup
```bash
cd dashboard
node learning-api.js
```

## 🌐 Access

Once started, the dashboard will be available at:
- **Dashboard**: http://localhost:3001
- **API Health**: http://localhost:3001/api/health
- **Learning Data**: http://localhost:3001/api/learning-data

## 📊 Current Data Visualization

The dashboard displays:

### Query Patterns (7 learned)
- **Creation Intent**: "create a new validation rule for javascript" (2 occurrences)
- **Retrieval Intent**: "list all current patterns" (2 occurrences) 
- **Help Intent**: "help me understand the system" (1 occurrence)
- High success rates (100% on most patterns)

### Optimization Insights (2 opportunities)
- **Performance**: Slow operations detected with 4.2s potential savings
- **Automation**: Repetitive sequence detection for workflow optimization

### Learning Patterns (1 test pattern)
- **Sequence Pattern**: Test pattern for visualization validation
- **Confidence**: 70% confidence score

## 🔧 API Endpoints

- `GET /api/learning-data` - Complete learning data with metrics
- `GET /api/query-patterns` - Natural language query patterns
- `GET /api/optimizations` - Workflow optimization opportunities
- `GET /api/learned-patterns` - Behavioral pattern detection
- `GET /api/health` - System health check

## 📈 Real-time Features

- **Auto-refresh**: Updates every 30 seconds
- **Live Metrics**: Real-time pattern counts and confidence scores
- **Status Indicators**: Visual learning mode status
- **Fallback Data**: Graceful handling of API failures

## 🎯 Learning Modes Status

All learning modes are currently active:
- ✅ Pattern Learning
- ✅ Query Learning  
- ✅ Workflow Optimization
- ✅ Error Prediction
- ✅ Cross-Project Learning

## 🔍 Data Sources

The dashboard connects to:
- **Database**: `database/saralegui_assistant.db`
- **Tables**: `query_patterns`, `optimization_insights`, `learned_patterns`
- **Real-time**: Live database queries with caching
- **Test Data**: Minimal single pattern for visualization testing

## 🛠️ Dependencies

- **Express.js** - Web server and API
- **SQLite3** - Database connectivity  
- **Native JavaScript** - Frontend (no external libraries)
- **CSS Grid** - Responsive layout

## 🎨 Design

- **Modern UI** - Gradient backgrounds, cards, and animations
- **Responsive** - Works on desktop and mobile
- **Real-time** - Live updates and status indicators
- **Accessible** - Clear typography and color contrast

The dashboard provides a clean, professional view of your MCP learning system's activity using only the patterns and insights that have been naturally learned from actual usage.