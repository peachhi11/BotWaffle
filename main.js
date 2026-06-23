const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const { initializeStorage } = require('./src/core/storage');
const { initializeServices, getService } = require('./src/core/services');
const { registerIpcHandler } = require('./src/core/utils/ipc-helper');
const { initializeLogging, info, error: logError } = require('./src/core/utils/logger');

let mainWindow = null;

// Disable GPU acceleration to avoid black-screen issues on some Windows setups
// This must be called before app.whenReady()
app.disableHardwareAcceleration();

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#1a1a1a', // Match theme bg
        icon: path.join(__dirname, 'src', 'assets', 'logo.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webviewTag: true,
            // Prevent Electron from throttling timers/painting when the window is inactive,
            // which can sometimes manifest as a blank/black screen after idle.
            backgroundThrottling: false
        }
    });

    // Suppress error dialogs for EPIPE errors (harmless logging issues)
    mainWindow.webContents.on('uncaught-exception', (event, error) => {
        if (error && (error.code === 'EPIPE' || error.code === 'ENOTCONN')) {
            event.preventDefault(); // Suppress the error dialog
            return;
        }
    });

    mainWindow.loadFile('src/ui/index.html');
    
    // Set up context menu for right-click
    const contextMenuTemplate = [
        { role: 'undo', label: 'Undo' },
        { role: 'redo', label: 'Redo' },
        { type: 'separator' },
        { role: 'cut', label: 'Cut' },
        { role: 'copy', label: 'Copy' },
        { role: 'paste', label: 'Paste' },
        { role: 'pasteAndMatchStyle', label: 'Paste and Match Style' },
        { role: 'delete', label: 'Delete' },
        { role: 'selectAll', label: 'Select All' },
        { type: 'separator' },
        { role: 'copy', label: 'Copy', accelerator: 'CmdOrCtrl+C', visible: false },
        { role: 'paste', label: 'Paste', accelerator: 'CmdOrCtrl+V', visible: false }
    ];

    const contextMenu = Menu.buildFromTemplate(contextMenuTemplate);

    mainWindow.webContents.on('context-menu', (event, params) => {
        // Show the context menu
        contextMenu.popup();
    });
    
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Handle uncaught exceptions to prevent crashes from EPIPE and other logging errors
process.on('uncaughtException', (error) => {
    // Silently ignore EPIPE and ENOTCONN errors (broken pipe/connection)
    // These are usually harmless logging issues when stdout/stderr is closed
    if (error.code === 'EPIPE' || error.code === 'ENOTCONN') {
        return; // Silently ignore
    }
    // For other uncaught exceptions, log them (but use a safe method)
    try {
        console.error('Uncaught Exception:', error);
    } catch {
        // If even console.error fails, silently ignore
    }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    // Silently ignore EPIPE errors in promise rejections
    if (reason && reason.code === 'EPIPE') {
        return;
    }
    try {
        console.error('Unhandled Rejection:', reason);
    } catch {
        // Silently ignore
    }
});

app.whenReady().then(() => {
    // Initialize logging first
    initializeLogging();
    try {
        info('BotWaffle starting up');
    } catch {
        // Ignore logging errors during startup
    }
    
    // Initialize file system
    initializeStorage();

    // Check and run migration if needed
    const { migrateToCharacterFolders, isMigrationNeeded } = require('./src/core/migration/migrate-to-character-folders');
    (async () => {
        try {
            const needsMigration = await isMigrationNeeded();
            if (needsMigration) {
                info('[Startup] Migration needed - running migration to character folders...');
                const result = await migrateToCharacterFolders();
                if (result.success) {
                    info(`[Startup] Migration completed: ${result.migrated} chatbots migrated`);
                } else {
                    logError('[Startup] Migration failed:', result.error);
                }
            }
        } catch (error) {
            logError('[Startup] Error checking/running migration:', error);
        }
    })();

    // Initialize dependency injection container
    initializeServices();

    // Resolve services from container
    const chatbotManager = getService('chatbotManager');
    const templateManager = getService('templateManager');
    const assetManager = getService('assetManager');
    const lmstudioService = getService('lmstudioService');

    // Initialize LM Studio service
    lmstudioService.initialize().catch(err => {
        logError('[LMStudio] Failed to initialize service', err);
    });

    // IPC Handlers with consistent error handling
    // Chatbot Handlers
    registerIpcHandler(ipcMain, 'chatbot:list', () => chatbotManager.listChatbots(), { errorReturn: [] });
    registerIpcHandler(ipcMain, 'chatbot:create', (_, data) => chatbotManager.createChatbot(data), { rethrow: true });
    registerIpcHandler(ipcMain, 'chatbot:update', (_, id, data) => chatbotManager.updateChatbot(id, data), { rethrow: true });
    registerIpcHandler(ipcMain, 'chatbot:delete', (_, id) => chatbotManager.deleteChatbot(id), { rethrow: true });
    registerIpcHandler(ipcMain, 'chatbot:delete-all', async () => {
        const allBots = await chatbotManager.listChatbots();
        let deleted = 0;
        let skipped = 0;
        let errors = 0;
        for (const bot of allBots) {
            // Never delete demo characters
            if (bot.metadata && bot.metadata.isDemo) {
                skipped++;
                continue;
            }
            try {
                await chatbotManager.deleteChatbot(bot.id);
                deleted++;
            } catch (error) {
                errors++;
                logError(`[Delete All] Error deleting bot ${bot.id}`, error);
            }
        }
        return { deleted, skipped, errors, total: allBots.length };
    }, { rethrow: true });
    registerIpcHandler(ipcMain, 'chatbot:get', (_, id) => chatbotManager.getChatbot(id), { errorReturn: null });
    registerIpcHandler(ipcMain, 'chatbot:categories', () => chatbotManager.getUniqueCategories(), { errorReturn: [] });

    // Export handler requires special handling for dialog
    registerIpcHandler(ipcMain, 'chatbot:export', async (event, id) => {
        const bot = await chatbotManager.getChatbot(id);
        if (!bot) {
            throw new Error('Chatbot not found');
        }

        const parentWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow;
        const { canceled, filePath } = await dialog.showSaveDialog(parentWindow, {
            title: 'Export Chatbot to PNG',
            defaultPath: `${bot.profile.name || 'character'}.png`,
            filters: [{ name: 'PNG Image', extensions: ['png'] }]
        });

        if (canceled || !filePath) return false;

        await chatbotManager.exportChatbot(id, filePath);
        return true;
    }, { rethrow: true });

    // Template Handlers
    registerIpcHandler(ipcMain, 'template:list', () => templateManager.listTemplates(), { errorReturn: [] });
    registerIpcHandler(ipcMain, 'template:save', (_, name, layout) => templateManager.saveTemplate(name, layout), { rethrow: true });
    registerIpcHandler(ipcMain, 'template:get', (_, id) => templateManager.getTemplate(id), { errorReturn: null });
    registerIpcHandler(ipcMain, 'template:delete', (_, id) => templateManager.deleteTemplate(id), { rethrow: true });

    // LM Studio Handlers
    registerIpcHandler(ipcMain, 'lmstudio:get-config', async () => {
        return await lmstudioService.configManager.get();
    }, { errorReturn: null });

    registerIpcHandler(ipcMain, 'lmstudio:save-config', async (_, config) => {
        return await lmstudioService.saveConfig(config);
    }, { rethrow: true });

    registerIpcHandler(ipcMain, 'lmstudio:update-prompt', async (_, type, prompt) => {
        return await lmstudioService.configManager.updatePrompt(type, prompt);
    }, { rethrow: true });

    registerIpcHandler(ipcMain, 'lmstudio:reset-prompt', async (_, type) => {
        return await lmstudioService.configManager.resetPrompt(type);
    }, { rethrow: true });

    registerIpcHandler(ipcMain, 'lmstudio:test-connection', async (_, config) => {
        return await lmstudioService.testConnection(config);
    }, { errorReturn: { success: false, message: 'Connection test failed' } });

    registerIpcHandler(ipcMain, 'lmstudio:list-models', async (_, config) => {
        return await lmstudioService.listModels(config);
    }, { errorReturn: [] });

    registerIpcHandler(ipcMain, 'lmstudio:generate', async (_, type, characterData, selectedSections, additionalInput, customSystemPrompt, isEdit, currentContent) => {
        return await lmstudioService.generate(type, characterData, selectedSections, additionalInput, customSystemPrompt, isEdit, currentContent);
    }, { rethrow: true });

    registerIpcHandler(ipcMain, 'lmstudio:cancel', () => {
        lmstudioService.cancelGeneration();
        return true;
    }, { errorReturn: false });

    // Prompt file operations
    registerIpcHandler(ipcMain, 'lmstudio:reload-prompts', async () => {
        return await lmstudioService.configManager.promptManager.reload();
    }, { errorReturn: {} });

    registerIpcHandler(ipcMain, 'lmstudio:save-prompt-to-file', async (_, type, content) => {
        return await lmstudioService.configManager.promptManager.savePrompt(type, content);
    }, { rethrow: true });

    registerIpcHandler(ipcMain, 'lmstudio:list-prompt-files', async (_, category) => {
        if (!category || typeof category !== 'string') return [];
        return await lmstudioService.configManager.promptManager.listPrompts(category);
    }, { errorReturn: [] });

    registerIpcHandler(ipcMain, 'lmstudio:load-prompt-from-file', async (_, category, filename) => {
        return await lmstudioService.configManager.promptManager.loadPromptFromFile(category, filename);
    }, { errorReturn: null });

    registerIpcHandler(ipcMain, 'lmstudio:get-prompts-path', async () => {
        const { getDataPath } = require('./src/core/storage');
        return getDataPath('prompts');
    }, { errorReturn: null });

    registerIpcHandler(ipcMain, 'lmstudio:open-prompts-folder', async () => {
        const { getDataPath } = require('./src/core/storage');
        const { shell } = require('electron');
        const path = require('path');
        const fs = require('fs');
        const promptsPath = getDataPath('prompts');
        if (!fs.existsSync(promptsPath)) {
            fs.mkdirSync(promptsPath, { recursive: true });
        }
        const result = await shell.openPath(promptsPath);
        return { success: result === '', error: result || null };
    }, { errorReturn: { success: false, error: 'Failed to open folder' } });

    // Asset Handlers

    // Data Management Handlers (Export/Import/Verify)
    const { exportBotWaffleData, exportCharacter, importBotWaffleData, verifyBotWaffleBackup } = require('./src/core/export-import');
    
    // Export entire library
    registerIpcHandler(ipcMain, 'data:export', async (event) => {
        return await exportBotWaffleData();
    }, { errorReturn: { success: false, error: 'Export failed' } });

    // Export individual character
    registerIpcHandler(ipcMain, 'data:export-character', async (event, characterId, characterName) => {
        if (!characterId) {
            throw new Error('Character ID is required');
        }
        return await exportCharacter(characterId, characterName);
    }, { errorReturn: { success: false, error: 'Character export failed' } });

    // Legacy export handler (kept for compatibility, but uses new function)
    registerIpcHandler(ipcMain, 'data:export-legacy', async (event) => {
        // Export handler needs to show save dialog
        const parentWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow;
        const { dialog } = require('electron');
        const AdmZip = require('adm-zip');
        const fs = require('fs').promises;
        const fsSync = require('fs');
        const path = require('path');
        const { getDataPath, getDataDir } = require('./src/core/storage');
        const { info, error: logError } = require('./src/core/utils/logger');
        const { app } = require('electron');
        
        try {
            const zip = new AdmZip();
            const dataDir = getDataDir();
            const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
            const zipFilename = `BotWaffle_Backup_${timestamp}.zip`;

            // Export all BotWaffle data folders
            const foldersToExport = ['chatbots', 'conversations', 'templates', 'assets', 'config'];
            let exportedCount = 0;

            for (const folder of foldersToExport) {
                const folderPath = getDataPath(folder);
                try {
                    await fs.access(folderPath);
                    // Check if folder has any files
                    const files = await fs.readdir(folderPath);
                    if (files.length > 0) {
                        zip.addLocalFolder(folderPath, folder);
                        info(`[Export] Added folder: ${folder} (${files.length} items)`);
                        exportedCount++;
                    } else {
                        info(`[Export] Skipping empty folder: ${folder}`);
                    }
                } catch (error) {
                    info(`[Export] Skipping non-existent folder: ${folder}`);
                }
            }

            if (exportedCount === 0) {
                throw new Error('No data folders found to export');
            }

            const manifest = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                appVersion: app.getVersion(),
                folders: []
            };

            for (const folder of foldersToExport) {
                try {
                    const folderPath = getDataPath(folder);
                    await fs.access(folderPath);
                    manifest.folders.push(folder);
                } catch {}
            }

            zip.addFile('export_manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));

            const saveResult = await dialog.showSaveDialog(parentWindow, {
                title: 'Export BotWaffle Data',
                defaultPath: zipFilename,
                filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
            });

            if (saveResult.canceled) {
                return { success: false, cancelled: true };
            }

            zip.writeZip(saveResult.filePath);
            info(`[Export] Data exported to: ${saveResult.filePath}`);

            return {
                success: true,
                filePath: saveResult.filePath,
                filename: path.basename(saveResult.filePath)
            };
        } catch (error) {
            logError('[Export] Error exporting data', error);
            throw error;
        }
    }, { rethrow: true });
    
    registerIpcHandler(ipcMain, 'data:import', async (event) => {
        // Import handler needs to show open dialog
        const parentWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow;
        const { dialog } = require('electron');
        const AdmZip = require('adm-zip');
        const fs = require('fs').promises;
        const fsSync = require('fs');
        const path = require('path');
        const { getDataPath, getDataDir } = require('./src/core/storage');
        const { info, error: logError } = require('./src/core/utils/logger');
        
        // Helper to copy directory
        const copyDirectory = async (src, dest) => {
            try {
                if (!fsSync.existsSync(dest)) {
                    fsSync.mkdirSync(dest, { recursive: true });
                }
                const entries = await fs.readdir(src, { withFileTypes: true });
                for (const entry of entries) {
                    const srcPath = path.join(src, entry.name);
                    const destPath = path.join(dest, entry.name);
                    if (entry.isDirectory()) {
                        await copyDirectory(srcPath, destPath);
                    } else {
                        await fs.copyFile(srcPath, destPath);
                    }
                }
                return true;
            } catch (error) {
                logError('Error copying directory', error);
                return false;
            }
        };
        
        try {
            const openResult = await dialog.showOpenDialog(parentWindow, {
                title: 'Import BotWaffle Data',
                filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
                properties: ['openFile']
            });

            if (openResult.canceled || !openResult.filePaths || openResult.filePaths.length === 0) {
                return { success: false, cancelled: true };
            }

            const zipPath = openResult.filePaths[0];
            const zip = new AdmZip(zipPath);
            const dataDir = getDataDir();

            const zipEntries = zip.getEntries();
            const manifestEntry = zipEntries.find(e => e.entryName === 'export_manifest.json');
            if (manifestEntry) {
                try {
                    const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
                    info('[Import] Importing backup from:', manifest.exportDate);
                } catch (e) {
                    info('[Import] Could not parse manifest:', e);
                }
            }

            // Store backups inside data/backups for a fully portable layout
            const backupDir = path.join(dataDir, 'backups', 'backup_before_import_' + Date.now());
            try {
                if (!fsSync.existsSync(backupDir)) {
                    fsSync.mkdirSync(backupDir, { recursive: true });
                }
                const foldersToBackup = ['chatbots', 'conversations', 'templates', 'assets'];
                for (const folder of foldersToBackup) {
                    const folderPath = getDataPath(folder);
                    try {
                        await fs.access(folderPath);
                        await copyDirectory(folderPath, path.join(backupDir, folder));
                        info(`[Import] Backed up: ${folder}`);
                    } catch (e) {
                        info(`[Import] Skipping non-existent folder: ${folder}`);
                    }
                }
                info(`[Import] Current data backed up to: ${backupDir}`);
            } catch (backupError) {
                logError('[Import] Failed to backup current data', backupError);
            }

            // Extract ZIP to data directory (overwrite existing files)
            zip.extractAllTo(dataDir, true);
            
            // Clear caches to force reload of imported data
            const { chatbotCache } = require('./src/core/cache');
            chatbotCache.clear();
            const { templateCache } = require('./src/core/cache');
            templateCache.clear();

            info('[Import] Data imported successfully');

            return {
                success: true,
                backupLocation: backupDir
            };
        } catch (error) {
            logError('[Import] Error importing data', error);
            throw error;
        }
    }, { rethrow: true });
    
    registerIpcHandler(ipcMain, 'data:verify-backup', (_, zipPath) => verifyBotWaffleBackup(zipPath), { rethrow: true });
    
    // Backup file dialog handler
    registerIpcHandler(ipcMain, 'data:open-backup-dialog', async (event) => {
        const parentWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow;
        const result = await dialog.showOpenDialog(parentWindow, {
            title: 'Select Backup ZIP File to Verify',
            filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
            properties: ['openFile']
        });
        
        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
            return { cancelled: true };
        }
        
        return { cancelled: false, filePath: result.filePaths[0] };
    }, { errorReturn: { cancelled: true } });

    // Save text file handler (used for exports)
    // Completely rewritten to avoid EPIPE errors - no logging
    registerIpcHandler(ipcMain, 'saveTextFile', async (event, content, defaultFilename) => {
        // Validate inputs
        if (typeof content !== 'string') {
            return { success: false, error: 'Content must be a string' };
        }

        if (!defaultFilename || typeof defaultFilename !== 'string') {
            defaultFilename = 'character_sheet.txt';
        }

        // Sanitize filename
        const sanitizedFilename = defaultFilename.replace(/[<>:"/\\|?*]/g, '_').substring(0, 255);

        try {
            const parentWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow;
            
            const ext = path.extname(sanitizedFilename).toLowerCase().replace('.', '');
            const defaultFiltersByExt = {
                txt: { name: 'Text Files', extensions: ['txt'] },
                md: { name: 'Markdown', extensions: ['md'] },
                json: { name: 'JSON', extensions: ['json'] },
                chat: { name: 'Chat Files', extensions: ['chat'] }
            };
            const primaryFilter = defaultFiltersByExt[ext] || { name: 'Text Files', extensions: ['txt'] };

            const result = await dialog.showSaveDialog(parentWindow, {
                title: 'Export File',
                defaultPath: sanitizedFilename,
                filters: [
                    primaryFilter,
                    { name: 'All Files', extensions: ['*'] }
                ]
            });

            if (result.canceled || !result.filePath) {
                return { success: false, cancelled: true };
            }

            // Write file - no logging to avoid EPIPE
            const fs = require('fs').promises;
            await fs.writeFile(result.filePath, content, 'utf8');

            // Return success - NO LOGGING to prevent EPIPE errors
            return {
                success: true,
                filePath: result.filePath,
                filename: path.basename(result.filePath)
            };
        } catch (error) {
            // Return error instead of throwing - NO LOGGING
            return {
                success: false,
                error: error.message || 'Failed to save file'
            };
        }
    }, { errorReturn: { success: false, error: 'Unknown error' } });

    // Save binary file handler (for Saved Chats exports like EPUB)
    // Accepts base64 data (no data: prefix) and writes bytes to disk.
    registerIpcHandler(ipcMain, 'saveBinaryFile', async (event, base64Data, defaultFilename) => {
        // Validate inputs
        if (typeof base64Data !== 'string' || base64Data.length === 0) {
            return { success: false, error: 'Binary data must be a base64 string' };
        }

        if (!defaultFilename || typeof defaultFilename !== 'string') {
            defaultFilename = 'export.bin';
        }

        // Sanitize filename
        const sanitizedFilename = defaultFilename.replace(/[<>:"/\\|?*]/g, '_').substring(0, 255);

        try {
            const parentWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow;

            const ext = path.extname(sanitizedFilename).toLowerCase().replace('.', '');
            const defaultFiltersByExt = {
                epub: { name: 'EPUB', extensions: ['epub'] },
                json: { name: 'JSON', extensions: ['json'] },
                bin: { name: 'Binary', extensions: ['bin'] }
            };
            const primaryFilter = defaultFiltersByExt[ext] || { name: 'All Files', extensions: ['*'] };

            const result = await dialog.showSaveDialog(parentWindow, {
                title: 'Export File',
                defaultPath: sanitizedFilename,
                filters: [
                    primaryFilter,
                    { name: 'All Files', extensions: ['*'] }
                ]
            });

            if (result.canceled || !result.filePath) {
                return { success: false, cancelled: true };
            }

            // Decode + write
            const buffer = Buffer.from(base64Data, 'base64');

            // Guard against excessively large exports (base64 can balloon memory)
            const MAX_BYTES = 25 * 1024 * 1024; // 25MB
            if (buffer.length > MAX_BYTES) {
                return { success: false, error: 'File too large to export (max 25MB)' };
            }

            const fs = require('fs').promises;
            await fs.writeFile(result.filePath, buffer);

            return {
                success: true,
                filePath: result.filePath,
                filename: path.basename(result.filePath)
            };
        } catch (error) {
            return {
                success: false,
                error: error.message || 'Failed to save file'
            };
        }
    }, { errorReturn: { success: false, error: 'Unknown error' } });

    // PromptWaffle Integration
    const { registerPromptWaffleHandlers } = require('./src/core/prompt-waffle-handler');
    registerPromptWaffleHandlers();

    // Listen for bot creation notifications from PromptWaffle webview
    ipcMain.on('bot-created-notification', (event, data) => {
        // Send message to main window to refresh bot list
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('refresh-bot-list', data);
        }
    });

    // Asset select handler requires special handling for dialog
    registerIpcHandler(ipcMain, 'assets:select', async (event, multiple = false) => {
        const parentWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow;
        const result = await dialog.showOpenDialog(parentWindow, {
            properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
            filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }]
        });

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
            return null;
        }

        return multiple ? result.filePaths : result.filePaths[0];
    }, { errorReturn: null });

    // Save asset (image) to character's images folder
    registerIpcHandler(ipcMain, 'assets:save', (_, sourcePath, characterId) => {
        if (!characterId) {
            throw new Error('Character ID is required to save asset');
        }
        return assetManager.saveAsset(sourcePath, characterId);
    }, { rethrow: true });

    // Delete asset file from disk (only inside data/characters)
    registerIpcHandler(ipcMain, 'assets:delete', async (_, filePath) => {
        try {
            if (!filePath || typeof filePath !== 'string') {
                throw new Error('Invalid file path');
            }

            const fs = require('fs').promises;
            const fsSync = require('fs');
            const basePath = require('./src/core/storage').getDataDir();
            const charactersRoot = path.join(basePath, 'characters');

            const resolved = path.resolve(filePath);
            const safeRoot = path.resolve(charactersRoot);

            // Only allow deleting files inside characters directory
            if (!resolved.startsWith(safeRoot + path.sep)) {
                throw new Error('Refusing to delete file outside characters directory');
            }

            if (!fsSync.existsSync(resolved)) {
                // File already gone; treat as success
                return { success: true, skipped: 'not_found' };
            }

            await fs.unlink(resolved);
            return { success: true };
        } catch (error) {
            logError('[Assets] Failed to delete asset', error);
            return { success: false, error: error.message || 'Failed to delete asset' };
        }
    }, { errorReturn: { success: false, error: 'Asset delete failed' } });

    // Open External URL handler
    registerIpcHandler(ipcMain, 'openExternal', async (_, url) => {
        if (!url || typeof url !== 'string') {
            throw new Error('Invalid URL');
        }

        let urlObj;
        try {
            urlObj = new URL(url);
        } catch {
            throw new Error('Malformed URL');
        }

        if (!['http:', 'https:'].includes(urlObj.protocol)) {
            throw new Error('Unsupported URL protocol');
        }

        const { shell } = require('electron');
        await shell.openExternal(url);
        return true;
    }, { errorReturn: false });

    // Open file path in system file manager
    registerIpcHandler(ipcMain, 'openPath', async (_, filePath) => {
        if (!filePath || typeof filePath !== 'string') {
            throw new Error('Invalid file path');
        }

        const { shell } = require('electron');
        const fs = require('fs');
        const path = require('path');

        // Check if path exists
        if (!fs.existsSync(filePath)) {
            throw new Error('File or folder does not exist');
        }

        // Get stats to determine if it's a file or directory
        const stats = fs.statSync(filePath);
        
        if (stats.isDirectory()) {
            // Open directory
            await shell.openPath(filePath);
        } else {
            // Show file in folder (reveal in file manager)
            await shell.showItemInFolder(filePath);
        }
        
        return true;
    }, { errorReturn: false });

    // Get character folder path
    registerIpcHandler(ipcMain, 'getCharacterFolderPath', async (_, characterId, subfolder = null) => {
        if (!characterId || typeof characterId !== 'string') {
            throw new Error('Character ID is required');
        }

        const { findCharacterFolderById, getCharacterSubPath } = require('./src/core/storage');
        const characterFolder = await findCharacterFolderById(characterId);
        
        if (!characterFolder) {
            throw new Error('Character folder not found');
        }

        if (subfolder) {
            const validSubfolders = ['images', 'scripts', 'saved-chats', 'image-prompts'];
            if (!validSubfolders.includes(subfolder)) {
                throw new Error(`Invalid subfolder: ${subfolder}`);
            }
            const path = require('path');
            return path.join(characterFolder, subfolder);
        }

        return characterFolder;
    }, { errorReturn: null });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
