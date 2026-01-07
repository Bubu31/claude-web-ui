import pty from 'node-pty';
import { randomUUID } from 'crypto';
import config from './config.js';

class PtyManager {
  constructor(maxInstances = config.maxInstances) {
    this.maxInstances = maxInstances;
    this.instances = new Map();
  }

  create(cwd) {
    if (this.instances.size >= this.maxInstances) {
      throw new Error(`Maximum instances limit reached (${this.maxInstances})`);
    }

    const id = randomUUID();

    const ptyProcess = pty.spawn(config.pty.shell, config.pty.args, {
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

    return { id, cwd, status: instance.status, createdAt: instance.createdAt };
  }

  get(id) {
    return this.instances.get(id) || null;
  }

  list() {
    return Array.from(this.instances.values()).map(({ id, cwd, status, createdAt }) => ({
      id,
      cwd,
      status,
      createdAt,
    }));
  }

  async close(id) {
    const instance = this.instances.get(id);
    if (!instance) {
      throw new Error(`Instance ${id} not found`);
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        instance.pty.kill('SIGKILL');
        this.instances.delete(id);
        resolve();
      }, config.gracefulShutdownTimeout);

      instance.pty.onExit(() => {
        clearTimeout(timeout);
        this.instances.delete(id);
        resolve();
      });

      instance.pty.kill('SIGTERM');
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
