import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';

// Mock electron
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/test/app/path'
  }
}));

// Mock electron-log
vi.mock('electron-log', () => ({
  default: {
    scope: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      log: vi.fn()
    })
  }
}));

// Mock tree-kill
vi.mock('tree-kill', () => ({
  default: vi.fn((pid, signal, callback) => callback && callback())
}));

// Mock port utils
vi.mock('../ipc/utils/port_utils', () => ({
  getAvailablePort: vi.fn((defaultPort) => Promise.resolve(defaultPort)),
  checkPortInUse: vi.fn(() => Promise.resolve(false))
}));

// Mock fs/promises
vi.mock('fs/promises', async () => ({
  default: {
    access: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
  },
  access: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
}));

// Mock child_process
vi.mock('child_process', async () => ({
  default: {},
  spawn: vi.fn(() => ({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    pid: 12345,
    killed: false
  })),
  ChildProcess: class {}
}));

// Import modules after mocks
const { wordpressRuntime } = await import('../ipc/utils/wordpress_runtime');
const { getWordPressBinaryPath, checkWordPressBinaries, allocateWordPressPorts } = await import('../ipc/utils/wordpress_binary_utils');

describe('WordPress Binary Utils', () => {
  describe('getWordPressBinaryPath', () => {
    it('should return correct path for PHP binary', () => {
      const phpPath = getWordPressBinaryPath('php');
      expect(phpPath).toContain('wordpress-runtime');
      expect(phpPath).toContain('php');
      expect(phpPath).toContain('bin');
    });

    it('should return correct path for MySQL binary', () => {
      const mysqlPath = getWordPressBinaryPath('mysql');
      expect(mysqlPath).toContain('wordpress-runtime');
      expect(mysqlPath).toContain('mysql');
      expect(mysqlPath).toContain('bin');
    });

    it('should add .exe extension on Windows', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      
      const phpPath = getWordPressBinaryPath('php');
      expect(phpPath).toContain('php.exe');
      
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });

  describe('allocateWordPressPorts', () => {
    it('should return PHP and MySQL ports', async () => {
      const ports = await allocateWordPressPorts();
      expect(ports).toHaveProperty('phpPort');
      expect(ports).toHaveProperty('mysqlPort');
      expect(typeof ports.phpPort).toBe('number');
      expect(typeof ports.mysqlPort).toBe('number');
      expect(ports.phpPort).toBeGreaterThan(1024);
      expect(ports.mysqlPort).toBeGreaterThan(1024);
    });
  });
});

describe('WordPress Runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isRunning', () => {
    it('should return false for non-running app', () => {
      const isRunning = wordpressRuntime.isRunning('test-app-1');
      expect(isRunning).toBe(false);
    });
  });

  describe('getRunningProcesses', () => {
    it('should return empty map when no processes are running', () => {
      const processes = wordpressRuntime.getRunningProcesses();
      expect(processes.size).toBe(0);
    });
  });
});

describe('WordPress Response Processing', () => {
  it('should extract WP-CLI tags correctly', async () => {
    const { getDyadWpCliTags } = await import('../ipc/processors/response_processor');
    
    const response = `
      Let me install a plugin for you.
      <dyad-wp-cli>plugin install woocommerce --activate</dyad-wp-cli>
      And then create a page:
      <dyad-wp-cli>post create --post_type=page --post_title="Shop"</dyad-wp-cli>
    `;
    
    const commands = getDyadWpCliTags(response);
    expect(commands).toHaveLength(2);
    expect(commands[0]).toBe('plugin install woocommerce --activate');
    expect(commands[1]).toBe('post create --post_type=page --post_title="Shop"');
  });

  it('should extract WordPress DB queries correctly', async () => {
    const { getDyadWpDbTags } = await import('../ipc/processors/response_processor');
    
    const response = `
      Let me check the posts table:
      <dyad-wp-db>SELECT * FROM wp_posts WHERE post_status = 'publish' LIMIT 5;</dyad-wp-db>
      And update the site title:
      <dyad-wp-db>UPDATE wp_options SET option_value = 'My New Site' WHERE option_name = 'blogname';</dyad-wp-db>
    `;
    
    const queries = getDyadWpDbTags(response);
    expect(queries).toHaveLength(2);
    expect(queries[0]).toBe("SELECT * FROM wp_posts WHERE post_status = 'publish' LIMIT 5;");
    expect(queries[1]).toBe("UPDATE wp_options SET option_value = 'My New Site' WHERE option_name = 'blogname';");
  });
});