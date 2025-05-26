import log from 'electron-log';
import { platform } from 'os';

const logger = log.scope('wordpress-installation-guide');

export interface InstallationGuidance {
  platform: string;
  missingDependencies: string[];
  automaticOptions: string[];
  manualInstructions: string[];
  troubleshootingTips: string[];
}

/**
 * Get installation guidance for missing WordPress dependencies
 */
export function getInstallationGuidance(missingDependencies: string[]): InstallationGuidance {
  const platformName = platform();
  
  switch (platformName) {
    case 'win32':
      return getWindowsGuidance(missingDependencies);
    case 'darwin':
      return getMacOSGuidance(missingDependencies);
    case 'linux':
      return getLinuxGuidance(missingDependencies);
    default:
      return getGenericGuidance(missingDependencies);
  }
}

/**
 * Windows installation guidance
 */
function getWindowsGuidance(missing: string[]): InstallationGuidance {
  const automaticOptions = [
    'Dyad will attempt to install portable versions (no admin required)',
    'Alternatively, run Dyad as Administrator for system-wide installation'
  ];
  
  const manualInstructions: string[] = [];
  const troubleshootingTips = [
    'If automatic installation fails, try running Dyad as Administrator',
    'You can install dependencies manually and restart Dyad',
    'Portable installations are stored in your user profile'
  ];
  
  missing.forEach(dep => {
    switch (dep) {
      case 'php':
        manualInstructions.push(
          'PHP: Download from https://windows.php.net/download/ or install via Chocolatey: choco install php'
        );
        break;
      case 'mysql':
      case 'mysqld':
        manualInstructions.push(
          'MySQL: Download from https://dev.mysql.com/downloads/mysql/ or install via Chocolatey: choco install mysql'
        );
        break;
      case 'wp-cli':
        manualInstructions.push(
          'WP-CLI: Download from https://wp-cli.org/ or install via Chocolatey: choco install wp-cli'
        );
        break;
    }
  });
  
  return {
    platform: 'Windows',
    missingDependencies: missing,
    automaticOptions,
    manualInstructions,
    troubleshootingTips
  };
}

/**
 * macOS installation guidance
 */
function getMacOSGuidance(missing: string[]): InstallationGuidance {
  const automaticOptions = [
    'Dyad will install Homebrew if needed (requires password)',
    'Dependencies will be installed via Homebrew automatically'
  ];
  
  const manualInstructions: string[] = [];
  const troubleshootingTips = [
    'If Homebrew installation fails, install it manually first',
    'You may be prompted for your password during installation',
    'Restart Terminal after installation to refresh PATH'
  ];
  
  missing.forEach(dep => {
    switch (dep) {
      case 'php':
        manualInstructions.push('PHP: brew install php');
        break;
      case 'mysql':
      case 'mysqld':
        manualInstructions.push('MySQL: brew install mysql && brew services start mysql');
        break;
      case 'wp-cli':
        manualInstructions.push('WP-CLI: brew install wp-cli');
        break;
    }
  });
  
  return {
    platform: 'macOS',
    missingDependencies: missing,
    automaticOptions,
    manualInstructions,
    troubleshootingTips
  };
}

/**
 * Linux installation guidance
 */
function getLinuxGuidance(missing: string[]): InstallationGuidance {
  const automaticOptions = [
    'WP-CLI can be installed automatically',
    'PHP and MySQL require manual installation via your package manager'
  ];
  
  const manualInstructions: string[] = [];
  const troubleshootingTips = [
    'Use your distribution\'s package manager (apt, yum, dnf, etc.)',
    'You may need sudo privileges for installation',
    'Make sure services are started after installation'
  ];
  
  missing.forEach(dep => {
    switch (dep) {
      case 'php':
        manualInstructions.push(
          'PHP: Ubuntu/Debian: sudo apt install php php-cli php-mysql',
          'PHP: CentOS/RHEL: sudo yum install php php-cli php-mysql',
          'PHP: Fedora: sudo dnf install php php-cli php-mysqlnd'
        );
        break;
      case 'mysql':
      case 'mysqld':
        manualInstructions.push(
          'MySQL: Ubuntu/Debian: sudo apt install mysql-server mysql-client',
          'MySQL: CentOS/RHEL: sudo yum install mysql-server mysql',
          'MySQL: Fedora: sudo dnf install mysql-server mysql',
          'Start service: sudo systemctl start mysql && sudo systemctl enable mysql'
        );
        break;
      case 'wp-cli':
        manualInstructions.push(
          'WP-CLI: Will be installed automatically by Dyad',
          'Manual: curl -O https://raw.githubusercontent.com/wp-cli/wp-cli/v2.10.0/phar/wp-cli.phar && chmod +x wp-cli.phar && sudo mv wp-cli.phar /usr/local/bin/wp'
        );
        break;
    }
  });
  
  return {
    platform: 'Linux',
    missingDependencies: missing,
    automaticOptions,
    manualInstructions,
    troubleshootingTips
  };
}

/**
 * Generic installation guidance
 */
function getGenericGuidance(missing: string[]): InstallationGuidance {
  return {
    platform: 'Unknown',
    missingDependencies: missing,
    automaticOptions: ['Limited automatic installation support'],
    manualInstructions: [
      'Please install the missing dependencies manually:',
      'PHP: Visit https://www.php.net/downloads.php',
      'MySQL: Visit https://dev.mysql.com/downloads/',
      'WP-CLI: Visit https://wp-cli.org/'
    ],
    troubleshootingTips: [
      'Ensure all binaries are in your system PATH',
      'Restart the application after manual installation',
      'Check official documentation for your operating system'
    ]
  };
}

/**
 * Log installation guidance to console
 */
export function logInstallationGuidance(guidance: InstallationGuidance): void {
  logger.info('📋 WordPress Dependencies Installation Guide');
  logger.info(`Platform: ${guidance.platform}`);
  logger.info(`Missing: ${guidance.missingDependencies.join(', ')}`);
  
  if (guidance.automaticOptions.length > 0) {
    logger.info('🤖 Automatic Options:');
    guidance.automaticOptions.forEach(option => logger.info(`  • ${option}`));
  }
  
  if (guidance.manualInstructions.length > 0) {
    logger.info('🔧 Manual Installation:');
    guidance.manualInstructions.forEach(instruction => logger.info(`  • ${instruction}`));
  }
  
  if (guidance.troubleshootingTips.length > 0) {
    logger.info('💡 Troubleshooting Tips:');
    guidance.troubleshootingTips.forEach(tip => logger.info(`  • ${tip}`));
  }
}