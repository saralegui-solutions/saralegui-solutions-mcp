#!/usr/bin/env node

/**
 * Direct NetSuite API Test
 * Tests the actual NetSuite API connection using the known credentials from screenshots
 * This bypasses all database/encryption issues to focus purely on API connectivity
 */

import crypto from 'crypto';
import https from 'https';
import chalk from 'chalk';

class DirectNetSuiteAPITest {
  constructor() {
    // Use the exact credentials from the user's screenshots
    this.credentials = {
      accountId: '7134233_SB1',
      consumerKey: '79a1e311cbe600efa5e809a9b9ff5b18a299af307515336d109d647705ab885',
      consumerSecret: '38230ff0ca7ffd4b792e037172eeb06ef3e64cf0d8b8eb80f5b20536b6b53d1e9',
      tokenId: 'd1cf41782990876e7794de3e43dca5ef7e9b00e40657fd9ded1cce0e160a318a',
      tokenSecret: 'e5ca61883455e2538cc001c4eaf38b37f8208af56470355f0abce75d7cbd3d5',
      environment: 'sandbox'
    };
  }

  /**
   * Create OAuth 1.0 signature for NetSuite TBA
   */
  generateOAuthSignature(method, url, params, consumerSecret, tokenSecret) {
    // Sort parameters
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');

    // Create signature base string
    const baseString = [
      method.toUpperCase(),
      encodeURIComponent(url),
      encodeURIComponent(sortedParams)
    ].join('&');

    // Create signing key
    const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;

    // Generate signature
    const signature = crypto
      .createHmac('sha1', signingKey)
      .update(baseString)
      .digest('base64');

    return signature;
  }

  /**
   * Create OAuth 1.0 authorization header
   */
  createAuthHeader(method, url, credentials) {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomBytes(16).toString('hex');

    const oauthParams = {
      oauth_consumer_key: credentials.consumerKey,
      oauth_token: credentials.tokenId,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp,
      oauth_nonce: nonce,
      oauth_version: '1.0'
    };

    // Generate signature
    const signature = this.generateOAuthSignature(
      method,
      url,
      oauthParams,
      credentials.consumerSecret,
      credentials.tokenSecret
    );

    oauthParams.oauth_signature = signature;

    // Create authorization header
    const authHeader = 'OAuth ' + Object.keys(oauthParams)
      .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key])}"`)
      .join(', ');

    return authHeader;
  }

  /**
   * Make authenticated request to NetSuite REST API
   */
  async makeNetSuiteRequest(endpoint) {
    return new Promise((resolve, reject) => {
      const baseUrl = `https://${this.credentials.accountId.replace('_', '-')}.suitetalk.api.netsuite.com`;
      const fullUrl = `${baseUrl}${endpoint}`;

      console.log(chalk.gray(`   Making request to: ${fullUrl}`));

      const authHeader = this.createAuthHeader('GET', fullUrl, this.credentials);

      const options = {
        hostname: `${this.credentials.accountId.replace('_', '-')}.suitetalk.api.netsuite.com`,
        port: 443,
        path: endpoint,
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      };

      console.log(chalk.gray(`   Auth header: ${authHeader.substring(0, 50)}...`));

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const responseData = {
              statusCode: res.statusCode,
              headers: res.headers,
              body: data
            };

            if (data) {
              try {
                responseData.json = JSON.parse(data);
              } catch (e) {
                // Not JSON, keep as string
              }
            }

            resolve(responseData);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      // Set timeout
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * Test basic NetSuite connectivity
   */
  async testConnectivity() {
    console.log(chalk.cyan('\\n🔌 Testing Direct NetSuite API Connection...'));
    console.log(chalk.gray('═'.repeat(60)));
    console.log(chalk.gray(`Account: ${this.credentials.accountId}`));
    console.log(chalk.gray(`Environment: ${this.credentials.environment}`));
    console.log('');

    try {
      // Test basic endpoint - company information via SuiteQL
      console.log(chalk.yellow('📡 Testing basic connectivity...'));
      
      const response = await this.makeNetSuiteRequest('/services/rest/query/v1/suiteql');

      console.log(chalk.gray(`   Response Status: ${response.statusCode}`));
      console.log(chalk.gray(`   Response Headers: ${JSON.stringify(response.headers, null, 2).substring(0, 200)}...`));

      if (response.statusCode === 200) {
        console.log(chalk.green.bold('✅ SUCCESS: NetSuite API connection is working!'));
        console.log(chalk.green('🎉 Your integration record and access token are properly configured'));
        return true;
        
      } else if (response.statusCode === 401) {
        console.log(chalk.red.bold('❌ AUTHENTICATION FAILED'));
        console.log(chalk.yellow('🔐 This means there\'s an issue with your credentials:'));
        console.log(chalk.yellow('   • Consumer Key or Consumer Secret might be incorrect'));
        console.log(chalk.yellow('   • Token ID or Token Secret might be incorrect'));
        console.log(chalk.yellow('   • Check that the integration is enabled in NetSuite'));
        
        if (response.body) {
          console.log(chalk.gray(`\\n📄 Error details: ${response.body.substring(0, 300)}`));
        }
        return false;
        
      } else if (response.statusCode === 403) {
        console.log(chalk.yellow.bold('⚠️  AUTHENTICATION SUCCESSFUL BUT ACCESS DENIED'));
        console.log(chalk.yellow('🔒 Your credentials work, but your role lacks permissions:'));
        console.log(chalk.yellow('   • Check your NetSuite user role has REST web services permissions'));
        console.log(chalk.yellow('   • Verify the role can access SuiteQL queries'));
        console.log(chalk.yellow('   • Make sure Token-Based Authentication is allowed for your role'));
        return false;
        
      } else {
        console.log(chalk.yellow.bold(`⚠️  UNEXPECTED RESPONSE: ${response.statusCode}`));
        console.log(chalk.yellow('🤔 The API responded but with an unexpected status'));
        
        if (response.body) {
          console.log(chalk.gray(`\\n📄 Response body: ${response.body.substring(0, 500)}`));
        }
        return false;
      }

    } catch (error) {
      console.log(chalk.red.bold('❌ CONNECTION FAILED'));
      
      if (error.code === 'ENOTFOUND') {
        console.log(chalk.red('🌐 DNS resolution failed'));
        console.log(chalk.yellow('   • Check your internet connection'));
        console.log(chalk.yellow('   • Verify account ID format is correct'));
        console.log(chalk.yellow(`   • Expected hostname: ${this.credentials.accountId.replace('_', '-')}.suitetalk.api.netsuite.com`));
        
      } else if (error.message.includes('timeout')) {
        console.log(chalk.red('⏱️  Request timed out'));
        console.log(chalk.yellow('   • NetSuite servers might be slow or unreachable'));
        console.log(chalk.yellow('   • Try again in a few minutes'));
        
      } else {
        console.log(chalk.red(`🚨 Unexpected error: ${error.message}`));
      }
      
      return false;
    }
  }

  /**
   * Test a simple SuiteQL query
   */
  async testSuiteQLQuery() {
    console.log(chalk.cyan('\\n📊 Testing SuiteQL Query...'));
    console.log(chalk.gray('─'.repeat(40)));

    try {
      // Simple query to get company information
      const query = encodeURIComponent('SELECT companyname, country FROM account WHERE internalid = 1');
      const endpoint = `/services/rest/query/v1/suiteql?q=${query}`;

      console.log(chalk.yellow('📝 Running query: SELECT companyname, country FROM account WHERE internalid = 1'));
      
      const response = await this.makeNetSuiteRequest(endpoint);

      if (response.statusCode === 200 && response.json) {
        console.log(chalk.green('✅ SuiteQL query successful!'));
        
        if (response.json.items && response.json.items.length > 0) {
          const companyInfo = response.json.items[0];
          console.log(chalk.green(`   🏢 Company: ${companyInfo.companyname || 'Not available'}`));
          console.log(chalk.green(`   🌍 Country: ${companyInfo.country || 'Not available'}`));
        }
        
        console.log(chalk.gray(`   📊 Records returned: ${response.json.count || 0}`));
        return true;
        
      } else {
        console.log(chalk.yellow(`⚠️  SuiteQL query failed with status: ${response.statusCode}`));
        if (response.body) {
          console.log(chalk.gray(`   Error: ${response.body.substring(0, 200)}`));
        }
        return false;
      }

    } catch (error) {
      console.log(chalk.red(`❌ SuiteQL test failed: ${error.message}`));
      return false;
    }
  }

  /**
   * Run complete test suite
   */
  async runTests() {
    console.log(chalk.blue.bold('\\n🚀 Direct NetSuite API Integration Test'));
    console.log(chalk.blue('Testing the Integration Record & Access Token from your screenshots'));
    console.log(chalk.blue('═'.repeat(70)));

    const connectivityResult = await this.testConnectivity();
    
    if (connectivityResult) {
      console.log('\\n' + '─'.repeat(50));
      const queryResult = await this.testSuiteQLQuery();
      
      console.log('\\n' + '═'.repeat(70));
      if (queryResult) {
        console.log(chalk.green.bold('🎉 COMPLETE SUCCESS!'));
        console.log(chalk.green('✅ Your NetSuite MCP integration is 100% working'));
        console.log(chalk.green('🚀 Ready for production use with Claude Desktop'));
      } else {
        console.log(chalk.yellow.bold('✅ PARTIAL SUCCESS'));
        console.log(chalk.yellow('🔌 Basic connection works, but SuiteQL queries have permission issues'));
        console.log(chalk.yellow('💡 Check your NetSuite role permissions for SuiteQL access'));
      }
      
    } else {
      console.log('\\n' + '═'.repeat(70));
      console.log(chalk.red.bold('❌ INTEGRATION TEST FAILED'));
      console.log(chalk.red('🔧 Your NetSuite integration needs attention before MCP can work'));
    }

    return connectivityResult;
  }
}

// Main execution
async function main() {
  const tester = new DirectNetSuiteAPITest();
  
  try {
    const success = await tester.runTests();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error(chalk.red(`Test runner failed: ${error.message}`));
    process.exit(1);
  }
}

if (process.argv[1] === import.meta.url.replace('file://', '')) {
  main().catch(console.error);
}

export { DirectNetSuiteAPITest };