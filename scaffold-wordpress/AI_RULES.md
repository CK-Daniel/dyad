# AI Rules for WordPress Development

This is a WordPress project managed by Dyad. Follow these guidelines when working with this codebase:

## Project Structure

```
.
├── wordpress/              # WordPress core files (managed)
│   ├── wp-content/
│   │   ├── themes/        # Custom themes
│   │   ├── plugins/       # Custom plugins
│   │   └── uploads/       # Media uploads
│   └── ...                # WordPress core files
├── wp-config.php          # WordPress configuration
├── .wordpress-data/       # Local database and PHP config
└── AI_RULES.md           # This file
```

## Development Guidelines

### Theme Development

1. **Create themes in `wordpress/wp-content/themes/`**
   - Use child themes when customizing existing themes
   - Follow WordPress coding standards
   - Use proper text domains for internationalization

2. **Theme Structure**
   ```
   theme-name/
   ├── style.css         # Required: Theme header
   ├── index.php         # Required: Main template
   ├── functions.php     # Theme functions
   ├── header.php        # Header template
   ├── footer.php        # Footer template
   └── ...
   ```

3. **Best Practices**
   - Escape all output: `esc_html()`, `esc_attr()`, `esc_url()`
   - Use WordPress functions: `wp_enqueue_style()`, `wp_enqueue_script()`
   - Implement proper hooks: `add_action()`, `add_filter()`

### Plugin Development

1. **Create plugins in `wordpress/wp-content/plugins/`**
   - Use unique prefixes for functions and classes
   - Include proper plugin headers
   - Follow WordPress plugin guidelines

2. **Plugin Structure**
   ```
   plugin-name/
   ├── plugin-name.php   # Main plugin file with header
   ├── includes/         # PHP includes
   ├── assets/          # CSS, JS, images
   └── languages/       # Translation files
   ```

3. **Security**
   - Validate and sanitize all input
   - Use nonces for form submissions
   - Check user capabilities
   - Prepare SQL queries properly

### Database Operations

1. **Use WordPress Database API**
   ```php
   global $wpdb;
   $results = $wpdb->get_results(
       $wpdb->prepare("SELECT * FROM {$wpdb->posts} WHERE ID = %d", $post_id)
   );
   ```

2. **Custom Tables**
   - Prefix with `$wpdb->prefix`
   - Create during plugin activation
   - Remove during uninstallation

### WordPress Hooks

1. **Action Hooks**
   ```php
   add_action('init', 'my_custom_init');
   add_action('wp_enqueue_scripts', 'my_enqueue_scripts');
   ```

2. **Filter Hooks**
   ```php
   add_filter('the_content', 'my_content_filter');
   add_filter('wp_title', 'my_title_filter', 10, 2);
   ```

### File Operations

1. **Use WordPress File System API**
   ```php
   WP_Filesystem();
   global $wp_filesystem;
   $wp_filesystem->put_contents($file, $content);
   ```

2. **Upload Handling**
   - Use `wp_handle_upload()`
   - Validate file types
   - Check file sizes

### AJAX Operations

1. **Admin AJAX**
   ```php
   add_action('wp_ajax_my_action', 'my_ajax_handler');
   add_action('wp_ajax_nopriv_my_action', 'my_ajax_handler');
   ```

2. **REST API**
   ```php
   register_rest_route('myplugin/v1', '/data/', array(
       'methods' => 'GET',
       'callback' => 'my_api_callback',
   ));
   ```

## Available Dyad Operations

When working with AI assistance, you can use these special tags:

- `<dyad-write>` - Create or modify files
- `<dyad-delete>` - Remove files
- `<dyad-rename>` - Rename files
- `<dyad-wp-cli>` - Execute WP-CLI commands
- `<dyad-wp-db>` - Execute database queries

## Testing

1. **PHP Unit Tests**
   - Place in `tests/` directory
   - Use PHPUnit for WordPress
   - Mock WordPress functions as needed

2. **JavaScript Tests**
   - Use Jest or similar
   - Test frontend interactions
   - Mock AJAX calls

## Performance

1. **Caching**
   - Use WordPress Transients API
   - Implement object caching
   - Optimize database queries

2. **Asset Optimization**
   - Minify CSS and JavaScript
   - Use WordPress asset versioning
   - Lazy load images

## Security Checklist

- [ ] Escape all output
- [ ] Validate and sanitize input
- [ ] Use nonces for forms
- [ ] Check user capabilities
- [ ] Prepare SQL queries
- [ ] Validate file uploads
- [ ] Use HTTPS for external requests
- [ ] Keep WordPress and plugins updated

## Debugging

Enable debugging in `wp-config.php`:
```php
define('WP_DEBUG', true);
define('WP_DEBUG_LOG', true);
define('WP_DEBUG_DISPLAY', false);
```

## Resources

- [WordPress Codex](https://codex.wordpress.org/)
- [WordPress Developer Handbook](https://developer.wordpress.org/)
- [WordPress Coding Standards](https://developer.wordpress.org/coding-standards/)
- [Theme Handbook](https://developer.wordpress.org/themes/)
- [Plugin Handbook](https://developer.wordpress.org/plugins/)