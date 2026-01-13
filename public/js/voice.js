class VoiceRecognition {
  constructor(options = {}) {
    this.lang = options.lang || 'fr-FR';
    this.continuous = options.continuous || false;
    this.interimResults = true; // Always true for better UX

    this.recognition = null;
    this.isListening = false;
    this.isSupported = this._checkSupport();

    this._resultCallbacks = [];
    this._startCallbacks = [];
    this._endCallbacks = [];
    this._errorCallbacks = [];
    this._interimCallbacks = [];

    this._lastInterimTranscript = '';

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
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      console.log('[Voice] Recognition started');
      this.isListening = true;
      this._lastInterimTranscript = '';
      this._emit('start');
    };

    this.recognition.onaudiostart = () => {
      console.log('[Voice] Audio capture started');
    };

    this.recognition.onsoundstart = () => {
      console.log('[Voice] Sound detected');
    };

    this.recognition.onspeechstart = () => {
      console.log('[Voice] Speech detected');
    };

    this.recognition.onspeechend = () => {
      console.log('[Voice] Speech ended');
    };

    this.recognition.onsoundend = () => {
      console.log('[Voice] Sound ended');
    };

    this.recognition.onaudioend = () => {
      console.log('[Voice] Audio capture ended');
    };

    this.recognition.onend = () => {
      console.log('[Voice] Recognition ended');
      this.isListening = false;
      this._emit('end');
    };

    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;

        if (result.isFinal) {
          finalTranscript += transcript;
          console.log('[Voice] Final result:', transcript);
        } else {
          interimTranscript += transcript;
        }
      }

      // Emit interim results for UI feedback
      if (interimTranscript && interimTranscript !== this._lastInterimTranscript) {
        this._lastInterimTranscript = interimTranscript;
        this._emit('interim', { transcript: interimTranscript });
      }

      // Emit final result
      if (finalTranscript) {
        const confidence = event.results[event.results.length - 1][0].confidence;
        this._emit('result', { transcript: finalTranscript, confidence });
      }
    };

    this.recognition.onerror = (event) => {
      console.error('[Voice] Error:', event.error, event.message);
      this.isListening = false;
      this._emit('error', event.error);
    };

    this.recognition.onnomatch = () => {
      console.log('[Voice] No match found');
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
      // Recreate recognition instance to avoid stale state issues
      this._initRecognition();
      this.recognition.start();
      return true;
    } catch (e) {
      console.error('[Voice] Start error:', e);
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

  onInterim(callback) {
    this._interimCallbacks.push(callback);
    return () => this._removeCallback(this._interimCallbacks, callback);
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
      'interim': this._interimCallbacks,
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
