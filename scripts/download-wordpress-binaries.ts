#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { createWriteStream, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import * as tar from 'tar';
import { platform, arch } from 'os';
import { execSync } from 'child_process';

const WORDPRESS_VERSION = '6.4.2';

interface BinaryInfo {
  url: string;
  extractPath: string;
}

// Binary download URLs - using stable, versioned URLs
const BINARIES: Record<string, Record<string, BinaryInfo>> = {
  'darwin-x64': {
    php: {
      url: 'https://www.php.net/distributions/php-8.2.13.tar.gz',
      extractPath: 'php'
    },
    mysql: {
      url: 'https://dev.mysql.com/get/Downloads/MySQL-8.0/mysql-8.0.35-macos13-x86_64.tar.gz',
      extractPath: 'mysql'
    }
  },
  'darwin-arm64': {
    php: {
      url: 'https://www.php.net/distributions/php-8.2.13.tar.gz',
      extractPath: 'php'
    },
    mysql: {
      url: 'https://dev.mysql.com/get/Downloads/MySQL-8.0/mysql-8.0.35-macos13-arm64.tar.gz',
      extractPath: 'mysql'
    }
  },
  'linux-x64': {
    php: {
      url: 'https://www.php.net/distributions/php-8.2.13.tar.gz',
      extractPath: 'php'
    },
    mysql: {
      url: 'https://dev.mysql.com/get/Downloads/MySQL-8.0/mysql-8.0.35-linux-glibc2.17-x86_64.tar.xz',
      extractPath: 'mysql'
    }
  },
  'win32-x64': {
    php: {
      url: 'https://windows.php.net/downloads/releases/php-8.2.13-Win32-vs16-x64.zip',
      extractPath: 'php'
    },
    mysql: {
      url: 'https://dev.mysql.com/get/Downloads/MySQL-8.0/mysql-8.0.35-winx64.zip',
      extractPath: 'mysql'
    }
  }
};

const WP_CLI_URL = 'https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar';

async function downloadFile(url: string, dest: string): Promise<void> {
  console.log(`Downloading ${url} to ${dest}...`);
  
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        https.get(response.headers.location!, (redirectResponse) => {
          pipeline(redirectResponse, file)
            .then(() => resolve())
            .catch(reject);
        });
      } else {
        pipeline(response, file)
          .then(() => resolve())
          .catch(reject);
      }
    }).on('error', reject);
  });
}

async function extractArchive(filePath: string, destDir: string): Promise<void> {
  console.log(`Extracting ${filePath} to ${destDir}...`);
  
  if (filePath.endsWith('.tar.gz')) {
    await tar.extract({
      file: filePath,
      cwd: destDir,
    });
  } else if (filePath.endsWith('.zip')) {
    // Use unzip command for Windows
    if (platform() === 'win32') {
      // Use PowerShell on Windows
      execSync(`powershell -command "Expand-Archive -Path '${filePath}' -DestinationPath '${destDir}' -Force"`);
    } else {
      execSync(`unzip -q "${filePath}" -d "${destDir}"`);
    }
  } else if (filePath.endsWith('.tar.xz')) {
    // Use tar command for xz files
    execSync(`tar -xJf "${filePath}" -C "${destDir}"`);
  }
}

async function downloadWordPressCore(destDir: string): Promise<void> {
  const wpUrl = `https://wordpress.org/wordpress-${WORDPRESS_VERSION}.tar.gz`;
  const wpPath = path.join(destDir, 'wordpress.tar.gz');
  
  console.log('Downloading WordPress core...');
  await downloadFile(wpUrl, wpPath);
  
  console.log('Extracting WordPress core...');
  await extractArchive(wpPath, destDir);
  
  // Clean up
  await fs.promises.unlink(wpPath);
}

async function downloadWpCli(destDir: string): Promise<void> {
  const wpCliPath = path.join(destDir, 'wp');
  
  console.log('Downloading WP-CLI...');
  await downloadFile(WP_CLI_URL, wpCliPath);
  
  // Make executable
  if (platform() !== 'win32') {
    await fs.promises.chmod(wpCliPath, 0o755);
  }
  
  // Create batch file for Windows
  if (platform() === 'win32') {
    const batchContent = `@echo off
php "%~dp0wp" %*`;
    await fs.promises.writeFile(path.join(destDir, 'wp.bat'), batchContent);
  }
}

// Check if we're in development mode (not building for production)
function isDevelopment(): boolean {
  return !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
}

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const extraResourcesDir = path.join(projectRoot, 'extraResources');
  const wordpressRuntimeDir = path.join(extraResourcesDir, 'wordpress-runtime');
  
  // In development, we'll use system-installed PHP/MySQL if available
  if (isDevelopment()) {
    console.log('Development mode: Skipping binary download.');
    console.log('Please ensure PHP and MySQL are installed on your system.');
    
    // Still download WordPress core and WP-CLI
    const wordpressTemplateDir = path.join(extraResourcesDir, 'wordpress-core');
    if (!existsSync(path.join(wordpressTemplateDir, 'wordpress'))) {
      await fs.promises.mkdir(wordpressTemplateDir, { recursive: true });
      await downloadWordPressCore(wordpressTemplateDir);
    }
    
    // Create a placeholder structure for development
    const platformName = platform();
    const archName = arch();
    const platformKey = `${platformName}-${archName}`;
    const platformDir = path.join(wordpressRuntimeDir, platformKey);
    const wpCliDir = path.join(platformDir, 'wp-cli', 'bin');
    
    await fs.promises.mkdir(wpCliDir, { recursive: true });
    
    if (!existsSync(path.join(wpCliDir, 'wp'))) {
      await downloadWpCli(wpCliDir);
    }
    
    console.log('Development setup complete!');
    return;
  }
  
  // Production mode: Download binaries
  console.log('Production mode: Downloading WordPress binaries...');
  
  // Determine platform
  const platformName = platform();
  const archName = arch();
  const platformKey = `${platformName}-${archName}`;
  
  if (!BINARIES[platformKey]) {
    console.error(`Unsupported platform: ${platformKey}`);
    console.error('WordPress features will require system-installed PHP and MySQL.');
    return;
  }
  
  // Create directories
  const platformDir = path.join(wordpressRuntimeDir, platformKey);
  await fs.promises.mkdir(platformDir, { recursive: true });
  
  // Download binaries for current platform
  const binaries = BINARIES[platformKey];
  
  for (const [name, info] of Object.entries(binaries)) {
    const downloadPath = path.join(platformDir, `${name}.archive`);
    const extractDir = path.join(platformDir, name);
    
    // Skip if already exists
    if (existsSync(path.join(extractDir, 'bin'))) {
      console.log(`${name} already exists, skipping...`);
      continue;
    }
    
    await fs.promises.mkdir(extractDir, { recursive: true });
    
    try {
      // Download
      await downloadFile(info.url, downloadPath);
      
      // Extract
      await extractArchive(downloadPath, extractDir);
      
      // Clean up
      await fs.promises.unlink(downloadPath);
      
      console.log(`${name} downloaded successfully`);
    } catch (error) {
      console.error(`Failed to download ${name}:`, error);
      console.error(`WordPress will require system-installed ${name}`);
    }
  }
  
  // Download WP-CLI
  const wpCliDir = path.join(platformDir, 'wp-cli', 'bin');
  await fs.promises.mkdir(wpCliDir, { recursive: true });
  await downloadWpCli(wpCliDir);
  
  // Download WordPress core template
  const wordpressTemplateDir = path.join(extraResourcesDir, 'wordpress-core');
  if (!existsSync(path.join(wordpressTemplateDir, 'wordpress'))) {
    await fs.promises.mkdir(wordpressTemplateDir, { recursive: true });
    await downloadWordPressCore(wordpressTemplateDir);
  }
  
  console.log('WordPress binaries download complete!');
}

main().catch((error) => {
  console.error('Error downloading WordPress binaries:', error);
  // Don't exit with error in development
  if (!isDevelopment()) {
    process.exit(1);
  }
});