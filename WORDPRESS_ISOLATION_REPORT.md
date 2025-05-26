# WordPress Isolation Report

## Executive Summary

The WordPress implementation in Dyad has **proper isolation mechanisms** in place to ensure multiple WordPress apps can run simultaneously without interference. Each WordPress instance is fully isolated with its own ports, data directories, and runtime processes.

## 1. Port Allocation Isolation ✅

### Mechanism
- Each WordPress app receives **unique ports** for both PHP and MySQL services
- Port allocation is handled by `allocateWordPressPorts()` in `wordpress_binary_utils.ts`
- The system tries default ports first (PHP: 8080, MySQL: 3306), then finds available alternatives
- Port range: Default port + up to 1000 for finding alternatives

### Implementation
```typescript
// From wordpress_binary_utils.ts
export async function allocateWordPressPorts(): Promise<{
  phpPort: number;
  mysqlPort: number;
}> {
  const phpPort = await getAvailablePort(8080);
  const mysqlPort = await getAvailablePort(3306);
  return { phpPort, mysqlPort };
}
```

### Verification
- Ports are checked for availability before allocation
- Each app stores its allocated ports in the database (`phpPort` and `mysqlPort` columns)
- Runtime validates ports are not in use before starting services

## 2. Data Directory Isolation ✅

### Mechanism
- Each app has its own **separate data directories**
- MySQL data: `{appPath}/.wordpress-data/mysql/`
- WordPress files: `{appPath}/wordpress/`
- PHP config: `{appPath}/.wordpress-data/php.ini`
- PHP sessions: `{appPath}/.wordpress-data/sessions/`

### Implementation
```typescript
// From wordpress_binary_utils.ts
export function getMySQLDataDir(appPath: string): string {
  return path.join(appPath, '.wordpress-data', 'mysql');
}

export function getWordPressDir(appPath: string): string {
  return path.join(appPath, 'wordpress');
}
```

### Benefits
- Complete data isolation between apps
- No shared MySQL databases
- Independent WordPress installations
- App-specific configurations

## 3. Process Tracking Isolation ✅

### Mechanism
- `WordPressRuntime` class maintains a **Map of processes per app ID**
- Each app ID maps to its own process information
- Process tracking includes both MySQL and PHP processes

### Implementation
```typescript
// From wordpress_runtime.ts
export class WordPressRuntime {
  private processes: Map<string, WordPressProcess> = new Map();
  
  // Each WordPressProcess contains:
  // - mysql: ChildProcess
  // - php: ChildProcess
  // - mysqlPort: number
  // - phpPort: number
  // - appPath: string
}
```

### Features
- Apps are tracked by unique app ID
- Runtime can check if specific app is running: `isRunning(appId)`
- Get all running processes: `getRunningProcesses()`
- Individual app control: `start()`, `stop()`, `stopAll()`

## 4. Configuration Isolation ✅

### Mechanism
- Each app has its own configuration files
- `wp-config.php`: WordPress configuration with unique database connection
- `php.ini`: PHP settings specific to each app
- Unique authentication keys and salts per installation

### Implementation
- `wp-config.php` points to app-specific MySQL port
- PHP configuration includes app-specific paths
- Session storage isolated per app

## 5. Cleanup and Resource Management ✅

### App Deletion
When a WordPress app is deleted:
1. WordPress runtime is stopped (`wordpressRuntime.stop()`)
2. MySQL and PHP processes are terminated
3. Ports are released (set to null in database)
4. All app files are removed recursively
5. Database records are deleted

### Process Cleanup
- Graceful MySQL shutdown attempted first
- Fallback to process termination if needed
- Tree-kill ensures child processes are cleaned up
- Process map is updated to remove stopped apps

## 6. Database Schema Support ✅

The database schema properly supports WordPress apps:
```sql
-- From schema.ts
appType: text("app_type", { enum: ["react", "wordpress"] }).default("react"),
mysqlPort: integer("mysql_port"),
phpPort: integer("php_port"),
```

## Potential Issues and Recommendations

### 1. Port Range Limitation
**Issue**: Only 1000 ports are scanned for alternatives
**Recommendation**: Consider expanding range or implementing a port pool manager

### 2. Resource Limits
**Issue**: No apparent limits on number of simultaneous WordPress instances
**Recommendation**: Implement resource management to prevent system overload

### 3. Error Recovery
**Issue**: Port allocation doesn't persist failed attempts
**Recommendation**: Track recently failed ports to avoid repeated allocation attempts

### 4. Security Considerations
**Issue**: MySQL runs without password (root user)
**Recommendation**: Consider adding optional authentication for production use

## Conclusion

WordPress isolation in Dyad is **properly implemented** with:
- ✅ Unique port allocation per app
- ✅ Separate data directories
- ✅ Independent process tracking
- ✅ Isolated configurations
- ✅ Proper cleanup mechanisms
- ✅ Database support for WordPress apps

Multiple WordPress apps can run simultaneously without cross-contamination. The architecture ensures complete isolation at the network, filesystem, and process levels.