/**
 * NetSuite REST API Client
 * Handles OAuth authentication and API calls to NetSuite
 */

import fetch from 'node-fetch';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

export class NetSuiteAPIClient {
  constructor(credentials) {
    this.credentials = credentials;
    this.baseUrl = `https://${credentials.accountId.replace('_', '-')}.suitetalk.api.netsuite.com`;
    
    // Initialize OAuth
    this.oauth = OAuth({
      consumer: {
        key: credentials.consumerKey,
        secret: credentials.consumerSecret
      },
      signature_method: 'HMAC-SHA256',
      hash_function(base_string, key) {
        return crypto
          .createHmac('sha256', key)
          .update(base_string)
          .digest('base64');
      }
    });

    this.token = {
      key: credentials.tokenId,
      secret: credentials.tokenSecret
    };

    // Rate limiting
    this.lastRequestTime = 0;
    this.minRequestInterval = 1000; // 1 second between requests
  }

  /**
   * Make authenticated request to NetSuite REST API
   */
  async makeRequest(method, endpoint, body = null) {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await this.sleep(this.minRequestInterval - timeSinceLastRequest);
    }

    const url = `${this.baseUrl}${endpoint}`;
    
    const requestData = {
      url,
      method: method.toUpperCase()
    };

    // Get OAuth headers
    const authHeaders = this.oauth.toHeader(this.oauth.authorize(requestData, this.token));

    const headers = {
      'Authorization': authHeaders.Authorization,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const options = {
      method: method.toUpperCase(),
      headers
    };

    if (body && (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    this.lastRequestTime = Date.now();

    try {
      console.error(`🌐 NetSuite API ${method.toUpperCase()} ${endpoint}`);
      
      const response = await fetch(url, options);
      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(`NetSuite API Error: ${response.status} ${response.statusText} - ${responseText}`);
      }

      try {
        return JSON.parse(responseText);
      } catch (e) {
        // If response is not JSON, return as text
        return { success: true, data: responseText };
      }
    } catch (error) {
      console.error('❌ NetSuite API request failed:', error);
      throw error;
    }
  }

  /**
   * Execute SuiteQL query
   */
  async executeSuiteQL(query, limit = 100, offset = 0) {
    const endpoint = '/services/rest/query/v1/suiteql';
    
    const body = {
      q: query,
      limit: Math.min(limit, 1000), // NetSuite max limit
      offset: offset
    };

    try {
      const result = await this.makeRequest('POST', endpoint, body);
      
      return {
        success: true,
        query,
        results: result.items || [],
        hasMore: result.hasMore || false,
        totalResults: result.totalResults || result.items?.length || 0,
        links: result.links || [],
        executionTime: Date.now()
      };
    } catch (error) {
      return {
        success: false,
        query,
        error: error.message,
        results: [],
        executionTime: Date.now()
      };
    }
  }

  /**
   * Test connection to NetSuite
   */
  async testConnection() {
    const startTime = Date.now();
    
    try {
      // Simple query to test connection
      const result = await this.executeSuiteQL('SELECT ROWNUM FROM dual WHERE ROWNUM = 1', 1);
      
      return {
        success: true,
        responseTime: Date.now() - startTime,
        account: this.credentials.accountId,
        environment: this.credentials.environment,
        timestamp: new Date().toISOString(),
        message: 'NetSuite connection successful'
      };
    } catch (error) {
      return {
        success: false,
        responseTime: Date.now() - startTime,
        account: this.credentials.accountId,
        environment: this.credentials.environment,
        timestamp: new Date().toISOString(),
        error: error.message,
        message: 'NetSuite connection failed'
      };
    }
  }

  /**
   * Get record by ID
   */
  async getRecord(recordType, id) {
    const endpoint = `/services/rest/record/v1/${recordType}/${id}`;
    
    try {
      const result = await this.makeRequest('GET', endpoint);
      return {
        success: true,
        recordType,
        id,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        recordType,
        id,
        error: error.message
      };
    }
  }

  /**
   * Search records
   */
  async searchRecords(recordType, filters = {}, fields = []) {
    const endpoint = `/services/rest/record/v1/${recordType}`;
    
    const params = new URLSearchParams();
    
    // Add fields if specified
    if (fields.length > 0) {
      params.append('fields', fields.join(','));
    }
    
    // Add filters
    Object.entries(filters).forEach(([key, value]) => {
      params.append(key, value);
    });

    const searchUrl = params.toString() ? `${endpoint}?${params}` : endpoint;

    try {
      const result = await this.makeRequest('GET', searchUrl);
      return {
        success: true,
        recordType,
        results: result.items || [result],
        count: result.count || (result.items ? result.items.length : 1)
      };
    } catch (error) {
      return {
        success: false,
        recordType,
        error: error.message,
        results: []
      };
    }
  }

  /**
   * Execute saved search
   */
  async executeSavedSearch(searchId, offset = 0, limit = 100) {
    const endpoint = `/services/rest/query/v1/suiteql`;
    
    // Use saved search via SuiteQL
    const query = `SELECT * FROM (SELECT ROWNUM as rn, s.* FROM (${searchId}) s) WHERE rn > ${offset} AND rn <= ${offset + limit}`;

    return this.executeSuiteQL(query, limit, offset);
  }

  /**
   * Get schema information for a record type
   */
  async getRecordSchema(recordType) {
    const endpoint = `/services/rest/record/v1/${recordType}/describe`;
    
    try {
      const result = await this.makeRequest('GET', endpoint);
      return {
        success: true,
        recordType,
        schema: result
      };
    } catch (error) {
      return {
        success: false,
        recordType,
        error: error.message
      };
    }
  }

  /**
   * Utility function for sleeping
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate SuiteQL query (basic validation)
   */
  validateSuiteQL(query) {
    const trimmedQuery = query.trim().toLowerCase();
    
    // Check if it's a SELECT query
    if (!trimmedQuery.startsWith('select')) {
      return {
        valid: false,
        reason: 'Only SELECT queries are supported for security'
      };
    }

    // Check for potentially dangerous operations
    const dangerousPatterns = [
      /delete\s/i,
      /drop\s/i,
      /truncate\s/i,
      /create\s/i,
      /alter\s/i,
      /insert\s/i,
      /update\s/i
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(query)) {
        return {
          valid: false,
          reason: 'Query contains potentially dangerous operations'
        };
      }
    }

    return { valid: true };
  }

  /**
   * Get common query templates
   */
  getQueryTemplates() {
    return {
      customers: {
        all: 'SELECT id, companyname, email, phone FROM customer WHERE isinactive = \'F\'',
        recent: 'SELECT id, companyname, email, datecreated FROM customer WHERE datecreated >= ADD_MONTHS(SYSDATE, -1) ORDER BY datecreated DESC',
        search: 'SELECT id, companyname, email FROM customer WHERE UPPER(companyname) LIKE UPPER(\'%{search}%\')'
      },
      items: {
        all: 'SELECT itemid, displayname, baseprice, quantityavailable FROM item WHERE isinactive = \'F\'',
        inventory: 'SELECT itemid, displayname, quantityavailable FROM item WHERE itemtype = \'InvtPart\' AND isinactive = \'F\'',
        lowStock: 'SELECT itemid, displayname, quantityavailable FROM item WHERE quantityavailable < 10 AND isinactive = \'F\''
      },
      transactions: {
        recentSalesOrders: 'SELECT tranid, trandate, entity, total FROM transaction WHERE type = \'SalesOrd\' ORDER BY trandate DESC LIMIT 25',
        recentInvoices: 'SELECT tranid, trandate, entity, total FROM transaction WHERE type = \'CustInvc\' ORDER BY trandate DESC LIMIT 25',
        monthlyRevenue: 'SELECT DATE_TRUNC(\'month\', trandate) as month, SUM(total) as revenue FROM transaction WHERE type = \'CustInvc\' GROUP BY DATE_TRUNC(\'month\', trandate) ORDER BY month DESC'
      }
    };
  }
}