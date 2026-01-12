class TerminalWrapper {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;

    this.terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Consolas, "Courier New", monospace',
      scrollback: 10000,
      theme: {
        background: '#11111b',
        foreground: '#cdd6f4',
        cursor: '#f5e0dc',
        cursorAccent: '#11111b',
        selection: 'rgba(137, 180, 250, 0.3)',
        black: '#45475a',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#f5c2e7',
        cyan: '#94e2d5',
        white: '#bac2de',
        brightBlack: '#585b70',
        brightRed: '#f38ba8',
        brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af',
        brightBlue: '#89b4fa',
        brightMagenta: '#f5c2e7',
        brightCyan: '#94e2d5',
        brightWhite: '#a6adc8',
      },
      allowProposedApi: true,
    });

    this.fitAddon = new FitAddon.FitAddon();
    this.terminal.loadAddon(this.fitAddon);

    // Try WebGL addon for performance (disabled - can cause scroll issues)
    // try {
    //   this.webglAddon = new WebglAddon.WebglAddon();
    //   this.terminal.loadAddon(this.webglAddon);
    // } catch (e) {
    //   console.warn('WebGL addon not available, using canvas renderer');
    // }

    this.terminal.open(container);
    this.fit();

    // Handle paste (Ctrl+V)
    this._setupPasteHandler();

    // Handle resize
    this._resizeObserver = new ResizeObserver(() => {
      this.fit();
    });
    this._resizeObserver.observe(container);
  }

  fit() {
    try {
      this.fitAddon.fit();
    } catch (e) {
      // Ignore fit errors during initialization
    }
  }

  _setupPasteHandler() {
    this._pasteCallbacks = [];
    this._isPasting = false;

    // Intercept Ctrl+V / Ctrl+Shift+V
    this.terminal.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown' && event.ctrlKey && (event.key === 'v' || event.key === 'V')) {
        if (!this._isPasting) {
          this._isPasting = true;
          this._handlePaste().finally(() => {
            setTimeout(() => { this._isPasting = false; }, 100);
          });
        }
        return false; // Prevent default terminal handling
      }
      return true;
    });

    // Also intercept the browser's paste event to prevent xterm.js from handling it
    this.container.addEventListener('paste', (event) => {
      event.preventDefault();
      event.stopPropagation();
      // Let our Ctrl+V handler deal with it
    }, true);
  }

  async _handlePaste() {
    try {
      const clipboardItems = await navigator.clipboard.read();

      for (const item of clipboardItems) {
        // Check for images first
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], 'pasted-image.png', { type: imageType });
          this._pasteCallbacks.forEach(cb => cb({ type: 'image', file }));
          return;
        }

        // Fall back to text
        if (item.types.includes('text/plain')) {
          const blob = await item.getType('text/plain');
          const text = await blob.text();
          this._pasteCallbacks.forEach(cb => cb({ type: 'text', text }));
          return;
        }
      }
    } catch (e) {
      // Fallback for browsers that don't support clipboard.read()
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          this._pasteCallbacks.forEach(cb => cb({ type: 'text', text }));
        }
      } catch (err) {
        console.warn('Clipboard access denied:', err);
      }
    }
  }

  onPaste(callback) {
    this._pasteCallbacks.push(callback);
    return {
      dispose: () => {
        const index = this._pasteCallbacks.indexOf(callback);
        if (index > -1) this._pasteCallbacks.splice(index, 1);
      }
    };
  }

  write(data) {
    this.terminal.write(data);
  }

  onData(callback) {
    return this.terminal.onData(callback);
  }

  onResize(callback) {
    return this.terminal.onResize(callback);
  }

  focus() {
    this.terminal.focus();
  }

  blur() {
    this.terminal.blur();
  }

  scrollToBottom() {
    this.terminal.scrollToBottom();
  }

  get cols() {
    return this.terminal.cols;
  }

  get rows() {
    return this.terminal.rows;
  }

  dispose() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }
    if (this.webglAddon) {
      this.webglAddon.dispose();
    }
    this.terminal.dispose();
  }
}

window.TerminalWrapper = TerminalWrapper;
