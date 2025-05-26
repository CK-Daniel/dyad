import { createLoggedHandler } from './safe_handle';
import log from 'electron-log';
import { getWordPressStatus, isWordPressReady } from '../utils/wordpress_startup_check';
import { ensureWordPressDependencies, checkInstallationStatus } from '../utils/wordpress_auto_installer';
import { getInstallationGuidance } from '../utils/wordpress_installation_guide';

const logger = log.scope('wordpress-dependencies-handlers');
const handle = createLoggedHandler(logger);

export function registerWordPressDependenciesHandlers() {
  // Check if WordPress is ready (quick check)
  handle('wordpress:is-ready', async () => {
    return await isWordPressReady();
  });

  // Get detailed WordPress dependencies status
  handle('wordpress:get-status', async () => {
    return await getWordPressStatus();
  });

  // Manually trigger WordPress dependencies installation
  handle('wordpress:install-dependencies', async () => {
    logger.info('Manual WordPress dependencies installation triggered');
    
    try {
      const result = await ensureWordPressDependencies();
      return {
        success: result,
        message: result 
          ? 'WordPress dependencies installed successfully' 
          : 'Failed to install some WordPress dependencies'
      };
    } catch (error) {
      logger.error('Error during manual WordPress dependencies installation:', error);
      return {
        success: false,
        message: `Installation failed: ${error}`
      };
    }
  });

  // Get installation guidance for missing dependencies
  handle('wordpress:get-installation-guidance', async () => {
    try {
      const status = await checkInstallationStatus();
      const missing: string[] = [];
      
      if (!status.php.installed) missing.push('php');
      if (!status.mysql.installed) missing.push('mysql');
      if (!status.wpCli.installed) missing.push('wp-cli');
      
      return getInstallationGuidance(missing);
    } catch (error) {
      logger.error('Error getting installation guidance:', error);
      return {
        platform: 'Unknown',
        missingDependencies: [],
        automaticOptions: [],
        manualInstructions: ['Error determining missing dependencies'],
        troubleshootingTips: ['Please restart the application and try again']
      };
    }
  });

  logger.debug('Registered WordPress dependencies IPC handlers');
}