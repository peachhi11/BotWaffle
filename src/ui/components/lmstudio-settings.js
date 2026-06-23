/**
 * LM Studio Settings Component
 * Configuration page for LM Studio integration
 * Includes global settings and per-generation-type prompts
 */

class LMStudioSettings extends HTMLElement {
    constructor() {
        super();
        this.config = null;
        this.models = [];
        this.activePromptTab = 'description';
    }

    async connectedCallback() {
        await this.loadConfig();
        await this.loadModels();
        this.render();
        this.attachEventListeners();
    }

    async loadConfig() {
        try {
            this.config = await window.api.lmstudio.getConfig();
            if (!this.config) {
                this.config = this.getDefaultConfig();
            }
        } catch (error) {
            console.error('[LM Studio Settings] Error loading config:', error);
            this.config = this.getDefaultConfig();
        }
    }

    async loadModels(config = null) {
        try {
            this.models = await window.api.lmstudio.listModels(config);
        } catch (error) {
            console.error('[LM Studio Settings] Error loading models:', error);
            this.models = [];
        }
    }

    getDefaultConfig() {
        return {
            enabled: true,
            baseUrl: 'http://localhost:1234/v1',
            apiKey: '',
            model: 'qwen/qwen3.5-9b',
            temperature: 0.7,
            maxTokens: 2000,
            prompts: {}
        };
    }

    getFormConfig() {
        return {
            ...this.config,
            enabled: this.querySelector('#enabled')?.checked ?? true,
            baseUrl: this.querySelector('#base-url')?.value ?? 'http://localhost:1234/v1',
            apiKey: this.querySelector('#api-key')?.value?.trim() ?? '',
            model: this.querySelector('#model')?.value ?? 'auto',
            temperature: parseFloat(this.querySelector('#temperature')?.value ?? 0.7),
            maxTokens: parseInt(this.querySelector('#max-tokens')?.value ?? 2000)
        };
    }

    render() {
        this.innerHTML = `
            <div class="settings-container">
                <div class="settings-header">
                    <h1>
                        <i data-feather="cpu"></i>
                        LM Studio Settings
                    </h1>
                    <p class="settings-description">
                        Configure LM Studio integration for AI-powered character generation.
                        LM Studio must be running locally with a model loaded.
                    </p>
                </div>

                <div class="settings-content">
                    <!-- Global Settings Section -->
                    <section class="settings-section">
                        <h2>Connection Settings</h2>
                        
                        <div class="form-group">
                            <label class="toggle-label">
                                <input type="checkbox" id="enabled" ${this.config.enabled ? 'checked' : ''}>
                                <span>Enable LM Studio Integration</span>
                            </label>
                        </div>

                        <div class="form-group">
                            <label for="base-url">Base URL:</label>
                            <input type="text" id="base-url" value="${this.config.baseUrl}" 
                                   placeholder="http://localhost:1234/v1">
                            <small>LM Studio API endpoint (default: http://localhost:1234/v1)</small>
                        </div>

                        <div class="form-group">
                            <label for="api-key">API Token:</label>
                            <input type="password" id="api-key" value="${this.config.apiKey || ''}"
                                   placeholder="Optional LM Studio API token" autocomplete="off">
                            <small>Required when LM Studio server authentication is enabled</small>
                        </div>

                        <div class="form-group">
                            <label for="model">Model:</label>
                            <select id="model">
                                <option value="auto" ${this.config.model === 'auto' ? 'selected' : ''}>Auto (prefer Qwen 3.5 9B)</option>
                                ${this.models.map(m => `
                                    <option value="${m.id}" ${this.config.model === m.id ? 'selected' : ''}>
                                        ${m.id}
                                    </option>
                                `).join('')}
                            </select>
                            <small>${this.models.length} model(s) available</small>
                        </div>

                        <div class="form-group">
                            <button class="secondary-btn" id="test-connection">
                                <i data-feather="wifi"></i>
                                Test Connection
                            </button>
                            <span id="connection-status"></span>
                        </div>
                    </section>

                    <!-- Generation Settings Section -->
                    <section class="settings-section">
                        <h2>Generation Settings</h2>

                        <div class="form-group">
                            <label for="temperature">Temperature: <span id="temp-value">${this.config.temperature}</span></label>
                            <input type="range" id="temperature" min="0" max="2" step="0.1" 
                                   value="${this.config.temperature}">
                            <small>Controls randomness (0 = deterministic, 2 = very creative)</small>
                        </div>

                        <div class="form-group">
                            <label for="max-tokens">Max Tokens:</label>
                            <input type="number" id="max-tokens" min="100" max="8000" step="100"
                                   value="${this.config.maxTokens}">
                            <small>Maximum length of generated content</small>
                        </div>
                    </section>

                    <!-- Prompts Section -->
                    <section class="settings-section">
                        <h2>System Prompts</h2>
                        <p class="section-description">
                            Customize the system prompts for each generation type. Prompts are stored as .txt files in <code>data/prompts/</code> (personality/, scenario/, initial-messages/, etc.). Use "Open Prompts Folder" to add or edit files directly.
                        </p>

                        <div class="prompt-tabs">
                            ${this.renderPromptTabs()}
                        </div>

                        <div class="prompt-editor-container">
                            ${this.renderPromptEditor()}
                        </div>
                    </section>

                    <!-- Saved Prompts Management -->
                    <section class="settings-section">
                        <h2>Saved Custom Prompts</h2>
                        <p class="section-description">
                            Manage your saved custom prompts. These are available in the generation modal dropdown.
                        </p>
                        <div id="saved-prompts-list">
                            ${this.renderSavedPrompts()}
                        </div>
                    </section>

                    <!-- Save Button -->
                    <div class="settings-footer">
                        <button class="primary-btn" id="save-settings">
                            <i data-feather="save"></i>
                            Save Settings
                        </button>
                        <span id="save-status"></span>
                    </div>
                </div>
            </div>
        `;

        // Replace feather icons
        if (window.feather) {
            window.feather.replace();
        }
    }

    renderPromptTabs() {
        const promptTypes = [
            { id: 'description', label: 'Description' },
            { id: 'personality', label: 'Personality (Legacy)' },
            { id: 'personalitySFW', label: 'Personality SFW' },
            { id: 'personalityNSFW', label: 'Personality NSFW' },
            { id: 'scenario', label: 'Scenario' },
            { id: 'initialMessages', label: 'Initial Messages' },
            { id: 'exampleDialogs', label: 'Example Dialogs' },
            { id: 'scripts', label: 'Scripts' },
            { id: 'fullCharacter', label: 'Full Character' },
            { id: 'bio', label: 'Bio' }
        ];

        return promptTypes.map(type => `
            <button class="prompt-tab ${this.activePromptTab === type.id ? 'active' : ''}"
                    data-prompt-type="${type.id}">
                ${type.label}
            </button>
        `).join('');
    }

    renderPromptEditor() {
        const prompt = this.config.prompts[this.activePromptTab] || '';
        const charCount = prompt.length;
        const tokenEstimate = Math.ceil(charCount / 4);

        return `
            <div class="prompt-editor">
                <div class="prompt-editor-header">
                    <h3>${this.getPromptTypeLabel(this.activePromptTab)} Prompt</h3>
                    <div class="prompt-actions">
                        <button class="secondary-btn" data-action="open-prompts-folder" title="Open prompts folder to add or edit .txt files">
                            <i data-feather="folder-open"></i>
                            Open Prompts Folder
                        </button>
                        <button class="secondary-btn" data-action="reload-prompts" title="Reload all prompts from files">
                            <i data-feather="refresh-cw"></i>
                            Reload from Files
                        </button>
                        <button class="secondary-btn" data-action="reset-prompt">
                            <i data-feather="rotate-ccw"></i>
                            Reset to Default
                        </button>
                    </div>
                </div>
                <textarea class="ai-prompt-editor" id="prompt-${this.activePromptTab}" 
                          data-prompt-type="${this.activePromptTab}">${window.SecurityUtils.escapeHtml(prompt)}</textarea>
                <div class="prompt-stats">
                    <span>${charCount} characters</span>
                    <span>~${tokenEstimate} tokens</span>
                </div>
            </div>
        `;
    }

    getPromptTypeLabel(type) {
        const labels = {
            description: 'Description',
            personality: 'Personality',
            scenario: 'Scenario',
            initialMessages: 'Initial Messages',
            exampleDialogs: 'Example Dialogs',
            scripts: 'Scripts',
            fullCharacter: 'Full Character',
            bio: 'Bio'
        };
        return labels[type] || type;
    }

    renderSavedPrompts() {
        const promptTypes = ['description', 'personality', 'scenario', 'initialMessages', 'exampleDialogs', 'scripts', 'fullCharacter', 'bio'];
        let html = '';
        
        promptTypes.forEach(type => {
            try {
                const saved = localStorage.getItem(`lmstudio-saved-prompts-${type}`);
                if (saved) {
                    const prompts = JSON.parse(saved);
                    const promptKeys = Object.keys(prompts);
                    
                    if (promptKeys.length > 0) {
                        html += `
                            <div class="saved-prompts-category">
                                <h4>${this.getPromptTypeLabel(type)}</h4>
                                <div class="saved-prompts-items">
                                    ${promptKeys.map(key => `
                                        <div class="saved-prompt-item">
                                            <span class="prompt-name">${window.SecurityUtils.escapeHtml(key)}</span>
                                            <div class="prompt-actions">
                                                <button class="icon-btn" data-action="view-prompt" data-type="${type}" data-name="${window.SecurityUtils.escapeHtml(key)}" title="View">
                                                    <i data-feather="eye"></i>
                                                </button>
                                                <button class="icon-btn" data-action="delete-saved-prompt" data-type="${type}" data-name="${window.SecurityUtils.escapeHtml(key)}" title="Delete">
                                                    <i data-feather="trash-2"></i>
                                                </button>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `;
                    }
                }
            } catch (error) {
                console.error(`Error loading saved prompts for ${type}:`, error);
            }
        });
        
        if (!html) {
            html = '<p class="no-saved-prompts">No saved custom prompts yet. Save prompts from the generation modal to see them here.</p>';
        }
        
        return html;
    }

    attachEventListeners() {
        // Temperature slider
        const tempSlider = this.querySelector('#temperature');
        const tempValue = this.querySelector('#temp-value');
        if (tempSlider && tempValue) {
            tempSlider.addEventListener('input', (e) => {
                tempValue.textContent = e.target.value;
            });
        }

        // Test connection button
        const testBtn = this.querySelector('#test-connection');
        if (testBtn) {
            testBtn.addEventListener('click', () => this.testConnection());
        }

        // Save settings button
        const saveBtn = this.querySelector('#save-settings');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveSettings());
        }

        // Prompt tabs
        this.querySelectorAll('.prompt-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.activePromptTab = e.target.dataset.promptType;
                this.updatePromptEditor();
            });
        });

        // Reset prompt button
        const resetBtn = this.querySelector('[data-action="reset-prompt"]');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetPrompt());
        }

        // Update prompt in memory when typing
        this.addEventListener('input', (e) => {
            if (e.target.classList.contains('ai-prompt-editor')) {
                const promptType = e.target.dataset.promptType;
                if (promptType) {
                    this.config.prompts[promptType] = e.target.value;
                    this.updatePromptStats(e.target);
                }
            }
        });

        // View saved prompt and other actions
        this.addEventListener('click', (e) => {
            const viewBtn = e.target.closest('[data-action="view-prompt"]');
            if (viewBtn) {
                const type = viewBtn.dataset.type;
                const name = viewBtn.dataset.name;
                this.viewSavedPrompt(type, name);
            }

            const deleteBtn = e.target.closest('[data-action="delete-saved-prompt"]');
            if (deleteBtn) {
                const type = deleteBtn.dataset.type;
                const name = deleteBtn.dataset.name;
                this.deleteSavedPrompt(type, name);
            }

            const reloadBtn = e.target.closest('[data-action="reload-prompts"]');
            if (reloadBtn) {
                this.reloadPromptsFromFiles();
            }

            const openFolderBtn = e.target.closest('[data-action="open-prompts-folder"]');
            if (openFolderBtn) {
                this.openPromptsFolder();
            }
        });
    }

    viewSavedPrompt(type, name) {
        try {
            const saved = localStorage.getItem(`lmstudio-saved-prompts-${type}`);
            if (saved) {
                const prompts = JSON.parse(saved);
                const promptContent = prompts[name];
                
                if (promptContent) {
                    // Show modal with prompt content
                    const modal = document.createElement('div');
                    modal.className = 'modal-overlay';
                    modal.style.zIndex = '10001';
                    
                    modal.innerHTML = `
                        <div class="modal" style="max-width: 800px;">
                            <div class="modal-header">
                                <h2>Saved Prompt: ${window.SecurityUtils.escapeHtml(name)}</h2>
                                <button class="icon-btn close-btn" data-action="close">
                                    <i data-feather="x"></i>
                                </button>
                            </div>
                            <div class="modal-body">
                                <p style="margin-bottom: 12px; color: var(--text-secondary);">
                                    <strong>Type:</strong> ${this.getPromptTypeLabel(type)}
                                </p>
                                <textarea class="ai-prompt-editor" readonly style="min-height: 300px;">${window.SecurityUtils.escapeHtml(promptContent)}</textarea>
                            </div>
                            <div class="modal-footer">
                                <button class="secondary-btn" data-action="close">Close</button>
                            </div>
                        </div>
                    `;
                    
                    document.body.appendChild(modal);
                    
                    if (window.feather) {
                        window.feather.replace();
                    }
                    
                    const closeModal = () => {
                        if (modal.parentNode) {
                            document.body.removeChild(modal);
                        }
                    };
                    
                    modal.querySelectorAll('[data-action="close"]').forEach(btn => {
                        btn.addEventListener('click', closeModal);
                    });
                    
                    modal.addEventListener('click', (e) => {
                        if (e.target.classList.contains('modal-overlay')) {
                            closeModal();
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error viewing saved prompt:', error);
        }
    }

    deleteSavedPrompt(type, name) {
        if (!confirm(`Delete saved prompt "${name}"?`)) return;
        
        try {
            const saved = localStorage.getItem(`lmstudio-saved-prompts-${type}`);
            if (saved) {
                const prompts = JSON.parse(saved);
                delete prompts[name];
                localStorage.setItem(`lmstudio-saved-prompts-${type}`, JSON.stringify(prompts));
                
                // Refresh the saved prompts list
                const listContainer = this.querySelector('#saved-prompts-list');
                if (listContainer) {
                    listContainer.innerHTML = this.renderSavedPrompts();
                    if (window.feather) {
                        window.feather.replace();
                    }
                }
                
                this.showNotification(`Prompt "${name}" deleted successfully!`, 'success');
            }
        } catch (error) {
            console.error('Error deleting saved prompt:', error);
            this.showNotification('Failed to delete prompt.', 'error');
        }
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

    updatePromptEditor() {
        const container = this.querySelector('.prompt-editor-container');
        if (container) {
            container.innerHTML = this.renderPromptEditor();
            if (window.feather) {
                window.feather.replace();
            }
            
            // Re-attach reset button listener
            const resetBtn = container.querySelector('[data-action="reset-prompt"]');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => this.resetPrompt());
            }
        }

        // Update active tab
        this.querySelectorAll('.prompt-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.promptType === this.activePromptTab);
        });
    }

    updatePromptStats(textarea) {
        const statsDiv = textarea.parentElement.querySelector('.prompt-stats');
        if (statsDiv) {
            const charCount = textarea.value.length;
            const tokenEstimate = Math.ceil(charCount / 4);
            statsDiv.innerHTML = `
                <span>${charCount} characters</span>
                <span>~${tokenEstimate} tokens</span>
            `;
        }
    }

    async testConnection() {
        const statusSpan = this.querySelector('#connection-status');
        const testBtn = this.querySelector('#test-connection');
        
        if (statusSpan) {
            statusSpan.textContent = 'Testing...';
            statusSpan.className = 'status-testing';
        }
        
        if (testBtn) {
            testBtn.disabled = true;
        }

        try {
            const testConfig = this.getFormConfig();
            const result = await window.api.lmstudio.testConnection(testConfig);
            
            if (statusSpan) {
                if (result.success) {
                    this.config = testConfig;
                    const saved = await window.api.lmstudio.saveConfig(this.config);
                    statusSpan.textContent = saved
                        ? `✓ ${result.message} Settings saved.`
                        : `✓ ${result.message} Save settings before generating.`;
                    statusSpan.className = 'status-success';
                    
                    // Reload models
                    await this.loadModels(testConfig);
                    const modelSelect = this.querySelector('#model');
                    if (modelSelect) {
                        const currentValue = modelSelect.value;
                        modelSelect.innerHTML = `
                            <option value="auto" ${currentValue === 'auto' ? 'selected' : ''}>Auto (prefer Qwen 3.5 9B)</option>
                            ${this.models.map(m => `
                                <option value="${m.id}" ${currentValue === m.id ? 'selected' : ''}>
                                    ${m.id}
                                </option>
                            `).join('')}
                        `;
                    }
                } else {
                    statusSpan.textContent = `✗ ${result.message}`;
                    statusSpan.className = 'status-error';
                }
            }
        } catch (error) {
            console.error('[LM Studio Settings] Connection test error:', error);
            if (statusSpan) {
                statusSpan.textContent = `✗ ${error.message}`;
                statusSpan.className = 'status-error';
            }
        } finally {
            if (testBtn) {
                testBtn.disabled = false;
            }
        }
    }

    async saveSettings() {
        const statusSpan = this.querySelector('#save-status');
        const saveBtn = this.querySelector('#save-settings');
        
        if (statusSpan) {
            statusSpan.textContent = 'Saving...';
            statusSpan.className = 'status-saving';
        }
        
        if (saveBtn) {
            saveBtn.disabled = true;
        }

        try {
            this.config = this.getFormConfig();

            // Save prompts to files
            if (this.config.prompts) {
                for (const [type, content] of Object.entries(this.config.prompts)) {
                    try {
                        await window.api.lmstudio.savePromptToFile(type, content);
                    } catch (error) {
                        console.warn(`[LM Studio Settings] Could not save ${type} prompt to file:`, error);
                    }
                }
            }

            // Save config
            const success = await window.api.lmstudio.saveConfig(this.config);
            
            if (statusSpan) {
                if (success) {
                    statusSpan.textContent = '✓ Settings saved successfully';
                    statusSpan.className = 'status-success';
                    setTimeout(() => {
                        statusSpan.textContent = '';
                    }, 3000);
                } else {
                    statusSpan.textContent = '✗ Failed to save settings';
                    statusSpan.className = 'status-error';
                }
            }
        } catch (error) {
            console.error('[LM Studio Settings] Save error:', error);
            if (statusSpan) {
                statusSpan.textContent = `✗ ${error.message}`;
                statusSpan.className = 'status-error';
            }
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
            }
        }
    }

    async resetPrompt() {
        try {
            const success = await window.api.lmstudio.resetPrompt(this.activePromptTab);
            if (success) {
                // Reload config to get the reset prompt
                await this.loadConfig();
                this.updatePromptEditor();
                
                // Show success message
                const statusSpan = this.querySelector('#save-status');
                if (statusSpan) {
                    statusSpan.textContent = '✓ Prompt reset to default';
                    statusSpan.className = 'status-success';
                    setTimeout(() => {
                        statusSpan.textContent = '';
                    }, 3000);
                }
            }
        } catch (error) {
            console.error('[LM Studio Settings] Reset prompt error:', error);
        }
    }

    async openPromptsFolder() {
        try {
            const result = await window.api.lmstudio.openPromptsFolder();
            if (result && !result.success && result.error) {
                this.showNotification('Failed to open folder: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('[LM Studio Settings] Error opening prompts folder:', error);
            this.showNotification('Failed to open prompts folder.', 'error');
        }
    }

    async reloadPromptsFromFiles() {
        try {
            console.log('[LM Studio Settings] Reloading prompts from files...');

            // Reload prompts from files
            await window.api.lmstudio.reloadPrompts();

            // Reload config to get the updated prompts
            await this.loadConfig();
            this.updatePromptEditor();

            // Show success message
            const statusSpan = this.querySelector('#save-status');
            if (statusSpan) {
                statusSpan.textContent = '✓ Prompts reloaded from files';
                statusSpan.className = 'status-success';
                setTimeout(() => {
                    statusSpan.textContent = '';
                }, 3000);
            }
            
            console.log('[LM Studio Settings] Prompts reloaded successfully');
        } catch (error) {
            console.error('[LM Studio Settings] Reload error:', error);
            
            const statusSpan = this.querySelector('#save-status');
            if (statusSpan) {
                statusSpan.textContent = '✗ Failed to reload prompts';
                statusSpan.className = 'status-error';
            }
        }
    }
}

customElements.define('lmstudio-settings', LMStudioSettings);
