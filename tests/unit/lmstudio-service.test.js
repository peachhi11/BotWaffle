const LMStudioService = require('../../src/core/lmstudio-service');

describe('LMStudioService', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('adds bearer auth header when API key is configured', () => {
    const service = new LMStudioService();
    service.config = { apiKey: 'lm_test_token' };

    expect(service._getHeaders()).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer lm_test_token',
    });
  });

  test('auto model resolution prefers loaded Qwen chat models over embeddings', async () => {
    const service = new LMStudioService();
    service.listModels = jest.fn(async () => [
      { id: 'text-embedding-nomic-embed-text-v1.5' },
      { id: 'deepseek-r1-distill-qwen-14b-uncensored' },
      { id: 'qwen/qwen3.5-9b' },
    ]);

    await expect(service._resolveGenerationModel('auto')).resolves.toBe('qwen/qwen3.5-9b');
  });

  test('Qwen requests add non-thinking switch and sampling hints', () => {
    const service = new LMStudioService();
    service.config = { temperature: 0.7, maxTokens: 2000 };

    const requestBody = service._buildRequestBody(
      'qwen/qwen3.5-9b',
      'System prompt',
      'User prompt'
    );

    expect(requestBody.messages[1].content).toContain('/no_think');
    expect(requestBody.max_tokens).toBe(8192);
    expect(requestBody.top_p).toBe(0.8);
    expect(requestBody.top_k).toBe(20);
    expect(requestBody.min_p).toBe(0);
    expect(requestBody.presence_penalty).toBe(1.5);
    expect(requestBody.repeat_penalty).toBe(1);
    expect(requestBody.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  test('generateCompletion sends Qwen non-thinking request body', async () => {
    const service = new LMStudioService();
    service.config = {
      enabled: true,
      baseUrl: 'http://localhost:1234/v1',
      model: 'qwen/qwen3.5-9b',
      temperature: 0.7,
      maxTokens: 2000,
    };

    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        model: 'qwen/qwen3.5-9b',
        choices: [{ message: { content: 'Generated content' }, finish_reason: 'stop' }],
      }),
    }));

    const result = await service.generateCompletion('System prompt', 'User prompt');

    expect(result).toEqual({ success: true, content: 'Generated content' });

    const request = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(request.model).toBe('qwen/qwen3.5-9b');
    expect(request.messages[1].content).toContain('/no_think');
    expect(request.max_tokens).toBe(8192);
    expect(request.top_p).toBe(0.8);
    expect(request.top_k).toBe(20);
    expect(request.min_p).toBe(0);
    expect(request.presence_penalty).toBe(1.5);
    expect(request.repeat_penalty).toBe(1);
    expect(request.chat_template_kwargs).toEqual({ enable_thinking: false });
  });
});
