import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WordPressRuntime } from '../ipc/utils/wordpress_runtime';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';

// Mock the dependencies
vi.mock('fs/promises');
vi.mock('child_process');
vi.mock('../ipc/utils/wordpress_binary_utils', () => ({
  getWordPressBinaryPath: vi.fn((binary) => `/usr/local/bin/${binary}`),
  getMySQLDataDir: vi.fn((appPath) => path.join(appPath, '.wordpress-data', 'mysql')),
  getWordPressDir: vi.fn((appPath) => path.join(appPath, 'wordpress')),
  initializeMySQLDataDir: vi.fn(),
  createWpConfig: vi.fn(),
  createPHPConfig: vi.fn(),
  getPHPIniPath: vi.fn((appPath) => path.join(appPath, '.wordpress-data', 'php.ini')),
  allocateWordPressPorts: vi.fn().mockResolvedValue({ phpPort: 8080, mysqlPort: 3306 }),
  checkWordPressBinaries: vi.fn().mockResolvedValue({ available: true, missing: [] })
}));

vi.mock('../ipc/utils/port_utils', () => ({
  checkPortInUse: vi.fn().mockResolvedValue(false)
}));

vi.mock('../ipc/utils/wordpress_core_utils', () => ({
  setupWordPressCore: vi.fn(),
  createDefaultTheme: vi.fn()
}));

vi.mock('electron-log', () => ({
  default: {
    scope: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    })
  }
}));

describe('WordPressRuntime MySQL 9.x Handling', () => {
  let runtime: WordPressRuntime;
  const mockSpawn = vi.mocked(spawn);
  const mockFs = vi.mocked(fs);

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = new WordPressRuntime();
    
    // Mock file system operations
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.chmod.mockResolvedValue(undefined);
  });

  it('should detect MySQL version correctly', async () => {
    // Mock MySQL version detection
    const mockVersionProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill: vi.fn(),
      pid: 1234,
      killed: false
    };

    mockSpawn.mockImplementation((command, args) => {
      if (args && args.includes('--version')) {
        // Simulate version output
        setTimeout(() => {
          mockVersionProcess.stdout.on.mock.calls
            .find(call => call[0] === 'data')?.[1]?.(
              Buffer.from('mysqld  Ver 9.2.0 for osx10.19 on x86_64 (Homebrew)')
            );
          mockVersionProcess.on.mock.calls
            .find(call => call[0] === 'close')?.[1]?.(0);
        }, 10);
      }
      return mockVersionProcess as any;
    });

    // Test internal version detection method
    const detectVersion = (runtime as any).detectMySQLVersion.bind(runtime);
    const version = await detectVersion();
    
    expect(version).toEqual({
      major: 9,
      minor: 2,
      patch: 0
    });
  });

  it('should create wrapper script for MySQL 9.x on macOS', async () => {
    // Set platform to macOS
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true
    });

    // Mock environment
    process.env.USER = 'testuser';

    // Mock MySQL processes
    const mockMySQLProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill: vi.fn(),
      pid: 1234,
      killed: false
    };

    const mockPHPProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill: vi.fn(),
      pid: 5678,
      killed: false
    };

    mockSpawn.mockImplementation((command, args) => {
      if (command.includes('mysqld') && args?.includes('--version')) {
        // MySQL version check
        setTimeout(() => {
          mockMySQLProcess.stdout.on.mock.calls
            .find(call => call[0] === 'data')?.[1]?.(
              Buffer.from('mysqld  Ver 9.2.0 for osx10.19 on x86_64 (Homebrew)')
            );
          mockMySQLProcess.on.mock.calls
            .find(call => call[0] === 'close')?.[1]?.(0);
        }, 10);
        return mockMySQLProcess as any;
      } else if (command.includes('mysql-wrapper.sh')) {
        // MySQL server start with wrapper
        return mockMySQLProcess as any;
      } else if (command.includes('mysql')) {
        // MySQL client commands
        setTimeout(() => {
          mockMySQLProcess.on.mock.calls
            .find(call => call[0] === 'close')?.[1]?.(0);
        }, 10);
        return mockMySQLProcess as any;
      } else if (command.includes('php')) {
        // PHP server
        return mockPHPProcess as any;
      }
      return mockMySQLProcess as any;
    });

    // Start WordPress
    await runtime.start('test-app', '/test/path');

    // Verify wrapper script was created
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('mysql-wrapper.sh'),
      expect.stringContaining('MySQL 9.x wrapper for macOS'),
      'utf8'
    );

    // Verify wrapper script was made executable
    expect(mockFs.chmod).toHaveBeenCalledWith(
      expect.stringContaining('mysql-wrapper.sh'),
      0o755
    );

    // Verify MySQL was started with wrapper
    const spawnCalls = mockSpawn.mock.calls;
    const mysqlStartCall = spawnCalls.find(call => 
      call[0].includes('mysql-wrapper.sh') && 
      call[1].includes('--datadir')
    );
    expect(mysqlStartCall).toBeTruthy();
  });

  it('should not use wrapper for MySQL 8.x', async () => {
    // Set platform to macOS
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true
    });

    process.env.USER = 'testuser';

    // Mock MySQL 8.x version
    const mockMySQLProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill: vi.fn(),
      pid: 1234,
      killed: false
    };

    mockSpawn.mockImplementation((command, args) => {
      if (args?.includes('--version')) {
        setTimeout(() => {
          mockMySQLProcess.stdout.on.mock.calls
            .find(call => call[0] === 'data')?.[1]?.(
              Buffer.from('mysqld  Ver 8.0.33 for Linux on x86_64 (MySQL Community Server - GPL)')
            );
          mockMySQLProcess.on.mock.calls
            .find(call => call[0] === 'close')?.[1]?.(0);
        }, 10);
      }
      return mockMySQLProcess as any;
    });

    await runtime.start('test-app', '/test/path');

    // Verify wrapper script was NOT created
    expect(mockFs.writeFile).not.toHaveBeenCalledWith(
      expect.stringContaining('mysql-wrapper.sh'),
      expect.any(String),
      expect.any(String)
    );

    // Verify MySQL was started with --user parameter
    const spawnCalls = mockSpawn.mock.calls;
    const mysqlStartCall = spawnCalls.find(call => 
      call[0].includes('mysqld') && 
      call[1].includes('--datadir') &&
      !call[0].includes('wrapper')
    );
    expect(mysqlStartCall?.[1]).toContain('--user=testuser');
  });

  it('should handle initialization correctly for MySQL 9.x on macOS', async () => {
    // Set platform to macOS
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true
    });

    process.env.USER = 'testuser';

    // Mock MySQL initialization
    const mockInitProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill: vi.fn(),
      pid: 1234,
      killed: false
    };

    mockSpawn.mockImplementation((command, args) => {
      if (args?.includes('--initialize-insecure')) {
        // Verify no --user parameter for MySQL 9.x on macOS
        expect(args).not.toContain('--user=testuser');
        
        setTimeout(() => {
          mockInitProcess.on.mock.calls
            .find(call => call[0] === 'close')?.[1]?.(0);
        }, 10);
      }
      return mockInitProcess as any;
    });

    // Call initialization directly
    const initMethod = (runtime as any).initializeMySQL.bind(runtime);
    
    // Mock version detection to return 9.x
    (runtime as any).detectMySQLVersion = vi.fn().mockResolvedValue({
      major: 9,
      minor: 2,
      patch: 0
    });

    await initMethod('/test/path', 3306);

    // Verify initialization was called without --user parameter
    const initCall = mockSpawn.mock.calls.find(call => 
      call[1].includes('--initialize-insecure')
    );
    expect(initCall?.[1]).not.toContain('--user=testuser');
  });

  // Restore platform after tests
  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      configurable: true
    });
  });
});