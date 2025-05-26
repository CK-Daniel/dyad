import { createLoggedHandler } from './safe_handle';
import log from 'electron-log';
import { wordpressRuntime } from '../utils/wordpress_runtime';
import { db } from '@/db';
import { apps } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { spawn } from 'child_process';
import { getWordPressBinaryPath } from '../utils/wordpress_binary_utils';
import path from 'path';
import fs from 'fs/promises';

const logger = log.scope('wordpress-handlers');
const handle = createLoggedHandler(logger);

export function registerWordPressHandlers() {
  // Start WordPress for an app
  handle('wordpress:start', async (_, { appId }: { appId: number }) => {
    logger.info(`Starting WordPress for app ${appId}`);
    
    // Get app details
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });
    
    if (!app) {
      throw new Error(`App with id ${appId} not found`);
    }
    
    if (app.appType !== 'wordpress') {
      throw new Error(`App ${app.name} is not a WordPress app`);
    }
    
    // Get app path
    const appPath = path.join(process.env.DYAD_APPS_PATH || '', app.path);
    
    // Start WordPress runtime
    const { phpPort, mysqlPort } = await wordpressRuntime.start(appId.toString(), appPath);
    
    // Update app with ports
    await db.update(apps)
      .set({ 
        phpPort,
        mysqlPort,
        updatedAt: new Date()
      })
      .where(eq(apps.id, appId));
    
    return { phpPort, mysqlPort };
  });

  // Stop WordPress for an app
  handle('wordpress:stop', async (_, { appId }: { appId: number }) => {
    logger.info(`Stopping WordPress for app ${appId}`);
    
    await wordpressRuntime.stop(appId.toString());
    
    // Clear ports in database
    await db.update(apps)
      .set({ 
        phpPort: null,
        mysqlPort: null,
        updatedAt: new Date()
      })
      .where(eq(apps.id, appId));
    
    return { success: true };
  });

  // Get WordPress status for an app
  handle('wordpress:status', async (_, { appId }: { appId: number }) => {
    const isRunning = wordpressRuntime.isRunning(appId.toString());
    
    if (!isRunning) {
      return { running: false };
    }
    
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });
    
    return {
      running: true,
      phpPort: app?.phpPort || null,
      mysqlPort: app?.mysqlPort || null
    };
  });

  // Execute WP-CLI command
  handle('wordpress:wp-cli', async (_, { 
    appId, 
    command 
  }: { 
    appId: number; 
    command: string;
  }) => {
    logger.info(`Executing WP-CLI command for app ${appId}: ${command}`);
    
    // Get app details
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });
    
    if (!app || app.appType !== 'wordpress') {
      throw new Error('Invalid WordPress app');
    }
    
    // Check if WordPress is running
    if (!wordpressRuntime.isRunning(appId.toString())) {
      throw new Error('WordPress is not running for this app');
    }
    
    const appPath = path.join(process.env.DYAD_APPS_PATH || '', app.path);
    const wordpressPath = path.join(appPath, 'wordpress');
    const wpCliPath = getWordPressBinaryPath('wp-cli');
    
    // Execute WP-CLI command
    const wpCliProcess = spawn(wpCliPath, command.split(' '), {
      cwd: wordpressPath,
      env: {
        ...process.env,
        WP_CLI_PHP: getWordPressBinaryPath('php')
      }
    });

    let output = '';
    let error = '';

    wpCliProcess.stdout?.on('data', (data) => {
      output += data.toString();
    });

    wpCliProcess.stderr?.on('data', (data) => {
      error += data.toString();
    });

    return new Promise((resolve, reject) => {
      wpCliProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output });
        } else {
          reject(new Error(`WP-CLI command failed: ${error || output}`));
        }
      });

      wpCliProcess.on('error', (err) => {
        reject(new Error(`Failed to execute WP-CLI: ${err.message}`));
      });
    });
  });

  // Execute MySQL query
  handle('wordpress:mysql-query', async (_, { 
    appId, 
    query 
  }: { 
    appId: number; 
    query: string;
  }) => {
    logger.info(`Executing MySQL query for app ${appId}`);
    
    // Get app details
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });
    
    if (!app || app.appType !== 'wordpress' || !app.mysqlPort) {
      throw new Error('Invalid WordPress app or MySQL not running');
    }
    
    const mysqlPath = getWordPressBinaryPath('mysql');
    
    // Execute MySQL query
    const mysqlProcess = spawn(mysqlPath, [
      '-h', '127.0.0.1',
      '-P', app.mysqlPort.toString(),
      '-u', 'root',
      'wordpress',
      '-e', query
    ]);

    let output = '';
    let error = '';

    mysqlProcess.stdout?.on('data', (data) => {
      output += data.toString();
    });

    mysqlProcess.stderr?.on('data', (data) => {
      error += data.toString();
    });

    return new Promise((resolve, reject) => {
      mysqlProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output });
        } else {
          reject(new Error(`MySQL query failed: ${error || output}`));
        }
      });

      mysqlProcess.on('error', (err) => {
        reject(new Error(`Failed to execute MySQL: ${err.message}`));
      });
    });
  });

  // Install WordPress
  handle('wordpress:install', async (_, {
    appId,
    siteTitle,
    adminUser,
    adminPassword,
    adminEmail
  }: {
    appId: number;
    siteTitle: string;
    adminUser: string;
    adminPassword: string;
    adminEmail: string;
  }) => {
    logger.info(`Installing WordPress for app ${appId}`);
    
    // Get app details
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });
    
    if (!app || app.appType !== 'wordpress') {
      throw new Error('Invalid WordPress app');
    }
    
    // Ensure WordPress is running
    if (!wordpressRuntime.isRunning(appId.toString())) {
      await wordpressRuntime.start(
        appId.toString(), 
        path.join(process.env.DYAD_APPS_PATH || '', app.path)
      );
    }
    
    // WordPress core will be set up by the runtime when it starts
    const appPath = path.join(process.env.DYAD_APPS_PATH || '', app.path);
    const wordpressPath = path.join(appPath, 'wordpress');
    
    // Run WordPress installation
    const installCommand = [
      'core', 'install',
      `--url=http://localhost:${app.phpPort}`,
      `--title=${siteTitle}`,
      `--admin_user=${adminUser}`,
      `--admin_password=${adminPassword}`,
      `--admin_email=${adminEmail}`,
      '--skip-email'
    ];
    
    const wpCliPath = getWordPressBinaryPath('wp-cli');
    const wpCliProcess = spawn(wpCliPath, installCommand, {
      cwd: wordpressPath,
      env: {
        ...process.env,
        WP_CLI_PHP: getWordPressBinaryPath('php')
      }
    });

    let output = '';
    let error = '';

    wpCliProcess.stdout?.on('data', (data) => {
      output += data.toString();
    });

    wpCliProcess.stderr?.on('data', (data) => {
      error += data.toString();
    });

    return new Promise((resolve, reject) => {
      wpCliProcess.on('close', (code) => {
        if (code === 0) {
          logger.info('WordPress installed successfully');
          resolve({ success: true, output });
        } else {
          reject(new Error(`WordPress installation failed: ${error || output}`));
        }
      });

      wpCliProcess.on('error', (err) => {
        reject(new Error(`Failed to install WordPress: ${err.message}`));
      });
    });
  });

  // Check WordPress binary availability
  handle('wordpress:check-binaries', async () => {
    try {
      const phpPath = getWordPressBinaryPath('php');
      const mysqlPath = getWordPressBinaryPath('mysqld');
      
      // Check if binaries exist
      const phpExists = await fs.access(phpPath).then(() => true).catch(() => false);
      const mysqlExists = await fs.access(mysqlPath).then(() => true).catch(() => false);
      
      return {
        available: phpExists && mysqlExists,
        php: phpExists,
        mysql: mysqlExists
      };
    } catch (error) {
      logger.error('Error checking WordPress binaries:', error);
      return {
        available: false,
        php: false,
        mysql: false
      };
    }
  });

  logger.debug('Registered WordPress IPC handlers');
}