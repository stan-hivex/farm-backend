#!/bin/bash
set -e
cd /opt/render/project
export NODE_ENV=production
export WEB_CONCURRENCY=${WEB_CONCURRENCY:-2}
node dist/src/main.js
