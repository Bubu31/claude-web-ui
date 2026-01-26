import pty from 'node-pty';
import { randomUUID } from 'crypto';
import config from './config.js';

class PtyManager {
  constructor(maxInstances = config.maxInstances) {
    this.maxInstances = maxInstances;
    this.instances = new Map();
  }

  create(cwd) {
    return this._createInstance(cwd, 'claude');
  }

  createShell(cwd) {
    return this._createInstance(cwd, 'shell');
  }

  _createInstance(cwd, type = 'claude') {
    if (this.instances.size >= this.maxInstances) {
      throw new Error(`Maximum instances limit reached (${this.maxInstances})`);
    }

    const id = randomUUID();

    // Choose shell and args based on type
    let shell, args;
    if (type === 'shell') {
      // Standard shell terminal
      shell = process.env.COMSPEC || 'cmd.exe';
      args = [];
    } else {
      // Claude instance
      shell = config.pty.shell;
      args = config.pty.args;
    }

    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: config.terminal.defaultCols,
      rows: config.terminal.defaultRows,
      cwd: cwd,
      env: config.pty.env,
    });

    const instance = {
      id,
      pty: ptyProcess,
      cwd,
      type,
      status: 'active',
      createdAt: new Date().toISOString(),
      listeners: new Set(),
    };

    ptyProcess.onExit(({ exitCode }) => {
      instance.status = 'exited';
      instance.exitCode = exitCode;
      instance.listeners.forEach((callback) => {
        callback({ type: 'exit', code: exitCode });
      });
    });

    this.instances.set(id, instance);

    return { id, cwd, type, status: instance.status, createdAt: instance.createdAt };
  }

  get(id) {
    return this.instances.get(id) || null;
  }

  list() {
    return Array.from(this.instances.values()).map(({ id, cwd, type, status, createdAt }) => ({
      id,
      cwd,
      type: type || 'claude',
      status,
      createdAt,
    }));
  }

  async close(id) {
    const instance = this.instances.get(id);
    if (!instance) {
      throw new Error(`Instance ${id} not found`);
    }

    // If already exited, just clean up
    if (instance.status === 'exited') {
      this.instances.delete(id);
      return;
    }

    return new Promise((resolve) => {
      let resolved = false;

      const cleanup = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        this.instances.delete(id);
        resolve();
      };

      const timeout = setTimeout(() => {
        // Force kill after timeout
        try {
          instance.pty.kill();
        } catch (e) {
          // Ignore errors during force kill
        }
        cleanup();
      }, config.gracefulShutdownTimeout);

      // Listen for exit
      instance.pty.onExit(() => {
        cleanup();
      });

      // On Windows, send Ctrl+C first, then kill
      // On Unix, SIGTERM works fine
      if (process.platform === 'win32') {
        // Send Ctrl+C to gracefully terminate
        try {
          instance.pty.write('\x03');
        } catch (e) {
          // Ignore write errors
        }
        // Give it a moment, then force kill
        setTimeout(() => {
          if (!resolved) {
            try {
              instance.pty.kill();
            } catch (e) {
              // Ignore errors
            }
          }
        }, 1000);
      } else {
        instance.pty.kill('SIGTERM');
      }
    });
  }

  async closeAll() {
    const closePromises = Array.from(this.instances.keys()).map((id) => this.close(id));
    await Promise.all(closePromises);
  }

  write(id, data) {
    const instance = this.instances.get(id);
    if (!instance) {
      throw new Error(`Instance ${id} not found`);
    }
    instance.pty.write(data);
  }

  resize(id, cols, rows) {
    const instance = this.instances.get(id);
    if (!instance) {
      throw new Error(`Instance ${id} not found`);
    }
    instance.pty.resize(cols, rows);
  }

  onData(id, callback) {
    const instance = this.instances.get(id);
    if (!instance) {
      throw new Error(`Instance ${id} not found`);
    }
    return instance.pty.onData(callback);
  }

  addListener(id, callback) {
    const instance = this.instances.get(id);
    if (instance) {
      instance.listeners.add(callback);
    }
  }

  removeListener(id, callback) {
    const instance = this.instances.get(id);
    if (instance) {
      instance.listeners.delete(callback);
    }
  }
}

export default PtyManager;
