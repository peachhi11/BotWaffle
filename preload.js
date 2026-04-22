const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    chatbot: {
        list: () => ipcRenderer.invoke('chatbot:list'),
        create: (data) => ipcRenderer.invoke('chatbot:create', data),
        update: (id, data) => ipcRenderer.invoke('chatbot:update', id, data),
        delete: (id) => ipcRenderer.invoke('chatbot:delete', id),
        deleteAll: () => ipcRenderer.invoke('chatbot:delete-all'),
        get: (id) => ipcRenderer.invoke('chatbot:get', id),
        categories: () => ipcRenderer.invoke('chatbot:categories'),
        export: (id) => ipcRenderer.invoke('chatbot:export', id)
    },
    templates: {
        list: () => ipcRenderer.invoke('template:list'),
        save: (name, layout) => ipcRenderer.invoke('template:save', name, layout),
        get: (id) => ipcRenderer.invoke('template:get', id),
        delete: (id) => ipcRenderer.invoke('template:delete', id)
    },
    // Listen for refresh notifications
    onBotListRefresh: (callback) => {
        ipcRenderer.on('refresh-bot-list', (event, data) => callback(data));
    },
    removeBotListRefreshListener: () => {
        ipcRenderer.removeAllListeners('refresh-bot-list');
    },
    assets: {
        select: (multiple = false) => ipcRenderer.invoke('assets:select', multiple),
        save: (path, characterId) => ipcRenderer.invoke('assets:save', path, characterId),
        delete: (filePath) => ipcRenderer.invoke('assets:delete', filePath)
    },
    data: {
        export: () => ipcRenderer.invoke('data:export'),
        exportCharacter: (characterId, characterName) => ipcRenderer.invoke('data:export-character', characterId, characterName),
        import: () => ipcRenderer.invoke('data:import'),
        verifyBackup: (zipPath) => ipcRenderer.invoke('data:verify-backup', zipPath),
        openBackupDialog: () => ipcRenderer.invoke('data:open-backup-dialog')
    },
    openExternal: (url) => ipcRenderer.invoke('openExternal', url),
    openPath: (filePath) => ipcRenderer.invoke('openPath', filePath),
    getCharacterFolderPath: (characterId, subfolder) => ipcRenderer.invoke('getCharacterFolderPath', characterId, subfolder),
    saveTextFile: (content, defaultFilename) => ipcRenderer.invoke('saveTextFile', content, defaultFilename),
    saveBinaryFile: (base64Data, defaultFilename) => ipcRenderer.invoke('saveBinaryFile', base64Data, defaultFilename),
    comfyui: {
        getFolder: () => ipcRenderer.invoke('get-comfyui-folder'),
        savePrompt: (prompt, folderPath, filename) => ipcRenderer.invoke('save-prompt-to-file', prompt, folderPath, filename)
    },
    lmstudio: {
        getConfig: () => ipcRenderer.invoke('lmstudio:get-config'),
        saveConfig: (config) => ipcRenderer.invoke('lmstudio:save-config', config),
        updatePrompt: (type, prompt) => ipcRenderer.invoke('lmstudio:update-prompt', type, prompt),
        resetPrompt: (type) => ipcRenderer.invoke('lmstudio:reset-prompt', type),
        testConnection: () => ipcRenderer.invoke('lmstudio:test-connection'),
        listModels: () => ipcRenderer.invoke('lmstudio:list-models'),
        generate: (type, characterData, selectedSections, additionalInput, customSystemPrompt, isEdit, currentContent) => 
            ipcRenderer.invoke('lmstudio:generate', type, characterData, selectedSections, additionalInput, customSystemPrompt, isEdit, currentContent),
        cancel: () => ipcRenderer.invoke('lmstudio:cancel'),
        reloadPrompts: () => ipcRenderer.invoke('lmstudio:reload-prompts'),
        savePromptToFile: (type, content) => ipcRenderer.invoke('lmstudio:save-prompt-to-file', type, content),
        listPromptFiles: (category) => ipcRenderer.invoke('lmstudio:list-prompt-files', category),
        loadPromptFromFile: (category, filename) => ipcRenderer.invoke('lmstudio:load-prompt-from-file', category, filename),
        getPromptsPath: () => ipcRenderer.invoke('lmstudio:get-prompts-path'),
        openPromptsFolder: () => ipcRenderer.invoke('lmstudio:open-prompts-folder')
    }
});
