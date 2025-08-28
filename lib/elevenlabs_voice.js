/**
 * ElevenLabs Voice Synthesis Integration
 * Text-to-speech using ElevenLabs API
 */

import fetch from 'node-fetch';
import fs from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const execAsync = promisify(exec);
const writeFile = promisify(fs.writeFile);

export class ElevenLabsVoice {
  constructor(apiKey = process.env.ELEVENLABS_API_KEY) {
    if (!apiKey) {
      console.warn(chalk.yellow('⚠️  ElevenLabs API key not found. Voice synthesis will be disabled.'));
      this.enabled = false;
      return;
    }
    
    this.enabled = true;
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.elevenlabs.io/v1';
    
    // Default voice settings
    this.defaultVoiceId = process.env.CLAUDIA_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Rachel
    this.defaultSettings = {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.5,
      use_speaker_boost: true
    };
    
    // Popular voice IDs
    this.voices = {
      rachel: '21m00Tcm4TlvDq8ikWAM',
      bella: 'EXAVITQu4vr4xnSDxMaL',
      antoni: 'ErXwobaYiN019PkySvjV',
      elli: 'MF3mGyEYCl7XYWbV9V6O',
      josh: 'TxGEqnHWrfWFTfGW9XjX',
      arnold: 'VR6AewLTigWG4xSOukaG',
      sam: 'yoZ06aMxZJJ28mfd3POQ'
    };
  }
  
  /**
   * Convert text to speech
   * @param {string} text - Text to convert
   * @param {Object} options - Voice options
   * @returns {Promise<Buffer>} Audio buffer
   */
  async textToSpeech(text, options = {}) {
    if (!this.enabled) {
      console.log(chalk.yellow('Voice synthesis disabled - no API key'));
      return null;
    }
    
    const spinner = ora('Generating speech...').start();
    
    try {
      const voiceId = options.voiceId || this.defaultVoiceId;
      const model = options.model || 'eleven_monolingual_v1';
      
      const response = await fetch(`${this.baseUrl}/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey
        },
        body: JSON.stringify({
          text: text,
          model_id: model,
          voice_settings: {
            ...this.defaultSettings,
            ...options.voiceSettings
          }
        })
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
      }
      
      const audioBuffer = await response.buffer();
      spinner.succeed('Speech generated successfully');
      
      return audioBuffer;
      
    } catch (error) {
      spinner.fail('Speech generation failed');
      console.error(chalk.red('Error:'), error.message);
      return null;
    }
  }
  
  /**
   * Generate speech and save to file
   * @param {string} text - Text to convert
   * @param {string} outputPath - Output file path
   * @param {Object} options - Voice options
   * @returns {Promise<boolean>} Success status
   */
  async generateSpeechFile(text, outputPath, options = {}) {
    try {
      const audioBuffer = await this.textToSpeech(text, options);
      
      if (!audioBuffer) {
        return false;
      }
      
      await writeFile(outputPath, audioBuffer);
      console.log(chalk.green('✅ Audio saved to:'), outputPath);
      
      return true;
      
    } catch (error) {
      console.error(chalk.red('Failed to save audio:'), error.message);
      return false;
    }
  }
  
  /**
   * Generate speech and play immediately
   * @param {string} text - Text to speak
   * @param {Object} options - Voice options
   * @returns {Promise<void>}
   */
  async speak(text, options = {}) {
    if (!this.enabled) {
      // Fallback to espeak if no API key
      console.log(chalk.gray('Using espeak fallback...'));
      await this.speakFallback(text);
      return;
    }
    
    const tempFile = `/tmp/speech_${Date.now()}.mp3`;
    
    try {
      const success = await this.generateSpeechFile(text, tempFile, options);
      
      if (success) {
        // Play the audio file
        await this.playAudio(tempFile);
        
        // Clean up
        fs.unlinkSync(tempFile);
      }
      
    } catch (error) {
      console.error(chalk.red('Speech playback failed:'), error.message);
      
      // Clean up on error
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }
  
  /**
   * Play audio file
   * @param {string} filePath - Path to audio file
   * @returns {Promise<void>}
   */
  async playAudio(filePath) {
    try {
      // Try different audio players based on availability
      const players = [
        'aplay',      // Linux ALSA
        'paplay',     // PulseAudio
        'play',       // Sox
        'ffplay -nodisp -autoexit', // FFmpeg
        'mpg123'      // MPG123
      ];
      
      for (const player of players) {
        try {
          await execAsync(`${player} ${filePath} 2>/dev/null`);
          return; // Success, exit
        } catch {
          // Try next player
          continue;
        }
      }
      
      console.warn(chalk.yellow('No audio player found. Install sox or ffmpeg.'));
      
    } catch (error) {
      console.error(chalk.red('Audio playback error:'), error.message);
    }
  }
  
  /**
   * Fallback speech using espeak
   * @param {string} text - Text to speak
   * @returns {Promise<void>}
   */
  async speakFallback(text) {
    try {
      await execAsync(`espeak "${text.replace(/"/g, '\\"')}" 2>/dev/null`);
    } catch {
      console.log(chalk.gray('Text:'), text);
    }
  }
  
  /**
   * Get available voices
   * @returns {Promise<Array>} List of available voices
   */
  async getVoices() {
    if (!this.enabled) {
      return Object.keys(this.voices).map(name => ({
        voice_id: this.voices[name],
        name: name,
        available: false
      }));
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/voices`, {
        headers: {
          'xi-api-key': this.apiKey
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch voices: ${response.status}`);
      }
      
      const data = await response.json();
      return data.voices;
      
    } catch (error) {
      console.error(chalk.red('Failed to fetch voices:'), error.message);
      return [];
    }
  }
  
  /**
   * Get user subscription info
   * @returns {Promise<Object>} Subscription details
   */
  async getSubscription() {
    if (!this.enabled) {
      return {
        tier: 'disabled',
        character_count: 0,
        character_limit: 0
      };
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/user/subscription`, {
        headers: {
          'xi-api-key': this.apiKey
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch subscription: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
      
    } catch (error) {
      console.error(chalk.red('Failed to fetch subscription:'), error.message);
      return null;
    }
  }
  
  /**
   * Stream text to speech for long content
   * @param {string} text - Long text to convert
   * @param {Function} onChunk - Callback for audio chunks
   * @param {Object} options - Voice options
   */
  async streamTextToSpeech(text, onChunk, options = {}) {
    if (!this.enabled) {
      console.log(chalk.yellow('Streaming disabled - no API key'));
      return;
    }
    
    // Split text into chunks (ElevenLabs has a 5000 char limit per request)
    const maxChunkSize = 4000;
    const chunks = [];
    
    for (let i = 0; i < text.length; i += maxChunkSize) {
      chunks.push(text.slice(i, i + maxChunkSize));
    }
    
    console.log(chalk.cyan(`Streaming ${chunks.length} chunks...`));
    
    for (let i = 0; i < chunks.length; i++) {
      const audioBuffer = await this.textToSpeech(chunks[i], options);
      
      if (audioBuffer) {
        onChunk(audioBuffer, i, chunks.length);
      }
    }
  }
  
  /**
   * Validate API key
   * @returns {Promise<boolean>} True if API key is valid
   */
  async validateApiKey() {
    if (!this.enabled) {
      return false;
    }
    
    try {
      const voices = await this.getVoices();
      return voices && voices.length > 0;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export default new ElevenLabsVoice();