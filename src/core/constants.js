/**
 * Application-wide constants
 * Centralizes magic strings, numbers, and configuration values
 */

/**
 * Valid chatbot categories
 * @type {string[]}
 */
const CHATBOT_CATEGORIES = [
    'Character',
    'Assistant',
    'Roleplay',
    'Educational'
];

/**
 * Maximum number of images per chatbot
 * @type {number}
 */
const MAX_IMAGES = 50;

/**
 * Maximum number of tags per chatbot
 * @type {number}
 */
const MAX_TAGS = 10;

/**
 * Maximum length for chatbot name
 * @type {number}
 */
const MAX_NAME_LENGTH = 100;

/**
 * Maximum length for display name
 * @type {number}
 */
const MAX_DISPLAY_NAME_LENGTH = 100;

/**
 * Maximum length for description
 * @type {number}
 */
const MAX_DESCRIPTION_LENGTH = 2000;

/**
 * Maximum length for tag
 * @type {number}
 */
const MAX_TAG_LENGTH = 50;

/**
 * Maximum number of sections in layout
 * @type {number}
 */
const MAX_LAYOUT_SECTIONS = 50;

/**
 * Maximum JSON nesting depth
 * @type {number}
 */
const MAX_JSON_DEPTH = 10;

/**
 * Default chatbot category
 * @type {string}
 */
const DEFAULT_CATEGORY = 'Character';

/**
 * Default layout for new chatbots
 * @type {Array<{type: string, id: string, minimized: boolean}>}
 */
const DEFAULT_LAYOUT = [
    { type: 'profile', id: 'section-profile', minimized: false },
    { type: 'personality', id: 'section-personality', minimized: false },
    { type: 'scenario', id: 'section-scenario', minimized: false },
    { type: 'initial-messages', id: 'section-initial-messages', minimized: false },
    { type: 'example-dialogs', id: 'section-example-dialogs', minimized: false }
];

/**
 * Valid section types
 * @type {string[]}
 */
const VALID_SECTION_TYPES = [
    'profile',
    'personality',
    'custom'
];

/**
 * Storage subdirectories
 * @type {string[]}
 */
const STORAGE_DIRS = [
    'characters',  // New: per-character folders
    'chatbots',    // Legacy: kept for migration
    'conversations',
    'templates',
    'config',
    'assets',      // Legacy: kept for migration
    'prompt-waffle',
    'prompts'      // LM Studio prompt files
];

module.exports = {
    CHATBOT_CATEGORIES,
    MAX_IMAGES,
    MAX_TAGS,
    MAX_NAME_LENGTH,
    MAX_DISPLAY_NAME_LENGTH,
    MAX_DESCRIPTION_LENGTH,
    MAX_TAG_LENGTH,
    MAX_LAYOUT_SECTIONS,
    MAX_JSON_DEPTH,
    DEFAULT_CATEGORY,
    DEFAULT_LAYOUT,
    VALID_SECTION_TYPES,
    STORAGE_DIRS
};
