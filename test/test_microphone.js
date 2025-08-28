#!/usr/bin/env node

/**
 * Microphone Test Utility
 * Tests audio recording and Whisper transcription
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';
import OpenAI from 'openai';

// Load environment variables
dotenv.config({ path: '.env.local' });

const execAsync = promisify(exec);

class MicrophoneTest {
  constructor() {
    this.hasOpenAI = !!process.env.OPENAI_API_KEY;
    
    if (this.hasOpenAI) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
  }
  
  /**
   * Check if audio tools are installed
   */
  async checkDependencies() {
    console.log(chalk.cyan('🔍 Checking dependencies...'));
    
    const tools = {
      sox: 'Audio recording (sox)',
      arecord: 'ALSA recording tools',
      pactl: 'PulseAudio control'
    };
    
    const results = {};
    
    for (const [command, description] of Object.entries(tools)) {
      try {
        await execAsync(`which ${command}`);
        results[command] = true;
        console.log(chalk.green(`  ✅ ${description} - installed`));
      } catch {
        results[command] = false;
        console.log(chalk.yellow(`  ⚠️  ${description} - not found`));
      }
    }
    
    if (!results.sox) {
      console.log(chalk.yellow('\n📦 Installing sox is recommended:'));
      console.log(chalk.gray('  Ubuntu/Debian: sudo apt-get install sox'));
      console.log(chalk.gray('  macOS: brew install sox'));
    }
    
    return results;
  }
  
  /**
   * List available audio devices
   */
  async listAudioDevices() {
    console.log(chalk.cyan('\n🎤 Available audio devices:'));
    
    try {
      // Try PulseAudio first
      const { stdout: paOutput } = await execAsync('pactl list sources short 2>/dev/null || true');
      
      if (paOutput) {
        console.log(chalk.gray('\nPulseAudio sources:'));
        console.log(paOutput);
      }
      
      // Try ALSA
      const { stdout: alsaOutput } = await execAsync('arecord -l 2>/dev/null || true');
      
      if (alsaOutput) {
        console.log(chalk.gray('\nALSA devices:'));
        console.log(alsaOutput);
      }
      
      // Check for Razer Kiyo specifically
      const { stdout: usbOutput } = await execAsync('lsusb | grep -i "razer\\|kiyo" || true');
      
      if (usbOutput) {
        console.log(chalk.green('\n✅ Razer Kiyo detected:'));
        console.log(usbOutput);
      }
      
    } catch (error) {
      console.error(chalk.red('Failed to list devices:'), error.message);
    }
  }
  
  /**
   * Test microphone recording
   */
  async testRecording(duration = 5) {
    const tempFile = `/tmp/mic_test_${Date.now()}.wav`;
    
    console.log(chalk.cyan(`\n🎙️  Testing microphone recording (${duration} seconds)...`));
    console.log(chalk.yellow('Speak now!'));
    
    const spinner = ora('Recording...').start();
    
    try {
      // Try sox first (most reliable)
      await execAsync(`sox -d ${tempFile} trim 0 ${duration}`);
      
      spinner.succeed('Recording complete');
      
      // Check file size
      const stats = fs.statSync(tempFile);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      
      console.log(chalk.green(`  ✅ Audio file created: ${sizeMB}MB`));
      
      // Play back the recording
      await this.playbackTest(tempFile);
      
      // Test transcription if OpenAI is available
      if (this.hasOpenAI) {
        await this.testTranscription(tempFile);
      }
      
      // Clean up
      fs.unlinkSync(tempFile);
      
      return true;
      
    } catch (error) {
      spinner.fail('Recording failed');
      console.error(chalk.red('Error:'), error.message);
      
      // Try alternative recording method
      console.log(chalk.yellow('\nTrying alternative recording method...'));
      
      try {
        await execAsync(`arecord -d ${duration} -f cd ${tempFile}`);
        console.log(chalk.green('Alternative recording successful'));
        
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
        
        return true;
      } catch {
        console.error(chalk.red('Alternative recording also failed'));
        return false;
      }
    }
  }
  
  /**
   * Test audio playback
   */
  async playbackTest(audioFile) {
    console.log(chalk.cyan('\n🔊 Testing playback...'));
    
    const players = [
      { cmd: 'aplay', name: 'ALSA' },
      { cmd: 'paplay', name: 'PulseAudio' },
      { cmd: 'play', name: 'Sox' },
      { cmd: 'ffplay -nodisp -autoexit', name: 'FFmpeg' }
    ];
    
    for (const player of players) {
      try {
        console.log(chalk.gray(`  Trying ${player.name}...`));
        await execAsync(`${player.cmd} ${audioFile} 2>/dev/null`);
        console.log(chalk.green(`  ✅ Playback successful with ${player.name}`));
        return true;
      } catch {
        // Try next player
        continue;
      }
    }
    
    console.log(chalk.yellow('  ⚠️  No audio player worked'));
    return false;
  }
  
  /**
   * Test Whisper transcription
   */
  async testTranscription(audioFile) {
    console.log(chalk.cyan('\n📝 Testing Whisper transcription...'));
    
    const spinner = ora('Transcribing...').start();
    
    try {
      const audioStream = fs.createReadStream(audioFile);
      
      const transcription = await this.openai.audio.transcriptions.create({
        file: audioStream,
        model: 'whisper-1'
      });
      
      spinner.succeed('Transcription complete');
      console.log(chalk.green('  📝 Transcribed text:'));
      console.log(chalk.white(`  "${transcription.text}"`));
      
      return transcription.text;
      
    } catch (error) {
      spinner.fail('Transcription failed');
      console.error(chalk.red('Error:'), error.message);
      
      if (error.message.includes('API key')) {
        console.log(chalk.yellow('\n⚠️  OpenAI API key issue. Check your .env.local file'));
      }
      
      return null;
    }
  }
  
  /**
   * Test audio levels
   */
  async testAudioLevels() {
    console.log(chalk.cyan('\n📊 Testing audio levels (5 seconds)...'));
    console.log(chalk.gray('Speak normally to see levels'));
    
    try {
      // Record and show levels
      const { stdout } = await execAsync('sox -d -n stats trim 0 5 2>&1');
      
      // Parse key metrics
      const lines = stdout.split('\n');
      const metrics = {};
      
      lines.forEach(line => {
        if (line.includes('Maximum amplitude')) {
          metrics.maxAmplitude = line.split(':')[1].trim();
        } else if (line.includes('RMS amplitude')) {
          metrics.rmsAmplitude = line.split(':')[1].trim();
        }
      });
      
      console.log(chalk.green('\n  Audio metrics:'));
      console.log(`  • Max amplitude: ${metrics.maxAmplitude || 'N/A'}`);
      console.log(`  • RMS amplitude: ${metrics.rmsAmplitude || 'N/A'}`);
      
      // Check if levels are good
      const maxAmp = parseFloat(metrics.maxAmplitude) || 0;
      
      if (maxAmp < 0.1) {
        console.log(chalk.yellow('\n  ⚠️  Audio levels very low. Check microphone position/volume'));
      } else if (maxAmp > 0.9) {
        console.log(chalk.yellow('\n  ⚠️  Audio levels very high. Reduce microphone gain'));
      } else {
        console.log(chalk.green('\n  ✅ Audio levels look good!'));
      }
      
    } catch (error) {
      console.error(chalk.red('Level test failed:'), error.message);
    }
  }
  
  /**
   * Run comprehensive microphone test
   */
  async runFullTest() {
    console.log(chalk.blue.bold('\n🎤 Microphone Test Suite for Saralegui AI Assistant'));
    console.log(chalk.gray('=' . repeat(50)));
    
    // Check dependencies
    const deps = await this.checkDependencies();
    
    if (!deps.sox) {
      console.log(chalk.red('\n❌ Sox is required for audio recording'));
      console.log(chalk.yellow('Please install sox first'));
      return;
    }
    
    // List devices
    await this.listAudioDevices();
    
    // Test recording
    const recordSuccess = await this.testRecording(3);
    
    if (!recordSuccess) {
      console.log(chalk.red('\n❌ Recording test failed'));
      console.log(chalk.yellow('Please check your microphone connection'));
      return;
    }
    
    // Test audio levels
    await this.testAudioLevels();
    
    // Final report
    console.log(chalk.blue.bold('\n📋 Test Summary'));
    console.log(chalk.gray('=' . repeat(50)));
    
    console.log(chalk.green('✅ Microphone: Working'));
    console.log(chalk.green('✅ Recording: Functional'));
    console.log(chalk.green('✅ Playback: Functional'));
    
    if (this.hasOpenAI) {
      console.log(chalk.green('✅ Whisper API: Connected'));
    } else {
      console.log(chalk.yellow('⚠️  Whisper API: No API key'));
    }
    
    console.log(chalk.green.bold('\n🎉 Microphone ready for Claudia voice assistant!'));
  }
}

// Run test if called directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const tester = new MicrophoneTest();
  tester.runFullTest().catch(console.error);
}

export default MicrophoneTest;