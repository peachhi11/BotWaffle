class SectionPersonality extends customElements.get('section-base') {
    constructor() {
        super();
        this._title = 'Personality';
    }

    connectedCallback() {
        super.connectedCallback();
        const removeBtn = this.querySelector('.remove-btn');
        if (removeBtn) removeBtn.remove();
    }

    renderContent() {
        // Get personality text - handle both old format (object) and new format (string)
        let personalityText = '';
        if (this._data.personality) {
            if (typeof this._data.personality === 'string') {
                personalityText = this._data.personality;
            } else if (this._data.personality.characterData) {
                // Old format - extract text from characterData if available
                const char = this._data.personality.characterData;
                personalityText = char.personality || '';
            } else if (this._data.personality.personality) {
                personalityText = this._data.personality.personality;
            } else if (this._data.personality.text) {
                personalityText = this._data.personality.text;
            }
        }

        const body = this.querySelector('.section-body');
        const escapeHtml = window.SecurityUtils ? window.SecurityUtils.escapeHtml : (text) => {
            if (text === null || text === undefined) return '';
            return String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        };

        body.innerHTML = `
            <div class="form-group">
                <label style="display: flex; align-items: center; gap: 8px;">
                    <span>Personality</span>
                    <button class="ai-generate-btn" id="generate-personality-btn" title="Generate with AI">
                        <i data-feather="zap"></i>
                        Generate with AI
                    </button>
                    <button class="ai-edit-btn" id="edit-personality-btn" title="Edit with AI">
                        <i data-feather="edit-3"></i>
                        Edit with AI
                    </button>
                </label>
                <textarea id="personality-textarea" class="input-field" rows="10" 
                          placeholder="Describe the character's personality, traits, behavior, and mannerisms...">${escapeHtml(personalityText)}</textarea>
                <div class="field-hint">Enter the character's personality description</div>
            </div>
        `;

        // Set up change listener and auto-resize
        const textarea = body.querySelector('#personality-textarea');
        if (textarea) {
            // Auto-resize function
            const autoResize = () => {
                textarea.style.height = 'auto';
                textarea.style.height = textarea.scrollHeight + 'px';
            };
            
            // Set initial height
            autoResize();
            
            // Resize on input
            textarea.addEventListener('input', () => {
                autoResize();
                this.dispatchEvent(new CustomEvent('section-change', { bubbles: true }));
            });
            
            // Resize on paste
            textarea.addEventListener('paste', () => {
                setTimeout(autoResize, 0);
            });
        }

        // Set up AI generation button
        const generateBtn = body.querySelector('#generate-personality-btn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.openGenerationModal(false));
        }

        // Set up AI edit button
        const editBtn = body.querySelector('#edit-personality-btn');
        if (editBtn) {
            editBtn.addEventListener('click', () => this.openGenerationModal(true));
        }

        // Replace feather icons
        if (window.feather) {
            window.feather.replace();
        }
    }

    openGenerationModal(isEdit = false) {
        console.log('[Personality] Opening generation modal, isEdit:', isEdit);
        const editor = this.closest('chatbot-editor');
        if (!editor) {
            console.error('[Personality] No editor found');
            return;
        }

        const characterData = editor.getCharacterData();
        console.log('[Personality] Character data:', characterData);
        
        // Get current content if editing
        let currentContent = '';
        if (isEdit) {
            const textarea = this.querySelector('#personality-textarea');
            currentContent = textarea ? textarea.value : '';
            
            if (!currentContent.trim()) {
                alert('No content to edit. Please add some content first or use Generate instead.');
                return;
            }
        }
        
        // Get or create modal
        let modal = document.querySelector('ai-generation-modal');
        if (!modal) {
            console.log('[Personality] Creating new modal');
            modal = document.createElement('ai-generation-modal');
            document.body.appendChild(modal);
        } else {
            console.log('[Personality] Using existing modal');
        }

        console.log('[Personality] Opening modal with type: personality');
        modal.open({
            type: 'personality',
            characterData: characterData,
            isEdit: isEdit,
            currentContent: currentContent,
            onInsert: (content) => {
                const textarea = this.querySelector('#personality-textarea');
                if (textarea) {
                    textarea.value = content;
                    textarea.dispatchEvent(new Event('input'));
                    this.dispatchEvent(new CustomEvent('section-change', { bubbles: true }));
                }
            },
            onAppend: (content) => {
                const textarea = this.querySelector('#personality-textarea');
                if (textarea) {
                    textarea.value = textarea.value ? `${textarea.value}\n\n${content}` : content;
                    textarea.dispatchEvent(new Event('input'));
                    this.dispatchEvent(new CustomEvent('section-change', { bubbles: true }));
                }
            }
        });
    }

    getData() {
        const textarea = this.querySelector('#personality-textarea');
        if (textarea) {
            return textarea.value || '';
        }
        return '';
    }
}

customElements.define('section-personality', SectionPersonality);
