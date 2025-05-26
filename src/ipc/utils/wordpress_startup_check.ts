import log from 'electron-log';
import { ensureWordPressDependencies, checkInstallationStatus } from './wordpress_auto_installer';

const logger = log.scope('wordpress-startup');

/**
 * Perform WordPress dependencies check and auto-installation on app startup
 * This runs silently in the background to ensure dependencies are ready
 */
export async function performStartupWordPressCheck(): Promise<void> {
  logger.info('🔍 Performing WordPress dependencies startup check...');
  
  try {
    const status = await checkInstallationStatus();
    const hasAllDeps = status.php.installed && status.mysql.installed && status.wpCli.installed;
    
    if (hasAllDeps) {
      logger.info('✅ All WordPress dependencies are available at startup');
      return;
    }
    
    logger.info('⚠️ Some WordPress dependencies are missing, attempting auto-installation...');
    
    // Attempt auto-installation in the background
    const installationResult = await ensureWordPressDependencies();
    
    if (installationResult) {
      logger.info('🎉 WordPress dependencies auto-installation completed successfully during startup');
    } else {
      logger.warn('⚠️ WordPress dependencies auto-installation had some issues during startup');
      logger.info('💡 WordPress features may require manual installation of missing dependencies');
    }
    
  } catch (error) {
    logger.error('❌ Error during WordPress startup check:', error);
    logger.info('💡 WordPress features may not work properly without required dependencies');
  }
}

/**
 * Quick check if WordPress dependencies are available
 * Used for UI status indicators
 */
export async function isWordPressReady(): Promise<boolean> {
  try {
    const status = await checkInstallationStatus();
    return status.php.installed && status.mysql.installed && status.wpCli.installed;
  } catch (error) {
    logger.error('Error checking WordPress readiness:', error);
    return false;
  }
}

/**
 * Get detailed WordPress dependencies status for UI display
 */
export async function getWordPressStatus(): Promise<{
  ready: boolean;
  dependencies: {
    php: { available: boolean; version?: string };
    mysql: { available: boolean; version?: string };
    wpCli: { available: boolean; version?: string };
  };
}> {
  try {
    const status = await checkInstallationStatus();
    
    return {
      ready: status.php.installed && status.mysql.installed && status.wpCli.installed,
      dependencies: {
        php: {
          available: status.php.installed,
          version: status.php.version
        },
        mysql: {
          available: status.mysql.installed,
          version: status.mysql.version
        },
        wpCli: {
          available: status.wpCli.installed,
          version: status.wpCli.version
        }
      }
    };
  } catch (error) {
    logger.error('Error getting WordPress status:', error);
    return {
      ready: false,
      dependencies: {
        php: { available: false },
        mysql: { available: false },
        wpCli: { available: false }
      }
    };
  }
}