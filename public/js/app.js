const MAX_INSTANCES = 5;

class App {
  constructor() {
    this.instances = new Map();
    this.activeInstanceId = null;        // Focused instance (receives keyboard input)
    this.layoutMode = 'single';          // 'single', 'split', 'quad'
    this.projects = [];

    // Tab system - slots contain tabs
    this.slots = [];                     // Array of slot objects
    this.activeSlotIndex = 0;            // Which slot has focus
    this.markdownPanels = new Map();     // Store markdown panels (like instances)
    this.dragState = { tabId: null, sourceSlotIndex: null };  // Drag state
    // DOM elements
    this.instancesList = document.getElementById('instances-list');
    this.projectsList = document.getElementById('projects-list');
    this.projectFilter = document.getElementById('project-filter');
    this.sessionValue = document.getElementById('session-value');
    this.sessionBar = document.getElementById('session-bar');
    this.sessionReset = document.getElementById('session-reset');
    this.weeklyValue = document.getElementById('weekly-value');
    this.weeklyBar = document.getElementById('weekly-bar');
    this.weeklyReset = document.getElementById('weekly-reset');
    this.terminalContainer = document.getElementById('terminal-container');
    this.emptyState = document.getElementById('empty-state');
    this.newInstanceBtn = document.getElementById('new-instance-btn');
    this.refreshProjectsBtn = document.getElementById('refresh-projects-btn');
    this.modalOverlay = document.getElementById('modal-overlay');
    this.modalClose = document.getElementById('modal-close');
    this.modalCancel = document.getElementById('modal-cancel');
    this.modalCreate = document.getElementById('modal-create');
    this.cwdInput = document.getElementById('cwd-input');
    this.errorMessage = document.getElementById('error-message');

    // Server control elements
    this.restartServerBtn = document.getElementById('restart-server-btn');
    this.shutdownServerBtn = document.getElementById('shutdown-server-btn');

    // Cookie modal elements
    this.settingsBtn = document.getElementById('settings-btn');
    this.usageContent = document.getElementById('usage-content');
    this.usageNoCookie = document.getElementById('usage-no-cookie');
    this.cookieModalOverlay = document.getElementById('cookie-modal-overlay');
    this.cookieModalClose = document.getElementById('cookie-modal-close');
    this.cookieModalCancel = document.getElementById('cookie-modal-cancel');
    this.cookieModalSave = document.getElementById('cookie-modal-save');
    this.cookieInput = document.getElementById('cookie-input');
    this.cookieErrorMessage = document.getElementById('cookie-error-message');
    this.cookieStatus = document.getElementById('cookie-status');

    // Layout control buttons
    this.layoutSingleBtn = document.getElementById('layout-single');
    this.layoutSplitBtn = document.getElementById('layout-split');
    this.layoutQuadBtn = document.getElementById('layout-quad');

    // Voice controls
    this.voiceControlsContainer = document.getElementById('voice-controls');
    this.voiceRecorder = null;

    this._bindEvents();
    this._initVoiceControls();
    this._bindImagePaste();
    this._bindImageDragDrop();
    this._initializeSlots();
    this._loadInstances();
    this._loadProjects();
    this._loadUsageStats();

    // Refresh usage stats every 30 seconds
    setInterval(() => this._loadUsageStats(), 30000);
  }

  _bindEvents() {
    this.newInstanceBtn.addEventListener('click', () => this._showModal());
    this.refreshProjectsBtn.addEventListener('click', () => this._loadProjects());
    this.projectFilter.addEventListener('input', () => this._renderProjectsList());
    this.modalClose.addEventListener('click', () => this._hideModal());
    this.modalCancel.addEventListener('click', () => this._hideModal());
    this.modalCreate.addEventListener('click', () => this._createInstanceFromInput());

    this.modalOverlay.addEventListener('click', (e) => {
      if (e.target === this.modalOverlay) {
        this._hideModal();
      }
    });

    this.cwdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this._createInstanceFromInput();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!this.modalOverlay.classList.contains('hidden')) {
          this._hideModal();
        }
        if (!this.cookieModalOverlay.classList.contains('hidden')) {
          this._hideCookieModal();
        }
      }
    });

    // Cookie modal events
    this.settingsBtn.addEventListener('click', () => this._showCookieModal());
    this.usageNoCookie.addEventListener('click', () => this._showCookieModal());
    this.cookieModalClose.addEventListener('click', () => this._hideCookieModal());
    this.cookieModalCancel.addEventListener('click', () => this._hideCookieModal());
    this.cookieModalSave.addEventListener('click', () => this._saveCookie());
    this.cookieModalOverlay.addEventListener('click', (e) => {
      if (e.target === this.cookieModalOverlay) {
        this._hideCookieModal();
      }
    });

    // Server control events
    this.restartServerBtn.addEventListener('click', () => this._restartServer());
    this.shutdownServerBtn.addEventListener('click', () => this._shutdownServer());

    // Layout control events
    this.layoutSingleBtn.addEventListener('click', () => this._setLayoutMode('single'));
    this.layoutSplitBtn.addEventListener('click', () => this._setLayoutMode('split'));
    this.layoutQuadBtn.addEventListener('click', () => this._setLayoutMode('quad'));

    // Handle window resize - fit all visible terminals
    window.addEventListener('resize', () => {
      this._fitVisibleTerminals();
    });
  }

  _bindImagePaste() {
    // Paste handling is now done per-terminal via onPaste callback
    // See _connectToInstance for the implementation
  }

  _bindImageDragDrop() {
    // Prevent default drag behaviors on the whole document, but only for external drags (not tab drags)
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      document.addEventListener(eventName, (e) => {
        // Don't prevent default if dragging a tab
        if (this.dragState.tabId) return;
        e.preventDefault();
      });
    });
  }

  _initVoiceControls() {
    // Check if VoiceRecorder class is available
    if (typeof VoiceRecorder === 'undefined') {
      console.warn('VoiceRecorder class not loaded');
      this.voiceControlsContainer.innerHTML = '';
      return;
    }

    // Initialize voice recorder
    this.voiceRecorder = new VoiceRecorder({
      lang: localStorage.getItem('voiceLang') || 'french',
    });

    if (!this.voiceRecorder.isSupported) {
      this.voiceControlsContainer.innerHTML = `
        <div class="voice-not-supported">
          <i class="fa-solid fa-microphone-slash"></i>
          <span>Micro non supporte</span>
        </div>
      `;
      return;
    }

    // Create voice control UI
    const languages = VoiceRecorder.getAvailableLanguages();
    const currentLang = this.voiceRecorder.lang;

    this.voiceControlsContainer.innerHTML = `
      <button id="voice-btn" class="btn-voice" title="Commande vocale (cliquez pour enregistrer, recliquez pour envoyer)">
        <i class="fa-solid fa-microphone"></i>
        <span class="voice-text">Parler</span>
      </button>
      <select id="voice-lang" class="voice-lang-select" title="Langue de reconnaissance">
        ${languages.map(l => `<option value="${l.code}" ${l.code === currentLang ? 'selected' : ''}>${l.label}</option>`).join('')}
      </select>
    `;

    // Get elements
    this.voiceBtn = document.getElementById('voice-btn');
    this.voiceLangSelect = document.getElementById('voice-lang');

    // Bind voice button click
    this.voiceBtn.addEventListener('click', () => this._toggleVoiceRecording());

    // Bind language change
    this.voiceLangSelect.addEventListener('change', (e) => {
      const newLang = e.target.value;
      this.voiceRecorder.setLanguage(newLang);
      localStorage.setItem('voiceLang', newLang);
    });

    // Voice recorder events
    this.voiceRecorder.onStart(() => {
      this.voiceBtn.classList.add('recording');
      this.voiceBtn.querySelector('i').className = 'fa-solid fa-stop';
      this.voiceBtn.querySelector('.voice-text').textContent = 'Stop';
    });

    this.voiceRecorder.onStop(() => {
      this.voiceBtn.querySelector('i').className = 'fa-solid fa-spinner fa-spin';
      this.voiceBtn.querySelector('.voice-text').textContent = 'Transcription...';
    });

    this.voiceRecorder.onTranscribing(() => {
      this.voiceBtn.classList.remove('recording');
      this.voiceBtn.classList.add('transcribing');
      this.voiceBtn.querySelector('i').className = 'fa-solid fa-spinner fa-spin';
      this.voiceBtn.querySelector('.voice-text').textContent = 'Transcription...';
    });

    this.voiceRecorder.onResult(({ transcript }) => {
      this.voiceBtn.classList.remove('transcribing');
      this.voiceBtn.querySelector('i').className = 'fa-solid fa-microphone';
      this.voiceBtn.querySelector('.voice-text').textContent = 'Parler';
      this._sendVoiceInput(transcript);
    });

    this.voiceRecorder.onError((error) => {
      this.voiceBtn.classList.remove('recording', 'transcribing');
      this.voiceBtn.querySelector('i').className = 'fa-solid fa-microphone';
      this.voiceBtn.querySelector('.voice-text').textContent = 'Parler';

      if (error === 'not-allowed') {
        this._showToast('Microphone non autorise', 'error');
      } else if (error === 'no-microphone') {
        this._showToast('Aucun microphone detecte', 'error');
      } else if (error === 'no-speech') {
        this._showToast('Aucune parole detectee', 'error');
      } else if (error === 'recording-too-short') {
        this._showToast('Enregistrement trop court', 'error');
      } else if (error !== 'aborted') {
        console.error('Voice recorder error:', error);
        this._showToast('Erreur: ' + error, 'error');
      }
    });
  }

  _toggleVoiceRecording() {
    if (!this.voiceRecorder) return;

    if (this.voiceRecorder.isRecording) {
      this.voiceRecorder.stop();
    } else {
      // Check if we have an active instance
      if (!this.activeInstanceId) {
        this._showToast('Aucun terminal actif', 'error');
        return;
      }
      this.voiceRecorder.start();
    }
  }

  _sendVoiceInput(transcript) {
    const activeInstance = this.instances.get(this.activeInstanceId);
    if (!activeInstance || !activeInstance.ws) {
      this._showToast('Aucun terminal actif', 'error');
      return;
    }

    // Send the transcript to the terminal
    activeInstance.ws.sendInput(transcript);

    // Show feedback
    const shortText = transcript.length > 50 ? transcript.substring(0, 50) + '...' : transcript;
    this._showToast(`Envoyé: "${shortText}"`, 'success');

    // Clear waiting state
    activeInstance.waiting = false;
    activeInstance.outputBuffer = '';
    this._renderInstancesList();
  }

  _hasDraggedImage(e) {
    const types = e.dataTransfer?.types;
    const items = e.dataTransfer?.items;

    if (types?.includes('Files') && items) {
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          return true;
        }
      }
    }
    return false;
  }

  async _uploadAndSendImage(file) {
    const activeInstance = this.instances.get(this.activeInstanceId);
    if (!activeInstance) return;

    // Show uploading indicator
    this._showToast('Upload de l\'image...', 'success');

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erreur d\'upload');
      }

      const { path } = await response.json();

      // Send the image path to the terminal
      activeInstance.ws.sendInput(path);
      this._showToast('Image envoyée', 'success');

    } catch (error) {
      console.error('Failed to upload image:', error);
      this._showToast('Erreur: ' + error.message, 'error');
    }
  }

  async _loadInstances() {
    try {
      const response = await fetch('/api/instances');
      const data = await response.json();

      for (const instance of data.instances) {
        await this._connectToInstance(instance);
      }

      this._renderInstancesList();
    } catch (error) {
      console.error('Failed to load instances:', error);
    }
  }

  async _loadProjects() {
    this.projectsList.innerHTML = '<li class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Scan...</li>';

    try {
      const response = await fetch('/api/projects');
      const data = await response.json();
      this.projects = data.projects || [];
      this._renderProjectsList();
    } catch (error) {
      console.error('Failed to load projects:', error);
      this.projectsList.innerHTML = '<li class="loading">Erreur de chargement</li>';
    }
  }

  async _connectToInstance(instanceData) {
    // Create terminal wrapper (will be added to slot later)
    const wrapper = document.createElement('div');
    wrapper.className = 'terminal-wrapper';
    wrapper.id = `terminal-${instanceData.id}`;

    const terminal = new TerminalWrapper(wrapper);
    const ws = new WebSocketManager(instanceData.id);

    const instance = {
      ...instanceData,
      terminal,
      ws,
      wrapper,
      waiting: false,
      lastOutputTime: Date.now(),
      outputBuffer: '',
      waitingDebounceTimer: null,
    };

    try {
      await ws.connect();

      ws.on('output', (msg) => {
        terminal.write(msg.data);
        instance.lastOutputTime = Date.now();

        // Detect if Claude is waiting for input
        this._detectWaitingState(instance, msg.data);
      });

      ws.on('exit', (msg) => {
        instance.status = 'exited';
        this._renderInstancesList();
        this._showToast(`Instance terminée (code: ${msg.code})`, 'error');
      });

      terminal.onData((data) => {
        ws.sendInput(data);
        // User typed something, no longer waiting
        instance.waiting = false;
        instance.outputBuffer = ''; // Reset buffer on user input
        this._renderInstancesList();
      });

      terminal.onResize(({ cols, rows }) => {
        ws.sendResize(cols, rows);
      });

      // Handle paste events (text and images)
      terminal.onPaste(async (event) => {
        if (event.type === 'image') {
          await this._uploadAndSendImage(event.file);
        } else if (event.type === 'text') {
          ws.sendInput(event.text);
        }
      });

      this.instances.set(instanceData.id, instance);

      // Add to slot and select this instance
      const addToVisible = this.layoutMode !== 'single' && this.slots[this.activeSlotIndex]?.tabs.length > 0;
      this._selectInstance(instanceData.id, addToVisible);

    } catch (error) {
      console.error('Failed to connect to instance:', error);
      wrapper.remove();
      this._showToast('Erreur de connexion', 'error');
    }
  }

  _detectWaitingState(instance, output) {
    // Accumulate output in buffer (keep last 2000 chars)
    instance.outputBuffer += output;
    if (instance.outputBuffer.length > 2000) {
      instance.outputBuffer = instance.outputBuffer.slice(-2000);
    }

    // Strip ANSI escape codes for pattern matching
    const cleanBuffer = instance.outputBuffer.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

    // Get last few lines for analysis
    const lines = cleanBuffer.split('\n').filter(l => l.trim());
    const lastLines = lines.slice(-5).join('\n');

    // Patterns that indicate Claude is waiting for user input
    const waitingPatterns = [
      /\?\s*$/m,                   // Line ends with ?
      /\(y\/n\)/i,                 // Yes/no prompt
      /\[Y\/n\]/i,                 // Yes/no prompt
      /\[n\/Y\]/i,                 // Yes/no prompt (inverted)
      /press enter/i,             // Press enter prompt
      /waiting for/i,             // Waiting message
      />\s*$/m,                    // Prompt ending with >
      /\(yes\/no\)/i,             // Yes/no full words
      /\? \[.*\]:/,               // Question with options
      /\? ›/,                     // Inquirer-style prompt
      /❯/,                        // Selection arrow
      /\[ \]/,                    // Checkbox unchecked
      /\[x\]/i,                   // Checkbox checked
      /\(Use arrow/i,             // Arrow key instruction
      /Select.*:/i,               // Selection prompt
      /Choose.*:/i,               // Choice prompt
      /Enter.*:/i,                // Enter prompt
      /Type.*:/i,                 // Type prompt
    ];

    // Patterns that indicate Claude is working (not waiting)
    const workingPatterns = [
      /⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/,    // Spinner characters
      /\.\.\./,                   // Loading dots
      /loading/i,
      /processing/i,
      /thinking/i,
      /reading/i,
      /writing/i,
      /searching/i,
    ];

    const isWorking = workingPatterns.some(pattern => pattern.test(lastLines));
    const hasWaitingPattern = waitingPatterns.some(pattern => pattern.test(lastLines));

    const isWaiting = hasWaitingPattern && !isWorking;

    if (isWaiting !== instance.waiting) {
      // Clear any pending debounce timer
      if (instance.waitingDebounceTimer) {
        clearTimeout(instance.waitingDebounceTimer);
        instance.waitingDebounceTimer = null;
      }

      // Debounce the waiting state change to avoid flickering
      instance.waitingDebounceTimer = setTimeout(() => {
        instance.waitingDebounceTimer = null;
        if (isWaiting !== instance.waiting) {
          instance.waiting = isWaiting;
          this._renderInstancesList();
          this._updateTabStatus(instance.id);
        }
      }, 150); // 150ms debounce
    }
  }

  async _loadUsageStats() {
    try {
      const response = await fetch('/api/usage');
      const data = await response.json();

      if (data.needsCookie) {
        // Show "cookie required" state
        this.usageContent.style.display = 'none';
        this.usageNoCookie.classList.remove('hidden');
        return;
      }

      if (data.error) {
        this.sessionValue.textContent = 'N/A';
        this.weeklyValue.textContent = 'N/A';
        this.sessionReset.textContent = data.error;
        this.usageContent.style.display = 'block';
        this.usageNoCookie.classList.add('hidden');
        return;
      }

      // Show usage content
      this.usageContent.style.display = 'block';
      this.usageNoCookie.classList.add('hidden');

      // Update session (5-hour) usage
      if (data.fiveHour) {
        const pct = Math.round(data.fiveHour.percentage);
        this.sessionValue.textContent = `${pct}%`;
        this.sessionBar.style.width = `${Math.min(pct, 100)}%`;
        this._setBarColor(this.sessionBar, pct);

        if (data.fiveHour.minutesUntilReset) {
          this.sessionReset.textContent = `Reset dans ${this._formatTime(data.fiveHour.minutesUntilReset)}`;
        }
      }

      // Update weekly (7-day) usage
      if (data.sevenDay) {
        const pct = Math.round(data.sevenDay.percentage);
        this.weeklyValue.textContent = `${pct}%`;
        this.weeklyBar.style.width = `${Math.min(pct, 100)}%`;
        this._setBarColor(this.weeklyBar, pct);

        if (data.sevenDay.minutesUntilReset) {
          this.weeklyReset.textContent = `Reset dans ${this._formatTime(data.sevenDay.minutesUntilReset)}`;
        }
      }
    } catch (error) {
      console.error('Failed to load usage stats:', error);
    }
  }

  _setBarColor(bar, percentage) {
    bar.classList.remove('warning', 'danger');
    if (percentage >= 90) {
      bar.classList.add('danger');
    } else if (percentage >= 70) {
      bar.classList.add('warning');
    }
  }

  _formatTime(minutes) {
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}h${mins > 0 ? ` ${mins}m` : ''}`;
    }
    return `${minutes}m`;
  }

  _selectInstance(id, addToVisible = false) {
    const instance = this.instances.get(id);
    if (!instance) return;

    // Check if already in a slot
    const existingSlotIndex = this._getSlotIndexForTab(id);

    if (existingSlotIndex !== -1) {
      // Already in a slot - just activate and focus
      this._activateTab(existingSlotIndex, id);
      this._focusSlot(existingSlotIndex);
      return;
    }

    // Not in any slot - add to a slot
    let targetSlotIndex;

    if (addToVisible && this.layoutMode !== 'single') {
      // Find first empty slot or add to current
      targetSlotIndex = this._findEmptySlot();
      if (targetSlotIndex === -1) {
        targetSlotIndex = this.activeSlotIndex;
      }
    } else {
      // Add to active slot
      targetSlotIndex = this.activeSlotIndex;
    }

    // Add to slot as a tab
    this._addTabToSlot(targetSlotIndex, id, true);
    this._focusSlot(targetSlotIndex);
  }

  _setLayoutMode(mode) {
    this.layoutMode = mode;

    // Update button states
    this.layoutSingleBtn.classList.toggle('active', mode === 'single');
    this.layoutSplitBtn.classList.toggle('active', mode === 'split');
    this.layoutQuadBtn.classList.toggle('active', mode === 'quad');

    // Update container class
    this.terminalContainer.classList.remove('layout-single', 'layout-split', 'layout-quad');
    this.terminalContainer.classList.add(`layout-${mode}`);

    // Update slot visibility
    this._updateSlotVisibility();

    // Fit all visible terminals
    setTimeout(() => this._fitAllVisibleTerminals(), 50);

    this._renderInstancesList();
  }

  _updateEmptyState() {
    const hasContent = this.slots.some(slot => slot.tabs.length > 0);
    this.emptyState.style.display = hasContent ? 'none' : 'block';
  }

  _fitAllVisibleTerminals() {
    this.slots.forEach(slot => {
      if (!slot.activeTabId) return;
      if (slot.activeTabId.startsWith('md-')) return;

      const instance = this.instances.get(slot.activeTabId);
      if (instance && instance.terminal) {
        instance.terminal.fit();
        instance.terminal.scrollToBottom();
        instance.ws.sendResize(instance.terminal.cols, instance.terminal.rows);
      }
    });
  }

  // =============================================
  // SLOT SYSTEM METHODS
  // =============================================

  _initializeSlots() {
    // Create initial slots based on layout (start with 1 slot)
    this._createSlot(0);
    this.slots[0].element.classList.add('visible', 'focused');
  }

  _createSlot(index) {
    const slotElement = document.createElement('div');
    slotElement.className = 'slot';
    slotElement.dataset.slotIndex = index;

    slotElement.innerHTML = `
      <div class="slot-tab-bar"></div>
      <div class="slot-content"></div>
    `;

    // Insert before empty-state
    this.terminalContainer.insertBefore(slotElement, this.emptyState);

    const slot = {
      id: `slot-${index}`,
      tabs: [],
      activeTabId: null,
      element: slotElement,
      tabBar: slotElement.querySelector('.slot-tab-bar'),
      content: slotElement.querySelector('.slot-content')
    };

    this.slots[index] = slot;

    // Bind events
    this._bindSlotEvents(slot, index);

    return slot;
  }

  _bindSlotEvents(slot, slotIndex) {
    // Click on slot content to focus
    slot.content.addEventListener('click', () => {
      this._focusSlot(slotIndex);
    });

    // Tab bar drag & drop events
    slot.tabBar.addEventListener('dragover', (e) => this._handleTabBarDragOver(e, slot));
    slot.tabBar.addEventListener('dragleave', (e) => this._handleTabBarDragLeave(e, slot));
    slot.tabBar.addEventListener('drop', (e) => this._handleTabBarDrop(e, slot));

    // Content area drag & drop (for empty slots and images)
    slot.content.addEventListener('dragover', (e) => this._handleContentDragOver(e, slot));
    slot.content.addEventListener('dragleave', (e) => this._handleContentDragLeave(e, slot));
    slot.content.addEventListener('drop', (e) => this._handleContentDrop(e, slot));
  }

  _updateSlotVisibility() {
    const maxSlots = this.layoutMode === 'single' ? 1 : this.layoutMode === 'split' ? 2 : 4;

    // Create slots if needed
    while (this.slots.length < maxSlots) {
      this._createSlot(this.slots.length);
    }

    // Update visibility
    this.slots.forEach((slot, index) => {
      if (index < maxSlots) {
        slot.element.classList.add('visible');
      } else {
        slot.element.classList.remove('visible');
      }
    });

    // Ensure activeSlotIndex is valid
    if (this.activeSlotIndex >= maxSlots) {
      this.activeSlotIndex = maxSlots - 1;
      this._focusSlot(this.activeSlotIndex);
    }

    this._updateEmptyState();
  }

  _focusSlot(slotIndex) {
    if (slotIndex < 0 || slotIndex >= this.slots.length) return;

    this.activeSlotIndex = slotIndex;

    // Update visual focus
    this.slots.forEach((slot, i) => {
      slot.element.classList.toggle('focused', i === slotIndex);
    });

    // Focus the active tab's terminal if it's a terminal
    const slot = this.slots[slotIndex];
    if (slot && slot.activeTabId && !slot.activeTabId.startsWith('md-')) {
      const instance = this.instances.get(slot.activeTabId);
      if (instance) {
        this.activeInstanceId = slot.activeTabId;
        instance.terminal.focus();

        // Update document title
        const folderName = instance.cwd.split(/[/\\]/).pop() || instance.cwd;
        document.title = `${folderName} - Claude Code UI`;
      }
    }

    this._renderInstancesList();
  }

  _findEmptySlot() {
    const maxSlots = this.layoutMode === 'single' ? 1 : this.layoutMode === 'split' ? 2 : 4;

    for (let i = 0; i < Math.min(this.slots.length, maxSlots); i++) {
      if (this.slots[i].tabs.length === 0) {
        return i;
      }
    }
    return -1;
  }

  _getSlotIndexForTab(tabId) {
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i].tabs.includes(tabId)) {
        return i;
      }
    }
    return -1;
  }

  // =============================================
  // TAB MANAGEMENT METHODS
  // =============================================

  _addTabToSlot(slotIndex, tabId, activate = true) {
    // Ensure slot exists
    while (this.slots.length <= slotIndex) {
      this._createSlot(this.slots.length);
    }

    const slot = this.slots[slotIndex];

    // Check if tab already exists in this slot
    if (slot.tabs.includes(tabId)) {
      if (activate) {
        this._activateTab(slotIndex, tabId);
      }
      return;
    }

    // Remove from any other slot first
    this._removeTabFromAllSlots(tabId);

    // Add to this slot
    slot.tabs.push(tabId);

    // Create tab element
    this._createTabElement(slot, tabId);

    // Move the content wrapper to this slot
    this._moveContentToSlot(slotIndex, tabId);

    if (activate || slot.tabs.length === 1) {
      this._activateTab(slotIndex, tabId);
    }

    this._updateEmptyState();
    this._updateSlotVisibility();
  }

  _createTabElement(slot, tabId) {
    const isMarkdown = tabId.startsWith('md-');
    let name, status = '', title = '';

    if (isMarkdown) {
      const panel = this.markdownPanels.get(tabId);
      name = panel ? panel.projectName : 'Markdown';
      title = panel ? panel.projectPath : '';
    } else {
      const instance = this.instances.get(tabId);
      if (!instance) return;
      name = instance.cwd.split(/[/\\]/).pop() || instance.cwd;
      title = instance.cwd;

      if (instance.status === 'exited') {
        status = 'exited';
      } else if (instance.waiting) {
        status = 'waiting';
      }
    }

    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.dataset.tabId = tabId;
    tab.draggable = true;
    tab.innerHTML = `
      ${!isMarkdown ? `<span class="status-indicator ${status}"></span>` : ''}
      <span class="tab-icon">
        <i class="fa-${isMarkdown ? 'brands fa-markdown' : 'solid fa-terminal'}"></i>
      </span>
      <span class="tab-name" title="${title}">${name}</span>
      <button class="tab-close" title="Fermer">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;

    // Tab click to activate
    tab.addEventListener('click', (e) => {
      if (!e.target.closest('.tab-close')) {
        const slotIdx = this._getSlotIndexForTab(tabId);
        if (slotIdx !== -1) {
          this._activateTab(slotIdx, tabId);
          this._focusSlot(slotIdx);
        }
      }
    });

    // Close button
    tab.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this._closeTab(tabId);
    });

    // Drag events
    tab.addEventListener('dragstart', (e) => this._handleTabDragStart(e, tabId));
    tab.addEventListener('dragend', (e) => this._handleTabDragEnd(e, tabId));
    tab.addEventListener('dragover', (e) => this._handleTabDragOver(e, tab));
    tab.addEventListener('dragleave', (e) => this._handleTabDragLeave(e, tab));
    tab.addEventListener('drop', (e) => this._handleTabDrop(e, tab, slot));

    slot.tabBar.appendChild(tab);
  }

  _activateTab(slotIndex, tabId) {
    const slot = this.slots[slotIndex];
    if (!slot) return;

    // Deactivate all tabs in this slot
    slot.tabBar.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    slot.content.querySelectorAll('.terminal-wrapper, .markdown-panel').forEach(w => {
      w.classList.remove('visible');
    });

    // Activate the selected tab
    const tabEl = slot.tabBar.querySelector(`[data-tab-id="${tabId}"]`);
    if (tabEl) tabEl.classList.add('active');

    slot.activeTabId = tabId;

    // Show the content
    const isMarkdown = tabId.startsWith('md-');
    if (isMarkdown) {
      const panel = this.markdownPanels.get(tabId);
      if (panel && panel.wrapper) {
        panel.wrapper.classList.add('visible');
      }
    } else {
      const instance = this.instances.get(tabId);
      if (instance && instance.wrapper) {
        instance.wrapper.classList.add('visible');
        // Fit terminal after becoming visible and scroll to bottom
        setTimeout(() => {
          instance.terminal.fit();
          instance.terminal.scrollToBottom();
          instance.ws.sendResize(instance.terminal.cols, instance.terminal.rows);
        }, 50);
      }
    }
  }

  _removeTabFromAllSlots(tabId) {
    this.slots.forEach((slot, index) => {
      const tabIndex = slot.tabs.indexOf(tabId);
      if (tabIndex > -1) {
        slot.tabs.splice(tabIndex, 1);

        // Remove tab element
        const tabEl = slot.tabBar.querySelector(`[data-tab-id="${tabId}"]`);
        if (tabEl) tabEl.remove();

        // If this was the active tab, activate another
        if (slot.activeTabId === tabId) {
          slot.activeTabId = null;
          if (slot.tabs.length > 0) {
            this._activateTab(index, slot.tabs[0]);
          }
        }
      }
    });
  }

  _moveContentToSlot(slotIndex, tabId) {
    const slot = this.slots[slotIndex];
    if (!slot) return;

    const isMarkdown = tabId.startsWith('md-');
    let wrapper;

    if (isMarkdown) {
      const panel = this.markdownPanels.get(tabId);
      wrapper = panel?.wrapper;
    } else {
      const instance = this.instances.get(tabId);
      wrapper = instance?.wrapper;
    }

    if (wrapper && wrapper.parentElement !== slot.content) {
      slot.content.appendChild(wrapper);
    }
  }

  _closeTab(tabId) {
    const isMarkdown = tabId.startsWith('md-');

    if (isMarkdown) {
      this._closeMarkdownTab(tabId);
    } else {
      // Use existing close instance logic
      this._closeInstance(tabId);
    }
  }

  _closeMarkdownTab(tabId) {
    const panel = this.markdownPanels.get(tabId);
    if (!panel) return;

    // Remove from slots
    this._removeTabFromAllSlots(tabId);

    // Clean up
    panel.wrapper.remove();
    this.markdownPanels.delete(tabId);

    this._updateEmptyState();
  }

  _updateTabStatus(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    const slotIndex = this._getSlotIndexForTab(instanceId);
    if (slotIndex === -1) return;

    const slot = this.slots[slotIndex];
    const tabEl = slot.tabBar.querySelector(`[data-tab-id="${instanceId}"]`);
    if (!tabEl) return;

    const indicator = tabEl.querySelector('.status-indicator');
    if (!indicator) return;

    indicator.classList.remove('waiting', 'exited');
    if (instance.status === 'exited') {
      indicator.classList.add('exited');
    } else if (instance.waiting) {
      indicator.classList.add('waiting');
    }
  }

  _rebuildSlotTabBar(slot) {
    // Clear existing tabs
    slot.tabBar.innerHTML = '';

    // Recreate in order
    slot.tabs.forEach(tabId => {
      this._createTabElement(slot, tabId);
    });

    // Mark active tab
    if (slot.activeTabId) {
      const activeTab = slot.tabBar.querySelector(`[data-tab-id="${slot.activeTabId}"]`);
      if (activeTab) activeTab.classList.add('active');
    }
  }

  // =============================================
  // TAB DRAG & DROP HANDLERS
  // =============================================

  _handleTabDragStart(e, tabId) {
    this.dragState.tabId = tabId;
    this.dragState.sourceSlotIndex = this._getSlotIndexForTab(tabId);

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tabId);

    const tabEl = e.target.closest('.tab');
    if (tabEl) {
      tabEl.classList.add('dragging');
    }
  }

  _handleTabDragEnd(e, tabId) {
    // Clean up drag state
    this.dragState.tabId = null;
    this.dragState.sourceSlotIndex = null;

    // Remove all drag classes
    document.querySelectorAll('.tab.dragging').forEach(el => el.classList.remove('dragging'));
    document.querySelectorAll('.tab.drag-over-left, .tab.drag-over-right').forEach(el => {
      el.classList.remove('drag-over-left', 'drag-over-right');
    });
    document.querySelectorAll('.slot-tab-bar.drag-over').forEach(el => el.classList.remove('drag-over'));
    document.querySelectorAll('.slot-content.drag-over-empty').forEach(el => el.classList.remove('drag-over-empty'));
  }

  _handleTabDragOver(e, tabEl) {
    if (!this.dragState.tabId) return;

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    // Determine if dropping left or right of this tab
    const rect = tabEl.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;

    tabEl.classList.remove('drag-over-left', 'drag-over-right');
    if (e.clientX < midpoint) {
      tabEl.classList.add('drag-over-left');
    } else {
      tabEl.classList.add('drag-over-right');
    }
  }

  _handleTabDragLeave(e, tabEl) {
    tabEl.classList.remove('drag-over-left', 'drag-over-right');
  }

  _handleTabDrop(e, tabEl, slot) {
    e.preventDefault();
    e.stopPropagation();

    const draggedTabId = this.dragState.tabId;
    if (!draggedTabId) return;

    const targetTabId = tabEl.dataset.tabId;
    if (draggedTabId === targetTabId) {
      this._handleTabDragEnd(e, draggedTabId);
      return;
    }

    const slotIndex = parseInt(slot.element.dataset.slotIndex);

    // Determine insert position
    const rect = tabEl.getBoundingClientRect();
    const insertBefore = e.clientX < rect.left + rect.width / 2;

    // Remove from source
    this._removeTabFromAllSlots(draggedTabId);

    // Find target position
    const targetIndex = slot.tabs.indexOf(targetTabId);
    const insertIndex = insertBefore ? targetIndex : targetIndex + 1;

    // Insert at position
    slot.tabs.splice(insertIndex, 0, draggedTabId);

    // Move content
    this._moveContentToSlot(slotIndex, draggedTabId);

    // Recreate tab bar to reflect new order
    this._rebuildSlotTabBar(slot);

    // Activate the dropped tab
    this._activateTab(slotIndex, draggedTabId);
    this._focusSlot(slotIndex);

    this._handleTabDragEnd(e, draggedTabId);
  }

  _handleTabBarDragOver(e, slot) {
    if (!this.dragState.tabId) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    slot.tabBar.classList.add('drag-over');
  }

  _handleTabBarDragLeave(e, slot) {
    if (!slot.tabBar.contains(e.relatedTarget)) {
      slot.tabBar.classList.remove('drag-over');
    }
  }

  _handleTabBarDrop(e, slot) {
    e.preventDefault();
    e.stopPropagation();

    const draggedTabId = this.dragState.tabId;
    if (!draggedTabId) return;

    // If dropped on a specific tab, that's handled by _handleTabDrop
    if (e.target.closest('.tab')) return;

    const slotIndex = parseInt(slot.element.dataset.slotIndex);

    // Remove from source
    this._removeTabFromAllSlots(draggedTabId);

    // Add to end
    slot.tabs.push(draggedTabId);
    this._createTabElement(slot, draggedTabId);
    this._moveContentToSlot(slotIndex, draggedTabId);
    this._activateTab(slotIndex, draggedTabId);
    this._focusSlot(slotIndex);

    slot.tabBar.classList.remove('drag-over');
    this._handleTabDragEnd(e, draggedTabId);
  }

  _handleContentDragOver(e, slot) {
    // Handle tab drag to empty slot
    if (this.dragState.tabId && slot.tabs.length === 0) {
      e.preventDefault();
      e.stopPropagation();
      slot.content.classList.add('drag-over-empty');
      return;
    }

    // Handle image drag (existing functionality)
    if (this._hasDraggedImage(e)) {
      e.preventDefault();
      this.terminalContainer.classList.add('drag-over');
    }
  }

  _handleContentDragLeave(e, slot) {
    slot.content.classList.remove('drag-over-empty');
  }

  _handleContentDrop(e, slot) {
    // Handle tab drop
    if (this.dragState.tabId) {
      e.preventDefault();
      e.stopPropagation();

      const draggedTabId = this.dragState.tabId;
      const slotIndex = parseInt(slot.element.dataset.slotIndex);
      this._addTabToSlot(slotIndex, draggedTabId, true);

      slot.content.classList.remove('drag-over-empty');
      this._handleTabDragEnd(e, draggedTabId);
      return;
    }

    // Handle image drop (existing functionality)
    if (this._hasDraggedImage(e)) {
      e.preventDefault();
      this.terminalContainer.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      files.forEach(file => this._uploadAndSendImage(file));
    }
  }

  _renderInstancesList() {
    if (this.instances.size === 0) {
      this.instancesList.innerHTML = '<li class="empty-message">Aucune instance</li>';
      this.emptyState.style.display = 'block';
      document.title = 'Claude Code UI';
      this._updateFavicon(0, false);
      return;
    }

    // Get existing items by their data-id
    const existingItems = new Map();
    this.instancesList.querySelectorAll('.instance-item').forEach(li => {
      const id = li.dataset.id;
      if (id) existingItems.set(id, li);
    });

    // Remove empty message if present
    const emptyMsg = this.instancesList.querySelector('.empty-message');
    if (emptyMsg) emptyMsg.remove();

    this.instances.forEach((instance, id) => {
      const folderName = instance.cwd.split(/[/\\]/).pop() || instance.cwd;

      let statusClass = '';
      if (instance.status === 'exited') {
        statusClass = 'exited';
      } else if (instance.waiting) {
        statusClass = 'waiting';
      }

      let li = existingItems.get(id);

      if (li) {
        // Update existing item
        existingItems.delete(id); // Mark as processed

        // Update active and visible states
        li.classList.toggle('active', id === this.activeInstanceId);
        li.classList.toggle('visible', this._getSlotIndexForTab(id) !== -1);

        // Update status dot
        const statusDot = li.querySelector('.status-dot');
        if (statusDot) {
          statusDot.className = 'status-dot ' + statusClass;
        }
      } else {
        // Create new item
        li = document.createElement('li');
        li.className = 'instance-item';
        li.dataset.id = id;
        if (id === this.activeInstanceId) {
          li.classList.add('active');
        }
        if (this._getSlotIndexForTab(id) !== -1) {
          li.classList.add('visible');
        }

        li.innerHTML = `
          <span class="status-dot ${statusClass}"></span>
          <span class="instance-name" title="${instance.cwd}">${folderName}</span>
          <button class="md-btn" title="Voir les fichiers markdown">
            <i class="fa-brands fa-markdown"></i>
          </button>
          <button class="close-btn" title="Fermer">
            <i class="fa-solid fa-xmark"></i>
          </button>
        `;

        li.addEventListener('click', (e) => {
          if (!e.target.closest('.close-btn') && !e.target.closest('.md-btn')) {
            // Ctrl+click adds to split view, normal click replaces
            const addToVisible = e.ctrlKey && this.layoutMode !== 'single';
            this._selectInstance(id, addToVisible);
          }
        });

        li.querySelector('.md-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          this._showMarkdownPanel(instance.cwd, folderName);
        });

        li.querySelector('.close-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          this._closeInstance(id);
        });

        this.instancesList.appendChild(li);
      }
    });

    // Remove items that no longer exist
    existingItems.forEach(li => li.remove());

    // Update favicon with instance count and waiting status
    const hasWaiting = Array.from(this.instances.values()).some(i => i.waiting);
    this._updateFavicon(this.instances.size, hasWaiting);
  }

  _updateFavicon(count, hasWaiting) {
    // Create dynamic SVG favicon with badge
    const badgeColor = hasWaiting ? '#f9e2af' : '#a6e3a1'; // warning yellow or green
    const bgColor = '#1e1e2e';
    const accentColor = '#89b4fa';

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <rect width="100" height="100" rx="20" fill="${bgColor}"/>
        <text x="50" y="58" font-family="system-ui, sans-serif" font-size="45" font-weight="bold" fill="${accentColor}" text-anchor="middle">&gt;_</text>
        ${count > 0 ? `
          <circle cx="78" cy="22" r="20" fill="${badgeColor}"/>
          <text x="78" y="30" font-family="system-ui, sans-serif" font-size="24" font-weight="bold" fill="${bgColor}" text-anchor="middle">${count}</text>
        ` : ''}
      </svg>
    `;

    const dataUrl = `data:image/svg+xml;base64,${btoa(svg)}`;
    let favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.href = dataUrl;
  }

  _renderProjectsList() {
    if (this.projects.length === 0) {
      this.projectsList.innerHTML = '<li class="loading">Aucun projet trouvé</li>';
      return;
    }

    this.projectsList.innerHTML = '';

    // Filter projects by search term
    const filterText = this.projectFilter.value.toLowerCase().trim();
    let filteredProjects = this.projects;
    if (filterText) {
      filteredProjects = this.projects.filter(p =>
        p.name.toLowerCase().includes(filterText)
      );
    }

    if (filteredProjects.length === 0) {
      this.projectsList.innerHTML = '<li class="loading">Aucun résultat</li>';
      return;
    }

    // Sort projects alphabetically by name (case-insensitive)
    const sortedProjects = [...filteredProjects].sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );

    sortedProjects.forEach((project) => {
      const li = document.createElement('li');
      li.className = 'project-item';
      li.title = project.path;
      li.innerHTML = `
        <i class="fa-solid fa-folder"></i>
        <span>${project.name}</span>
        <button class="md-btn" title="Voir les fichiers markdown">
          <i class="fa-brands fa-markdown"></i>
        </button>
      `;

      // Click on project name creates instance
      li.addEventListener('click', (e) => {
        if (!e.target.closest('.md-btn')) {
          this._createInstance(project.path);
        }
      });

      // Click on markdown button opens markdown modal
      li.querySelector('.md-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this._showMarkdownPanel(project.path, project.name);
      });

      this.projectsList.appendChild(li);
    });
  }

  _showModal() {
    this.modalOverlay.classList.remove('hidden');
    this.cwdInput.value = '';
    this.errorMessage.classList.add('hidden');
    this.cwdInput.focus();
  }

  _hideModal() {
    this.modalOverlay.classList.add('hidden');
    this.errorMessage.classList.add('hidden');
  }

  async _createInstanceFromInput() {
    const cwd = this.cwdInput.value.trim();
    if (!cwd) {
      this._showError('Veuillez entrer un chemin');
      return;
    }
    await this._createInstance(cwd);
  }

  async _createInstance(cwd) {
    if (this.instances.size >= MAX_INSTANCES) {
      this._showToast(`Maximum ${MAX_INSTANCES} instances`, 'error');
      return;
    }

    this.modalCreate.disabled = true;

    try {
      const response = await fetch('/api/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur de création');
      }

      this._hideModal();
      await this._connectToInstance(data);
      this._renderInstancesList();
      this._selectInstance(data.id);
      this._showToast('Instance créée', 'success');

    } catch (error) {
      this._showError(error.message);
    } finally {
      this.modalCreate.disabled = false;
    }
  }

  async _closeInstance(id) {
    const instance = this.instances.get(id);
    if (!instance) return;

    try {
      await fetch(`/api/instances/${id}`, { method: 'DELETE' });

      // Remove from slots first
      this._removeTabFromAllSlots(id);

      // Clean up debounce timer
      if (instance.waitingDebounceTimer) {
        clearTimeout(instance.waitingDebounceTimer);
      }

      instance.ws.close();
      instance.terminal.dispose();
      instance.wrapper.remove();
      this.instances.delete(id);

      // Update active instance if needed
      if (this.activeInstanceId === id) {
        this.activeInstanceId = null;

        // Try to focus another tab in the same slot
        const slot = this.slots[this.activeSlotIndex];
        if (slot && slot.activeTabId && !slot.activeTabId.startsWith('md-')) {
          this.activeInstanceId = slot.activeTabId;
        }
      }

      this._updateEmptyState();
      this._renderInstancesList();
      this._showToast('Instance fermée', 'success');

    } catch (error) {
      console.error('Failed to close instance:', error);
      this._showToast('Erreur de fermeture', 'error');
    }
  }

  _showError(message) {
    this.errorMessage.textContent = message;
    this.errorMessage.classList.remove('hidden');
  }

  _showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  async _showCookieModal() {
    this.cookieModalOverlay.classList.remove('hidden');
    this.cookieInput.value = '';
    this.cookieErrorMessage.classList.add('hidden');

    // Load current cookie status
    try {
      const response = await fetch('/api/cookie/status');
      const data = await response.json();
      if (data.hasCookie) {
        this.cookieStatus.textContent = `Cookie actuel : ${data.cookieLength} caracteres`;
        this.cookieStatus.classList.add('success');
      } else {
        this.cookieStatus.textContent = 'Aucun cookie configure';
        this.cookieStatus.classList.remove('success');
      }
    } catch (error) {
      this.cookieStatus.textContent = '';
    }

    this.cookieInput.focus();
  }

  _hideCookieModal() {
    this.cookieModalOverlay.classList.add('hidden');
    this.cookieErrorMessage.classList.add('hidden');
  }

  async _saveCookie() {
    const cookie = this.cookieInput.value.trim();
    if (!cookie) {
      this.cookieErrorMessage.textContent = 'Veuillez entrer un cookie';
      this.cookieErrorMessage.classList.remove('hidden');
      return;
    }

    this.cookieModalSave.disabled = true;

    try {
      const response = await fetch('/api/cookie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur');
      }

      this._hideCookieModal();
      this._showToast('Cookie enregistre', 'success');

      // Reload usage stats
      await this._loadUsageStats();

    } catch (error) {
      this.cookieErrorMessage.textContent = error.message;
      this.cookieErrorMessage.classList.remove('hidden');
    } finally {
      this.cookieModalSave.disabled = false;
    }
  }

  async _showMarkdownPanel(projectPath, projectName) {
    // Generate tab ID
    const tabId = 'md-' + projectPath.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

    // If panel already exists, toggle it (close if open, or focus if exists elsewhere)
    if (this.markdownPanels.has(tabId)) {
      const existingSlotIndex = this._getSlotIndexForTab(tabId);
      if (existingSlotIndex !== -1) {
        // Close it (toggle behavior)
        this._closeMarkdownTab(tabId);
      } else {
        // Panel exists but not in slot - add to current slot
        this._addTabToSlot(this.activeSlotIndex, tabId, true);
      }
      return;
    }

    // Create markdown panel wrapper (without close button - handled by tab)
    const wrapper = document.createElement('div');
    wrapper.className = 'markdown-panel';
    wrapper.innerHTML = `
      <div class="markdown-panel-header">
        <div class="markdown-panel-title">
          <i class="fa-brands fa-markdown"></i>
          <span class="markdown-panel-name">${projectName}</span>
          <select class="markdown-file-select">
            <option value="">Chargement...</option>
          </select>
        </div>
      </div>
      <div class="markdown-panel-content">
        <p class="markdown-placeholder">Chargement...</p>
      </div>
    `;

    const fileSelect = wrapper.querySelector('.markdown-file-select');
    const content = wrapper.querySelector('.markdown-panel-content');

    const panel = {
      id: tabId,
      projectPath,
      projectName,
      wrapper,
      fileSelect,
      content
    };

    this.markdownPanels.set(tabId, panel);

    // Bind file select change
    fileSelect.addEventListener('change', () => {
      const file = fileSelect.value;
      if (file) {
        this._loadMarkdownPanelContent(tabId, file);
      }
    });

    // Add to current slot as new tab
    this._addTabToSlot(this.activeSlotIndex, tabId, true);

    // Load markdown files
    try {
      const response = await fetch(`/api/projects/markdown?path=${encodeURIComponent(projectPath)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur');
      }

      if (data.files.length === 0) {
        content.innerHTML = '<p class="markdown-placeholder">Aucun fichier markdown dans ce projet</p>';
        fileSelect.innerHTML = '<option value="">Aucun fichier</option>';
        return;
      }

      // Populate select
      fileSelect.innerHTML = '';
      data.files.forEach(file => {
        const option = document.createElement('option');
        option.value = file;
        option.textContent = file;
        fileSelect.appendChild(option);
      });

      // Auto-load first file (prefer CLAUDE.md or README.md)
      const preferredFiles = ['CLAUDE.md', 'README.md', 'readme.md'];
      const autoLoadFile = preferredFiles.find(f => data.files.includes(f)) || data.files[0];
      fileSelect.value = autoLoadFile;
      this._loadMarkdownPanelContent(tabId, autoLoadFile);

    } catch (error) {
      content.innerHTML = `<p class="markdown-placeholder">Erreur: ${error.message}</p>`;
    }
  }

  async _loadMarkdownPanelContent(tabId, filename) {
    const panel = this.markdownPanels.get(tabId);
    if (!panel) return;

    panel.content.innerHTML = '<p class="markdown-placeholder">Chargement...</p>';

    try {
      const response = await fetch(`/api/projects/markdown/content?path=${encodeURIComponent(panel.projectPath)}&file=${encodeURIComponent(filename)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur');
      }

      // Render markdown
      panel.content.innerHTML = marked.parse(data.content);

    } catch (error) {
      panel.content.innerHTML = `<p class="markdown-placeholder">Erreur: ${error.message}</p>`;
    }
  }

  async _restartServer() {
    if (!confirm('Redémarrer le serveur ? Toutes les instances seront fermées.')) {
      return;
    }

    this.restartServerBtn.disabled = true;
    this._showToast('Redémarrage du serveur...', 'success');

    try {
      await fetch('/api/server/restart', { method: 'POST' });
      // Server will restart, page will lose connection
      setTimeout(() => {
        this._showToast('Reconnexion...', 'success');
        this._attemptReconnect();
      }, 2000);
    } catch (error) {
      // Expected - server is restarting
      setTimeout(() => {
        this._attemptReconnect();
      }, 2000);
    }
  }

  async _shutdownServer() {
    if (!confirm('Arrêter le serveur ? Toutes les instances seront fermées.')) {
      return;
    }

    this.shutdownServerBtn.disabled = true;
    this._showToast('Arrêt du serveur...', 'success');

    try {
      await fetch('/api/server/shutdown', { method: 'POST' });
    } catch (error) {
      // Expected if server shuts down
    }
  }

  _attemptReconnect(attempts = 0) {
    const maxAttempts = 10;
    const delay = 1000;

    fetch('/api/instances')
      .then(() => {
        // Server is back, reload page
        window.location.reload();
      })
      .catch(() => {
        if (attempts < maxAttempts) {
          setTimeout(() => this._attemptReconnect(attempts + 1), delay);
        } else {
          this._showToast('Impossible de reconnecter', 'error');
          this.restartServerBtn.disabled = false;
        }
      });
  }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
