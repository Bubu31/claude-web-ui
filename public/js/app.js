const MAX_INSTANCES = 5;

class App {
  constructor() {
    this.instances = new Map();
    this.activeInstanceId = null;
    this.projects = [];
    // DOM elements
    this.instancesList = document.getElementById('instances-list');
    this.projectsList = document.getElementById('projects-list');
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

    // Handle window resize
    window.addEventListener('resize', () => {
      const active = this.instances.get(this.activeInstanceId);
      if (active && active.terminal) {
        active.terminal.fit();
      }
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

      // Select this instance if it's the first one
      if (this.instances.size === 1) {
        this._selectInstance(instanceData.id);
      }

      // Initial resize after a short delay
      setTimeout(() => {
        if (this.activeInstanceId === instanceData.id) {
          terminal.fit();
          ws.sendResize(terminal.cols, terminal.rows);
        }
      }, 100);

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

  _selectInstance(id) {
    const instance = this.instances.get(id);
    if (!instance) return;

    // Hide all terminal wrappers
    this.terminalContainer.querySelectorAll('.terminal-wrapper').forEach(w => {
      w.classList.remove('active');
    });

    // Show selected terminal
    instance.wrapper.classList.add('active');
    this.emptyState.style.display = 'none';

    // Update active state
    this.activeInstanceId = id;
    this._renderInstancesList();

    // Focus and resize terminal
    setTimeout(() => {
      instance.terminal.fit();
      instance.ws.sendResize(instance.terminal.cols, instance.terminal.rows);
      instance.terminal.focus();
    }, 50);
  }

  _renderInstancesList() {
    if (this.instances.size === 0) {
      this.instancesList.innerHTML = '<li class="empty-message">Aucune instance</li>';
      this.emptyState.style.display = 'block';
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

        // Update active state
        li.classList.toggle('active', id === this.activeInstanceId);

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

        li.innerHTML = `
          <span class="status-dot ${statusClass}"></span>
          <span class="instance-name" title="${instance.cwd}">${folderName}</span>
          <button class="close-btn" title="Fermer">
            <i class="fa-solid fa-xmark"></i>
          </button>
        `;

        li.addEventListener('click', (e) => {
          if (!e.target.closest('.close-btn')) {
            this._selectInstance(id);
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
  }

  _renderProjectsList() {
    if (this.projects.length === 0) {
      this.projectsList.innerHTML = '<li class="loading">Aucun projet trouvé</li>';
      return;
    }

    this.projectsList.innerHTML = '';

    this.projects.forEach((project) => {
      const li = document.createElement('li');
      li.className = 'project-item';
      li.title = project.path;
      li.innerHTML = `
        <i class="fa-solid fa-folder"></i>
        <span>${project.name}</span>
      `;

      li.addEventListener('click', () => {
        this._createInstance(project.path);
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

      // Select another instance if this was active
      if (this.activeInstanceId === id) {
        this.activeInstanceId = null;
        const remaining = Array.from(this.instances.keys());
        if (remaining.length > 0) {
          this._selectInstance(remaining[0]);
        } else {
          this.emptyState.style.display = 'block';
        }
      }

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
