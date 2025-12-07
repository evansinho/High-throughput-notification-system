# Deployment Guide

This guide covers deploying the Notification System to production environments using Docker and Kubernetes.

---

## Table of Contents

1. [Docker Deployment](#docker-deployment)
2. [Kubernetes Deployment](#kubernetes-deployment)
3. [Environment Configuration](#environment-configuration)
4. [Database Migration](#database-migration)
5. [Monitoring Setup](#monitoring-setup)
6. [Scaling Strategy](#scaling-strategy)
7. [Rollback Procedure](#rollback-procedure)

---

## Docker Deployment

### Prerequisites

- Docker 20+
- Docker Compose 2.0+
- 4GB RAM minimum
- 20GB disk space

### Production Docker Compose

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  app:
    image: notification-system:latest
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      REDIS_HOST: redis
      REDIS_PORT: 6379
      KAFKA_BROKER: kafka:9092
      JWT_SECRET: ${JWT_SECRET}
    depends_on:
      - postgres
      - redis
      - kafka
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '1'
          memory: 512M

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: notification_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    restart: unless-stopped

  kafka:
    image: apache/kafka:3.6.1
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
    volumes:
      - kafka_data:/tmp/kraft-combined-logs
    restart: unless-stopped

  prometheus:
    image: prom/prometheus:v2.48.0
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./monitoring/alert-rules.yml:/etc/prometheus/alert-rules.yml
      - prometheus_data:/prometheus
    restart: unless-stopped

  grafana:
    image: grafana/grafana:10.2.2
    ports:
      - "3001:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana/provisioning:/etc/grafana/provisioning
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  kafka_data:
  prometheus_data:
  grafana_data:
```

### Deploy with Docker Compose

```bash
# 1. Build the Docker image
docker build -t notification-system:latest .

# 2. Set environment variables
export DATABASE_URL="postgresql://user:password@postgres:5432/notification_db"
export JWT_SECRET="your-production-jwt-secret"
export DB_USER="notification_user"
export DB_PASSWORD="strong-password"
export REDIS_PASSWORD="redis-password"
export GRAFANA_PASSWORD="grafana-admin-password"

# 3. Deploy
docker-compose -f docker-compose.prod.yml up -d

# 4. Run database migrations
docker-compose -f docker-compose.prod.yml exec app npm run prisma:migrate deploy

# 5. Verify deployment
docker-compose -f docker-compose.prod.yml ps
curl http://localhost:3000/health
```

---

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster (1.25+)
- kubectl configured
- Helm 3+ (optional but recommended)
- Ingress controller (nginx/traefik)

### Kubernetes Manifests

#### 1. Namespace

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: notification-system
```

#### 2. ConfigMap

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: notification-system
data:
  NODE_ENV: "production"
  REDIS_HOST: "redis-service"
  REDIS_PORT: "6379"
  KAFKA_BROKER: "kafka-service:9092"
  KAFKA_CLIENT_ID: "notification-service"
  PORT: "3000"
```

#### 3. Secrets

```yaml
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  namespace: notification-system
type: Opaque
stringData:
  DATABASE_URL: "postgresql://user:password@postgres:5432/notification_db"
  JWT_SECRET: "your-production-jwt-secret"
  REDIS_PASSWORD: "redis-password"
  SENDGRID_API_KEY: "your-sendgrid-key"
  TWILIO_AUTH_TOKEN: "your-twilio-token"
```

#### 4. Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: notification-app
  namespace: notification-system
spec:
  replicas: 3
  selector:
    matchLabels:
      app: notification-app
  template:
    metadata:
      labels:
        app: notification-app
    spec:
      containers:
      - name: app
        image: notification-system:latest
        ports:
        - containerPort: 3000
        envFrom:
        - configMapRef:
            name: app-config
        - secretRef:
            name: app-secrets
        resources:
          requests:
            cpu: 250m
            memory: 256Mi
          limits:
            cpu: 1000m
            memory: 512Mi
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 2
        securityContext:
          runAsNonRoot: true
          runAsUser: 1000
          readOnlyRootFilesystem: true
          allowPrivilegeEscalation: false
```

#### 5. Service

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: notification-service
  namespace: notification-system
spec:
  type: ClusterIP
  selector:
    app: notification-app
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
    name: http
```

#### 6. Ingress

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: notification-ingress
  namespace: notification-system
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - api.notification.example.com
    secretName: notification-tls
  rules:
  - host: api.notification.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: notification-service
            port:
              number: 80
```

#### 7. HorizontalPodAutoscaler

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: notification-hpa
  namespace: notification-system
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: notification-app
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Deploy to Kubernetes

```bash
# 1. Create namespace
kubectl apply -f k8s/namespace.yaml

# 2. Create secrets (encode base64 first)
kubectl apply -f k8s/secrets.yaml

# 3. Create configmap
kubectl apply -f k8s/configmap.yaml

# 4. Deploy application
kubectl apply -f k8s/deployment.yaml

# 5. Create service
kubectl apply -f k8s/service.yaml

# 6. Create ingress
kubectl apply -f k8s/ingress.yaml

# 7. Enable autoscaling
kubectl apply -f k8s/hpa.yaml

# 8. Verify deployment
kubectl get pods -n notification-system
kubectl get svc -n notification-system
kubectl get ing -n notification-system

# 9. Run database migrations
kubectl exec -n notification-system deployment/notification-app -- npm run prisma:migrate deploy

# 10. Check application logs
kubectl logs -n notification-system -l app=notification-app -f
```

---

## Environment Configuration

### Production Environment Variables

```bash
# Application
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL="postgresql://user:password@host:5432/notification_db?sslmode=require&connection_limit=20&pool_timeout=30"

# Redis
REDIS_HOST=redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=strong-redis-password

# Kafka
KAFKA_BROKER=kafka.example.com:9092
KAFKA_CLIENT_ID=notification-service
KAFKA_CONSUMER_GROUP=notification-workers

# JWT
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-required
JWT_EXPIRATION=7d

# External Services
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@notification.example.com
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=+1234567890
FIREBASE_SERVICE_ACCOUNT_PATH=/secrets/firebase-service-account.json
FIREBASE_PROJECT_ID=your-firebase-project

# Observability
JAEGER_ENDPOINT=http://jaeger:14268/api/traces
PROMETHEUS_PORT=9090

# Security
ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
MAX_REQUEST_SIZE=10mb
RATE_LIMIT_TTL=60
RATE_LIMIT_MAX=100

# Feature Flags
ENABLE_KAFKA_CONSUMER=true
ENABLE_RATE_LIMITING=true
ENABLE_MOCK_SERVICES=false
```

### Security Best Practices

1. **Never commit .env files** to version control
2. **Use secret management** (AWS Secrets Manager, HashiCorp Vault, Kubernetes Secrets)
3. **Rotate secrets regularly** (every 90 days)
4. **Use strong passwords** (minimum 32 characters for JWT_SECRET)
5. **Enable SSL/TLS** for all connections
6. **Restrict database access** by IP whitelist

---

## Database Migration

### Pre-Deployment Migration

```bash
# 1. Backup production database
npm run db:backup

# 2. Test migration on staging
export DATABASE_URL="postgresql://user:password@staging-db:5432/notification_db"
npx prisma migrate deploy --preview-feature

# 3. Verify migration
npx prisma migrate status

# 4. Apply to production
export DATABASE_URL="postgresql://user:password@prod-db:5432/notification_db"
npx prisma migrate deploy
```

### Rollback Migration

```bash
# Restore from backup
npm run db:restore backups/notification_db_YYYYMMDD_HHMMSS.sql.gz

# Or manually rollback
npx prisma migrate resolve --rolled-back <migration_name>
```

---

## Monitoring Setup

### Prometheus Targets

```yaml
# monitoring/prometheus.yml
scrape_configs:
  - job_name: 'notification-system'
    static_configs:
      - targets: ['notification-app-1:3000', 'notification-app-2:3000', 'notification-app-3:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

### Grafana Dashboards

1. Access Grafana: `http://grafana.example.com` (admin/your-password)
2. Add Prometheus datasource
3. Import dashboard from `monitoring/grafana/dashboards/`
4. Configure alerts

### Alert Notification Channels

```yaml
# monitoring/alertmanager.yml
receivers:
  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: 'your-pagerduty-key'
        severity: '{{ .GroupLabels.severity }}'

  - name: 'slack'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
        channel: '#alerts'
        title: 'Alert: {{ .GroupLabels.alertname }}'
```

---

## Scaling Strategy

### Horizontal Scaling

**Application Layer**:
```bash
# Docker Compose
docker-compose -f docker-compose.prod.yml up -d --scale app=5

# Kubernetes
kubectl scale deployment notification-app --replicas=5 -n notification-system
```

**Kafka Partitions**:
```bash
# Increase partitions for parallel processing
docker exec kafka kafka-topics --alter --topic notifications --partitions 10 --bootstrap-server localhost:9092
```

**Database**:
- Read replicas for read-heavy workloads
- Connection pooling (20+ connections per instance)
- Query optimization with indexes

### Vertical Scaling

**Increase Resources**:
```yaml
# Kubernetes
resources:
  limits:
    cpu: 2000m      # Increase from 1000m
    memory: 1024Mi  # Increase from 512Mi
```

### Auto-Scaling

**Kubernetes HPA** (already configured):
- Min replicas: 3
- Max replicas: 10
- CPU threshold: 70%
- Memory threshold: 80%

**Scaling Triggers**:
- High CPU usage (>70%)
- High memory usage (>80%)
- High request rate (>5000 req/min)
- Kafka consumer lag (>1000 messages)

---

## Rollback Procedure

### Application Rollback

**Docker**:
```bash
# 1. Tag previous version
docker tag notification-system:latest notification-system:rollback

# 2. Pull previous image
docker pull notification-system:v1.0.0

# 3. Update and restart
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```

**Kubernetes**:
```bash
# 1. Check rollout history
kubectl rollout history deployment/notification-app -n notification-system

# 2. Rollback to previous revision
kubectl rollout undo deployment/notification-app -n notification-system

# 3. Rollback to specific revision
kubectl rollout undo deployment/notification-app --to-revision=2 -n notification-system

# 4. Monitor rollback
kubectl rollout status deployment/notification-app -n notification-system
```

### Database Rollback

```bash
# 1. Stop application
kubectl scale deployment notification-app --replicas=0 -n notification-system

# 2. Restore database
npm run db:restore backups/notification_db_YYYYMMDD_HHMMSS.sql.gz

# 3. Restart application
kubectl scale deployment notification-app --replicas=3 -n notification-system
```

### Verification

```bash
# Check application health
curl https://api.notification.example.com/health

# Check logs for errors
kubectl logs -n notification-system -l app=notification-app --tail=100

# Check metrics
curl https://api.notification.example.com/metrics | grep error
```

---

## Health Checks

### Endpoint: GET /health

**Response** (200 OK):
```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" },
    "kafka": { "status": "up" }
  },
  "error": {},
  "details": {
    "database": { "status": "up" },
    "redis": { "status": "up" },
    "kafka": { "status": "up" }
  }
}
```

### Monitoring Health

```bash
# Continuous health check
watch -n 5 curl -s http://localhost:3000/health | jq

# Alert on health check failure
while true; do
  if ! curl -f http://localhost:3000/health; then
    echo "Health check failed!" | mail -s "Alert" ops@example.com
  fi
  sleep 60
done
```

---

## Troubleshooting

### Common Issues

**1. Application Won't Start**
```bash
# Check logs
kubectl logs -n notification-system -l app=notification-app

# Check environment variables
kubectl exec -n notification-system deployment/notification-app -- env | grep DATABASE_URL
```

**2. Database Connection Errors**
```bash
# Test connection
kubectl exec -n notification-system deployment/notification-app -- npm run prisma:migrate status

# Check database connectivity
kubectl exec -n notification-system deployment/notification-app -- nc -zv postgres 5432
```

**3. High Memory Usage**
```bash
# Check memory usage
kubectl top pods -n notification-system

# Increase memory limit
kubectl set resources deployment notification-app --limits=memory=1024Mi -n notification-system
```

---

## Support

For deployment issues, contact:
- **DevOps Team**: devops@example.com
- **On-Call Engineer**: +1-555-ONCALL
- **Documentation**: https://docs.notification.example.com

---

**Last Updated**: December 7, 2025
**Version**: 1.0.0
**Maintained By**: Platform Engineering Team
