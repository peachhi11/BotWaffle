/**
 * Service Registration and Container Initialization
 * Sets up the dependency injection container with all services
 */

const { container } = require('./container');
const ChatbotManager = require('./chatbot-manager');
const TemplateManager = require('./template-manager');
const AssetManager = require('./asset-manager');
const LMStudioService = require('./lmstudio-service');

/**
 * Initializes the service container with all managers
 * Call this once at application startup
 */
function initializeServices() {
    // Register managers as singletons
    container.register('chatbotManager', () => new ChatbotManager(), { singleton: true });
    container.register('templateManager', () => new TemplateManager(), { singleton: true });
    container.register('assetManager', () => new AssetManager(), { singleton: true });
    container.register('lmstudioService', () => new LMStudioService(), { singleton: true });
}

/**
 * Gets a service from the container
 * @param {string} name - Service name
 * @returns {*} Service instance
 */
function getService(name) {
    return container.resolve(name);
}

module.exports = {
    initializeServices,
    getService,
    container
};
