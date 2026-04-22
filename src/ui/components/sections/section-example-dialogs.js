class SectionExampleDialogs extends customElements.get('section-base') {
    constructor() {
        super();
        this._title = 'Example Dialogs';
    }

    connectedCallback() {
        super.connectedCallback();
        const removeBtn = this.querySelector('.remove-btn');
        if (removeBtn) removeBtn.remove();
    }

    renderContent() {
        const body = this.querySelector('.section-body');
        
        // Get the dialog text - handle both old array format and new string format
        let dialogText = '';
        const dialogsData = this._data.exampleDialogs || this._data.dialogs || '';
        
        if (typeof dialogsData === 'string') {
            dialogText = dialogsData;
        } else if (Array.isArray(dialogsData) && dialogsData.length > 0) {
            // Convert old array format to single text
            dialogText = dialogsData.map(d => {
                if (typeof d === 'string') return d;
                if (d && typeof d === 'object' && d.text) return d.text;
                return '';
            }).filter(Boolean).join('\n\n');
        }

        const escapeHtml = window.SecurityUtils.escapeHtml;
        
        body.innerHTML = `
            <div class="example-dialogs-section">
                <div class="form-group">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <label>Example Dialogs</label>
                        <button type="button" class="ai-generate-btn" id="generate-dialogs-btn" title="Generate with AI">
                            <i data-feather="zap"></i>
                            Generate with AI
                        </button>
                        <button type="button" class="ai-edit-btn" id="edit-dialogs-btn" title="Edit with AI">
                            <i data-feather="edit-3"></i>
                            Edit with AI
                        </button>
                    </div>
                    <textarea 
                        id="example-dialogs-text" 
                        class="input-field" 
                        rows="10" 
                        placeholder="Enter example conversation exchanges between the user and character. Format as:

User: Hello!
Character: Hi there! How can I help you today?

User: What's your favorite thing to do?
Character: I love reading books and discussing them with people!">${escapeHtml(dialogText)}</textarea>
                    <div class="field-hint">Write example conversation exchanges to demonstrate the character's speaking style and personality</div>
                </div>
            </div>
        `;

        this._setupListeners();
    }

    _setupListeners() {
        const textarea = this.querySelector('#example-dialogs-text');
        const generateBtn = this.querySelector('#generate-dialogs-btn');
        const editBtn = this.querySelector('#edit-dialogs-btn');

        // Auto-resize textarea
        if (textarea) {
            const autoResize = () => {
                textarea.style.height = 'auto';
                textarea.style.height = Math.max(textarea.scrollHeight, 200) + 'px';
            };
            
            autoResize();
            
            textarea.addEventListener('input', () => {
                autoResize();
                this.dispatchEvent(new CustomEvent('section-change', { 
                    bubbles: true,
                    detail: { section: 'exampleDialogs' }
                }));
            });
        }

        // Generate button
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.openGenerationModal(false));
        }

        // Edit button
        if (editBtn) {
            editBtn.addEventListener('click', () => this.openGenerationModal(true));
        }

        // Replace feather icons
        if (window.feather) {
            window.feather.replace();
        }
    }

    openGenerationModal(isEdit = false) {
        console.log('[Example Dialogs] Opening generation modal');
        
        const editor = document.querySelector('chatbot-editor');
        if (!editor) {
            console.error('[Example Dialogs] Editor not found');
            return;
        }

        const characterData = editor.getCharacterData();
        console.log('[Example Dialogs] Character data:', characterData);

        let modal = document.querySelector('ai-generation-modal');
        if (!modal) {
            modal = document.createElement('ai-generation-modal');
            document.body.appendChild(modal);
        }

        const textarea = this.querySelector('#example-dialogs-text');
        const currentContent = textarea ? textarea.value.trim() : '';

        // Validate for edit mode
        if (isEdit && !currentContent) {
            alert('No content to edit. Please add some example dialogs first or use "Generate with AI" instead.');
            return;
        }

        console.log('[Example Dialogs] Opening modal with type: exampleDialogs');
        modal.open({
            type: 'exampleDialogs',
            characterData: characterData,
            isEdit: isEdit,
            currentContent: currentContent,
            onInsert: (content) => {
                if (textarea) {
                    textarea.value = content;
                    textarea.dispatchEvent(new Event('input'));
                }
            },
            onAppend: (content) => {
                if (textarea) {
                    const current = textarea.value.trim();
                    textarea.value = current ? `${current}\n\n${content}` : content;
                    textarea.dispatchEvent(new Event('input'));
                }
            }
        });
    }

    getData() {
        const textarea = this.querySelector('#example-dialogs-text');
        return textarea ? textarea.value.trim() : '';
    }
}

customElements.define('section-example-dialogs', SectionExampleDialogs);
