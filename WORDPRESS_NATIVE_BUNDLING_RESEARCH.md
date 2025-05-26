# WordPress Native Bundling Research for Electron App

## Overview
This document outlines research findings on bundling native PHP and MySQL binaries with an Electron app for a fully standalone WordPress environment.

## 1. How LocalWP/Local by Flywheel Bundles PHP and MySQL

LocalWP uses a structured approach to bundle server software:

### Directory Structure
- Binaries are stored in `extraResources/lightning-services/`
- Example path: `C:\Program Files (x86)\Local\resources\extraResources\lightning-services\php-7.3.5+10\bin\win64\php.exe`
- Each service (nginx, php, mysql, mariadb, mailhog) has its own subdirectory

### Key Features
- **Hot-swappable PHP versions**: Users can switch between different PHP versions easily
- **Handlebars templating**: Configuration files use `.hbs` extension for dynamic values
- **Service bundling**: All preferred services are bundled but can check for updates
- **Configuration management**: PHP.ini can be edited at `\Local Sites\{sitename}\conf\php\php.ini.hbs`

## 2. Platform-Specific Binary Distribution

### Using Electron Builder

#### Configuration Example
```json
{
  "build": {
    "extraResources": [
      {
        "from": "resources/${os}",
        "to": "Resources/bin",
        "filter": ["**/*"]
      }
    ],
    "asarUnpack": [
      "**/app/node_modules/binaries/*"
    ]
  }
}
```

### Multi-Architecture Support

#### For macOS (Intel + Apple Silicon)
```bash
# Build for both architectures
electron-builder --mac --x64 --arm64

# Or build universal binary
electron-builder --mac --universal
```

#### Key Considerations
- Must compile native modules for each architecture
- Use `@electron/universal` to merge x64 and arm64 apps
- x64 apps run under Rosetta 2 on M1 but with performance penalty

### Cross-Platform Building Solutions

1. **CI/CD Services** (Recommended)
   - Travis CI for macOS/Linux
   - AppVeyor for Windows
   - GitHub Actions for all platforms

2. **Docker**
   - Available for Linux builds
   - Limited support for Windows with native dependencies

3. **Platform Requirements**
   - macOS: Code signing only works on macOS
   - Windows: Requires Wine 2.0+ and Mono 4.2+ for cross-compilation

## 3. Running Without Admin Privileges

### Key Strategies

1. **Port Configuration**
   - Use ports above 1024 (e.g., 8080 for Apache, 3306 for MySQL)
   - Configure to listen on localhost/127.0.0.1 only

2. **Portable Solutions**
   - XAMPP Portable
   - Uniform Server
   - USBWebserver
   - Custom portable MySQL from zip archive

3. **MySQL Portable Setup**
   ```bash
   # Download MySQL Community Edition (zip)
   # Extract to application directory
   # Run from bin folder without installation
   ./mysqld --console --standalone
   ```

## 4. Minimal PHP Extensions for WordPress

### Required Extensions
- **json** (bundled in PHP 8.0+)
- **mysqli** or **mysqlnd** (database connectivity)

### Highly Recommended Extensions
- **curl** - Remote requests
- **dom** - XML/HTML manipulation
- **exif** - Image metadata
- **fileinfo** - MIME type detection
- **hash** - Cryptography
- **imagick** or **gd** - Image processing
- **zip** - Plugin/theme updates
- **openssl** - SSL connections
- **mbstring** - Multi-byte strings
- **xml** - XML parsing

### Performance Extensions
- **opcache** - Bytecode caching
- **apcu** - User cache
- **memcached** or **redis** - Object caching

## 5. Architecture Support

### Handling Different Architectures

1. **Separate Builds**
   - x64 for Intel processors
   - arm64 for Apple Silicon
   - Different builds for each platform

2. **Universal Binaries (macOS)**
   - Combine x64 and arm64 into single app
   - Larger file size but single distribution

3. **Binary Organization**
   ```
   resources/
   ├── win32/
   │   ├── x64/
   │   │   ├── php.exe
   │   │   └── mysqld.exe
   │   └── ia32/
   ├── darwin/
   │   ├── x64/
   │   └── arm64/
   └── linux/
       └── x64/
   ```

## 6. Typical Binary Sizes

### PHP Binaries
- **Basic PHP**: ~25-50 MB per architecture
- **With common extensions**: ~75-100 MB
- **Full distribution**: ~150-200 MB

### MySQL/MariaDB Binaries
- **MySQL minimal**: ~200-300 MB
- **MariaDB portable**: ~150-250 MB
- **With data directory**: Additional 50-100 MB

### Total Bundle Sizes
- **Per platform**: 400-600 MB
- **Universal app (macOS)**: 800-1200 MB
- **All platforms bundled**: 2-3 GB

## Best Practices and Recommendations

1. **Use Lightweight Alternatives**
   - Consider SQLite for smaller projects
   - Use embedded databases when possible

2. **Lazy Loading**
   - Download binaries on first run
   - Platform-specific installers

3. **Binary Management**
   ```javascript
   // Example binary path resolution
   const getBinaryPath = () => {
     const platform = process.platform;
     const arch = process.arch;
     const resourcesPath = process.resourcesPath;
     
     return path.join(
       resourcesPath,
       'binaries',
       platform,
       arch,
       'php.exe'
     );
   };
   ```

4. **Configuration**
   - Use dynamic port allocation
   - Store configs in user data directory
   - Handle permissions gracefully

5. **Security Considerations**
   - Bind to localhost only
   - Use random ports when possible
   - Implement proper authentication

## Alternative Approaches

1. **WordPress Playground** (WebAssembly)
   - Runs PHP in the browser
   - No native binaries needed
   - Limited functionality

2. **Docker Integration**
   - Ship with Docker Compose
   - Requires Docker installation
   - More complex but cleaner

3. **Cloud-based Solutions**
   - Remote PHP/MySQL servers
   - Minimal local footprint
   - Requires internet connection

## Conclusion

Bundling native PHP and MySQL with an Electron app is feasible but comes with significant challenges:
- Large bundle sizes (400-600 MB per platform)
- Complex multi-architecture support
- Platform-specific build requirements
- Permission considerations

For a WordPress-focused Electron app, consider:
1. Starting with WordPress Playground (WebAssembly) for simpler deployment
2. Offering native binaries as an optional "pro" feature
3. Using platform-specific installers to manage binary distribution
4. Implementing lazy loading of binaries based on user needs