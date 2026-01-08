const MAX_INSTANCES = 5;

class App {
  constructor() {
    this.instances = new Map();
    this.activeInstanceId = null;        // Focused instance (receives keyboard input)
    this.visibleInstances = new Set();   // Set of visible instance IDs
    this.layoutMode = 'single';          // 'single', 'split', 'quad'
    this.projects = [];
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

    // Markdown modal elements
    this.markdownModalOverlay = document.getElementById('markdown-modal-overlay');
    this.markdownModalClose = document.getElementById('markdown-modal-close');
    this.markdownProjectName = document.getElementById('markdown-project-name');
    this.markdownFileSelect = document.getElementById('markdown-file-select');
    this.markdownContent = document.getElementById('markdown-content');
    this.currentMarkdownProject = null;

    // Layout control buttons
    this.layoutSingleBtn = document.getElementById('layout-single');
    this.layoutSplitBtn = document.getElementById('layout-split');
    this.layoutQuadBtn = document.getElementById('layout-quad');

    this._bindEvents();
    this._bindImagePaste();
    this._bindImageDragDrop();
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
        if (!this.markdownModalOverlay.classList.contains('hidden')) {
          this._hideMarkdownModal();
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

    // Markdown modal events
    this.markdownModalClose.addEventListener('click', () => this._hideMarkdownModal());
    this.markdownModalOverlay.addEventListener('click', (e) => {
      if (e.target === this.markdownModalOverlay) {
        this._hideMarkdownModal();
      }
    });
    this.markdownFileSelect.addEventListener('change', () => {
      const file = this.markdownFileSelect.value;
      if (file && this.currentMarkdownProject) {
        this._loadMarkdownContent(this.currentMarkdownProject, file);
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
    // Prevent default drag behaviors on the whole document
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      document.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });

    // Handle drag enter/over on terminal container
    this.terminalContainer.addEventListener('dragenter', (e) => {
      if (this._hasDraggedImage(e)) {
        this.terminalContainer.classList.add('drag-over');
      }
    });

    this.terminalContainer.addEventListener('dragover', (e) => {
      if (this._hasDraggedImage(e)) {
        this.terminalContainer.classList.add('drag-over');
      }
    });

    this.terminalContainer.addEventListener('dragleave', (e) => {
      // Only remove class if we're leaving the container entirely
      if (!this.terminalContainer.contains(e.relatedTarget)) {
        this.terminalContainer.classList.remove('drag-over');
      }
    });

    this.terminalContainer.addEventListener('drop', async (e) => {
      this.terminalContainer.classList.remove('drag-over');

      const activeInstance = this.instances.get(this.activeInstanceId);
      if (!activeInstance) {
        this._showToast('Aucune instance active', 'error');
        return;
      }

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      for (const file of files) {
        if (file.type.startsWith('image/')) {
          await this._uploadAndSendImage(file);
        }
      }
    });
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
    // Create terminal wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'terminal-wrapper';
    wrapper.id = `terminal-${instanceData.id}`;
    this.terminalContainer.appendChild(wrapper);

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

      // Add to visible and select this instance
      // In split mode, add to visible set; in single mode, replace
      const addToVisible = this.layoutMode !== 'single' && this.visibleInstances.size > 0;
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

    const maxVisible = this.layoutMode === 'single' ? 1 : this.layoutMode === 'split' ? 2 : 4;

    if (this.layoutMode === 'single' || !addToVisible) {
      // In single mode or when replacing: show only this instance
      this.visibleInstances.clear();
      this.visibleInstances.add(id);
    } else {
      // In split/quad mode with addToVisible: add to visible set if space available
      if (this.visibleInstances.has(id)) {
        // Already visible, just focus it
      } else if (this.visibleInstances.size < maxVisible) {
        // Add to visible
        this.visibleInstances.add(id);
      } else {
        // Replace the oldest visible (or just add and remove first)
        const firstVisible = this.visibleInstances.values().next().value;
        this.visibleInstances.delete(firstVisible);
        this.visibleInstances.add(id);
      }
    }

    // Set focus to this instance
    this.activeInstanceId = id;
    this._updateVisibleTerminals();
    this._renderInstancesList();

    // Update document title
    const folderName = instance.cwd.split(/[/\\]/).pop() || instance.cwd;
    document.title = `${folderName} - Claude Code UI`;

    // Focus terminal
    setTimeout(() => {
      instance.terminal.focus();
    }, 50);
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

    // Adjust visible instances based on new mode
    const maxVisible = mode === 'single' ? 1 : mode === 'split' ? 2 : 4;
    while (this.visibleInstances.size > maxVisible) {
      const firstVisible = this.visibleInstances.values().next().value;
      if (firstVisible !== this.activeInstanceId) {
        this.visibleInstances.delete(firstVisible);
      } else {
        // Don't remove the active one, remove the second one
        const arr = Array.from(this.visibleInstances);
        this.visibleInstances.delete(arr[1]);
      }
    }

    this._updateVisibleTerminals();
    this._renderInstancesList();
  }

  _updateVisibleTerminals() {
    // Hide all terminals
    this.terminalContainer.querySelectorAll('.terminal-wrapper').forEach(w => {
      w.classList.remove('visible', 'focused');
    });

    // Show visible terminals
    this.visibleInstances.forEach(id => {
      const instance = this.instances.get(id);
      if (instance) {
        instance.wrapper.classList.add('visible');
        if (id === this.activeInstanceId) {
          instance.wrapper.classList.add('focused');
        }
      }
    });

    // Show/hide empty state
    this.emptyState.style.display = this.visibleInstances.size === 0 ? 'block' : 'none';

    // Fit all visible terminals after layout change
    setTimeout(() => this._fitVisibleTerminals(), 50);
  }

  _fitVisibleTerminals() {
    this.visibleInstances.forEach(id => {
      const instance = this.instances.get(id);
      if (instance && instance.terminal) {
        instance.terminal.fit();
        instance.ws.sendResize(instance.terminal.cols, instance.terminal.rows);
      }
    });
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
        li.classList.toggle('visible', this.visibleInstances.has(id));

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
        if (this.visibleInstances.has(id)) {
          li.classList.add('visible');
        }

        li.innerHTML = `
          <span class="status-dot ${statusClass}"></span>
          <span class="instance-name" title="${instance.cwd}">${folderName}</span>
          <button class="close-btn" title="Fermer">
            <i class="fa-solid fa-xmark"></i>
          </button>
        `;

        li.addEventListener('click', (e) => {
          if (!e.target.closest('.close-btn')) {
            // Ctrl+click adds to split view, normal click replaces
            const addToVisible = e.ctrlKey && this.layoutMode !== 'single';
            this._selectInstance(id, addToVisible);
          }
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
        this._showMarkdownModal(project.path, project.name);
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

      // Clean up debounce timer
      if (instance.waitingDebounceTimer) {
        clearTimeout(instance.waitingDebounceTimer);
      }

      instance.ws.close();
      instance.terminal.dispose();
      instance.wrapper.remove();
      this.instances.delete(id);
      this.visibleInstances.delete(id);

      // Select another instance if this was active
      if (this.activeInstanceId === id) {
        this.activeInstanceId = null;
        const remaining = Array.from(this.instances.keys());
        if (remaining.length > 0) {
          this._selectInstance(remaining[0]);
        } else {
          this.emptyState.style.display = 'block';
          document.title = 'Claude Code UI';
        }
      }

      this._updateVisibleTerminals();
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

  async _showMarkdownModal(projectPath, projectName) {
    this.currentMarkdownProject = projectPath;
    this.markdownProjectName.textContent = projectName;
    this.markdownContent.innerHTML = '<p class="markdown-placeholder">Chargement...</p>';
    this.markdownFileSelect.innerHTML = '<option value="">Choisir un fichier...</option>';
    this.markdownModalOverlay.classList.remove('hidden');

    try {
      const response = await fetch(`/api/projects/markdown?path=${encodeURIComponent(projectPath)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur');
      }

      if (data.files.length === 0) {
        this.markdownContent.innerHTML = '<p class="markdown-placeholder">Aucun fichier markdown dans ce projet</p>';
        return;
      }

      // Populate select
      data.files.forEach(file => {
        const option = document.createElement('option');
        option.value = file;
        option.textContent = file;
        this.markdownFileSelect.appendChild(option);
      });

      // Auto-load first file (prefer CLAUDE.md or README.md)
      const preferredFiles = ['CLAUDE.md', 'README.md', 'readme.md'];
      const autoLoadFile = preferredFiles.find(f => data.files.includes(f)) || data.files[0];
      this.markdownFileSelect.value = autoLoadFile;
      this._loadMarkdownContent(projectPath, autoLoadFile);

    } catch (error) {
      this.markdownContent.innerHTML = `<p class="markdown-placeholder">Erreur: ${error.message}</p>`;
    }
  }

  _hideMarkdownModal() {
    this.markdownModalOverlay.classList.add('hidden');
    this.currentMarkdownProject = null;
  }

  async _loadMarkdownContent(projectPath, filename) {
    this.markdownContent.innerHTML = '<p class="markdown-placeholder">Chargement...</p>';

    try {
      const response = await fetch(`/api/projects/markdown/content?path=${encodeURIComponent(projectPath)}&file=${encodeURIComponent(filename)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur');
      }

      // Render markdown
      this.markdownContent.innerHTML = marked.parse(data.content);

    } catch (error) {
      this.markdownContent.innerHTML = `<p class="markdown-placeholder">Erreur: ${error.message}</p>`;
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
