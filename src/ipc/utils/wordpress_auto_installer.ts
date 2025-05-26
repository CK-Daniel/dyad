import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { platform } from 'os';
import log from 'electron-log';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { app } from 'electron';
import https from 'https';
import { getInstallationGuidance, logInstallationGuidance } from './wordpress_installation_guide';
import { requestAdminPermission, showWordPressDependenciesDialog, isRunningAsAdmin } from './admin_permission_utils';

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
  
  // Try portable installations first (no admin required)
  for (const dependency of missing) {
    try {
      let success = false;
      
      if (dependency === 'php') {
        success = await installPortablePHP();
      } else if (dependency === 'mysql') {
        success = await installPortableMySQL();
      } else if (dependency === 'wp-cli') {
        success = await installWpCliManually();
      }
      
      if (success) {
        logger.info(`✅ ${dependency} installed successfully (portable)`);
        installed.push(dependency);
      } else {
        errors.push(`Failed to install portable ${dependency}`);
      }
    } catch (error) {
      logger.error(`❌ Error installing portable ${dependency}:`, error);
      errors.push(`Error installing portable ${dependency}: ${error}`);
    }
  }
  
  // If portable installation failed, offer system-wide installation
  const stillMissing = missing.filter(dep => !installed.includes(dep));
  if (stillMissing.length > 0) {
    logger.info('⚠️ Some portable installations failed, checking for system-wide installation...');
    
    // Show user-friendly dialog for choosing installation method
    const userChoice = await showWordPressDependenciesDialog();
    
    if (userChoice === 'cancel') {
      for (const dep of stillMissing) {
        errors.push(`${dep} installation was cancelled by user.`);
      }
      return { installed, errors };
    }
    
    if (userChoice === 'install') {
      // User chose system-wide installation
      const isElevated = await isRunningAsAdmin();
      
      if (!isElevated) {
        // Request admin permission
        const permissionResult = await requestAdminPermission(
          `Installing ${stillMissing.join(', ')} system-wide for WordPress development.`
        );
        
        if (!permissionResult.granted) {
          if (permissionResult.userCancelled) {
            for (const dep of stillMissing) {
              errors.push(`${dep} installation was cancelled by user.`);
            }
          } else {
            for (const dep of stillMissing) {
              errors.push(`${dep} requires administrator privileges. ${permissionResult.error || 'Please run Dyad as administrator.'}`);
            }
          }
          return { installed, errors };
        }
      }
      
      // Proceed with system-wide installation
      const chocoResult = await tryChocolateyInstallation(stillMissing);
      installed.push(...chocoResult.installed);
      errors.push(...chocoResult.errors);
    } else {
      // User chose portable but it failed
      for (const dep of stillMissing) {
        errors.push(`Failed to install portable ${dep}. Consider system-wide installation or manual setup.`);
      }
    }
  }
  
  return { installed, errors };
}


/**
 * Install portable PHP for Windows (no admin required)
 */
async function installPortablePHP(): Promise<boolean> {
  try {
    logger.info('📥 Installing portable PHP for Windows...');
    
    const userDir = app.getPath('userData');
    const phpDir = path.join(userDir, 'portable', 'php');
    const phpUrl = 'https://windows.php.net/downloads/releases/php-8.2.13-nts-Win32-vs16-x64.zip';
    const zipPath = path.join(userDir, 'php.zip');
    
    // Create directory
    await fs.mkdir(phpDir, { recursive: true });
    
    // Download PHP
    await downloadFile(phpUrl, zipPath);
    
    // Extract ZIP (simplified - in real implementation, use a proper zip library)
    await execAsync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${phpDir}' -Force"`);
    
    // Add to PATH in user environment
    const phpExe = path.join(phpDir, 'php.exe');
    await addToUserPath(path.dirname(phpExe));
    
    // Clean up
    await fs.unlink(zipPath);
    
    logger.info(`✅ Portable PHP installed at ${phpExe}`);
    return true;
  } catch (error) {
    logger.error('❌ Failed to install portable PHP:', error);
    return false;
  }
}

/**
 * Install portable MySQL for Windows (no admin required)
 */
async function installPortableMySQL(): Promise<boolean> {
  try {
    logger.info('📥 Installing portable MySQL for Windows...');
    
    const userDir = app.getPath('userData');
    const mysqlDir = path.join(userDir, 'portable', 'mysql');
    const mysqlUrl = 'https://dev.mysql.com/get/Downloads/MySQL-8.0/mysql-8.0.35-winx64.zip';
    const zipPath = path.join(userDir, 'mysql.zip');
    
    // Create directory
    await fs.mkdir(mysqlDir, { recursive: true });
    
    // Download MySQL
    await downloadFile(mysqlUrl, zipPath);
    
    // Extract ZIP
    await execAsync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${mysqlDir}' -Force"`);
    
    // Find the extracted folder (MySQL extracts to a subfolder)
    const contents = await fs.readdir(mysqlDir);
    const mysqlSubDir = contents.find(item => item.startsWith('mysql-'));
    if (!mysqlSubDir) {
      throw new Error('MySQL extraction folder not found');
    }
    
    const mysqlBinDir = path.join(mysqlDir, mysqlSubDir, 'bin');
    await addToUserPath(mysqlBinDir);
    
    // Initialize MySQL data directory
    const dataDir = path.join(mysqlDir, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    
    const mysqldPath = path.join(mysqlBinDir, 'mysqld.exe');
    await execAsync(`"${mysqldPath}" --initialize-insecure --datadir="${dataDir}"`);
    
    // Clean up
    await fs.unlink(zipPath);
    
    logger.info(`✅ Portable MySQL installed at ${mysqlBinDir}`);
    return true;
  } catch (error) {
    logger.error('❌ Failed to install portable MySQL:', error);
    return false;
  }
}

/**
 * Add directory to user PATH environment variable
 */
async function addToUserPath(directory: string): Promise<void> {
  try {
    const command = `setx PATH "%PATH%;${directory}"`;
    await execAsync(command);
    logger.info(`✅ Added ${directory} to user PATH`);
  } catch (error) {
    logger.warn(`⚠️ Failed to add ${directory} to PATH:`, error);
  }
}

/**
 * Download file from URL with redirect handling
 */
async function downloadFile(url: string, outputPath: string, maxRedirects: number = 5): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (maxRedirects <= 0) {
      reject(new Error('Too many redirects'));
      return;
    }

    const file = createWriteStream(outputPath);
    
    const handleResponse = (response: any) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        fs.unlink(outputPath).catch(() => {}); // Clean up partial file
        
        const redirectUrl = response.headers.location;
        if (!redirectUrl) {
          reject(new Error('Redirect without location header'));
          return;
        }
        
        logger.debug(`Following redirect to: ${redirectUrl}`);
        return downloadFile(redirectUrl, outputPath, maxRedirects - 1).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(outputPath).catch(() => {}); // Clean up partial file
        reject(new Error(`Download failed: ${response.statusCode} ${response.statusMessage}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
      
      file.on('error', (error) => {
        fs.unlink(outputPath).catch(() => {}); // Clean up on error
        reject(error);
      });
    };

    // Use https for https URLs, http for http URLs
    const isHttps = url.startsWith('https:');
    const client = isHttps ? https : require('http');
    
    client.get(url, handleResponse).on('error', (error: Error) => {
      file.close();
      fs.unlink(outputPath).catch(() => {}); // Clean up on error
      reject(error);
    });
  });
}

/**
 * Try Chocolatey installation (fallback method)
 */
async function tryChocolateyInstallation(missing: string[]): Promise<{ installed: string[]; errors: string[] }> {
  const installed: string[] = [];
  const errors: string[] = [];
  
  // Check if Chocolatey is installed
  const chocoExists = await commandExists('choco');
  if (!chocoExists.exists) {
    logger.info('📦 Installing Chocolatey package manager...');
    try {
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
  
  // Install missing dependencies with Chocolatey
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
        const child = spawn('choco', ['install', packageName, '-y', '--confirm'], {
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
            logger.info(`✅ ${dependency} installed successfully via Chocolatey`);
            installed.push(dependency);
            resolve();
          } else {
            logger.error(`❌ Failed to install ${dependency} via Chocolatey:`, output);
            errors.push(`Failed to install ${dependency} via Chocolatey: Admin privileges may be required`);
            reject(new Error(`Installation failed with code ${code}`));
          }
        });
        
        child.on('error', reject);
      });
      
    } catch (error) {
      logger.error(`❌ Error installing ${dependency} via Chocolatey:`, error);
      errors.push(`Error installing ${dependency} via Chocolatey: ${error}`);
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
    const userDir = app.getPath('userData');
    const wpCliDir = path.join(userDir, 'portable', 'wp-cli');
    const wpCliPath = path.join(wpCliDir, 'wp-cli.phar');
    const targetPath = platform() === 'win32' 
      ? path.join(wpCliDir, 'wp.bat')
      : '/usr/local/bin/wp';
    
    // Create directory
    await fs.mkdir(wpCliDir, { recursive: true });
    
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
    
    // Make it executable and create wrapper
    if (platform() === 'win32') {
      // Windows: Create batch file wrapper
      const batchContent = `@echo off\nphp "${wpCliPath}" %*`;
      await fs.writeFile(targetPath, batchContent);
      
      // Add to user PATH
      await addToUserPath(wpCliDir);
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
  
  // Provide installation guidance
  const guidance = getInstallationGuidance(missing);
  logInstallationGuidance(guidance);
  
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