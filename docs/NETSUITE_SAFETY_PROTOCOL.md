# NetSuite Development Safety Protocol

## 🚨 CRITICAL: Prevent Production Instability

This protocol ensures that automated fixes and validations do not break stable, dormant production code.

## Core Safety Principle

**NEVER modify files in projects that are not currently under active development**

Even if files belong to the same client or organization, dormant project directories must remain untouched to prevent breaking stable production systems.

## Safety Rules Implementation

### 1. RAP Execution Pattern (wrapExecution)

**Rule:** All NetSuite API calls must use `this.wrapExecution()` for error handling

**Pattern Detection:**
```javascript
// Detects:
search.create(), record.load(), file.create(), email.send(), etc.

// Requires:
this.wrapExecution('methodName', () => {
    return netsuiteApiCall();
}, { params });
```

**Safety Guards:**
- ❌ **Auto-fix disabled** - Requires manual confirmation
- ✅ **Active development check** - Only applies to recently edited files
- ✅ **Git changes required** - Only fixes files with uncommitted changes
- ✅ **30-day threshold** - Skip files unchanged for 30+ days
- ⚠️ **Warning prompt** - Always warns about dormant code risks

### 2. @NModuleScope Declaration

**Rule:** All SuiteScript files require @NModuleScope declaration

**Pattern:**
```javascript
/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope Public  // <- Required
 */
```

**Safety Guards:**
- ✅ **Auto-fix enabled** - Safe header-only change
- ✅ **Header-only validation** - Only modifies script headers

### 3. ErrorHandler Inheritance

**Rule:** Classes performing NetSuite operations should extend ErrorHandler

**Pattern:**
```javascript
// Recommended:
class MyClass extends ErrorHandler {
    constructor() { super(); }
}
```

**Safety Guards:**
- ❌ **Auto-fix disabled** - Structural change requires review
- ✅ **Active development check** - Only suggests for active files

## Project Activity Detection

### Active Project Indicators:
- Files modified within last 30 days
- Uncommitted git changes present
- Directory shows recent development activity

### Dormant Project Indicators:
- No file modifications > 30 days
- All changes committed
- No current development branches

## Implementation in MCP

### Database Rules:
```sql
-- All rules include safety_checks JSON:
{
  "require_active_development": true,
  "check_last_modified": true,
  "require_git_changes": true,
  "prompt_before_fix": true,
  "min_days_since_edit": 30
}
```

### Validation Workflow:
1. **Detect Pattern** - Identify rule violation
2. **Check Activity** - Verify project is active
3. **Validate Safety** - Ensure no dormant code risk
4. **Prompt User** - Require explicit confirmation
5. **Apply Fix** - Only after all checks pass

## Emergency Protocols

### If Dormant Code is Accidentally Modified:
1. **Immediate Rollback** - `git checkout HEAD -- <file>`
2. **Verify Production** - Check if deployment affected
3. **Update Safety Rules** - Add additional guards
4. **Document Incident** - Learn from near-miss

### Override Procedures:
For rare cases requiring dormant code fixes:
1. **Explicit Override** - `--force-dormant-fix` flag
2. **Full Testing Required** - Complete regression suite
3. **Staged Rollout** - Deploy to sandbox first
4. **Monitoring Enhanced** - Watch for issues 24-48 hours

## Best Practices

### For Developers:
- Always check `git status` before bulk operations
- Test fixes on active development first
- Use project-specific validation commands
- Verify deployment success after fixes

### For Project Reactivation:
- Run full validation suite on reactivation
- Apply accumulated rule changes gradually
- Test thoroughly in sandbox environment
- Monitor closely during initial deployments

## Command Examples

### Safe Validation:
```bash
# Only validate active files
npm run quality-check -- --active-only

# Check specific directory
npm run validate-netsuite ./CreatePdf/

# Dry run (no changes)
npm run pre-deploy -- --dry-run
```

### Project Status Check:
```bash
# Check if project is considered active
node /home/ben/saralegui-solutions-mcp/tools/check-project-status.js

# List dormant directories
git log --since="30 days ago" --name-only | grep -v "recently modified"
```

## Monitoring and Alerts

The MCP system will:
- Track all automated fixes applied
- Alert on any dormant code modifications
- Log safety rule violations
- Generate weekly safety reports

## Remember

> "Stability is more valuable than perfection in dormant code"

The goal is to improve code quality progressively as we naturally touch files during development, not to fix everything at once and risk breaking stable systems.