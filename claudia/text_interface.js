#!/usr/bin/env node

/**
 * Text-based Command Interface for Claudia AI Assistant
 * Alternative to voice input for WSL environments
 */

import readline from 'readline';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

export class TextInterface {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan('Claudia> ')
    });
    
    this.setupEventHandlers();
    this.showWelcome();
  }
  
  setupEventHandlers() {
    this.rl.on('line', (input) => {
      this.handleCommand(input.trim());
    });
    
    this.rl.on('close', () => {
      console.log(chalk.yellow('\n👋 Goodbye! Thanks for using Claudia AI Assistant'));
      process.exit(0);
    });
    
    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n\n👋 Goodbye! Thanks for using Claudia AI Assistant'));
      process.exit(0);
    });
  }
  
  showWelcome() {
    console.clear();
    console.log(chalk.blue.bold('╔══════════════════════════════════════════════╗'));
    console.log(chalk.blue.bold('║           Claudia AI Assistant              ║'));
    console.log(chalk.blue.bold('║              Text Interface                  ║'));
    console.log(chalk.blue.bold('╚══════════════════════════════════════════════╝'));
    console.log();
    console.log(chalk.cyan('Available Commands:'));
    console.log(chalk.gray('  help        - Show available commands'));
    console.log(chalk.gray('  ask <query> - Send query to AI assistant'));
    console.log(chalk.gray('  netsuite    - NetSuite operations'));
    console.log(chalk.gray('  status      - Show system status'));
    console.log(chalk.gray('  clear       - Clear screen'));
    console.log(chalk.gray('  exit        - Exit assistant'));
    console.log();
    console.log(chalk.green('💡 Tip: You can also just type your question directly!'));
    console.log();
    
    this.rl.prompt();
  }
  
  async handleCommand(input) {
    if (!input) {
      this.rl.prompt();
      return;
    }
    
    const [command, ...args] = input.split(' ');
    const query = args.join(' ');
    
    switch (command.toLowerCase()) {
      case 'help':
        this.showHelp();
        break;
        
      case 'ask':
        if (query) {
          await this.processQuery(query);
        } else {
          console.log(chalk.yellow('Usage: ask <your question>'));
        }
        break;
        
      case 'netsuite':
        await this.handleNetSuite(args);
        break;
        
      case 'status':
        await this.showStatus();
        break;
        
      case 'clear':
        console.clear();
        this.showWelcome();
        return;
        
      case 'exit':
      case 'quit':
      case 'bye':
        this.rl.close();
        return;
        
      default:
        // Treat unknown commands as direct queries
        await this.processQuery(input);
        break;
    }
    
    this.rl.prompt();
  }
  
  showHelp() {
    console.log(chalk.cyan('\n📖 Claudia AI Assistant Commands:'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log();
    console.log(chalk.white('Basic Commands:'));
    console.log(chalk.gray('  ask <query>     - Ask AI assistant a question'));
    console.log(chalk.gray('  help            - Show this help message'));
    console.log(chalk.gray('  status          - Show system status'));
    console.log(chalk.gray('  clear           - Clear screen'));
    console.log(chalk.gray('  exit            - Exit assistant'));
    console.log();
    console.log(chalk.white('NetSuite Operations:'));
    console.log(chalk.gray('  netsuite setup  - Configure NetSuite credentials'));
    console.log(chalk.gray('  netsuite list   - List configured accounts'));
    console.log(chalk.gray('  netsuite test   - Test connection'));
    console.log();
    console.log(chalk.white('Examples:'));
    console.log(chalk.green('  ask What is the weather today?'));
    console.log(chalk.green('  How do I configure NetSuite?'));
    console.log(chalk.green('  netsuite setup'));
    console.log();
  }
  
  async processQuery(query) {
    console.log(chalk.blue(`\n🤔 Processing: "${query}"`));
    
    // Here you would integrate with your MCP server or AI backend
    // For now, we'll show a placeholder response
    try {
      // Simulate AI processing
      const spinner = this.createSpinner('Thinking...');
      spinner.start();
      
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      spinner.stop();
      
      // Placeholder response - integrate with your actual AI backend
      console.log(chalk.green('\n🤖 Claudia:'));
      console.log(chalk.white(`I received your query: "${query}"`));
      console.log(chalk.gray('(AI integration pending - connect to MCP server)'));
      
      // Log the query for learning purposes
      await this.logQuery(query);
      
    } catch (error) {
      console.error(chalk.red('\n❌ Error processing query:'), error.message);
    }
    
    console.log();
  }
  
  async handleNetSuite(args) {
    const subCommand = args[0];
    
    switch (subCommand) {
      case 'setup':
        console.log(chalk.cyan('\n🔐 Starting NetSuite setup...'));
        // Call the NetSuite setup script
        try {
          const { spawn } = await import('child_process');
          const setupProcess = spawn('node', [
            join(__dirname, '..', 'config', 'netsuite_sandbox.js'),
            'setup'
          ], { stdio: 'inherit' });
          
          setupProcess.on('close', (code) => {
            if (code === 0) {
              console.log(chalk.green('\n✅ NetSuite setup completed'));
            } else {
              console.log(chalk.red('\n❌ NetSuite setup failed'));
            }
            this.rl.prompt();
          });
          return; // Don't prompt immediately
        } catch (error) {
          console.error(chalk.red('Setup failed:'), error.message);
        }
        break;
        
      case 'list':
        console.log(chalk.cyan('\n📋 NetSuite Accounts:'));
        // Implementation would call NetSuite manager
        console.log(chalk.gray('(NetSuite integration pending)'));
        break;
        
      case 'test':
        console.log(chalk.cyan('\n🔌 Testing NetSuite connection...'));
        console.log(chalk.gray('(NetSuite integration pending)'));
        break;
        
      default:
        console.log(chalk.yellow('\nNetSuite commands:'));
        console.log(chalk.gray('  netsuite setup - Configure credentials'));
        console.log(chalk.gray('  netsuite list  - List accounts'));
        console.log(chalk.gray('  netsuite test  - Test connection'));
        break;
    }
  }
  
  async showStatus() {
    console.log(chalk.cyan('\n📊 System Status:'));
    console.log(chalk.gray('─'.repeat(30)));
    
    // Check environment variables
    const openaiConfigured = process.env.OPENAI_API_KEY && 
      !process.env.OPENAI_API_KEY.includes('your-key-here');
    const elevenlabsConfigured = process.env.ELEVENLABS_API_KEY && 
      !process.env.ELEVENLABS_API_KEY.includes('sk_');
    const pushoverConfigured = process.env.PUSHOVER_TOKEN && 
      process.env.PUSHOVER_USER;
    
    console.log(chalk.white('API Configuration:'));
    console.log(`  OpenAI Whisper: ${openaiConfigured ? chalk.green('✅ Configured') : chalk.red('❌ Not configured')}`);
    console.log(`  ElevenLabs Voice: ${elevenlabsConfigured ? chalk.green('✅ Configured') : chalk.yellow('⚠️  Using fallback')}`);
    console.log(`  Pushover Notifications: ${pushoverConfigured ? chalk.green('✅ Configured') : chalk.gray('Not configured')}`);
    
    console.log(chalk.white('\nFeature Status:'));
    console.log(`  Voice Commands: ${process.env.ENABLE_VOICE === 'true' ? chalk.yellow('⚠️  Enabled (may not work in WSL)') : chalk.green('✅ Disabled (WSL compatible)')}`);
    console.log(`  Learning Engine: ${process.env.ENABLE_LEARNING === 'true' ? chalk.green('✅ Enabled') : chalk.gray('Disabled')}`);
    console.log(`  NetSuite Integration: ${process.env.ENABLE_NETSUITE === 'true' ? chalk.green('✅ Enabled') : chalk.gray('Disabled')}`);
    
    console.log(chalk.white('\nEnvironment:'));
    console.log(`  Node.js: ${process.version}`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  Platform: ${process.platform} (${process.arch})`);
    
    console.log();
  }
  
  async logQuery(query) {
    // Log query for learning purposes
    try {
      // This would integrate with your learning engine
      const timestamp = new Date().toISOString();
      console.log(chalk.gray(`[${timestamp}] Query logged for learning`));
    } catch (error) {
      // Silently fail - logging is not critical
    }
  }
  
  createSpinner(text) {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    let intervalId;
    
    return {
      start: () => {
        intervalId = setInterval(() => {
          process.stdout.write(`\r${frames[i]} ${chalk.yellow(text)}`);
          i = (i + 1) % frames.length;
        }, 100);
      },
      stop: () => {
        if (intervalId) {
          clearInterval(intervalId);
          process.stdout.write('\r'); // Clear spinner line
        }
      }
    };
  }
  
  start() {
    // Interface is already started in constructor
    // This method exists for API compatibility
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const textInterface = new TextInterface();
  textInterface.start();
}

export default TextInterface;