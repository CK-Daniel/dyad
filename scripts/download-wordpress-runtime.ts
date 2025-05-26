import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createWriteStream, createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

interface BinaryConfig {
  name: string;
  platforms: {
    [key: string]: {
      url: string;
      extractTo?: string;
      executable: string;
      postProcess?: (extractPath: string) => Promise<void>;
    };
  };
}

const BINARIES: BinaryConfig[] = [
  {
    name: 'php',
    platforms: {
      'win32-x64': {
        url: 'https://windows.php.net/downloads/releases/php-8.2.13-nts-Win32-vs16-x64.zip',
        extractTo: 'php',
        executable: 'php.exe'
      },
      'win32-ia32': {
        url: 'https://windows.php.net/downloads/releases/php-8.2.13-nts-Win32-vs16-x86.zip',
        extractTo: 'php',
        executable: 'php.exe'
      },
      'darwin-x64': {
        url: 'https://github.com/shivammathur/php-src-prebuilt/releases/download/php-8.2.13/php-8.2.13-macos-latest.tar.xz',
        extractTo: 'php',
        executable: 'bin/php'
      },
      'darwin-arm64': {
        url: 'https://github.com/shivammathur/php-src-prebuilt/releases/download/php-8.2.13/php-8.2.13-macos-latest.tar.xz',
        extractTo: 'php',
        executable: 'bin/php'
      },
      'linux-x64': {
        url: 'https://github.com/shivammathur/php-src-prebuilt/releases/download/php-8.2.13/php-8.2.13-ubuntu-latest.tar.xz',
        extractTo: 'php',
        executable: 'bin/php'
      }
    }
  },
  {
    name: 'mysql',
    platforms: {
      'win32-x64': {
        url: 'https://dev.mysql.com/get/Downloads/MySQL-8.0/mysql-8.0.35-winx64.zip',
        extractTo: 'mysql',
        executable: 'bin/mysqld.exe',
        postProcess: async (extractPath: string) => {
          // Initialize MySQL data directory
          const dataDir = path.join(extractPath, 'data');
          if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            const mysqldPath = path.join(extractPath, 'bin', 'mysqld.exe');
            try {
              await execAsync(`"${mysqldPath}" --initialize-insecure --datadir="${dataDir}"`);
              console.log('✅ MySQL data directory initialized');
            } catch (error) {
              console.warn('⚠️ MySQL initialization failed (will be done at runtime):', error);
            }
          }
        }
      },
      'darwin-x64': {
        url: 'https://dev.mysql.com/get/Downloads/MySQL-8.0/mysql-8.0.35-macos12-x86_64.tar.gz',
        extractTo: 'mysql',
        executable: 'bin/mysqld'
      },
      'darwin-arm64': {
        url: 'https://dev.mysql.com/get/Downloads/MySQL-8.0/mysql-8.0.35-macos12-arm64.tar.gz',
        extractTo: 'mysql',
        executable: 'bin/mysqld'
      },
      'linux-x64': {
        url: 'https://dev.mysql.com/get/Downloads/MySQL-8.0/mysql-8.0.35-linux-glibc2.28-x86_64.tar.xz',
        extractTo: 'mysql',
        executable: 'bin/mysqld'
      }
    }
  },
  {
    name: 'wp-cli',
    platforms: {
      'win32-x64': {
        url: 'https://github.com/wp-cli/wp-cli/releases/download/v2.10.0/wp-cli-2.10.0.phar',
        extractTo: 'wp-cli',
        executable: 'wp.bat',
        postProcess: async (extractPath: string) => {
          // Create batch wrapper for Windows
          const batchContent = `@echo off\nphp "%~dp0wp-cli.phar" %*`;
          const batchPath = path.join(extractPath, 'wp.bat');
          fs.writeFileSync(batchPath, batchContent);
          console.log('✅ Created WP-CLI batch wrapper');
        }
      },
      'win32-ia32': {
        url: 'https://github.com/wp-cli/wp-cli/releases/download/v2.10.0/wp-cli-2.10.0.phar',
        extractTo: 'wp-cli',
        executable: 'wp.bat',
        postProcess: async (extractPath: string) => {
          const batchContent = `@echo off\nphp "%~dp0wp-cli.phar" %*`;
          const batchPath = path.join(extractPath, 'wp.bat');
          fs.writeFileSync(batchPath, batchContent);
        }
      },
      'darwin-x64': {
        url: 'https://github.com/wp-cli/wp-cli/releases/download/v2.10.0/wp-cli-2.10.0.phar',
        extractTo: 'wp-cli',
        executable: 'wp',
        postProcess: async (extractPath: string) => {
          // Create shell wrapper for Unix
          const shellContent = `#!/bin/bash\nphp "$(dirname "$0")/wp-cli.phar" "$@"`;
          const shellPath = path.join(extractPath, 'wp');
          fs.writeFileSync(shellPath, shellContent);
          fs.chmodSync(shellPath, 0o755);
          console.log('✅ Created WP-CLI shell wrapper');
        }
      },
      'darwin-arm64': {
        url: 'https://github.com/wp-cli/wp-cli/releases/download/v2.10.0/wp-cli-2.10.0.phar',
        extractTo: 'wp-cli',
        executable: 'wp',
        postProcess: async (extractPath: string) => {
          const shellContent = `#!/bin/bash\nphp "$(dirname "$0")/wp-cli.phar" "$@"`;
          const shellPath = path.join(extractPath, 'wp');
          fs.writeFileSync(shellPath, shellContent);
          fs.chmodSync(shellPath, 0o755);
        }
      },
      'linux-x64': {
        url: 'https://github.com/wp-cli/wp-cli/releases/download/v2.10.0/wp-cli-2.10.0.phar',
        extractTo: 'wp-cli',
        executable: 'wp',
        postProcess: async (extractPath: string) => {
          const shellContent = `#!/bin/bash\nphp "$(dirname "$0")/wp-cli.phar" "$@"`;
          const shellPath = path.join(extractPath, 'wp');
          fs.writeFileSync(shellPath, shellContent);
          fs.chmodSync(shellPath, 0o755);
        }
      }
    }
  }
];

/**
 * Download file with redirect handling
 */
async function downloadFile(url: string, outputPath: string, maxRedirects = 5): Promise<void> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      reject(new Error('Too many redirects'));
      return;
    }

    const file = createWriteStream(outputPath);
    const client = url.startsWith('https:') ? https : http;

    const request = client.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(outputPath);
        
        const redirectUrl = response.headers.location;
        if (!redirectUrl) {
          reject(new Error('Redirect without location'));
          return;
        }
        
        console.log(`Following redirect: ${redirectUrl}`);
        downloadFile(redirectUrl, outputPath, maxRedirects - 1).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(outputPath);
        reject(new Error(`Download failed: ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (error) => {
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
        reject(error);
      });
    });

    request.on('error', (error) => {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      reject(error);
    });
  });
}

/**
 * Extract archive based on file extension
 */
async function extractArchive(archivePath: string, extractPath: string): Promise<void> {
  const ext = path.extname(archivePath).toLowerCase();
  
  fs.mkdirSync(extractPath, { recursive: true });

  try {
    if (ext === '.zip') {
      // Use PowerShell on Windows, unzip on Unix
      if (process.platform === 'win32') {
        await execAsync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${extractPath}' -Force"`);
      } else {
        await execAsync(`unzip -q "${archivePath}" -d "${extractPath}"`);
      }
    } else if (ext === '.gz' || archivePath.includes('.tar.')) {
      // Handle .tar.gz, .tar.xz, etc.
      await execAsync(`tar -xf "${archivePath}" -C "${extractPath}"`);
    } else if (ext === '.phar') {
      // For .phar files, just copy them
      const targetPath = path.join(extractPath, path.basename(archivePath));
      fs.copyFileSync(archivePath, targetPath);
    } else {
      throw new Error(`Unsupported archive format: ${ext}`);
    }
    
    console.log(`✅ Extracted ${archivePath} to ${extractPath}`);
  } catch (error) {
    console.error(`❌ Failed to extract ${archivePath}:`, error);
    throw error;
  }
}

/**
 * Find the actual extracted directory (handles nested directories)
 */
function findExtractedBinary(basePath: string, expectedExecutable: string): string | null {
  function searchDir(dir: string, depth = 0): string | null {
    if (depth > 3) return null; // Prevent infinite recursion
    
    const items = fs.readdirSync(dir);
    
    // Look for the executable directly in this directory
    const executablePath = path.join(dir, expectedExecutable);
    if (fs.existsSync(executablePath)) {
      return dir;
    }
    
    // Look in subdirectories
    for (const item of items) {
      const itemPath = path.join(dir, item);
      if (fs.statSync(itemPath).isDirectory()) {
        const found = searchDir(itemPath, depth + 1);
        if (found) return found;
      }
    }
    
    return null;
  }
  
  return searchDir(basePath);
}

/**
 * Download and setup WordPress runtime binaries
 */
async function downloadWordPressRuntime(): Promise<void> {
  const platforms = ['win32-x64', 'win32-ia32', 'darwin-x64', 'darwin-arm64', 'linux-x64'];
  const baseOutputDir = path.join(__dirname, '..', 'extraResources', 'wordpress-runtime');
  
  console.log('🚀 Starting WordPress runtime download...');
  
  // Create base directory
  fs.mkdirSync(baseOutputDir, { recursive: true });
  
  for (const platformId of platforms) {
    console.log(`\n📦 Processing platform: ${platformId}`);
    
    const platformDir = path.join(baseOutputDir, platformId);
    fs.mkdirSync(platformDir, { recursive: true });
    
    for (const binary of BINARIES) {
      const config = binary.platforms[platformId];
      if (!config) {
        console.log(`⏭️ Skipping ${binary.name} for ${platformId} (not configured)`);
        continue;
      }
      
      console.log(`📥 Downloading ${binary.name} for ${platformId}...`);
      
      try {
        const tempDir = path.join(platformDir, '.temp');
        fs.mkdirSync(tempDir, { recursive: true });
        
        const fileName = path.basename(config.url);
        const downloadPath = path.join(tempDir, fileName);
        
        // Download
        await downloadFile(config.url, downloadPath);
        console.log(`✅ Downloaded ${binary.name}`);
        
        // Extract
        const extractDir = path.join(tempDir, 'extracted');
        await extractArchive(downloadPath, extractDir);
        
        // Find the actual binary location
        const binaryDir = findExtractedBinary(extractDir, config.executable);
        if (!binaryDir) {
          throw new Error(`Could not find ${config.executable} in extracted files`);
        }
        
        // Move to final location
        const finalDir = path.join(platformDir, config.extractTo || binary.name);
        if (fs.existsSync(finalDir)) {
          fs.rmSync(finalDir, { recursive: true, force: true });
        }
        
        fs.renameSync(binaryDir, finalDir);
        console.log(`📁 Moved ${binary.name} to ${finalDir}`);
        
        // Run post-processing
        if (config.postProcess) {
          await config.postProcess(finalDir);
        }
        
        // Verify executable exists
        const executablePath = path.join(finalDir, config.executable);
        if (!fs.existsSync(executablePath)) {
          throw new Error(`Executable not found at ${executablePath}`);
        }
        
        console.log(`✅ ${binary.name} ready at ${executablePath}`);
        
        // Clean up temp directory
        fs.rmSync(tempDir, { recursive: true, force: true });
        
      } catch (error) {
        console.error(`❌ Failed to setup ${binary.name} for ${platformId}:`, error);
        // Continue with other binaries
      }
    }
  }
  
  console.log('\n🎉 WordPress runtime download completed!');
}

// Run the download process
if (require.main === module) {
  downloadWordPressRuntime().catch(error => {
    console.error('❌ Download process failed:', error);
    process.exit(1);
  });
}

export { downloadWordPressRuntime };