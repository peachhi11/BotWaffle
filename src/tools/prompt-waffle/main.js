/**
 * KNOWN ISSUE: Electron v37 + Node.js v22 Compatibility Problem
 * 
 * The require('electron') call returns the path to electron.exe instead of the API object.
 * This appears to be a bug in how Electron v37 handles module requires with Node v22.
 * 
 * SOLUTIONS:
 * 1. Downgrade Node.js to v20 LTS (recommended)
 * 2. Wait for Electron v37.x patch that fixes this
 * 3. Downgrade to Electron v36 or earlier
 * 
 * For more details, see: GitHub issue #[to be filed]
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');

// PromptWaffle storage utilities
const { initializePromptWaffleStorage, getPromptWaffleDataPath, resolvePromptWafflePath, validatePromptWafflePath } = require('./storage');
const { migratePromptWaffleData } = require('./migration');

// Production logging setup
const electronLog = require('electron-log');
const isDev = process.argv.includes('--dev');

// Configure electron-log for production
if (!isDev) {
  electronLog.transports.file.level = 'info';
  electronLog.transports.console.level = false; // Disable console in production
}

// Create logger helper - use console in dev, electron-log in production
const logger = isDev 
  ? { log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug }
  : electronLog;

// Add comprehensive error logging
logger.info('[Main] Starting application...');
logger.info('[Main] Electron version:', process.versions.electron);
logger.info('[Main] Node version:', process.versions.node);
logger.info('[Main] Platform:', process.platform);
logger.info('[Main] App object check:', typeof app, app ? 'OK' : 'UNDEFINED');

// Security utilities
logger.info('[Main] Loading security utilities...');
const { validateAndSanitizePath, validateFileSize, logSecurityEvent } = require('./src/utils/security.js');
logger.info('[Main] Security utilities loaded successfully');

let mainWindow;
let imageViewerWindow = null;
let autoUpdater = null;

// Auto-updater will be initialized after app is ready
function initAutoUpdater() {
  console.log('[Main] Initializing auto-updater...');
  try {
    const { autoUpdater: updater } = require('electron-updater');
    autoUpdater = updater;

    autoUpdater.autoDownload = false; // Don't auto-download, let user choose
    autoUpdater.logger = require('electron-log');
    autoUpdater.logger.transports.file.level = 'info';

    // Auto-updater events
    autoUpdater.on('checking-for-update', () => {
      console.log('Checking for updates...');
      if (mainWindow) {
        mainWindow.webContents.send('update-checking');
      }
    });

    autoUpdater.on('update-available', (info) => {
      console.log('Update available:', info);
      if (mainWindow) {
        mainWindow.webContents.send('update-available', info);
      }
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('Update not available:', info);
      if (mainWindow) {
        mainWindow.webContents.send('update-not-available', info);
      }
    });

    autoUpdater.on('error', (err) => {
      console.error('Auto-updater error:', err);
      if (mainWindow) {
        mainWindow.webContents.send('update-error', err.message);
      }
    });

    autoUpdater.on('download-progress', (progressObj) => {
      if (mainWindow) {
        mainWindow.webContents.send('download-progress', progressObj);
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('Update downloaded:', info);
      if (mainWindow) {
        mainWindow.webContents.send('update-downloaded', info);
      }
    });

    console.log('[Main] Auto-updater initialized successfully');
  } catch (error) {
    console.error('[Main] Failed to initialize auto-updater:', error);
  }
}

function createWindow() {
  console.log('[Main] Creating main window...');
  try {
    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      },
      icon: path.join(__dirname, 'src/assets/800x800 logo prompt waffel.png')
    });
    console.log('[Main] Main window created successfully');
  } catch (error) {
    console.error('[Main] Failed to create main window:', error);
    throw error;
  }

  console.log('[Main] Loading HTML file...');
  try {
    mainWindow.loadFile(path.join(__dirname, 'src/index.html'));
    console.log('[Main] HTML file loaded successfully');
  } catch (error) {
    console.error('[Main] Failed to load HTML file:', error);
  }

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    console.log('[Main] Opening DevTools (development mode)');
    mainWindow.webContents.openDevTools();
  }
}

function createImageViewerWindow() {
  if (imageViewerWindow) {
    imageViewerWindow.focus();
    return;
  }

  try {
    imageViewerWindow = new BrowserWindow({
      width: 600,
      height: 500,
      minWidth: 300,
      minHeight: 200,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      },
      frame: false,
      resizable: true,
      movable: true,
      alwaysOnTop: false,
      show: false,
      icon: path.join(__dirname, 'src/assets/800x800 logo prompt waffel.png')
    });
  } catch (error) {
    console.error('[Main] Error creating BrowserWindow:', error);
    return;
  }

  imageViewerWindow.loadFile(path.join(__dirname, 'src/image-viewer.html'));

  // Open DevTools in development only
  if (process.argv.includes('--dev')) {
    imageViewerWindow.webContents.openDevTools();
  }

  imageViewerWindow.once('ready-to-show', () => {
    imageViewerWindow.show();
  });

  imageViewerWindow.on('closed', () => {
    imageViewerWindow = null;
  });
}

console.log('[Main] Setting up app event listeners...');

app.whenReady().then(async () => {
  console.log('[Main] App is ready, initializing storage...');
  try {
    // Initialize PromptWaffle storage (creates directories inside BotWaffle's portable data dir)
    initializePromptWaffleStorage();
    console.log('[Main] Storage initialized');

    // Migrate existing files from __dirname to the new portable data dir (if needed)
    console.log('[Main] Checking for migration...');
    const migrationResults = await migratePromptWaffleData(__dirname);
    if (!migrationResults.alreadyMigrated && migrationResults.migrated.length > 0) {
      console.log('[Main] Migration completed:', migrationResults.migrated);
    } else if (migrationResults.alreadyMigrated) {
      console.log('[Main] Data already in PromptWaffle data directory, no migration needed');
    }

    console.log('[Main] Creating window...');
    createWindow();
    console.log('[Main] Window created successfully');

    // Initialize auto-updater after app is ready
    initAutoUpdater();
  } catch (error) {
    console.error('[Main] Failed to initialize:', error);
  }
}).catch(error => {
  console.error('[Main] App ready failed:', error);
});

app.on('window-all-closed', () => {
  console.log('[Main] All windows closed');
  if (process.platform !== 'darwin') {
    console.log('[Main] Quitting application');
    app.quit();
  }
});

app.on('activate', () => {
  console.log('[Main] App activated');
  if (BrowserWindow.getAllWindows().length === 0) {
    console.log('[Main] No windows open, creating new window');
    try {
      createWindow();
    } catch (error) {
      console.error('[Main] Failed to create window on activate:', error);
    }
  }
});

app.on('before-quit', () => {
  console.log('[Main] Application is about to quit');
});

app.on('will-quit', () => {
  console.log('[Main] Application will quit');
});

// Ensure snippets directory exists (inside portable data dir)
async function ensureSnippetsDir() {
  const snippetsDir = getPromptWaffleDataPath('snippets');
  try {
    await fs.access(snippetsDir);
  } catch {
    await fs.mkdir(snippetsDir, { recursive: true });
  }
}

// IPC Handlers
console.log('[Main] Registering IPC handlers...');

ipcMain.handle('fs-rm', async (event, filePath, options = {}) => {
  try {
    await ensureSnippetsDir();

    // Sanitize paths using security utility
    const sanitizedPath = validateAndSanitizePath(filePath);
    if (!sanitizedPath) {
      logSecurityEvent('invalid_file_path', { filePath, operation: 'fs-rm' });
      throw new Error('Invalid file path');
    }

    const fullPath = resolvePromptWafflePath(sanitizedPath);

    // Ensure paths are within PromptWaffle data directory
    if (!validatePromptWafflePath(fullPath)) {
      throw new Error('Access denied: Path outside PromptWaffle data directory');
    }

    // Use fs.rm for both files and folders, with options for recursive deletion
    await fs.rm(fullPath, { recursive: true, force: true, ...options });
    
    // Verify deletion succeeded
    try {
      await fs.access(fullPath);
      // File still exists - deletion may have failed
      console.warn('[fs-rm] File still exists after deletion attempt:', fullPath);
      // Try one more time with a short delay
      await new Promise(resolve => setTimeout(resolve, 100));
      await fs.rm(fullPath, { recursive: true, force: true, ...options });
    } catch {
      // File doesn't exist - deletion succeeded
    }
    
    return true;
  } catch (error) {
    console.error('Error deleting file or folder:', {
      filePath,
      options,
      error: error.stack || error
    });
    throw error;
  }
});

ipcMain.handle('fs-rename', async (event, oldPath, newPath) => {
  try {
    await ensureSnippetsDir();

    // Sanitize paths using security utility
    const sanitizedOldPath = validateAndSanitizePath(oldPath);
    const sanitizedNewPath = validateAndSanitizePath(newPath);

    if (!sanitizedOldPath || !sanitizedNewPath) {
      logSecurityEvent('invalid_file_path', { oldPath, newPath, operation: 'fs-rename' });
      throw new Error('Invalid file path');
    }

    const fullOldPath = resolvePromptWafflePath(sanitizedOldPath);
    const fullNewPath = resolvePromptWafflePath(sanitizedNewPath);

    // Ensure paths are within PromptWaffle data directory
    if (!validatePromptWafflePath(fullOldPath) || !validatePromptWafflePath(fullNewPath)) {
      throw new Error('Access denied: Path outside PromptWaffle data directory');
    }

    const newDir = path.dirname(fullNewPath);
    await fs.mkdir(newDir, { recursive: true });
    
    // Try rename first (atomic move operation)
    try {
      await fs.rename(fullOldPath, fullNewPath);
      
      // Wait a moment for file system to sync
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify the move worked: new file exists AND old file is gone
      let newExists = false;
      let oldExists = false;
      
      try {
        await fs.access(fullNewPath);
        newExists = true;
      } catch {
        newExists = false;
      }
      
      try {
        await fs.access(fullOldPath);
        oldExists = true;
      } catch {
        oldExists = false;
      }
      
      if (newExists && !oldExists) {
        // Move succeeded perfectly
        console.log('[Rename] Move succeeded:', { oldPath: fullOldPath, newPath: fullNewPath });
        return true;
      } else if (newExists && oldExists) {
        // Both exist - rename copied instead of moved, manually delete old file
        console.warn('[Rename] Both files exist after rename (copy instead of move), deleting old file:', fullOldPath);
        try {
          await fs.unlink(fullOldPath);
          // Verify deletion
          await new Promise(resolve => setTimeout(resolve, 50));
          const stillExists = await fs.access(fullOldPath).then(() => true).catch(() => false);
          if (stillExists) {
            throw new Error('Old file still exists after deletion attempt');
          }
          console.log('[Rename] Successfully deleted old file after copy');
          return true;
        } catch (deleteError) {
          console.error('[Rename] Failed to delete old file:', deleteError);
          throw new Error(`Move operation incomplete: old file still exists: ${deleteError.message}`);
        }
      } else if (!newExists && oldExists) {
        // New doesn't exist but old does - rename failed
        throw new Error('Rename failed: new file does not exist but old file still exists');
      } else {
        // Neither exists - something went wrong
        throw new Error('Rename failed: both files are missing');
      }
    } catch (renameError) {
      // If rename fails (e.g., cross-device, permission issue), use copy + delete as fallback
      console.warn('[Rename] fs.rename failed, using copy+delete fallback:', renameError.message);
      try {
        // Copy the file
        await fs.copyFile(fullOldPath, fullNewPath);
        // Verify copy succeeded
        await new Promise(resolve => setTimeout(resolve, 50));
        const newExists = await fs.access(fullNewPath).then(() => true).catch(() => false);
        if (!newExists) {
          throw new Error('Copy failed: new file does not exist');
        }
        // Delete the old file
        await fs.unlink(fullOldPath);
        // Verify old file is gone
        await new Promise(resolve => setTimeout(resolve, 50));
        const oldExists = await fs.access(fullOldPath).then(() => true).catch(() => false);
        if (oldExists) {
          throw new Error('Delete failed: old file still exists');
        }
        console.log('[Rename] Copy+delete fallback succeeded');
        return true;
      } catch (fallbackError) {
        console.error('[Rename] Copy+delete fallback also failed:', fallbackError);
        throw new Error(`Move operation failed: ${fallbackError.message}`);
      }
    }
  } catch (error) {
    console.error('Error renaming file:', error);
    throw error;
  }
});

ipcMain.handle('fs-listFiles', async (event, dirPath) => {
  try {
    const sanitizedPath = validateAndSanitizePath(dirPath, []);
    if (!sanitizedPath) {
      logSecurityEvent('invalid_file_path', { dirPath, operation: 'fs-listFiles' });
      return [];
    }
    const fullPath = resolvePromptWafflePath(sanitizedPath);
    const items = await fs.readdir(fullPath, { withFileTypes: true });
    return items.map(item => ({
      name: item.name,
      isDirectory: item.isDirectory(),
      isFile: item.isFile()
    }));
  } catch (error) {
    console.error('Error listing files:', error);
    return [];
  }
});

ipcMain.handle('fs-exists', async (event, filePath) => {
  try {
    const sanitizedPath = validateAndSanitizePath(filePath);
    if (!sanitizedPath) {
      return false;
    }
    const fullPath = resolvePromptWafflePath(sanitizedPath);
    if (!validatePromptWafflePath(fullPath)) {
      return false;
    }
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('fs-mkdir', async (event, dirPath) => {
  try {
    const sanitizedPath = validateAndSanitizePath(dirPath, []);
    if (!sanitizedPath) {
      logSecurityEvent('invalid_file_path', { dirPath, operation: 'fs-mkdir' });
      throw new Error('Invalid directory path');
    }
    const fullPath = resolvePromptWafflePath(sanitizedPath);
    if (!validatePromptWafflePath(fullPath)) {
      logSecurityEvent('path_traversal_attempt', { dirPath, operation: 'fs-mkdir' });
      throw new Error('Access denied: Path outside PromptWaffle data directory');
    }
    await fs.mkdir(fullPath, { recursive: true });
    return true;
  } catch (error) {
    console.error('Error creating directory:', error);
    throw error;
  }
});

ipcMain.handle('fs-rmdir', async (event, dirPath) => {
  try {
    const sanitizedPath = validateAndSanitizePath(dirPath, []);
    if (!sanitizedPath) {
      logSecurityEvent('invalid_file_path', { dirPath, operation: 'fs-rmdir' });
      throw new Error('Invalid directory path');
    }
    const fullPath = resolvePromptWafflePath(sanitizedPath);
    if (!validatePromptWafflePath(fullPath)) {
      logSecurityEvent('path_traversal_attempt', { dirPath, operation: 'fs-rmdir' });
      throw new Error('Access denied: Path outside PromptWaffle data directory');
    }
    await fs.rmdir(fullPath, { recursive: true });
    return true;
  } catch (error) {
    console.error('Error removing directory:', error);
    throw error;
  }
});

ipcMain.handle('fs-readdir', async (event, dirPath) => {
  try {
    // Handle absolute paths correctly; relative paths resolve to the portable data dir
    const fullPath = path.isAbsolute(dirPath)
      ? dirPath
      : resolvePromptWafflePath(dirPath);
    const items = await fs.readdir(fullPath, { withFileTypes: true });
    return items.map(item => ({
      name: item.name,
      isDirectory: item.isDirectory(),
      isFile: item.isFile()
    }));
  } catch (error) {
    console.error('Error reading directory:', error);
    return [];
  }
});

ipcMain.handle('fs-stat', async (event, filePath) => {
  try {
    // Handle absolute paths - if absolute and within data dir, use it; otherwise resolve
    let fullPath;
    if (path.isAbsolute(filePath)) {
      // Validate absolute path is within data directory
      if (validatePromptWafflePath(filePath)) {
        fullPath = filePath;
      } else {
        // Invalid absolute path
        console.error('Error: Absolute path outside data directory:', filePath);
        return null;
      }
    } else {
      // Resolve relative path
      fullPath = resolvePromptWafflePath(filePath);
    }
    const stats = await fs.stat(fullPath);
    return {
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      size: stats.size,
      mtime: stats.mtime,
      ctime: stats.ctime
    };
  } catch (error) {
    console.error('Error getting file stats:', error);
    return null;
  }
});

ipcMain.handle('open-data-path', async () => {
  try {
    const dataPath = getPromptWaffleDataPath('snippets');
    await ensureSnippetsDir();
    return dataPath;
  } catch (error) {
    console.error('Error opening data path:', error);
    throw error;
  }
});

ipcMain.handle('get-comfyui-folder', async () => {
  try {
    // Save to data/comfyui/ — easy to find and link from ComfyUI nodes
    const comfyuiFolder = getPromptWaffleDataPath('comfyui');
    // Ensure the folder exists
    await fs.mkdir(comfyuiFolder, { recursive: true });
    return comfyuiFolder;
  } catch (error) {
    console.error('Error getting ComfyUI folder:', error);
    throw error;
  }
});

// open-external handler moved to openExternal with security validation below

// Image handling handlers
ipcMain.handle('save-image', async (event, imageId, imageBuffer, filename) => {
  try {
    console.log('[Main] save-image called with:', { imageId, filename, bufferSize: imageBuffer.byteLength });

    // Create the images directory if it doesn't exist (inside portable data dir)
    const imagesDir = path.join(getPromptWaffleDataPath('snippets'), 'characters', 'images');
    console.log('[Main] Images directory path:', imagesDir);

    await fs.mkdir(imagesDir, { recursive: true });
    console.log('[Main] Images directory created/verified');

    // Create the full file path
    const fullPath = path.join(imagesDir, filename);
    console.log('[Main] Full file path:', fullPath);

    // Write the image buffer to file
    await fs.writeFile(fullPath, Buffer.from(imageBuffer));
    console.log('[Main] Image saved successfully:', fullPath);

    return true;
  } catch (error) {
    console.error('[Main] Error saving image:', error);
    throw error;
  }
});

ipcMain.handle(
  'save-thumbnail',
  (event, imageId, thumbnailBuffer, filename) => {
    return true;
  }
);

// Board image handling - save to app directory for portability
ipcMain.handle('save-board-image', async (event, boardId, imageBuffer, filename) => {
  try {
    // imageBuffer is an array from renderer, convert to Buffer
    const buffer = Buffer.from(imageBuffer);
    logger.info('[Main] save-board-image called with:', { boardId, filename, bufferSize: buffer.length });

    // Create the board images directory if it doesn't exist (inside portable data dir)
    const imagesDir = path.join(getPromptWaffleDataPath('snippets'), 'boards', 'images', boardId);
    logger.info('[Main] Board images directory path:', imagesDir);

    await fs.mkdir(imagesDir, { recursive: true });
    logger.info('[Main] Board images directory created/verified');

    // Create the full file path
    const fullPath = path.join(imagesDir, filename);
    logger.info('[Main] Full file path:', fullPath);

    // Write the image buffer to file
    await fs.writeFile(fullPath, buffer);
    logger.info('[Main] Board image saved successfully:', fullPath);

    // Return relative path for storage in board JSON
    const relativePath = `snippets/boards/images/${boardId}/${filename}`;
    return { success: true, relativePath: relativePath, fullPath: fullPath };
  } catch (error) {
    logger.error('[Main] Error saving board image:', error);
    throw error;
  }
});

// Delete board image from app directory
ipcMain.handle('delete-board-image', async (event, imagePath) => {
  try {
    // Resolve path using PromptWaffle storage (portable data dir)
    const fullPath = path.isAbsolute(imagePath) && validatePromptWafflePath(imagePath)
      ? imagePath
      : resolvePromptWafflePath(imagePath);
    
    if (!validatePromptWafflePath(fullPath)) {
      logger.error('[Main] Invalid path for board image deletion:', imagePath);
      return false;
    }
    
    await fs.unlink(fullPath);
    logger.info('[Main] Board image deleted successfully:', fullPath);
    
    // Try to remove empty parent directory
    try {
      const parentDir = path.dirname(fullPath);
      const files = await fs.readdir(parentDir);
      if (files.length === 0) {
        await fs.rmdir(parentDir);
        logger.info('[Main] Removed empty board images directory:', parentDir);
      }
    } catch (dirError) {
      // Ignore errors when removing directory (may not be empty or may not exist)
    }
    
    return true;
  } catch (error) {
    logger.error('[Main] Error deleting board image:', error);
    return false;
  }
});

ipcMain.handle('load-image', async (event, imagePath) => {
  try {
    // Resolve path using PromptWaffle storage (portable data dir)
    const fullPath = resolvePromptWafflePath(imagePath);
    if (!validatePromptWafflePath(fullPath)) {
      console.error('[Main] Invalid path for image load:', imagePath);
      return null;
    }

    // Read the image file
    const imageBuffer = await fs.readFile(fullPath);
    return imageBuffer;
  } catch (error) {
    console.error('[Main] Error loading image:', error);
    return null;
  }
});

// Handle delete image
ipcMain.handle('delete-image', async (event, imagePath) => {
  try {
    const fullPath = resolvePromptWafflePath(imagePath);
    if (!validatePromptWafflePath(fullPath)) {
      console.error('[Main] Invalid path for image deletion:', imagePath);
      return false;
    }
    await fs.unlink(fullPath);
    console.log('[Main] Image deleted successfully:', fullPath);
    return true;
  } catch (error) {
    console.error('[Main] Error deleting image:', error);
    return false;
  }
});

console.log('[Main] IPC handlers registered successfully');

ipcMain.handle('load-image-file', async (event, imagePath) => {
  try {
    const imageBuffer = await fs.readFile(imagePath);

    return imageBuffer;
  } catch (error) {
    console.error('[Main] Error loading image file:', error);
    return null;
  }
});

ipcMain.handle('load-thumbnail', (event, thumbnailPath) => {
  return null;
});

// delete-image handler already registered above

ipcMain.handle('delete-thumbnail', (event, thumbnailPath) => {
  return true;
});

ipcMain.handle('image-exists', async (event, imagePath) => {
  try {
    console.log('[Main] image-exists called with path:', imagePath);

    // Resolve path using PromptWaffle storage (portable data dir)
    const fullPath = resolvePromptWafflePath(imagePath);
    if (!validatePromptWafflePath(fullPath)) {
      console.log('[Main] Image path outside data directory:', imagePath);
      return false;
    }
    console.log('[Main] Full path for image-exists:', fullPath);

    // Check if file exists
    await fs.access(fullPath);
    console.log('[Main] Image exists:', fullPath);
    return true;
  } catch (error) {
    // File doesn't exist or other error
    console.log('[Main] Image does not exist:', imagePath, error.message);
    return false;
  }
});

// Ensure boards directory exists (inside portable data dir)
async function ensureBoardsDir() {
  const boardsDir = getPromptWaffleDataPath('boards');
  try {
    await fs.access(boardsDir);
  } catch {
    await fs.mkdir(boardsDir, { recursive: true });
  }
}

// Ensure exports directory exists (inside portable data dir)
async function ensureExportsDir() {
  const exportsDir = getPromptWaffleDataPath('exports');
  try {
    await fs.access(exportsDir);
  } catch {
    await fs.mkdir(exportsDir, { recursive: true });
  }
}

// Ensure characters directory exists (inside portable data dir)
async function ensureCharactersDir() {
  const charactersDir = path.join(getPromptWaffleDataPath('snippets'), 'characters');
  try {
    await fs.access(charactersDir);
  } catch {
    await fs.mkdir(charactersDir, { recursive: true });
  }
}

// Handle app state and boards file operations
ipcMain.handle('fs-readFile', async (event, filePath) => {
  try {
    const sanitizedPath = validateAndSanitizePath(filePath);
    if (!sanitizedPath) {
      logSecurityEvent('invalid_file_path', { filePath, operation: 'fs-readFile' });
      throw new Error('Invalid file path');
    }

    const fullPath = resolvePromptWafflePath(sanitizedPath);
    if (!validatePromptWafflePath(fullPath)) {
      logSecurityEvent('path_traversal_attempt', { filePath, operation: 'fs-readFile' });
      throw new Error('Access denied: Path outside PromptWaffle data directory');
    }
    
    const content = await fs.readFile(fullPath, 'utf8');
    return content;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, return null to indicate this
      return null;
    }
    console.error('Error reading file:', error);
    throw error;
  }
});

ipcMain.handle('fs-writeFile', async (event, filePath, content) => {
  try {
    console.log('[Main] fs-writeFile handler called with:', filePath);
    // Security validation - use appropriate extensions based on file path
    let allowedExtensions;
    if (filePath.startsWith('exports/')) {
      allowedExtensions = ['md', 'txt', 'json'];
    } else if (filePath.startsWith('snippets/characters/')) {
      allowedExtensions = ['json', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];
    } else {
      allowedExtensions = ['txt', 'json', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];
    }

    const sanitizedPath = validateAndSanitizePath(filePath, allowedExtensions);
    if (!sanitizedPath) {
      logSecurityEvent('invalid_file_path', { filePath, operation: 'fs-writeFile' });
      throw new Error('Invalid file path');
    }

    // Validate content size
    if (!validateFileSize(content)) {
      logSecurityEvent('file_too_large', { filePath: sanitizedPath, contentSize: typeof content === 'string' ? content.length : content.byteLength });
      throw new Error('File content too large');
    }

    // Ensure appropriate directory exists
    if (sanitizedPath.startsWith('snippets/')) {
      await ensureSnippetsDir();
      if (sanitizedPath.startsWith('snippets/characters/')) {
        await ensureCharactersDir();
      }
    } else if (sanitizedPath.startsWith('boards/')) {
      await ensureBoardsDir();
    } else if (sanitizedPath.startsWith('exports/')) {
      await ensureExportsDir();
    }

    const fullPath = resolvePromptWafflePath(sanitizedPath);
    if (!validatePromptWafflePath(fullPath)) {
      logSecurityEvent('path_traversal_attempt', { filePath: sanitizedPath, operation: 'fs-writeFile' });
      throw new Error('Access denied: Path outside PromptWaffle data directory');
    }
    
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content, 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing file:', error);
    throw error;
  }
});

// Get initial data for the sidebar
ipcMain.handle('get-initial-data', async () => {
  try {
    console.log('[Main] get-initial-data handler called');
    await ensureSnippetsDir();

    const snippetsDir = getPromptWaffleDataPath('snippets');
    const sidebarTree = await buildSidebarTree(snippetsDir);

    return {
      sidebarTree
    };
  } catch (error) {
    console.error('Error getting initial data:', error);
    return {
      sidebarTree: []
    };
  }
});

// Build sidebar tree structure
async function buildSidebarTree(dirPath, relativePath = '') {
  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    const tree = [];

    for (const item of items) {
      const itemPath = path.join(relativePath, item.name);
      const fullPath = path.join(dirPath, item.name);

      if (item.isDirectory()) {
        // Skip the images folder - it shouldn't appear in the sidebar
        if (item.name === 'images') {
          continue;
        }

        const children = await buildSidebarTree(fullPath, itemPath);
        tree.push({
          type: 'folder',
          name: item.name,
          path: itemPath,
          children
        });
      } else if (item.isFile()) {
        if (item.name.endsWith('.txt')) {
          // Handle text file snippets
          try {
            const content = await fs.readFile(fullPath, 'utf8');
            const snippet = parseSnippetTextFile(content);
            if (snippet) {
              tree.push({
                type: 'snippet',
                name: item.name,
                path: itemPath,
                content: snippet
              });
            }
          } catch (error) {
            console.error(`Error reading snippet file ${itemPath}: `, error);
          }
        } else if (item.name.endsWith('.json')) {
          // Try to detect if this is a board file (has id, name, cards, tags)
          try {
            const content = await fs.readFile(fullPath, 'utf8');
            const parsed = JSON.parse(content);
            if (
              parsed &&
              typeof parsed === 'object' &&
              parsed.id &&
              parsed.name &&
              Array.isArray(parsed.cards) &&
              Array.isArray(parsed.tags)
            ) {
              // Treat as board
              tree.push({
                type: 'board',
                name: parsed.name,
                path: itemPath,
                content: parsed,
                tags: parsed.tags || []
              });
            } else if (
              parsed &&
              typeof parsed === 'object' &&
              parsed.text &&
              typeof parsed.text === 'string'
            ) {
              // Treat as JSON snippet
              tree.push({
                type: 'snippet',
                name: item.name.replace('.json', ''),
                path: itemPath,
                content: parsed
              });
            } else {
              // Treat as legacy snippet JSON
              tree.push({
                type: 'snippet',
                name: item.name,
                path: itemPath,
                content: parsed
              });
            }
          } catch (error) {
            console.error(`Error reading JSON file ${itemPath}: `, error);
          }
        }
      }
    }

    // Ensure "Cut Snippets" folder is always at the top
    const cutSnippetsIndex = tree.findIndex(
      item => item.type === 'folder' && item.name === 'Cut Snippets'
    );
    if (cutSnippetsIndex > 0) {
      const cutSnippetsItem = tree.splice(cutSnippetsIndex, 1)[0];
      tree.unshift(cutSnippetsItem);
    }

    return tree;
  } catch (error) {
    console.error('Error building sidebar tree:', error);
    return [];
  }
}

// Simple snippet text file parser for main process
function parseSnippetTextFile(content) {
  try {
    const parts = content.split('---\n');

    if (parts.length < 2) {
      return {
        text: content.trim(),
        tags: [],
        created: Date.now()
      };
    }

    const headerText = parts[0].trim();
    const bodyText = parts.slice(1).join('---\n').trim();

    const metadata = {};
    const headerLines = headerText.split('\n');

    for (const line of headerLines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();

        if (key === 'tags') {
          metadata[key] = value
            ? value
              .split(',')
              .map(tag => tag.trim())
              .filter(Boolean)
            : [];
        } else if (key === 'created') {
          metadata[key] = parseInt(value) || Date.now();
        } else {
          metadata[key] = value;
        }
      }
    }

    return {
      text: bodyText,
      tags: metadata.tags || [],
      created: metadata.created || Date.now(),
      title: metadata.title || ''
    };
  } catch (error) {
    console.error('Error parsing snippet text file:', error);
    return null;
  }
}

ipcMain.handle('open-image-dialog', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Images',
        extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']
      }
    ]
  });
  return result;
});

ipcMain.handle('select-folder', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select ComfyUI folder (e.g., ComfyUI/input/)'
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { cancelled: true };
    }

    return {
      cancelled: false,
      folderPath: result.filePaths[0]
    };
  } catch (error) {
    console.error('[Main] Error in select-folder:', error);
    return {
      cancelled: true,
      error: error.message
    };
  }
});

ipcMain.handle('open-folder-dialog', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  return result;
});

// Image viewer window handlers
ipcMain.handle('open-image-viewer', async (event, imageData) => {
  try {
    createImageViewerWindow();

    // Wait a bit for the window to be ready
    await new Promise(resolve => setTimeout(resolve, 100));

    if (imageViewerWindow) {
      imageViewerWindow.webContents.send('load-image', imageData);

      // Add a timeout to check if the window is still valid
      setTimeout(() => {
        if (imageViewerWindow && !imageViewerWindow.isDestroyed()) {
          // Window is valid, no action needed
        } else {
          console.error(
            '[Main] Image viewer window was destroyed or is invalid'
          );
        }
      }, 2000);
    } else {
      console.error('[Main] Image viewer window is null after creation');
    }

    return true;
  } catch (error) {
    console.error('[Main] Error opening image viewer:', error);
    throw error;
  }
});

ipcMain.handle('close-image-viewer', async () => {
  if (imageViewerWindow) {
    imageViewerWindow.close();
  }
  return true;
});

ipcMain.handle('minimize-image-viewer', async () => {
  if (imageViewerWindow) {
    imageViewerWindow.minimize();
  }
  return true;
});

ipcMain.handle('maximize-image-viewer', async () => {
  if (imageViewerWindow) {
    if (imageViewerWindow.isMaximized()) {
      imageViewerWindow.unmaximize();
    } else {
      imageViewerWindow.maximize();
    }
  }
  return true;
});

ipcMain.handle('set-image-viewer-position', async (event, x, y) => {
  if (imageViewerWindow) {
    imageViewerWindow.setPosition(x, y);
  }
  return true;
});

ipcMain.handle('set-image-viewer-size', async (event, width, height) => {
  if (imageViewerWindow) {
    imageViewerWindow.setSize(width, height);
  }
  return true;
});

ipcMain.handle('get-current-position', async () => {
  if (imageViewerWindow) {
    const position = imageViewerWindow.getPosition();
    return { x: position[0], y: position[1] };
  }
  return null;
});

ipcMain.handle('move-image-viewer', async (event, deltaX, deltaY) => {
  if (imageViewerWindow) {
    const position = imageViewerWindow.getPosition();
    const newX = position[0] + deltaX;
    const newY = position[1] + deltaY;
    imageViewerWindow.setPosition(newX, newY);
  }
  return true;
});

// Open external URL handler
ipcMain.handle('openExternal', async (event, url) => {
  try {
    // Security validation - only allow http/https URLs
    if (!url || typeof url !== 'string') {
      logSecurityEvent('invalid_url', { url, operation: 'openExternal' });
      throw new Error('Invalid URL');
    }

    // Check for dangerous protocols
    // eslint-disable-next-line no-script-url -- This branch rejects script URLs before opening external links.
    if (url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('file:')) {
      logSecurityEvent('dangerous_url_protocol', { url, operation: 'openExternal' });
      throw new Error('Dangerous URL protocol not allowed');
    }

    // Basic URL validation
    try {
      const urlObj = new URL(url);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        logSecurityEvent('unsupported_url_protocol', { url, protocol: urlObj.protocol });
        throw new Error('Unsupported URL protocol');
      }
    } catch (urlError) {
      logSecurityEvent('malformed_url', { url, error: urlError.message });
      throw new Error('Malformed URL');
    }

    await shell.openExternal(url);
    return true;
  } catch (error) {
    console.error('Error opening external URL:', error);
    throw error;
  }
});

// Auto-updater IPC handlers
ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// GitHub API handler for version checking (fallback)
ipcMain.handle('fetchLatestRelease', async (event, repoOwner, repoName) => {
  try {
    const https = require('https');

    // Validate inputs to prevent injection
    const safePattern = /^[a-zA-Z0-9-_.]+$/;
    if (!safePattern.test(repoOwner) || !safePattern.test(repoName)) {
      throw new Error('Invalid repository owner or name');
    }

    const url = `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`;

    return new Promise((resolve, reject) => {
      const request = https.get(
        url,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'PromptWaffle-App'
          }
        },
        response => {
          let data = '';

          response.on('data', chunk => {
            data += chunk;
          });

          response.on('end', () => {
            try {
              if (response.statusCode === 200) {
                const release = JSON.parse(data);
                const version = release.tag_name.replace(/^v/, '');

                resolve({
                  version,
                  name: release.name,
                  body: release.body,
                  html_url: release.html_url,
                  published_at: release.published_at,
                  prerelease: release.prerelease
                });
              } else {
                reject(
                  new Error(
                    `GitHub API responded with status: ${response.statusCode}`
                  )
                );
              }
            } catch (error) {
              reject(new Error('Failed to parse GitHub API response'));
            }
          });
        }
      );

      request.on('error', error => {
        reject(error);
      });

      request.setTimeout(10000, () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  } catch (error) {
    console.error('Error fetching latest release:', error);
    throw error;
  }
});

// Helper function to copy directory recursively
async function copyDirectory(src, dest) {
  try {
    await fs.mkdir(dest, { recursive: true });
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
  } catch (error) {
    logger.error(`[Main] Error copying directory ${src} to ${dest}:`, error);
    throw error;
  }
}

// Legacy ComfyUI helper functions removed (v2.0.0)
// findPromptWaffleNode and updateNodeViaWebSocket were only used by deprecated handler

// ComfyUI Integration Handler - File-based approach
// Saves prompt to a text file that ComfyUI node can read
ipcMain.handle('select-folder-and-save-prompt', async (event, prompt) => {
  try {
    if (!prompt || typeof prompt !== 'string') {
      return { success: false, error: 'Invalid prompt: must be a non-empty string' };
    }

    // Open folder selection dialog
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select folder to save prompt file (e.g., ComfyUI input folder)'
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { success: false, cancelled: true };
    }

    const folderPath = result.filePaths[0];
    const filename = 'promptwaffle_prompt.txt';
    const filePath = path.join(folderPath, filename);

    // Write the prompt to the file
    await fs.writeFile(filePath, prompt, 'utf8');
    console.log('[Main] Prompt saved to:', filePath);

    return {
      success: true,
      filePath: filePath,
      folderPath: folderPath,
      filename: filename
    };
  } catch (error) {
    console.error('[Main] Error saving prompt to file:', error);
    return {
      success: false,
      error: error.message || 'Failed to save prompt file'
    };
  }
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  try {
    const result = await dialog.showSaveDialog({
      title: options.title || 'Save File',
      defaultPath: options.defaultPath || 'untitled',
      filters: options.filters || [{ name: 'All Files', extensions: ['*'] }]
    });

    return result;
  } catch (error) {
    logger.error('[Main] Error showing save dialog:', error);
    return { canceled: true, error: error.message };
  }
});

// Combined save-dialog + write for exports (e.g. Export to Markdown).
// The renderer cannot write to arbitrary absolute paths through the sandboxed
// fs-writeFile handler, so we handle the dialog AND the write here in main.
ipcMain.handle('show-save-dialog-and-write', async (event, options, content) => {
  try {
    const result = await dialog.showSaveDialog({
      title: options.title || 'Save File',
      defaultPath: options.defaultPath || 'untitled',
      filters: options.filters || [{ name: 'All Files', extensions: ['*'] }]
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    await fs.writeFile(result.filePath, content, 'utf8');
    return { canceled: false, filePath: result.filePath };
  } catch (error) {
    logger.error('[Main] Error in show-save-dialog-and-write:', error);
    return { canceled: true, error: error.message };
  }
});

/* ipcMain.handle('open-backup-file-dialog', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Select Backup ZIP File to Verify',
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
      properties: ['openFile']
    });
    
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { cancelled: true };
    }
    
    return { cancelled: false, filePath: result.filePaths[0] };
  } catch (error) {
    logger.error('[Main] Error opening backup file dialog:', error);
    return { cancelled: true, error: error.message };
  }
}); */

ipcMain.handle('verify-backup', async (event, zipPath) => {
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();
    
    const issues = [];
    const warnings = [];
    const summary = {
      snippets: 0,
      boards: 0,
      characters: 0,
      characterImages: 0,
      boardImages: 0,
      profiles: 0,
      wildcards: 0
    };
    
    // Check for required folders
    const requiredFolders = ['snippets', 'boards'];
    const foundFolders = new Set();
    
    for (const entry of zipEntries) {
      const entryPath = entry.entryName.split('/');
      if (entryPath.length > 0) {
        foundFolders.add(entryPath[0]);
      }
      
      // Count files by type
      if (entry.entryName.startsWith('snippets/') && entry.entryName.endsWith('.json')) {
        summary.snippets++;
        if (entry.entryName.includes('characters/') && !entry.entryName.includes('images/')) {
          summary.characters++;
        }
      }
      if (entry.entryName.startsWith('snippets/characters/images/')) {
        summary.characterImages++;
      }
      if (entry.entryName.startsWith('snippets/boards/images/')) {
        summary.boardImages++;
      }
      if (entry.entryName.startsWith('boards/') && entry.entryName.endsWith('.json')) {
        summary.boards++;
      }
      if (entry.entryName.startsWith('profiles/') && entry.entryName.endsWith('.json')) {
        summary.profiles++;
      }
      if (entry.entryName.startsWith('wildcards/') && entry.entryName.endsWith('.txt')) {
        summary.wildcards++;
      }
      
      // Validate JSON files
      if (entry.entryName.endsWith('.json') && !entry.isDirectory) {
        try {
          const content = entry.getData().toString('utf8');
          JSON.parse(content);
        } catch (e) {
          issues.push(`Invalid JSON: ${entry.entryName}`);
        }
      }
    }
    
    // Check for required folders
    for (const folder of requiredFolders) {
      if (!foundFolders.has(folder)) {
        issues.push(`Missing required folder: ${folder}`);
      }
    }
    
    // Check manifest
    const manifestEntry = zipEntries.find(e => e.entryName === 'export_manifest.json');
    if (!manifestEntry) {
      warnings.push('No export manifest found (may be from older version)');
    }
    
    return {
      valid: issues.length === 0,
      issues,
      warnings,
      summary
    };
  } catch (error) {
    logger.error('[Verify] Error verifying backup:', error);
    return {
      valid: false,
      issues: [`Verification error: ${error.message}`],
      warnings: [],
      summary: {}
    };
  }
});

ipcMain.handle('save-prompt-to-file', async (event, prompt, folderPath, filename = 'promptwaffle_prompt.txt') => {
  try {
    if (!prompt || typeof prompt !== 'string') {
      return { success: false, error: 'Invalid prompt: must be a non-empty string' };
    }

    if (!folderPath || typeof folderPath !== 'string') {
      return { success: false, error: 'Invalid folder path' };
    }

    const filePath = path.join(folderPath, filename);

    // Ensure directory exists
    try {
      await fs.mkdir(folderPath, { recursive: true });
    } catch (mkdirError) {
      // Directory might already exist, that's okay
      console.log('[Main] Directory creation note:', mkdirError.message);
    }

    // Write the prompt to the file
    await fs.writeFile(filePath, prompt, 'utf8');
    console.log('[Main] Prompt saved to:', filePath);

    return {
      success: true,
      filePath: filePath,
      folderPath: folderPath,
      filename: filename
    };
  } catch (error) {
    console.error('[Main] Error saving prompt to file:', error);
    return {
      success: false,
      error: error.message || 'Failed to save prompt file'
    };
  }
});

// Legacy ComfyUI integration handler removed (v2.0.0)
// Use 'save-prompt-to-file' IPC handler and savePromptToComfyUI() from comfyui-integration.js instead
