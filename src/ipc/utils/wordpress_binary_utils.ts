import { app } from 'electron';
import path from 'path';
import { platform, arch } from 'os';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { getAvailablePort } from './port_utils';
import log from 'electron-log';
import { ensureWordPressDependencies } from './wordpress_auto_installer';

const logger = log.scope('wordpress-binary-utils');

export type WordPressBinary = 'php' | 'mysql' | 'mysqld' | 'wp-cli';

/**
 * Get the path to a portable binary installation (Windows only)
 */
function getPortableBinaryPath(binary: WordPressBinary): string | null {
  if (platform() !== 'win32') {
    return null;
  }
  
  const userDir = app.getPath('userData');
  
  switch (binary) {
    case 'php':
      return path.join(userDir, 'portable', 'php', 'php.exe');
    case 'mysql':
    case 'mysqld':
      // Look for MySQL in portable directory
      const mysqlDir = path.join(userDir, 'portable', 'mysql');
      try {
        const contents = require('fs').readdirSync(mysqlDir);
        const mysqlSubDir = contents.find((item: string) => item.startsWith('mysql-'));
        if (mysqlSubDir) {
          const binPath = binary === 'mysql' ? 'mysql.exe' : 'mysqld.exe';
          return path.join(mysqlDir, mysqlSubDir, 'bin', binPath);
        }
      } catch {
        // Directory doesn't exist
      }
      return null;
    case 'wp-cli':
      return path.join(userDir, 'portable', 'wp-cli', 'wp.bat');
    default:
      return null;
  }
}

/**
 * Get the path to a WordPress binary based on the current platform and architecture
 */
export function getWordPressBinaryPath(binary: WordPressBinary): string {
  const platformName = platform();
  const archName = arch();
  const platformArch = `${platformName}-${archName}`;
  
  // In development, try to use system binaries first
  if (!app.isPackaged) {
    // Map binary names to common system commands
    const systemBinaries: Record<WordPressBinary, string> = {
      'php': 'php',
      'mysql': 'mysql',
      'mysqld': 'mysqld',
      'wp-cli': 'wp'
    };
    
    const systemBinary = systemBinaries[binary];
    
    // First, check for portable installations (Windows)
    if (platformName === 'win32') {
      const portablePath = getPortableBinaryPath(binary);
      if (portablePath && existsSync(portablePath)) {
        logger.debug(`Using portable ${binary}: ${portablePath}`);
        return portablePath;
      }
    }
    
    // For wp-cli, check the downloaded version
    if (binary === 'wp-cli') {
      const wpCliPath = path.join(
        __dirname, '../../../',
        'extraResources',
        'wordpress-runtime',
        platformArch,
        'wp-cli',
        'bin',
        platformName === 'win32' ? 'wp.bat' : 'wp'
      );
      
      if (existsSync(wpCliPath)) {
        logger.debug(`Using downloaded WP-CLI: ${wpCliPath}`);
        return wpCliPath;
      }
    }
    
    // Try to find system binary
    try {
      const which = require('which');
      const systemPath = which.sync(systemBinary);
      logger.debug(`Using system ${binary}: ${systemPath}`);
      return systemPath;
    } catch {
      logger.debug(`System ${binary} not found, falling back to bundled version`);
    }
  }
  
  // Production path or fallback for development
  const resourcesPath = app.isPackaged 
    ? process.resourcesPath 
    : path.join(__dirname, '../../../');
  
  // Handle different binary names across platforms
  let binaryName: string = binary;
  if (platformName === 'win32') {
    if (binary === 'mysql' || binary === 'mysqld' || binary === 'php') {
      binaryName = `${binary}.exe`;
    }
  }
  
  // Special handling for wp-cli
  if (binary === 'wp-cli') {
    binaryName = platformName === 'win32' ? 'wp.bat' : 'wp';
  }
  
  const binaryPath = path.join(
    resourcesPath,
    'extraResources',
    'wordpress-runtime',
    platformArch,
    binary === 'wp-cli' ? 'wp-cli' : binary.replace('mysqld', 'mysql'),
    'bin',
    binaryName
  );
  
  logger.debug(`Binary path for ${binary}: ${binaryPath}`);
  return binaryPath;
}

/**
 * Check if WordPress binaries are available for the current platform
 * Automatically installs missing dependencies if possible
 */
export async function checkWordPressBinaries(): Promise<{
  available: boolean;
  missing: string[];
}> {
  const binaries: WordPressBinary[] = ['php', 'mysqld', 'wp-cli'];
  let missing: string[] = [];
  
  // In development, check system binaries first
  if (!app.isPackaged) {
    logger.info('🔍 Checking system binaries (development mode)...');
    try {
      const which = require('which');
      
      for (const binary of binaries) {
        let found = false;
        
        // First check for portable installations on Windows
        if (platform() === 'win32') {
          const portablePath = getPortableBinaryPath(binary);
          if (portablePath && existsSync(portablePath)) {
            logger.info(`✅ Found portable ${binary} at ${portablePath}`);
            found = true;
          }
        }
        
        // If not found in portable, check system binaries
        if (!found) {
          if (binary === 'php') {
            try {
              const phpPath = which.sync('php');
              logger.info(`✅ Found system PHP at ${phpPath}`);
              found = true;
            } catch (error) {
              logger.warn(`❌ System PHP not found: ${error}`);
            }
          } else if (binary === 'mysqld') {
            // Check for MySQL in various forms
            try {
              const mysqlPath = which.sync('mysqld');
              logger.info(`✅ Found system mysqld at ${mysqlPath}`);
              found = true;
            } catch {
              try {
                const mysqlPath = which.sync('mysql.server');
                logger.info(`✅ Found system mysql.server at ${mysqlPath}`);
                found = true;
              } catch {
                try {
                  const mysqlPath = which.sync('mysql');
                  logger.info(`✅ Found system mysql at ${mysqlPath}`);
                  found = true;
                } catch (error) {
                  logger.warn(`❌ No MySQL binary found: ${error}`);
                }
              }
            }
          } else if (binary === 'wp-cli') {
            try {
              const wpPath = which.sync('wp');
              logger.info(`✅ Found system WP-CLI at ${wpPath}`);
              found = true;
            } catch (error) {
              logger.warn(`❌ System WP-CLI not found: ${error}`);
            }
          }
        }
        
        if (!found) {
          missing.push(binary);
        }
      }
      
      // If we found system binaries, return success
      if (missing.length === 0) {
        logger.info('🎉 All system binaries found successfully!');
        return {
          available: true,
          missing: []
        };
      }
      
      logger.warn(`⚠️ Some system binaries missing: ${missing.join(', ')}`);
      
      // Attempt auto-installation of missing dependencies
      logger.info('🔧 Attempting to auto-install missing WordPress dependencies...');
      try {
        const installationSuccess = await ensureWordPressDependencies();
        if (installationSuccess) {
          logger.info('✅ Auto-installation completed, re-checking binaries...');
          
          // Re-check binaries after installation
          missing.length = 0; // Reset
          for (const binary of binaries) {
            let found = false;
            
            if (binary === 'php') {
              try {
                const phpPath = which.sync('php');
                logger.info(`✅ Found system PHP at ${phpPath} (after installation)`);
                found = true;
              } catch {
                logger.debug('System PHP still not found after installation');
              }
            } else if (binary === 'mysqld') {
              try {
                const mysqlPath = which.sync('mysqld');
                logger.info(`✅ Found system mysqld at ${mysqlPath} (after installation)`);
                found = true;
              } catch {
                try {
                  const mysqlPath = which.sync('mysql.server');
                  logger.info(`✅ Found system mysql.server at ${mysqlPath} (after installation)`);
                  found = true;
                } catch {
                  try {
                    const mysqlPath = which.sync('mysql');
                    logger.info(`✅ Found system mysql at ${mysqlPath} (after installation)`);
                    found = true;
                  } catch {
                    logger.debug('No MySQL binary found after installation');
                  }
                }
              }
            } else if (binary === 'wp-cli') {
              try {
                const wpPath = which.sync('wp');
                logger.info(`✅ Found system WP-CLI at ${wpPath} (after installation)`);
                found = true;
              } catch {
                logger.debug('System WP-CLI not found after installation');
              }
            }
            
            if (!found) {
              missing.push(binary);
            }
          }
          
          if (missing.length === 0) {
            logger.info('🎉 All system binaries found after auto-installation!');
            return {
              available: true,
              missing: []
            };
          }
        } else {
          logger.warn('⚠️ Auto-installation failed or incomplete');
        }
      } catch (autoInstallError) {
        logger.error('❌ Auto-installation error:', autoInstallError);
      }
      
      logger.warn('📦 Falling back to bundled versions...');
      missing.length = 0; // Reset for bundled check
    } catch (error) {
      logger.warn('Error checking system binaries:', error);
    }
  }
  
  // Check bundled binaries
  for (const binary of binaries) {
    const binaryPath = getWordPressBinaryPath(binary);
    try {
      await fs.access(binaryPath);
      logger.debug(`Found ${binary} at ${binaryPath}`);
    } catch {
      logger.warn(`Missing ${binary} at ${binaryPath}`);
      missing.push(binary);
    }
  }
  
  return {
    available: missing.length === 0,
    missing
  };
}

/**
 * Get MySQL data directory for an app
 */
export function getMySQLDataDir(appPath: string): string {
  return path.join(appPath, '.wordpress-data', 'mysql');
}

/**
 * Get WordPress installation directory
 */
export function getWordPressDir(appPath: string): string {
  return path.join(appPath, 'wordpress');
}

/**
 * Allocate available ports for PHP and MySQL
 */
export async function allocateWordPressPorts(): Promise<{
  phpPort: number;
  mysqlPort: number;
}> {
  // Try default ports first, then find available ones
  const phpPort = await getAvailablePort(8080);
  const mysqlPort = await getAvailablePort(3306);
  
  logger.info(`Allocated ports - PHP: ${phpPort}, MySQL: ${mysqlPort}`);
  
  return { phpPort, mysqlPort };
}

/**
 * Create WordPress configuration file
 */
export async function createWpConfig(
  appPath: string,
  mysqlPort: number,
  dbName: string = 'wordpress',
  dbUser: string = 'root',
  dbPassword: string = ''
): Promise<void> {
  const wpConfigPath = path.join(appPath, 'wp-config.php');
  
  const wpConfig = `<?php
/**
 * WordPress configuration file generated by Dyad
 */

// Database settings
define( 'DB_NAME', '${dbName}' );
define( 'DB_USER', '${dbUser}' );
define( 'DB_PASSWORD', '${dbPassword}' );
define( 'DB_HOST', '127.0.0.1:${mysqlPort}' );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', '' );

// Authentication keys and salts
define( 'AUTH_KEY',         '${generateSalt()}' );
define( 'SECURE_AUTH_KEY',  '${generateSalt()}' );
define( 'LOGGED_IN_KEY',    '${generateSalt()}' );
define( 'NONCE_KEY',        '${generateSalt()}' );
define( 'AUTH_SALT',        '${generateSalt()}' );
define( 'SECURE_AUTH_SALT', '${generateSalt()}' );
define( 'LOGGED_IN_SALT',   '${generateSalt()}' );
define( 'NONCE_SALT',       '${generateSalt()}' );

// WordPress database table prefix
$table_prefix = 'wp_';

// WordPress debugging
define( 'WP_DEBUG', true );
define( 'WP_DEBUG_LOG', true );
define( 'WP_DEBUG_DISPLAY', false );

// Absolute path to the WordPress directory
if ( ! defined( 'ABSPATH' ) ) {
    define( 'ABSPATH', __DIR__ . '/' );
}

// Sets up WordPress vars and included files
require_once ABSPATH . 'wp-settings.php';
`;
  
  await fs.writeFile(wpConfigPath, wpConfig, 'utf8');
  logger.info(`Created wp-config.php at ${wpConfigPath}`);
}

/**
 * Generate a random salt for WordPress configuration
 */
function generateSalt(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}|;:,.<>?';
  let salt = '';
  for (let i = 0; i < 64; i++) {
    salt += chars[Math.floor(Math.random() * chars.length)];
  }
  return salt;
}

/**
 * Initialize MySQL data directory
 */
export async function initializeMySQLDataDir(appPath: string): Promise<void> {
  const dataDir = getMySQLDataDir(appPath);
  
  // Create data directory
  await fs.mkdir(dataDir, { recursive: true });
  
  logger.info(`Initialized MySQL data directory at ${dataDir}`);
}

/**
 * Get PHP configuration path
 */
export function getPHPIniPath(appPath: string): string {
  return path.join(appPath, '.wordpress-data', 'php.ini');
}

/**
 * Create PHP configuration
 */
export async function createPHPConfig(appPath: string, phpPort: number): Promise<void> {
  const phpIniPath = getPHPIniPath(appPath);
  const phpIniDir = path.dirname(phpIniPath);
  
  // Ensure directory exists
  await fs.mkdir(phpIniDir, { recursive: true });
  
  const phpConfig = `[PHP]
; Dyad WordPress PHP Configuration

; Basic settings
max_execution_time = 300
max_input_time = 300
memory_limit = 256M
post_max_size = 64M
upload_max_filesize = 64M

; Error reporting
error_reporting = E_ALL
display_errors = On
display_startup_errors = On
log_errors = On
error_log = ${path.join(phpIniDir, 'php-error.log')}

; Extensions directory
extension_dir = "${path.dirname(getWordPressBinaryPath('php'))}/ext"

; Enable required extensions
extension=curl
extension=fileinfo
extension=gd
extension=mbstring
extension=mysqli
extension=openssl
extension=pdo
extension=pdo_mysql
extension=zip

; Session settings
session.save_path = "${path.join(phpIniDir, 'sessions')}"

; Date settings
date.timezone = "UTC"

; Development server settings
; Listen on localhost only for security
cli_server.host = 127.0.0.1
cli_server.port = ${phpPort}
`;
  
  await fs.writeFile(phpIniPath, phpConfig, 'utf8');
  
  // Create sessions directory
  await fs.mkdir(path.join(phpIniDir, 'sessions'), { recursive: true });
  
  logger.info(`Created PHP configuration at ${phpIniPath}`);
}