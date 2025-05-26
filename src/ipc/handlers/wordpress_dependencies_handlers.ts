import { createLoggedHandler } from './safe_handle';
import log from 'electron-log';
import { getWordPressStatus, isWordPressReady } from '../utils/wordpress_startup_check';
import { ensureWordPressDependencies } from '../utils/wordpress_auto_installer';

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

  logger.debug('Registered WordPress dependencies IPC handlers');
}