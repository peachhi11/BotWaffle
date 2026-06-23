/**
 * LM Studio Service
 * Handles communication with LM Studio's OpenAI-compatible API
 * Manages generation requests with context building and prompt management
 */

const LMStudioConfig = require('./lmstudio-config');
const { getGenerationInstructions } = require('./prompts/lmstudio-prompts');
const { info, error: logError } = require('./utils/logger');

class LMStudioService {
    constructor() {
        this.configManager = new LMStudioConfig();
        this.config = null;
        this.abortController = null;
    }

    /**
     * Initialize service and load configuration
     * @returns {Promise<void>}
     */
    async initialize() {
        this.config = await this.configManager.get();
    }

    async saveConfig(config) {
        const saved = await this.configManager.save(config);
        if (saved) {
            this.config = await this.configManager.get();
        }
        return saved;
    }

    /**
     * Ensure config is loaded
     * @private
     */
    async _ensureConfig(configOverride = null) {
        if (configOverride) {
            const currentConfig = this.config || await this.configManager.get();
            this.config = {
                ...currentConfig,
                ...configOverride,
                prompts: {
                    ...(currentConfig.prompts || {}),
                    ...(configOverride.prompts || {})
                }
            };
            this.config.baseUrl = this.configManager.constructor.normalizeBaseUrl
                ? this.configManager.constructor.normalizeBaseUrl(this.config.baseUrl)
                : this.config.baseUrl;
        } else if (!this.config) {
            await this.initialize();
        }
    }

    _getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (this.config?.apiKey) {
            headers.Authorization = `Bearer ${this.config.apiKey}`;
        }
        return headers;
    }

    async _formatHttpError(response) {
        let message = response.statusText;

        try {
            const body = await response.text();
            if (body) {
                try {
                    const parsed = JSON.parse(body);
                    message = parsed.error?.message || parsed.message || body;
                } catch {
                    message = body;
                }
            }
        } catch {
            // Keep the status text fallback.
        }

        if (response.status === 401 && /api token|api key|bearer/i.test(message)) {
            return 'HTTP 401: LM Studio API token required. Add the token in AI Settings or disable authentication in LM Studio.';
        }

        return `HTTP ${response.status}: ${message || response.statusText}`;
    }

    /**
     * Test connection to LM Studio
     * @returns {Promise<{success: boolean, message: string, models?: Array}>}
     */
    async testConnection(configOverride = null) {
        try {
            await this._ensureConfig(configOverride);
            
            const response = await fetch(`${this.config.baseUrl}/models`, {
                method: 'GET',
                headers: this._getHeaders()
            });

            if (!response.ok) {
                return {
                    success: false,
                    message: await this._formatHttpError(response)
                };
            }

            const data = await response.json();
            const models = data.data || [];
            
            // Log full model data for debugging
            info('[LMStudio] Connection test - models response:', { 
                modelCount: models.length,
                models: models.map(m => ({ id: m.id, object: m.object }))
            });
            
            // Check if any models are actually loaded
            // LM Studio returns models with actual IDs when loaded, empty/null when not
            const loadedModels = models.filter(m => {
                return m.id && 
                       m.id !== 'null' && 
                       m.id !== '' && 
                       m.id !== 'undefined' &&
                       !m.id.includes('placeholder');
            });
            
            info('[LMStudio] Loaded models check:', { 
                totalModels: models.length,
                loadedCount: loadedModels.length,
                loadedIds: loadedModels.map(m => m.id)
            });
            
            if (loadedModels.length === 0 && models.length > 0) {
                // Models exist but none are loaded
                return {
                    success: false,
                    message: 'Connected to LM Studio, but no model is loaded. Please load a model in LM Studio\'s Local Server tab.',
                    models: models
                };
            } else if (models.length === 0) {
                // No models at all
                return {
                    success: false,
                    message: 'Connected to LM Studio, but no models are available. Please download a model first.',
                    models: models
                };
            }
            
            return {
                success: true,
                message: `Connected successfully. ${loadedModels.length} model(s) loaded and ready.`,
                models: models
            };
        } catch (error) {
            logError('[LMStudio] Connection test failed', error);
            return {
                success: false,
                message: error.message || 'Failed to connect to LM Studio. Is it running?'
            };
        }
    }

    /**
     * List available models
     * @returns {Promise<Array>} Array of model objects
     */
    async listModels(configOverride = null) {
        try {
            await this._ensureConfig(configOverride);
            
            const response = await fetch(`${this.config.baseUrl}/models`, {
                method: 'GET',
                headers: this._getHeaders()
            });

            if (!response.ok) {
                throw new Error(await this._formatHttpError(response));
            }

            const data = await response.json();
            return data.data || [];
        } catch (error) {
            logError('[LMStudio] Error listing models', error);
            return [];
        }
    }

    /**
     * Build context string from character data and selected sections
     * @param {Object} characterData - Full character object
     * @param {Array<string>} selectedSections - Array of section names to include
     * @returns {string} Formatted context string
     */
    buildContextString(characterData, selectedSections = []) {
        const parts = [];

        // Profile section
        if (selectedSections.includes('profile') && characterData.profile) {
            if (characterData.profile.name) {
                parts.push(`Character Name: ${characterData.profile.name}`);
            }
            if (characterData.profile.description) {
                parts.push(`Description: ${characterData.profile.description}`);
            }
            if (characterData.profile.tags && characterData.profile.tags.length > 0) {
                parts.push(`Tags: ${characterData.profile.tags.join(', ')}`);
            }
        }

        // Personality section
        if (selectedSections.includes('personality') && characterData.personality) {
            const personalityText = typeof characterData.personality === 'string' 
                ? characterData.personality 
                : characterData.personality.text || characterData.personality.personality || '';
            
            if (personalityText) {
                parts.push(`\nPersonality:\n${personalityText}`);
            }
        }

        // Scenario section
        if (selectedSections.includes('scenario') && characterData.scenario) {
            const scenarioText = characterData.scenario.scenario || characterData.scenario.text || '';
            if (scenarioText) {
                parts.push(`\nScenario:\n${scenarioText}`);
            }
        }

        // Initial Messages section
        if (selectedSections.includes('initialMessages') && characterData.initialMessages) {
            const messages = Array.isArray(characterData.initialMessages) 
                ? characterData.initialMessages 
                : characterData.scenario?.initialMessages || [];
            
            if (messages.length > 0) {
                const messageTexts = messages
                    .map(m => typeof m === 'string' ? m : m.text || '')
                    .filter(t => t)
                    .join('\n\n');
                
                if (messageTexts) {
                    parts.push(`\nInitial Messages:\n${messageTexts}`);
                }
            }
        }

        // Example Dialogs section
        if (selectedSections.includes('exampleDialogs') && characterData.exampleDialogs) {
            const dialogs = Array.isArray(characterData.exampleDialogs)
                ? characterData.exampleDialogs
                : characterData.dialogs || [];
            
            if (dialogs.length > 0) {
                const dialogTexts = dialogs
                    .map(d => typeof d === 'string' ? d : d.text || '')
                    .filter(t => t)
                    .join('\n\n');
                
                if (dialogTexts) {
                    parts.push(`\nExample Dialogs:\n${dialogTexts}`);
                }
            }
        }

        // Scripts section
        if (selectedSections.includes('scripts') && characterData.metadata?.scripts) {
            const scripts = characterData.metadata.scripts;
            if (scripts.length > 0) {
                const scriptSummary = scripts
                    .map(s => `- ${s.name || 'Unnamed'}: ${(s.content || '').substring(0, 100)}...`)
                    .join('\n');
                
                parts.push(`\nScripts:\n${scriptSummary}`);
            }
        }

        return parts.join('\n');
    }

    /**
     * Build user prompt with context and instructions
     * @param {string} type - Generation type
     * @param {string} contextString - Context from selected sections
     * @param {Object} additionalInput - Type-specific input
     * @returns {string} Complete user prompt
     */
    buildUserPrompt(type, contextString, additionalInput = {}) {
        const instructions = getGenerationInstructions(type, additionalInput);
        
        if (contextString) {
            return `${contextString}\n\n${instructions}`;
        }
        
        return instructions;
    }

    /**
     * Generate completion using LM Studio API
     * @param {string} systemPrompt - System prompt
     * @param {string} userPrompt - User prompt
     * @param {Object} options - Generation options
     * @returns {Promise<{success: boolean, content?: string, error?: string}>}
     */
    async generateCompletion(systemPrompt, userPrompt, options = {}) {
        try {
            await this._ensureConfig();

            if (!this.config.enabled) {
                return {
                    success: false,
                    error: 'LM Studio integration is disabled in settings'
                };
            }

            // Create abort controller for cancellation support
            this.abortController = new AbortController();

            const requestBody = {
                model: options.model || this.config.model || 'auto',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: options.temperature ?? this.config.temperature ?? 0.7,
                max_tokens: options.maxTokens ?? this.config.maxTokens ?? 2000
            };

            info('[LMStudio] Sending generation request', { 
                model: requestBody.model,
                temperature: requestBody.temperature,
                maxTokens: requestBody.max_tokens
            });

            const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: this._getHeaders(),
                body: JSON.stringify(requestBody),
                signal: this.abortController.signal
            });

            if (!response.ok) {
                const errorText = await this._formatHttpError(response);
                
                // Check for specific "no models loaded" error
                if (errorText.includes('No models loaded') || errorText.includes('no model loaded')) {
                    throw new Error('No model is loaded in LM Studio. Please:\n1. Open LM Studio\n2. Go to the Local Server tab\n3. Select and load a model\n4. Try again');
                }
                
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            
            // Log the full response for debugging
            info('[LMStudio] API Response:', { 
                hasChoices: !!data.choices,
                choicesLength: data.choices?.length,
                fullResponse: JSON.stringify(data).substring(0, 500)
            });
            
            const content = data.choices?.[0]?.message?.content || '';

            if (!content) {
                logError('[LMStudio] Empty response from API', { 
                    responseData: data,
                    choices: data.choices 
                });
                throw new Error('No content in response. Is a model loaded in LM Studio?');
            }

            info('[LMStudio] Generation successful', { 
                contentLength: content.length 
            });

            return {
                success: true,
                content: content
            };
        } catch (error) {
            if (error.name === 'AbortError') {
                info('[LMStudio] Generation cancelled by user');
                return {
                    success: false,
                    error: 'Generation cancelled'
                };
            }
            
            logError('[LMStudio] Generation failed', error);
            return {
                success: false,
                error: error.message || 'Generation failed'
            };
        } finally {
            this.abortController = null;
        }
    }

    /**
     * Cancel ongoing generation
     */
    cancelGeneration() {
        if (this.abortController) {
            this.abortController.abort();
            info('[LMStudio] Cancelling generation');
        }
    }

    /**
     * Main generation method
     * @param {string} type - Generation type
     * @param {Object} characterData - Full character object
     * @param {Array<string>} selectedSections - Sections to include as context
     * @param {Object} additionalInput - Type-specific input
     * @param {string} customSystemPrompt - Optional system prompt override
     * @param {boolean} isEdit - Whether this is an edit operation
     * @param {string} currentContent - Current content being edited
     * @returns {Promise<{success: boolean, content?: string, error?: string}>}
     */
    async generate(type, characterData, selectedSections = [], additionalInput = {}, customSystemPrompt = null, isEdit = false, currentContent = '') {
        try {
            await this._ensureConfig();

            // Get system prompt (custom or default)
            let systemPrompt = customSystemPrompt || this.config.prompts[type] || this.config.prompts.fullCharacter;
            
            // Modify system prompt for edit mode
            if (isEdit) {
                systemPrompt = `${systemPrompt}\n\nYou are in EDIT MODE. The user will provide existing content and instructions on how to modify it. Your task is to revise the content according to their instructions while maintaining the character's voice and style.`;
            }

            // Build context from selected sections
            const contextString = this.buildContextString(characterData, selectedSections);

            // Build user prompt with context and instructions
            let userPrompt = this.buildUserPrompt(type, contextString, additionalInput);
            
            // Add current content for edit mode
            if (isEdit && currentContent) {
                userPrompt = `CURRENT CONTENT TO EDIT:\n---\n${currentContent}\n---\n\n${userPrompt}`;
            }

            info('[LMStudio] Starting generation', {
                type,
                isEdit,
                selectedSections,
                contextLength: contextString.length,
                promptLength: userPrompt.length
            });

            // Generate completion
            return await this.generateCompletion(systemPrompt, userPrompt);
        } catch (error) {
            logError('[LMStudio] Generation error', error);
            return {
                success: false,
                error: error.message || 'Generation failed'
            };
        }
    }
}

module.exports = LMStudioService;
