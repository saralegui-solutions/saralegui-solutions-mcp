/**
 * Resource Manager for Claude Code Instances
 * Optimizes concurrent Claude usage and manages system resources
 */

import chalk from 'chalk';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

export class ResourceManager {
  constructor() {
    // Configuration
    this.maxConcurrentClaudes = parseInt(process.env.MAX_CLAUDE_INSTANCES) || 2;
    this.reserveForSystem = 1; // Reserve 1 instance for system use
    this.activeInstances = new Map();
    this.queue = [];
    this.metrics = {
      totalRequests: 0,
      queuedRequests: 0,
      completedRequests: 0,
      averageWaitTime: 0
    };
    
    // Initialize database for tracking
    const dbPath = join(dirname(__dirname), 'database', 'saralegui_assistant.db');
    this.db = new Database(dbPath);
    this.setupTables();
    
    // Monitor system resources
    this.startMonitoring();
  }
  
  setupTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS resource_usage (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        instance_id TEXT NOT NULL,
        instance_type TEXT NOT NULL,
        priority TEXT,
        started_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        duration_ms INTEGER,
        memory_used_mb INTEGER,
        cpu_percent REAL
      )
    `);
  }
  
  /**
   * Request a Claude instance
   * @param {string} priority - 'high', 'normal', 'low'
   * @param {string} purpose - Description of what the instance is for
   * @returns {Promise<Object>} Instance allocation result
   */
  async requestClaudeInstance(priority = 'normal', purpose = 'general') {
    this.metrics.totalRequests++;
    
    const requestId = this.generateId();
    const startTime = Date.now();
    
    console.log(chalk.cyan(`📊 Instance request: ${purpose} (${priority} priority)`));
    
    // Check current capacity
    if (this.activeInstances.size >= this.maxConcurrentClaudes) {
      if (priority === 'high') {
        // High priority requests wait in queue
        console.log(chalk.yellow('⏳ Maximum instances reached, queuing request...'));
        
        const waitPromise = this.addToQueue(requestId, priority);
        this.metrics.queuedRequests++;
        
        await waitPromise;
        
        const waitTime = Date.now() - startTime;
        this.updateAverageWaitTime(waitTime);
        
      } else if (priority === 'low') {
        // Low priority requests are rejected
        console.log(chalk.red('❌ Maximum instances reached, request denied (low priority)'));
        
        return {
          available: false,
          reason: 'capacity_exceeded',
          message: 'Claude Code instances at capacity, low priority request denied',
          activeInstances: this.activeInstances.size,
          maxInstances: this.maxConcurrentClaudes
        };
        
      } else {
        // Normal priority - wait briefly then timeout
        const timeout = 30000; // 30 seconds
        
        try {
          await this.waitForSlot(timeout);
        } catch {
          console.log(chalk.red('❌ Timeout waiting for available instance'));
          
          return {
            available: false,
            reason: 'timeout',
            message: `No instance available within ${timeout/1000} seconds`,
            activeInstances: this.activeInstances.size,
            suggestion: 'Try again later or increase priority'
          };
        }
      }
    }
    
    // Allocate instance
    const instanceId = this.generateId();
    const instance = {
      id: instanceId,
      purpose: purpose,
      priority: priority,
      startedAt: new Date().toISOString(),
      pid: null,
      memoryUsage: 0,
      cpuUsage: 0
    };
    
    this.activeInstances.set(instanceId, instance);
    
    // Track in database
    this.db.prepare(`
      INSERT INTO resource_usage (instance_id, instance_type, priority)
      VALUES (?, ?, ?)
    `).run(instanceId, purpose, priority);
    
    console.log(chalk.green(`✅ Instance allocated: ${instanceId}`));
    console.log(chalk.gray(`  Active instances: ${this.activeInstances.size}/${this.maxConcurrentClaudes}`));
    
    // Return instance handle
    return {
      available: true,
      instanceId: instanceId,
      priority: priority,
      allocatedAt: instance.startedAt,
      
      // Release function
      release: () => this.releaseInstance(instanceId),
      
      // Update metrics
      updateMetrics: (metrics) => this.updateInstanceMetrics(instanceId, metrics),
      
      // Check status
      getStatus: () => this.getInstanceStatus(instanceId)
    };
  }
  
  /**
   * Release a Claude instance
   */
  releaseInstance(instanceId) {
    const instance = this.activeInstances.get(instanceId);
    
    if (!instance) {
      console.warn(chalk.yellow(`⚠️  Instance ${instanceId} not found`));
      return false;
    }
    
    // Calculate duration
    const duration = Date.now() - new Date(instance.startedAt).getTime();
    
    // Update database
    this.db.prepare(`
      UPDATE resource_usage 
      SET completed_at = CURRENT_TIMESTAMP,
          duration_ms = ?,
          memory_used_mb = ?,
          cpu_percent = ?
      WHERE instance_id = ?
    `).run(duration, instance.memoryUsage, instance.cpuUsage, instanceId);
    
    // Remove from active instances
    this.activeInstances.delete(instanceId);
    
    console.log(chalk.blue(`🔄 Instance released: ${instanceId}`));
    console.log(chalk.gray(`  Duration: ${(duration/1000).toFixed(1)}s`));
    console.log(chalk.gray(`  Active instances: ${this.activeInstances.size}/${this.maxConcurrentClaudes}`));
    
    this.metrics.completedRequests++;
    
    // Process queue if any waiting
    this.processQueue();
    
    return true;
  }
  
  /**
   * Add request to queue
   */
  addToQueue(requestId, priority) {
    return new Promise((resolve) => {
      this.queue.push({
        id: requestId,
        priority: priority,
        resolve: resolve,
        timestamp: Date.now()
      });
      
      // Sort queue by priority
      this.queue.sort((a, b) => {
        const priorityOrder = { high: 3, normal: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      });
      
      console.log(chalk.gray(`  Queue length: ${this.queue.length}`));
    });
  }
  
  /**
   * Process waiting queue
   */
  processQueue() {
    if (this.queue.length === 0) return;
    
    if (this.activeInstances.size < this.maxConcurrentClaudes) {
      const request = this.queue.shift();
      
      if (request) {
        console.log(chalk.cyan(`📤 Processing queued request: ${request.id}`));
        request.resolve();
      }
    }
  }
  
  /**
   * Wait for available slot
   */
  async waitForSlot(timeout = 60000) {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (this.activeInstances.size < this.maxConcurrentClaudes) {
          clearInterval(checkInterval);
          resolve();
        } else if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(new Error('Timeout waiting for slot'));
        }
      }, 1000);
    });
  }
  
  /**
   * Update instance metrics
   */
  updateInstanceMetrics(instanceId, metrics) {
    const instance = this.activeInstances.get(instanceId);
    
    if (instance) {
      instance.memoryUsage = metrics.memory || 0;
      instance.cpuUsage = metrics.cpu || 0;
      instance.pid = metrics.pid || null;
    }
  }
  
  /**
   * Get instance status
   */
  getInstanceStatus(instanceId) {
    const instance = this.activeInstances.get(instanceId);
    
    if (!instance) {
      return { exists: false };
    }
    
    const duration = Date.now() - new Date(instance.startedAt).getTime();
    
    return {
      exists: true,
      ...instance,
      durationMs: duration,
      durationFormatted: `${(duration/1000).toFixed(1)}s`
    };
  }
  
  /**
   * Get overall status
   */
  getStatus() {
    const instances = Array.from(this.activeInstances.values());
    
    return {
      activeInstances: this.activeInstances.size,
      maxInstances: this.maxConcurrentClaudes,
      availableSlots: this.maxConcurrentClaudes - this.activeInstances.size,
      queueLength: this.queue.length,
      instances: instances.map(inst => ({
        id: inst.id,
        purpose: inst.purpose,
        priority: inst.priority,
        duration: `${((Date.now() - new Date(inst.startedAt).getTime())/1000).toFixed(1)}s`
      })),
      metrics: this.metrics,
      systemResources: this.getSystemResources()
    };
  }
  
  /**
   * Get system resources
   */
  getSystemResources() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const cpus = os.cpus();
    
    return {
      memory: {
        total: `${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
        free: `${(freeMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
        used: `${((totalMem - freeMem) / 1024 / 1024 / 1024).toFixed(2)} GB`,
        percentUsed: ((totalMem - freeMem) / totalMem * 100).toFixed(1)
      },
      cpu: {
        cores: cpus.length,
        model: cpus[0]?.model || 'Unknown',
        loadAverage: os.loadavg()
      }
    };
  }
  
  /**
   * Start monitoring system resources
   */
  startMonitoring() {
    // Monitor every 30 seconds
    setInterval(() => {
      const resources = this.getSystemResources();
      
      // Adjust max instances based on available resources
      const memPercent = parseFloat(resources.memory.percentUsed);
      
      if (memPercent > 90) {
        // Reduce max instances if memory is critical
        this.maxConcurrentClaudes = Math.max(1, this.reserveForSystem);
        console.log(chalk.red(`⚠️  High memory usage (${memPercent}%), reducing max instances to ${this.maxConcurrentClaudes}`));
      } else if (memPercent < 60 && this.maxConcurrentClaudes < 3) {
        // Increase if resources available
        this.maxConcurrentClaudes = 2;
      }
      
    }, 30000);
  }
  
  /**
   * Update average wait time
   */
  updateAverageWaitTime(waitTime) {
    const alpha = 0.3; // Exponential moving average factor
    this.metrics.averageWaitTime = 
      alpha * waitTime + (1 - alpha) * this.metrics.averageWaitTime;
  }
  
  /**
   * Generate unique ID
   */
  generateId() {
    return `claude_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Get usage report
   */
  getUsageReport(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    const usage = this.db.prepare(`
      SELECT 
        COUNT(*) as total_instances,
        AVG(duration_ms) as avg_duration,
        MAX(duration_ms) as max_duration,
        AVG(memory_used_mb) as avg_memory,
        AVG(cpu_percent) as avg_cpu
      FROM resource_usage
      WHERE started_at > ?
    `).get(since);
    
    const byPriority = this.db.prepare(`
      SELECT 
        priority,
        COUNT(*) as count,
        AVG(duration_ms) as avg_duration
      FROM resource_usage
      WHERE started_at > ?
      GROUP BY priority
    `).all(since);
    
    return {
      period: `Last ${hours} hours`,
      summary: {
        totalInstances: usage.total_instances || 0,
        avgDuration: `${((usage.avg_duration || 0)/1000).toFixed(1)}s`,
        maxDuration: `${((usage.max_duration || 0)/1000).toFixed(1)}s`,
        avgMemory: `${(usage.avg_memory || 0).toFixed(0)} MB`,
        avgCpu: `${(usage.avg_cpu || 0).toFixed(1)}%`
      },
      byPriority: byPriority.map(p => ({
        priority: p.priority,
        count: p.count,
        avgDuration: `${(p.avg_duration/1000).toFixed(1)}s`
      })),
      current: this.getStatus()
    };
  }
  
  /**
   * Clean up and close
   */
  close() {
    this.db.close();
  }
}

// Export singleton instance
export default new ResourceManager();