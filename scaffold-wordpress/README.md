# WordPress Project

This is a WordPress project managed by Dyad. This scaffold provides a starting point for WordPress development with proper structure and configuration.

## Getting Started

1. **Installation**: WordPress core files will be automatically downloaded when you start the project
2. **Configuration**: Database and server settings are managed by Dyad
3. **Development**: Create your themes in `wordpress/wp-content/themes/` and plugins in `wordpress/wp-content/plugins/`

## Project Structure

```
.
├── wordpress/              # WordPress core files
│   ├── wp-content/
│   │   ├── themes/        # Your custom themes
│   │   ├── plugins/       # Your custom plugins
│   │   └── uploads/       # Media uploads
│   └── ...                # WordPress core files
├── wp-config.php          # WordPress configuration (auto-generated)
├── .wordpress-data/       # Local database and configs
├── AI_RULES.md           # AI development guidelines
└── README.md             # This file
```

## Development

### Creating a Theme

1. Create a new directory in `wordpress/wp-content/themes/`
2. Add required files:
   - `style.css` with theme header
   - `index.php` as the main template
   - `functions.php` for theme functionality

### Creating a Plugin

1. Create a new directory in `wordpress/wp-content/plugins/`
2. Add main plugin file with proper header
3. Organize code in subdirectories as needed

### Using WP-CLI

Dyad provides WP-CLI integration. You can run commands through the chat interface:
- Install plugins: `wp plugin install plugin-name`
- Create posts: `wp post create --post_title="Hello"`
- Manage users: `wp user list`

## Database Access

- Database runs locally on a dedicated port
- Access credentials are in `wp-config.php`
- Use WordPress database API for queries

## Debugging

Debug mode is enabled by default in development:
- Check `.wordpress-data/php-error.log` for PHP errors
- WordPress debug log in `wordpress/wp-content/debug.log`

## Resources

- [WordPress Developer Resources](https://developer.wordpress.org/)
- [Theme Development](https://developer.wordpress.org/themes/)
- [Plugin Development](https://developer.wordpress.org/plugins/)
- [WP-CLI Commands](https://developer.wordpress.org/cli/commands/)