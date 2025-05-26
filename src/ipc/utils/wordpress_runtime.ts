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
        await initializeMySQLDataDir(appPath);
        await this.initializeMySQL(appPath, mysqlPort);
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
  private async initializeMySQL(appPath: string, port: number): Promise<void> {
    logger.info('Initializing MySQL database...');
    
    const mysqldPath = getWordPressBinaryPath('mysqld');
    const dataDir = getMySQLDataDir(appPath);
    
    // Run mysql_install_db or equivalent initialization
    const initProcess = spawn(mysqldPath, [
      '--initialize-insecure',
      `--datadir=${dataDir}`,
      '--explicit_defaults_for_timestamp'
    ], {
      cwd: appPath,
      env: { ...process.env }
    });

    return new Promise((resolve, reject) => {
      let errorOutput = '';
      
      initProcess.stderr?.on('data', (data) => {
        errorOutput += data.toString();
        logger.debug('MySQL init:', data.toString());
      });

      initProcess.on('close', (code) => {
        if (code === 0) {
          logger.info('MySQL initialized successfully');
          resolve();
        } else {
          reject(new Error(`MySQL initialization failed: ${errorOutput}`));
        }
      });

      initProcess.on('error', (error) => {
        reject(new Error(`Failed to start MySQL initialization: ${error.message}`));
      });
    });
  }

  /**
   * Start MySQL server
   */
  private async startMySQL(appPath: string, port: number): Promise<ChildProcess> {
    const mysqldPath = getWordPressBinaryPath('mysqld');
    const dataDir = getMySQLDataDir(appPath);
    
    logger.info(`Starting MySQL on port ${port}...`);
    
    const mysql = spawn(mysqldPath, [
      `--datadir=${dataDir}`,
      `--port=${port}`,
      '--bind-address=127.0.0.1',
      '--skip-networking=0',
      '--default-authentication-plugin=mysql_native_password',
      '--console'
    ], {
      cwd: appPath,
      env: { ...process.env },
      detached: false
    });

    // Log MySQL output
    mysql.stdout?.on('data', (data) => {
      logger.debug('MySQL:', data.toString());
    });

    mysql.stderr?.on('data', (data) => {
      logger.debug('MySQL error:', data.toString());
    });

    mysql.on('error', (error) => {
      logger.error('MySQL process error:', error);
    });

    mysql.on('exit', (code, signal) => {
      logger.info(`MySQL process exited with code ${code} and signal ${signal}`);
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
  private async waitForMySQL(port: number, maxAttempts = 30): Promise<void> {
    const mysqlPath = getWordPressBinaryPath('mysql');
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const testProcess = spawn(mysqlPath, [
          '-h', '127.0.0.1',
          '-P', port.toString(),
          '-u', 'root',
          '-e', 'SELECT 1'
        ]);

        const exitCode = await new Promise<number>((resolve) => {
          testProcess.on('close', resolve);
        });

        if (exitCode === 0) {
          logger.info('MySQL is ready');
          return;
        }
      } catch (error) {
        // Ignore connection errors while waiting
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error('MySQL failed to start within timeout period');
  }

  /**
   * Create WordPress database
   */
  private async createWordPressDatabase(port: number): Promise<void> {
    const mysqlPath = getWordPressBinaryPath('mysql');
    
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