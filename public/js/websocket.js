class WebSocketManager {
  constructor(instanceId, options = {}) {
    this.instanceId = instanceId;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.retryCount = 0;
    this.ws = null;
    this.listeners = {
      output: [],
      exit: [],
      error: [],
      open: [],
      close: [],
    };
  }

  connect() {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/terminal/${this.instanceId}`;

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.retryCount = 0;
        this._emit('open');
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this._emit(message.type, message);
        } catch (e) {
          console.error('Failed to parse message:', e);
        }
      };

      this.ws.onclose = (event) => {
        this._emit('close', event);

        if (event.code !== 1000 && this.retryCount < this.maxRetries) {
          this.retryCount++;
          console.log(`Reconnecting... (attempt ${this.retryCount}/${this.maxRetries})`);
          setTimeout(() => {
            this.connect().catch(() => {});
          }, this.retryDelay * this.retryCount);
        }
      };

      this.ws.onerror = (error) => {
        this._emit('error', error);
        reject(error);
      };
    });
  }

  send(type, data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    }
  }

  sendInput(data) {
    this.send('input', data);
  }

  sendResize(cols, rows) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
    }
  }

  _emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((callback) => callback(data));
    }
  }

  close() {
    if (this.ws) {
      this.retryCount = this.maxRetries; // Prevent reconnection
      this.ws.close(1000, 'Client closed');
    }
  }

  get isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

window.WebSocketManager = WebSocketManager;
