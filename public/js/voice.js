class VoiceRecognition {
  constructor(options = {}) {
    this.lang = options.lang || 'fr-FR';
    this.continuous = options.continuous || false;
    this.interimResults = options.interimResults || false;

    this.recognition = null;
    this.isListening = false;
    this.isSupported = this._checkSupport();

    this._resultCallbacks = [];
    this._startCallbacks = [];
    this._endCallbacks = [];
    this._errorCallbacks = [];

    if (this.isSupported) {
      this._initRecognition();
    }
  }

  _checkSupport() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  _initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();

    this.recognition.lang = this.lang;
    this.recognition.continuous = this.continuous;
    this.recognition.interimResults = this.interimResults;

    this.recognition.onstart = () => {
      this.isListening = true;
      this._emit('start');
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this._emit('end');
    };

    this.recognition.onresult = (event) => {
      const results = event.results;
      const lastResult = results[results.length - 1];

      if (lastResult.isFinal) {
        const transcript = lastResult[0].transcript;
        const confidence = lastResult[0].confidence;
        this._emit('result', { transcript, confidence });
      }
    };

    this.recognition.onerror = (event) => {
      this.isListening = false;
      this._emit('error', event.error);
    };
  }

  start() {
    if (!this.isSupported) {
      this._emit('error', 'not-supported');
      return false;
    }

    if (this.isListening) {
      return false;
    }

    try {
      this.recognition.start();
      return true;
    } catch (e) {
      this._emit('error', e.message);
      return false;
    }
  }

  stop() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
    }
  }

  abort() {
    if (this.recognition && this.isListening) {
      this.recognition.abort();
    }
  }

  setLanguage(lang) {
    this.lang = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  onResult(callback) {
    this._resultCallbacks.push(callback);
    return () => this._removeCallback(this._resultCallbacks, callback);
  }

  onStart(callback) {
    this._startCallbacks.push(callback);
    return () => this._removeCallback(this._startCallbacks, callback);
  }

  onEnd(callback) {
    this._endCallbacks.push(callback);
    return () => this._removeCallback(this._endCallbacks, callback);
  }

  onError(callback) {
    this._errorCallbacks.push(callback);
    return () => this._removeCallback(this._errorCallbacks, callback);
  }

  _emit(event, data) {
    const callbacks = {
      'start': this._startCallbacks,
      'end': this._endCallbacks,
      'result': this._resultCallbacks,
      'error': this._errorCallbacks,
    };

    if (callbacks[event]) {
      callbacks[event].forEach(cb => cb(data));
    }
  }

  _removeCallback(array, callback) {
    const index = array.indexOf(callback);
    if (index > -1) array.splice(index, 1);
  }

  static getAvailableLanguages() {
    return [
      { code: 'fr-FR', label: 'Français' },
      { code: 'en-US', label: 'English (US)' },
      { code: 'en-GB', label: 'English (UK)' },
      { code: 'de-DE', label: 'Deutsch' },
      { code: 'es-ES', label: 'Español' },
      { code: 'it-IT', label: 'Italiano' },
      { code: 'pt-BR', label: 'Português (BR)' },
      { code: 'ja-JP', label: '日本語' },
      { code: 'zh-CN', label: '中文 (简体)' },
    ];
  }
}

window.VoiceRecognition = VoiceRecognition;
