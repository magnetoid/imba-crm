#!/bin/sh

# Start the Node.js backend in the background
echo "Starting Model Router backend..."
node packages/model-router/dist/index.js &

# Start Nginx in the foreground to serve the frontend
echo "Starting Nginx frontend server..."
nginx -g "daemon off;"
