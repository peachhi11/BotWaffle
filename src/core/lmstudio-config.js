/**
 * LM Studio Configuration Manager
 * Handles loading, saving, and managing LM Studio settings
 */

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { getDataPath } = require('./storage');
const { DEFAULT_PROMPTS } = require('./prompts/lmstudio-prompts');
const { PromptManager } = require('./prompts/prompt-manager');
const { info, error: logError } = require('./utils/logger');

const DEFAULT_BASE_URL = 'http://localhost:1234/v1';

function normalizeBaseUrl(baseUrl) {
    const rawUrl = typeof baseUrl === 'string' ? baseUrl.trim() : '';
    if (!rawUrl) {
        return DEFAULT_BASE_URL;
    }

    try {
        const url = new URL(rawUrl);
        url.hash = '';
        url.search = '';

        if (!url.pathname || url.pathname === '/') {
            url.pathname = '/v1';
        }

        url.pathname = url.pathname.replace(/\/+$/, '');
        return url.toString().replace(/\/+$/, '');
    } catch {
        return rawUrl.replace(/\/+$/, '');
    }
}

class LMStudioConfig {
    constructor() {
        this.configPath = path.join(getDataPath('config'), 'lmstudio.json');
        this.promptManager = new PromptManager();
        this.config = null;
    }

    /**
     * Get default configuration
     * @returns {Promise<Object>} Default config object
     */
    async getDefaultConfig() {
        // Try to load prompts from files first, fallback to code defaults
        const prompts = await this.promptManager.getDefaultPrompts(DEFAULT_PROMPTS);
        
        // Create default prompt files if they don't exist
        const hasFiles = await this.promptManager.hasPromptFiles();
        if (!hasFiles) {
            await this.promptManager.createDefaultFiles(DEFAULT_PROMPTS);
        }
        
        return {
            enabled: true,
            baseUrl: DEFAULT_BASE_URL,
            apiKey: '',
            model: 'auto',
            temperature: 0.7,
            maxTokens: 2000,
            prompts: prompts
        };
    }

    /**
     * Load configuration from file
     * @returns {Promise<Object>} Configuration object
     */
    async load() {
        try {
            // Clear prompt cache so we always read fresh from disk
            this.promptManager.clearCache?.();

            if (fs.existsSync(this.configPath)) {
                const data = await fsPromises.readFile(this.configPath, 'utf8');
                this.config = JSON.parse(data);
                
                // Merge with defaults to ensure all prompts exist
                const defaultConfig = await this.getDefaultConfig();
                this.config = {
                    ...defaultConfig,
                    ...this.config,
                    prompts: {
                        ...defaultConfig.prompts,
                        ...(this.config.prompts || {})
                    }
                };
                this.config.baseUrl = normalizeBaseUrl(this.config.baseUrl);
                
                info('[LMStudio Config] Loaded configuration');
                return this.config;
            } else {
                // Create default config
                this.config = await this.getDefaultConfig();
                await this.save();
                info('[LMStudio Config] Created default configuration');
                return this.config;
            }
        } catch (error) {
            logError('[LMStudio Config] Error loading config', error);
            this.config = await this.getDefaultConfig();
            return this.config;
        }
    }

    /**
     * Save configuration to file
     * @param {Object} config - Configuration object to save (optional, uses current if not provided)
     * @returns {Promise<boolean>} Success status
     */
    async save(config = null) {
        try {
            if (config) {
                this.config = config;
            }
            
            if (!this.config) {
                throw new Error('No configuration to save');
            }

            this.config.baseUrl = normalizeBaseUrl(this.config.baseUrl);

            // Ensure config directory exists
            const configDir = path.dirname(this.configPath);
            if (!fs.existsSync(configDir)) {
                await fsPromises.mkdir(configDir, { recursive: true });
            }

            await fsPromises.writeFile(
                this.configPath,
                JSON.stringify(this.config, null, 2),
                'utf8'
            );
            
            info('[LMStudio Config] Configuration saved');
            return true;
        } catch (error) {
            logError('[LMStudio Config] Error saving config', error);
            return false;
        }
    }

    /**
     * Get current configuration
     * Always reloads to pick up new prompt files from data/prompts folders
     * @returns {Promise<Object>} Configuration object
     */
    async get() {
        await this.load();
        return this.config;
    }

    /**
     * Update a specific prompt
     * @param {string} type - Prompt type (description, personality, etc.)
     * @param {string} prompt - New prompt text
     * @param {boolean} saveToFile - Whether to save to prompt file (default: true)
     * @returns {Promise<boolean>} Success status
     */
    async updatePrompt(type, prompt, saveToFile = true) {
        try {
            if (!this.config) {
                await this.load();
            }
            
            if (!this.config.prompts) {
                this.config.prompts = {};
            }
            
            this.config.prompts[type] = prompt;
            await this.save();
            
            // Also save to prompt file
            if (saveToFile) {
                await this.promptManager.savePrompt(type, prompt);
            }
            
            info(`[LMStudio Config] Updated ${type} prompt`);
            return true;
        } catch (error) {
            logError(`[LMStudio Config] Error updating ${type} prompt`, error);
            return false;
        }
    }

    /**
     * Reset a prompt to default
     * @param {string} type - Prompt type
     * @returns {Promise<boolean>} Success status
     */
    async resetPrompt(type) {
        try {
            if (!this.config) {
                await this.load();
            }
            
            // Reload prompt from file
            const promptFromFile = await this.promptManager.loadPrompt(type);
            if (promptFromFile) {
                this.config.prompts[type] = promptFromFile;
                await this.save();
                info(`[LMStudio Config] Reset ${type} prompt to default from file`);
                return true;
            }
            
            // Fallback to code defaults
            const defaultConfig = await this.getDefaultConfig();
            if (defaultConfig.prompts[type]) {
                this.config.prompts[type] = defaultConfig.prompts[type];
                await this.save();
                info(`[LMStudio Config] Reset ${type} prompt to default from code`);
                return true;
            }
            
            return false;
        } catch (error) {
            logError(`[LMStudio Config] Error resetting ${type} prompt`, error);
            return false;
        }
    }

    /**
     * Update configuration settings
     * @param {Object} updates - Partial config updates
     * @returns {Promise<boolean>} Success status
     */
    async update(updates) {
        try {
            if (!this.config) {
                await this.load();
            }
            
            // Merge updates with existing config
            this.config = {
                ...this.config,
                ...updates,
                // Preserve prompts unless explicitly updating them
                prompts: {
                    ...this.config.prompts,
                    ...(updates.prompts || {})
                }
            };
            
            await this.save();
            info('[LMStudio Config] Configuration updated');
            return true;
        } catch (error) {
            logError('[LMStudio Config] Error updating config', error);
            return false;
        }
    }
}

module.exports = LMStudioConfig;
module.exports.normalizeBaseUrl = normalizeBaseUrl;
