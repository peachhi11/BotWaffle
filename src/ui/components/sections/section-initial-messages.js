class SectionInitialMessages extends customElements.get('section-base') {
    constructor() {
        super();
        this._title = 'Initial Messages';
        this._messages = [];
    }

    set messages(value) {
        this._messages = Array.isArray(value) ? value : [];
        if (this.isConnected && this.querySelector('.section-body')) {
            this.renderContent();
        }
    }

    get messages() {
        return this._messages || [];
    }

    connectedCallback() {
        super.connectedCallback();
        const removeBtn = this.querySelector('.remove-btn');
        if (removeBtn) removeBtn.remove();
    }

    renderContent() {
        const body = this.querySelector('.section-body');
        const initialMessages = this._data.initialMessages || this._data.scenario?.initialMessages || this._data.scenario?.messages || [];
        
        // Only initialize from data if we don't already have messages (preserve existing messages)
        if (this._messages.length === 0) {
            // Initialize messages if empty
            if (initialMessages.length === 0) {
                this._messages = [{ id: this._generateId(), text: '' }];
            } else {
                this._messages = initialMessages;
            }
        }

        const escapeHtml = window.SecurityUtils.escapeHtml;
        
        body.innerHTML = `
            <div class="initial-messages-section">
                <div class="form-group">
                    <div class="initial-messages-header">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <label>Initial Messages</label>
                            <button type="button" class="ai-generate-btn" id="generate-messages-btn" title="Generate with AI">
                                <i data-feather="zap"></i>
                                Generate with AI
                            </button>
                            <button type="button" class="ai-edit-btn" id="edit-messages-btn" title="Edit with AI">
                                <i data-feather="edit-3"></i>
                                Edit with AI
                            </button>
                        </div>
                        <button type="button" id="add-message-btn" class="secondary-btn small">+ Add Message</button>
                    </div>
                    <div class="messages-tabs" id="messages-tabs">
                        ${this._messages.map((msg, index) => {
                            const tokenCount = window.TokenCounter ? window.TokenCounter.estimateTokens(msg.text || '') : 0;
                            return `
                            <button type="button" class="message-tab ${index === 0 ? 'active' : ''}" data-index="${index}">
                                Message ${index + 1} (${tokenCount} tokens)
                                ${this._messages.length > 1 ? `<span class="tab-close" data-index="${index}" style="pointer-events: auto; z-index: 10; position: relative;">×</span>` : ''}
                            </button>
                        `;
                        }).join('')}
                    </div>
                    <div class="messages-content" id="messages-content">
                        ${this._messages.map((msg, index) => `
                            <div class="message-panel ${index === 0 ? 'active' : ''}" data-index="${index}">
                                <textarea class="input-field message-textarea" rows="6" placeholder="Enter initial message...">${escapeHtml(msg.text || '')}</textarea>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        this._setupListeners();
    }

    _generateId() {
        return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    _setupListeners() {
        const tabsContainer = this.querySelector('#messages-tabs');
        const panels = this.querySelectorAll('.message-panel');
        const addBtn = this.querySelector('#add-message-btn');
        const generateBtn = this.querySelector('#generate-messages-btn');

        // Use event delegation for tabs (handles dynamically created tabs)
        if (tabsContainer) {
            // Handle mousedown on close button (fires before click, more reliable)
            tabsContainer.addEventListener('mousedown', (e) => {
                const closeBtn = e.target.closest('.tab-close') || (e.target.classList.contains('tab-close') ? e.target : null);
                if (closeBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    const index = parseInt(closeBtn.getAttribute('data-index'), 10);
                    if (!isNaN(index) && index >= 0) {
                        // Use setTimeout to allow mousedown to complete, then show modal
                        setTimeout(() => {
                            this._confirmRemoveMessage(index);
                        }, 0);
                    }
                    return false;
                }
            }, true);

            // Handle click for tab switching
            tabsContainer.addEventListener('click', (e) => {
                // Skip if close button was clicked (handled by mousedown)
                if (e.target.closest('.tab-close') || e.target.classList.contains('tab-close')) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
                
                // Check if tab itself was clicked (but not the close button)
                const tab = e.target.closest('.message-tab');
                if (tab && !e.target.closest('.tab-close') && !e.target.classList.contains('tab-close')) {
                    const index = parseInt(tab.getAttribute('data-index'), 10);
                    if (!isNaN(index) && index >= 0) {
                        this._switchTab(index);
                    }
                }
            });
        }

        // Add new message
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                this._addMessage();
            });
        }

        // Generate button
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.openGenerationModal(false));
        }

        // Edit button
        const editBtn = this.querySelector('#edit-messages-btn');
        if (editBtn) {
            editBtn.addEventListener('click', () => this.openGenerationModal(true));
        }

        // Replace feather icons
        if (window.feather) {
            window.feather.replace();
        }

        // Save content on input and update token counts
        panels.forEach(panel => {
            const textarea = panel.querySelector('.message-textarea');
            if (textarea) {
                // Auto-resize function
                const autoResize = () => {
                    textarea.style.height = 'auto';
                    textarea.style.height = textarea.scrollHeight + 'px';
                };
                
                // Set initial height
                autoResize();
                
                // Prevent header click from interfering
                textarea.addEventListener('click', (e) => {
                    e.stopPropagation();
                });
                textarea.addEventListener('focus', (e) => {
                    e.stopPropagation();
                });
                textarea.addEventListener('input', () => {
                    autoResize();
                    const index = parseInt(panel.getAttribute('data-index'), 10);
                    if (this._messages[index]) {
                        this._messages[index].text = textarea.value;
                    }
                    // Update token count for this message
                    this._updateMessageTokenCount(index);
                    // Trigger editor to update all token counts
                    this.dispatchEvent(new CustomEvent('section-change', { bubbles: true }));
                });
                
                // Resize on paste
                textarea.addEventListener('paste', () => {
                    setTimeout(autoResize, 0);
                });
            }
        });
        
        // Initial token count update
        setTimeout(() => {
            panels.forEach((panel, index) => {
                this._updateMessageTokenCount(index);
            });
        }, 100);
    }

    _switchTab(index) {
        const tabs = this.querySelectorAll('.message-tab');
        const panels = this.querySelectorAll('.message-panel');
        
        tabs.forEach(tab => tab.classList.remove('active'));
        panels.forEach(panel => panel.classList.remove('active'));
        
        if (tabs[index]) tabs[index].classList.add('active');
        if (panels[index]) panels[index].classList.add('active');
        
        // Auto-resize the textarea for the active panel
        const activePanel = panels[index];
        if (activePanel) {
            const textarea = activePanel.querySelector('.message-textarea');
            if (textarea) {
                textarea.style.height = 'auto';
                textarea.style.height = textarea.scrollHeight + 'px';
            }
        }
        
        // Update token count when switching tabs (in case content changed)
        this._updateMessageTokenCount(index);
    }

    _addMessage() {
        const newMsg = { id: this._generateId(), text: '' };
        this._messages.push(newMsg);
        this.renderContent();
        
        // Switch to the new tab
        setTimeout(() => {
            this._switchTab(this._messages.length - 1);
        }, 50);
    }

    _confirmRemoveMessage(index) {
        if (this._messages.length <= 1) {
            // Don't allow removing the last message
            return;
        }

        const messageText = this._messages[index]?.text || '';
        const messagePreview = messageText.length > 50 
            ? messageText.substring(0, 50) + '...' 
            : messageText || '(empty message)';

        const escapeHtml = window.SecurityUtils ? window.SecurityUtils.escapeHtml : (text) => String(text ?? '');
        const safePreview = escapeHtml(messagePreview);

        // Create confirmation modal
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>Delete Message</h3>
                    <button class="modal-close" type="button">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom: 16px; padding: 12px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 4px; color: var(--danger);">
                        <strong>Warning:</strong> This action cannot be undone.
                    </div>
                    <div class="form-group">
                        <label>Are you sure you want to delete this message?</label>
                        <div style="margin: 8px 0; padding: 8px; background: #1a1a1a; border-radius: 4px; font-style: italic; color: var(--text-secondary);">
                            "${safePreview}"
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="secondary-btn cancel-delete-message">Cancel</button>
                    <button class="danger-btn confirm-delete-message">Delete Message</button>
                </div>
            </div>
        `;

        const closeModal = () => overlay.remove();

        overlay.querySelector('.modal-close').addEventListener('click', closeModal);
        overlay.querySelector('.cancel-delete-message').addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        overlay.querySelector('.confirm-delete-message').addEventListener('click', () => {
            this._removeMessage(index);
            closeModal();
        });

        document.body.appendChild(overlay);
    }

    _removeMessage(index) {
        if (this._messages.length <= 1) {
            // Don't allow removing the last message
            return;
        }
        
        this._messages.splice(index, 1);
        this.renderContent();
        
        // Switch to first tab if we removed the active one
        if (index >= this._messages.length) {
            this._switchTab(0);
        } else {
            this._switchTab(index);
        }
    }
    
    _updateMessageTokenCount(index) {
        if (!window.TokenCounter) return;
        
        const tab = this.querySelector(`.message-tab[data-index="${index}"]`);
        const panel = this.querySelector(`.message-panel[data-index="${index}"]`);
        
        if (!tab || !panel) return;
        
        const textarea = panel.querySelector('.message-textarea');
        if (!textarea) return;
        
        const tokenCount = window.TokenCounter.estimateTokens(textarea.value);
        // Extract base text (Message X) and preserve close button
        const closeBtn = tab.querySelector('.tab-close');
        const hasCloseBtn = closeBtn !== null;
        // Get the base text by removing token count and close button text
        let baseText = tab.textContent.replace(/\s*\(\d+\s*tokens?\)\s*/i, '').replace(/\s*×\s*$/, '').trim();
        if (!baseText.match(/^Message\s+\d+$/)) {
            // Fallback: just use "Message X"
            baseText = `Message ${index + 1}`;
        }
        
        // Update tab text, preserving close button structure
        // Note: Event listeners are handled via delegation in _setupListeners, so no need to re-attach
        if (hasCloseBtn && this._messages.length > 1) {
            tab.innerHTML = `${baseText} (${tokenCount} tokens)<span class="tab-close" data-index="${index}" style="pointer-events: auto; z-index: 10; position: relative;">×</span>`;
        } else {
            tab.innerHTML = `${baseText} (${tokenCount} tokens)`;
        }
    }

    getData() {
        // Collect all message texts
        const messages = [];
        this._messages.forEach(msg => {
            const panel = this.querySelector(`.message-panel[data-index="${this._messages.indexOf(msg)}"]`);
            if (panel) {
                const textarea = panel.querySelector('.message-textarea');
                const text = textarea ? textarea.value : msg.text;
                if (text.trim()) {
                    messages.push({ id: msg.id, text: text.trim() });
                }
            } else {
                // Fallback: use stored value
                if (msg.text && msg.text.trim()) {
                    messages.push({ id: msg.id, text: msg.text.trim() });
                }
            }
        });

        return messages.length > 0 ? messages : [];
    }

    getActiveTabIndex() {
        const activeTab = this.querySelector('.message-tab.active');
        if (activeTab) {
            return parseInt(activeTab.dataset.index, 10);
        }
        return 0;
    }

    openGenerationModal(isEdit = false) {
        const editor = this.closest('chatbot-editor');
        if (!editor) return;

        const characterData = editor.getCharacterData();
        const activeIndex = this.getActiveTabIndex();
        
        // Get current content if editing
        let currentContent = '';
        if (isEdit) {
            const activePanel = this.querySelector(`.message-panel[data-index="${activeIndex}"]`);
            if (activePanel) {
                const textarea = activePanel.querySelector('.message-textarea');
                currentContent = textarea ? textarea.value : '';
            }
            
            if (!currentContent.trim()) {
                alert('No content to edit. Please add some content first or use Generate instead.');
                return;
            }
        }
        
        // Get or create modal
        let modal = document.querySelector('ai-generation-modal');
        if (!modal) {
            modal = document.createElement('ai-generation-modal');
            document.body.appendChild(modal);
        }

        modal.open({
            type: 'initialMessages',
            characterData: characterData,
            additionalInput: { count: 1, activeTabIndex: activeIndex },
            isEdit: isEdit,
            currentContent: currentContent,
            onInsert: (content) => {
                // Insert into the currently active message tab
                const activeIndex = this.getActiveTabIndex();
                if (this._messages[activeIndex]) {
                    this._messages[activeIndex].text = content.trim();
                    
                    // Update the textarea in the active panel
                    const activePanel = this.querySelector(`.message-panel[data-index="${activeIndex}"]`);
                    if (activePanel) {
                        const textarea = activePanel.querySelector('.message-textarea');
                        if (textarea) {
                            textarea.value = content.trim();
                            textarea.dispatchEvent(new Event('input'));
                        }
                    }
                    
                    this._updateMessageTokenCount(activeIndex);
                    this.dispatchEvent(new CustomEvent('section-change', { bubbles: true }));
                }
            },
            onAppend: (content) => {
                // Append to the currently active message tab
                const activeIndex = this.getActiveTabIndex();
                if (this._messages[activeIndex]) {
                    const currentText = this._messages[activeIndex].text || '';
                    this._messages[activeIndex].text = currentText ? `${currentText}\n\n${content.trim()}` : content.trim();
                    
                    // Update the textarea in the active panel
                    const activePanel = this.querySelector(`.message-panel[data-index="${activeIndex}"]`);
                    if (activePanel) {
                        const textarea = activePanel.querySelector('.message-textarea');
                        if (textarea) {
                            textarea.value = this._messages[activeIndex].text;
                            textarea.dispatchEvent(new Event('input'));
                        }
                    }
                    
                    this._updateMessageTokenCount(activeIndex);
                    this.dispatchEvent(new CustomEvent('section-change', { bubbles: true }));
                }
            }
        });
    }
}

customElements.define('section-initial-messages', SectionInitialMessages);
