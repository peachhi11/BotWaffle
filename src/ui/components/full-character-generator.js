/**
 * Full Character Generator Component
 * Multi-stage AI generation for complete character creation
 * Stages: 1) Character Info, 2) Profile, 3) Personality, 4) Scenario, 5) Initial Messages, 6) Example Dialogs
 */

class FullCharacterGenerator extends HTMLElement {
    constructor() {
        super();
        this.stage = 'input'; // 'input', 'generating', 'complete'
        this.characterConcept = '';
        this.selectedPersonalityType = 'personalitySFW'; // 'personalitySFW', 'personalityNSFW', or 'personality'
        this.customPrompts = {}; // Store custom prompts for each type
        this.generatedData = {
            profile: {},
            personality: '',
            scenario: '',
            initialMessages: [],
            exampleDialogs: '', // Changed to string - single textarea
            characterCard: {} // Add character card data
        };
        this.currentGenerationStep = 0;
        this.totalSteps = 8; // Increased to include tags, internal name, and character card info
        this.generationSteps = [
            { key: 'personality', label: 'Personality', type: 'personality', message: '✨ Crafting a unique personality...' },
            { key: 'scenario', label: 'Scenario', type: 'scenario', message: '🌍 Building their world...' },
            { key: 'initialMessages', label: 'Initial Messages', type: 'initialMessages', message: '💬 Writing opening lines...' },
            { key: 'exampleDialogs', label: 'Example Dialogs', type: 'exampleDialogs', message: '🗨️ Teaching them how to talk...' },
            { key: 'profile-description', label: 'Profile Description', type: 'description', message: '📝 Polishing their profile...' },
            { key: 'profile-name', label: 'Character Name', type: 'description', message: '🎭 Choosing the perfect name...' },
            { key: 'tags', label: 'Character Tags', type: 'description', message: '🏷️ Adding searchable tags...' },
            { key: 'internal-name', label: 'Internal Name', type: 'description', message: '🔖 Creating their ID...' }
        ];
        this.onComplete = null;
        this._boundClickHandler = null;
    }

    connectedCallback() {
        this.style.display = 'none';
        this.style.position = 'fixed';
        this.style.top = '0';
        this.style.left = '0';
        this.style.width = '100%';
        this.style.height = '100%';
        this.style.zIndex = '10000';
        this.render();
    }

    open(options) {
        this.onComplete = options.onComplete;
        this.stage = 'input';
        this.currentGenerationStep = 0;
        this.generatedData = {
            profile: {},
            personality: '',
            scenario: '',
            initialMessages: [],
            exampleDialogs: '', // Changed to string
            characterCard: {}
        };
        this._visibilityRefresh = () => this.handleVisibilityRefresh();
        document.addEventListener('visibilitychange', this._visibilityRefresh);
        this.render();
        this.style.display = 'flex';
    }

    close() {
        if (this._visibilityRefresh) {
            document.removeEventListener('visibilitychange', this._visibilityRefresh);
            this._visibilityRefresh = null;
        }
        this.style.display = 'none';
        this.stage = 'input';
        this.currentGenerationStep = 0;
    }

    async handleVisibilityRefresh() {
        if (document.visibilityState !== 'visible') return;
        if (this.style.display !== 'flex' || this.stage !== 'input') return;
        await this.renderInputStage();
    }

    render() {
        if (this.stage === 'input') {
            this.renderInputStage();
        } else if (this.stage === 'generating') {
            this.renderGeneratingStage();
        } else if (this.stage === 'complete') {
            this.renderCompleteStage();
        }
    }

    getCategoryForType(type) {
        const map = { description: 'description', scenario: 'scenario', initialMessages: 'initial-messages', exampleDialogs: 'example-dialogs', scripts: 'scripts', fullCharacter: 'full-character', bio: 'bio' };
        return map[type] || null;
    }

    getDefaultFileForType(type) {
        const map = { description: 'default.txt', scenario: 'default.txt', initialMessages: 'default.txt', exampleDialogs: 'default.txt', scripts: 'default.txt', fullCharacter: 'default.txt', bio: 'default.txt' };
        return map[type] || 'default.txt';
    }

    async renderInputStage() {
        // Load default prompts and file lists from disk
        const config = await window.api.lmstudio.getConfig();
        const defaultPrompts = config.prompts || {};
        const promptFilesByType = {};
        const typesWithFiles = ['scenario', 'initialMessages', 'exampleDialogs', 'description'];
        for (const type of typesWithFiles) {
            const category = this.getCategoryForType(type);
            if (category && window.api?.lmstudio?.listPromptFiles) {
                try {
                    promptFilesByType[type] = await window.api.lmstudio.listPromptFiles(category) || [];
                } catch (e) {
                    promptFilesByType[type] = [];
                }
            } else {
                promptFilesByType[type] = [];
            }
        }

        this.innerHTML = `
            <div class="modal-overlay">
                <div class="modal full-char-gen-modal" data-modal-content>
                    <div class="modal-header">
                        <div class="modal-header-left">
                            <h2>Generate Full Character with AI</h2>
                        </div>
                        <button class="icon-btn close-btn" data-action="close" title="Close">
                            <i data-feather="x"></i>
                        </button>
                    </div>
                    <div class="modal-body full-char-gen-body">
                        <div class="full-char-gen-layout">
                            <div class="full-char-gen-left">
                                <h3>1. Character Concept</h3>
                                <p class="full-char-gen-hint">Describe the character. The AI generates profile, personality, scenario, initial messages, and example dialogs.</p>
                                <textarea id="character-concept" class="input-field full-char-concept-input" rows="8" 
                                    placeholder="Example: A cheerful barista named Luna who works at a cozy coffee shop. She's bubbly, loves making latte art, and always remembers her regulars' orders...">${window.SecurityUtils.escapeHtml(this.characterConcept)}</textarea>
                            </div>
                            <div class="full-char-gen-right">
                                <details class="full-char-prompts-details" id="prompts-details" open>
                                    <summary>2. Customize AI Prompts (Optional)</summary>
                                    <div class="full-char-prompts-actions">
                                        <p class="full-char-gen-hint">Leave blank to use defaults. Add .txt files to the prompts folder for new prompts.</p>
                                        <button class="secondary-btn btn-sm" data-action="open-prompts-folder" title="Open prompts folder to add .txt files">
                                            <i data-feather="folder-open"></i>
                                            Open Prompts Folder
                                        </button>
                                        <button class="primary-btn btn-sm" data-action="refresh-prompts" title="Refresh list after adding or removing files">
                                            <i data-feather="refresh-cw"></i>
                                            Refresh
                                        </button>
                                    </div>
                                    <div class="full-char-prompts-grid">
                                        ${this.renderPromptConfigSectionWithTypes('personality', 'Personality', defaultPrompts)}
                                        ${this.renderPromptConfigSection('scenario', 'Scenario', defaultPrompts.scenario, promptFilesByType.scenario || [])}
                                        ${this.renderPromptConfigSection('initialMessages', 'Initial Messages', defaultPrompts.initialMessages, promptFilesByType.initialMessages || [])}
                                        ${this.renderPromptConfigSection('exampleDialogs', 'Example Dialogs', defaultPrompts.exampleDialogs, promptFilesByType.exampleDialogs || [])}
                                        ${this.renderPromptConfigSection('description', 'Descriptions (Name, Tags)', defaultPrompts.description, promptFilesByType.description || [])}
                                    </div>
                                </details>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="secondary-btn" data-action="close">Cancel</button>
                        <button class="primary-btn" data-action="start-generation">
                            <i data-feather="zap"></i>
                            Start Generation
                        </button>
                    </div>
                </div>
            </div>
        `;

        if (window.feather) {
            window.feather.replace();
        }

        this.attachEventListeners();
    }


    renderPromptConfigSection(type, label, defaultPrompt, promptFilesFromDisk = []) {
        const currentPrompt = this.customPrompts[type] || '';
        const savedPrompts = this.loadSavedPrompts(type);
        const defaultFile = this.getDefaultFileForType(type);
        
        // Build dropdown: file-based prompts from disk + custom saved prompts
        let promptOptions = '<option value="">Use Default Prompt</option>';
        if (Array.isArray(promptFilesFromDisk) && promptFilesFromDisk.length > 0) {
            promptFilesFromDisk.forEach(filename => {
                if (!filename.endsWith('.txt')) return;
                const baseName = filename.replace(/\.txt$/, '');
                const isDefault = filename === defaultFile;
                const label2 = isDefault ? 'Default' : baseName.replace(/_/g, ' ');
                promptOptions += `<option value="file:${window.SecurityUtils.escapeHtml(filename)}">${window.SecurityUtils.escapeHtml(label2)}</option>`;
            });
        }
        if (savedPrompts.length > 0) {
            promptOptions += '<optgroup label="Custom">';
            savedPrompts.forEach(promptName => {
                promptOptions += `<option value="custom:${window.SecurityUtils.escapeHtml(promptName)}">${window.SecurityUtils.escapeHtml(promptName)}</option>`;
            });
            promptOptions += '</optgroup>';
        }
        
        return `
            <div class="prompt-config-section full-char-prompt-section">
                <div class="prompt-config-header">
                    <span class="prompt-config-label">${label}</span>
                    <div class="prompt-controls">
                        <select class="prompt-selector" data-type="${type}">
                            ${promptOptions}
                        </select>
                        <button class="icon-btn btn-sm" data-action="new-prompt" data-type="${type}" title="Clear prompt">
                            <i data-feather="file-plus"></i>
                        </button>
                        <button class="icon-btn btn-sm" data-action="save-prompt" data-type="${type}" title="Save prompt">
                            <i data-feather="save"></i>
                        </button>
                        <button class="icon-btn btn-sm" data-action="delete-prompt" data-type="${type}" title="Delete prompt">
                            <i data-feather="trash-2"></i>
                        </button>
                    </div>
                </div>
                <textarea 
                    class="input-field prompt-config-textarea" 
                    data-type="${type}"
                    rows="2"
                    placeholder="${window.SecurityUtils.escapeHtml(defaultPrompt)}">${window.SecurityUtils.escapeHtml(currentPrompt)}</textarea>
            </div>
        `;
    }

    renderPromptConfigSectionWithTypes(type, label, defaultPrompts) {
        const currentPrompt = this.customPrompts[type] || '';
        const savedPrompts = this.loadSavedPrompts(type);
        
        // Build dropdown with default prompt types AND saved custom prompts
        let promptOptions = '<optgroup label="Default Prompts">';
        promptOptions += '<option value="personalitySFW">Personality SFW (Janitor AI)</option>';
        promptOptions += '<option value="personalityNSFW">Personality NSFW (Janitor AI)</option>';
        promptOptions += '<option value="personality">Personality (Legacy)</option>';
        promptOptions += '</optgroup>';
        
        if (savedPrompts.length > 0) {
            promptOptions += '<optgroup label="Custom Prompts">';
            savedPrompts.forEach(promptName => {
                promptOptions += `<option value="custom:${window.SecurityUtils.escapeHtml(promptName)}">${window.SecurityUtils.escapeHtml(promptName)}</option>`;
            });
            promptOptions += '</optgroup>';
        }
        
        // Determine which prompt to show based on selection
        const selectedPromptType = this.selectedPersonalityType || 'personalitySFW';
        const displayPrompt = defaultPrompts[selectedPromptType] || defaultPrompts.personalitySFW;
        
        return `
            <div class="prompt-config-section full-char-prompt-section">
                <div class="prompt-config-header">
                    <span class="prompt-config-label">${label}</span>
                    <div class="prompt-controls">
                        <select class="prompt-type-selector" data-type="${type}" id="personality-type-selector">
                            ${promptOptions}
                        </select>
                        <button class="icon-btn btn-sm" data-action="new-prompt" data-type="${type}" title="Clear prompt">
                            <i data-feather="file-plus"></i>
                        </button>
                        <button class="icon-btn btn-sm" data-action="save-prompt" data-type="${type}" title="Save prompt">
                            <i data-feather="save"></i>
                        </button>
                        <button class="icon-btn btn-sm" data-action="delete-prompt" data-type="${type}" title="Delete prompt">
                            <i data-feather="trash-2"></i>
                        </button>
                    </div>
                </div>
                <textarea 
                    class="input-field prompt-config-textarea" 
                    data-type="${type}"
                    rows="2"
                    placeholder="${window.SecurityUtils.escapeHtml(displayPrompt)}">${window.SecurityUtils.escapeHtml(currentPrompt)}</textarea>
            </div>
        `;
    }

    loadSavedPrompts(type) {
        try {
            const saved = localStorage.getItem(`lmstudio_custom_prompts_${type}`);
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error('[Full Character Generator] Error loading saved prompts:', error);
            return [];
        }
    }

    getSavedPrompt(type, name) {
        try {
            const key = `lmstudio_prompt_${type}_${name}`;
            return localStorage.getItem(key) || '';
        } catch (error) {
            console.error('[Full Character Generator] Error getting saved prompt:', error);
            return '';
        }
    }

    saveCustomPrompt(type, name, content) {
        try {
            // Save the prompt content
            const key = `lmstudio_prompt_${type}_${name}`;
            localStorage.setItem(key, content);

            // Add to the list of saved prompts for this type
            const saved = this.loadSavedPrompts(type);
            if (!saved.includes(name)) {
                saved.push(name);
                localStorage.setItem(`lmstudio_custom_prompts_${type}`, JSON.stringify(saved));
            }
        } catch (error) {
            console.error('[Full Character Generator] Error saving prompt:', error);
        }
    }

    deleteCustomPrompt(type, name) {
        try {
            // Remove the prompt content
            const key = `lmstudio_prompt_${type}_${name}`;
            localStorage.removeItem(key);

            // Remove from the list
            const saved = this.loadSavedPrompts(type);
            const filtered = saved.filter(n => n !== name);
            localStorage.setItem(`lmstudio_custom_prompts_${type}`, JSON.stringify(filtered));
        } catch (error) {
            console.error('[Full Character Generator] Error deleting prompt:', error);
        }
    }

    renderGeneratingStage() {
        // Ensure we don't go beyond array bounds
        const stepIndex = Math.min(this.currentGenerationStep, this.generationSteps.length - 1);
        const currentStep = this.generationSteps[stepIndex];
        const progress = Math.round((this.currentGenerationStep / this.totalSteps) * 100);

        this.innerHTML = `
            <div class="modal-overlay">
                <div class="modal ai-generation-modal" data-modal-content style="max-width: 900px;">
                    <div class="modal-header">
                        <div class="modal-header-left">
                            <h2>Generating Full Character</h2>
                        </div>
                    </div>
                    <div class="modal-body">
                        <div class="generation-progress">
                            <div class="progress-header">
                                <h3>Creating your character...</h3>
                                <span class="progress-text">${this.currentGenerationStep} of ${this.totalSteps} steps</span>
                            </div>
                            
                            <div class="progress-bar-container">
                                <div class="progress-bar" style="width: ${progress}%"></div>
                            </div>
                            
                            <div class="current-step">
                                <div class="spinner"></div>
                                <p>${currentStep.message || `Generating: ${currentStep.label}`}</p>
                            </div>
                            
                            <div class="completed-steps">
                                ${this.generationSteps.map((step, index) => {
                                    if (index < this.currentGenerationStep) {
                                        return `
                                            <div class="step-item completed">
                                                <i data-feather="check-circle"></i>
                                                <span>${step.label}</span>
                                            </div>
                                        `;
                                    } else if (index === this.currentGenerationStep) {
                                        return `
                                            <div class="step-item active">
                                                <div class="step-spinner"></div>
                                                <span>${step.label}</span>
                                            </div>
                                        `;
                                    } else {
                                        return `
                                            <div class="step-item pending">
                                                <i data-feather="circle"></i>
                                                <span>${step.label}</span>
                                            </div>
                                        `;
                                    }
                                }).join('')}
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="secondary-btn" data-action="cancel">Cancel Generation</button>
                    </div>
                </div>
            </div>
        `;

        if (window.feather) {
            window.feather.replace();
        }

        this.attachEventListeners();
    }

    renderCompleteStage() {
        this.innerHTML = `
            <div class="modal-overlay">
                <div class="modal ai-generation-modal" data-modal-content style="max-width: 900px;">
                    <div class="modal-header">
                        <div class="modal-header-left">
                            <h2>Character Generated Successfully!</h2>
                        </div>
                        <button class="icon-btn close-btn" data-action="close" title="Close">
                            <i data-feather="x"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="success-message">
                            <i data-feather="check-circle" style="width: 48px; height: 48px; color: var(--accent-success);"></i>
                            <h3>Your character is ready!</h3>
                            <p>All sections have been generated and populated. You can now review and edit as needed.</p>
                            
                            <div class="generated-summary">
                                <h4>Generated:</h4>
                                <ul>
                                    <li><i data-feather="check"></i> Character Card Info (Name, Tags, Description)</li>
                                    <li><i data-feather="check"></i> Personality</li>
                                    <li><i data-feather="check"></i> Scenario</li>
                                    <li><i data-feather="check"></i> ${this.generatedData.initialMessages.length} Initial Messages</li>
                                    <li><i data-feather="check"></i> Example Dialog Exchanges</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="primary-btn" data-action="close">
                            <i data-feather="check"></i>
                            Done
                        </button>
                    </div>
                </div>
            </div>
        `;

        if (window.feather) {
            window.feather.replace();
        }

        this.attachEventListeners();

        requestAnimationFrame(() => {
            const conceptInput = this.querySelector('#character-concept');
            if (conceptInput) conceptInput.focus();
        });
    }

    attachEventListeners() {
        if (this._boundClickHandler) {
            this.removeEventListener('click', this._boundClickHandler);
        }
        this._boundClickHandler = (e) => {
            const actionElement = e.target.closest('[data-action]');
            if (!actionElement) return;
            if (e.target.matches('input, textarea, select, [contenteditable="true"]')) return;

            const action = actionElement.dataset.action;
            e.preventDefault();
            e.stopPropagation();

            switch (action) {
                case 'close':
                    this.close();
                    break;
                case 'start-generation':
                    this.startFullGeneration();
                    break;
                case 'new-prompt':
                    this.handleNewPrompt(actionElement.dataset.type);
                    break;
                case 'save-prompt':
                    this.handleSavePrompt(actionElement.dataset.type);
                    break;
                case 'delete-prompt':
                    this.handleDeletePrompt(actionElement.dataset.type);
                    break;
                case 'open-prompts-folder':
                    this.openPromptsFolder();
                    break;
                case 'refresh-prompts':
                    this.handleRefreshPrompts();
                    break;
                case 'reset-prompt':
                    this.resetPrompt(actionElement.dataset.type);
                    break;
                case 'cancel':
                    this.cancelGeneration();
                    break;
            }
        };
        this.addEventListener('click', this._boundClickHandler);

        // Handle personality type selector changes
        const personalityTypeSelector = this.querySelector('#personality-type-selector');
        if (personalityTypeSelector) {
            personalityTypeSelector.addEventListener('change', async (e) => {
                const value = e.target.value;
                if (value.startsWith('custom:')) {
                    // Load custom prompt
                    const promptName = value.replace('custom:', '');
                    const customPrompt = this.getSavedPrompt('personality', promptName);
                    this.customPrompts['personality'] = customPrompt;
                    const textarea = this.querySelector('textarea[data-type="personality"]');
                    if (textarea) {
                        textarea.value = customPrompt;
                    }
                } else {
                    // Use default prompt type
                    this.selectedPersonalityType = value;
                    this.customPrompts['personality'] = ''; // Clear custom
                    await this.updatePersonalityPromptDisplay();
                }
            });
        }

        // Handle prompt selector changes
        const promptSelectors = this.querySelectorAll('.prompt-selector');
        promptSelectors.forEach(selector => {
            selector.addEventListener('change', (e) => {
                const type = e.target.dataset.type;
                const promptName = e.target.value;
                this.handlePromptSelect(type, promptName);
            });
        });

        // Save custom prompts when textareas change
        const promptTextareas = this.querySelectorAll('.prompt-config-textarea');
        promptTextareas.forEach(textarea => {
            textarea.addEventListener('input', (e) => {
                const type = e.target.dataset.type;
                this.customPrompts[type] = e.target.value.trim();
            });
        });
    }

    async handlePromptSelect(type, promptName) {
        const textarea = this.querySelector(`textarea[data-type="${type}"]`);
        if (!textarea) return;

        if (!promptName) {
            textarea.value = '';
            this.customPrompts[type] = '';
            return;
        }

        if (promptName.startsWith('file:')) {
            const filename = promptName.replace('file:', '');
            const category = this.getCategoryForType(type);
            if (category && window.api?.lmstudio?.loadPromptFromFile) {
                try {
                    const content = await window.api.lmstudio.loadPromptFromFile(category, filename);
                    textarea.value = content || '';
                    this.customPrompts[type] = content || '';
                } catch (e) {
                    console.warn('[Full Char Gen] Could not load prompt from file:', e);
                }
            }
            return;
        }

        if (promptName.startsWith('custom:')) {
            const name = promptName.replace('custom:', '');
            const content = this.getSavedPrompt(type, name);
            textarea.value = content;
            this.customPrompts[type] = content;
            return;
        }

        // Legacy: plain prompt name (custom prompt)
        const content = this.getSavedPrompt(type, promptName);
        textarea.value = content;
        this.customPrompts[type] = content;
    }

    handleNewPrompt(type) {
        const textarea = this.querySelector(`textarea[data-type="${type}"]`);
        const selector = this.querySelector(`select[data-type="${type}"]`);
        
        if (textarea) {
            if (textarea.value.trim() && !confirm('Clear the current prompt?')) {
                return;
            }
            textarea.value = '';
            this.customPrompts[type] = '';
        }
        
        if (selector) {
            selector.value = '';
        }
    }

    handleSavePrompt(type) {
        const textarea = this.querySelector(`textarea[data-type="${type}"]`);
        if (!textarea) return;

        const content = textarea.value.trim();
        if (!content) {
            this.showNotification('Please enter a prompt before saving', 'warning');
            return;
        }

        this.showInputModal(
            'Save Custom Prompt',
            'Enter a name for this prompt:',
            (name) => {
                if (name) {
                    this.saveCustomPrompt(type, name, content);
                    this.showNotification(`Prompt "${name}" saved successfully`, 'success');
                    // Re-render to update dropdown
                    this.render();
                }
            }
        );
    }

    handleDeletePrompt(type) {
        const selector = this.querySelector(`select[data-type="${type}"]`);
        if (!selector) return;

        const promptName = selector.value;
        if (!promptName) {
            this.showNotification('Please select a saved prompt to delete', 'warning');
            return;
        }

        this.showConfirmModal(
            'Delete Prompt',
            `Are you sure you want to delete the prompt "${promptName}"?`,
            () => {
                this.deleteCustomPrompt(type, promptName);
                this.showNotification(`Prompt "${promptName}" deleted`, 'success');
                // Re-render to update dropdown
                this.render();
            },
            'Delete'
        );
    }

    async updatePersonalityPromptDisplay() {
        // Reload config to get the correct personality prompt
        const config = await window.api.lmstudio.getConfig();
        const defaultPrompts = config.prompts || {};
        
        // Get the correct personality prompt based on selected type
        const personalityPrompt = defaultPrompts[this.selectedPersonalityType] || defaultPrompts.personalitySFW;
        
        // Update the personality textarea placeholder
        const personalityTextarea = this.querySelector('textarea[data-type="personality"]');
        if (personalityTextarea) {
            personalityTextarea.placeholder = personalityPrompt || '';
            if (!this.customPrompts['personality']) {
                personalityTextarea.value = '';
            }
        }
    }

    resetPrompt(type) {
        this.customPrompts[type] = '';
        const textarea = this.querySelector(`textarea[data-type="${type}"]`);
        if (textarea) {
            textarea.value = '';
        }
    }

    async openPromptsFolder() {
        try {
            const result = await window.api.lmstudio.openPromptsFolder();
            if (result && !result.success && result.error) {
                this.showNotification('Failed to open folder: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('[Full Character Generator] Error opening prompts folder:', error);
            this.showNotification('Failed to open prompts folder.', 'error');
        }
    }

    async handleRefreshPrompts() {
        if (this.stage !== 'input') return;
        await this.renderInputStage();
        this.showNotification('Prompt list refreshed from folder', 'success');
    }

    async startFullGeneration() {
        // Get character concept from textarea
        const conceptTextarea = this.querySelector('#character-concept');
        if (!conceptTextarea) return;

        this.characterConcept = conceptTextarea.value.trim();
        if (!this.characterConcept) {
            alert('Please describe the character you want to create.');
            return;
        }

        this.stage = 'generating';
        this.currentGenerationStep = 0;
        this.render();

        // Start generating each section
        await this.generateAllSections();
    }

    async generateAllSections() {
        try {
            // Step 1: Generate Personality FIRST (so we know the character)
            // Use the selected personality type
            await this.generateStep('personality', this.selectedPersonalityType, {
                instructions: this.characterConcept
            });

            // Step 2: Generate Scenario
            await this.generateStep('scenario', 'scenario', {
                instructions: this.characterConcept
            });

            // Step 3: Generate Initial Messages (3 messages)
            await this.generateStep('initialMessages', 'initialMessages', {
                count: 3,
                instructions: this.characterConcept
            });

            // Step 4: Generate Example Dialogs (template-slots based on personality)
            await this.generateStep('exampleDialogs', 'exampleDialogs', {
                instructions: `Character concept: ${this.characterConcept}

PERSONALITY SECTION TO ANALYZE:
${this.generatedData.personality}

Generate template-slots in the exact 3-state format (Calm/Default, Stressed/Defensive, Vulnerable/Soft) that match this character's unique traits, voice patterns, and behavioral patterns.`
            });

            // Step 5: Generate Profile Description (now that we have all context)
            await this.generateStep('profile-description', 'description', {
                instructions: `Based on this character's personality and scenario, write a compelling 2-3 sentence profile description. Just the description, no labels: ${this.characterConcept}`
            });

            // Step 6: Generate Character Name (AFTER personality, so it matches)
            await this.generateStep('profile-name', 'description', {
                instructions: `Based on this character concept and personality, output ONLY the character's name. No explanations, no extra text, just the name.

Character concept: ${this.characterConcept}
Personality: ${this.generatedData.personality.substring(0, 300)}`
            });

            // Step 7: Generate Tags (based on all generated content including name)
            await this.generateStep('tags', 'description', {
                instructions: `Character: ${this.generatedData.profile.displayName}
Personality: ${this.generatedData.personality.substring(0, 300)}
Scenario: ${this.generatedData.scenario.substring(0, 200)}

Generate 10-15 simple searchable tags (1-2 words each, lowercase).

Categories to cover:
- Personality traits: friendly, shy, brave, kind, confident
- Role/occupation: barista, warrior, student, teacher
- Setting/theme: fantasy, modern, scifi, medieval
- Key characteristics: helpful, funny, smart, sarcastic
- Physical traits: tall, athletic, strong (if mentioned)
- Interests/hobbies: artist, gamer, reader, cook (if mentioned)

Output format: tag1, tag2, tag3, tag4, tag5, tag6, tag7, tag8, tag9, tag10, tag11, tag12
Keep it SIMPLE. Use hyphens ONLY for common phrases (sci-fi, coffee-shop).
Do not write sentences. Only output the comma-separated tags.`
            });

            // Step 8: Generate Internal Name (based on the display name we just generated)
            await this.generateStep('internal-name', 'description', {
                instructions: `Character name: ${this.generatedData.profile.displayName}

Create a lowercase internal identifier using hyphens or underscores.
Output format: character-name
Do not write sentences. Do not explain. Only output the identifier.`
            });

            // All done!
            this.stage = 'complete';
            this.render();

            // Populate the editor
            if (this.onComplete) {
                this.onComplete(this.generatedData);
            }

        } catch (error) {
            console.error('[Full Character Generator] Error:', error);
            this.showError(error.message || 'Generation failed');
        }
    }

    async generateStep(stepKey, generationType, additionalInput) {
        try {
            // Use custom prompt if provided, otherwise use default
            let customPrompt = this.customPrompts[generationType] || null;
            
            // Override with ultra-specific prompts for short-form fields
            if (stepKey === 'tags' && !customPrompt) {
                customPrompt = 'You are a tagging assistant. Output ONLY comma-separated tags. No explanations, no sentences, no extra text. Just the tags in this exact format: tag1, tag2, tag3';
            } else if (stepKey === 'internal-name' && !customPrompt) {
                customPrompt = 'You are a naming assistant. Output ONLY a single lowercase identifier with hyphens or underscores. No explanations, no sentences, no extra text. Just the identifier like: character-name';
            } else if (stepKey === 'profile-name' && !customPrompt) {
                customPrompt = 'You are a naming assistant. Output ONLY the character\'s name. No explanations, no sentences, no extra text. Just the name.';
            }

            const result = await window.api.lmstudio.generate(
                generationType,
                this.generatedData, // Pass what we've generated so far as context
                ['profile', 'personality', 'scenario'], // Use all generated sections as context
                additionalInput,
                customPrompt, // Use custom system prompt if set
                false, // Not edit mode
                '' // No current content
            );

            if (result.success) {
                // Store the result with post-processing
                if (stepKey === 'profile-name') {
                    // Extract just the name, remove any extra text
                    let name = result.content.trim();
                    // Remove common prefixes like "Name:", "Character:", etc.
                    name = name.replace(/^(name|character|display name):\s*/i, '');
                    // Take only the first line if multiple lines
                    name = name.split('\n')[0].trim();
                    // Remove quotes if present
                    name = name.replace(/^["']|["']$/g, '');
                    
                    this.generatedData.profile.displayName = name;
                    this.generatedData.characterCard.displayName = name;
                } else if (stepKey === 'profile-description') {
                    let description = result.content.trim();
                    // Remove common prefixes
                    description = description.replace(/^(description|profile|about):\s*/i, '');
                    
                    this.generatedData.profile.description = description;
                    this.generatedData.characterCard.description = description;
                } else if (stepKey === 'tags') {
                    let tags = result.content.trim();
                    
                    // Remove any explanatory text before or after tags
                    // Look for comma-separated words pattern
                    const tagPattern = /([a-z][a-z0-9-]*(?:\s*,\s*[a-z][a-z0-9-]*)+)/i;
                    const match = tags.match(tagPattern);
                    if (match) {
                        tags = match[1];
                    }
                    
                    // Remove common prefixes and suffixes
                    tags = tags.replace(/^(tags|keywords|here are the tags|output):\s*/i, '');
                    tags = tags.replace(/\s*\(.*?\)\s*/g, ''); // Remove parenthetical explanations
                    
                    // Take only the first line
                    tags = tags.split('\n')[0].trim();
                    
                    // Remove any extra formatting
                    tags = tags.replace(/^["'\[\{]|["'\]\}]$/g, '');
                    
                    // Clean up spacing around commas
                    tags = tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t).join(', ');
                    
                    this.generatedData.characterCard.tags = tags;
                } else if (stepKey === 'internal-name') {
                    let internalName = result.content.trim();
                    
                    // Look for a valid identifier pattern (lowercase with hyphens/underscores)
                    const idPattern = /\b([a-z][a-z0-9_-]+)\b/;
                    const match = internalName.match(idPattern);
                    if (match) {
                        internalName = match[1];
                    }
                    
                    // Remove common prefixes
                    internalName = internalName.replace(/^(internal name|identifier|id|name):\s*/i, '');
                    
                    // Take only the first word/identifier
                    internalName = internalName.split(/[\s\n]/)[0].trim();
                    
                    // Remove quotes and special chars
                    internalName = internalName.replace(/^["']|["']$/g, '');
                    internalName = internalName.replace(/[^a-z0-9_-]/gi, '-');
                    
                    // Ensure lowercase
                    internalName = internalName.toLowerCase();
                    
                    // Remove multiple consecutive hyphens
                    internalName = internalName.replace(/-+/g, '-').replace(/^-|-$/g, '');
                    
                    this.generatedData.characterCard.internalName = internalName;
                } else if (stepKey === 'personality') {
                    this.generatedData.personality = result.content;
                } else if (stepKey === 'scenario') {
                    this.generatedData.scenario = result.content;
                } else if (stepKey === 'initialMessages') {
                    // Parse multiple messages
                    const messages = result.content.split(/\n\n+/).filter(m => m.trim());
                    this.generatedData.initialMessages = messages.map(text => ({
                        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                        text: text.trim()
                    }));
                } else if (stepKey === 'exampleDialogs') {
                    // Store as a single string with all exchanges
                    this.generatedData.exampleDialogs = result.content.trim();
                }

                // Move to next step (but don't render if we're done)
                this.currentGenerationStep++;
                
                // Only render if we haven't completed all steps
                if (this.currentGenerationStep < this.totalSteps) {
                    this.render();
                }

            } else {
                throw new Error(result.error || 'Generation failed');
            }
        } catch (error) {
            throw error;
        }
    }

    cancelGeneration() {
        if (confirm('Are you sure you want to cancel character generation?')) {
            window.api.lmstudio.cancel();
            this.close();
        }
    }

    showError(message) {
        this.innerHTML = `
            <div class="modal-overlay">
                <div class="modal ai-generation-modal" data-modal-content>
                    <div class="modal-header">
                        <h2>Generation Failed</h2>
                        <button class="icon-btn close-btn" data-action="close" title="Close">
                            <i data-feather="x"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="error-state">
                            <i data-feather="alert-circle"></i>
                            <h3>Generation Failed</h3>
                            <p>${window.SecurityUtils.escapeHtml(message)}</p>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="secondary-btn" data-action="close">Close</button>
                    </div>
                </div>
            </div>
        `;

        if (window.feather) {
            window.feather.replace();
        }

        this.attachEventListeners();
    }

    showInputModal(title, message, onConfirm) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.zIndex = '10001';
        
        overlay.innerHTML = `
            <div class="modal" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>${window.SecurityUtils.escapeHtml(title)}</h3>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 16px;">${window.SecurityUtils.escapeHtml(message)}</p>
                    <input type="text" id="input-modal-value" class="input-field" style="width: 100%;">
                </div>
                <div class="modal-footer">
                    <button class="secondary-btn" id="input-modal-cancel">Cancel</button>
                    <button class="primary-btn" id="input-modal-confirm">OK</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        const input = overlay.querySelector('#input-modal-value');
        const confirmBtn = overlay.querySelector('#input-modal-confirm');
        const cancelBtn = overlay.querySelector('#input-modal-cancel');
        
        input.focus();
        
        const cleanup = () => {
            document.body.removeChild(overlay);
        };
        
        confirmBtn.onclick = () => {
            const value = input.value.trim();
            cleanup();
            if (onConfirm) onConfirm(value);
        };
        
        cancelBtn.onclick = cleanup;
        overlay.onclick = (e) => {
            if (e.target === overlay) cleanup();
        };
        
        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmBtn.click();
            } else if (e.key === 'Escape') {
                cleanup();
            }
        };
    }

    showConfirmModal(title, message, onConfirm, confirmButtonText = 'Confirm') {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.zIndex = '10001';
        
        overlay.innerHTML = `
            <div class="modal" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>${window.SecurityUtils.escapeHtml(title)}</h3>
                </div>
                <div class="modal-body">
                    <p>${window.SecurityUtils.escapeHtml(message)}</p>
                </div>
                <div class="modal-footer">
                    <button class="secondary-btn" id="confirm-modal-cancel">Cancel</button>
                    <button class="danger-btn" id="confirm-modal-confirm">${window.SecurityUtils.escapeHtml(confirmButtonText)}</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        const confirmBtn = overlay.querySelector('#confirm-modal-confirm');
        const cancelBtn = overlay.querySelector('#confirm-modal-cancel');
        
        const cleanup = () => {
            document.body.removeChild(overlay);
        };
        
        confirmBtn.onclick = () => {
            cleanup();
            if (onConfirm) onConfirm();
        };
        
        cancelBtn.onclick = cleanup;
        overlay.onclick = (e) => {
            if (e.target === overlay) cleanup();
        };
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.zIndex = '10002';
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

customElements.define('full-character-generator', FullCharacterGenerator);
