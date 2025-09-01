# RockWest NetSuite MCP Setup Guide

This guide will help you configure NetSuite MCP for RockWest Composites and start querying NetSuite data immediately.

## Prerequisites

✅ **NetSuite MCP Server**: Enhanced server with real API integration  
✅ **RockWest Project**: Located at `/home/ben/saralegui-solutions-llc/esonus/rockwest/`  
✅ **Account Information**: NetSuite account ID `7134233_SB1`  

## Step 1: Start the NetSuite MCP Server

```bash
# Start the server
mcp-ns server start

# Verify it's running
mcp-ns health
```

Expected output:
```
✅ NetSuite MCP Server initialized successfully
📋 Available tools: netsuite_setup, netsuite_list, netsuite_test, netsuite_query, netsuite_deploy, client_discover, netsuite_help, netsuite_status, netsuite_examples, netsuite_validate
📚 Available resources: netsuite://commands, netsuite://setup, netsuite://examples, netsuite://status
```

## Step 2: Configure NetSuite OAuth Credentials

### 2A. Setup OAuth in NetSuite (Sandbox)

1. **Login to NetSuite** (RockWest Sandbox account)

2. **Create Integration Application**:
   - Navigate to: **Setup > Integration > Manage Integrations**
   - Click **"New"**
   - Name: `Claude Assistant MCP - RockWest`
   - Enable: **"Token-Based Authentication"**
   - **Save** and note the **Consumer Key** and **Consumer Secret**

3. **Create Access Token**:
   - Navigate to: **Setup > Users/Roles > Access Tokens**  
   - Click **"New"**
   - Application Name: Select your integration from step 2
   - User: Select appropriate user (usually Administrator)
   - Role: Select appropriate role (usually Administrator)
   - **Save** and note the **Token ID** and **Token Secret**

### 2B. Configure MCP with Credentials

In Claude Desktop, use the `netsuite_setup` MCP tool:

```json
{
  "client_name": "rockwest",
  "account_id": "7134233_SB1", 
  "consumer_key": "your_consumer_key_here",
  "consumer_secret": "your_consumer_secret_here",
  "token_id": "your_token_id_here",
  "token_secret": "your_token_secret_here",
  "environment": "sandbox"
}
```

## Step 3: Test the Connection

Use the `netsuite_test` MCP tool to verify everything works:

```json
{
  "client_name": "rockwest"
}
```

Expected response:
```json
{
  "success": true,
  "client_name": "rockwest",
  "account": "7134233_SB1",
  "environment": "sandbox",
  "response_time": "< 2000ms",
  "message": "NetSuite connection successful"
}
```

## Step 4: Run Your First Queries

### Simple Connection Test
Use the `netsuite_query` MCP tool:

```json
{
  "client_name": "rockwest",
  "query": "SELECT ROWNUM FROM dual WHERE ROWNUM = 1"
}
```

### Get Customer Count
```json
{
  "client_name": "rockwest", 
  "query": "SELECT COUNT(*) as customer_count FROM customer WHERE isinactive = 'F'"
}
```

### List Recent Orders
```json
{
  "client_name": "rockwest",
  "query": "SELECT tranid, trandate, entity, total FROM transaction WHERE type = 'SalesOrd' ORDER BY trandate DESC LIMIT 10"
}
```

## Step 5: Use Pre-Built Query Templates

The system includes RockWest-specific query templates. Access them with the `netsuite_examples` tool:

```json
{
  "category": "queries"
}
```

### Popular RockWest Queries

**All Active Customers:**
```sql
SELECT id, companyname, email, phone, city, state 
FROM customer 
WHERE isinactive = 'F' 
ORDER BY companyname
```

**Inventory Status:**
```sql
SELECT itemid, displayname, quantityavailable, reorderpoint 
FROM item 
WHERE itemtype = 'InvtPart' AND isinactive = 'F' 
ORDER BY itemid
```

**Low Stock Alert:**
```sql
SELECT itemid, displayname, quantityavailable, reorderpoint 
FROM item 
WHERE itemtype = 'InvtPart' AND isinactive = 'F' 
AND (quantityavailable < reorderpoint OR quantityavailable < 10) 
ORDER BY quantityavailable ASC
```

**Monthly Sales Summary:**
```sql
SELECT DATE_TRUNC('month', trandate) as month, 
       COUNT(*) as order_count, 
       SUM(total) as total_sales 
FROM transaction 
WHERE type = 'SalesOrd' AND trandate >= DATE_TRUNC('year', SYSDATE) 
GROUP BY DATE_TRUNC('month', trandate) 
ORDER BY month DESC
```

## Command Line Access

You can also use command line tools for quick operations:

```bash
# Quick health check
ns-rockwest

# Check server status
ns-status

# View documentation
mcp-ns docs

# Validate your setup
mcp-ns validate
```

## Security & Best Practices

### ✅ What's Safe
- **SELECT queries only** - Read-only access protects your data
- **Automatic query validation** - Prevents destructive operations
- **Rate limiting** - Prevents API overload
- **Encrypted credentials** - Secure storage of OAuth tokens

### ⚠️ Important Limits
- **Query Limits**: Maximum 1000 results per query
- **Rate Limits**: 1 second between API calls
- **API Limits**: NetSuite enforces monthly API call limits
- **Timeout**: Queries timeout after 30 seconds

### 📊 Best Practices
- Start with small LIMIT clauses (e.g., LIMIT 10)
- Use WHERE clauses to filter data
- Test queries in sandbox before production
- Monitor your NetSuite API usage

## Troubleshooting

### Connection Issues
```bash
# Check server status
mcp-ns server status

# Restart if needed
mcp-ns server restart

# View logs
mcp-ns server logs
```

### Credential Issues
```bash
# List configured accounts
netsuite_list MCP tool

# Test specific client
netsuite_test MCP tool with client_name: "rockwest"

# Reconfigure if needed
netsuite_setup MCP tool with updated credentials
```

### Query Issues
- **Syntax Errors**: Verify SuiteQL syntax with NetSuite documentation
- **Permission Errors**: Ensure your NetSuite user has access to queried records
- **Timeout Errors**: Reduce query complexity or add more specific WHERE clauses

## Next Steps

Once basic queries are working:

1. **Explore Schema**: Use queries to discover available tables and fields
2. **Create Reports**: Build custom queries for specific business needs  
3. **Automate Workflows**: Integrate queries into business processes
4. **Custom Development**: Build SuiteScripts based on query insights

## Support & Resources

- **Built-in Help**: Use `netsuite_help` MCP tool
- **Query Examples**: Use `netsuite_examples` MCP tool  
- **System Status**: Use `netsuite_status` MCP tool
- **Validation**: Use `netsuite_validate` MCP tool

## Quick Reference

| Task | MCP Tool | Command Line |
|------|----------|--------------|
| Setup credentials | `netsuite_setup` | N/A |
| Test connection | `netsuite_test` | `ns-rockwest` |
| Run query | `netsuite_query` | N/A |
| Get help | `netsuite_help` | `mcp-ns help` |
| Check status | `netsuite_status` | `ns-status` |
| View examples | `netsuite_examples` | `mcp-ns docs` |

---

🚀 **You're ready to start querying RockWest's NetSuite data through Claude Desktop!**