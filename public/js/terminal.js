class TerminalWrapper {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;

    this.terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Consolas, "Courier New", monospace',
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

    // Try WebGL addon for performance
    try {
      this.webglAddon = new WebglAddon.WebglAddon();
      this.terminal.loadAddon(this.webglAddon);
    } catch (e) {
      console.warn('WebGL addon not available, using canvas renderer');
    }

    this.terminal.open(container);
    this.fit();

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
