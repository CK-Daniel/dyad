import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';

const exec = promisify(execCallback);

describe('MySQL 9.x Startup Tests', () => {
  const testDataDir = path.join(process.cwd(), 'test-mysql-data');
  let mysqlProcess: any = null;
  const testPort = 3307; // Use non-standard port to avoid conflicts

  beforeAll(async () => {
    // Clean up any existing test data
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore if doesn't exist
    }
    
    // Create test data directory
    await fs.mkdir(testDataDir, { recursive: true });
  });

  afterAll(async () => {
    // Kill MySQL process if running
    if (mysqlProcess && !mysqlProcess.killed) {
      mysqlProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Clean up test data
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore
    }
  });

  it('should detect MySQL version correctly', async () => {
    const { stdout } = await exec('mysqld --version');
    console.log('MySQL version output:', stdout);
    
    const versionMatch = stdout.match(/Ver\s+(\d+)\.(\d+)\.(\d+)/);
    expect(versionMatch).toBeTruthy();
    
    if (versionMatch) {
      const [, major, minor, patch] = versionMatch;
      console.log(`Detected MySQL ${major}.${minor}.${patch}`);
      expect(parseInt(major)).toBeGreaterThanOrEqual(8);
    }
  });

  it('should check current user is not root', async () => {
    const { stdout: currentUser } = await exec('whoami');
    console.log('Current user:', currentUser.trim());
    expect(currentUser.trim()).not.toBe('root');
  });

  it('should initialize MySQL data directory without --user flag for MySQL 9.x on macOS', async () => {
    // Detect MySQL version
    const { stdout: versionOutput } = await exec('mysqld --version');
    const versionMatch = versionOutput.match(/Ver\s+(\d+)\.(\d+)\.(\d+)/);
    
    if (!versionMatch) {
      throw new Error('Could not detect MySQL version');
    }
    
    const [, major] = versionMatch;
    const mysqlMajor = parseInt(major);
    
    // Build initialization command
    const initArgs = [
      '--initialize-insecure',
      `--datadir=${testDataDir}`,
      '--log-error-verbosity=3'
    ];
    
    // Critical: Do NOT add --user flag for MySQL 9.x on macOS
    if (process.platform !== 'darwin' || mysqlMajor < 9) {
      const currentUser = process.env.USER || process.env.USERNAME;
      if (currentUser && currentUser !== 'root') {
        initArgs.push(`--user=${currentUser}`);
      }
    }
    
    console.log('Initialization args:', initArgs);
    
    // Run initialization
    const initProcess = spawn('mysqld', initArgs, {
      stdio: 'pipe'
    });
    
    let stderr = '';
    initProcess.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    const exitCode = await new Promise<number>((resolve) => {
      initProcess.on('close', resolve);
    });
    
    console.log('Init stderr:', stderr);
    expect(exitCode).toBe(0);
  }, 30000);

  it('should start MySQL 9.x on macOS without --user flag', async () => {
    // Detect MySQL version
    const { stdout: versionOutput } = await exec('mysqld --version');
    const versionMatch = versionOutput.match(/Ver\s+(\d+)\.(\d+)\.(\d+)/);
    
    if (!versionMatch) {
      throw new Error('Could not detect MySQL version');
    }
    
    const [, major] = versionMatch;
    const mysqlMajor = parseInt(major);
    
    // Build startup arguments
    const mysqlArgs = [
      `--datadir=${testDataDir}`,
      `--port=${testPort}`,
      '--bind-address=127.0.0.1',
      '--skip-networking=0',
      '--console',
      '--log-error-verbosity=3'
    ];
    
    // For MySQL 9.x on macOS, we need to handle this differently
    if (process.platform === 'darwin' && mysqlMajor >= 9) {
      console.log('MySQL 9.x on macOS detected - NOT adding --user flag');
      // Create a minimal config file to work around the root check
      const configPath = path.join(testDataDir, 'my.cnf');
      const configContent = `[mysqld]
# Minimal config for MySQL 9.x on macOS
pid-file=${testDataDir}/mysqld.pid
socket=${testDataDir}/mysql.sock
`;
      await fs.writeFile(configPath, configContent);
      mysqlArgs.unshift(`--defaults-file=${configPath}`);
    } else if (process.platform !== 'win32') {
      const currentUser = process.env.USER || process.env.USERNAME;
      if (currentUser && currentUser !== 'root') {
        mysqlArgs.push(`--user=${currentUser}`);
      }
    }
    
    console.log('MySQL startup args:', mysqlArgs);
    
    // Start MySQL
    mysqlProcess = spawn('mysqld', mysqlArgs, {
      stdio: 'pipe'
    });
    
    let stderr = '';
    mysqlProcess.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      stderr += output;
      console.log('MySQL stderr:', output);
    });
    
    mysqlProcess.on('error', (error: Error) => {
      console.error('MySQL process error:', error);
    });
    
    // Wait for MySQL to start
    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        const testProcess = spawn('mysql', [
          '-h', '127.0.0.1',
          '-P', testPort.toString(),
          '-u', 'root',
          '-e', 'SELECT 1'
        ], { stdio: 'pipe' });
        
        const exitCode = await new Promise<number>((resolve) => {
          testProcess.on('close', resolve);
        });
        
        if (exitCode === 0) {
          connected = true;
          break;
        }
      } catch (e) {
        // Ignore
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    expect(connected).toBe(true);
    expect(stderr).not.toContain('Fatal error: Please read "Security" section');
  }, 60000);

  it('should test alternative MySQL 9.x startup method with sudo wrapper', async () => {
    // This test explores using a wrapper script for MySQL 9.x
    const wrapperPath = path.join(testDataDir, 'mysql-wrapper.sh');
    const wrapperContent = `#!/bin/bash
# MySQL 9.x wrapper for macOS
exec mysqld "$@"
`;
    
    await fs.writeFile(wrapperPath, wrapperContent);
    await fs.chmod(wrapperPath, 0o755);
    
    console.log('Created wrapper script at:', wrapperPath);
    
    // Test that the wrapper works
    const { stdout } = await exec(`${wrapperPath} --version`);
    expect(stdout).toContain('mysqld');
  });
});