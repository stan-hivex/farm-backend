# Production Monitoring & Logging Setup

## 1. Application Monitoring
```bash
# Install PM2 for process management
npm install -g pm2

# Create ecosystem file
pm2 init

# Start with PM2
pm2 start dist/main.js --name farm-backend
pm2 save
pm2 startup
```

## 2. Logging Configuration
Your app already uses Winston for logging. In production:

```typescript
// In your main.ts, ensure proper log levels
if (config.get('NODE_ENV') === 'production') {
  // Log to files and external service
  // Implement log rotation
}
```

## 3. Health Checks
```bash
# Health endpoint
GET /api/v1/health

# Readiness probe
GET /api/v1/health/ready

# Liveness probe
GET /api/v1/health/live
```

## 4. Monitoring Tools to Consider
- **Prometheus + Grafana**: Metrics collection and visualization
- **ELK Stack**: Elasticsearch, Logstash, Kibana for log analysis
- **Sentry**: Error tracking and performance monitoring
- **DataDog/New Relic**: Application performance monitoring

## 5. Security Monitoring
- Set up alerts for:
  - Failed login attempts
  - Unusual API usage patterns
  - Database connection issues
  - High error rates

## 6. Backup Strategy
```bash
# Database backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -h localhost -U user -d farm_backend > backup_$DATE.sql

# Automated backup with cron
# 0 2 * * * /path/to/backup.sh
```

## 7. SSL Certificate Management
```bash
# Let's Encrypt for free SSL
certbot --nginx -d api.yourdomain.com

# Auto-renewal
certbot renew --dry-run
```