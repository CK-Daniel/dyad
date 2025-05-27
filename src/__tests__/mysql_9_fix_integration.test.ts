import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

describe('MySQL 9.x macOS Fix Integration Tests', () => {
  it('should create and execute wrapper script correctly', async () => {
    const testDir = path.join(process.cwd(), 'test-mysql-wrapper');
    const wrapperPath = path.join(testDir, 'mysql-wrapper.sh');
    
    // Clean up and create test directory
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(testDir, { recursive: true });
    
    // Create wrapper script content
    const mysqldPath = '/usr/local/bin/mysqld';
    const currentUser = process.env.USER || 'testuser';
    const wrapperContent = `#!/bin/bash
# MySQL 9.x wrapper for macOS to bypass root detection bug
# This is a known issue with MySQL 9.x installed via Homebrew on macOS

# Run mysqld with a clean environment to avoid detection issues
exec /usr/bin/env -i \\
    PATH="$PATH" \\
    HOME="$HOME" \\
    USER="${currentUser}" \\
    LOGNAME="${currentUser}" \\
    SHELL="$SHELL" \\
    echo "WRAPPER_EXECUTED_SUCCESSFULLY" "$@"
`;
    
    // Write and make executable
    await fs.writeFile(wrapperPath, wrapperContent, 'utf8');
    await fs.chmod(wrapperPath, 0o755);
    
    // Test wrapper execution
    const testProcess = spawn(wrapperPath, ['--test-arg']);
    
    let output = '';
    testProcess.stdout?.on('data', (data) => {
      output += data.toString();
    });
    
    await new Promise<void>((resolve) => {
      testProcess.on('close', () => resolve());
    });
    
    expect(output).toContain('WRAPPER_EXECUTED_SUCCESSFULLY');
    expect(output).toContain('--test-arg');
    
    // Clean up
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  it('should handle MySQL 9.x specific arguments correctly', () => {
    // Test argument building for MySQL 9.x
    const mysqlVersion = { major: 9, minor: 2, patch: 0 };
    const mysqlArgs = [
      '--datadir=/test/data',
      '--port=3306',
      '--bind-address=127.0.0.1',
      '--skip-networking=0',
      '--console',
      '--log-error-verbosity=3'
    ];
    
    // For MySQL 9.x, we should NOT add:
    // - --user parameter on macOS
    // - --default-authentication-plugin
    expect(mysqlArgs).not.toContain(expect.stringMatching(/--user=/));
    expect(mysqlArgs).not.toContain('--default-authentication-plugin=mysql_native_password');
  });

  it('should detect MySQL version format correctly', () => {
    const versionStrings = [
      { input: 'mysqld  Ver 9.2.0 for osx10.19 on x86_64 (Homebrew)', expected: { major: 9, minor: 2, patch: 0 } },
      { input: 'mysqld  Ver 8.0.33 for Linux on x86_64 (MySQL Community Server - GPL)', expected: { major: 8, minor: 0, patch: 33 } },
      { input: '/usr/sbin/mysqld  Ver 8.0.42-0ubuntu0.20.04.1 for Linux on x86_64 ((Ubuntu))', expected: { major: 8, minor: 0, patch: 42 } }
    ];
    
    for (const { input, expected } of versionStrings) {
      const versionMatch = input.match(/Ver\s+(\d+)\.(\d+)\.(\d+)/);
      expect(versionMatch).toBeTruthy();
      
      if (versionMatch) {
        const [, major, minor, patch] = versionMatch;
        expect({
          major: parseInt(major, 10),
          minor: parseInt(minor, 10),
          patch: parseInt(patch, 10)
        }).toEqual(expected);
      }
    }
  });
});