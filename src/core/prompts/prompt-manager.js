/**
 * Prompt Manager
 * Manages loading and saving prompts from file system
 * Prompts are stored as .txt files in data/prompts/ with categorized subdirectories
 */

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { getDataPath } = require('../storage');
const { info, error: logError } = require('../utils/logger');

class PromptManager {
    constructor() {
        this.promptsDir = path.join(getDataPath('prompts'));
        this.cache = {}; // In-memory cache for performance
        this.initialized = false;
        
        // Map of prompt types to their file locations
        this.promptMap = {
            description: { category: 'description', file: 'default.txt' },
            personality: { category: 'personality', file: 'legacy.txt' },
            personalitySFW: { category: 'personality', file: 'sfw.txt' },
            personalityNSFW: { category: 'personality', file: 'nsfw.txt' },
            scenario: { category: 'scenario', file: 'default.txt' },
            initialMessages: { category: 'initial-messages', file: 'default.txt' },
            exampleDialogs: { category: 'example-dialogs', file: 'default.txt' },
            scripts: { category: 'scripts', file: 'default.txt' },
            fullCharacter: { category: 'full-character', file: 'default.txt' },
            bio: { category: 'bio', file: 'default.txt' }
        };
    }

    /**
     * Initialize prompt manager and ensure directory structure exists
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Ensure base prompts directory exists
            if (!fs.existsSync(this.promptsDir)) {
                await fsPromises.mkdir(this.promptsDir, { recursive: true });
            }

            // Ensure all category directories exist
            const categories = new Set(Object.values(this.promptMap).map(p => p.category));
            for (const category of categories) {
                const categoryPath = path.join(this.promptsDir, category);
                if (!fs.existsSync(categoryPath)) {
                    await fsPromises.mkdir(categoryPath, { recursive: true });
                }
            }

            this.initialized = true;
            info('[PromptManager] Initialized');
        } catch (error) {
            logError('[PromptManager] Initialization failed', error);
            throw error;
        }
    }

    /**
     * Get the file path for a prompt type
     * @param {string} type - Prompt type (e.g., 'personalitySFW')
     * @returns {string} Full file path
     */
    getPromptPath(type) {
        const mapping = this.promptMap[type];
        if (!mapping) {
            throw new Error(`Unknown prompt type: ${type}`);
        }
        return path.join(this.promptsDir, mapping.category, mapping.file);
    }

    /**
     * Load a prompt from file
     * @param {string} type - Prompt type
     * @returns {Promise<string>} Prompt content
     */
    async loadPrompt(type) {
        await this.initialize();

        // Check cache first
        if (this.cache[type]) {
            return this.cache[type];
        }

        try {
            const promptPath = this.getPromptPath(type);
            
            if (fs.existsSync(promptPath)) {
                const content = await fsPromises.readFile(promptPath, 'utf8');
                this.cache[type] = content;
                info(`[PromptManager] Loaded prompt: ${type}`);
                return content;
            } else {
                info(`[PromptManager] Prompt file not found: ${type}, will use fallback`);
                return null;
            }
        } catch (error) {
            logError(`[PromptManager] Error loading prompt: ${type}`, error);
            return null;
        }
    }

    /**
     * Save a prompt to file
     * @param {string} type - Prompt type
     * @param {string} content - Prompt content
     * @returns {Promise<boolean>} Success status
     */
    async savePrompt(type, content) {
        await this.initialize();

        try {
            const promptPath = this.getPromptPath(type);
            await fsPromises.writeFile(promptPath, content, 'utf8');
            
            // Update cache
            this.cache[type] = content;
            
            info(`[PromptManager] Saved prompt: ${type}`);
            return true;
        } catch (error) {
            logError(`[PromptManager] Error saving prompt: ${type}`, error);
            return false;
        }
    }

    /**
     * Load all prompts from files
     * @returns {Promise<Object>} Object with all prompts
     */
    async loadAllPrompts() {
        await this.initialize();

        const prompts = {};
        
        for (const type of Object.keys(this.promptMap)) {
            const content = await this.loadPrompt(type);
            if (content) {
                prompts[type] = content;
            }
        }

        info(`[PromptManager] Loaded ${Object.keys(prompts).length} prompts from files`);
        return prompts;
    }

    /**
     * Load a prompt from a specific file in a category
     * @param {string} category - Category folder (e.g. 'example-dialogs')
     * @param {string} filename - Filename (e.g. 'test.txt')
     * @returns {Promise<string|null>} Prompt content or null
     */
    async loadPromptFromFile(category, filename) {
        await this.initialize();

        try {
            const filePath = path.join(this.promptsDir, category, filename);
            if (fs.existsSync(filePath)) {
                const content = await fsPromises.readFile(filePath, 'utf8');
                return content;
            }
        } catch (error) {
            logError(`[PromptManager] Error loading ${category}/${filename}`, error);
        }
        return null;
    }

    /**
     * Get the base type for a category (e.g. 'example-dialogs' -> 'exampleDialogs')
     * @param {string} category - Category folder name
     * @returns {string|null} Base type or null
     */
    getTypeForCategory(category) {
        for (const [type, mapping] of Object.entries(this.promptMap)) {
            if (mapping.category === category) {
                return type;
            }
        }
        return null;
    }

    /**
     * Get all prompts as an object (for backward compatibility)
     * Loads from files - including ALL .txt files in each category folder
     * Falls back to defaults if files don't exist
     * @param {Object} fallbackDefaults - Default prompts to use if files don't exist
     * @returns {Promise<Object>} Object with all prompts
     */
    async getDefaultPrompts(fallbackDefaults = {}) {
        await this.initialize();

        const prompts = { ...fallbackDefaults };

        // First load the standard mapped prompts
        const standardPrompts = await this.loadAllPrompts();
        for (const [type, content] of Object.entries(standardPrompts)) {
            if (content) {
                prompts[type] = content;
            }
        }

        // Then scan each category folder for additional .txt files
        const categories = new Set(Object.values(this.promptMap).map(p => p.category));
        for (const category of categories) {
            const baseType = this.getTypeForCategory(category);
            if (!baseType) continue;

            try {
                const categoryPath = path.join(this.promptsDir, category);
                if (!fs.existsSync(categoryPath)) continue;

                const files = await fsPromises.readdir(categoryPath);
                const txtFiles = files.filter(f => f.endsWith('.txt'));

                for (const filename of txtFiles) {
                    const baseName = path.basename(filename, '.txt');
                    const mapping = this.promptMap[baseType];
                    const isDefaultFile = mapping && mapping.file === filename;

                    if (isDefaultFile) {
                        continue; // Already loaded above
                    }

                    const content = await this.loadPromptFromFile(category, filename);
                    if (content) {
                        const promptKey = `${baseType}__${baseName}`;
                        prompts[promptKey] = content;
                    }
                }
            } catch (error) {
                logError(`[PromptManager] Error scanning category ${category}`, error);
            }
        }

        return prompts;
    }

    /**
     * List all available prompt files in a category (reads directly from disk)
     * @param {string} category - Category folder name (e.g., 'example-dialogs')
     * @returns {Promise<Array<string>>} Array of .txt filenames
     */
    async listPrompts(category) {
        await this.initialize();

        try {
            const categoryPath = path.join(this.promptsDir, category);
            
            if (!fs.existsSync(categoryPath)) {
                info(`[PromptManager] Category folder not found: ${categoryPath}`);
                return [];
            }

            const files = await fsPromises.readdir(categoryPath);
            const txtFiles = files.filter(f => f.endsWith('.txt'));
            info(`[PromptManager] Listed ${category}: ${txtFiles.join(', ') || '(none)'} from ${categoryPath}`);
            return txtFiles;
        } catch (error) {
            logError(`[PromptManager] Error listing prompts in ${category}`, error);
            return [];
        }
    }

    /**
     * Check if prompt files exist
     * @returns {Promise<boolean>} True if any prompt files exist
     */
    async hasPromptFiles() {
        await this.initialize();

        try {
            const categories = new Set(Object.values(this.promptMap).map(p => p.category));
            
            for (const category of categories) {
                const categoryPath = path.join(this.promptsDir, category);
                if (fs.existsSync(categoryPath)) {
                    const files = await fsPromises.readdir(categoryPath);
                    if (files.some(f => f.endsWith('.txt'))) {
                        return true;
                    }
                }
            }
            
            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Create default prompt files from provided defaults
     * @param {Object} defaults - Default prompts object
     * @returns {Promise<boolean>} Success status
     */
    async createDefaultFiles(defaults) {
        await this.initialize();

        try {
            let created = 0;
            
            for (const [type, content] of Object.entries(defaults)) {
                if (this.promptMap[type]) {
                    const promptPath = this.getPromptPath(type);
                    
                    // Only create if doesn't exist
                    if (!fs.existsSync(promptPath)) {
                        await fsPromises.writeFile(promptPath, content, 'utf8');
                        this.cache[type] = content;
                        created++;
                    }
                }
            }

            info(`[PromptManager] Created ${created} default prompt files`);
            return true;
        } catch (error) {
            logError('[PromptManager] Error creating default files', error);
            return false;
        }
    }

    /**
     * Clear the cache (useful for reloading)
     */
    clearCache() {
        this.cache = {};
        info('[PromptManager] Cache cleared');
    }

    /**
     * Reload all prompts from files
     * @returns {Promise<Object>} Reloaded prompts
     */
    async reload() {
        this.clearCache();
        return await this.loadAllPrompts();
    }
}

module.exports = { PromptManager };
