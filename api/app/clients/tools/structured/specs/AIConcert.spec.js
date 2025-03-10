// api/app/clients/tools/structured/specs/AIConcert.spec.js
const axios = require('axios');
const WebSocket = require('ws');
const { logger } = require('~/config');
const AIConcert = require('../AIConcert');

jest.mock('axios');
jest.mock('ws');
jest.mock('~/config', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  }
}));

describe('AIConcert', () => {
  let originalEnv;
  let aiconcert;
  const mockApiUrl = 'http://localhost:8080';
  const mockWsUrl = 'ws://localhost:8080/ws';
  const mockAuthToken = 'test_auth_token';

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  beforeEach(() => {
    // Setup environment
    process.env = { 
      ...originalEnv,
      AICONCERT_API_URL: mockApiUrl,
      AICONCERT_WS_URL: mockWsUrl,
      AICONCERT_AUTH_TOKEN: mockAuthToken
    };
    
    // Initialize tool
    AIConcert = new AIConcert({
      AICONCERT_API_URL: mockApiUrl,
      AICONCERT_WS_URL: mockWsUrl,
      AICONCERT_AUTH_TOKEN: mockAuthToken
    });

    // Mock WebSocket
    WebSocket.mockImplementation(() => ({
      readyState: WebSocket.CONNECTING,
      send: jest.fn(),
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
    process.env = originalEnv;
  });

  it('should initialize with correct configuration', () => {
    expect(aiconcert.name).toBe('aiconcert');
    expect(aiconcert.apiUrl).toBe(mockApiUrl);
    expect(aiconcert.wsUrl).toBe(mockWsUrl);
    expect(aiconcert.authToken).toBe(mockAuthToken);
  });

  it('should throw an error if API URL is missing', () => {
    delete process.env.AICONCERT_API_URL;
    expect(() => new AIConcert({})).toThrow('Missing AICONCERT_API_URL environment variable.');
  });

  it('should throw an error if WebSocket URL is missing', () => {
    delete process.env.AICONCERT_WS_URL;
    process.env.AICONCERT_API_URL = mockApiUrl;
    expect(() => new AIConcert({})).toThrow('Missing AICONCERT_WS_URL environment variable.');
  });

  it('should execute terminal commands via WebSocket', async () => {
    // Create mock WebSocket behavior
    const mockWsInstance = {
      readyState: WebSocket.CONNECTING,
      send: jest.fn(),
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null
    };

    WebSocket.mockImplementation(() => mockWsInstance);
    
    // Start execution
    const commandPromise = aiconcert._call({
      action: 'terminal',
      command: 'ls -la'
    });
    
    // Simulate WebSocket connection establishment
    mockWsInstance.onopen();
    
    // Simulate messages
    mockWsInstance.onmessage({
      data: JSON.stringify({
        id: expect.any(String),
        type: 'stdout',
        content: 'total 0\ndrwxr-xr-x 2 user group 0 Mar 10 10:00 .'
      })
    });
    
    mockWsInstance.onmessage({
      data: JSON.stringify({
        id: expect.any(String),
        type: 'system',
        content: 'Command completed successfully'
      })
    });
    
    const result = await commandPromise;
    
    expect(mockWsInstance.send).toHaveBeenCalled();
    expect(result).toContain('total 0');
    expect(result).toContain('Command completed successfully');
  });

  it('should handle file read operations', async () => {
    axios.mockResolvedValueOnce({
      data: {
        content: 'File content here'
      }
    });

    const result = await aiconcert._call({
      action: 'file',
      operation: 'read',
      path: '/path/to/file.txt'
    });

    expect(axios).toHaveBeenCalledWith({
      method: 'POST',
      url: `${mockApiUrl}/api/files/read`,
      data: { path: '/path/to/file.txt' },
      headers: expect.objectContaining({
        'Authorization': `Bearer ${mockAuthToken}`
      })
    });

    expect(result).toContain('File content for /path/to/file.txt');
    expect(result).toContain('File content here');
  });

  it('should start code analysis', async () => {
    axios.mockResolvedValueOnce({
      data: {
        job_id: 'test-job-id'
      }
    });

    const result = await aiconcert._call({
      action: 'analyze',
      path: '/path/to/project'
    });

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'post',
        url: `${mockApiUrl}/api/analysis/start`,
        data: expect.objectContaining({
          path: '/path/to/project'
        })
      })
    );

    expect(result).toContain('Analysis started');
    expect(result).toContain('test-job-id');
  });

  // Add more tests for other functionalities
});