#!/bin/bash
# MySQL 9.x wrapper for macOS to bypass root check issue
# This script is used when MySQL 9.x incorrectly detects the user as root

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# MySQL 9.x on macOS sometimes incorrectly detects non-root users as root
# This wrapper ensures MySQL runs with proper environment
if [[ "$OSTYPE" == "darwin"* ]]; then
    # On macOS, ensure we're not actually root
    if [ "$EUID" -eq 0 ]; then 
        echo "ERROR: Cannot run MySQL as root"
        exit 1
    fi
    
    # Run mysqld with a clean environment to avoid detection issues
    exec /usr/bin/env -i \
        PATH="$PATH" \
        HOME="$HOME" \
        USER="$USER" \
        TMPDIR="$TMPDIR" \
        mysqld "$@"
else
    # On other systems, just pass through
    exec mysqld "$@"
fi