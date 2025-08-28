/**
 * OpenAI Whisper Integration Module
 * Handles audio transcription using OpenAI's Whisper API
 */

import OpenAI from 'openai';
import fs from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const execAsync = promisify(exec);

export class WhisperIntegration {
  constructor(apiKey = process.env.OPENAI_API_KEY) {
    if (!apiKey) {
      throw new Error('OpenAI API key not found. Please set OPENAI_API_KEY in .env.local');
    }
    
    this.openai = new OpenAI({
      apiKey: apiKey
    });
    
    this.supportedFormats = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'];
    this.maxFileSize = 25 * 1024 * 1024; // 25MB limit
  }
  
  /**
   * Transcribe audio file using Whisper
   * @param {string} audioFilePath - Path to audio file
   * @param {Object} options - Transcription options
   * @returns {Promise<Object>} Transcription result
   */
  async transcribeAudio(audioFilePath, options = {}) {
    const spinner = ora('Transcribing audio with Whisper...').start();
    
    try {
      // Validate file exists
      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }
      
      // Check file size
      const stats = fs.statSync(audioFilePath);
      if (stats.size > this.maxFileSize) {
        throw new Error(`File too large. Maximum size is 25MB, got ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
      }
      
      // Create file stream
      const audioFile = fs.createReadStream(audioFilePath);
      
      // Transcribe with Whisper
      const transcription = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: options.language || 'en',
        prompt: options.prompt || '',
        response_format: options.format || 'json',
        temperature: options.temperature || 0
      });
      
      spinner.succeed('Audio transcribed successfully');
      
      return {
        text: transcription.text,
        success: true,
        duration: null, // Would need ffprobe to get duration
        metadata: {
          model: 'whisper-1',
          language: options.language || 'en'
        }
      };
      
    } catch (error) {
      spinner.fail('Transcription failed');
      console.error(chalk.red('Error:'), error.message);
      
      return {
        text: null,
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Record audio from microphone and transcribe
   * @param {number} duration - Recording duration in seconds
   * @param {Object} options - Recording and transcription options
   * @returns {Promise<Object>} Transcription result
   */
  async recordAndTranscribe(duration = 5, options = {}) {
    const tempFile = `/tmp/recording_${Date.now()}.wav`;
    const spinner = ora(`Recording for ${duration} seconds...`).start();
    
    try {
      // Record audio using sox
      await execAsync(`sox -d ${tempFile} trim 0 ${duration}`);
      spinner.text = 'Recording complete, transcribing...';
      
      // Transcribe the recorded audio
      const result = await this.transcribeAudio(tempFile, options);
      
      // Clean up temp file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      
      return result;
      
    } catch (error) {
      spinner.fail('Recording failed');
      
      // Clean up temp file on error
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      
      return {
        text: null,
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Stream transcription for real-time processing
   * @param {Function} onTranscript - Callback for transcript chunks
   * @param {Object} options - Streaming options
   */
  async streamTranscription(onTranscript, options = {}) {
    console.log(chalk.yellow('🎤 Starting continuous transcription...'));
    console.log(chalk.gray('Press Ctrl+C to stop'));
    
    const chunkDuration = options.chunkDuration || 5; // seconds
    let isRunning = true;
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      isRunning = false;
      console.log(chalk.yellow('\n\nStopping transcription...'));
    });
    
    while (isRunning) {
      const tempFile = `/tmp/stream_chunk_${Date.now()}.wav`;
      
      try {
        // Record chunk
        await execAsync(`timeout ${chunkDuration} sox -d ${tempFile} || true`);
        
        // Check if file has content
        if (fs.existsSync(tempFile)) {
          const stats = fs.statSync(tempFile);
          
          if (stats.size > 1000) { // Minimum size to avoid empty recordings
            // Transcribe chunk
            const result = await this.transcribeAudio(tempFile, {
              ...options,
              prompt: 'This is a continuous conversation.'
            });
            
            if (result.success && result.text && result.text.trim()) {
              onTranscript(result.text);
            }
          }
          
          // Clean up
          fs.unlinkSync(tempFile);
        }
        
      } catch (error) {
        console.error(chalk.red('Streaming error:'), error.message);
        
        // Clean up on error
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    }
  }
  
  /**
   * Translate audio to English
   * @param {string} audioFilePath - Path to non-English audio file
   * @returns {Promise<Object>} Translation result
   */
  async translateAudio(audioFilePath) {
    const spinner = ora('Translating audio to English...').start();
    
    try {
      const audioFile = fs.createReadStream(audioFilePath);
      
      const translation = await this.openai.audio.translations.create({
        file: audioFile,
        model: 'whisper-1',
        response_format: 'json'
      });
      
      spinner.succeed('Audio translated successfully');
      
      return {
        text: translation.text,
        success: true,
        isTranslation: true
      };
      
    } catch (error) {
      spinner.fail('Translation failed');
      console.error(chalk.red('Error:'), error.message);
      
      return {
        text: null,
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Get usage statistics for API calls
   * @returns {Object} Usage stats
   */
  getUsageStats() {
    // This would typically track API usage
    // For now, return placeholder
    return {
      transcriptions: 0,
      translations: 0,
      totalMinutes: 0,
      estimatedCost: 0
    };
  }
  
  /**
   * Validate API key
   * @returns {Promise<boolean>} True if API key is valid
   */
  async validateApiKey() {
    try {
      // Try a simple API call to validate the key
      const models = await this.openai.models.list();
      return true;
    } catch (error) {
      console.error(chalk.red('Invalid OpenAI API key'));
      return false;
    }
  }
}

// Export singleton instance
export default new WhisperIntegration();