// api/app/clients/tools/structured/AIConcert.js
const { z } = require('zod');
const axios = require('axios');
const WebSocket = require('ws');
const { StructuredTool } = require('langchain/tools');
const { logger } = require('~/config');

class AIConcert extends StructuredTool {
  constructor(fields = {}) {
    super();
    this.name = 'aiconcert';
    this.apiUrl = fields.AICONCERT_API_URL || this.getApiUrl();
    this.wsUrl = fields.AICONCERT_WS_URL || this.getWsUrl();
    this.authToken = fields.AICONCERT_AUTH_TOKEN;
    this.userId = fields.userId;
    
    // WebSocket connection management
    this.wsConnection = null;
    this.wsCallbacks = new Map();
    
    // Define the schema for structured inputs
    this.schema = z.object({
      action: z.enum(['terminal', 'file', 'analyze', 'test', 'project']),
      // Common optional parameters
      command: z.string().optional(),
      path: z.string().optional(),
      operation: z.string().optional(),
      content: z.string().optional(),
      params: z.record(z.any()).optional(),
    });
    
    this.description = 'Connect to AI-Concert Server for terminal commands, file operations, code analysis, and project management.';
    
    // More detailed instructions for the model
    this.description_for_model = process.env.AICONCERT_SYSTEM_PROMPT || 
    `// AIConcert Tool: Access advanced development features
// - Execute terminal commands with \`action: "terminal", command: "ls -la"\`
// - Manage files with \`action: "file", operation: "read", path: "/path/to/file"\`
// - Analyze codebases with \`action: "analyze", path: "/path/to/codebase"\`
// - Run tests with \`action: "test", params: { repo_url: "https://github.com/repo" }\`
// - Manage projects with \`action: "project", operation: "list"\`
// Always specify the action and any required parameters for the specific operation.`;
  }

  getApiUrl() {
    const url = process.env.AICONCERT_API_URL || '';
    if (!url) {
      throw new Error('Missing AICONCERT_API_URL environment variable.');
    }
    return url;
  }

  getWsUrl() {
    const url = process.env.AICONCERT_WS_URL || '';
    if (!url) {
      throw new Error('Missing AICONCERT_WS_URL environment variable.');
    }
    return url;
  }

  async _call(data) {
    logger.debug('[AIConcert] Call with data:', data);
    const { action, command, path, operation, content, params = {} } = data;
    
    try {
      switch (action) {
        case 'terminal':
          return await this.executeCommand(command);
        case 'file':
          return await this.handleFileOperation(operation, path, content);
        case 'analyze':
          return await this.analyzeCode(path, params);
        case 'test':
          return await this.runTest(params);
        case 'project':
          return await this.manageProject(operation, params);
        default:
          return `Unknown action: ${action}. Available actions are: terminal, file, analyze, test, project.`;
      }
    } catch (error) {
      logger.error('[AIConcert] Error during execution:', error);
      return `Error executing AIConcert action: ${error.message}`;
    }
  }

  // Terminal command execution via WebSocket
  async executeCommand(command) {
    if (!command) {
      throw new Error('Missing required field: command');
    }
    
    // Get or establish WebSocket connection
    const ws = await this.getWebSocketConnection();
    
    return new Promise((resolve, reject) => {
      // Generate a unique message ID
      const messageId = Date.now().toString();
      
      // Set up callback for this command
      this.wsCallbacks.set(messageId, {
        output: [],
        complete: false,
        resolve,
        reject
      });
      
      // Send the command message
      ws.send(JSON.stringify({
        id: messageId,
        type: 'command',
        content: {
          command
        }
      }));
      
      // Set timeout for command execution
      setTimeout(() => {
        const callback = this.wsCallbacks.get(messageId);
        if (callback && !callback.complete) {
          callback.complete = true;
          this.wsCallbacks.delete(messageId);
          resolve(`Command execution timed out after 30 seconds. Partial output:\n${callback.output.join('\n')}`);
        }
      }, 30000);
    });
  }

  // File operations (read, write, list, delete)
  async handleFileOperation(operation, path, content) {
    if (!operation) {
      throw new Error('Missing required field: operation');
    }
    
    // For list operation, path is optional (defaults to current directory)
    if (!path && operation !== 'list') {
      throw new Error('Missing required field: path');
    }
    
    // Validate operation type
    const validOperations = ['read', 'write', 'list', 'delete'];
    if (!validOperations.includes(operation)) {
      throw new Error(`Invalid operation: ${operation}. Valid operations are: ${validOperations.join(', ')}`);
    }
    
    // For write operation, content is required
    if (operation === 'write' && !content) {
      throw new Error('Missing required field: content');
    }
    
    try {
      const headers = this.getAuthHeaders();
      let endpoint = `${this.apiUrl}/api/files/${operation}`;
      let data = { path };
      
      if (content && operation === 'write') {
        data.content = content;
      }
      
      const response = await axios({
        method: 'POST',
        url: endpoint,
        data,
        headers
      });
      
      if (operation === 'read' && response.data?.content) {
        return `File content for ${path}:\n\n\`\`\`\n${response.data.content}\n\`\`\``;
      } else if (operation === 'list' && response.data?.files) {
        const files = response.data.files.map(file => 
          `${file.name}${file.isDirectory ? '/' : ''} (${file.size || 'N/A'})`
        ).join('\n');
        return `Files in ${path || 'current directory'}:\n\n${files}`;
      }
      
      return `File operation '${operation}' completed successfully.`;
    } catch (error) {
      logger.error('[AIConcert] File operation error:', error);
      return `Error with file operation: ${error.message}`;
    }
  }

  // Code analysis
  async analyzeCode(path, params = {}) {
    if (!path) {
      throw new Error('Missing required field: path');
    }
    
    try {
      const headers = this.getAuthHeaders();
      
      // Start analysis
      const response = await axios.post(`${this.apiUrl}/api/analysis/start`, {
        path,
        ...params
      }, { headers });
      
      const jobId = response.data?.job_id;
      if (!jobId) {
        return `Failed to start analysis. Invalid response from server.`;
      }
      
      // Return immediate acknowledgment - analysis jobs can take a while
      return `Analysis started for ${path}. Job ID: ${jobId}\n\nThe analysis is running in the background. You can check the status later with action: "analyze", operation: "status", params: { job_id: "${jobId}" }`;
    } catch (error) {
      logger.error('[AIConcert] Analysis error:', error);
      return `Error analyzing code: ${error.message}`;
    }
  }

  // Run synthetic tests
  async runTest(params = {}) {
    if (!params.repo_url && !params.code_path) {
      throw new Error('Missing required parameters. Either repo_url or code_path must be provided.');
    }
    
    try {
      const headers = this.getAuthHeaders();
      const endpoint = params.repo_url 
        ? `${this.apiUrl}/api/testing/repository` 
        : `${this.apiUrl}/api/testing/local`;
      
      const response = await axios.post(endpoint, params, { headers });
      
      const jobId = response.data?.job_id;
      if (!jobId) {
        return `Failed to start test. Invalid response from server.`;
      }
      
      return `Test execution started. Job ID: ${jobId}\n\nThe test is running in the background. You can check the status later with action: "test", operation: "status", params: { job_id: "${jobId}" }`;
    } catch (error) {
      logger.error('[AIConcert] Test execution error:', error);
      return `Error running test: ${error.message}`;
    }
  }

  // Project management
  async manageProject(operation, params = {}) {
    if (!operation) {
      throw new Error('Missing required field: operation');
    }
    
    try {
      const headers = this.getAuthHeaders();
      let endpoint = `${this.apiUrl}/api/v2/projects`;
      let method = 'GET';
      
      switch (operation) {
        case 'create':
          method = 'POST';
          break;
        case 'update':
          if (!params.id) {
            throw new Error('Missing required parameter: id');
          }
          endpoint = `${endpoint}/${params.id}`;
          method = 'PUT';
          break;
        case 'delete':
          if (!params.id) {
            throw new Error('Missing required parameter: id');
          }
          endpoint = `${endpoint}/${params.id}`;
          method = 'DELETE';
          break;
        case 'get':
          if (!params.id) {
            throw new Error('Missing required parameter: id');
          }
          endpoint = `${endpoint}/${params.id}`;
          break;
        case 'list':
          // Default GET method is fine
          break;
        default:
          throw new Error(`Unknown project operation: ${operation}`);
      }
      
      const response = await axios({
        method,
        url: endpoint,
        data: method !== 'GET' ? params : undefined,
        params: method === 'GET' ? params : undefined,
        headers
      });
      
      if (method === 'GET' && Array.isArray(response.data)) {
        // Format project list
        return `Projects:\n\n${response.data.map(project => 
          `- ${project.name} (ID: ${project.id}): ${project.description || 'No description'}`
        ).join('\n')}`;
      }
      
      return `Project operation '${operation}' completed successfully.`;
    } catch (error) {
      logger.error('[AIConcert] Project operation error:', error);
      return `Error with project operation: ${error.message}`;
    }
  }

  // Helper methods
  getAuthHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    
    return headers;
  }

  // WebSocket connection management
  async getWebSocketConnection() {
    if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      return this.wsConnection;
    }
    
    return new Promise((resolve, reject) => {
      const wsUrl = this.authToken 
        ? `${this.wsUrl}?token=${this.authToken}` 
        : this.wsUrl;
      
      this.wsConnection = new WebSocket(wsUrl);
      
      this.wsConnection.onopen = () => {
        logger.debug('[AIConcert] WebSocket connected');
        resolve(this.wsConnection);
      };
      
      this.wsConnection.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          logger.debug('[AIConcert] WebSocket message received', message);
          
          // Handle message based on ID and type
          if (message.id && this.wsCallbacks.has(message.id)) {
            const callback = this.wsCallbacks.get(message.id);
            
            // Accumulate command output
            if (message.type === 'stdout' || message.type === 'stderr') {
              callback.output.push(message.content);
            } 
            // Handle command completion
            else if (message.type === 'system' || message.type === 'error') {
              callback.complete = true;
              this.wsCallbacks.delete(message.id);
              
              const output = callback.output.join('\n');
              callback.resolve(`${output}\n${message.content}`);
            }
          }
        } catch (error) {
          logger.error('[AIConcert] WebSocket message parsing error:', error);
        }
      };
      
      this.wsConnection.onerror = (error) => {
        logger.error('[AIConcert] WebSocket error:', error);
        reject(new Error('WebSocket connection error'));
      };
      
      this.wsConnection.onclose = () => {
        logger.debug('[AIConcert] WebSocket connection closed');
        this.wsConnection = null;
      };
    });
  }
}

module.exports = AIConcert;