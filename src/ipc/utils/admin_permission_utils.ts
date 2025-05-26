import { dialog, shell } from 'electron';
import { spawn } from 'child_process';
import { platform } from 'os';
import log from 'electron-log';

const logger = log.scope('admin-permission-utils');

export interface AdminPermissionResult {
  granted: boolean;
  userCancelled: boolean;
  error?: string;
}

/**
 * Request admin/elevated privileges from the user
 */
export async function requestAdminPermission(reason: string): Promise<AdminPermissionResult> {
  logger.info(`Requesting admin permission: ${reason}`);
  
  // Show dialog explaining why admin permissions are needed
  const response = await dialog.showMessageBox({
    type: 'question',
    title: 'Administrator Permissions Required',
    message: 'WordPress Dependencies Installation',
    detail: `${reason}\n\nThis requires administrator privileges to install system-wide dependencies. Would you like to continue?`,
    buttons: ['Install with Admin Rights', 'Cancel', 'Install Portable (No Admin)'],
    defaultId: 2, // Default to portable installation
    cancelId: 1,
    icon: undefined
  });
  
  if (response.response === 1) {
    // User cancelled
    return { granted: false, userCancelled: true };
  }
  
  if (response.response === 2) {
    // User chose portable installation
    return { granted: false, userCancelled: false };
  }
  
  // User chose to proceed with admin installation
  try {
    const result = await attemptElevation();
    return result;
  } catch (error) {
    logger.error('Failed to elevate privileges:', error);
    return { 
      granted: false, 
      userCancelled: false, 
      error: `Failed to obtain administrator privileges: ${error}` 
    };
  }
}

/**
 * Attempt to elevate privileges based on platform
 */
async function attemptElevation(): Promise<AdminPermissionResult> {
  const platformName = platform();
  
  switch (platformName) {
    case 'win32':
      return attemptWindowsElevation();
    case 'darwin':
      return attemptMacOSElevation();
    case 'linux':
      return attemptLinuxElevation();
    default:
      return { 
        granted: false, 
        userCancelled: false, 
        error: 'Platform not supported for elevation' 
      };
  }
}

/**
 * Windows elevation using UAC
 */
async function attemptWindowsElevation(): Promise<AdminPermissionResult> {
  return new Promise((resolve) => {
    // Test elevation by trying to access an admin-required location
    const testCommand = 'net session >nul 2>&1';
    
    const child = spawn('cmd', ['/c', testCommand], {
      stdio: 'pipe',
      shell: true
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        // Already running as admin
        resolve({ granted: true, userCancelled: false });
      } else {
        // Need to restart with elevation
        showElevationInstructions('Windows');
        resolve({ granted: false, userCancelled: false, error: 'Please restart Dyad as Administrator' });
      }
    });
    
    child.on('error', (error) => {
      resolve({ granted: false, userCancelled: false, error: error.message });
    });
  });
}

/**
 * macOS elevation using sudo
 */
async function attemptMacOSElevation(): Promise<AdminPermissionResult> {
  return new Promise((resolve) => {
    // Test if we can use sudo without password (TouchID/password already cached)
    const testCommand = 'sudo -n true';
    
    const child = spawn('sh', ['-c', testCommand], {
      stdio: 'pipe'
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        // sudo available without password prompt
        resolve({ granted: true, userCancelled: false });
      } else {
        // Need password - show instructions
        showElevationInstructions('macOS');
        resolve({ granted: false, userCancelled: false, error: 'Sudo authentication required' });
      }
    });
    
    child.on('error', (error) => {
      resolve({ granted: false, userCancelled: false, error: error.message });
    });
  });
}

/**
 * Linux elevation using sudo
 */
async function attemptLinuxElevation(): Promise<AdminPermissionResult> {
  return new Promise((resolve) => {
    // Test sudo availability
    const testCommand = 'sudo -n true';
    
    const child = spawn('sh', ['-c', testCommand], {
      stdio: 'pipe'
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ granted: true, userCancelled: false });
      } else {
        showElevationInstructions('Linux');
        resolve({ granted: false, userCancelled: false, error: 'Sudo authentication required' });
      }
    });
    
    child.on('error', (error) => {
      resolve({ granted: false, userCancelled: false, error: error.message });
    });
  });
}

/**
 * Show platform-specific elevation instructions
 */
async function showElevationInstructions(platformName: string): Promise<void> {
  let instructions = '';
  let showOpenInstructions = false;
  
  switch (platformName) {
    case 'Windows':
      instructions = `To install WordPress dependencies system-wide:

1. Close Dyad
2. Right-click on Dyad and select "Run as administrator"
3. Try creating a WordPress app again

Alternatively, Dyad can install portable versions that don't require admin rights.`;
      break;
      
    case 'macOS':
      instructions = `To install WordPress dependencies system-wide:

1. Open Terminal
2. Run the installation commands manually (Dyad will show these in the logs)
3. You'll be prompted for your password during installation

Alternatively, Dyad can use Homebrew with your permission.`;
      break;
      
    case 'Linux':
      instructions = `To install WordPress dependencies system-wide:

1. Open Terminal
2. Run the installation commands manually with sudo
3. Or grant sudo access to your user account

Example: sudo apt install php mysql-server
Then restart Dyad.`;
      showOpenInstructions = true;
      break;
  }
  
  const response = await dialog.showMessageBox({
    type: 'info',
    title: 'Installation Instructions',
    message: `${platformName} Administrator Setup`,
    detail: instructions,
    buttons: showOpenInstructions ? ['OK', 'Open Terminal'] : ['OK'],
    defaultId: 0
  });
  
  if (showOpenInstructions && response.response === 1) {
    // Open terminal on Linux
    try {
      await shell.openExternal('terminal://');
    } catch {
      // Fallback - try common terminal commands
      const terminals = ['gnome-terminal', 'konsole', 'xterm', 'x-terminal-emulator'];
      for (const term of terminals) {
        try {
          spawn(term, [], { detached: true, stdio: 'ignore' });
          break;
        } catch {
          // Continue to next terminal
        }
      }
    }
  }
}

/**
 * Check if currently running with admin privileges
 */
export async function isRunningAsAdmin(): Promise<boolean> {
  const platformName = platform();
  
  return new Promise((resolve) => {
    let testCommand: string;
    
    switch (platformName) {
      case 'win32':
        testCommand = 'net session >nul 2>&1';
        break;
      case 'darwin':
      case 'linux':
        testCommand = 'sudo -n true';
        break;
      default:
        resolve(false);
        return;
    }
    
    const child = spawn('sh', ['-c', testCommand], {
      stdio: 'pipe'
    });
    
    child.on('close', (code) => {
      resolve(code === 0);
    });
    
    child.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Show a user-friendly dialog about WordPress dependencies
 */
export async function showWordPressDependenciesDialog(): Promise<'install' | 'portable' | 'cancel'> {
  const response = await dialog.showMessageBox({
    type: 'question',
    title: 'WordPress Dependencies Required',
    message: 'WordPress Development Setup',
    detail: `Dyad needs PHP, MySQL, and WP-CLI to enable WordPress development.

Choose your installation preference:

• System-wide: Installs dependencies globally (requires admin rights)
• Portable: Installs dependencies only for Dyad (no admin required)
• Cancel: Skip WordPress setup for now`,
    buttons: ['System-wide Installation', 'Portable Installation', 'Cancel'],
    defaultId: 1, // Default to portable
    cancelId: 2
  });
  
  switch (response.response) {
    case 0:
      return 'install';
    case 1:
      return 'portable';
    default:
      return 'cancel';
  }
}