/**
 * BotWaffle Export/Import Utilities
 * Handles exporting and importing all BotWaffle user data
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { getDataPath, getDataDir } = require('./storage');
const { info, error: logError } = require('./utils/logger');
const { app, dialog } = require('electron');

/**
 * Helper function to copy directory recursively
 */
async function copyDirectory(src, dest) {
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
}

/**
 * Generate character sheet markdown from chatbot data
 * @param {Object} chatbotData - The chatbot data object
 * @param {Array} layout - The section layout array
 * @returns {string} Markdown formatted character sheet
 */
function generateCharacterSheet(chatbotData, layout = []) {
    const lines = [];
    
    // Helper to escape markdown special characters in content
    function escapeMarkdown(text) {
        if (!text) return '';
        return String(text).replace(/\n/g, ' ').trim();
    }

    // Helper to format field value
    function formatFieldValue(value) {
        if (!value) return '';
        const str = String(value).trim();
        return str;
    }

    // Default layout if not provided
    if (!layout || layout.length === 0) {
        layout = [
            { type: 'personality' },
            { type: 'scenario' },
            { type: 'initial-messages' },
            { type: 'example-dialogs' }
        ];
    }

    // Process each section in layout order
    layout.forEach(sectionConfig => {
        // Skip profile section
        if (sectionConfig.type === 'profile') {
            return;
        }

        if (sectionConfig.type === 'personality') {
            lines.push(`# Personality`);
            lines.push('');

            const personality = chatbotData.personality || {};
            let personalityText = '';

            if (typeof personality === 'string') {
                personalityText = personality;
            } else if (personality.characterData) {
                const characterData = personality.characterData;
                personalityText = characterData.personality || '';
                
                if (characterData.systemPrompt) {
                    lines.push(`## System Prompt`);
                    lines.push('');
                    lines.push(formatFieldValue(characterData.systemPrompt));
                    lines.push('');
                }
            } else if (personality.personality) {
                personalityText = personality.personality;
            } else if (personality.text) {
                personalityText = personality.text;
            }

            if (personalityText) {
                const formattedText = formatFieldValue(personalityText);
                if (formattedText.includes('\n')) {
                    lines.push(formattedText);
                } else {
                    lines.push(escapeMarkdown(formattedText));
                }
            } else {
                lines.push('(No personality data)');
            }
            
            lines.push('');
        } else if (sectionConfig.type === 'scenario') {
            lines.push(`# Scenario`);
            lines.push('');

            const scenarioData = chatbotData.scenario;
            if (scenarioData) {
                let scenarioText = '';
                if (typeof scenarioData === 'string') {
                    scenarioText = scenarioData;
                } else if (scenarioData.scenario) {
                    scenarioText = scenarioData.scenario;
                } else if (scenarioData.text) {
                    scenarioText = scenarioData.text;
                }
                
                if (scenarioText) {
                    const formattedText = formatFieldValue(scenarioText);
                    if (formattedText.includes('\n')) {
                        lines.push(formattedText);
                    } else {
                        lines.push(escapeMarkdown(formattedText));
                    }
                } else {
                    lines.push('(No scenario data)');
                }
            } else {
                lines.push('(No scenario data)');
            }
            lines.push('');
        } else if (sectionConfig.type === 'initial-messages') {
            lines.push(`# Initial Messages`);
            lines.push('');

            const initialMessages = chatbotData.initialMessages || [];
            if (Array.isArray(initialMessages) && initialMessages.length > 0) {
                initialMessages.forEach((entry, index) => {
                    if (typeof entry === 'string' && entry.trim()) {
                        lines.push(`- Message ${index + 1}: ${escapeMarkdown(entry)}`);
                    } else if (entry && typeof entry === 'object' && entry.text) {
                        lines.push(`- Message ${index + 1}: ${escapeMarkdown(String(entry.text))}`);
                    }
                });
            } else {
                lines.push('(No initial messages)');
            }
            lines.push('');
        } else if (sectionConfig.type === 'example-dialogs') {
            lines.push(`# Example Dialogs`);
            lines.push('');

            const exampleDialogs = chatbotData.exampleDialogs || [];
            if (Array.isArray(exampleDialogs) && exampleDialogs.length > 0) {
                exampleDialogs.forEach((entry, index) => {
                    if (entry && typeof entry === 'object') {
                        const userText = entry.user ? escapeMarkdown(String(entry.user)) : '';
                        const assistantText = entry.assistant ? escapeMarkdown(String(entry.assistant)) : '';
                        if (userText || assistantText) {
                            lines.push(`- Dialog ${index + 1}:`);
                            if (userText) lines.push(`  User: ${userText}`);
                            if (assistantText) lines.push(`  Assistant: ${assistantText}`);
                        }
                    }
                });
            } else {
                lines.push('(No example dialogs)');
            }
            lines.push('');
        }
    });

    // Remove trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
    }

    return lines.join('\n');
}

/**
 * Helper: sanitize a name for use as a filename (without extension)
 * @param {string} name
 * @param {string} fallback
 * @returns {string}
 */
function sanitizeFilename(name, fallback) {
    const base = (name && String(name).trim().length > 0) ? String(name).trim() : fallback;
    return base
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_') // remove invalid chars and control chars
        .replace(/\s+/g, ' ') // collapse whitespace a bit
        .substring(0, 80) || fallback;
}

/**
 * Helper: normalize a script entry into a simple object
 * (mirrors BotScriptsView.normalizeScript but without UI concerns)
 */
function normalizeScriptForExport(script, index) {
    if (typeof script === 'string') {
        return {
            name: `Script ${index + 1}`,
            content: script,
            tags: []
        };
    }
    return {
        name: script?.name || `Script ${index + 1}`,
        content: script?.content || script?.text || '',
        tags: script?.tags || []
    };
}

/**
 * Helper: normalize a saved chat entry for export
 * (text-only view; binary EPUBs get a small info stub)
 */
function normalizeSavedChatForExport(chat, index) {
    if (typeof chat === 'string') {
        return {
            name: `Chat ${index + 1}`,
            format: 'txt',
            content: chat
        };
    }
    const format = String(chat?.format || '').toLowerCase();
    if (format === 'epub') {
        const filename = chat?.originalFilename || `chat-${index + 1}.epub`;
        const size = chat?.byteLength ? `${chat.byteLength.toLocaleString()} bytes` : 'unknown size';
        return {
            name: chat?.name || `Chat ${index + 1}`,
            format,
            content: `EPUB chat file\nOriginal filename: ${filename}\nSize: ${size}\n\n(Note: this EPUB is stored inside BotWaffle data; the full binary is not embedded in this text backup.)`
        };
    }
    // For JSON / SillyTavern etc, we assume UI has already stored a readable transcript in content
    return {
        name: chat?.name || `Chat ${index + 1}`,
        format: format || 'txt',
        content: chat?.content || chat?.text || ''
    };
}

/**
 * Helper: normalize an image prompt entry for export
 */
function normalizeImagePromptForExport(prompt, index) {
    if (typeof prompt === 'string') {
        return {
            name: `Prompt ${index + 1}`,
            text: prompt,
            tags: []
        };
    }
    return {
        name: prompt?.name || `Prompt ${index + 1}`,
        text: prompt?.text || prompt?.prompt || '',
        tags: prompt?.tags || []
    };
}

/**
 * Recursively add files from a directory to a zip archive
 * @param {AdmZip} zip - The zip archive instance
 * @param {string} dirPath - Directory path to add
 * @param {string} zipPath - Path inside the zip (base path)
 */
function addDirectoryToZip(zip, dirPath, zipPath = '') {
    const entries = fsSync.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const zipEntryPath = zipPath ? `${zipPath}/${entry.name}` : entry.name;
        
        if (entry.isDirectory()) {
            // Add directory entry (some zip tools require this)
            zip.addFile(`${zipEntryPath}/`, Buffer.alloc(0));
            // Recursively add directory contents
            addDirectoryToZip(zip, fullPath, zipEntryPath);
        } else {
            // Add file
            try {
                const fileBuffer = fsSync.readFileSync(fullPath);
                zip.addFile(zipEntryPath, fileBuffer);
                info(`[Export] Added file: ${zipEntryPath}`);
            } catch (error) {
                logError(`[Export] Failed to add file: ${fullPath}`, error);
            }
        }
    }
}

/**
 * Export all BotWaffle data to a ZIP file
 * @returns {Promise<Object>} Export result
 */
async function exportBotWaffleData() {
    try {
        const zip = new AdmZip();
        const dataDir = getDataDir();
        const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const zipFilename = `BotWaffle_Backup_${timestamp}.zip`;

        // Export new character folder structure
        const charactersPath = getDataPath('characters');
        if (fsSync.existsSync(charactersPath)) {
            // Use manual recursive function to ensure all files are included
            addDirectoryToZip(zip, charactersPath, 'characters');
            info(`[Export] Added characters folder`);

            // Generate and add character sheets for all characters
            try {
                const ChatbotManager = require('./chatbot-manager');
                const { findCharacterFolderById } = require('./storage');
                const chatbotManager = new ChatbotManager();
                const allBots = await chatbotManager.listChatbots();
                
                for (const bot of allBots) {
                    try {
                        // Find the character folder to get the correct path structure
                        const characterFolderPath = await findCharacterFolderById(bot.id);
                        if (!characterFolderPath) {
                            continue;
                        }

                        const folderName = path.basename(characterFolderPath);
                        const basePath = `characters/${folderName}`;

                        // 1) Character sheet
                        const characterSheet = generateCharacterSheet(bot, bot.layout || []);
                        const sheetPath = `${basePath}/character_sheet.txt`;
                        zip.addFile(sheetPath, Buffer.from(characterSheet, 'utf8'));
                        info(`[Export] Added character sheet for: ${bot.profile?.name || bot.id}`);

                        // 2) Scripts -> scripts/*.txt
                        const scripts = (bot.metadata?.scripts || bot.scripts || []);
                        scripts.forEach((rawScript, index) => {
                            const script = normalizeScriptForExport(rawScript, index);
                            if (!script.content || String(script.content).trim().length === 0) {
                                return;
                            }
                            const safeName = sanitizeFilename(script.name, `script-${index + 1}`);
                            const filePath = `${basePath}/scripts/${safeName}.txt`;
                            const headerLines = [];
                            headerLines.push(`# ${script.name || `Script ${index + 1}`}`);
                            if (script.tags && script.tags.length > 0) {
                                headerLines.push(`Tags: ${script.tags.join(', ')}`);
                            }
                            headerLines.push('');
                            const body = String(script.content || '');
                            const fileContent = headerLines.join('\n') + body;
                            zip.addFile(filePath, Buffer.from(fileContent, 'utf8'));
                        });

                        // 3) Saved chats -> saved-chats/*.txt
                        const savedChats = (bot.metadata?.savedChats || bot.savedChats || []);
                        savedChats.forEach((rawChat, index) => {
                            const chat = normalizeSavedChatForExport(rawChat, index);
                            if (!chat.content || String(chat.content).trim().length === 0) {
                                return;
                            }
                            const safeName = sanitizeFilename(chat.name, `chat-${index + 1}`);
                            const filePath = `${basePath}/saved-chats/${safeName}.txt`;
                            const header = `# ${chat.name || `Chat ${index + 1}`}\nFormat: ${chat.format || 'txt'}\n\n`;
                            const body = String(chat.content || '');
                            zip.addFile(filePath, Buffer.from(header + body, 'utf8'));
                        });

                        // 4) Image prompts -> image-prompts/*.txt
                        const imagePrompts = (bot.metadata?.imagePrompts || bot.imagePrompts || []);
                        imagePrompts.forEach((rawPrompt, index) => {
                            const prompt = normalizeImagePromptForExport(rawPrompt, index);
                            if (!prompt.text || String(prompt.text).trim().length === 0) {
                                return;
                            }
                            const safeName = sanitizeFilename(prompt.name, `prompt-${index + 1}`);
                            const filePath = `${basePath}/image-prompts/${safeName}.txt`;
                            const headerLines = [];
                            headerLines.push(`# ${prompt.name || `Prompt ${index + 1}`}`);
                            if (prompt.tags && prompt.tags.length > 0) {
                                headerLines.push(`Tags: ${prompt.tags.join(', ')}`);
                            }
                            headerLines.push('');
                            const body = String(prompt.text || '');
                            const fileContent = headerLines.join('\n') + body;
                            zip.addFile(filePath, Buffer.from(fileContent, 'utf8'));
                        });
                    } catch (error) {
                        logError(`[Export] Failed to generate character sheet for ${bot.id}`, error);
                    }
                }
            } catch (error) {
                logError('[Export] Failed to generate character sheets', error);
            }
        }

        // Also export legacy folders for compatibility
        const legacyFolders = ['conversations', 'templates'];
        for (const folder of legacyFolders) {
            const folderPath = getDataPath(folder);
            try {
                await fs.access(folderPath);
                addDirectoryToZip(zip, folderPath, folder);
                info(`[Export] Added folder: ${folder}`);
            } catch (error) {
                info(`[Export] Skipping non-existent folder: ${folder}`);
            }
        }

        // Export custom AI prompts (data/prompts/*.txt in category folders)
        const promptsPath = getDataPath('prompts');
        if (fsSync.existsSync(promptsPath)) {
            addDirectoryToZip(zip, promptsPath, 'prompts');
            info('[Export] Added prompts folder (custom AI prompts)');
        }

        // Export LM Studio config (lmstudio.json with prompt settings)
        const configPath = getDataPath('config');
        if (fsSync.existsSync(configPath)) {
            addDirectoryToZip(zip, configPath, 'config');
            info('[Export] Added config folder (LM Studio settings)');
        }

        // Create export manifest
        const manifest = {
            version: '2.0', // New version for character folder structure
            exportDate: new Date().toISOString(),
            appVersion: app.getVersion(),
            structure: 'character-folders', // New structure type
            folders: []
        };

        // Check which folders actually exist
        if (fsSync.existsSync(charactersPath)) {
            manifest.folders.push('characters');
        }
        for (const folder of legacyFolders) {
            try {
                const folderPath = getDataPath(folder);
                await fs.access(folderPath);
                manifest.folders.push(folder);
            } catch {
                // Skip non-existent folders
            }
        }
        if (fsSync.existsSync(promptsPath)) {
            manifest.folders.push('prompts');
        }
        if (fsSync.existsSync(configPath)) {
            manifest.folders.push('config');
        }

        zip.addFile('export_manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));

        // Show save dialog
        const result = await dialog.showSaveDialog({
            title: 'Export BotWaffle Data',
            defaultPath: zipFilename,
            filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
        });

        if (result.canceled) {
            return { success: false, cancelled: true };
        }

        // Write ZIP file
        zip.writeZip(result.filePath);
        info(`[Export] Data exported to: ${result.filePath}`);

        return {
            success: true,
            filePath: result.filePath,
            filename: path.basename(result.filePath)
        };
    } catch (error) {
        logError('[Export] Error exporting data', error);
        return { success: false, error: error.message || 'Failed to export data' };
    }
}

/**
 * Export a single character with all its assets
 * @param {string} characterId - Character UUID
 * @param {string} characterName - Character name for filename
 * @returns {Promise<Object>} Export result
 */
async function exportCharacter(characterId, characterName) {
    try {
        const { findCharacterFolderById } = require('./storage');
        const characterPath = await findCharacterFolderById(characterId);

        if (!characterPath || !fsSync.existsSync(characterPath)) {
            throw new Error('Character folder not found');
        }

        const zip = new AdmZip();
        const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const sanitizedName = (characterName || 'character').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
        const zipFilename = `${sanitizedName}_${timestamp}.zip`;

        // Manually add all files from character folder to ensure everything is included
        const zipBasePath = `character-${characterId}`;
        addDirectoryToZip(zip, characterPath, zipBasePath);
        
        // Generate and add character sheet
        try {
            const ChatbotManager = require('./chatbot-manager');
            const chatbotManager = new ChatbotManager();
            const bot = await chatbotManager.getChatbot(characterId);
            
            if (bot) {
                const characterSheet = generateCharacterSheet(bot, bot.layout || []);
                const sheetPath = `${zipBasePath}/character_sheet.txt`;
                zip.addFile(sheetPath, Buffer.from(characterSheet, 'utf8'));
                info(`[Export] Added character sheet for: ${characterName}`);
            }
        } catch (error) {
            logError(`[Export] Failed to generate character sheet for ${characterId}`, error);
        }

        // Create manifest
        const manifest = {
            version: '2.0',
            exportDate: new Date().toISOString(),
            appVersion: app.getVersion(),
            structure: 'character-export',
            characterId: characterId,
            characterName: characterName
        };
        zip.addFile('export_manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));

        // Show save dialog
        const result = await dialog.showSaveDialog({
            title: 'Export Character',
            defaultPath: zipFilename,
            filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
        });

        if (result.canceled) {
            return { success: false, cancelled: true };
        }

        zip.writeZip(result.filePath);
        info(`[Export] Character exported to: ${result.filePath}`);

        return {
            success: true,
            filePath: result.filePath,
            filename: path.basename(result.filePath)
        };
    } catch (error) {
        logError('[Export] Error exporting character', error);
        return { success: false, error: error.message || 'Failed to export character' };
    }
}

/**
 * Import BotWaffle data from a ZIP file
 * @returns {Promise<Object>} Import result
 */
async function importBotWaffleData() {
    try {
        // Show open dialog
        const result = await dialog.showOpenDialog({
            title: 'Import BotWaffle Data',
            filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
            properties: ['openFile']
        });

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
            return { success: false, cancelled: true };
        }

        const zipPath = result.filePaths[0];
        const zip = new AdmZip(zipPath);
        const dataDir = getDataDir();

        // Validate manifest if present
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

        // Backup current data before import (inside data/backups for portability)
        const backupDir = path.join(dataDir, 'backups', 'backup_before_import_' + Date.now());
        try {
            await fs.mkdir(backupDir, { recursive: true });
            const foldersToBackup = ['characters', 'conversations', 'templates', 'prompts', 'config'];
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

        // Extract ZIP to data directory
        zip.extractAllTo(dataDir, true); // Overwrite existing files

        info('[Import] Data imported successfully');

        return {
            success: true,
            backupLocation: backupDir
        };
    } catch (error) {
        logError('[Import] Error importing data', error);
        return { success: false, error: error.message || 'Failed to import data' };
    }
}

/**
 * Verify a backup ZIP file
 * @param {string} zipPath - Path to ZIP file
 * @returns {Promise<Object>} Verification result
 */
async function verifyBotWaffleBackup(zipPath) {
    try {
        const zip = new AdmZip(zipPath);
        const zipEntries = zip.getEntries();

        const issues = [];
        const warnings = [];
        const summary = {
            chatbots: 0,
            conversations: 0,
            templates: 0,
            assets: 0
        };

        // Check for required folders
        const requiredFolders = ['chatbots'];
        const foundFolders = new Set();

        for (const entry of zipEntries) {
            const entryPath = entry.entryName.split('/');
            if (entryPath.length > 0 && entryPath[0]) {
                foundFolders.add(entryPath[0]);
            }

            // Count files by type
            if (entry.entryName.startsWith('chatbots/') && entry.entryName.endsWith('.json')) {
                summary.chatbots++;
            } else if (entry.entryName.startsWith('conversations/') && entry.entryName.endsWith('.json')) {
                summary.conversations++;
            } else if (entry.entryName.startsWith('templates/') && entry.entryName.endsWith('.json')) {
                summary.templates++;
            } else if (entry.entryName.startsWith('assets/')) {
                summary.assets++;
            }
        }

        // Check for required folders
        for (const folder of requiredFolders) {
            if (!foundFolders.has(folder)) {
                issues.push(`Missing required folder: ${folder}`);
            }
        }

        // Validate manifest if present
        const manifestEntry = zipEntries.find(e => e.entryName === 'export_manifest.json');
        if (!manifestEntry) {
            warnings.push('No export manifest found (backup may be from older version)');
        } else {
            try {
                const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
                if (!manifest.version || !manifest.exportDate) {
                    warnings.push('Manifest is missing required fields');
                }
            } catch (e) {
                issues.push('Manifest is corrupted or invalid');
            }
        }

        return {
            valid: issues.length === 0,
            issues,
            warnings,
            summary
        };
    } catch (error) {
        logError('[Verify] Error verifying backup', error);
        return {
            valid: false,
            issues: [error.message || 'Failed to verify backup'],
            warnings: [],
            summary: {}
        };
    }
}

module.exports = {
    exportBotWaffleData,
    exportCharacter,
    importBotWaffleData,
    verifyBotWaffleBackup
};
