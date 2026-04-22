/**
 * AI Generation Modal Component
 * Two-stage modal for LM Studio content generation
 * Stage 1: Setup (prompt editing, context selection)
 * Stage 2: Results (preview, edit, insert/append)
 */

class AIGenerationModal extends HTMLElement {
    constructor() {
        super();
        this.generationType = null;
        this.characterData = null;
        this.onInsert = null;
        this.onAppend = null;
        this.stage = 'setup'; // 'setup' or 'results'
        this.selectedSections = [];
        this.systemPrompt = '';
        this.additionalInput = {};
        this.generatedContent = '';
        this.savedPrompts = {}; // User's saved custom prompts
        this.currentPromptKey = 'default'; // 'default' or custom prompt name
        this.promptFilesFromDisk = []; // .txt files in the category folder (from direct disk read)
        this.connectionStatus = 'unknown'; // 'connected', 'disconnected', 'unknown'
        this.isEdit = false; // Whether this is an edit operation
        this.currentContent = ''; // Current content being edited
    }

    connectedCallback() {
        // Set styles when connected to DOM
        this.style.display = 'none';
        this.style.position = 'fixed';
        this.style.top = '0';
        this.style.left = '0';
        this.style.width = '100%';
        this.style.height = '100%';
        this.style.zIndex = '10000';
        
        this.render();
        this.attachEventListeners();
    }

    /**
     * Open the modal
     * @param {Object} options - Modal options
     */
    open(options) {
        console.log('[AI Modal] Opening modal with options:', options);
        this.generationType = options.type;
        this.characterData = options.characterData;
        this.onInsert = options.onInsert;
        this.onAppend = options.onAppend;
        this.additionalInput = options.additionalInput || {};
        this.isEdit = options.isEdit || false;
        this.currentContent = options.currentContent || '';
        this._visibilityRefresh = () => this.handleVisibilityRefresh();
        document.addEventListener('visibilitychange', this._visibilityRefresh);
        
        console.log('[AI Modal] Loading config...');
        // Load config and check connection
        Promise.all([
            this.loadConfig(),
            this.checkConnection()
        ]).then(() => {
            console.log('[AI Modal] Config loaded, rendering setup stage');
            this.stage = 'setup';
            this.selectedSections = this.getDefaultSections();
            this.render();
            this.style.display = 'flex';
            console.log('[AI Modal] Modal should now be visible');
        }).catch(error => {
            console.error('[AI Modal] Error loading config:', error);
        });
    }

    /**
     * Close the modal
     */
    close() {
        if (this._visibilityRefresh) {
            document.removeEventListener('visibilitychange', this._visibilityRefresh);
            this._visibilityRefresh = null;
        }
        this.style.display = 'none';
        this.stage = 'setup';
        this.generatedContent = '';
    }

    /**
     * Get the prompts folder category for a generation type (e.g. exampleDialogs -> example-dialogs)
     */
    getCategoryForType(type) {
        const map = {
            description: 'description',
            personality: 'personality',
            scenario: 'scenario',
            initialMessages: 'initial-messages',
            exampleDialogs: 'example-dialogs',
            scripts: 'scripts',
            fullCharacter: 'full-character',
            bio: 'bio'
        };
        return map[type] || null;
    }

    /**
     * Get the default filename for a type (e.g. exampleDialogs -> default.txt)
     */
    getDefaultFileForType(type) {
        const map = {
            description: 'default.txt',
            personality: 'legacy.txt',
            scenario: 'default.txt',
            initialMessages: 'default.txt',
            exampleDialogs: 'default.txt',
            scripts: 'default.txt',
            fullCharacter: 'default.txt',
            bio: 'default.txt'
        };
        return map[type] || 'default.txt';
    }

    /**
     * Load configuration
     */
    async loadConfig() {
        try {
            console.log('[AI Modal] Fetching config from API...');
            const config = await window.api.lmstudio.getConfig();
            this.config = config;
            console.log('[AI Modal] Config received:', config);

            // For non-personality types: read prompt files directly from disk (never use cache)
            const category = this.getCategoryForType(this.generationType);
            this.promptFilesFromDisk = [];
            if (category && window.api?.lmstudio?.listPromptFiles) {
                try {
                    const files = await window.api.lmstudio.listPromptFiles(category);
                    this.promptFilesFromDisk = Array.isArray(files) ? files : [];
                    console.log('[AI Modal] Prompt files from disk:', category, this.promptFilesFromDisk);
                } catch (e) {
                    console.warn('[AI Modal] Could not list prompt files:', e);
                }
            }
            // Fallback: if disk read returned empty, use file keys from config (getDefaultPrompts scans disk)
            if (this.promptFilesFromDisk.length === 0 && config?.prompts) {
                const defaultFile = this.getDefaultFileForType(this.generationType);
                const prefix = this.generationType + '__';
                const fileKeys = Object.keys(config.prompts).filter(k => k.startsWith(prefix));
                const extraFiles = fileKeys.map(k => k.slice(prefix.length) + '.txt');
                const hasDefault = !!config.prompts[this.generationType];
                this.promptFilesFromDisk = hasDefault ? [defaultFile, ...extraFiles] : extraFiles;
                if (this.promptFilesFromDisk.length > 0) {
                    console.log('[AI Modal] Using prompt files from config fallback:', this.promptFilesFromDisk);
                }
            }

            if (config && config.prompts && config.prompts[this.generationType]) {
                this.systemPrompt = config.prompts[this.generationType];
                console.log('[AI Modal] Using prompt for type:', this.generationType);
                
                // Set default prompt key based on type
                if (this.generationType === 'personality') {
                    // Default to SFW for personality
                    this.currentPromptKey = 'personalitySFW';
                    if (config.prompts.personalitySFW) {
                        this.systemPrompt = config.prompts.personalitySFW;
                    }
                } else {
                    this.currentPromptKey = 'default';
                }
            } else {
                this.systemPrompt = 'Generate the requested content.';
                this.currentPromptKey = 'default';
                console.log('[AI Modal] Using default prompt');
            }
            
            // Load saved custom prompts
            this.loadSavedPrompts();
        } catch (error) {
            console.error('[AI Modal] Error loading config:', error);
            this.systemPrompt = 'Generate the requested content.';
            this.currentPromptKey = 'default';
            this.promptFilesFromDisk = [];
        }
    }

    /**
     * Check LM Studio connection
     */
    async checkConnection() {
        try {
            console.log('[AI Modal] Checking LM Studio connection...');
            const result = await window.api.lmstudio.testConnection();
            this.connectionStatus = result.success ? 'connected' : 'disconnected';
            console.log('[AI Modal] Connection status:', this.connectionStatus);
            
            // Update status indicator if modal is already rendered
            this.updateConnectionIndicator();
        } catch (error) {
            console.error('[AI Modal] Error checking connection:', error);
            this.connectionStatus = 'disconnected';
            this.updateConnectionIndicator();
        }
    }

    /**
     * Update connection indicator in the UI
     */
    updateConnectionIndicator() {
        const indicator = this.querySelector('.connection-indicator');
        const statusText = this.querySelector('.connection-status-text');
        
        if (indicator && statusText) {
            indicator.className = 'connection-indicator';
            indicator.classList.add(`status-${this.connectionStatus}`);
            
            if (this.connectionStatus === 'connected') {
                statusText.textContent = 'Connected';
            } else if (this.connectionStatus === 'disconnected') {
                statusText.textContent = 'Disconnected';
            } else {
                statusText.textContent = 'Checking...';
            }
        }
    }

    /**
     * Get default selected sections based on generation type
     */
    getDefaultSections() {
        const defaults = {
            description: ['profile'],
            personality: ['profile'],
            scenario: ['profile', 'personality'],
            initialMessages: ['profile', 'personality', 'scenario'],
            exampleDialogs: ['profile', 'personality', 'scenario', 'initialMessages'],
            scripts: ['profile', 'personality', 'scenario', 'initialMessages', 'exampleDialogs'],
            fullCharacter: [],
            bio: ['profile', 'personality', 'scenario', 'initialMessages', 'exampleDialogs']
        };
        return defaults[this.generationType] || [];
    }

    /**
     * Get available sections from character data
     */
    getAvailableSections() {
        const sections = [];
        
        // Safety check
        if (!this.characterData) {
            console.warn('[AI Modal] No character data available');
            return sections;
        }
        
        // Profile section - check both profile object and root level
        const hasProfile = this.characterData.profile?.name || this.characterData.profile?.description || 
                          this.characterData.name || this.characterData.description;
        if (hasProfile) {
            sections.push({ id: 'profile', label: 'Profile (name, description, tags)', hasContent: true });
        } else {
            sections.push({ id: 'profile', label: 'Profile (name, description, tags)', hasContent: false });
        }
        
        const personality = this.characterData.personality?.text || this.characterData.personality?.personality || this.characterData.personality;
        if (personality && typeof personality === 'string' && personality.trim()) {
            sections.push({ id: 'personality', label: 'Personality', hasContent: true });
        } else {
            sections.push({ id: 'personality', label: 'Personality', hasContent: false });
        }
        
        const scenario = this.characterData.scenario?.scenario || this.characterData.scenario?.text || this.characterData.scenario;
        if (scenario && typeof scenario === 'string' && scenario.trim()) {
            sections.push({ id: 'scenario', label: 'Scenario', hasContent: true });
        } else {
            sections.push({ id: 'scenario', label: 'Scenario', hasContent: false });
        }
        
        const initialMessages = this.characterData.initialMessages || this.characterData.scenario?.initialMessages || [];
        if (Array.isArray(initialMessages) && initialMessages.length > 0) {
            sections.push({ id: 'initialMessages', label: 'Initial Messages', hasContent: true });
        } else {
            sections.push({ id: 'initialMessages', label: 'Initial Messages', hasContent: false });
        }
        
        const exampleDialogs = this.characterData.exampleDialogs || this.characterData.dialogs || [];
        if (Array.isArray(exampleDialogs) && exampleDialogs.length > 0) {
            sections.push({ id: 'exampleDialogs', label: 'Example Dialogs', hasContent: true });
        } else {
            sections.push({ id: 'exampleDialogs', label: 'Example Dialogs', hasContent: false });
        }
        
        const scripts = this.characterData.metadata?.scripts || [];
        if (Array.isArray(scripts) && scripts.length > 0) {
            sections.push({ id: 'scripts', label: 'Scripts', hasContent: true });
        }
        
        return sections;
    }

    /**
     * Build context preview string
     */
    buildContextPreview() {
        const parts = [];
        const data = this.characterData;
        
        if (this.selectedSections.includes('profile') && data.profile) {
            if (data.profile.name) parts.push(`Name: ${data.profile.name}`);
            if (data.profile.description) parts.push(`Description: ${data.profile.description}`);
            if (data.profile.tags?.length) parts.push(`Tags: ${data.profile.tags.join(', ')}`);
        }
        
        if (this.selectedSections.includes('personality')) {
            const personality = data.personality?.text || data.personality?.personality || data.personality;
            if (personality && typeof personality === 'string') {
                parts.push(`\nPersonality:\n${personality.substring(0, 200)}${personality.length > 200 ? '...' : ''}`);
            }
        }
        
        if (this.selectedSections.includes('scenario')) {
            const scenario = data.scenario?.scenario || data.scenario?.text;
            if (scenario) {
                parts.push(`\nScenario:\n${scenario.substring(0, 200)}${scenario.length > 200 ? '...' : ''}`);
            }
        }
        
        if (this.selectedSections.includes('initialMessages')) {
            const messages = data.initialMessages || data.scenario?.initialMessages || [];
            if (messages.length > 0) {
                parts.push(`\nInitial Messages: ${messages.length} message(s)`);
            }
        }
        
        if (this.selectedSections.includes('exampleDialogs')) {
            const dialogs = data.exampleDialogs || data.dialogs || [];
            if (dialogs.length > 0) {
                parts.push(`\nExample Dialogs: ${dialogs.length} dialog(s)`);
            }
        }
        
        return parts.join('\n') || 'No context selected';
    }

    /**
     * Estimate token count (rough approximation: 1 token ≈ 4 characters)
     */
    estimateTokens(text) {
        return Math.ceil(text.length / 4);
    }

    /**
     * Get generation type display name
     */
    getTypeDisplayName() {
        const prefix = this.isEdit ? 'Edit' : 'Generate';
        
        const names = {
            description: `${prefix} Description`,
            personality: `${prefix} Personality`,
            scenario: `${prefix} Scenario`,
            initialMessages: `${prefix} Initial Message`,
            exampleDialogs: `${prefix} Example Dialogs`,
            scripts: `${prefix} Script`,
            fullCharacter: `${prefix} Full Character`,
            bio: `${prefix} Bio`
        };
        
        // Add active tab info for initial messages
        if (this.generationType === 'initialMessages' && this.additionalInput?.activeTabIndex !== undefined) {
            return `${prefix} Initial Message (Message ${this.additionalInput.activeTabIndex + 1})`;
        }
        
        return names[this.generationType] || `${prefix} Content`;
    }

    render() {
        if (this.stage === 'setup') {
            this.renderSetupStage();
        } else {
            this.renderResultsStage();
        }
    }

    renderSetupStage() {
        const availableSections = this.getAvailableSections();
        const contextPreview = this.buildContextPreview();
        const tokenEstimate = this.estimateTokens(contextPreview);
        
        this.innerHTML = `
            <div class="modal-overlay" data-action="close-overlay">
                <div class="modal ai-generation-modal" data-modal-content>
                    <div class="modal-header">
                        <div class="modal-header-left">
                            <h2>${this.getTypeDisplayName()}</h2>
                            <div class="connection-status">
                                <div class="connection-indicator status-${this.connectionStatus}"></div>
                                <span class="connection-status-text">
                                    ${this.connectionStatus === 'connected' ? 'Connected' : 
                                      this.connectionStatus === 'disconnected' ? 'Disconnected' : 'Checking...'}
                                </span>
                            </div>
                        </div>
                        <button class="icon-btn close-btn" data-action="close" title="Close">
                            <i data-feather="x"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <!-- Additional Input Fields (TOP) -->
                        ${this.renderAdditionalInputs()}
                        
                        <!-- Context Selection Section -->
                        ${this.generationType !== 'fullCharacter' ? `
                        <div class="context-selection-panel">
                            <h3>Include context from:</h3>
                            <div class="context-checkbox-group">
                                ${availableSections.map(section => `
                                    <label class="context-checkbox-item ${!section.hasContent ? 'disabled' : ''}">
                                        <input type="checkbox" 
                                               value="${section.id}" 
                                               ${this.selectedSections.includes(section.id) ? 'checked' : ''}
                                               ${!section.hasContent ? 'disabled' : ''}>
                                        <span>${section.label}</span>
                                    </label>
                                `).join('')}
                            </div>
                            
                            <details class="context-preview-details">
                                <summary>
                                    Preview Context 
                                    <span class="token-estimate">${tokenEstimate} tokens</span>
                                </summary>
                                <div class="context-preview">${window.SecurityUtils.escapeHtml(contextPreview)}</div>
                            </details>
                        </div>
                        ` : ''}
                        
                        <!-- System Prompt Section (BOTTOM) -->
                        <div class="prompt-section">
                            <div class="prompt-header">
                                <label>System Prompt:</label>
                                <div class="prompt-controls">
                                    <select id="prompt-selector" class="prompt-selector">
                                        ${this.renderPromptOptions()}
                                    </select>
                                    <button class="icon-btn" data-action="open-prompts-folder" title="Open prompts folder">
                                        <i data-feather="folder-open"></i>
                                    </button>
                                    <button class="icon-btn" data-action="refresh-prompts" title="Refresh list (check folder for new files)">
                                        <i data-feather="refresh-cw"></i>
                                    </button>
                                    <button class="icon-btn" data-action="new-prompt" title="New blank prompt">
                                        <i data-feather="file-plus"></i>
                                    </button>
                                    <button class="icon-btn" data-action="save-prompt" title="Save current prompt">
                                        <i data-feather="save"></i>
                                    </button>
                                    ${this.currentPromptKey.startsWith('custom:') ? `
                                        <button class="icon-btn" data-action="delete-prompt" title="Delete saved prompt">
                                            <i data-feather="trash-2"></i>
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                            <textarea class="ai-prompt-editor" id="system-prompt">${window.SecurityUtils.escapeHtml(this.systemPrompt)}</textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="secondary-btn" data-action="close">Cancel</button>
                        <button class="primary-btn ai-generate-btn" data-action="generate">
                            <i data-feather="zap"></i>
                            Generate
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Replace feather icons
        if (window.feather) {
            window.feather.replace();
        }
    }

    renderAdditionalInputs() {
        switch (this.generationType) {
            case 'scripts':
                return `
                    <div class="additional-inputs">
                        <h3>What do you want to generate?</h3>
                        <div class="form-group">
                            <label>Script Type:</label>
                            <select id="script-type" class="input-field">
                                <option value="Lorebook">Lorebook Entry</option>
                                <option value="Activation">Activation System</option>
                                <option value="Custom">Custom</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>Tell the AI what you want:</label>
                            <textarea id="script-description" class="input-field" rows="4" placeholder="Describe what this script should do, include any specific requirements or features...">${this.additionalInput.description || ''}</textarea>
                        </div>
                    </div>
                `;
            
            case 'initialMessages':
                const messageNum = this.additionalInput?.activeTabIndex !== undefined ? this.additionalInput.activeTabIndex + 1 : 1;
                return `
                    <div class="additional-inputs">
                        <h3>What do you want to generate?</h3>
                        ${this.additionalInput?.activeTabIndex !== undefined ? `
                            <div class="info-banner">
                                <i data-feather="info"></i>
                                <span>Generating for <strong>Message ${messageNum}</strong></span>
                            </div>
                        ` : ''}
                        
                        <div class="form-group">
                            <label>Tell the AI what you want:</label>
                            <textarea id="additional-instructions" class="input-field" rows="4" placeholder="Describe the style, tone, or specific content you want in this message...">${this.additionalInput.instructions || ''}</textarea>
                        </div>
                    </div>
                `;
            
            case 'exampleDialogs':
                return `
                    <div class="additional-inputs">
                        <h3>What do you want to generate?</h3>
                        <div class="form-group">
                            <label>Number of dialog exchanges to generate:</label>
                            <input type="number" id="dialog-count" class="input-field" min="1" max="5" value="${this.additionalInput.count || 2}">
                        </div>
                        
                        <div class="form-group">
                            <label>Tell the AI what you want:</label>
                            <textarea id="additional-instructions" class="input-field" rows="4" placeholder="Describe the conversation style, topics, or specific interactions you want...">${this.additionalInput.instructions || ''}</textarea>
                        </div>
                    </div>
                `;
            
            case 'fullCharacter':
                return `
                    <div class="additional-inputs">
                        <h3>What do you want to generate?</h3>
                        <div class="form-group">
                            <label>Tell the AI what character you want:</label>
                            <textarea id="character-concept" class="input-field" rows="6" placeholder="Describe the character you want to create. Include personality traits, appearance, background, setting, or any specific details...">${this.additionalInput.description || ''}</textarea>
                        </div>
                    </div>
                `;
            
            case 'personality':
            case 'scenario':
            case 'description':
            case 'bio':
                return `
                    <div class="additional-inputs">
                        <h3>${this.isEdit ? 'How do you want to edit this?' : 'What do you want to generate?'}</h3>
                        ${this.isEdit && this.currentContent ? `
                            <div class="current-content-preview">
                                <label>Current Content:</label>
                                <div class="content-preview-box">${window.SecurityUtils.escapeHtml(this.currentContent.substring(0, 500))}${this.currentContent.length > 500 ? '...' : ''}</div>
                            </div>
                        ` : ''}
                        <div class="form-group">
                            <label>${this.isEdit ? 'Tell the AI how to modify it:' : 'Tell the AI what you want:'}</label>
                            <textarea id="additional-instructions" class="input-field" rows="4" placeholder="${this.isEdit ? 'E.g., "Make it more playful", "Add more detail about their background", "Shorten it"...' : 'Describe any specific traits, style, tone, or details you want included...'}">${this.additionalInput.instructions || ''}</textarea>
                        </div>
                    </div>
                `;
            
            default:
                return '';
        }
    }

    renderResultsStage() {
        this.innerHTML = `
            <div class="modal-overlay" data-action="close-overlay">
                <div class="modal ai-generation-modal" data-modal-content>
                    <div class="modal-header">
                        <div class="modal-header-left">
                            <h2>${this.getTypeDisplayName()} - Results</h2>
                            <div class="connection-status">
                                <div class="connection-indicator status-${this.connectionStatus}"></div>
                                <span class="connection-status-text">
                                    ${this.connectionStatus === 'connected' ? 'Connected' : 
                                      this.connectionStatus === 'disconnected' ? 'Disconnected' : 'Checking...'}
                                </span>
                            </div>
                        </div>
                        <button class="icon-btn close-btn" data-action="close" title="Close">
                            <i data-feather="x"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        ${this.generatedContent ? `
                            <div class="generated-content-section">
                                <label>Generated Content (editable):</label>
                                <textarea class="ai-prompt-editor" id="generated-content">${window.SecurityUtils.escapeHtml(this.generatedContent)}</textarea>
                                <div class="content-stats">
                                    <span class="token-estimate">${this.estimateTokens(this.generatedContent)} tokens</span>
                                    <span>${this.generatedContent.length} characters</span>
                                </div>
                            </div>
                        ` : `
                            <div class="loading-state">
                                <div class="spinner"></div>
                                <p>Generating content with LM Studio...</p>
                                <button class="secondary-btn" data-action="cancel">Cancel</button>
                            </div>
                        `}
                    </div>
                    ${this.generatedContent ? `
                        <div class="modal-footer">
                            <button class="secondary-btn" data-action="close">Cancel</button>
                            <button class="secondary-btn" data-action="back">
                                <i data-feather="arrow-left"></i>
                                Back to Setup
                            </button>
                            <button class="secondary-btn" data-action="regenerate">
                                <i data-feather="refresh-cw"></i>
                                Regenerate
                            </button>
                            <button class="primary-btn" data-action="append">Append</button>
                            <button class="primary-btn" data-action="insert">Insert</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        // Replace feather icons
        if (window.feather) {
            window.feather.replace();
        }
        
        // If no content yet, start generation
        if (!this.generatedContent) {
            this.startGeneration();
        }
    }

    attachEventListeners() {
        this.addEventListener('click', (e) => {
            const actionElement = e.target.closest('[data-action]');
            if (!actionElement) return;
            
            const action = actionElement.dataset.action;
            
            switch (action) {
                case 'close':
                    e.preventDefault();
                    e.stopPropagation();
                    this.close();
                    break;
                case 'close-overlay':
                    // Only close if clicking directly on overlay, not on modal content
                    if (e.target.classList.contains('modal-overlay')) {
                        e.preventDefault();
                        e.stopPropagation();
                        this.close();
                    }
                    break;
                case 'generate':
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleGenerate();
                    break;
                case 'cancel':
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleCancel();
                    break;
                case 'back':
                    e.preventDefault();
                    e.stopPropagation();
                    this.stage = 'setup';
                    this.render();
                    break;
                case 'regenerate':
                    e.preventDefault();
                    e.stopPropagation();
                    this.generatedContent = '';
                    this.render();
                    break;
                case 'insert':
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleInsert();
                    break;
                case 'append':
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleAppend();
                    break;
                case 'new-prompt':
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleNewPrompt();
                    break;
                case 'save-prompt':
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleSavePrompt();
                    break;
                case 'delete-prompt':
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleDeletePrompt();
                    break;
                case 'refresh-prompts':
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleRefreshPrompts();
                    break;
                case 'open-prompts-folder':
                    e.preventDefault();
                    e.stopPropagation();
                    this.openPromptsFolder();
                    break;
            }
        });
        
        // Handle prompt selector change
        this.addEventListener('change', (e) => {
            if (e.target.id === 'prompt-selector') {
                this.handlePromptSelect(e.target.value);
            }
        });
        
        // Prevent clicks inside modal from closing it (but not on buttons with actions)
        this.addEventListener('click', (e) => {
            // Don't stop propagation if clicking on an action button
            if (e.target.closest('[data-action]')) {
                return;
            }
            // Stop propagation for other clicks inside modal to prevent closing
            if (e.target.closest('[data-modal-content]')) {
                e.stopPropagation();
            }
        }, true);
        
        // Update context preview when checkboxes change
        this.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox' && e.target.closest('.context-checkbox-group')) {
                this.updateSelectedSections();
                this.updateContextPreview();
            }
        });
    }

    updateSelectedSections() {
        const checkboxes = this.querySelectorAll('.context-checkbox-group input[type="checkbox"]:checked');
        this.selectedSections = Array.from(checkboxes).map(cb => cb.value);
    }

    updateContextPreview() {
        const preview = this.querySelector('.context-preview');
        const tokenEstimate = this.querySelector('.token-estimate');
        if (preview && tokenEstimate) {
            const contextText = this.buildContextPreview();
            preview.textContent = contextText;
            tokenEstimate.textContent = `${this.estimateTokens(contextText)} tokens`;
        }
    }

    async handleGenerate() {
        // Collect data from form
        const promptTextarea = this.querySelector('#system-prompt');
        if (promptTextarea) {
            this.systemPrompt = promptTextarea.value;
        }
        
        // Collect additional inputs
        this.collectAdditionalInputs();
        
        // If in edit mode and no instructions provided, warn user
        if (this.isEdit && !this.additionalInput.instructions?.trim()) {
            this.showNotification('Please provide instructions on how to modify the content.', 'error');
            return;
        }
        
        // Move to results stage
        this.stage = 'results';
        this.generatedContent = '';
        this.render();
    }

    collectAdditionalInputs() {
        // Collect additional instructions if present
        const additionalInstructions = this.querySelector('#additional-instructions')?.value || '';
        
        switch (this.generationType) {
            case 'scripts':
                const scriptType = this.querySelector('#script-type')?.value;
                const scriptDesc = this.querySelector('#script-description')?.value;
                this.additionalInput = {
                    scriptType: scriptType || 'Custom',
                    description: scriptDesc || '',
                    instructions: additionalInstructions
                };
                break;
            
            case 'initialMessages':
                const msgCount = this.querySelector('#message-count')?.value;
                this.additionalInput = { 
                    count: parseInt(msgCount) || 3,
                    instructions: additionalInstructions
                };
                break;
            
            case 'exampleDialogs':
                const dialogCount = this.querySelector('#dialog-count')?.value;
                this.additionalInput = { 
                    count: parseInt(dialogCount) || 2,
                    instructions: additionalInstructions
                };
                break;
            
            case 'fullCharacter':
                const concept = this.querySelector('#character-concept')?.value;
                this.additionalInput = { 
                    description: concept || '',
                    instructions: additionalInstructions
                };
                break;
            
            default:
                this.additionalInput = { instructions: additionalInstructions };
                break;
        }
    }

    async startGeneration() {
        try {
            const result = await window.api.lmstudio.generate(
                this.generationType,
                this.characterData,
                this.selectedSections,
                this.additionalInput,
                this.systemPrompt,
                this.isEdit,
                this.currentContent
            );
            
            if (result.success) {
                this.generatedContent = result.content;
                this.render();
            } else {
                this.showError(result.error || 'Generation failed');
            }
        } catch (error) {
            console.error('[AI Modal] Generation error:', error);
            this.showError(error.message || 'An error occurred during generation');
        }
    }

    async handleCancel() {
        try {
            await window.api.lmstudio.cancel();
            this.close();
        } catch (error) {
            console.error('[AI Modal] Cancel error:', error);
            this.close();
        }
    }

    handleInsert() {
        const textarea = this.querySelector('#generated-content');
        const content = textarea ? textarea.value : this.generatedContent;
        
        // Show confirmation warning
        this.showConfirmModal(
            'Overwrite Content',
            'This will replace the current content. Are you sure you want to continue?',
            () => {
                if (this.onInsert) {
                    this.onInsert(content);
                }
                this.close();
            }
        );
    }

    handleAppend() {
        const textarea = this.querySelector('#generated-content');
        const content = textarea ? textarea.value : this.generatedContent;
        
        if (this.onAppend) {
            this.onAppend(content);
        }
        this.close();
    }

    showError(message) {
        const modalBody = this.querySelector('.modal-body');
        if (modalBody) {
            modalBody.innerHTML = `
                <div class="error-state">
                    <i data-feather="alert-circle"></i>
                    <h3>Generation Failed</h3>
                    <p>${window.SecurityUtils.escapeHtml(message)}</p>
                    <button class="primary-btn" data-action="back">
                        <i data-feather="arrow-left"></i>
                        Back to Setup
                    </button>
                </div>
            `;
            if (window.feather) {
                window.feather.replace();
            }
        }
    }

    async handlePromptSelect(promptKey) {
        this.currentPromptKey = promptKey;
        
        // Check if it's a custom prompt
        if (promptKey.startsWith('custom:')) {
            const customKey = promptKey.replace('custom:', '');
            if (this.savedPrompts[customKey]) {
                this.systemPrompt = this.savedPrompts[customKey];
                const promptTextarea = this.querySelector('#system-prompt');
                if (promptTextarea) {
                    promptTextarea.value = this.systemPrompt;
                }
                return;
            }
        }
        
        // Load from file on disk (file:filename.txt)
        if (promptKey.startsWith('file:')) {
            const filename = promptKey.replace('file:', '');
            const category = this.getCategoryForType(this.generationType);
            if (category && window.api.lmstudio.loadPromptFromFile) {
                try {
                    const content = await window.api.lmstudio.loadPromptFromFile(category, filename);
                    this.systemPrompt = content || 'Generate the requested content.';
                    const promptTextarea = this.querySelector('#system-prompt');
                    if (promptTextarea) {
                        promptTextarea.value = this.systemPrompt;
                    }
                } catch (error) {
                    console.error('[AI Modal] Error loading prompt from file:', error);
                }
            }
            return;
        }
        
        // Load from config (personality variants) or from file (default for other types)
        try {
            if (promptKey === 'personalitySFW' || promptKey === 'personalityNSFW' || promptKey === 'personality') {
                const config = await window.api.lmstudio.getConfig();
                if (config?.prompts) {
                    this.systemPrompt = config.prompts[promptKey] || config.prompts[this.generationType];
                }
            } else if (promptKey === 'default') {
                // Load default from file on disk (not config cache)
                const category = this.getCategoryForType(this.generationType);
                const defaultFile = this.getDefaultFileForType(this.generationType);
                if (category && window.api.lmstudio.loadPromptFromFile) {
                    const content = await window.api.lmstudio.loadPromptFromFile(category, defaultFile);
                    this.systemPrompt = content || this.config?.prompts?.[this.generationType] || 'Generate the requested content.';
                } else {
                    this.systemPrompt = this.config?.prompts?.[this.generationType] || 'Generate the requested content.';
                }
            } else {
                const config = await window.api.lmstudio.getConfig();
                if (config?.prompts) {
                    this.systemPrompt = config.prompts[promptKey] || config.prompts[this.generationType];
                }
            }
            
            const promptTextarea = this.querySelector('#system-prompt');
            if (promptTextarea) {
                promptTextarea.value = this.systemPrompt;
            }
        } catch (error) {
            console.error('[AI Modal] Error loading prompt:', error);
        }
    }

    async handleVisibilityRefresh() {
        if (document.visibilityState !== 'visible') return;
        if (this.style.display !== 'flex' || this.stage !== 'setup') return;
        if (this.generationType === 'personality') return;
        await this.refreshPromptListFromDisk(false);
    }

    async handleRefreshPrompts() {
        await this.refreshPromptListFromDisk(true);
    }

    async openPromptsFolder() {
        try {
            const result = await window.api?.lmstudio?.openPromptsFolder?.();
            if (result && !result.success && result.error) {
                this.showNotification('Could not open folder: ' + result.error, 'error');
            }
        } catch (e) {
            this.showNotification('Could not open prompts folder', 'error');
        }
    }

    async refreshPromptListFromDisk(showNotification = false) {
        const category = this.getCategoryForType(this.generationType);
        if (!category || !window.api?.lmstudio?.listPromptFiles) return;
        try {
            const files = await window.api.lmstudio.listPromptFiles(category);
            this.promptFilesFromDisk = Array.isArray(files) ? files : [];
            const currentKey = this.currentPromptKey;
            if (currentKey.startsWith('file:')) {
                const filename = currentKey.replace('file:', '');
                if (!this.promptFilesFromDisk.includes(filename)) {
                    this.currentPromptKey = 'default';
                    const config = await window.api.lmstudio.getConfig();
                    this.systemPrompt = config?.prompts?.[this.generationType] || 'Generate the requested content.';
                }
            }
            this.render();
            if (showNotification) this.showNotification('Prompt list refreshed from folder', 'success');
        } catch (e) {
            console.warn('[AI Modal] Refresh prompts failed:', e);
            if (showNotification) this.showNotification('Could not refresh prompt list', 'error');
        }
    }

    handleNewPrompt() {
        const promptTextarea = this.querySelector('#system-prompt');
        if (!promptTextarea) return;
        
        // Check if current prompt has content
        const currentContent = promptTextarea.value.trim();
        if (currentContent) {
            this.showConfirmModal(
                'Clear Prompt',
                'Are you sure you want to clear the current prompt and start fresh?',
                () => {
                    promptTextarea.value = '';
                    promptTextarea.focus();
                    this.showNotification('Prompt cleared. Start typing your new prompt!', 'success');
                }
            );
        } else {
            // Already empty, just focus
            promptTextarea.focus();
            this.showNotification('Ready to create a new prompt!', 'info');
        }
    }

    async handleSavePrompt() {
        const promptTextarea = this.querySelector('#system-prompt');
        if (!promptTextarea) return;
        
        const currentPrompt = promptTextarea.value.trim();
        if (!currentPrompt) {
            this.showNotification('Please enter a prompt before saving.', 'error');
            return;
        }
        
        // Show custom input modal
        this.showInputModal('Save Prompt', 'Enter a name for this prompt:', async (promptName) => {
            if (!promptName || !promptName.trim()) return;
            
            const sanitizedName = promptName.trim();
            const reservedNames = ['default', 'personalitySFW', 'personalityNSFW', 'personality'];
            if (reservedNames.includes(sanitizedName)) {
                this.showNotification('Cannot use reserved prompt names.', 'error');
                return;
            }
            
            // Save to local storage as custom prompt
            this.savedPrompts[sanitizedName] = currentPrompt;
            this.currentPromptKey = `custom:${sanitizedName}`;
            
            try {
                localStorage.setItem(`lmstudio-saved-prompts-${this.generationType}`, JSON.stringify(this.savedPrompts));
                this.showNotification(`Prompt "${sanitizedName}" saved successfully!`, 'success');
                this.render();
            } catch (error) {
                console.error('[AI Modal] Error saving prompt:', error);
                this.showNotification('Failed to save prompt.', 'error');
            }
        });
    }

    async handleDeletePrompt() {
        // Can't delete file-based prompts
        if (!this.currentPromptKey.startsWith('custom:')) {
            this.showNotification('Cannot delete built-in prompts.', 'error');
            return;
        }
        
        const customKey = this.currentPromptKey.replace('custom:', '');
        
        // Show custom confirmation modal
        this.showConfirmModal(
            'Delete Prompt',
            `Are you sure you want to delete the prompt "${customKey}"?`,
            async () => {
                delete this.savedPrompts[customKey];
                this.currentPromptKey = this.generationType === 'personality' ? 'personalitySFW' : 'default';
                
                try {
                    localStorage.setItem(`lmstudio-saved-prompts-${this.generationType}`, JSON.stringify(this.savedPrompts));
                    await this.loadConfig();
                    this.showNotification('Prompt deleted successfully!', 'success');
                    this.render();
                } catch (error) {
                    console.error('[AI Modal] Error deleting prompt:', error);
                    this.showNotification('Failed to delete prompt.', 'error');
                }
            }
        );
    }

    loadSavedPrompts() {
        try {
            const saved = localStorage.getItem(`lmstudio-saved-prompts-${this.generationType}`);
            if (saved) {
                this.savedPrompts = JSON.parse(saved);
            }
        } catch (error) {
            console.error('[AI Modal] Error loading saved prompts:', error);
            this.savedPrompts = {};
        }
    }

    renderPromptOptions() {
        let options = '';
        
        // For personality type, show file-based prompt variants
        if (this.generationType === 'personality') {
            options += `
                <option value="personalitySFW" ${this.currentPromptKey === 'personalitySFW' ? 'selected' : ''}>Personality SFW</option>
                <option value="personalityNSFW" ${this.currentPromptKey === 'personalityNSFW' ? 'selected' : ''}>Personality NSFW</option>
                <option value="personality" ${this.currentPromptKey === 'personality' ? 'selected' : ''}>Personality (Legacy)</option>
            `;
        } else {
            // For other types, show all .txt files from the category folder (direct disk read)
            const filePrompts = this.getFileBasedPromptsForType();
            if (filePrompts.length > 0) {
                filePrompts.forEach(({ key, label }) => {
                    options += `<option value="${key}" ${this.currentPromptKey === key ? 'selected' : ''}>${window.SecurityUtils.escapeHtml(label)}</option>`;
                });
            } else {
                options += `<option value="default" ${this.currentPromptKey === 'default' ? 'selected' : ''}>Default Prompt</option>`;
            }
        }
        
        // Add custom saved prompts
        if (Object.keys(this.savedPrompts).length > 0) {
            options += `<optgroup label="Custom Prompts">`;
            Object.keys(this.savedPrompts).forEach(key => {
                options += `<option value="custom:${key}" ${this.currentPromptKey === `custom:${key}` ? 'selected' : ''}>${window.SecurityUtils.escapeHtml(key)}</option>`;
            });
            options += `</optgroup>`;
        }
        
        return options;
    }

    /**
     * Get file-based prompt options for current generation type
     * Uses promptFilesFromDisk (direct disk read) - not config cache
     * @returns {Array<{key: string, label: string, filename?: string}>}
     */
    getFileBasedPromptsForType() {
        const prompts = [];
        const defaultFile = this.getDefaultFileForType(this.generationType);

        if (!Array.isArray(this.promptFilesFromDisk) || this.promptFilesFromDisk.length === 0) {
            // Fallback: show default if we have config
            if (this.config?.prompts?.[this.generationType]) {
                prompts.push({ key: 'default', label: 'Default', filename: defaultFile });
            }
            return prompts;
        }

        // Build options from actual files on disk
        for (const filename of this.promptFilesFromDisk) {
            if (!filename.endsWith('.txt')) continue;
            const baseName = filename.replace(/\.txt$/, '');
            const isDefault = filename === defaultFile;
            prompts.push({
                key: isDefault ? 'default' : `file:${filename}`,
                label: isDefault ? 'Default' : baseName.replace(/_/g, ' '),
                filename
            });
        }

        return prompts;
    }

    showInputModal(title, message, onConfirm) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.zIndex = '10001';
        
        overlay.innerHTML = `
            <div class="modal" style="max-width: 400px;">
                <div class="modal-header">
                    <h2>${window.SecurityUtils.escapeHtml(title)}</h2>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 16px; color: var(--text-primary);">${window.SecurityUtils.escapeHtml(message)}</p>
                    <input type="text" id="prompt-name-input" class="input-field" placeholder="Enter name..." style="width: 100%;">
                </div>
                <div class="modal-footer">
                    <button class="secondary-btn" data-action="cancel">Cancel</button>
                    <button class="primary-btn" data-action="confirm">Save</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        const input = overlay.querySelector('#prompt-name-input');
        input.focus();
        
        const handleConfirm = () => {
            const value = input.value;
            document.body.removeChild(overlay);
            if (onConfirm) onConfirm(value);
        };
        
        const handleCancel = () => {
            document.body.removeChild(overlay);
        };
        
        overlay.querySelector('[data-action="confirm"]').addEventListener('click', handleConfirm);
        overlay.querySelector('[data-action="cancel"]').addEventListener('click', handleCancel);
        
        // Handle Enter key
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleConfirm();
            }
        });
        
        // Handle Escape key
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                handleCancel();
            }
        });
    }

    showConfirmModal(title, message, onConfirm, confirmButtonText = 'Confirm') {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.zIndex = '10001';
        
        // Determine button style based on action
        const isDestructive = title.toLowerCase().includes('delete') || title.toLowerCase().includes('overwrite');
        const buttonClass = isDestructive ? 'danger-btn' : 'primary-btn';
        
        overlay.innerHTML = `
            <div class="modal" style="max-width: 450px;">
                <div class="modal-header">
                    <h2>${window.SecurityUtils.escapeHtml(title)}</h2>
                </div>
                <div class="modal-body">
                    <p style="color: var(--text-primary); line-height: 1.6;">${window.SecurityUtils.escapeHtml(message)}</p>
                </div>
                <div class="modal-footer">
                    <button class="secondary-btn" data-action="cancel">Cancel</button>
                    <button class="${buttonClass}" data-action="confirm">${window.SecurityUtils.escapeHtml(confirmButtonText)}</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        const handleConfirm = () => {
            document.body.removeChild(overlay);
            if (onConfirm) onConfirm();
        };
        
        const handleCancel = () => {
            document.body.removeChild(overlay);
        };
        
        overlay.querySelector('[data-action="confirm"]').addEventListener('click', handleConfirm);
        overlay.querySelector('[data-action="cancel"]').addEventListener('click', handleCancel);
        
        // Handle Escape key
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                handleCancel();
            }
        });
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 16px 24px;
            background: ${type === 'success' ? 'var(--accent-success)' : type === 'error' ? 'var(--accent-danger)' : 'var(--accent-info)'};
            color: white;
            border-radius: var(--radius-sm);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 10002;
            font-weight: 600;
            animation: slideInRight 0.3s ease;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

customElements.define('ai-generation-modal', AIGenerationModal);
