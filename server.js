import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync, readdirSync, readFileSync, mkdirSync, unlinkSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { execFileSync } from 'child_process';
import multer from 'multer';
import ffmpegPath from 'ffmpeg-static';
import WaveFile from 'wavefile';
import config from './src/config.js';
import PtyManager from './src/pty-manager.js';
import claudeUsage from './src/claude-usage.js';
import { pipeline } from '@xenova/transformers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const ptyManager = new PtyManager();

// Configure image upload directory
const uploadDir = join(tmpdir(), 'claude-code-ui-images');
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = file.originalname.split('.').pop() || 'png';
    cb(null, `image-${uniqueSuffix}.${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Middleware
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// API Routes

// List all instances
app.get('/api/instances', (req, res) => {
  res.json({ instances: ptyManager.list() });
});

// Get instance details
app.get('/api/instances/:id', (req, res) => {
  const instance = ptyManager.get(req.params.id);
  if (!instance) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  res.json({
    id: instance.id,
    cwd: instance.cwd,
    status: instance.status,
    createdAt: instance.createdAt,
  });
});

// Create new instance
app.post('/api/instances', (req, res) => {
  const { cwd } = req.body;

  if (!cwd) {
    return res.status(400).json({ error: 'cwd is required' });
  }

  // Validate path
  if (!existsSync(cwd)) {
    return res.status(400).json({ error: 'Directory does not exist' });
  }

  const stats = statSync(cwd);
  if (!stats.isDirectory()) {
    return res.status(400).json({ error: 'Path is not a directory' });
  }

  try {
    const instance = ptyManager.create(cwd);
    res.status(201).json(instance);
  } catch (error) {
    if (error.message.includes('Maximum instances')) {
      return res.status(429).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete instance
app.delete('/api/instances/:id', async (req, res) => {
  try {
    await ptyManager.close(req.params.id);
    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// Scan for projects with CLAUDE.md
function scanProjects(rootDir, marker, maxDepth = 3) {
  const projects = [];

  function scan(dir, depth) {
    if (depth > maxDepth) return;

    try {
      const entries = readdirSync(dir, { withFileTypes: true });

      // Check if this directory has the marker file
      const hasMarker = entries.some(
        (e) => e.isFile() && e.name.toLowerCase() === marker.toLowerCase()
      );

      if (hasMarker) {
        const name = dir.split(/[/\\]/).pop();
        projects.push({ name, path: dir });
      }

      // Scan subdirectories
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          scan(join(dir, entry.name), depth + 1);
        }
      }
    } catch (error) {
      // Ignore permission errors
    }
  }

  scan(rootDir, 0);
  return projects;
}

// List detected projects
app.get('/api/projects', (req, res) => {
  try {
    const projects = scanProjects(config.projectsRoot, config.projectMarker);
    res.json({ projects, root: config.projectsRoot });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List markdown files in a project
app.get('/api/projects/markdown', (req, res) => {
  const { path: projectPath } = req.query;

  if (!projectPath) {
    return res.status(400).json({ error: 'path query parameter is required' });
  }

  // Security: validate path is within projectsRoot
  const normalizedPath = join(projectPath);
  if (!normalizedPath.startsWith(config.projectsRoot)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!existsSync(projectPath) || !statSync(projectPath).isDirectory()) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    const entries = readdirSync(projectPath, { withFileTypes: true });
    const mdFiles = entries
      .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.md'))
      .map(e => e.name)
      .sort();
    res.json({ files: mdFiles });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get markdown file content
app.get('/api/projects/markdown/content', (req, res) => {
  const { path: projectPath, file } = req.query;

  if (!projectPath || !file) {
    return res.status(400).json({ error: 'path and file query parameters are required' });
  }

  // Security: validate path and prevent directory traversal
  if (file.includes('..') || file.includes('/') || file.includes('\\')) {
    return res.status(403).json({ error: 'Invalid file name' });
  }

  const normalizedPath = join(projectPath);
  if (!normalizedPath.startsWith(config.projectsRoot)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const filePath = join(projectPath, file);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return res.status(404).json({ error: 'File not found' });
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    res.json({ content, name: file });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get usage stats from Claude API
app.get('/api/usage', async (req, res) => {
  try {
    const usage = await claudeUsage.getUsage();
    res.json(usage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get cookie status
app.get('/api/cookie/status', (req, res) => {
  res.json(claudeUsage.getCookieStatus());
});

// Upload image
app.post('/api/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }
  res.json({ path: req.file.path });
});

// Configure audio upload for transcription
const audioUploadDir = join(tmpdir(), 'claude-code-ui-audio');
if (!existsSync(audioUploadDir)) {
  mkdirSync(audioUploadDir, { recursive: true });
}

const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, audioUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `audio-${uniqueSuffix}.webm`);
  }
});

const audioUpload = multer({
  storage: audioStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

// Whisper transcription pipeline (lazy loaded)
let transcriber = null;

async function getTranscriber() {
  if (!transcriber) {
    console.log('Loading Whisper model (first time may take a while)...');
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small', {
      quantized: true,
    });
    console.log('Whisper model loaded!');
  }
  return transcriber;
}

// Convert audio to raw samples for Whisper
function convertAudioToSamples(inputPath) {
  const wavPath = inputPath.replace(/\.[^.]+$/, '.wav');

  // Convert to 16kHz mono WAV using ffmpeg
  execFileSync(ffmpegPath, [
    '-i', inputPath,
    '-ar', '16000',      // 16kHz sample rate (Whisper expects this)
    '-ac', '1',          // Mono
    '-c:a', 'pcm_s16le', // 16-bit PCM
    '-y',                // Overwrite output
    wavPath
  ], { stdio: 'pipe' });

  // Read WAV file and extract samples
  const wavBuffer = readFileSync(wavPath);
  const wav = new WaveFile.WaveFile(wavBuffer);

  // Get samples as Float32Array (normalized to -1.0 to 1.0)
  const samples = wav.getSamples(false, Float32Array);

  // Clean up wav file
  try {
    unlinkSync(wavPath);
  } catch (e) {}

  return samples;
}

// Transcribe audio endpoint
app.post('/api/transcribe', audioUpload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file provided' });
  }

  const audioPath = req.file.path;
  const lang = req.body.lang || 'french';

  try {
    // Convert audio to raw samples
    const audioSamples = convertAudioToSamples(audioPath);

    // Get Whisper transcriber
    const whisper = await getTranscriber();

    // Transcribe using raw audio data
    const result = await whisper(audioSamples, {
      language: lang,
      task: 'transcribe',
    });

    // Filter out Whisper hallucination tags (music, applause, etc.)
    let cleanText = result.text || '';
    cleanText = cleanText
      .replace(/\[.*?\]/gi, '')  // Remove [music], [Musique], [applause], etc.
      .replace(/\(.*?\)/gi, '')  // Remove (music), (Musique), etc.
      .replace(/\*.*?\*/gi, '')  // Remove *music*, etc.
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .trim();

    // Clean up the original audio file
    try {
      unlinkSync(audioPath);
    } catch (e) {
      // Ignore cleanup errors
    }

    res.json({
      text: cleanText,
      chunks: result.chunks || []
    });
  } catch (error) {
    console.error('Transcription error:', error);

    // Clean up on error
    try {
      unlinkSync(audioPath);
    } catch (e) {}

    res.status(500).json({ error: 'Transcription failed: ' + error.message });
  }
});

// Set cookie
app.post('/api/cookie', (req, res) => {
  const { cookie } = req.body;
  if (!cookie || typeof cookie !== 'string') {
    return res.status(400).json({ error: 'Cookie string is required' });
  }
  claudeUsage.setCookie(cookie);
  res.json({ success: true, message: 'Cookie saved' });
});

// Server control - Shutdown
app.post('/api/server/shutdown', async (req, res) => {
  res.json({ success: true, message: 'Server shutting down...' });
  // Give time for response to be sent
  setTimeout(async () => {
    console.log('\nShutdown requested via API...');
    await ptyManager.closeAll();

    // Close all WebSocket connections
    wss.clients.forEach(client => client.close());

    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });

    // Force exit after timeout
    setTimeout(() => {
      console.error('Forced shutdown');
      process.exit(1);
    }, 3000);
  }, 300);
});

// Server control - Restart
app.post('/api/server/restart', async (req, res) => {
  res.json({ success: true, message: 'Server restarting...' });
  // Give time for response to be sent
  setTimeout(async () => {
    console.log('\nRestarting server...');
    await ptyManager.closeAll();

    // Close all WebSocket connections
    wss.clients.forEach(client => client.close());

    // Spawn a new process to restart the server
    const { spawn } = await import('child_process');
    const child = spawn(process.argv[0], [process.argv[1]], {
      cwd: __dirname,
      detached: true,
      stdio: 'ignore',
      env: process.env,
    });
    child.unref();

    server.close(() => {
      process.exit(0);
    });

    // Force exit after timeout
    setTimeout(() => {
      process.exit(0);
    }, 2000);
  }, 300);
});

// WebSocket handling
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathParts = url.pathname.split('/');

  // Expected path: /terminal/:instanceId
  if (pathParts[1] !== 'terminal' || !pathParts[2]) {
    ws.close(4000, 'Invalid path');
    return;
  }

  const instanceId = pathParts[2];
  const instance = ptyManager.get(instanceId);

  if (!instance) {
    ws.close(4001, 'Instance not found');
    return;
  }

  // Send current output on connection
  const dataDisposable = ptyManager.onData(instanceId, (data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'output', data }));
    }
  });

  // Handle exit events
  const exitListener = (event) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(event));
    }
  };
  ptyManager.addListener(instanceId, exitListener);

  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());

      // Check if instance still exists
      const currentInstance = ptyManager.get(instanceId);
      if (!currentInstance || currentInstance.status === 'exited') {
        return;
      }

      switch (msg.type) {
        case 'input':
          ptyManager.write(instanceId, msg.data);
          break;
        case 'resize':
          if (msg.cols && msg.rows) {
            ptyManager.resize(instanceId, msg.cols, msg.rows);
          }
          break;
        default:
          console.warn('Unknown message type:', msg.type);
      }
    } catch (error) {
      // Only log if not an "instance not found" error
      if (!error.message.includes('not found')) {
        console.error('Error processing message:', error);
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }
      }
    }
  });

  // Cleanup on close
  ws.on('close', () => {
    dataDisposable.dispose();
    ptyManager.removeListener(instanceId, exitListener);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\nShutting down...');

  await ptyManager.closeAll();

  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  // Force exit after timeout
  setTimeout(() => {
    console.error('Forced shutdown');
    process.exit(1);
  }, config.gracefulShutdownTimeout + 1000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
server.listen(config.port, config.host, () => {
  console.log(`Claude Code UI running on http://${config.host}:${config.port}`);
});
