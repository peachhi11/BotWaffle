/**
 * Application Router and State Manager
 * Handles navigation, tool switching, and view management
 */

(function() {
    'use strict';

    // DOM element references
    const container = document.getElementById('view-container');
    const workspace = document.getElementById('workspace');
    const toolContainer = document.getElementById('tool-view-container');
    const promptWaffleView = document.getElementById('prompt-waffle-view');

    /**
     * Check for unsaved changes before switching context
     * @returns {boolean} True if user cancelled, false if safe to proceed
     */
    function checkUnsavedChanges() {
        const editor = container.querySelector('chatbot-editor');
        if (editor && editor.hasUnsavedChanges) {
            return !confirm('You have unsaved changes. Are you sure you want to leave? Your changes will be lost.');
        }
        return false;
    }

    /**
     * Inject BotWaffle theme into PromptWaffle webview
     */
    function injectPromptWaffleTheme() {
        const themeCSS = `
            :root {
                /* Backgrounds */
                --bg-app: #0B1121;
                --bg-sidebar: #151E32;
                --bg-panel: #1E2945;
                --bg-input: #0F172A;
                --bg-hover: #1E2945;
                --bg-active: #2D3B5E;

                /* Accents (Gold & Cyan) */
                --accent-primary: #FFAB00;
                --accent-hover: #FFC400;
                --accent-success: #10B981;
                --accent-danger: #EF4444;
                --accent-warning: #F59E0B;
                --accent-info: #00F5FF;

                /* Text */
                --text-primary: #F0F4F8;
                --text-secondary: #94A3B8;
                --text-muted: #64748B;
                --text-on-accent: #000000;

                /* Borders */
                --border-subtle: #334155;
                --border-medium: #475569;
                --border-focus: #00F5FF;
            }
            
            /* Core Layout */
            body, .app-layout { 
                background-color: #0B1121 !important; 
                color: #F0F4F8 !important; 
            }
            
            .sidebar { 
                background-color: #151E32 !important; 
                border-right: 1px solid #334155 !important; 
            }
            
            /* Hide duplicate logo */
            .sidebar-logo { 
                display: none !important; 
            }
            
            /* Loading screen */
            .loading-screen { 
                background: linear-gradient(135deg, #0B1121 0%, #151E32 100%) !important;
            }
            
            .loading-title {
                background: linear-gradient(135deg, #FFAB00, #00F5FF) !important;
                -webkit-background-clip: text !important;
                -webkit-text-fill-color: transparent !important;
            }
            
            .loading-fill {
                background: linear-gradient(90deg, #FFAB00, #00F5FF) !important;
                box-shadow: 0 0 10px rgba(255, 171, 0, 0.5) !important;
            }
            
            
            /* Buttons - Fix contrast */
            button {
                color: #F0F4F8 !important;
                background: #1E2945 !important;
                border: 1px solid #334155 !important;
            }
            
            button:hover {
                background: #FFAB00 !important;
                color: #000 !important;
                border-color: #FFC400 !important;
                box-shadow: 0 0 12px rgba(255, 171, 0, 0.4) !important;
            }
            
            .action-button,
            .action-button:not(:hover) {
                color: #F0F4F8 !important;
            }
            
            .action-button:hover {
                background: #FFAB00 !important;
                color: #000 !important;
                box-shadow: 0 0 12px rgba(255, 171, 0, 0.4) !important;
            }
            
            /* Secondary buttons */
            .secondary-btn {
                color: #F0F4F8 !important;
                background: #1E2945 !important;
            }
            
            /* Danger buttons keep red accent */
            .danger-btn {
                background: #EF4444 !important;
                color: #FFF !important;
            }
            
            .danger-btn:hover {
                background: #DC2626 !important;
            }
            
            /* Focus states - Cyan glow */
            input:focus, textarea:focus, select:focus {
                border-color: #00F5FF !important;
                box-shadow: 0 0 0 2px rgba(0, 245, 255, 0.2) !important;
            }
            
            /* Interactive elements */
            .snippet-item:hover {
                background-color: #1E2945 !important;
                border-color: #334155 !important;
            }
            
            .tree-item-header:hover {
                background-color: #1E2945 !important;
            }
            
            /* Primary accent elements */
            .kofi-link,
            .primary-btn,
            [class*="primary"] {
                background: linear-gradient(135deg, #FFAB00, #FFC400) !important;
                color: #000 !important;
            }
        `;

        try {
            promptWaffleView.insertCSS(themeCSS);
            console.log('[Theme] Applied BotWaffle Navy/Gold theme to PromptWaffle');
        } catch (e) {
            console.warn('[Theme] Could not inject CSS yet, webview might not be ready', e);
        }
    }

    /**
     * Show the chatbot list view
     */
    function showList() {
        container.innerHTML = '<chatbot-list></chatbot-list>';
    }

    // Tool Switching Logic
    document.querySelector('tool-switcher').addEventListener('tool-switch', (e) => {
        // If switching TO bot-waffle, no check needed (we just show/hide divs, state persists).
        // But if switching FROM bot-waffle (where editor lives), we might want to warn?
        // Actually, since we hide #workspace but don't destroy it, the editor state persists!
        // So switching tools is safe. No warning needed there.

        const tool = e.detail.tool;
        console.log('Switching to:', tool);

        if (tool === 'bot-waffle') {
            workspace.style.display = 'flex';
            toolContainer.style.display = 'none';
            promptWaffleView.style.display = 'none';
            // Force a layout flush and repaint to prevent black screen after idle
            // on Windows when switching back from PromptWaffle
            void workspace.offsetHeight;
            requestAnimationFrame(() => {
                window.dispatchEvent(new Event('resize'));
            });
        } else if (tool === 'prompt-waffle') {
            workspace.style.display = 'none';
            toolContainer.style.display = 'flex';
            promptWaffleView.style.display = 'inline-flex';
            injectPromptWaffleTheme();
            // Force repaint on the webview after making it visible
            void promptWaffleView.offsetHeight;
        }
    });

    // Listen for events that would replace the editor
    document.addEventListener('create-bot', () => {
        if (checkUnsavedChanges()) return;

        const editor = document.createElement('chatbot-editor');
        editor.mode = 'create';
        container.innerHTML = '';
        container.appendChild(editor);
    });

    document.addEventListener('edit-bot', async (e) => {
        if (checkUnsavedChanges()) return;

        const botId = e.detail.id;
        const editor = document.createElement('chatbot-editor');
        editor.mode = 'edit';

        // Show loading
        container.innerHTML = '<div style="color:white; padding: 20px;">Loading...</div>';

        // Always fetch fresh data when opening editor
        const botData = await window.api.chatbot.get(botId);
        editor.chatbotData = botData;

        container.innerHTML = '';
        container.appendChild(editor);
        
        // Store editor reference for refreshing
        window.currentEditor = editor;
    });
    
    // Listen for bot images updated event to refresh editor if it's open
    document.addEventListener('bot-images-updated', async (e) => {
        const { botId } = e.detail;
        const editor = document.querySelector('chatbot-editor');
        if (editor && editor.currentId === botId) {
            // Refresh the editor with fresh data
            const botData = await window.api.chatbot.get(botId);
            editor.chatbotData = botData;
        }
    });

    // Listen for 'editor-cancel' to return to list
    document.addEventListener('editor-cancel', () => {
        if (checkUnsavedChanges()) return;
        showList();
    });

    // Listen for 'editor-save' - just refresh the list data but stay in editor
    // (Don't navigate away - user should stay in editor after saving)
    document.addEventListener('editor-save', () => {
        // Refresh the chatbot list in the background (if it exists)
        const chatbotList = document.querySelector('chatbot-list');
        if (chatbotList && chatbotList.loadChatbots) {
            chatbotList.loadChatbots();
        }
        // Do NOT call showList() - stay in editor
    });

    // Listen for bot creation notifications from PromptWaffle
    if (window.api && window.api.onBotListRefresh) {
        window.api.onBotListRefresh((data) => {
            console.log('[App Router] Bot created notification received:', data);
            // Refresh the chatbot list if it's visible
            const chatbotList = document.querySelector('chatbot-list');
            if (chatbotList && chatbotList.loadChatbots) {
                chatbotList.loadChatbots();
            }
        });
    }

    // Listen for sidebar navigation (Library / Settings)
    document.addEventListener('navigate-library', () => {
        if (checkUnsavedChanges()) return;
        showList();
    });

    document.addEventListener('navigate-settings', () => {
        if (checkUnsavedChanges()) return;
        container.innerHTML = '<lmstudio-settings></lmstudio-settings>';
    });

    // Listen for bot-specific view navigation
    document.addEventListener('navigate-bot-view', async (e) => {
        if (checkUnsavedChanges()) return;

        const { view, botId } = e.detail;
        if (!botId) return;

        // Show loading
        container.innerHTML = '<div style="color:white; padding: 20px;">Loading...</div>';

        let viewElement = null;

        switch (view) {
            case 'pictures':
                viewElement = document.createElement('bot-images-view');
                viewElement.botId = botId;
                break;
            case 'scripts':
                viewElement = document.createElement('bot-scripts-view');
                viewElement.botId = botId;
                break;
            case 'saved-chats':
                viewElement = document.createElement('bot-saved-chats-view');
                viewElement.botId = botId;
                break;
            case 'image-prompts':
                viewElement = document.createElement('bot-image-prompts-view');
                viewElement.botId = botId;
                break;
            case 'character-bio':
                viewElement = document.createElement('bot-bio-view');
                viewElement.botId = botId;
                break;
            default:
                console.warn('Unknown bot view:', view);
                showList();
                return;
        }

        container.innerHTML = '';
        container.appendChild(viewElement);
    });

})();

// Initialize Feather icons after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (typeof feather !== 'undefined' && typeof feather.replace === 'function') {
        feather.replace();
    }
});
