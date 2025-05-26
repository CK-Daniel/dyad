import { app } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import https from 'https';
import { pipeline } from 'stream/promises';
import * as tar from 'tar';
import log from 'electron-log';

const logger = log.scope('wordpress-core-utils');

const WORDPRESS_VERSION = '6.4.2';
const WORDPRESS_DOWNLOAD_URL = `https://wordpress.org/wordpress-${WORDPRESS_VERSION}.tar.gz`;

/**
 * Get the path to the WordPress core template
 */
export function getWordPressCoreTemplatePath(): string {
  const resourcesPath = app.isPackaged 
    ? process.resourcesPath 
    : path.join(__dirname, '../../../');
  
  return path.join(resourcesPath, 'extraResources', 'wordpress-core', 'wordpress');
}

/**
 * Download WordPress core files
 */
async function downloadWordPressCore(destPath: string): Promise<void> {
  const tempFile = path.join(destPath, '..', 'wordpress-temp.tar.gz');
  
  logger.info(`Downloading WordPress ${WORDPRESS_VERSION}...`);
  
  // Download the file
  await new Promise((resolve, reject) => {
    const file = createWriteStream(tempFile);
    
    https.get(WORDPRESS_DOWNLOAD_URL, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download WordPress: ${response.statusCode}`));
        return;
      }
      
      pipeline(response, file)
        .then(() => resolve(undefined))
        .catch(reject);
    }).on('error', reject);
  });
  
  logger.info('Extracting WordPress files...');
  
  // Extract the archive
  await tar.extract({
    file: tempFile,
    cwd: path.dirname(destPath),
  });
  
  // Clean up temp file
  await fs.unlink(tempFile);
  
  logger.info('WordPress core downloaded successfully');
}

/**
 * Copy WordPress core files to app directory
 */
export async function setupWordPressCore(appPath: string): Promise<void> {
  const wordpressDir = path.join(appPath, 'wordpress');
  
  // Check if WordPress is already installed
  const wpContentPath = path.join(wordpressDir, 'wp-content');
  const wpContentExists = await fs.access(wpContentPath).then(() => true).catch(() => false);
  
  if (wpContentExists) {
    logger.info('WordPress core already exists, skipping setup');
    return;
  }
  
  logger.info(`Setting up WordPress core at ${wordpressDir}`);
  
  // First try to copy from bundled template
  const templatePath = getWordPressCoreTemplatePath();
  const templateExists = await fs.access(templatePath).then(() => true).catch(() => false);
  
  if (templateExists) {
    logger.info('Copying WordPress from bundled template...');
    await copyDirectory(templatePath, wordpressDir);
  } else {
    logger.info('Bundled WordPress not found, downloading...');
    await downloadWordPressCore(wordpressDir);
  }
  
  // Create additional directories
  await fs.mkdir(path.join(wordpressDir, 'wp-content', 'uploads'), { recursive: true });
  await fs.mkdir(path.join(wordpressDir, 'wp-content', 'upgrade'), { recursive: true });
  
  // Set proper permissions for uploads directory
  await fs.chmod(path.join(wordpressDir, 'wp-content', 'uploads'), 0o755);
  
  logger.info('WordPress core setup complete');
}

/**
 * Recursively copy a directory
 */
async function copyDirectory(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  
  const entries = await fs.readdir(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Create a default theme for WordPress
 */
export async function createDefaultTheme(appPath: string, themeName: string = 'custom-theme'): Promise<void> {
  const themeDir = path.join(appPath, 'wordpress', 'wp-content', 'themes', themeName);
  
  // Check if theme already exists
  const themeExists = await fs.access(themeDir).then(() => true).catch(() => false);
  if (themeExists) {
    logger.info(`Theme ${themeName} already exists`);
    return;
  }
  
  logger.info(`Creating default theme: ${themeName}`);
  
  await fs.mkdir(themeDir, { recursive: true });
  
  // Copy from scaffold-wordpress if available
  const scaffoldPath = path.join(
    app.isPackaged ? process.resourcesPath : path.join(__dirname, '../../../'),
    'scaffold-wordpress',
    'wordpress',
    'wp-content',
    'themes',
    'custom-theme'
  );
  
  const scaffoldExists = await fs.access(scaffoldPath).then(() => true).catch(() => false);
  
  if (scaffoldExists) {
    logger.info('Copying theme from scaffold...');
    await copyDirectory(scaffoldPath, themeDir);
  } else {
    logger.info('Creating minimal theme files...');
    
    // Create minimal theme files
    const styleContent = `/*
Theme Name: ${themeName}
Theme URI: http://example.com/
Author: Dyad Developer
Author URI: http://example.com/
Description: A custom WordPress theme created with Dyad
Version: 1.0
License: GPL v2 or later
Text Domain: ${themeName}
*/

/* Basic styles */
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  line-height: 1.6;
  color: #333;
  margin: 0;
  padding: 0;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
}

header {
  background: #0073aa;
  color: white;
  padding: 1rem 0;
}

header h1 {
  margin: 0;
}

main {
  padding: 2rem 0;
}

footer {
  background: #f5f5f5;
  padding: 2rem 0;
  margin-top: 2rem;
  text-align: center;
}`;
    
    const indexContent = `<?php
/**
 * The main template file
 *
 * @package ${themeName}
 */

get_header(); ?>

<main id="main" class="site-main">
  <div class="container">
    <?php
    if ( have_posts() ) :
      while ( have_posts() ) :
        the_post();
        ?>
        <article id="post-<?php the_ID(); ?>" <?php post_class(); ?>>
          <header class="entry-header">
            <?php the_title( '<h2 class="entry-title"><a href="' . esc_url( get_permalink() ) . '">', '</a></h2>' ); ?>
          </header>
          
          <div class="entry-content">
            <?php the_excerpt(); ?>
          </div>
        </article>
        <?php
      endwhile;
      
      the_posts_navigation();
    else :
      ?>
      <p><?php esc_html_e( 'No posts found.', '${themeName}' ); ?></p>
      <?php
    endif;
    ?>
  </div>
</main>

<?php
get_sidebar();
get_footer();`;
    
    const headerContent = `<?php
/**
 * The header template
 *
 * @package ${themeName}
 */
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
  <meta charset="<?php bloginfo( 'charset' ); ?>">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <?php wp_head(); ?>
</head>

<body <?php body_class(); ?>>
<?php wp_body_open(); ?>

<header id="masthead" class="site-header">
  <div class="container">
    <h1 class="site-title">
      <a href="<?php echo esc_url( home_url( '/' ) ); ?>">
        <?php bloginfo( 'name' ); ?>
      </a>
    </h1>
    <p class="site-description"><?php bloginfo( 'description' ); ?></p>
  </div>
</header>`;
    
    const footerContent = `<?php
/**
 * The footer template
 *
 * @package ${themeName}
 */
?>

<footer id="colophon" class="site-footer">
  <div class="container">
    <p>&copy; <?php echo date('Y'); ?> <?php bloginfo( 'name' ); ?>. All rights reserved.</p>
  </div>
</footer>

<?php wp_footer(); ?>
</body>
</html>`;
    
    const functionsContent = `<?php
/**
 * Theme functions and definitions
 *
 * @package ${themeName}
 */

// Theme setup
function ${themeName.replace(/-/g, '_')}_setup() {
    // Add default posts and comments RSS feed links to head
    add_theme_support( 'automatic-feed-links' );
    
    // Let WordPress manage the document title
    add_theme_support( 'title-tag' );
    
    // Enable support for Post Thumbnails
    add_theme_support( 'post-thumbnails' );
    
    // Register navigation menus
    register_nav_menus( array(
        'primary' => __( 'Primary Menu', '${themeName}' ),
    ) );
}
add_action( 'after_setup_theme', '${themeName.replace(/-/g, '_')}_setup' );

// Enqueue scripts and styles
function ${themeName.replace(/-/g, '_')}_scripts() {
    wp_enqueue_style( '${themeName}-style', get_stylesheet_uri(), array(), '1.0.0' );
}
add_action( 'wp_enqueue_scripts', '${themeName.replace(/-/g, '_')}_scripts' );`;
    
    const sidebarContent = `<?php
/**
 * The sidebar template
 *
 * @package ${themeName}
 */

if ( ! is_active_sidebar( 'sidebar-1' ) ) {
    return;
}
?>

<aside id="secondary" class="widget-area">
    <?php dynamic_sidebar( 'sidebar-1' ); ?>
</aside>`;
    
    // Write theme files
    await fs.writeFile(path.join(themeDir, 'style.css'), styleContent);
    await fs.writeFile(path.join(themeDir, 'index.php'), indexContent);
    await fs.writeFile(path.join(themeDir, 'header.php'), headerContent);
    await fs.writeFile(path.join(themeDir, 'footer.php'), footerContent);
    await fs.writeFile(path.join(themeDir, 'functions.php'), functionsContent);
    await fs.writeFile(path.join(themeDir, 'sidebar.php'), sidebarContent);
  }
  
  logger.info('Default theme created successfully');
}