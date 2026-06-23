/**
 * Unit tests for storage.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock Electron before requiring storage
// Note: Can't use external variables in jest.mock factory, must require inside
jest.mock('electron', () => {
  const path = require('path');
  const os = require('os');
  return {
    app: {
      getAppPath: jest.fn(() => path.join(os.tmpdir(), `botwaffle-test-${process.pid}`)),
      getPath: jest.fn((name) => {
        if (name === 'userData') {
          return path.join(os.tmpdir(), `botwaffle-test-${Date.now()}`);
        }
        return os.tmpdir();
      }),
      isReady: jest.fn(() => true),
      on: jest.fn(),
      whenReady: jest.fn(() => Promise.resolve())
    }
  };
});

describe('Storage', () => {
  let cleanupDirs = [];

  beforeEach(() => {
    // Storage will create its own directory
    // We'll track it for cleanup
  });

  afterEach(() => {
    // Clean up test directories
    cleanupDirs.forEach(dir => {
      const resolvedDir = path.resolve(dir);
      const projectRoot = path.resolve(__dirname, '../..');
      const projectDataDir = path.join(projectRoot, 'data');
      if (
        resolvedDir === projectRoot ||
        resolvedDir === path.dirname(projectRoot) ||
        resolvedDir === projectDataDir ||
        resolvedDir.startsWith(`${projectDataDir}${path.sep}`)
      ) {
        throw new Error(`Refusing to clean unsafe test directory: ${resolvedDir}`);
      }
      if (fs.existsSync(resolvedDir)) {
        try {
          fs.rmSync(resolvedDir, { recursive: true, force: true });
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    });
    cleanupDirs = [];
  });

  describe('initializeStorage', () => {
    test('should create data directory structure', () => {
      // Clear module cache to get fresh instance
      jest.resetModules();
      const storage = require('../../src/core/storage');
      
      const result = storage.initializeStorage();
      expect(result).toBe(true);
      
      // Check that required directories are created
      const dataDir = storage.getDataPath('chatbots');
      const chatbotsDir = path.dirname(dataDir);
      
      // Track for cleanup
      cleanupDirs.push(chatbotsDir);
      
      expect(fs.existsSync(chatbotsDir)).toBe(true);
      expect(fs.existsSync(dataDir)).toBe(true);
    });

    test('should create all required subdirectories', () => {
      jest.resetModules();
      const storage = require('../../src/core/storage');
      storage.initializeStorage();
      
      const subdirs = ['chatbots', 'conversations', 'templates', 'config', 'assets'];
      subdirs.forEach(subdir => {
        const dirPath = storage.getDataPath(subdir);
        cleanupDirs.push(path.dirname(dirPath));
        expect(fs.existsSync(dirPath)).toBe(true);
      });
    });

    test('should not fail if directories already exist', () => {
      jest.resetModules();
      const storage = require('../../src/core/storage');
      storage.initializeStorage();
      const result = storage.initializeStorage(); // Call again
      expect(result).toBe(true);
    });
  });

  describe('getDataPath', () => {
    test('should return path for valid subdirectory', () => {
      jest.resetModules();
      const storage = require('../../src/core/storage');
      storage.initializeStorage();
      
      const chatbotsPath = storage.getDataPath('chatbots');
      expect(chatbotsPath).toBeTruthy();
      expect(typeof chatbotsPath).toBe('string');
      expect(chatbotsPath).toContain('chatbots');
    });

    test('should throw error for invalid subdirectory', () => {
      jest.resetModules();
      const storage = require('../../src/core/storage');
      
      expect(() => {
        storage.getDataPath('invalid-dir');
      }).toThrow();
    });

    test('should handle all valid subdirectories', () => {
      jest.resetModules();
      const storage = require('../../src/core/storage');
      storage.initializeStorage();
      
      const validDirs = ['chatbots', 'conversations', 'templates', 'config', 'assets'];
      validDirs.forEach(dir => {
        expect(() => storage.getDataPath(dir)).not.toThrow();
        const dirPath = storage.getDataPath(dir);
        expect(dirPath).toBeTruthy();
      });
    });
  });
});
