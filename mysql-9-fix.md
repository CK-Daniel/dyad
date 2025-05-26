# MySQL 9.2.0 Fix for Dyad

## Temporary Workaround

If the application still has issues after rebuilding, you can use this temporary workaround:

### Option 1: Use MySQL 8.0.x
```bash
# Uninstall MySQL 9.2.0
brew uninstall mysql

# Install MySQL 8.0
brew install mysql@8.0
brew link mysql@8.0

# Restart Dyad
```

### Option 2: Manual Database Setup
1. Start MySQL manually without the deprecated parameter:
```bash
mysqld --datadir=/Users/diliyaguev/dyad-apps/crimson-iguana-crawl/.wordpress-data/mysql --port=3306 --bind-address=127.0.0.1 --skip-networking=0 --console
```

2. In another terminal, create the WordPress database:
```bash
mysql -h 127.0.0.1 -P 3306 -u root -e "CREATE DATABASE IF NOT EXISTS wordpress CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

## Permanent Fix Applied

The code has been updated to:
1. Detect MySQL version correctly
2. NEVER use `default-authentication-plugin` for MySQL 9.x
3. Handle authentication through ALTER USER commands after startup
4. Provide better error logging and diagnostics

## Verification

After restarting Dyad, you should see in the logs:
- "MySQL 9.2 detected - this version does not support default-authentication-plugin"
- MySQL should start successfully without the deprecated parameter