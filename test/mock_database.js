/**
 * Mock Database Manager for Testing
 * Simulates database operations in memory for fast, isolated testing
 */

export class MockDatabase {
  constructor() {
    this.tables = {
      tool_executions: [],
      learned_patterns: [],
      generated_tools: [],
      knowledge_entries: [],
      user_sessions: []
    };
    
    this.queryLog = [];
    this.idCounter = 1;
  }

  // Simulate SQL query execution
  async query(sql, params = []) {
    this.queryLog.push({ sql, params, timestamp: new Date() });
    
    // Parse the SQL to determine operation
    const sqlLower = sql.toLowerCase().trim();
    
    if (sqlLower.startsWith('insert into')) {
      return this.handleInsert(sql, params);
    } else if (sqlLower.startsWith('select')) {
      return this.handleSelect(sql, params);
    } else if (sqlLower.startsWith('update')) {
      return this.handleUpdate(sql, params);
    } else if (sqlLower.startsWith('delete')) {
      return this.handleDelete(sql, params);
    }
    
    return [];
  }

  // Simulate single row fetch
  async get(sql, params = []) {
    const results = await this.query(sql, params);
    return results[0] || null;
  }

  // Simulate multiple row fetch (alias for query)
  async all(sql, params = []) {
    return await this.query(sql, params);
  }

  // Simulate run method (for INSERT/UPDATE/DELETE)
  async run(sql, params = []) {
    const results = await this.query(sql, params);
    
    // For INSERT statements, return the result with lastID
    if (sql.toLowerCase().trim().startsWith('insert into')) {
      return results;
    }
    
    // For UPDATE/DELETE, return changes count
    return { changes: results.affectedRows || 0 };
  }

  handleInsert(sql, params) {
    const tableMatch = sql.match(/insert into (\w+)/i);
    if (!tableMatch) throw new Error('Invalid INSERT query');
    
    const tableName = tableMatch[1];
    const table = this.tables[tableName];
    if (!table) throw new Error(`Table ${tableName} does not exist`);
    
    // Parse column names and create record
    const columnsMatch = sql.match(/\(([^)]+)\)/);
    const columns = columnsMatch ? 
      columnsMatch[1].split(',').map(c => c.trim()) : 
      [];
    
    const record = { id: this.idCounter++ };
    columns.forEach((col, idx) => {
      if (col !== 'id') {
        record[col] = params[idx];
      }
    });
    
    // Add timestamps
    record.created_at = new Date().toISOString();
    record.updated_at = record.created_at;
    
    table.push(record);
    
    return { lastID: record.id, changes: 1 };
  }

  handleSelect(sql, params) {
    const tableMatch = sql.match(/from (\w+)/i);
    if (!tableMatch) throw new Error('Invalid SELECT query');
    
    const tableName = tableMatch[1];
    let results = [...(this.tables[tableName] || [])];
    
    // Handle WHERE clause
    const whereMatch = sql.match(/where (.+?)(?:order|group|limit|$)/i);
    if (whereMatch) {
      results = this.applyWhere(results, whereMatch[1], params);
    }
    
    // Handle ORDER BY
    const orderMatch = sql.match(/order by (\w+)(?:\s+(asc|desc))?/i);
    if (orderMatch) {
      const field = orderMatch[1];
      const direction = (orderMatch[2] || 'asc').toLowerCase();
      results.sort((a, b) => {
        const aVal = a[field];
        const bVal = b[field];
        const compare = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return direction === 'desc' ? -compare : compare;
      });
    }
    
    // Handle LIMIT
    const limitMatch = sql.match(/limit (\d+)/i);
    if (limitMatch) {
      results = results.slice(0, parseInt(limitMatch[1]));
    }
    
    return results;
  }

  handleUpdate(sql, params) {
    const tableMatch = sql.match(/update (\w+)/i);
    if (!tableMatch) throw new Error('Invalid UPDATE query');
    
    const tableName = tableMatch[1];
    const table = this.tables[tableName];
    if (!table) throw new Error(`Table ${tableName} does not exist`);
    
    // Parse SET clause more carefully
    let setClause = '';
    let whereClause = '';
    
    const whereIndex = sql.toLowerCase().indexOf('where');
    if (whereIndex !== -1) {
      setClause = sql.substring(sql.toLowerCase().indexOf('set') + 3, whereIndex).trim();
      whereClause = sql.substring(whereIndex + 5).trim();
    } else {
      setClause = sql.substring(sql.toLowerCase().indexOf('set') + 3).trim();
    }
    
    // Parse SET pairs - handle CURRENT_TIMESTAMP and other literals
    const setPairs = [];
    const setFields = [];
    const setParts = setClause.split(',');
    
    setParts.forEach(part => {
      const eqIndex = part.indexOf('=');
      if (eqIndex !== -1) {
        const field = part.substring(0, eqIndex).trim();
        const value = part.substring(eqIndex + 1).trim();
        
        if (value === '?' || value.includes('?')) {
          setPairs.push(field);
        } else if (value === 'CURRENT_TIMESTAMP') {
          setFields.push({ field, value: new Date().toISOString() });
        } else {
          setFields.push({ field, value });
        }
      }
    });
    
    // Build updates object
    const updates = {};
    setPairs.forEach((field, idx) => {
      updates[field] = params[idx];
    });
    
    // Add literal values
    setFields.forEach(({ field, value }) => {
      updates[field] = value;
    });
    
    // Handle WHERE clause
    if (whereClause) {
      // Handle WHERE id = ? pattern
      if (whereClause.includes('id = ?')) {
        const id = params[setPairs.length]; // ID param comes after SET params
        const record = table.find(r => r.id === id);
        if (record) {
          Object.assign(record, updates);
          if (!updates.updated_at) {
            record.updated_at = new Date().toISOString();
          }
          return { changes: 1 };
        }
      }
    } else {
      // No WHERE clause - update all records
      table.forEach(record => {
        Object.assign(record, updates);
        if (!updates.updated_at) {
          record.updated_at = new Date().toISOString();
        }
      });
      return { changes: table.length };
    }
    
    return { changes: 0 };
  }

  handleDelete(sql, params) {
    const tableMatch = sql.match(/delete from (\w+)/i);
    if (!tableMatch) throw new Error('Invalid DELETE query');
    
    const tableName = tableMatch[1];
    const table = this.tables[tableName];
    if (!table) return { changes: 0 };
    
    const beforeLength = table.length;
    
    // Simple WHERE id = ? implementation
    const whereMatch = sql.match(/where id = \?/i);
    if (whereMatch && params[0]) {
      const index = table.findIndex(r => r.id === params[0]);
      if (index > -1) {
        table.splice(index, 1);
      }
    }
    
    return { changes: beforeLength - table.length };
  }

  applyWhere(records, whereClause, params) {
    // Simple WHERE implementation for testing
    // Handles: field = ?, field > ?, AND conditions
    
    let filtered = [...records];
    let paramIndex = 0;
    
    // Handle datetime comparisons
    if (whereClause.includes('created_at >')) {
      const hoursMatch = whereClause.match(/datetime\('now', '-(\d+) hours?'\)/);
      if (hoursMatch) {
        const hours = parseInt(hoursMatch[1]);
        const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
        filtered = filtered.filter(r => new Date(r.created_at) > cutoff);
      }
    }
    
    // Handle simple equality checks
    const equalityMatches = whereClause.matchAll(/(\w+)\s*=\s*\?/g);
    for (const match of equalityMatches) {
      const field = match[1];
      const value = params[paramIndex++];
      filtered = filtered.filter(r => r[field] === value);
    }
    
    // Handle success = 1 or success = 0
    const successMatch = whereClause.match(/success = (\d)/);
    if (successMatch) {
      const successVal = parseInt(successMatch[1]);
      filtered = filtered.filter(r => r.success === successVal);
    }
    
    return filtered;
  }

  // Test helper methods
  async seedExecutions(executions) {
    for (const exec of executions) {
      await this.query(
        'INSERT INTO tool_executions (tool_name, parameters, context, success, user_session_id) VALUES (?, ?, ?, ?, ?)',
        [
          exec.tool_name,
          JSON.stringify(exec.parameters || {}),
          JSON.stringify(exec.context || {}),
          exec.success !== false ? 1 : 0,
          exec.session_id || 'test_session'
        ]
      );
    }
  }

  async seedPatterns(patterns) {
    for (const pattern of patterns) {
      await this.query(
        'INSERT INTO learned_patterns (pattern_signature, pattern_type, pattern_data, occurrences, confidence_score) VALUES (?, ?, ?, ?, ?)',
        [
          pattern.signature,
          pattern.type || 'sequence',
          JSON.stringify(pattern),
          pattern.occurrences || 1,
          pattern.confidence || 0.5
        ]
      );
    }
  }

  // Inspection methods for testing
  getExecutions() {
    return this.tables.tool_executions;
  }

  getPatterns() {
    return this.tables.learned_patterns;
  }

  getGeneratedTools() {
    return this.tables.generated_tools;
  }

  getQueryLog() {
    return this.queryLog;
  }

  clearAll() {
    for (const table in this.tables) {
      this.tables[table] = [];
    }
    this.queryLog = [];
    this.idCounter = 1;
  }

  // Debug helper
  printState() {
    console.log('\n📊 Mock Database State:');
    console.log('══════════════════════');
    for (const [tableName, records] of Object.entries(this.tables)) {
      if (records.length > 0) {
        console.log(`\n📁 ${tableName}: ${records.length} records`);
        records.slice(0, 3).forEach(r => {
          console.log(`  └─ ID ${r.id}: ${JSON.stringify(r).substring(0, 80)}...`);
        });
        if (records.length > 3) {
          console.log(`  └─ ... and ${records.length - 3} more`);
        }
      }
    }
    console.log('\n📝 Query Log:', this.queryLog.length, 'queries executed');
  }
}