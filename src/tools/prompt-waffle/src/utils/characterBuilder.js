/**
 * Character Builder System
 * Handles character creation, editing, and management
 */

import { AppState } from '../state/appState.js';
import { showConfirmationModal, showDeleteConfirmation } from './confirmationModal.js';

class CharacterBuilder {
  constructor() {
    this.characters = [];
    this.filteredCharacters = [];
    this.currentCharacter = null;
    this.isInitialized = false;
    this.modal = null;
    this.characterLibrary = null;
    this.characterLibrarySearch = null;
    this.characterEditor = null;
    this.characterPreview = null;
    this.searchTerm = '';
  }

  /**
   * Initialize the character builder
   */
  async init() {
    if (this.isInitialized) {
      console.log('Character Builder already initialized');
      return;
    }

    try {
      console.log('Initializing Character Builder...');
      
      // Get modal elements
      this.modal = document.getElementById('characterBuilderModal');
      this.characterLibrary = document.getElementById('characterLibrary');
      this.characterLibrarySearch = document.getElementById('characterLibrarySearch');
      this.characterEditor = document.getElementById('characterEditor');
      this.characterPreview = document.getElementById('characterPreview');

      console.log('Modal elements found:', {
        modal: !!this.modal,
        characterLibrary: !!this.characterLibrary,
        characterEditor: !!this.characterEditor,
        characterPreview: !!this.characterPreview
      });

      // Setup event listeners
      this.setupEventListeners();

      // Setup draggable functionality
      this.setupDraggable();

      // Setup search functionality
      if (this.characterLibrarySearch) {
        this.characterLibrarySearch.addEventListener('input', (e) => {
          this.searchTerm = e.target.value;
          this.filterCharacters();
        });
      }

      // Load bots from BotWaffle
      await this.loadCharacters();
      
      // Initialize filtered characters
      this.filteredCharacters = [...this.characters];

      // Update UI
      this.updateCharacterLibrary();
      this.updatePreview();

      this.isInitialized = true;
      console.log('Character Builder initialized successfully');
    } catch (error) {
      console.error('Error initializing Character Builder:', error);
    }
  }

  /**
   * Setup draggable functionality
   */
  setupDraggable() {
    if (!this.modal) return;

    const modalContent = this.modal.querySelector('.character-builder-modal-content');
    const header = this.modal.querySelector('.character-builder-header');
    
    if (!modalContent || !header) return;

    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    header.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('close-btn')) return;
      
      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;

      if (e.target === header || header.contains(e.target)) {
        isDragging = true;
        header.style.cursor = 'grabbing';
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;

        xOffset = currentX;
        yOffset = currentY;

        modalContent.style.transform = `translate(${currentX}px, ${currentY}px)`;
      }
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
        header.style.cursor = 'move';
      }
    });

    // Reset position when modal is closed
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        modalContent.style.transform = 'translate(0px, 0px)';
        xOffset = 0;
        yOffset = 0;
      }
    });
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Modal controls
    const closeBtn = document.getElementById('closeCharacterBuilder');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
      this.closeModal();
    });
    } else {
      console.warn('Character Builder: closeCharacterBuilder button not found');
    }


    // Character editor controls
    const createNewCharacterBtn = document.getElementById('createNewCharacterBtn');
    if (createNewCharacterBtn) {
      createNewCharacterBtn.addEventListener('click', () => {
        console.log('Create New Character button clicked');
        this.createNewCharacter();
      });
    } else {
      console.warn('Character Builder: createNewCharacterBtn button not found');
    }

    const clearCharacterBtn = document.getElementById('clearCharacterBtn');
    if (clearCharacterBtn) {
      clearCharacterBtn.addEventListener('click', () => {
        console.log('Clear Character button clicked');
        this.clearEditor();
      });
    } else {
      console.warn('Character Builder: clearCharacterBtn button not found');
    }

    const addToBoardBtn = document.getElementById('addToBoardBtn');
    if (addToBoardBtn) {
      addToBoardBtn.addEventListener('click', () => {
        console.log('Add to Board button clicked');
      this.addCharacterToBoard();
    });
    } else {
      console.warn('Character Builder: addToBoardBtn button not found');
    }

    const updateCharacterBtn = document.getElementById('updateCharacterBtn');
    if (updateCharacterBtn) {
      updateCharacterBtn.addEventListener('click', () => {
        console.log('Update Character button clicked');
        this.updateCharacter();
      });
    } else {
      console.warn('Character Builder: updateCharacterBtn button not found');
    }

    // Form inputs - update preview on change
    const formInputs = this.characterEditor.querySelectorAll('input, select');
    formInputs.forEach(input => {
      input.addEventListener('input', () => {
        this.updatePreview();
      });
    });

    // Avatar preview (read-only, no buttons needed)
    // Avatar is loaded from BotWaffle bot data and displayed for reference only

    // Copy to clipboard button
    const copyToClipboardBtn = document.getElementById('copyToClipboardBtn');
    if (copyToClipboardBtn) {
      copyToClipboardBtn.addEventListener('click', () => {
        console.log('Copy to Clipboard button clicked');
        this.copyToClipboard();
      });
    } else {
      console.warn('Character Builder: copyToClipboardBtn button not found');
    }

    // Export to markdown button
    const exportMarkdownBtn = document.getElementById('exportMarkdownBtn');
    if (exportMarkdownBtn) {
      exportMarkdownBtn.addEventListener('click', () => {
        console.log('Export Markdown button clicked');
        this.exportToMarkdown();
      });
    } else {
      console.warn('Character Builder: exportMarkdownBtn button not found');
    }

    // Close modal when clicking outside
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.closeModal();
      }
    });
  }

  /**
   * Load characters from storage
   */
  async loadCharacters() {
    try {
      // Load bots from BotWaffle instead of local characters
      if (!window.electronAPI || !window.electronAPI.listChatbots) {
        console.error('BotWaffle API not available - window.electronAPI:', window.electronAPI);
        this.characters = [];
        this.filteredCharacters = [];
        return;
      }

      console.log('Loading bots from BotWaffle...');
      const bots = await window.electronAPI.listChatbots();
      
      if (!bots || !Array.isArray(bots)) {
        console.warn('No bots returned or invalid format:', bots);
        this.characters = [];
        this.filteredCharacters = [];
        return;
      }
      
      console.log(`Found ${bots.length} bots from BotWaffle`);
      
      // Clear existing characters to prevent duplicates
      this.characters = [];
      
      // Track IDs to prevent duplicates
      const seenIds = new Set();
      
      // Convert BotWaffle bots to character format for Character Builder
      for (const bot of bots) {
        try {
          // Skip if we've already seen this bot ID
          if (seenIds.has(bot.id)) {
            console.warn(`Skipping duplicate bot ID: ${bot.id}`);
            continue;
          }
          seenIds.add(bot.id);
          
          // Get full bot data if needed
          const fullBot = await window.electronAPI.getChatbot(bot.id);
          const botData = fullBot || bot;
          
          // Convert bot to character format
          const character = {
            id: botData.id,
            name: botData.profile?.displayName || botData.profile?.name || 'Unnamed Bot',
            description: botData.profile?.description || '',
            category: botData.profile?.category || '',
            tags: botData.profile?.tags || [],
            status: botData.metadata?.status || 'draft',
            // Avatar from bot's images
            avatar: this.getBotAvatar(botData),
            // Character data from personality section
            gender: this.extractCharacterField(botData, 'gender'),
            age: this.extractCharacterField(botData, 'age'),
            hair: this.extractCharacterField(botData, 'hair'),
            eyes: this.extractCharacterField(botData, 'eyes'),
            clothing: this.extractCharacterField(botData, 'clothing'),
            style: this.extractCharacterField(botData, 'style'),
            personality: this.extractPersonality(botData),
            // Store full bot data for reference
            botData: botData
          };
          
          this.characters.push(character);
        } catch (error) {
          console.error(`Error loading bot ${bot.id}:`, error);
        }
      }

      // Initialize filtered characters
      this.filteredCharacters = [...this.characters];
      // Apply current search filter if there's a search term
      if (this.searchTerm) {
        this.filterCharacters();
      }
      console.log(`Loaded ${this.characters.length} bots from BotWaffle`);
    } catch (error) {
      console.error('Error loading bots from BotWaffle:', error);
      console.error('Error stack:', error.stack);
      this.characters = [];
      this.filteredCharacters = [];
    }
  }

  /**
   * Get bot avatar image path
   */
  getBotAvatar(bot) {
    if (bot.profile?.images && bot.profile.images.length > 0) {
      const thumbnailIndex = bot.profile.thumbnailIndex !== undefined ? bot.profile.thumbnailIndex : 0;
      return bot.profile.images[thumbnailIndex] || bot.profile.images[0];
    } else if (bot.profile?.image) {
      return bot.profile.image;
    }
    return null;
  }

  /**
   * Extract character field from bot personality data
   */
  extractCharacterField(bot, fieldName) {
    if (!bot.personality || typeof bot.personality !== 'object') return '';
    
    const characterData = bot.personality.characterData || bot.personality;
    if (characterData && typeof characterData === 'object') {
      return characterData[fieldName] || '';
    }
    return '';
  }

  /**
   * Extract personality text from bot
   */
  extractPersonality(bot) {
    if (!bot.personality) return '';
    
    if (typeof bot.personality === 'string') {
      return bot.personality;
    }
    
    if (bot.personality.characterData) {
      return bot.personality.characterData.personality || '';
    }
    
    if (bot.personality.personality) {
      return bot.personality.personality;
    }
    
    return '';
  }

  /**
   * Filter characters based on search term
   */
  filterCharacters() {
    if (!this.searchTerm || this.searchTerm.trim() === '') {
      this.filteredCharacters = [...this.characters];
    } else {
      const searchLower = this.searchTerm.toLowerCase().trim();
      this.filteredCharacters = this.characters.filter(character => {
        const name = (character.name || '').toLowerCase();
        const description = (character.description || '').toLowerCase();
        const category = (character.category || '').toLowerCase();
        const tags = (character.tags || []).join(' ').toLowerCase();
        
        return name.includes(searchLower) ||
               description.includes(searchLower) ||
               category.includes(searchLower) ||
               tags.includes(searchLower);
      });
    }
    this.updateCharacterLibrary();
  }

  /**
   * Ensure characters directory exists
   */
  async ensureCharactersDirectory() {
    try {
      await window.electronAPI.readdir('snippets/characters');
    } catch (error) {
      // Directory doesn't exist, create it
      try {
        await window.electronAPI.createFolder('snippets/characters');
        console.log('Created characters directory');
      } catch (createError) {
        console.error('Error creating characters directory:', createError);
      }
    }
  }

  /**
   * Update character library display with BotWaffle bots as cards
   */
  updateCharacterLibrary() {
    if (!this.characterLibrary) return;

    this.characterLibrary.innerHTML = '';

    // Use filtered characters if search is active, otherwise use all characters
    const charactersToDisplay = (this.searchTerm && this.filteredCharacters.length >= 0) 
      ? this.filteredCharacters 
      : this.characters;

    if (charactersToDisplay.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'character-library-empty';
      emptyMessage.innerHTML = `
        <div class="character-library-empty-content">
          <i data-feather="inbox"></i>
          <div class="character-library-empty-text">
            <div class="character-library-empty-title">${this.searchTerm ? 'No bots found' : 'No bots yet'}</div>
            <div class="character-library-empty-description">${this.searchTerm ? 'Try a different search term' : 'Create bots in BotWaffle to see them here'}</div>
          </div>
        </div>
      `;
      this.characterLibrary.appendChild(emptyMessage);
      if (typeof feather !== 'undefined') {
        feather.replace();
      }
      return;
    }

    // Track rendered IDs to prevent duplicates
    const renderedIds = new Set();

    charactersToDisplay.forEach(character => {
      // Skip if already rendered
      if (renderedIds.has(character.id)) {
        console.warn(`Skipping duplicate character in display: ${character.id} - ${character.name}`);
        return;
      }
      renderedIds.add(character.id);
      const characterCard = document.createElement('div');
      characterCard.className = 'character-library-card';
      if (this.currentCharacter && this.currentCharacter.id === character.id) {
        characterCard.classList.add('selected');
      }

      // Build card structure using DOM methods for security
      const imageContainer = document.createElement('div');
      imageContainer.className = 'character-card-image-container';
      
      // Add avatar image if available
      if (character.avatar) {
        const isLocalFile = !character.avatar.startsWith('http://') && 
                           !character.avatar.startsWith('https://') && 
                           !character.avatar.startsWith('file://');
        let imageSrc = character.avatar;
        if (isLocalFile) {
          const normalizedPath = character.avatar.replace(/\\/g, '/');
          imageSrc = normalizedPath.startsWith('/') ? `file://${normalizedPath}` : `file:///${normalizedPath}`;
        }
        const avatarImg = document.createElement('img');
        avatarImg.src = imageSrc;
        avatarImg.alt = character.name; // textContent will escape automatically
        avatarImg.className = 'character-card-avatar';
        avatarImg.onerror = function() {
          this.style.display = 'none';
          if (this.nextElementSibling) {
            this.nextElementSibling.style.display = 'flex';
          }
        };
        imageContainer.appendChild(avatarImg);
      }
      
      // Add placeholder
      const placeholder = document.createElement('div');
      placeholder.className = 'character-card-avatar-placeholder';
      if (character.avatar) {
        placeholder.style.display = 'none';
      }
      const placeholderIcon = document.createElement('i');
      placeholderIcon.setAttribute('data-feather', 'user');
      placeholder.appendChild(placeholderIcon);
      imageContainer.appendChild(placeholder);
      
      // Status badge
      const statusValue = character.status || 'draft';
      const statusDisplay = statusValue === 'to-delete' ? 'To Delete' : 
                           statusValue.charAt(0).toUpperCase() + statusValue.slice(1);
      const statusClass = `status-badge status-${statusValue}`;
      
      // Content container
      const contentContainer = document.createElement('div');
      contentContainer.className = 'character-card-content';
      
      const header = document.createElement('div');
      header.className = 'character-card-header';
      
      const nameElement = document.createElement('h4');
      nameElement.className = 'character-card-name';
      nameElement.textContent = character.name;
      nameElement.title = character.name;
      
      const statusElement = document.createElement('span');
      statusElement.className = statusClass;
      statusElement.textContent = statusDisplay;
      
      header.appendChild(nameElement);
      header.appendChild(statusElement);
      contentContainer.appendChild(header);
      
      // Assemble card
      characterCard.appendChild(imageContainer);
      characterCard.appendChild(contentContainer);

      characterCard.addEventListener('click', async () => {
        await this.selectCharacter(character.id);
      });

      this.characterLibrary.appendChild(characterCard);
    });

    // Replace feather icons
    if (typeof feather !== 'undefined') {
      feather.replace();
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Load character image using the loadImage API
   */
  async loadCharacterImage(imgElement, imagePath) {
    try {
      console.log('Loading character image from path:', imagePath);
      
      // Check if image exists
      const exists = await window.electronAPI.imageExists(imagePath);
      if (!exists) {
        console.warn('Character image does not exist:', imagePath);
        imgElement.style.display = 'none';
        return;
      }

      // Load the image buffer
      const imageBuffer = await window.electronAPI.loadImage(imagePath);
      if (imageBuffer) {
        // Determine image type from file extension
        const extension = imagePath.toLowerCase().split('.').pop();
        let mimeType = 'image/jpeg'; // default
        if (extension === 'png') mimeType = 'image/png';
        else if (extension === 'gif') mimeType = 'image/gif';
        else if (extension === 'webp') mimeType = 'image/webp';
        else if (extension === 'bmp') mimeType = 'image/bmp';
        
        // Create blob URL from buffer
        const blob = new Blob([imageBuffer], { type: mimeType });
        const imageUrl = URL.createObjectURL(blob);
        imgElement.src = imageUrl;
        imgElement.style.display = 'block';
        console.log('Character image loaded successfully with type:', mimeType, 'URL:', imageUrl);
      } else {
        console.warn('Failed to load character image buffer:', imagePath);
        imgElement.style.display = 'none';
      }
    } catch (error) {
      console.error('Error loading character image:', error);
      imgElement.style.display = 'none';
    }
  }

  /**
   * Generate a short description for character display
   */
  generateCharacterDescription(character) {
    const parts = [];
    if (character.gender) parts.push(character.gender);
    if (character.age) parts.push(character.age);
    if (character.style) parts.push(character.style);
    
    return parts.length > 0 ? parts.join(', ') : 'No details set';
  }

  /**
   * Create a new character
   */
  createNewCharacter() {
    console.log('Creating new character...');
    this.currentCharacter = {
      id: this.generateCharacterId(),
      name: '',
      gender: '',
      age: '',
      hair: '',
      eyes: '',
      clothing: '',
      style: '',
      personality: '',
      tags: '',
      created: Date.now(),
      modified: Date.now()
    };
    console.log('New character created:', this.currentCharacter);

    this.populateEditor();
    this.updateCharacterLibrary();
    this.updatePreview();
    // Both buttons are always visible now
  }

  /**
   * Edit an existing character
   */
  editCharacter(characterId) {
    const character = this.characters.find(c => c.id === characterId);
    if (character) {
      this.currentCharacter = { ...character };
      this.populateEditor();
      this.updateCharacterLibrary();
      this.updatePreview();
    }
  }

  /**
   * Select a character
   */
  async selectCharacter(characterId) {
    // Search in both characters and filteredCharacters
    const character = this.characters.find(c => c.id === characterId) || 
                     this.filteredCharacters.find(c => c.id === characterId);
    if (character) {
      // If we have botData, use it to get fresh data
      if (character.botData && window.electronAPI?.getChatbot) {
        try {
          const freshBot = await window.electronAPI.getChatbot(characterId);
          if (freshBot) {
            // Update character with fresh bot data
            character.botData = freshBot;
            character.avatar = this.getBotAvatar(freshBot);
            character.name = freshBot.profile?.displayName || freshBot.profile?.name || character.name;
            character.description = freshBot.profile?.description || character.description;
            character.category = freshBot.profile?.category || character.category;
            character.tags = freshBot.profile?.tags || character.tags;
            character.status = freshBot.metadata?.status || character.status;
          }
        } catch (error) {
          console.error('Error loading fresh bot data:', error);
        }
      }
      
      this.currentCharacter = { ...character };
      this.populateEditor();
      this.updateCharacterLibrary();
      this.updatePreview();
    }
  }

  /**
   * Update button visibility based on whether we're editing an existing character
   * Both buttons are now always visible
   */
  updateButtonVisibility(isEditing) {
    // Both buttons are now always visible - no need to hide/show them
    console.log('updateButtonVisibility called with isEditing:', isEditing);
    console.log('Both Add Character and Update Character buttons are always visible');
  }

  /**
   * Update an existing character
   */
  async updateCharacter() {
    try {
      if (!this.currentCharacter) {
        console.error('No character selected for update');
        const { showToast } = await import('./index.js');
        showToast('No character selected to update', 'error');
        return;
      }

      // Get form data
      const formData = this.getCharacterFromForm();
      console.log('Form data retrieved:', formData);
      
      // Validate that character has a name
      if (!formData.name || formData.name.trim() === '') {
        const { showToast } = await import('./index.js');
        showToast('Please enter a character name before updating the character', 'warning');
        return;
      }

      // If character doesn't have a filePath (e.g., from BotWaffle), create one
      if (!this.currentCharacter.filePath) {
        const safeName = formData.name.replace(/[^a-zA-Z0-9\s-]/g, '').trim() || 'character';
        const fileName = `${safeName}_${this.currentCharacter.id}.json`;
        this.currentCharacter.filePath = `snippets/characters/${fileName}`;
        console.log('Created filePath for character:', this.currentCharacter.filePath);
      }

      // Update current character with new data
      this.currentCharacter = {
        ...this.currentCharacter,
        ...formData,
        modified: Date.now()
      };

      // Save the updated character
      await this.saveCharacter();

      // Force clear compiled prompt cache to ensure updated content is shown
      try {
        const { clearCompiledPromptCache } = await import('../bootstrap/boards.js');
        if (clearCompiledPromptCache) {
          clearCompiledPromptCache();
        }
      } catch (error) {
        console.warn('Error clearing compiled prompt cache:', error);
      }

      // Re-render the board to update any cards using this character
      try {
        const { renderBoard, updateCompiledPrompt } = await import('../bootstrap/boards.js');
        await renderBoard();
        // Also update the compiled prompt to reflect changes
        updateCompiledPrompt(true); // Force update
        console.log('Board re-rendered after character update');
      } catch (error) {
        console.warn('Error re-rendering board after character update:', error);
      }

      // Show success notification
      showToast(`Character "${this.currentCharacter.name || 'Unnamed'}" updated successfully!`, 'success');

      console.log('Character updated successfully');
    } catch (error) {
      console.error('Error updating character:', error);
      showToast('Error updating character', 'error');
    }
  }

  /**
   * Populate the editor with current character data
   * Note: For BotWaffle bots, only show the name and avatar - don't populate prompt fields
   * The prompt fields should be empty so users can type their own image prompts
   */
  populateEditor() {
    if (!this.currentCharacter) {
      console.warn('No current character to populate editor');
      return;
    }

    console.log('Populating editor with character:', this.currentCharacter);

    // Only populate the name field (for reference)
    const nameElement = document.getElementById('characterName');
    if (nameElement) {
      nameElement.value = this.currentCharacter.name || '';
    }

    // Load prompt fields from bot's resources if available, otherwise leave empty
    const promptFields = [
      'characterGender', 'characterAge', 'characterHair',
      'characterEyes', 'characterClothing', 'characterStyle', 
      'characterPersonality', 'characterGenitals', 'characterTags'
    ];

    // Check if bot has saved image prompt data
    let imagePrompts = null;
    if (this.currentCharacter.botData?.resources?.imagePrompts) {
      imagePrompts = this.currentCharacter.botData.resources.imagePrompts;
    }

    promptFields.forEach(fieldId => {
      const element = document.getElementById(fieldId);
      if (element) {
        if (imagePrompts) {
          // Load from saved bot data
          const propertyName = fieldId.replace('character', '').toLowerCase();
          element.value = imagePrompts[propertyName] || '';
        } else {
          // Leave empty for new prompts
          element.value = '';
        }
      }
    });

    // Clear avatar preview first
    this.clearAvatarPreview();
    
    // Load avatar if available (for visual reference only)
    if (this.currentCharacter.avatar) {
      this.loadAvatarPreview(this.currentCharacter.avatar);
    }
    
    // Update preview to show empty (since fields are cleared)
    this.updatePreview();
  }

  /**
   * Update the character preview - shows only prompt fields
   */
  updatePreview() {
    if (!this.characterPreview) return;

    const character = this.getCharacterFromForm();
    const prompt = this.generateCharacterPrompt(character);
    
    // Format the preview nicely - show prompt fields only
    if (!prompt || prompt.trim() === '') {
      this.characterPreview.textContent = 'No prompt fields filled. Fill in the fields above to generate a prompt.';
      this.characterPreview.style.color = 'var(--text-secondary)';
      this.characterPreview.style.fontStyle = 'italic';
    } else {
      this.characterPreview.textContent = prompt;
      this.characterPreview.style.color = 'var(--text-primary)';
      this.characterPreview.style.fontStyle = 'normal';
    }
  }

  /**
   * Get character data from form
   */
  getCharacterFromForm() {
    const formData = {
      name: document.getElementById('characterName')?.value || '',
      gender: document.getElementById('characterGender')?.value || '',
      age: document.getElementById('characterAge')?.value || '',
      hair: document.getElementById('characterHair')?.value || '',
      eyes: document.getElementById('characterEyes')?.value || '',
      clothing: document.getElementById('characterClothing')?.value || '',
      style: document.getElementById('characterStyle')?.value || '',
      personality: document.getElementById('characterPersonality')?.value || '',
      genitals: document.getElementById('characterGenitals')?.value || '',
      tags: document.getElementById('characterTags')?.value || ''
    };
    console.log('Form data retrieved:', formData);
    return formData;
  }

  /**
   * Generate character prompt from character data
   */
  generateCharacterPrompt(character) {
    const parts = [];
    
    // Physical attributes (exclude name - it's just a reference)
    if (character.gender) parts.push(character.gender);
    if (character.age) parts.push(character.age);
    if (character.hair) parts.push(character.hair);
    if (character.eyes) parts.push(character.eyes);
    
    // Style and clothing
    if (character.clothing) parts.push(character.clothing);
    if (character.style) parts.push(character.style);
    
    // Personality
    if (character.personality) parts.push(character.personality);
    
    // Genitals
    if (character.genitals) parts.push(character.genitals);
    
    // Tags
    if (character.tags) {
      const tagList = character.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      if (tagList.length > 0) {
        parts.push(...tagList);
      }
    }

    return parts.join(', ');
  }

  /**
   * Save the current character
   */
  async saveCharacter() {
    console.log('saveCharacter called, currentCharacter:', this.currentCharacter);
    if (!this.currentCharacter) {
      console.warn('No current character to save');
      return;
    }

    try {
      const characterData = this.getCharacterFromForm();
      
      const { showToast } = await import('./index.js');
      
      // Validate that character has a name
      if (!characterData.name || characterData.name.trim() === '') {
        showToast('Please enter a character name before adding the character', 'warning');
        return;
      }
      
      // Check if character with same name already exists in sidebar (unless it's the same character being updated)
      const characterName = characterData.name.trim();
      const existingCharacter = this.characters.find(c => 
        c.name === characterName && 
        c.id !== this.currentCharacter.id && 
        c.filePath // Only check characters that are actually saved
      );
      
      if (existingCharacter) {
        showToast(`Character "${characterName}" already exists! Use "Save" to update it, or choose a different name.`, 'warning');
        return;
      }
      
      // Update current character with form data
      Object.assign(this.currentCharacter, characterData);
      this.currentCharacter.modified = Date.now();

      // Generate file path if new character
      if (!this.currentCharacter.filePath) {
        const safeName = this.currentCharacter.name.replace(/[^a-zA-Z0-9\s-]/g, '').trim() || 'character';
        const fileName = `${safeName}_${this.currentCharacter.id}.json`;
        this.currentCharacter.filePath = `snippets/characters/${fileName}`;
      }

      // Handle image saving
      if (this.currentCharacterImage1 || this.currentCharacterImage2) {
        try {
          // Create images directory if it doesn't exist
          const imagesDir = 'snippets/characters/images';
          try {
            await window.electronAPI.readdir(imagesDir);
          } catch (error) {
            await window.electronAPI.createFolder(imagesDir);
          }

          // Save first image if present
          if (this.currentCharacterImage1) {
            const imageExtension = this.currentCharacterImage1.name.split('.').pop();
            const imageFileName = `${this.currentCharacter.id}_1.${imageExtension}`;
            const imagePath = `${imagesDir}/${imageFileName}`;
            
            const arrayBuffer = await this.currentCharacterImage1.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            const imageData = Array.from(uint8Array);
            
            await window.electronAPI.saveImage(this.currentCharacter.id, imageData, imageFileName);
            this.currentCharacter.imagePath1 = imagePath;
            console.log('Character image 1 saved:', imagePath);
          }

          // Save second image if present
          if (this.currentCharacterImage2) {
            const imageExtension = this.currentCharacterImage2.name.split('.').pop();
            const imageFileName = `${this.currentCharacter.id}_2.${imageExtension}`;
            const imagePath = `${imagesDir}/${imageFileName}`;
            
            const arrayBuffer = await this.currentCharacterImage2.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            const imageData = Array.from(uint8Array);
            
            await window.electronAPI.saveImage(this.currentCharacter.id, imageData, imageFileName);
            this.currentCharacter.imagePath2 = imagePath;
            console.log('Character image 2 saved:', imagePath);
          }
        } catch (error) {
          console.error('Error saving character images:', error);
        }
      }

      // Create snippet format for the character
      const prompt = this.generateCharacterPrompt(characterData);
      
      // Build tags array - include character name and any additional tags
      const tags = ['character'];
      if (characterData.name && characterData.name.trim()) {
        tags.push(characterData.name.trim());
      }
      if (characterData.tags && characterData.tags.trim()) {
        const additionalTags = characterData.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
        tags.push(...additionalTags);
      }
      
      const snippetData = {
        name: characterData.name || 'Character',
        text: prompt,
        tags: tags,
        type: 'character',
        created: this.currentCharacter.created || Date.now(),
        modified: Date.now(),
        // Keep original character data for internal use
        characterData: this.currentCharacter
      };

      // Save to file in snippet format
      await window.electronAPI.writeFile(this.currentCharacter.filePath, JSON.stringify(snippetData, null, 2));

      // Update snippet cache immediately (don't wait for file read)
      const snippets = AppState.getSnippets();
      snippets[this.currentCharacter.filePath] = snippetData;
      AppState.setSnippets(snippets);
      console.log('Snippet cache updated immediately with path:', this.currentCharacter.filePath);
      console.log('Updated snippet data:', snippetData);
      console.log('Cache now contains:', Object.keys(snippets).length, 'snippets');
      
      // Verify the update worked
      const verifySnippet = AppState.getSnippets()[this.currentCharacter.filePath];
      if (verifySnippet && verifySnippet.text === snippetData.text) {
        console.log('✓ Snippet cache update verified successfully');
      } else {
        console.error('✗ Snippet cache update verification failed!');
        console.error('Expected text:', snippetData.text);
        console.error('Actual text:', verifySnippet?.text);
      }

      // Update characters array
      const existingIndex = this.characters.findIndex(c => c.id === this.currentCharacter.id);
      if (existingIndex >= 0) {
        this.characters[existingIndex] = { ...this.currentCharacter };
      } else {
        this.characters.push({ ...this.currentCharacter });
      }

      // Check if character is linked to a BotWaffle bot, or if we need to create one
      let botId = null;
      let botData = null;

      // If character already has botData, use it
      if (this.currentCharacter.botData && this.currentCharacter.botData.id) {
        botId = this.currentCharacter.botData.id;
        botData = this.currentCharacter.botData;
      } else {
        // Check if a bot with this name already exists
        try {
          const allBots = await window.electronAPI.listChatbots();
          const existingBot = allBots.find(bot => 
            bot.profile?.name?.toLowerCase() === characterName.toLowerCase()
          );

          if (existingBot) {
            // Link to existing bot
            botId = existingBot.id;
            botData = existingBot;
            this.currentCharacter.botData = existingBot;
            console.log('Linked character to existing BotWaffle bot:', botId);
          } else {
            // Create a new bot in BotWaffle
            try {
              // Prepare avatar image path if available
              const avatarImages = [];
              if (this.currentCharacter.avatar) {
                avatarImages.push(this.currentCharacter.avatar);
              }

              // Prepare tags from character data
              const botTags = [];
              if (characterData.tags && characterData.tags.trim()) {
                const tagArray = characterData.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
                botTags.push(...tagArray);
              }

              // Create bot profile data
              const newBotData = {
                name: characterName,
                category: 'Character', // Default category
                tags: botTags,
                images: avatarImages,
                description: prompt || '', // Use generated prompt as description
                thumbnailIndex: avatarImages.length > 0 ? 0 : -1
              };

              const newBot = await window.electronAPI.createChatbot(newBotData);
              botId = newBot.id;
              botData = newBot;
              this.currentCharacter.botData = newBot;
              // Also update the character's botId reference
              this.currentCharacter.botId = newBot.id;
              console.log('Created new BotWaffle bot for character:', botId);
              showToast(`Created new bot "${characterName}" in BotWaffle`, 'success');
              
              // Notify main window to refresh bot list
              try {
                if (window.electronAPI && typeof window.electronAPI.notifyBotCreated === 'function') {
                  window.electronAPI.notifyBotCreated(newBot.id, characterName);
                }
              } catch (error) {
                console.warn('Could not notify main window of bot creation:', error);
              }
              
              // Reload characters to include the new bot
              await this.loadCharacters();
            } catch (createError) {
              console.warn('Could not create BotWaffle bot:', createError);
              // Continue without bot - character will still be saved as snippet
            }
          }
        } catch (error) {
          console.warn('Could not check/create BotWaffle bot:', error);
          // Continue without bot - character will still be saved as snippet
        }
      }

      // If we have a bot, save the prompt data to it
      if (botId && botData && window.electronAPI?.updateChatbot) {
        try {
          const updatedBot = { ...botData };
          
          // Store character prompt data in bot's resources
          if (!updatedBot.resources) {
            updatedBot.resources = {};
          }
          if (!updatedBot.resources.imagePrompts) {
            updatedBot.resources.imagePrompts = {};
          }
          
          // Save the prompt fields
          updatedBot.resources.imagePrompts = {
            gender: characterData.gender || '',
            age: characterData.age || '',
            hair: characterData.hair || '',
            eyes: characterData.eyes || '',
            clothing: characterData.clothing || '',
            style: characterData.style || '',
            personality: characterData.personality || '',
            genitals: characterData.genitals || '',
            tags: characterData.tags || '',
            prompt: prompt, // The generated prompt
            lastUpdated: Date.now()
          };
          
          // Also add to bot's metadata.imagePrompts array (for Image Prompts view)
          if (!updatedBot.metadata) {
            updatedBot.metadata = {};
          }
          if (!Array.isArray(updatedBot.metadata.imagePrompts)) {
            updatedBot.metadata.imagePrompts = [];
          }
          
          // Check if this character snippet already exists in imagePrompts
          const characterPromptName = `[Character Snippet] ${characterData.name || 'Unnamed'}`;
          const existingIndex = updatedBot.metadata.imagePrompts.findIndex(
            p => typeof p === 'object' && p.name === characterPromptName
          );
          
          // Create date tag in format YYYY-MM-DD for sorting
          const now = new Date();
          const dateTag = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          // Create timestamp tag for precise sorting (hidden, sortable format: YYYY-MM-DD-HH-MM-SS)
          const timestampTag = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
          
          // Create the prompt object with character snippet indicator
          const characterPrompt = {
            name: characterPromptName,
            text: prompt,
            tags: ['character-snippet', 'character-builder', dateTag, timestampTag, ...(characterData.tags ? characterData.tags.split(',').map(t => t.trim()).filter(t => t) : [])],
            createdAt: this.currentCharacter.created ? new Date(this.currentCharacter.created).toISOString() : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            source: 'character-builder',
            characterId: this.currentCharacter.id
          };
          
          if (existingIndex >= 0) {
            // Update existing prompt
            updatedBot.metadata.imagePrompts[existingIndex] = characterPrompt;
            console.log('Updated existing character snippet in imagePrompts:', existingIndex);
          } else {
            // Add new prompt
            updatedBot.metadata.imagePrompts.push(characterPrompt);
            console.log('Added new character snippet to imagePrompts');
          }
          
          // Update the bot in BotWaffle
          await window.electronAPI.updateChatbot(botId, updatedBot);
          console.log('Character prompt data saved to BotWaffle bot:', botId);
          
          // Also save as .txt file in image-prompts folder
          try {
            const characterFolderPath = await window.electronAPI.getCharacterFolderPath(botId, 'image-prompts');
            if (characterFolderPath) {
              const safeName = (characterData.name || 'character').replace(/[^a-zA-Z0-9\s-]/g, '').trim() || 'character';
              const fileName = `character-snippet-${safeName}-${this.currentCharacter.id}.txt`;
              const filePath = require('path').join(characterFolderPath, fileName);
              
              // Create file content with header indicating it's a character snippet
              const fileContent = `# Character Snippet: ${characterData.name || 'Unnamed'}
# Generated by Character Builder
# Character ID: ${this.currentCharacter.id}
# Created: ${new Date().toISOString()}

Tags: character-snippet, character-builder${characterData.tags ? ', ' + characterData.tags : ''}

${prompt}
`;
              
              // Note: We need to use the Electron API to write to the character folder
              // Since we're in PromptWaffle webview, we'll need to use IPC
              // For now, we'll rely on the metadata.imagePrompts array
              // The file can be created when viewing in BotWaffle's Image Prompts view
              console.log('Character snippet would be saved to:', filePath);
            }
          } catch (fileError) {
            console.warn('Could not save character snippet file:', fileError);
            // Non-critical, continue
          }
        } catch (error) {
          console.warn('Could not save character data to BotWaffle bot:', error);
          // Don't fail the save if this doesn't work
        }
      }

      // Update UI
      this.updateCharacterLibrary();
      this.updatePreview();

      // Also add to sidebar as a snippet (pass the snippetData to avoid re-reading)
      await this.addCharacterToSidebar(snippetData);

      // Show success notification (showToast already imported at top of function)
      showToast(`Character "${characterData.name || 'Unnamed'}" saved successfully!`, 'success');

      console.log('Character saved successfully');
    } catch (error) {
      console.error('Error saving character:', error);
    }
  }

  /**
   * Delete a character
   */
  async deleteCharacter(characterId = null) {
    const { showToast } = await import('./index.js');
    const id = characterId || (this.currentCharacter ? this.currentCharacter.id : null);
    if (!id) return;

    const character = this.characters.find(c => c.id === id);
    if (!character) return;

    const confirmed = await showDeleteConfirmation(
      character.name || 'this character',
      'character'
    );

    if (confirmed) {
      try {
        // Delete file if it exists
        if (character.filePath) {
          try {
            await window.electronAPI.deleteFile(character.filePath);
            console.log('Character file deleted:', character.filePath);
          } catch (error) {
            console.warn('Could not delete character file:', error);
          }
        }

        // Remove from characters array
        this.characters = this.characters.filter(c => c.id !== id);
        this.filteredCharacters = this.filteredCharacters.filter(c => c.id !== id);

        // Clear current character if it was deleted
        if (this.currentCharacter && this.currentCharacter.id === id) {
          this.currentCharacter = null;
          this.clearEditor();
        }

        // Remove from AppState snippets
        if (character.filePath) {
          const snippets = AppState.getSnippets();
          delete snippets[character.filePath];
          AppState.setSnippets(snippets);
          console.log('Character removed from AppState snippets:', character.filePath);
          
          // Also remove from sidebar tree if it exists
          try {
            if (window.sidebarTree && character.filePath) {
              // Use the same removal logic as sidebar.js
              const removeSnippetFromTree = (tree, path) => {
                if (!tree || !Array.isArray(tree)) return null;
                for (let i = 0; i < tree.length; i++) {
                  if (tree[i].type === 'snippet' && tree[i].path === path) {
                    return tree.splice(i, 1)[0];
                  } else if (tree[i].type === 'folder' && tree[i].children) {
                    const found = removeSnippetFromTree(tree[i].children, path);
                    if (found) return found;
                  }
                }
                return null;
              };
              
              const removed = removeSnippetFromTree(window.sidebarTree, character.filePath);
              if (removed) {
                console.log('Character removed from sidebar tree');
                // Refresh sidebar
                const { renderSidebar } = await import('../bootstrap/sidebar.js');
                if (renderSidebar) {
                  const foldersContainer = document.getElementById('foldersContainer');
                  if (foldersContainer) {
                    renderSidebar(window.sidebarTree, foldersContainer);
                  }
                }
              }
            }
          } catch (error) {
            console.warn('Could not remove from sidebar tree:', error);
          }
        }

        // Remove from sidebar tree and refresh sidebar
        if (window.sidebarTree && character.filePath) {
          console.log('Attempting to remove character from sidebar tree:', character.filePath);
          console.log('Current sidebar tree:', window.sidebarTree);
          
          // Find and remove from sidebar tree
          const removeFromTree = (tree) => {
            for (let i = tree.length - 1; i >= 0; i--) {
              const item = tree[i];
              console.log('Checking sidebar item:', item);
              console.log('Comparing paths - item.path:', item.path, 'character.filePath:', character.filePath);
              
              // Check for exact match or normalized path match
              if (item.type === 'snippet' && (
                item.path === character.filePath || 
                item.path === character.filePath.replace(/\\/g, '/') ||
                item.path === character.filePath.replace(/\//g, '\\')
              )) {
                tree.splice(i, 1);
                console.log('Character removed from sidebar tree at index:', i);
                return true;
              }
              if (item.type === 'folder' && item.children) {
                console.log('Checking folder children:', item.name);
                if (removeFromTree(item.children)) {
                  return true;
                }
              }
            }
            return false;
          };
          
          const removed = removeFromTree(window.sidebarTree);
          console.log('Character removal from sidebar tree result:', removed);
          
          // Refresh the sidebar display
          try {
            const { renderSidebar } = await import('../bootstrap/sidebar.js');
            const foldersContainer = document.getElementById('foldersContainer');
            if (foldersContainer) {
              console.log('Refreshing sidebar with updated tree');
              renderSidebar(window.sidebarTree, foldersContainer);
              console.log('Sidebar refreshed after character deletion');
            } else {
              console.error('foldersContainer not found');
            }
          } catch (error) {
            console.error('Error refreshing sidebar after deletion:', error);
          }
        } else {
          console.log('Cannot remove from sidebar - missing sidebarTree or filePath');
          console.log('sidebarTree exists:', !!window.sidebarTree);
          console.log('character.filePath:', character.filePath);
        }

        // Update UI
        this.updateCharacterLibrary();
        this.updatePreview();

        // Show success notification
        showToast(`Character "${character.name || 'Unnamed'}" deleted successfully!`, 'success');

        console.log('Character deleted successfully');
      } catch (error) {
        console.error('Error deleting character:', error);
      }
    }
  }

  /**
   * Duplicate a character
   */
  async duplicateCharacter(characterId) {
    const { showToast } = await import('./index.js');
    const character = this.characters.find(c => c.id === characterId);
    if (!character) {
      console.warn('Character not found for duplication:', characterId);
      return;
    }

    try {
      console.log('Duplicating character:', character.name);

      // Generate a new unique ID and file path
      const newId = this.generateCharacterId();
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 11);
      const newFileName = `${character.name}_copy_${timestamp}_${randomSuffix}.json`;
      const newFilePath = `snippets/characters/${newFileName}`;

      // Create a deep copy of the character data
      const duplicatedCharacter = {
        ...character,
        id: newId,
        name: this.generateDuplicateName(character.name),
        filePath: newFilePath,
        created: Date.now(),
        modified: Date.now(),
        // Clear image paths - they will be copied and updated below
        imagePath1: null,
        imagePath2: null
      };

      // Copy images if they exist
      if (character.imagePath1) {
        try {
          const newImagePath1 = await this.copyCharacterImage(character.imagePath1, newId, 1);
          duplicatedCharacter.imagePath1 = newImagePath1;
        } catch (error) {
          console.warn('Failed to copy image 1:', error);
        }
      }

      if (character.imagePath2) {
        try {
          const newImagePath2 = await this.copyCharacterImage(character.imagePath2, newId, 2);
          duplicatedCharacter.imagePath2 = newImagePath2;
        } catch (error) {
          console.warn('Failed to copy image 2:', error);
        }
      }

      // Generate the prompt for the duplicated character
      const prompt = this.generateCharacterPrompt(duplicatedCharacter);
      
      // Build tags array - include character name and any additional tags
      const tags = ['character'];
      if (duplicatedCharacter.name && duplicatedCharacter.name.trim()) {
        tags.push(duplicatedCharacter.name.trim());
      }
      if (duplicatedCharacter.tags && duplicatedCharacter.tags.trim()) {
        const additionalTags = duplicatedCharacter.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
        tags.push(...additionalTags);
      }

      // Create snippet data in the same format as the original
      const snippetData = {
        name: duplicatedCharacter.name,
          text: prompt,
        tags: tags,
          type: 'character',
        created: duplicatedCharacter.created,
        modified: duplicatedCharacter.modified,
        characterData: duplicatedCharacter
      };

      // Save the duplicated character to file
      await window.electronAPI.writeFile(newFilePath, JSON.stringify(snippetData, null, 2));

      // Add to characters array
      this.characters.push(duplicatedCharacter);

        // Add to AppState snippets
      const snippets = AppState.getSnippets();
      snippets[newFilePath] = snippetData;
      AppState.setSnippets(snippets);

      // Add to sidebar
      await this.addCharacterToSidebar();

      // Update UI
      this.updateCharacterLibrary();

      // Show success notification
      showToast(`Character "${duplicatedCharacter.name}" duplicated successfully!`, 'success');

      console.log('Character duplicated successfully:', duplicatedCharacter.name);
    } catch (error) {
      console.error('Error duplicating character:', error);
      showToast('Error duplicating character: ' + error.message, 'error');
    }
  }

  /**
   * Generate a duplicate name with proper numbering
   */
  generateDuplicateName(originalName) {
    const characterNameExists = name => this.characters.some(c => c.name === name);

    // Check if the name already ends with a number pattern
    const numberMatch = originalName.match(/^(.+?)(_(\d+))?$/);
    if (numberMatch) {
      const baseName = numberMatch[1];
      const existingNumber = numberMatch[3] ? parseInt(numberMatch[3]) : 0;
      
      // Find the next available number
      let newNumber = existingNumber + 1;
      let newName = `${baseName}_${newNumber.toString().padStart(2, '0')}`;
      
      // Check if this name already exists
      while (characterNameExists(newName)) {
        newNumber++;
        newName = `${baseName}_${newNumber.toString().padStart(2, '0')}`;
      }
      
      return newName;
    }
    
    // If no number pattern, just add _01
    let newName = `${originalName}_01`;
    let counter = 1;
    
    // Check if this name already exists and increment if needed
    while (characterNameExists(newName)) {
      counter++;
      newName = `${originalName}_${counter.toString().padStart(2, '0')}`;
    }
    
    return newName;
  }

  /**
   * Copy a character image to a new file for the duplicated character
   */
  async copyCharacterImage(originalImagePath, newCharacterId, imageNumber) {
    try {
      console.log('Copying character image:', originalImagePath, 'to new character:', newCharacterId);
      
      // Read the original image file
      const imageBuffer = await window.electronAPI.readFile(originalImagePath);
      
      // Generate new image filename based on the new character ID
      const fileExtension = originalImagePath.split('.').pop();
      const newImageFilename = `${newCharacterId}_${imageNumber}.${fileExtension}`;
      const newImagePath = `snippets/characters/images/${newImageFilename}`;
      
      // Save the image to the new path
      await window.electronAPI.writeFile(newImagePath, imageBuffer);
      
      console.log('Image copied successfully to:', newImagePath);
      return newImagePath;
    } catch (error) {
      console.error('Error copying character image:', error);
      throw error;
    }
  }

  /**
   * Add character to board as a snippet
   */
  async addCharacterToBoard() {
    const { showToast } = await import('./index.js');
    console.log('addCharacterToBoard called, currentCharacter:', this.currentCharacter);
    if (!this.currentCharacter) {
      console.warn('No current character to add to board');
      showToast('No character selected to add to board', 'error');
      return;
    }

    const characterData = this.getCharacterFromForm();
    console.log('Character data from form:', characterData);
    const prompt = this.generateCharacterPrompt(characterData);
    console.log('Generated prompt:', prompt);

    if (!prompt.trim()) {
      console.warn('No prompt generated for character');
      showToast('Please fill in at least one prompt field to add to board', 'error');
      return;
    }

    try {
      // Ensure character has a name
      if (!characterData.name || characterData.name.trim() === '') {
        showToast('Please enter a character name before adding to board', 'warning');
        return;
      }

      // Update current character with form data
      Object.assign(this.currentCharacter, characterData);
      this.currentCharacter.modified = Date.now();

      // Generate file path if new character (doesn't have one yet)
      if (!this.currentCharacter.filePath) {
        const safeName = this.currentCharacter.name.replace(/[^a-zA-Z0-9\s-]/g, '').trim() || 'character';
        const fileName = `${safeName}_${this.currentCharacter.id}.json`;
        this.currentCharacter.filePath = `snippets/characters/${fileName}`;
        console.log('Generated file path for new character:', this.currentCharacter.filePath);
      }

      console.log('Current character file path:', this.currentCharacter.filePath);
      
      // Build tags array
      const tags = ['character'];
      if (characterData.name && characterData.name.trim()) {
        tags.push(characterData.name.trim());
      }
      if (characterData.tags && characterData.tags.trim()) {
        const additionalTags = characterData.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
        tags.push(...additionalTags);
      }
      
      // Create snippet data
      const snippetData = {
        name: characterData.name || 'Character',
        text: prompt,
        tags: tags,
        type: 'character',
        created: this.currentCharacter.created || Date.now(),
        modified: Date.now(),
        characterData: this.currentCharacter
      };

      // Save snippet to file
      console.log('Saving snippet to file:', this.currentCharacter.filePath);
      await window.electronAPI.writeFile(this.currentCharacter.filePath, JSON.stringify(snippetData, null, 2));
      console.log('Snippet saved to file successfully');

      // Add to AppState snippets
      const currentSnippets = AppState.getSnippets();
      currentSnippets[this.currentCharacter.filePath] = snippetData;
      AppState.setSnippets(currentSnippets);
      console.log('Character added to AppState snippets');
      
      // Add to sidebar tree
      await this.addCharacterToSidebar(snippetData);
      console.log('Character added to sidebar');

      // Add to board using the existing system
      console.log('Importing addCardToBoard...');
      const { addCardToBoard } = await import('../bootstrap/boards.js');
      console.log('addCardToBoard imported successfully');
      
      const x = 100 + (Math.random() * 200); // Random position
      const y = 100 + (Math.random() * 200);
      console.log('Calling addCardToBoard with path:', this.currentCharacter.filePath, 'x:', x, 'y:', y);
      
      await addCardToBoard(this.currentCharacter.filePath, x, y);
      console.log('addCardToBoard completed successfully');

      // Also save to BotWaffle image prompts if character is linked to a bot
      if (this.currentCharacter.botData && this.currentCharacter.botData.id && window.electronAPI?.updateChatbot) {
        try {
          const botId = this.currentCharacter.botData.id;
          const bot = await window.electronAPI.getChatbot(botId);
          if (bot) {
            if (!bot.metadata) {
              bot.metadata = {};
            }
            if (!Array.isArray(bot.metadata.imagePrompts)) {
              bot.metadata.imagePrompts = [];
            }
            
            const characterPromptName = `[Character Snippet] ${characterData.name || 'Unnamed'}`;
            const existingIndex = bot.metadata.imagePrompts.findIndex(
              p => typeof p === 'object' && p.name === characterPromptName
            );
            
            // Create date tag in format YYYY-MM-DD for sorting
            const now = new Date();
            const dateTag = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            // Create timestamp tag for precise sorting (hidden, sortable format: YYYY-MM-DD-HH-MM-SS)
            const timestampTag = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
            
            const characterPrompt = {
              name: characterPromptName,
              text: prompt,
              tags: ['character-snippet', 'character-builder', dateTag, timestampTag, ...(characterData.tags ? characterData.tags.split(',').map(t => t.trim()).filter(t => t) : [])],
              createdAt: this.currentCharacter.created ? new Date(this.currentCharacter.created).toISOString() : new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              source: 'character-builder',
              characterId: this.currentCharacter.id
            };
            
            if (existingIndex >= 0) {
              bot.metadata.imagePrompts[existingIndex] = characterPrompt;
            } else {
              bot.metadata.imagePrompts.push(characterPrompt);
            }
            
            await window.electronAPI.updateChatbot(botId, { metadata: bot.metadata });
            console.log('Character snippet saved to BotWaffle image prompts');
          }
        } catch (imagePromptError) {
          console.warn('Could not save to image prompts:', imagePromptError);
          // Non-critical, continue
        }
      }

      // Show success message but don't close the modal
      showToast(`Character "${characterData.name || 'Unnamed'}" added to board successfully!`, 'success');
      
      console.log('Character added to board successfully');
    } catch (error) {
      console.error('Error adding character to board:', error);
      console.error('Error stack:', error.stack);
      showToast('Error adding character to board: ' + error.message, 'error');
      
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(prompt);
        console.log('Character prompt copied to clipboard as fallback');
        showToast('Character prompt copied to clipboard as fallback', 'info');
      } catch (clipboardError) {
        console.error('Error copying to clipboard:', clipboardError);
      }
    }
  }

  /**
   * Add character to sidebar as a snippet (without adding to board)
   * @param {Object} snippetData - Optional snippet data to use instead of reading from file
   */
  async addCharacterToSidebar(snippetData = null) {
    console.log('addCharacterToSidebar called, currentCharacter:', this.currentCharacter);
    if (!this.currentCharacter) {
      console.warn('No current character to add to sidebar');
      return;
    }

    // Use provided snippetData or read from file
    if (!snippetData) {
      const characterData = this.getCharacterFromForm();
      console.log('Character data from form:', characterData);
      const prompt = this.generateCharacterPrompt(characterData);
      console.log('Generated prompt:', prompt);

      if (!prompt.trim()) {
        console.warn('No character prompt generated');
        return;
      }

      try {
        // Read the saved snippet data from the file
        console.log('Reading snippet data from file:', this.currentCharacter.filePath);
        const content = await window.electronAPI.readFile(this.currentCharacter.filePath);
        snippetData = JSON.parse(content);
        console.log('Snippet data read from file:', snippetData);
      } catch (error) {
        console.error('Error reading snippet data from file:', error);
        return;
      }
    }

    if (snippetData) {
      try {
        // Add to AppState snippets (update cache if not already updated)
        const snippets = AppState.getSnippets();
        snippets[this.currentCharacter.filePath] = snippetData;
        AppState.setSnippets(snippets);
        console.log('Character snippet added to AppState with path:', this.currentCharacter.filePath);
        console.log('Snippet data:', snippetData);
        console.log('All snippets in AppState after adding character:', Object.keys(AppState.getSnippets()));

        // Refresh the sidebar to show the new character snippet
        try {
          const { renderSidebar } = await import('../bootstrap/sidebar.js');
          const foldersContainer = document.getElementById('foldersContainer');
          if (foldersContainer && window.sidebarTree) {
            // Add the new snippet to the sidebar tree
            const snippetEntry = {
              type: 'snippet',
              path: this.currentCharacter.filePath,
              content: snippetData
            };
            
            // Find the characters folder in the sidebar tree
            let charactersFolder = null;
            for (const entry of window.sidebarTree) {
              if (entry.type === 'folder' && entry.name === 'characters') {
                charactersFolder = entry;
                break;
              }
            }
            
            // Normalize path for comparison (handle both forward and backslashes)
            const normalizePath = (path) => {
              if (!path) return '';
              return path.replace(/\\/g, '/').toLowerCase().trim();
            };
            
            const targetPathNormalized = normalizePath(this.currentCharacter.filePath);
            console.log('Looking for snippet with normalized path:', targetPathNormalized);
            
            // Check if snippet already exists in sidebar tree and update it instead of adding duplicate
            const findAndUpdateSnippet = (tree, targetPath) => {
              for (let i = 0; i < tree.length; i++) {
                const entry = tree[i];
                const entryPathNormalized = normalizePath(entry.path);
                
                if (entry.type === 'snippet' && entryPathNormalized === targetPath) {
                  // Update existing snippet entry
                  console.log('Found existing snippet at index', i, 'with path:', entry.path);
                  entry.content = snippetData;
                  console.log('Updated snippet content');
                  return true;
                }
                if (entry.children && entry.children.length > 0) {
                  if (findAndUpdateSnippet(entry.children, targetPath)) {
                    return true;
                  }
                }
              }
              return false;
            };
            
            // Try to update existing snippet first
            const snippetUpdated = findAndUpdateSnippet(window.sidebarTree, targetPathNormalized);
            console.log('Snippet update check result:', snippetUpdated, 'for path:', this.currentCharacter.filePath);
            
            if (!snippetUpdated) {
              // Snippet doesn't exist yet, add it
              console.log('Snippet not found in sidebar tree, adding new entry');
              
              // Check if it already exists in the characters folder before adding
              if (charactersFolder && charactersFolder.children) {
                const existsInFolder = charactersFolder.children.some(
                  child => child.type === 'snippet' && normalizePath(child.path) === targetPathNormalized
                );
                
                if (!existsInFolder) {
                  console.log('Adding snippet to characters folder');
                  charactersFolder.children.push(snippetEntry);
                } else {
                  console.log('Snippet already exists in characters folder, updating instead');
                  const existingIndex = charactersFolder.children.findIndex(
                    child => child.type === 'snippet' && normalizePath(child.path) === targetPathNormalized
                  );
                  if (existingIndex >= 0) {
                    charactersFolder.children[existingIndex].content = snippetData;
                    console.log('Updated existing snippet in characters folder');
                  }
                }
              } else {
                // Check if it exists in root before adding
                const existsInRoot = window.sidebarTree.some(
                  entry => entry.type === 'snippet' && normalizePath(entry.path) === targetPathNormalized
                );
                
                if (!existsInRoot) {
                  console.log('Adding snippet to root level');
                  window.sidebarTree.push(snippetEntry);
                } else {
                  console.log('Snippet already exists in root, updating instead');
                  const existingIndex = window.sidebarTree.findIndex(
                    entry => entry.type === 'snippet' && normalizePath(entry.path) === targetPathNormalized
                  );
                  if (existingIndex >= 0) {
                    window.sidebarTree[existingIndex].content = snippetData;
                    console.log('Updated existing snippet in root');
                  }
                }
              }
            }
            
            // Re-render the sidebar while preserving folder states
            const { schedulePartialSidebarUpdate } = await import('../bootstrap/sidebar.js');
            schedulePartialSidebarUpdate();
          }
        } catch (error) {
          console.error('Error refreshing sidebar:', error);
        }

        console.log('Character added to sidebar successfully');
      } catch (error) {
        console.error('Error adding character to sidebar:', error);
      }
    }
  }

  /**
   * Clear the editor
   */
  clearEditor() {
    // Clear form fields
    const fields = [
      'characterName', 'characterGender', 'characterAge', 'characterHair',
      'characterEyes', 'characterClothing', 'characterStyle', 'characterPersonality', 'characterTags', 'characterGenitals'
    ];

    fields.forEach(fieldId => {
      const element = document.getElementById(fieldId);
      if (element) {
        element.value = '';
      }
    });

    // Clear current character and create a new one
    this.currentCharacter = null;
    this.createNewCharacter();
    
    // Clear images
    this.currentCharacterImage1 = null;
    this.currentCharacterImage2 = null;
    this.currentAvatarFile = null;
    
    // Clear image previews
    this.clearImagePreviews();
    
    // Update preview
    this.updatePreview();
    
    // Update character library selection
    this.updateCharacterLibrary();
    
    // Refresh feather icons
    if (typeof feather !== 'undefined') {
      feather.replace();
    }
    
    console.log('Editor cleared and new character created');
  }

  /**
   * Generate a unique character ID
   */
  generateCharacterId() {
    return 'char_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Open the character builder modal
   */
  async openModal() {
    console.log('=== openModal() called ===');
    console.log('Modal element:', this.modal);
    console.log('isInitialized:', this.isInitialized);
    
    // Always try to find modal element fresh
    if (!this.modal) {
      this.modal = document.getElementById('characterBuilderModal');
      console.log('Modal found via fresh search:', !!this.modal);
    }
    
    if (!this.modal) {
      console.error('Character builder modal not found - attempting to re-initialize...');
      // Try to re-initialize
      try {
        await this.init();
      } catch (initError) {
        console.error('Error during re-initialization:', initError);
      }
      
      // Try again after init
      if (!this.modal) {
        this.modal = document.getElementById('characterBuilderModal');
      }
      
      if (!this.modal) {
        console.error('Character builder modal still not found after re-initialization');
        alert('ERROR: Character Builder modal not found in DOM. Please refresh the page.');
        return;
      }
    }
    
    try {
      console.log('Reloading bots from BotWaffle...');
      // Reload bots from BotWaffle to get latest data
      await this.loadCharacters();
      console.log('Bots loaded, count:', this.characters.length);
      
      // Create a new character when opening the modal (for editing)
      this.createNewCharacter();
      this.populateEditor();
      
      console.log('Setting modal display to block...');
      this.modal.style.display = 'block';
      console.log('Modal display set, current style:', this.modal.style.display);
      
      // Force visibility
      this.modal.style.visibility = 'visible';
      this.modal.style.opacity = '1';
      
      // Focus on search input if available, otherwise first input
      setTimeout(() => {
        if (this.characterLibrarySearch) {
          this.characterLibrarySearch.focus();
        } else {
          const firstInput = this.characterEditor?.querySelector('input');
          if (firstInput) {
            firstInput.focus();
          }
        }
      }, 100);
      
      console.log('=== Character builder modal opened successfully ===');
    } catch (error) {
      console.error('=== ERROR opening character builder modal ===');
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.error('Full error:', error);
      alert('Error opening Character Builder: ' + error.message);
    }
  }

  /**
   * Close the character builder modal
   */
  closeModal() {
    if (this.modal) {
      this.modal.style.display = 'none';
      
      // Reset modal position
      const modalContent = this.modal.querySelector('.character-builder-modal-content');
      if (modalContent) {
        modalContent.style.transform = 'translate(0px, 0px)';
      }
    }
  }

  /**
   * Handle image upload for character
   */
  async handleImageUpload(file, slotNumber = 1) {
    if (!file) return;

    try {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file.');
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('Image file is too large. Please select an image smaller than 5MB.');
        return;
      }

      // Create a preview
      const reader = new FileReader();
      reader.onload = (e) => {
        this.displayImagePreview(e.target.result, slotNumber);
      };
      reader.readAsDataURL(file);

      // Store the file for saving
      if (slotNumber === 1) {
        this.currentCharacterImage1 = file;
      } else {
        this.currentCharacterImage2 = file;
      }
      console.log(`Character image ${slotNumber} uploaded:`, file.name);
    } catch (error) {
      console.error('Error handling image upload:', error);
      alert('Error uploading image. Please try again.');
    }
  }

  /**
   * Load character image for the editor preview
   */
  async loadCharacterImageForEditor(imagePath, slotNumber = 1) {
    try {
      console.log(`Loading character image ${slotNumber} for editor from path:`, imagePath);
      
      // Check if image exists
      const exists = await window.electronAPI.imageExists(imagePath);
      if (!exists) {
        console.warn(`Character image ${slotNumber} does not exist for editor:`, imagePath);
        return;
      }

      // Load the image buffer
      const imageBuffer = await window.electronAPI.loadImage(imagePath);
      if (imageBuffer) {
        // Determine image type from file extension
        const extension = imagePath.toLowerCase().split('.').pop();
        let mimeType = 'image/jpeg'; // default
        if (extension === 'png') mimeType = 'image/png';
        else if (extension === 'gif') mimeType = 'image/gif';
        else if (extension === 'webp') mimeType = 'image/webp';
        else if (extension === 'bmp') mimeType = 'image/bmp';
        
        // Create blob URL from buffer
        const blob = new Blob([imageBuffer], { type: mimeType });
        const imageUrl = URL.createObjectURL(blob);
        
        // Display the image preview
        this.displayImagePreview(imageUrl, slotNumber);
        console.log(`Character image ${slotNumber} loaded for editor with type:`, mimeType);
      } else {
        console.warn(`Failed to load character image ${slotNumber} buffer for editor:`, imagePath);
      }
    } catch (error) {
      console.error(`Error loading character image ${slotNumber} for editor:`, error);
    }
  }


  /**
   * Clear avatar preview
   */
  clearAvatarPreview() {
    const avatarPreview = document.getElementById('characterAvatarPreview');
    
    if (avatarPreview) {
      avatarPreview.innerHTML = `
        <div class="character-avatar-placeholder">
          <i data-feather="user"></i>
          <span>No avatar</span>
        </div>
      `;
      
      // Refresh feather icons
      if (typeof feather !== 'undefined') {
        feather.replace();
      }
    }
    
    const removeAvatarBtn = document.getElementById('removeAvatarBtn');
    if (removeAvatarBtn) {
      removeAvatarBtn.style.display = 'none';
    }
    
    console.log('Avatar preview cleared');
  }

  /**
   * Load avatar preview
   */
  async loadAvatarPreview(avatarPath) {
    const avatarPreview = document.getElementById('characterAvatarPreview');
    if (!avatarPreview) return;
    
    try {
      const isLocalFile = !avatarPath.startsWith('http://') && 
                         !avatarPath.startsWith('https://') && 
                         !avatarPath.startsWith('file://');
      
      let imageSrc = avatarPath;
      if (isLocalFile) {
        const normalizedPath = avatarPath.replace(/\\/g, '/');
        imageSrc = normalizedPath.startsWith('/') ? `file://${normalizedPath}` : `file:///${normalizedPath}`;
      }
      
      // Use secure DOM methods instead of innerHTML for user-provided paths
      avatarPreview.innerHTML = ''; // Clear first
      const img = document.createElement('img');
      img.src = imageSrc;
      img.alt = 'Avatar';
      img.className = 'character-avatar-image';
      img.onerror = function() {
        this.style.display = 'none';
        if (this.nextElementSibling) {
          this.nextElementSibling.style.display = 'flex';
        }
      };
      avatarPreview.appendChild(img);
      
      const placeholder = document.createElement('div');
      placeholder.className = 'character-avatar-placeholder';
      placeholder.style.display = 'none';
      placeholder.innerHTML = '<i data-feather="user"></i><span>No avatar</span>';
      avatarPreview.appendChild(placeholder);
      
      const removeAvatarBtn = document.getElementById('removeAvatarBtn');
      if (removeAvatarBtn) {
        removeAvatarBtn.style.display = 'inline-block';
      }
      
      if (typeof feather !== 'undefined') {
        feather.replace();
      }
    } catch (error) {
      console.error('Error loading avatar preview:', error);
      this.clearAvatarPreview();
    }
  }

  /**
   * Handle avatar upload
   */
  async handleAvatarUpload(file) {
    if (!file) return;
    
    const avatarPreview = document.getElementById('characterAvatarPreview');
    if (!avatarPreview) return;
    
    try {
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        avatarPreview.innerHTML = `<img src="${e.target.result}" alt="Avatar" class="character-avatar-image">`;
        const removeAvatarBtn = document.getElementById('removeAvatarBtn');
        if (removeAvatarBtn) {
          removeAvatarBtn.style.display = 'inline-block';
        }
      };
      reader.readAsDataURL(file);
      
      // Store file for later use (if needed to save to BotWaffle)
      this.currentAvatarFile = file;
    } catch (error) {
      console.error('Error handling avatar upload:', error);
    }
  }

  /**
   * Remove avatar
   */
  async removeAvatar() {
    const confirmed = await showConfirmationModal(
      'Remove Avatar',
      'Are you sure you want to remove the avatar?'
    );
    
    if (!confirmed) return;
    
    this.currentAvatarFile = null;
    if (this.currentCharacter) {
      this.currentCharacter.avatar = null;
    }
    
    this.clearAvatarPreview();
  }

  /**
   * Clear image previews
   */
  clearImagePreviews() {
    const imagePreview1 = document.getElementById('characterImagePreview1');
    const imagePreview2 = document.getElementById('characterImagePreview2');
    
    if (imagePreview1) {
      imagePreview1.innerHTML = '<div class="image-placeholder"><i data-feather="image"></i><span>No image</span></div>';
    }
    if (imagePreview2) {
      imagePreview2.innerHTML = '<div class="image-placeholder"><i data-feather="image"></i><span>No image</span></div>';
    }
    
    // Refresh feather icons
    if (typeof feather !== 'undefined') {
      feather.replace();
    }
    
    console.log('Image previews cleared');
  }

  /**
   * Display image preview
   */
  displayImagePreview(imageData, slotNumber = 1) {
    const imagePreview = document.getElementById(`characterImagePreview${slotNumber}`);
    const chooseBtn = document.getElementById(`characterImageBtn${slotNumber}`);
    const removeBtn = document.getElementById(`removeImageBtn${slotNumber}`);

    if (imagePreview && chooseBtn) {
      // Use secure DOM methods for image data
      imagePreview.innerHTML = ''; // Clear first
      const img = document.createElement('img');
      img.src = imageData;
      img.alt = `Character preview ${slotNumber}`;
      img.style.width = '100%';
      img.style.height = '300px';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '4px';
      img.style.border = '1px solid #555';
      imagePreview.appendChild(img);
      chooseBtn.textContent = `Change Image ${slotNumber}`;
      if (removeBtn) {
        removeBtn.style.display = 'inline-block';
      }
    }
  }

  /**
   * Remove character image
   */
  async removeCharacterImage(slotNumber = null) {
    // Show confirmation dialog
    const confirmMessage = slotNumber ? 
      `Are you sure you want to permanently delete Image ${slotNumber}? This action cannot be undone.` :
      'Are you sure you want to permanently delete all character images? This action cannot be undone.';
    
    const confirmed = await showConfirmationModal(
      'Delete Image',
      confirmMessage
    );

    if (!confirmed) {
      return;
    }

    if (slotNumber === 1 || slotNumber === null) {
      // Delete the image file if it exists
      if (this.currentCharacter && this.currentCharacter.imagePath1) {
        try {
          const deleted = await window.electronAPI.deleteImage(this.currentCharacter.imagePath1);
          if (deleted) {
            console.log('Image 1 file deleted successfully');
            // Remove from character data
            this.currentCharacter.imagePath1 = null;
          } else {
            console.warn('Failed to delete image 1 file');
          }
        } catch (error) {
          console.error('Error deleting image 1 file:', error);
        }
      }

      // Clear the UI
      const imagePreview1 = document.getElementById('characterImagePreview1');
      const chooseBtn1 = document.getElementById('characterImageBtn1');
      const removeBtn1 = document.getElementById('removeImageBtn1');
      const imageInput1 = document.getElementById('characterImage1');

      if (imagePreview1 && chooseBtn1 && imageInput1) {
        imagePreview1.innerHTML = '';
        chooseBtn1.textContent = 'Choose Image 1';
        imageInput1.value = '';
        if (removeBtn1) {
          removeBtn1.style.display = 'none';
        }
      }
      this.currentCharacterImage1 = null;
    }
    
    if (slotNumber === 2 || slotNumber === null) {
      // Delete the image file if it exists
      if (this.currentCharacter && this.currentCharacter.imagePath2) {
        try {
          const deleted = await window.electronAPI.deleteImage(this.currentCharacter.imagePath2);
          if (deleted) {
            console.log('Image 2 file deleted successfully');
            // Remove from character data
            this.currentCharacter.imagePath2 = null;
          } else {
            console.warn('Failed to delete image 2 file');
          }
        } catch (error) {
          console.error('Error deleting image 2 file:', error);
        }
      }

      // Clear the UI
      const imagePreview2 = document.getElementById('characterImagePreview2');
      const chooseBtn2 = document.getElementById('characterImageBtn2');
      const removeBtn2 = document.getElementById('removeImageBtn2');
      const imageInput2 = document.getElementById('characterImage2');

      if (imagePreview2 && chooseBtn2 && imageInput2) {
        imagePreview2.innerHTML = '';
        chooseBtn2.textContent = 'Choose Image 2';
        imageInput2.value = '';
        if (removeBtn2) {
          removeBtn2.style.display = 'none';
        }
      }
      this.currentCharacterImage2 = null;
    }

    // Save the character to update the data
    if (this.currentCharacter) {
      await this.saveCharacter();
    }

    // Update the character library to reflect changes
    this.updateCharacterLibrary();
  }

  /**
   * Add image to existing character
   */
  async addImageToCharacter(characterId) {
    const character = this.characters.find(c => c.id === characterId);
    if (!character) return;

    // Create a file input for image selection
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        // Validate file type
        if (!file.type.startsWith('image/')) {
          alert('Please select a valid image file.');
          return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          alert('Image file is too large. Please select an image smaller than 5MB.');
          return;
        }

        // Create images directory if it doesn't exist
        const imagesDir = 'snippets/characters/images';
        try {
          await window.electronAPI.readdir(imagesDir);
        } catch (error) {
          await window.electronAPI.createFolder(imagesDir);
        }

        // Save image file using the fs-writeFile API
        const imageExtension = file.name.split('.').pop();
        const imageFileName = `${character.id}.${imageExtension}`;
        const imagePath = `${imagesDir}/${imageFileName}`;
        
        // Convert file to Uint8Array for saving
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Convert to regular array for IPC (Uint8Array might not serialize properly)
        const imageData = Array.from(uint8Array);
        
        // Use the save-image API to save the image
        console.log('Attempting to save image:', imageFileName);
        console.log('Image extension:', imageExtension);
        console.log('Array buffer size:', arrayBuffer.byteLength);
        console.log('Uint8Array size:', uint8Array.length);
        console.log('Image data array size:', imageData.length);
        console.log('Character ID:', character.id);
        
        try {
          console.log('About to call saveImage API...');
          const result = await window.electronAPI.saveImage(character.id, imageData, imageFileName);
          console.log('Save image result:', result);
          
          // Verify the file was actually created
          const verifyPath = `${imagesDir}/${imageFileName}`;
          console.log('Verifying image was saved at:', verifyPath);
          const exists = await window.electronAPI.imageExists(verifyPath);
          console.log('Image exists after save:', exists);
        } catch (error) {
          console.error('Error calling saveImage API:', error);
          throw error;
        }
        
        // Update character data
        character.imagePath = imagePath;
        
        // Update the character in the characters array
        const characterIndex = this.characters.findIndex(c => c.id === character.id);
        if (characterIndex !== -1) {
          this.characters[characterIndex] = character;
        }
        
        // Save updated character
        await window.electronAPI.writeFile(character.filePath, JSON.stringify(character, null, 2));

        // Small delay to ensure file is written
        await new Promise(resolve => setTimeout(resolve, 100));

        // Update UI
        this.updateCharacterLibrary();
        
        // If this is the current character being edited, update the editor
        if (this.currentCharacter && this.currentCharacter.id === character.id) {
          this.populateEditor(character);
        }
        
        console.log('Character image added successfully');
      } catch (error) {
        console.error('Error adding character image:', error);
        alert('Error adding image. Please try again.');
      }
    };

    input.click();
  }

  /**
   * Copy character prompt to clipboard
   */
  async copyToClipboard() {
    const { showToast } = await import('./index.js');
    try {
      if (!this.currentCharacter) {
        console.warn('No current character to copy');
        showToast('No character selected to copy', 'error');
        return;
      }

      const characterData = this.getCharacterFromForm();
      const prompt = this.generateCharacterPrompt(characterData);
      
      if (prompt.trim()) {
        await navigator.clipboard.writeText(prompt);
        showToast('Character prompt copied to clipboard!', 'success');
        console.log('Character prompt copied to clipboard:', prompt);
      } else {
        showToast('No character data to copy', 'error');
      }
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      showToast('Failed to copy to clipboard', 'error');
    }
  }

  /**
   * Export character to markdown format
   */
  async exportToMarkdown() {
    const { showToast } = await import('./index.js');
    try {
      if (!this.currentCharacter) {
        console.warn('No current character to export');
        showToast('No character selected to export', 'error');
        return;
      }

      const characterData = this.getCharacterFromForm();
      const prompt = this.generateCharacterPrompt(characterData);
      
      if (!prompt.trim()) {
        showToast('No character data to export', 'error');
        return;
      }

      // Create markdown content
      const markdown = this.generateMarkdown(characterData, prompt);
      
      // Create and download file
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${characterData.name || 'character'}_export.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('Character exported to markdown!', 'success');
      console.log('Character exported to markdown:', markdown);
    } catch (error) {
      console.error('Error exporting to markdown:', error);
      showToast('Failed to export to markdown', 'error');
    }
  }

  /**
   * Generate markdown content for character export
   */
  generateMarkdown(characterData, prompt) {
    const name = characterData.name || 'Unnamed Character';
    const timestamp = new Date().toISOString().split('T')[0];
    
    let markdown = `# ${name}\n\n`;
    markdown += `*Generated on ${timestamp}*\n\n`;
    
    markdown += `## Character Prompt\n\n`;
    markdown += `\`\`\`\n${prompt}\n\`\`\`\n\n`;
    
    markdown += `## Character Details\n\n`;
    
    if (characterData.gender) markdown += `- **Gender:** ${characterData.gender}\n`;
    if (characterData.age) markdown += `- **Age:** ${characterData.age}\n`;
    if (characterData.hair) markdown += `- **Hair:** ${characterData.hair}\n`;
    if (characterData.eyes) markdown += `- **Eyes:** ${characterData.eyes}\n`;
    if (characterData.clothing) markdown += `- **Clothing:** ${characterData.clothing}\n`;
    if (characterData.style) markdown += `- **Style:** ${characterData.style}\n`;
    if (characterData.personality) markdown += `- **Personality:** ${characterData.personality}\n`;
    if (characterData.genitals) markdown += `- **Genitals:** ${characterData.genitals}\n`;
    if (characterData.tags) markdown += `- **Tags:** ${characterData.tags}\n`;
    
    markdown += `\n---\n\n`;
    markdown += `*Exported from PromptWaffel Character Builder*\n`;
    
    return markdown;
  }
}

// Create global instance
const characterBuilder = new CharacterBuilder();

// Export for use in other modules
export { characterBuilder, CharacterBuilder };
