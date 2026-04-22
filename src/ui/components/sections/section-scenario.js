class SectionScenario extends customElements.get('section-base') {
    constructor() {
        super();
        this._title = 'Scenario';
    }

    connectedCallback() {
        super.connectedCallback();
        const removeBtn = this.querySelector('.remove-btn');
        if (removeBtn) removeBtn.remove();
    }

    renderContent() {
        const body = this.querySelector('.section-body');
        const scenarioData = this._data.scenario || {};
        
        const escapeHtml = window.SecurityUtils.escapeHtml;
        const scenarioValue = scenarioData.scenario || scenarioData.text || '';
        
        body.innerHTML = `
            <div class="scenario-section">
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: 8px;">
                        <span>Scenario</span>
                        <button class="ai-generate-btn" id="generate-scenario-btn" title="Generate with AI">
                            <i data-feather="zap"></i>
                            Generate with AI
                        </button>
                        <button class="ai-edit-btn" id="edit-scenario-btn" title="Edit with AI">
                            <i data-feather="edit-3"></i>
                            Edit with AI
                        </button>
                    </label>
                    <textarea id="scenario-text" class="input-field" rows="6" placeholder="Describe the scenario or setting...">${escapeHtml(scenarioValue)}</textarea>
                </div>
            </div>
        `;
        
        // Setup listeners to prevent header click from interfering and auto-resize
        const textarea = body.querySelector('#scenario-text');
        if (textarea) {
            // Auto-resize function
            const autoResize = () => {
                textarea.style.height = 'auto';
                textarea.style.height = textarea.scrollHeight + 'px';
            };
            
            // Set initial height
            autoResize();
            
            textarea.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            textarea.addEventListener('focus', (e) => {
                e.stopPropagation();
            });
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
        const generateBtn = body.querySelector('#generate-scenario-btn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.openGenerationModal(false));
        }

        // Set up AI edit button
        const editBtn = body.querySelector('#edit-scenario-btn');
        if (editBtn) {
            editBtn.addEventListener('click', () => this.openGenerationModal(true));
        }

        // Replace feather icons
        if (window.feather) {
            window.feather.replace();
        }
    }

    openGenerationModal(isEdit = false) {
        const editor = this.closest('chatbot-editor');
        if (!editor) return;

        const characterData = editor.getCharacterData();
        
        // Get current content if editing
        let currentContent = '';
        if (isEdit) {
            const textarea = this.querySelector('#scenario-text');
            currentContent = textarea ? textarea.value : '';
            
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
            type: 'scenario',
            characterData: characterData,
            isEdit: isEdit,
            currentContent: currentContent,
            onInsert: (content) => {
                const textarea = this.querySelector('#scenario-text');
                if (textarea) {
                    textarea.value = content;
                    textarea.dispatchEvent(new Event('input'));
                    this.dispatchEvent(new CustomEvent('section-change', { bubbles: true }));
                }
            },
            onAppend: (content) => {
                const textarea = this.querySelector('#scenario-text');
                if (textarea) {
                    textarea.value = textarea.value ? `${textarea.value}\n\n${content}` : content;
                    textarea.dispatchEvent(new Event('input'));
                    this.dispatchEvent(new CustomEvent('section-change', { bubbles: true }));
                }
            }
        });
    }

    getData() {
        const scenarioText = this.querySelector('#scenario-text');
        const scenarioValue = scenarioText ? scenarioText.value.trim() : '';

        return {
            scenario: scenarioValue,
            text: scenarioValue // Backward compatibility
        };
    }
}

customElements.define('section-scenario', SectionScenario);
