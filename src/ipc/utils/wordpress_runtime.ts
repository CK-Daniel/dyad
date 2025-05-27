import { ChildProcess, spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import log from 'electron-log';
import treeKill from 'tree-kill';
import { 
  getWordPressBinaryPath, 
  getMySQLDataDir, 
  getWordPressDir,
  initializeMySQLDataDir,
  createWpConfig,
  createPHPConfig,
  getPHPIniPath,
  allocateWordPressPorts,
  checkWordPressBinaries
} from './wordpress_binary_utils';
import { checkPortInUse } from './port_utils';
import { setupWordPressCore, createDefaultTheme } from './wordpress_core_utils';

const logger = log.scope('wordpress-runtime');

export interface WordPressProcess {
  mysql: ChildProcess;
  php: ChildProcess;
  mysqlPort: number;
  phpPort: number;
  appPath: string;
}

export class WordPressRuntime {
  private processes: Map<string, WordPressProcess> = new Map();

  /**
   * Start WordPress environment for an app
   */
  async start(appId: string, appPath: string): Promise<{
    phpPort: number;
    mysqlPort: number;
  }> {
    logger.info(`Starting WordPress for app ${appId} at ${appPath}`);

    // Check if already running
    if (this.processes.has(appId)) {
      const existing = this.processes.get(appId)!;
      logger.info(`WordPress already running for ${appId} on ports PHP:${existing.phpPort}, MySQL:${existing.mysqlPort}`);
      return {
        phpPort: existing.phpPort,
        mysqlPort: existing.mysqlPort
      };
    }

    // Check binaries
    const { available, missing } = await checkWordPressBinaries();
    if (!available) {
      throw new Error(`Missing WordPress binaries: ${missing.join(', ')}. Please ensure WordPress runtime is installed.`);
    }

    // Allocate ports
    const { phpPort, mysqlPort } = await allocateWordPressPorts();

    // Ensure ports are available
    if (await checkPortInUse(phpPort)) {
      throw new Error(`PHP port ${phpPort} is already in use`);
    }
    if (await checkPortInUse(mysqlPort)) {
      throw new Error(`MySQL port ${mysqlPort} is already in use`);
    }

    try {
      // Initialize MySQL data directory if needed
      const dataDir = getMySQLDataDir(appPath);
      const dataDirExists = await fs.access(dataDir).then(() => true).catch(() => false);
      
      if (!dataDirExists) {
        logger.info(`MySQL data directory does not exist at ${dataDir}. Initializing...`);
        await initializeMySQLDataDir(appPath);
        
        try {
          await this.initializeMySQL(appPath, mysqlPort);
        } catch (error) {
          logger.error('MySQL initialization failed:', error);
          // On macOS, sometimes we need to clean up and retry
          if (process.platform === 'darwin') {
            logger.info('Attempting to clean up and retry MySQL initialization on macOS...');
            const fs = require('fs').promises;
            try {
              await fs.rm(dataDir, { recursive: true, force: true });
              await initializeMySQLDataDir(appPath);
              await this.initializeMySQL(appPath, mysqlPort);
            } catch (retryError) {
              throw new Error(`MySQL initialization failed after retry: ${retryError}`);
            }
          } else {
            throw error;
          }
        }
      }

      // Start MySQL
      const mysql = await this.startMySQL(appPath, mysqlPort);
      
      // Create WordPress config if needed
      const wpConfigPath = path.join(appPath, 'wp-config.php');
      const wpConfigExists = await fs.access(wpConfigPath).then(() => true).catch(() => false);
      
      if (!wpConfigExists) {
        await createWpConfig(appPath, mysqlPort);
      }

      // Create PHP config
      await createPHPConfig(appPath, phpPort);

      // Setup WordPress core files if needed
      await setupWordPressCore(appPath);
      
      // Create default theme if needed
      await createDefaultTheme(appPath);

      // Start PHP
      const php = await this.startPHP(appPath, phpPort);

      // Store process info
      const processInfo: WordPressProcess = {
        mysql,
        php,
        mysqlPort,
        phpPort,
        appPath
      };
      
      this.processes.set(appId, processInfo);

      logger.info(`WordPress started successfully for ${appId} - PHP:${phpPort}, MySQL:${mysqlPort}`);
      
      return { phpPort, mysqlPort };
    } catch (error) {
      logger.error('Failed to start WordPress:', error);
      // Clean up any started processes
      await this.stop(appId);
      throw error;
    }
  }

  /**
   * Initialize MySQL database
   */
  private async initializeMySQL(appPath: string, _port: number): Promise<void> {
    logger.info('Initializing MySQL database...');
    
    const mysqldPath = getWordPressBinaryPath('mysqld');
    const dataDir = getMySQLDataDir(appPath);
    
    // Detect MySQL version to determine appropriate initialization parameters
    const mysqlVersion = await this.detectMySQLVersion();
    
    // Build initialization arguments based on version
    const initArgs = [
      '--initialize-insecure',
      `--datadir=${dataDir}`,
      '--explicit_defaults_for_timestamp',
      '--log-error-verbosity=3'
    ];
    
    // Handle MySQL 9.x initialization on macOS
    if (process.platform === 'darwin' && mysqlVersion?.major >= 9) {
      // MySQL 9.x on macOS needs special handling
      // The initialization doesn't need user parameter as it's run differently
      logger.info('MySQL 9.x on macOS - using special initialization');
    } else if (process.platform !== 'win32') {
      // For other Unix systems
      const currentUser = process.env.USER || process.env.USERNAME;
      if (currentUser && currentUser !== 'root') {
        initArgs.push(`--user=${currentUser}`);
      }
    }
    
    // Add version-specific initialization parameters
    if (mysqlVersion) {
      logger.info(`MySQL ${mysqlVersion.major}.${mysqlVersion.minor} detected for initialization`);
      
      if (mysqlVersion.major >= 9) {
        // MySQL 9.x: NEVER use default-authentication-plugin
        logger.info(`MySQL ${mysqlVersion.major}.${mysqlVersion.minor} - using modern initialization without deprecated options`);
      } else if (mysqlVersion.major === 8 && mysqlVersion.minor > 0) {
        // MySQL 8.1+: avoid deprecated options
        logger.info(`MySQL 8.${mysqlVersion.minor} - using modern initialization`);
      } else if (mysqlVersion.major === 8 && mysqlVersion.minor === 0) {
        // MySQL 8.0.x can use default-authentication-plugin during initialization
        logger.info(`MySQL 8.0.x - using default-authentication-plugin for initialization`);
        initArgs.push('--default-authentication-plugin=mysql_native_password');
      }
    } else {
      logger.warn('Could not detect MySQL version for initialization - using safe defaults');
    }
    
    // Run mysql_install_db or equivalent initialization
    const initProcess = spawn(mysqldPath, initArgs, {
      cwd: appPath,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';
      const timeout = setTimeout(() => {
        initProcess.kill();
        reject(new Error('MySQL initialization timed out after 60 seconds'));
      }, 60000);
      
      initProcess.stdout?.on('data', (data) => {
        output += data.toString();
        logger.debug('MySQL init output:', data.toString());
      });
      
      initProcess.stderr?.on('data', (data) => {
        errorOutput += data.toString();
        logger.debug('MySQL init stderr:', data.toString());
      });

      initProcess.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          logger.info('MySQL initialized successfully');
          resolve();
        } else {
          logger.error('MySQL initialization failed with code:', code);
          logger.error('MySQL init output:', output);
          logger.error('MySQL init stderr:', errorOutput);
          reject(new Error(`MySQL initialization failed with code ${code}: ${errorOutput}`));
        }
      });

      initProcess.on('error', (error) => {
        clearTimeout(timeout);
        logger.error('Failed to spawn MySQL initialization process:', error);
        reject(new Error(`Failed to start MySQL initialization: ${error.message}`));
      });
    });
  }

  /**
   * Detect MySQL version
   */
  private async detectMySQLVersion(): Promise<{ major: number; minor: number; patch: number } | null> {
    const mysqldPath = getWordPressBinaryPath('mysqld');
    
    try {
      const versionProcess = spawn(mysqldPath, ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      const output = await new Promise<string>((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        
        versionProcess.stdout?.on('data', (data) => {
          stdout += data.toString();
        });
        
        versionProcess.stderr?.on('data', (data) => {
          stderr += data.toString();
        });
        
        versionProcess.on('close', (code) => {
          if (code === 0) {
            resolve(stdout);
          } else {
            reject(new Error(`Failed to get MySQL version: ${stderr}`));
          }
        });
        
        versionProcess.on('error', (error) => {
          reject(error);
        });
      });

      // Parse version from output like "mysqld  Ver 8.0.33 for Linux on x86_64 (MySQL Community Server - GPL)"
      // or "mysqld  Ver 9.2.0 for osx10.19 on x86_64 (Homebrew)"
      const versionMatch = output.match(/Ver\s+(\d+)\.(\d+)\.(\d+)/);
      if (versionMatch) {
        const [, major, minor, patch] = versionMatch;
        const version = {
          major: parseInt(major, 10),
          minor: parseInt(minor, 10),
          patch: parseInt(patch, 10)
        };
        logger.info(`Detected MySQL version: ${major}.${minor}.${patch}`);
        logger.info(`Full MySQL version output: ${output}`);
        return version;
      }
      
      logger.warn('Could not parse MySQL version from output:', output);
      return null;
    } catch (error) {
      logger.error('Error detecting MySQL version:', error);
      return null;
    }
  }

  /**
   * Start MySQL server
   */
  private async startMySQL(appPath: string, port: number): Promise<ChildProcess> {
    const mysqldPath = getWordPressBinaryPath('mysqld');
    const dataDir = getMySQLDataDir(appPath);
    
    logger.info(`Starting MySQL on port ${port}...`);
    
    // Detect MySQL version to determine appropriate parameters
    const mysqlVersion = await this.detectMySQLVersion();
    
    // Build MySQL arguments based on version
    const mysqlArgs = [
      `--datadir=${dataDir}`,
      `--port=${port}`,
      '--bind-address=127.0.0.1',
      '--skip-networking=0',
      '--console',
      '--log-error-verbosity=3'
    ];
    
    // Handle MySQL user parameter based on platform and version
    if (process.platform !== 'win32') {
      const currentUser = process.env.USER || process.env.USERNAME;
      
      // MySQL 9.x on macOS has strict security - it refuses to run as root
      // and doesn't need --user parameter when already running as non-root
      if (process.platform === 'darwin' && mysqlVersion && mysqlVersion.major >= 9) {
        if (currentUser === 'root') {
          logger.error('MySQL 9.x on macOS cannot run as root user');
          throw new Error('MySQL 9.x on macOS cannot run as root. Please run Dyad as a normal user.');
        }
        // Don't add --user parameter for MySQL 9.x on macOS when running as non-root
        logger.info(`MySQL 9.x on macOS - running as user: ${currentUser}`);
      } else if (currentUser && currentUser !== 'root') {
        // For other Unix systems or older MySQL versions, add --user parameter
        mysqlArgs.push(`--user=${currentUser}`);
      }
    }
    
    // Add version-specific parameters
    if (mysqlVersion) {
      logger.info(`MySQL version detected: ${mysqlVersion.major}.${mysqlVersion.minor}.${mysqlVersion.patch}`);
      
      // CRITICAL: MySQL 9.x does NOT support default-authentication-plugin at all
      if (mysqlVersion.major >= 9) {
        logger.info(`MySQL ${mysqlVersion.major}.${mysqlVersion.minor} detected - this version does not support default-authentication-plugin`);
        // Do NOT add any authentication plugin parameters
      } else if (mysqlVersion.major === 8 && mysqlVersion.minor >= 1) {
        // MySQL 8.1+ deprecated default-authentication-plugin
        logger.info(`MySQL 8.${mysqlVersion.minor} detected - avoiding deprecated authentication parameters`);
        // Do NOT add any authentication plugin parameters
      } else if (mysqlVersion.major === 8 && mysqlVersion.minor === 0) {
        // ONLY MySQL 8.0.x still supports default-authentication-plugin
        logger.info(`MySQL 8.0.x detected - using default-authentication-plugin`);
        mysqlArgs.push('--default-authentication-plugin=mysql_native_password');
      } else if (mysqlVersion.major < 8) {
        // MySQL 5.7 and earlier - no special authentication handling needed
        logger.info(`MySQL ${mysqlVersion.major}.${mysqlVersion.minor} detected - using legacy configuration`);
      }
    } else {
      // If we couldn't detect version, assume modern MySQL (9.x) and avoid deprecated options
      logger.warn('Could not detect MySQL version - assuming MySQL 9.x and avoiding deprecated parameters');
    }
    
    const mysql = spawn(mysqldPath, mysqlArgs, {
      cwd: appPath,
      env: { ...process.env },
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let mysqlOutput = '';
    let mysqlError = '';

    // Log MySQL output
    mysql.stdout?.on('data', (data) => {
      const output = data.toString();
      mysqlOutput += output;
      logger.debug('MySQL:', output);
    });

    mysql.stderr?.on('data', (data) => {
      const error = data.toString();
      mysqlError += error;
      logger.debug('MySQL error:', error);
      
      // Check for common issues
      if (error.includes('Permission denied')) {
        logger.error('MySQL permission error - check file permissions in:', dataDir);
      } else if (error.includes('Another process with pid')) {
        logger.error('MySQL already running - port conflict on:', port);
      } else if (error.includes('Can\'t create/write to file')) {
        logger.error('MySQL cannot write to data directory:', dataDir);
      }
    });

    mysql.on('error', (error) => {
      logger.error('MySQL process error:', error);
      logger.error('MySQL stdout:', mysqlOutput);
      logger.error('MySQL stderr:', mysqlError);
    });

    mysql.on('exit', (code, signal) => {
      logger.info(`MySQL process exited with code ${code} and signal ${signal}`);
      if (code !== 0 && code !== null) {
        logger.error('MySQL failed to start. Last output:', mysqlOutput);
        logger.error('MySQL failed to start. Last error:', mysqlError);
      }
    });

    // Wait for MySQL to be ready
    await this.waitForMySQL(port);
    
    // Create WordPress database if it doesn't exist
    await this.createWordPressDatabase(port);
    
    return mysql;
  }

  /**
   * Wait for MySQL to be ready
   */
  private async waitForMySQL(port: number, maxAttempts = 60): Promise<void> {
    const mysqlPath = getWordPressBinaryPath('mysql');
    
    logger.info(`Waiting for MySQL to start on port ${port} (up to ${maxAttempts} seconds)...`);
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const testProcess = spawn(mysqlPath, [
          '-h', '127.0.0.1',
          '-P', port.toString(),
          '-u', 'root',
          '-e', 'SELECT 1'
        ], {
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let stderr = '';
        testProcess.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        const exitCode = await new Promise<number>((resolve) => {
          testProcess.on('close', resolve);
        });

        if (exitCode === 0) {
          logger.info('MySQL is ready');
          return;
        }
        
        // Log progress every 5 seconds
        if (i > 0 && i % 5 === 0) {
          logger.info(`Still waiting for MySQL... (${i}/${maxAttempts} seconds)`);
        }
        
        // Log specific errors that might help diagnose issues
        if (stderr.includes('ERROR') && i === maxAttempts - 1) {
          logger.error('MySQL connection error:', stderr);
        }
      } catch (error) {
        // Ignore connection errors while waiting
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error(`MySQL failed to start within ${maxAttempts} seconds on port ${port}`);
  }

  /**
   * Create WordPress database
   */
  private async createWordPressDatabase(port: number): Promise<void> {
    const mysqlPath = getWordPressBinaryPath('mysql');
    
    // First, create the database
    const createDbProcess = spawn(mysqlPath, [
      '-h', '127.0.0.1',
      '-P', port.toString(),
      '-u', 'root',
      '-e', 'CREATE DATABASE IF NOT EXISTS wordpress CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'
    ]);

    const exitCode = await new Promise<number>((resolve, reject) => {
      createDbProcess.on('close', resolve);
      createDbProcess.on('error', reject);
    });

    if (exitCode !== 0) {
      throw new Error('Failed to create WordPress database');
    }

    logger.info('WordPress database created successfully');
    
    // Detect MySQL version to determine if authentication adjustment is needed
    const mysqlVersion = await this.detectMySQLVersion();
    
    // For MySQL 8.0+ and 9.x, ensure root user uses mysql_native_password
    // This is needed for WordPress compatibility
    if (mysqlVersion && mysqlVersion.major >= 8) {
      try {
        // For MySQL 8.x and 9.x, we need to handle authentication properly
        // First try to alter the user with the appropriate syntax
        let alterUserQuery: string;
        
        if (mysqlVersion.major === 8 && mysqlVersion.minor === 0) {
          // MySQL 8.0.x syntax
          alterUserQuery = "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY ''; FLUSH PRIVILEGES;";
        } else {
          // MySQL 8.1+ and 9.x might require different handling
          // Try the standard ALTER USER command first
          alterUserQuery = "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY ''; FLUSH PRIVILEGES;";
        }
        
        const alterUserProcess = spawn(mysqlPath, [
          '-h', '127.0.0.1',
          '-P', port.toString(),
          '-u', 'root',
          '-e', alterUserQuery
        ]);

        const alterExitCode = await new Promise<number>((resolve, reject) => {
          alterUserProcess.on('close', resolve);
          alterUserProcess.on('error', reject);
        });

        if (alterExitCode === 0) {
          logger.info(`MySQL ${mysqlVersion.major}.${mysqlVersion.minor} root user authentication method updated for WordPress compatibility`);
        } else {
          // If the first attempt failed, try alternative approach for newer versions
          if (mysqlVersion.major > 8 || (mysqlVersion.major === 8 && mysqlVersion.minor > 0)) {
            logger.info('Trying alternative authentication setup for newer MySQL version');
            
            // For very new versions, the plugin might not exist or syntax might be different
            // Try creating a new user specifically for WordPress if root user modification fails
            const createWpUserProcess = spawn(mysqlPath, [
              '-h', '127.0.0.1',
              '-P', port.toString(),
              '-u', 'root',
              '-e', "CREATE USER IF NOT EXISTS 'wordpress'@'localhost' IDENTIFIED WITH mysql_native_password BY ''; GRANT ALL PRIVILEGES ON wordpress.* TO 'wordpress'@'localhost'; FLUSH PRIVILEGES;"
            ]);

            const wpUserExitCode = await new Promise<number>((resolve, reject) => {
              createWpUserProcess.on('close', resolve);
              createWpUserProcess.on('error', reject);
            });

            if (wpUserExitCode === 0) {
              logger.info('Created dedicated WordPress user with mysql_native_password authentication');
            } else {
              logger.warn('Failed to create WordPress user, continuing with root user');
            }
          } else {
            logger.warn('Failed to update MySQL root user authentication method, continuing anyway');
          }
        }
      } catch (error) {
        logger.warn('Error updating MySQL authentication:', error);
        // Continue anyway as WordPress might still work with default authentication
      }
    } else if (!mysqlVersion) {
      logger.info('MySQL version unknown - skipping authentication adjustments');
    } else {
      logger.info(`MySQL ${mysqlVersion.major}.${mysqlVersion.minor} detected - no authentication adjustments needed`);
    }
  }

  /**
   * Start PHP built-in server
   */
  private async startPHP(appPath: string, port: number): Promise<ChildProcess> {
    const phpPath = getWordPressBinaryPath('php');
    const phpIniPath = getPHPIniPath(appPath);
    const wordpressDir = getWordPressDir(appPath);
    
    logger.info(`Starting PHP server on port ${port}...`);
    
    // Ensure WordPress directory exists
    await fs.mkdir(wordpressDir, { recursive: true });
    
    const php = spawn(phpPath, [
      '-c', phpIniPath,
      '-S', `127.0.0.1:${port}`,
      '-t', wordpressDir
    ], {
      cwd: wordpressDir,
      env: { ...process.env },
      detached: false
    });

    // Log PHP output
    php.stdout?.on('data', (data) => {
      logger.debug('PHP:', data.toString());
    });

    php.stderr?.on('data', (data) => {
      const message = data.toString();
      // PHP built-in server logs all requests to stderr
      if (message.includes('Started') || message.includes('Listening')) {
        logger.info('PHP server started successfully');
      } else {
        logger.debug('PHP:', message);
      }
    });

    php.on('error', (error) => {
      logger.error('PHP process error:', error);
    });

    php.on('exit', (code, signal) => {
      logger.info(`PHP process exited with code ${code} and signal ${signal}`);
    });

    // Give PHP server time to start
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return php;
  }

  /**
   * Stop WordPress environment for an app
   */
  async stop(appId: string): Promise<void> {
    logger.info(`Stopping WordPress for app ${appId}`);
    
    const processInfo = this.processes.get(appId);
    if (!processInfo) {
      logger.warn(`No WordPress processes found for app ${appId}`);
      return;
    }

    const { mysql, php } = processInfo;

    // Stop PHP server
    if (php && !php.killed) {
      try {
        await new Promise<void>((resolve, reject) => {
          treeKill(php.pid!, 'SIGTERM', (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        logger.info('PHP server stopped');
      } catch (error) {
        logger.error('Error stopping PHP:', error);
      }
    }

    // Stop MySQL server
    if (mysql && !mysql.killed) {
      try {
        // Try graceful shutdown first
        const mysqlPath = getWordPressBinaryPath('mysql');
        const shutdownProcess = spawn(mysqlPath, [
          '-h', '127.0.0.1',
          '-P', processInfo.mysqlPort.toString(),
          '-u', 'root',
          '-e', 'SHUTDOWN;'
        ]);

        await new Promise((resolve) => {
          shutdownProcess.on('close', resolve);
          // Fallback to tree-kill after timeout
          setTimeout(() => {
            if (!mysql.killed) {
              treeKill(mysql.pid!, 'SIGTERM', () => {
                resolve(null);
              });
            }
          }, 5000);
        });
        
        logger.info('MySQL server stopped');
      } catch (error) {
        logger.error('Error stopping MySQL:', error);
      }
    }

    // Remove from process map
    this.processes.delete(appId);
  }

  /**
   * Stop all WordPress processes
   */
  async stopAll(): Promise<void> {
    logger.info('Stopping all WordPress processes...');
    
    const stopPromises = Array.from(this.processes.keys()).map(appId => 
      this.stop(appId).catch(err => 
        logger.error(`Error stopping WordPress for ${appId}:`, err)
      )
    );
    
    await Promise.all(stopPromises);
    this.processes.clear();
  }

  /**
   * Get running WordPress processes
   */
  getRunningProcesses(): Map<string, { phpPort: number; mysqlPort: number }> {
    const result = new Map<string, { phpPort: number; mysqlPort: number }>();
    
    this.processes.forEach((process, appId) => {
      result.set(appId, {
        phpPort: process.phpPort,
        mysqlPort: process.mysqlPort
      });
    });
    
    return result;
  }

  /**
   * Check if WordPress is running for an app
   */
  isRunning(appId: string): boolean {
    return this.processes.has(appId);
  }
}

// Export singleton instance
export const wordpressRuntime = new WordPressRuntime();