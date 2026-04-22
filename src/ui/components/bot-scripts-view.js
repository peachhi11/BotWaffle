/**
 * Bot Scripts View Component
 * Manages scripts (lorebook scripts, etc.) for this character
 * Displays as cards in a grid with search and tagging support
 */
class BotScriptsView extends HTMLElement {
    constructor() {
        super();
        this.botId = null;
        this.botData = null;
        this.filteredScripts = [];
        this.searchTerm = '';
    }

    escapeHtml(str) {
        const escapeHtml = window.SecurityUtils?.escapeHtml || ((s) => {
            const div = document.createElement('div');
            div.textContent = s;
            return div.innerHTML;
        });
        return escapeHtml(String(str ?? ''));
    }

    renderCodeWithLineNumbers(text) {
        const raw = String(text ?? '');
        const lines = raw.split(/\r\n|\r|\n/);

        const gutter = lines.map((_, i) => `${i + 1}`).join('\n');
        const code = lines.map((line) => {
            // Preserve empty lines so the layout stays consistent
            return line === '' ? '\u00A0' : line;
        }).join('\n');

        return `
            <div class="code-with-lines">
                <pre class="code-gutter" aria-hidden="true">${this.escapeHtml(gutter)}</pre>
                <pre class="code-content">${this.escapeHtml(code)}</pre>
            </div>
        `;
    }

    set botId(value) {
        this._botId = value;
        if (value) {
            this.loadBotData();
        }
    }

    get botId() {
        return this._botId;
    }

    async loadBotData() {
        if (!this.botId) return;

        try {
            this.botData = await window.api.chatbot.get(this.botId);
            this.filterScripts();
            this.render();
        } catch (error) {
            console.error('Error loading bot data:', error);
            this.innerHTML = '<div class="error-message">Failed to load bot data</div>';
        }
    }

    getScripts() {
        return this.botData?.metadata?.scripts || this.botData?.scripts || [];
    }

    normalizeScript(script, index) {
        if (typeof script === 'string') {
            return {
                name: `Script ${index + 1}`,
                content: script,
                tags: [],
                createdAt: null,
                updatedAt: null
            };
        }
        return {
            name: script?.name || `Script ${index + 1}`,
            content: script?.content || script?.text || '',
            tags: script?.tags || [],
            createdAt: script?.createdAt || null,
            updatedAt: script?.updatedAt || null
        };
    }

    filterScripts() {
        const scripts = this.getScripts().map((s, i) => this.normalizeScript(s, i));
        const term = this.searchTerm.toLowerCase().trim();

        if (!term) {
            this.filteredScripts = scripts;
            return;
        }

        this.filteredScripts = scripts.filter(script => {
            const name = (script.name || '').toLowerCase();
            const content = (script.content || '').toLowerCase();
            const tags = (script.tags || []).map(t => t.toLowerCase()).join(' ');
            return name.includes(term) || content.includes(term) || tags.includes(term);
        });
    }

    render() {
        if (!this.botData) {
            this.innerHTML = '<div class="loading">Loading...</div>';
            return;
        }

        const scripts = this.filteredScripts;

        this.innerHTML = `
            <div class="bot-scripts-view">
                <div class="view-header">
                    <h2>Character Scripts</h2>
                    <div style="display: flex; gap: var(--spacing-sm);">
                        <button id="open-scripts-location-btn" class="secondary-btn" title="Open scripts folder">
                            <i data-feather="folder"></i>
                            Open Location
                        </button>
                        <button class="ai-generate-btn" id="generate-script-btn" title="Generate with AI">
                            <i data-feather="zap"></i>
                            Generate Script
                        </button>
                        <button id="add-script-btn" class="primary-btn">
                            <i data-feather="plus"></i>
                            Add Script
                        </button>
                    </div>
                </div>

                <div class="resource-toolbar">
                    <div class="search-box">
                        <i data-feather="search" class="search-icon"></i>
                        <input type="text" id="script-search-input" placeholder="Search scripts..." value="${this.escapeHtml(this.searchTerm)}">
                    </div>
                </div>

                ${scripts.length === 0 ? `
                    <div class="empty-state">
                        <i data-feather="file-text" style="width: 64px; height: 64px; opacity: 0.3; margin-bottom: 16px;"></i>
                        <p>${this.searchTerm ? 'No scripts match your search' : 'No scripts saved yet'}</p>
                        <p class="empty-hint">${this.searchTerm ? 'Try a different search term' : 'Add scripts to store lorebook entries, activation systems, and other code for this character'}</p>
                    </div>
                ` : `
                    <div class="resource-grid" id="scripts-grid">
                        ${scripts.map((script, index) => {
                            const allScripts = this.getScripts().map((s, i) => this.normalizeScript(s, i));
                            const actualIndex = allScripts.findIndex(s => s.name === script.name && s.content === script.content);
                            const previewLines = String(script.content || '').split(/\r\n|\r|\n/).slice(0, 10);
                            const preview = previewLines.join('\n');
                            const previewText = preview.length > 300 ? preview.substring(0, 300) + '...' : preview;
                            const lineCount = Math.max(1, String(script.content || '').split(/\r\n|\r|\n/).length);
                            const charCount = String(script.content || '').length;
                            const tags = script.tags || [];

                            return `
                                <div class="resource-card" data-index="${actualIndex}">
                                    <div class="resource-card-header">
                                        <h3 title="${this.escapeHtml(script.name)}">${this.escapeHtml(script.name)}</h3>
                                        <div class="resource-card-actions">
                                            <button class="icon-btn view-script-btn" data-index="${actualIndex}" title="View script">
                                                <i data-feather="eye"></i>
                                            </button>
                                            <button class="icon-btn copy-script-btn" data-index="${actualIndex}" title="Copy script">
                                                <i data-feather="copy"></i>
                                            </button>
                                            <button class="icon-btn edit-script-btn" data-index="${actualIndex}" title="Edit script">
                                                <i data-feather="edit-2"></i>
                                            </button>
                                            <button class="icon-btn remove-script-btn" data-index="${actualIndex}" title="Remove script">
                                                <i data-feather="trash-2"></i>
                                            </button>
                                        </div>
                                    </div>
                                    ${tags.length > 0 ? `
                                        <div class="resource-card-tags">
                                            ${tags.map(tag => `<span class="tag" data-tag="${this.escapeHtml(tag)}">${this.escapeHtml(tag)}</span>`).join('')}
                                        </div>
                                    ` : ''}
                                    <div class="resource-card-meta">
                                        <span>${lineCount} lines</span>
                                        <span>${charCount.toLocaleString()} chars</span>
                                    </div>
                                    <div class="resource-card-preview">
                                        <pre>${this.escapeHtml(previewText)}</pre>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `}
            </div>
        `;

        // Re-initialize feather icons
        if (typeof feather !== 'undefined' && typeof feather.replace === 'function') {
            feather.replace();
        }

        this.setupListeners();
    }

    setupListeners() {
        // Open location button
        const openLocationBtn = this.querySelector('#open-scripts-location-btn');
        if (openLocationBtn) {
            openLocationBtn.addEventListener('click', () => this.openLocation());
        }

        // Add script button
        const addBtn = this.querySelector('#add-script-btn');
        const generateBtn = this.querySelector('#generate-script-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.handleAddScript());
        }

        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.openGenerationModal());
        }

        // Search input
        const searchInput = this.querySelector('#script-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value;
                this.filterScripts();
                this.render();
            });
        }

        // Tag click handlers
        this.querySelectorAll('.resource-card-tags .tag').forEach(tag => {
            tag.addEventListener('click', (e) => {
                e.stopPropagation();
                const tagValue = tag.getAttribute('data-tag');
                if (tagValue && searchInput) {
                    searchInput.value = tagValue;
                    this.searchTerm = tagValue;
                    this.filterScripts();
                    this.render();
                }
            });
        });

        // View script buttons
        this.querySelectorAll('.view-script-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.getAttribute('data-index'));
                this.viewScript(index);
            });
        });

        // Copy script buttons
        this.querySelectorAll('.copy-script-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.getAttribute('data-index'));
                this.copyScript(index);
            });
        });

        // Edit script buttons
        this.querySelectorAll('.edit-script-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.getAttribute('data-index'));
                this.editScript(index);
            });
        });

        // Remove script buttons
        this.querySelectorAll('.remove-script-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.getAttribute('data-index'));
                this.removeScript(index);
            });
        });
    }

    async handleAddScript() {
        try {
            // Show modal to paste script content
            const scriptContent = await this.showScriptInputModal('Add Script', 'Paste your script content here:', '');
            if (!scriptContent || !scriptContent.trim()) {
                return;
            }

            // Get script name
            const scriptName = await this.showInputModal('Name Script', 'Enter a name for this script:', '');
            if (!scriptName || !scriptName.trim()) {
                return;
            }

            // Get tags
            const tagsInput = await this.showInputModal('Script Tags (Optional)', 'Enter tags separated by commas:', '');
            const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];

            // Get current scripts
            const currentData = await window.api.chatbot.get(this.botId);
            const scripts = currentData.metadata?.scripts || currentData.scripts || [];

            // Add new script
            const newScript = {
                name: scriptName.trim(),
                content: scriptContent.trim(),
                tags: tags,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            scripts.push(newScript);

            // Update bot data
            const metadata = currentData.metadata || {};
            metadata.scripts = scripts;

            await window.api.chatbot.update(this.botId, { metadata: metadata });

            // Refresh view
            await this.loadBotData();

            // Refresh chatbot list to update script count
            const chatbotList = document.querySelector('chatbot-list');
            if (chatbotList) {
                chatbotList.loadChatbots();
            }

            this.showToast(`Script "${scriptName.trim()}" added successfully!`, 'success');
        } catch (error) {
            console.error('Error adding script:', error);
            this.showToast('Error adding script: ' + (error.message || 'Unknown error'), 'error');
        }
    }

    viewScript(index) {
        const scripts = this.getScripts().map((s, i) => this.normalizeScript(s, i));
        const script = scripts[index];
        if (!script) return;

        const modal = document.createElement('div');
        modal.className = 'script-view-modal';
        modal.innerHTML = `
            <div class="script-view-modal-content">
                <div class="script-view-modal-header">
                    <h3>${this.escapeHtml(script.name)}</h3>
                    <button class="script-view-modal-close" title="Close">
                        <i data-feather="x"></i>
                    </button>
                </div>
                <div class="script-view-modal-body">
                    ${this.renderCodeWithLineNumbers(script.content)}
                </div>
                <div class="script-view-modal-footer">
                    <button class="secondary-btn script-view-modal-copy">
                        <i data-feather="copy"></i>
                        Copy
                    </button>
                    <button class="primary-btn script-view-modal-close-btn">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        if (typeof feather !== 'undefined' && typeof feather.replace === 'function') {
            feather.replace();
        }

        const close = () => modal.remove();
        modal.querySelector('.script-view-modal-close')?.addEventListener('click', close);
        modal.querySelector('.script-view-modal-close-btn')?.addEventListener('click', close);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) close();
        });
        modal.querySelector('.script-view-modal-copy')?.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(String(script.content ?? ''));
                this.showToast('Script copied to clipboard!', 'success');
            } catch (e) {
                this.showToast('Failed to copy script', 'error');
            }
        });
    }

    async openLocation() {
        if (!this.botId) return;

        try {
            const scriptsFolderPath = await window.api.getCharacterFolderPath(this.botId, 'scripts');
            if (!scriptsFolderPath) {
                alert('Character folder not found');
                return;
            }
            await window.api.openPath(scriptsFolderPath);
        } catch (error) {
            console.error('Error opening location:', error);
            alert('Error opening folder: ' + (error.message || 'Unknown error'));
        }
    }

    async copyScript(index) {
        try {
            const scripts = this.getScripts().map((s, i) => this.normalizeScript(s, i));
            const script = scripts[index];
            if (!script) return;

            const scriptContent = String(script.content || '');
            
            await navigator.clipboard.writeText(scriptContent);
            this.showToast('Script copied to clipboard!', 'success');
        } catch (error) {
            console.error('Error copying script:', error);
            this.showToast('Error copying script: ' + (error.message || 'Unknown error'), 'error');
        }
    }

    async editScript(index) {
        try {
            const scripts = this.getScripts().map((s, i) => this.normalizeScript(s, i));
            const script = scripts[index];
            if (!script) return;

            const scriptContent = String(script.content || '');
            const scriptName = String(script.name || `Script ${index + 1}`);
            const currentTags = (script.tags || []).join(', ');

            // Show edit modal for content
            const newContent = await this.showScriptInputModal('Edit Script', 'Edit script content:', scriptContent);
            if (newContent === null) {
                return; // User cancelled
            }

            // Get new name
            const newName = await this.showInputModal('Edit Script Name', 'Enter a name for this script:', scriptName);
            if (!newName || !newName.trim()) {
                return;
            }

            // Get tags
            const tagsInput = await this.showInputModal('Script Tags (Optional)', 'Enter tags separated by commas:', currentTags);
            const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];

            // Update script
            const currentData = await window.api.chatbot.get(this.botId);
            const updatedScripts = [...(currentData.metadata?.scripts || currentData.scripts || [])];
            
            updatedScripts[index] = {
                ...updatedScripts[index],
                name: newName.trim(),
                content: newContent.trim(),
                tags: tags,
                updatedAt: new Date().toISOString()
            };

            // Update bot data
            const metadata = currentData.metadata || {};
            metadata.scripts = updatedScripts;

            await window.api.chatbot.update(this.botId, { metadata: metadata });

            // Refresh view
            await this.loadBotData();

            // Refresh chatbot list
            const chatbotList = document.querySelector('chatbot-list');
            if (chatbotList) {
                chatbotList.loadChatbots();
            }

            this.showToast(`Script "${newName.trim()}" updated successfully!`, 'success');
        } catch (error) {
            console.error('Error editing script:', error);
            this.showToast('Error editing script: ' + (error.message || 'Unknown error'), 'error');
        }
    }

    async removeScript(index) {
        if (!confirm('Are you sure you want to remove this script?')) return;

        try {
            const currentData = await window.api.chatbot.get(this.botId);
            const scripts = currentData.metadata?.scripts || currentData.scripts || [];
            const script = scripts[index];
            const scriptName = typeof script === 'object' && script.name ? script.name : `Script ${index + 1}`;

            // Remove script
            scripts.splice(index, 1);

            // Update bot data
            const metadata = currentData.metadata || {};
            metadata.scripts = scripts;

            await window.api.chatbot.update(this.botId, { metadata: metadata });

            // Refresh view
            await this.loadBotData();

            // Refresh chatbot list
            const chatbotList = document.querySelector('chatbot-list');
            if (chatbotList) {
                chatbotList.loadChatbots();
            }

            this.showToast(`Script "${scriptName}" removed successfully!`, 'success');
        } catch (error) {
            console.error('Error removing script:', error);
            this.showToast('Error removing script: ' + (error.message || 'Unknown error'), 'error');
        }
    }

    async showInputModal(title, placeholder, defaultValue) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'input-modal';
            modal.innerHTML = `
                <div class="input-modal-content">
                    <div class="input-modal-header">
                        <h3>${title}</h3>
                        <button class="input-modal-close">&times;</button>
                    </div>
                    <div class="input-modal-body">
                        <input type="text" class="input-modal-input" placeholder="${placeholder}" value="${defaultValue || ''}">
                    </div>
                    <div class="input-modal-footer">
                        <button class="input-modal-btn input-modal-cancel">Cancel</button>
                        <button class="input-modal-btn input-modal-confirm primary-btn">Confirm</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            const input = modal.querySelector('.input-modal-input');
            
            // Make input clickable and editable
            input.style.pointerEvents = 'auto';
            input.style.position = 'relative';
            input.style.zIndex = '10001';
            input.style.cursor = 'text';
            
            // Focus and select after a small delay to ensure modal is fully rendered
            setTimeout(() => {
                input.focus();
                input.select();
            }, 50);

            const close = () => {
                modal.remove();
                resolve('');
            };

            const confirm = () => {
                const value = input.value.trim();
                modal.remove();
                resolve(value);
            };

            modal.querySelector('.input-modal-close').addEventListener('click', close);
            modal.querySelector('.input-modal-cancel').addEventListener('click', close);
            modal.querySelector('.input-modal-confirm').addEventListener('click', confirm);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) close();
            });

            // Prevent clicks on input from closing modal
            input.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            input.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });
            input.addEventListener('focus', (e) => {
                e.stopPropagation();
            });

            input.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                    e.preventDefault();
                    confirm();
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    close();
                }
            });
        });
    }

    async showScriptInputModal(title, placeholder, defaultValue) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'script-input-modal';
            modal.innerHTML = `
                <div class="script-input-modal-content">
                    <div class="script-input-modal-header">
                        <h3>${title}</h3>
                        <button class="script-input-modal-close">&times;</button>
                    </div>
                    <div class="script-input-modal-body">
                        <div class="script-editor">
                            <pre class="script-editor-gutter" aria-hidden="true"></pre>
                            <textarea class="script-input-modal-textarea script-editor-textarea" placeholder="${placeholder}" rows="20">${defaultValue || ''}</textarea>
                        </div>
                    </div>
                    <div class="script-input-modal-footer">
                        <button class="script-input-modal-btn script-input-modal-cancel">Cancel</button>
                        <button class="script-input-modal-btn script-input-modal-confirm primary-btn">Confirm</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            const textarea = modal.querySelector('.script-input-modal-textarea');
            const gutter = modal.querySelector('.script-editor-gutter');

            const updateLineNumbers = () => {
                const lineCount = Math.max(1, String(textarea.value ?? '').split(/\r\n|\r|\n/).length);
                const lines = Array.from({ length: lineCount }, (_, i) => `${i + 1}`).join('\n');
                gutter.textContent = lines;
                gutter.scrollTop = textarea.scrollTop;
            };

            updateLineNumbers();
            
            // Make textarea clickable and editable
            textarea.style.pointerEvents = 'auto';
            textarea.style.position = 'relative';
            textarea.style.zIndex = '10001';
            textarea.style.cursor = 'text';
            
            // Focus after a small delay to ensure modal is fully rendered
            setTimeout(() => {
                textarea.focus();
                if (defaultValue) {
                    textarea.setSelectionRange(0, defaultValue.length);
                } else {
                    textarea.setSelectionRange(0, 0);
                }
            }, 50);

            const close = () => {
                modal.remove();
                resolve(null);
            };

            const confirm = () => {
                const value = textarea.value;
                modal.remove();
                resolve(value);
            };

            modal.querySelector('.script-input-modal-close').addEventListener('click', close);
            modal.querySelector('.script-input-modal-cancel').addEventListener('click', close);
            modal.querySelector('.script-input-modal-confirm').addEventListener('click', confirm);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) close();
            });

            // Prevent clicks on textarea from closing modal
            textarea.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            textarea.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });
            textarea.addEventListener('focus', (e) => {
                e.stopPropagation();
            });

            textarea.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Escape') {
                    e.preventDefault();
                    close();
                }
                // Allow Ctrl+Enter to confirm
                if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    confirm();
                }
            });

            textarea.addEventListener('input', updateLineNumbers);
            textarea.addEventListener('scroll', () => {
                gutter.scrollTop = textarea.scrollTop;
            });
        });
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    openGenerationModal() {
        // Get or create modal
        let modal = document.querySelector('ai-generation-modal');
        if (!modal) {
            modal = document.createElement('ai-generation-modal');
            document.body.appendChild(modal);
        }

        modal.open({
            type: 'scripts',
            characterData: this.botData,
            additionalInput: { scriptType: 'Lorebook', description: '' },
            onInsert: async (content) => {
                // Add the generated script
                const scriptName = await this.showScriptNameModal();
                if (scriptName) {
                    await this.saveScript(scriptName, content);
                }
            },
            onAppend: async (content) => {
                // Same as insert for scripts
                const scriptName = await this.showScriptNameModal();
                if (scriptName) {
                    await this.saveScript(scriptName, content);
                }
            }
        });
    }
}

customElements.define('bot-scripts-view', BotScriptsView);
