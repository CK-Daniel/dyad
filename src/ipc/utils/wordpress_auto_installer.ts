import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { platform } from 'os';
import log from 'electron-log';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { app } from 'electron';
import https from 'https';

const execAsync = promisify(exec);
const logger = log.scope('wordpress-auto-installer');

export interface InstallationStatus {
  php: { installed: boolean; version?: string; path?: string };
  mysql: { installed: boolean; version?: string; path?: string };
  wpCli: { installed: boolean; version?: string; path?: string };
}

export interface InstallationResult {
  success: boolean;
  installed: string[];
  errors: string[];
  status: InstallationStatus;
}

/**
 * Check if a command exists on the system
 */
async function commandExists(command: string): Promise<{ exists: boolean; path?: string; version?: string }> {
  try {
    const which = require('which');
    const commandPath = which.sync(command);
    
    // Try to get version
    let version: string | undefined;
    try {
      const { stdout } = await execAsync(`${command} --version`);
      version = stdout.trim().split('\n')[0];
    } catch {
      // Version check failed, but command exists
    }
    
    return { exists: true, path: commandPath, version };
  } catch {
    return { exists: false };
  }
}

/**
 * Check current installation status of WordPress dependencies
 */
export async function checkInstallationStatus(): Promise<InstallationStatus> {
  logger.info('🔍 Checking WordPress dependencies installation status...');
  
  const phpCheck = await commandExists('php');
  const mysqlCheck = await commandExists('mysqld') || await commandExists('mysql') || await commandExists('mysql.server');
  const wpCliCheck = await commandExists('wp');
  
  const status: InstallationStatus = {
    php: {
      installed: phpCheck.exists,
      path: phpCheck.path,
      version: phpCheck.version
    },
    mysql: {
      installed: mysqlCheck.exists,
      path: mysqlCheck.path,
      version: mysqlCheck.version
    },
    wpCli: {
      installed: wpCliCheck.exists,
      path: wpCliCheck.path,
      version: wpCliCheck.version
    }
  };
  
  logger.info('📊 Installation Status:', {
    PHP: status.php.installed ? `✅ ${status.php.version}` : '❌ Not installed',
    MySQL: status.mysql.installed ? `✅ ${status.mysql.version}` : '❌ Not installed',
    'WP-CLI': status.wpCli.installed ? `✅ ${status.wpCli.version}` : '❌ Not installed'
  });
  
  return status;
}

/**
 * Install dependencies on Windows
 */
async function installOnWindows(missing: string[]): Promise<{ installed: string[]; errors: string[] }> {
  const installed: string[] = [];
  const errors: string[] = [];
  
  logger.info('🪟 Installing WordPress dependencies on Windows...');
  
  // Check if Chocolatey is installed
  const chocoExists = await commandExists('choco');
  if (!chocoExists.exists) {
    logger.info('📦 Installing Chocolatey package manager...');
    try {
      // Install Chocolatey
      const installChocolatey = `
        Set-ExecutionPolicy Bypass -Scope Process -Force;
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072;
        iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
      `;
      
      await new Promise<void>((resolve, reject) => {
        const child = spawn('powershell', ['-Command', installChocolatey], {
          stdio: 'pipe'
        });
        
        child.on('close', (code) => {
          if (code === 0) {
            logger.info('✅ Chocolatey installed successfully');
            resolve();
          } else {
            reject(new Error(`Chocolatey installation failed with code ${code}`));
          }
        });
        
        child.on('error', reject);
      });
    } catch (error) {
      logger.error('❌ Failed to install Chocolatey:', error);
      errors.push('Failed to install Chocolatey package manager');
      return { installed, errors };
    }
  }
  
  // Install missing dependencies
  for (const dependency of missing) {
    try {
      let packageName: string;
      
      switch (dependency) {
        case 'php':
          packageName = 'php';
          break;
        case 'mysql':
          packageName = 'mysql';
          break;
        case 'wp-cli':
          packageName = 'wp-cli';
          break;
        default:
          continue;
      }
      
      logger.info(`📦 Installing ${dependency} via Chocolatey...`);
      
      await new Promise<void>((resolve, reject) => {
        const child = spawn('choco', ['install', packageName, '-y'], {
          stdio: 'pipe'
        });
        
        let output = '';
        child.stdout?.on('data', (data) => {
          output += data.toString();
        });
        
        child.stderr?.on('data', (data) => {
          output += data.toString();
        });
        
        child.on('close', (code) => {
          if (code === 0) {
            logger.info(`✅ ${dependency} installed successfully`);
            installed.push(dependency);
            resolve();
          } else {
            logger.error(`❌ Failed to install ${dependency}:`, output);
            errors.push(`Failed to install ${dependency}: ${output}`);
            reject(new Error(`Installation failed with code ${code}`));
          }
        });
        
        child.on('error', reject);
      });
      
    } catch (error) {
      logger.error(`❌ Error installing ${dependency}:`, error);
      errors.push(`Error installing ${dependency}: ${error}`);
    }
  }
  
  return { installed, errors };
}

/**
 * Install dependencies on macOS
 */
async function installOnMac(missing: string[]): Promise<{ installed: string[]; errors: string[] }> {
  const installed: string[] = [];
  const errors: string[] = [];
  
  logger.info('🍎 Installing WordPress dependencies on macOS...');
  
  // Check if Homebrew is installed
  const brewExists = await commandExists('brew');
  if (!brewExists.exists) {
    logger.info('🍺 Installing Homebrew package manager...');
    try {
      const installHomebrew = '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';
      
      await new Promise<void>((resolve, reject) => {
        const child = spawn('/bin/bash', ['-c', installHomebrew], {
          stdio: 'pipe'
        });
        
        child.on('close', (code) => {
          if (code === 0) {
            logger.info('✅ Homebrew installed successfully');
            resolve();
          } else {
            reject(new Error(`Homebrew installation failed with code ${code}`));
          }
        });
        
        child.on('error', reject);
      });
    } catch (error) {
      logger.error('❌ Failed to install Homebrew:', error);
      errors.push('Failed to install Homebrew package manager');
      return { installed, errors };
    }
  }
  
  // Install missing dependencies
  for (const dependency of missing) {
    try {
      let packageName: string;
      let additionalCommands: string[] = [];
      
      switch (dependency) {
        case 'php':
          packageName = 'php';
          break;
        case 'mysql':
          packageName = 'mysql';
          additionalCommands = ['brew services start mysql'];
          break;
        case 'wp-cli':
          packageName = 'wp-cli';
          break;
        default:
          continue;
      }
      
      logger.info(`🍺 Installing ${dependency} via Homebrew...`);
      
      await new Promise<void>((resolve, reject) => {
        const child = spawn('brew', ['install', packageName], {
          stdio: 'pipe'
        });
        
        let output = '';
        child.stdout?.on('data', (data) => {
          output += data.toString();
        });
        
        child.stderr?.on('data', (data) => {
          output += data.toString();
        });
        
        child.on('close', (code) => {
          if (code === 0) {
            logger.info(`✅ ${dependency} installed successfully`);
            installed.push(dependency);
            resolve();
          } else {
            logger.error(`❌ Failed to install ${dependency}:`, output);
            errors.push(`Failed to install ${dependency}: ${output}`);
            reject(new Error(`Installation failed with code ${code}`));
          }
        });
        
        child.on('error', reject);
      });
      
      // Run additional commands if needed
      for (const command of additionalCommands) {
        try {
          logger.info(`🔧 Running additional command: ${command}`);
          await execAsync(command);
          logger.info(`✅ Command executed successfully: ${command}`);
        } catch (error) {
          logger.warn(`⚠️ Additional command failed (non-critical): ${command}`, error);
        }
      }
      
    } catch (error) {
      logger.error(`❌ Error installing ${dependency}:`, error);
      errors.push(`Error installing ${dependency}: ${error}`);
    }
  }
  
  return { installed, errors };
}

/**
 * Install WP-CLI manually (cross-platform fallback)
 */
async function installWpCliManually(): Promise<boolean> {
  try {
    logger.info('📥 Installing WP-CLI manually...');
    
    const wpCliUrl = 'https://github.com/wp-cli/wp-cli/releases/download/v2.10.0/wp-cli-2.10.0.phar';
    const tempDir = app.getPath('temp');
    const wpCliPath = path.join(tempDir, 'wp-cli.phar');
    const targetPath = platform() === 'win32' ? 'C:\\wp-cli\\wp.bat' : '/usr/local/bin/wp';
    
    // Download WP-CLI
    await new Promise<void>((resolve, reject) => {
      const file = createWriteStream(wpCliPath);
      
      https.get(wpCliUrl, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download WP-CLI: ${response.statusCode}`));
          return;
        }
        
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          resolve();
        });
        
        file.on('error', (error) => {
          fs.unlink(wpCliPath).catch(() => {}); // Clean up on error
          reject(error);
        });
      }).on('error', reject);
    });
    
    // Make it executable and move to target location
    if (platform() === 'win32') {
      // Windows: Create batch file wrapper
      const batchContent = `@echo off\nphp "${wpCliPath}" %*`;
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, batchContent);
    } else {
      // Unix-like: Make executable and move
      await execAsync(`chmod +x "${wpCliPath}"`);
      await execAsync(`sudo mv "${wpCliPath}" "${targetPath}"`);
    }
    
    logger.info('✅ WP-CLI installed manually');
    return true;
  } catch (error) {
    logger.error('❌ Failed to install WP-CLI manually:', error);
    return false;
  }
}

/**
 * Auto-install missing WordPress dependencies
 */
export async function autoInstallDependencies(): Promise<InstallationResult> {
  logger.info('🚀 Starting WordPress dependencies auto-installation...');
  
  const status = await checkInstallationStatus();
  const missing: string[] = [];
  
  if (!status.php.installed) missing.push('php');
  if (!status.mysql.installed) missing.push('mysql');
  if (!status.wpCli.installed) missing.push('wp-cli');
  
  if (missing.length === 0) {
    logger.info('🎉 All WordPress dependencies are already installed!');
    return {
      success: true,
      installed: [],
      errors: [],
      status
    };
  }
  
  logger.info(`📦 Missing dependencies: ${missing.join(', ')}`);
  
  const platformName = platform();
  let installed: string[] = [];
  let errors: string[] = [];
  
  try {
    if (platformName === 'win32') {
      const result = await installOnWindows(missing);
      installed = result.installed;
      errors = result.errors;
    } else if (platformName === 'darwin') {
      const result = await installOnMac(missing);
      installed = result.installed;
      errors = result.errors;
    } else {
      // Linux - attempt manual WP-CLI installation if needed
      if (missing.includes('wp-cli')) {
        const wpCliInstalled = await installWpCliManually();
        if (wpCliInstalled) {
          installed.push('wp-cli');
        } else {
          errors.push('Failed to install WP-CLI on Linux');
        }
      }
      
      // For PHP and MySQL on Linux, provide instructions
      if (missing.includes('php') || missing.includes('mysql')) {
        errors.push('Please install PHP and MySQL manually on Linux using your package manager (apt, yum, etc.)');
      }
    }
  } catch (error) {
    logger.error('❌ Auto-installation failed:', error);
    errors.push(`Auto-installation failed: ${error}`);
  }
  
  // Refresh status after installation
  const finalStatus = await checkInstallationStatus();
  
  const success = errors.length === 0 && installed.length === missing.length;
  
  if (success) {
    logger.info('🎉 WordPress dependencies auto-installation completed successfully!');
  } else {
    logger.warn('⚠️ WordPress dependencies auto-installation completed with some issues');
  }
  
  return {
    success,
    installed,
    errors,
    status: finalStatus
  };
}

/**
 * Check if auto-installation is needed and perform it
 */
export async function ensureWordPressDependencies(): Promise<boolean> {
  try {
    const result = await autoInstallDependencies();
    
    if (!result.success && result.errors.length > 0) {
      logger.error('❌ Failed to ensure WordPress dependencies:', result.errors);
      return false;
    }
    
    return true;
  } catch (error) {
    logger.error('❌ Error ensuring WordPress dependencies:', error);
    return false;
  }
}