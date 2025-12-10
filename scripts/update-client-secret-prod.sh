#!/bin/bash
# Script to update Client Secret in production database

echo "This script will update the Client Secret in production database."
echo "Make sure you have the correct ENCRYPTION_KEY and ALLEGRO_CLIENT_SECRET in production .env"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

ssh statex "cd allegro && node scripts/update-client-secret-simple.js"

