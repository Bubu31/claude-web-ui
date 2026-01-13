class VoiceRecorder {
  constructor(options = {}) {
    this.lang = options.lang || 'french';
    this.deviceId = options.deviceId || null; // Selected microphone device ID
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.isRecording = false;
    this.isSupported = this._checkSupport();

    this._startCallbacks = [];
    this._stopCallbacks = [];
    this._resultCallbacks = [];
    this._errorCallbacks = [];
    this._devicesChangedCallbacks = [];
  }

  _checkSupport() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  async start() {
    if (!this.isSupported) {
      this._emit('error', 'not-supported');
      return false;
    }

    if (this.isRecording) {
      return false;
    }

    try {
      // Build audio constraints
      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000,
      };

      // Add device ID if specified
      if (this.deviceId) {
        audioConstraints.deviceId = { exact: this.deviceId };
      }

      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      });

      // Create MediaRecorder
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: this._getSupportedMimeType(),
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        this.isRecording = false;
        this._emit('stop');

        // Create blob from chunks
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });

        // Stop all tracks
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
          this.stream = null;
        }

        // Send to server for transcription
        await this._transcribe(audioBlob);
      };

      this.mediaRecorder.onerror = (event) => {
        console.error('[Voice] MediaRecorder error:', event.error);
        this.isRecording = false;
        this._emit('error', event.error?.message || 'Recording error');
      };

      // Start recording
      this.mediaRecorder.start(100); // Collect data every 100ms
      this.isRecording = true;
      this._emit('start');
      return true;

    } catch (error) {
      console.error('[Voice] Error starting recording:', error);
      if (error.name === 'NotAllowedError') {
        this._emit('error', 'not-allowed');
      } else if (error.name === 'NotFoundError') {
        this._emit('error', 'no-microphone');
      } else {
        this._emit('error', error.message);
      }
      return false;
    }
  }

  stop() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
    }
  }

  abort() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.audioChunks = []; // Clear chunks to prevent transcription
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }

  setLanguage(lang) {
    this.lang = lang;
  }

  setDevice(deviceId) {
    this.deviceId = deviceId;
  }

  // Get list of available audio input devices
  async getAudioDevices() {
    if (!this.isSupported) {
      return [];
    }

    try {
      // First request permission to access microphone (required to get device labels)
      // We use a temporary stream just to get permission
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach(track => track.stop());

      // Now enumerate devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');

      return audioInputs.map(device => ({
        deviceId: device.deviceId,
        label: device.label || `Microphone ${device.deviceId.slice(0, 8)}...`,
        isDefault: device.deviceId === 'default'
      }));
    } catch (error) {
      console.error('[Voice] Error enumerating devices:', error);
      return [];
    }
  }

  // Listen for device changes (plug/unplug)
  startDeviceWatcher() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.addEventListener) {
      return;
    }

    navigator.mediaDevices.addEventListener('devicechange', async () => {
      const devices = await this.getAudioDevices();
      this._emit('devicesChanged', devices);
    });
  }

  onDevicesChanged(callback) {
    this._devicesChangedCallbacks.push(callback);
    return () => this._removeCallback(this._devicesChangedCallbacks, callback);
  }

  _getSupportedMimeType() {
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];

    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        return mimeType;
      }
    }
    return 'audio/webm';
  }

  async _transcribe(audioBlob) {
    if (audioBlob.size < 1000) {
      // Too short, probably empty
      this._emit('error', 'recording-too-short');
      return;
    }

    this._emit('transcribing');

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('lang', this.lang);

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Transcription failed');
      }

      const result = await response.json();
      const text = result.text?.trim();

      if (text) {
        this._emit('result', { transcript: text });
      } else {
        this._emit('error', 'no-speech');
      }
    } catch (error) {
      console.error('[Voice] Transcription error:', error);
      this._emit('error', error.message);
    }
  }

  onStart(callback) {
    this._startCallbacks.push(callback);
    return () => this._removeCallback(this._startCallbacks, callback);
  }

  onStop(callback) {
    this._stopCallbacks.push(callback);
    return () => this._removeCallback(this._stopCallbacks, callback);
  }

  onResult(callback) {
    this._resultCallbacks.push(callback);
    return () => this._removeCallback(this._resultCallbacks, callback);
  }

  onError(callback) {
    this._errorCallbacks.push(callback);
    return () => this._removeCallback(this._errorCallbacks, callback);
  }

  onTranscribing(callback) {
    this._transcribingCallbacks = this._transcribingCallbacks || [];
    this._transcribingCallbacks.push(callback);
    return () => this._removeCallback(this._transcribingCallbacks, callback);
  }

  _emit(event, data) {
    const callbacks = {
      'start': this._startCallbacks,
      'stop': this._stopCallbacks,
      'result': this._resultCallbacks,
      'error': this._errorCallbacks,
      'transcribing': this._transcribingCallbacks || [],
      'devicesChanged': this._devicesChangedCallbacks || [],
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
      { code: 'french', label: 'Francais' },
      { code: 'english', label: 'English' },
      { code: 'german', label: 'Deutsch' },
      { code: 'spanish', label: 'Espanol' },
      { code: 'italian', label: 'Italiano' },
      { code: 'portuguese', label: 'Portugues' },
      { code: 'japanese', label: 'Japanese' },
      { code: 'chinese', label: 'Chinese' },
    ];
  }
}

window.VoiceRecorder = VoiceRecorder;
