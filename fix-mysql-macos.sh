#!/bin/bash

# Fix MySQL 9.2.0 on macOS
echo "Fixing MySQL 9.2.0 permissions for Dyad..."

# Get the MySQL data directory
MYSQL_DATA_DIR="$HOME/dyad-apps/crimson-iguana-crawl/.wordpress-data/mysql"

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo "ERROR: Do not run this script as root/sudo"
   exit 1
fi

# Create a MySQL config file for Dyad
MYSQL_CONFIG="$HOME/.dyad-mysql.cnf"
cat > "$MYSQL_CONFIG" << EOF
[mysqld]
# Security settings for local development
skip-grant-tables
skip-networking=0
bind-address=127.0.0.1

# Remove the problematic authentication plugin
# (not needed for MySQL 9.x)

# Data directory
datadir=$MYSQL_DATA_DIR

# Port
port=3306

# Logging
console
log-error-verbosity=3
EOF

echo "Created MySQL config at: $MYSQL_CONFIG"

# Alternative: Start MySQL manually for testing
echo ""
echo "To test MySQL manually, run:"
echo "mysqld --defaults-file=$MYSQL_CONFIG"

# Fix ownership of data directory
if [ -d "$MYSQL_DATA_DIR" ]; then
    echo "Fixing ownership of MySQL data directory..."
    chmod -R 755 "$MYSQL_DATA_DIR"
fi

echo ""
echo "Done! Now restart Dyad."