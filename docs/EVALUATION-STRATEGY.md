# Evaluation Strategy - Notification RAG System

## Executive Summary

This document defines the comprehensive evaluation strategy for the notification RAG system, integrating retrieval metrics, generation metrics, RAGAS framework, baseline evaluation dataset, and A/B testing framework into a cohesive quality assurance and continuous improvement process.

**Strategic Goals:**
- **Quality Assurance:** Maintain high standards for retrieval accuracy and generation quality
- **Performance Monitoring:** Track system health and detect degradations early
- **Continuous Improvement:** Data-driven iteration through A/B testing
- **Business Impact:** Measure real-world effectiveness through engagement metrics

**Target Achievement:**
- **Phase 1 (Weeks 1-2):** Establish baseline metrics
- **Phase 2 (Weeks 3-4):** Implement automated evaluation pipeline
- **Phase 3 (Weeks 5-6):** Launch continuous monitoring dashboard
- **Phase 4 (Weeks 7+):** Begin A/B testing for improvements

---

## 1. Evaluation Framework Architecture

### 1.1 Three-Layer Evaluation Model

```typescript
interface EvaluationFramework {
  // Layer 1: Offline Evaluation (Pre-deployment)
  offline: {
    retrieval: RetrievalMetrics;      // Precision, Recall, MRR, NDCG
    generation: GenerationMetrics;     // BLEU, ROUGE, BERTScore
    ragas: RAGASMetrics;               // Faithfulness, Relevancy, Context quality
  };

  // Layer 2: Online Monitoring (Production)
  online: {
    technical: TechnicalMetrics;       // Latency, throughput, error rate
    quality: QualityMetrics;           // Sampled RAGAS evaluation
    performance: PerformanceMetrics;   // Resource utilization
  };

  // Layer 3: Business Metrics (User-facing)
  business: {
    engagement: EngagementMetrics;     // Open rate, click rate
    conversion: ConversionMetrics;     // Goal completion
    retention: RetentionMetrics;       // Unsubscribe rate
  };
}
```

**Evaluation Flow:**
```
1. OFFLINE: Test on evaluation dataset → Meet quality thresholds? → Deploy
2. ONLINE: Monitor production traffic → Detect degradation? → Alert + Rollback
3. BUSINESS: Track user engagement → A/B test improvements → Rollout winners
```

---

## 2. Baseline Metrics & Targets

### 2.1 Retrieval Quality Targets

Based on `RETRIEVAL-METRICS.md`:

```typescript
const RETRIEVAL_TARGETS = {
  // Binary Relevance
  precision: {
    p1: 0.90,   // First result highly relevant
    p3: 0.85,   // Top 3 for LLM context
    p5: 0.80,   // Standard search quality
    p10: 0.70,  // Exploration quality
  },

  recall: {
    r5: 0.60,   // 60% coverage in top 5
    r10: 0.85,  // 85% coverage in top 10
    r20: 0.95,  // Near-complete coverage
  },

  // Ranked Retrieval
  mrr: 0.75,      // First relevant in positions 1-2
  map: 0.70,      // Overall precision quality
  ndcg10: 0.80,   // High-quality ranking

  // Performance
  latency: {
    p50: 50,      // 50ms median
    p95: 100,     // 100ms p95
    p99: 200,     // 200ms p99
  },
};
```

**Priority:** Critical for system functionality. Retrieval failures cascade to poor generation.

### 2.2 Generation Quality Targets

Based on `GENERATION-METRICS.md`:

```typescript
const GENERATION_TARGETS = {
  // Reference-Based
  bleu4: 0.40,              // 40% n-gram overlap
  rouge1: 0.60,             // 60% unigram F1
  rougeL: 0.50,             // 50% LCS F1
  bertScoreF1: 0.85,        // 85% semantic similarity

  // Reference-Free
  perplexity: 20,           // Lower is better
  coherence: 4.0,           // Out of 5.0

  // Factual Accuracy
  hallucinationRate: 0.05,  // < 5%
  entailment: 0.90,         // > 90%

  // Notification-Specific
  readability: 70,          // Flesch 60-80
  wordCount: [50, 150],     // Concise
  ctaPresence: 1.0,         // 100% have CTA
  toneAlignment: 0.80,      // 80% match

  // Performance
  latency: {
    p50: 1000,              // 1s median
    p95: 2000,              // 2s p95
    p99: 3000,              // 3s p99
  },
};
```

**Priority:** High. Affects user perception and engagement directly.

### 2.3 RAGAS Targets (RAG-Specific)

Based on `RAGAS-FRAMEWORK.md`:

```typescript
const RAGAS_TARGETS = {
  // By Notification Category
  transactional: {
    faithfulness: 0.95,       // No hallucinations in critical info
    answerRelevancy: 0.90,    // Must address intent exactly
    contextPrecision: 0.85,   // Best templates ranked high
    contextRecall: 0.90,      // Complete information
    contextRelevancy: 0.80,   // Minimal noise
  },

  marketing: {
    faithfulness: 0.85,       // More creative freedom
    answerRelevancy: 0.80,    // On-topic
    contextPrecision: 0.75,   // Variety acceptable
    contextRecall: 0.75,      // Some details skippable
    contextRelevancy: 0.70,   // Broader context OK
  },

  system: {
    faithfulness: 0.90,
    answerRelevancy: 0.85,
    contextPrecision: 0.80,
    contextRecall: 0.85,
    contextRelevancy: 0.75,
  },

  // Overall
  ragasScore: 0.85,           // Harmonic mean of all 5
};
```

**Priority:** Critical. RAGAS metrics are specifically designed for RAG and catch unique failure modes.

### 2.4 Business Metrics Targets

```typescript
const BUSINESS_TARGETS = {
  // Engagement
  openRate: {
    email: 0.25,              // 25% open rate
    push: 0.45,               // 45% open rate
  },

  clickRate: {
    email: 0.05,              // 5% click rate
    sms: 0.15,                // 15% click rate
    push: 0.10,               // 10% click rate
  },

  conversionRate: {
    transactional: 0.70,      // 70% complete action
    marketing: 0.10,          // 10% convert
  },

  // Risk Metrics (Guardrails)
  unsubscribeRate: 0.005,     // < 0.5%
  complaintRate: 0.001,       // < 0.1%
  bounceRate: 0.02,           // < 2%

  // Satisfaction
  userSatisfactionScore: 4.0, // Out of 5.0 (survey)
};
```

**Priority:** Ultimate measure of success. Technical quality means nothing without business impact.

---

## 3. Evaluation Pipeline Implementation

### 3.1 Offline Evaluation Pipeline

**When:** Before deploying any changes to production

```typescript
class OfflineEvaluationPipeline {
  private retrievalEvaluator: RetrievalEvaluator;
  private generationEvaluator: GenerationEvaluator;
  private ragasEvaluator: RAGASEvaluator;
  private evaluationDataset: EvaluationTestCase[];

  async runFullEvaluation(): Promise<EvaluationReport> {
    console.log('Starting offline evaluation...');

    const results = [];

    // Run evaluation on all 50 test cases
    for (const testCase of this.evaluationDataset) {
      const result = await this.evaluateTestCase(testCase);
      results.push(result);

      // Progress indicator
      console.log(`Completed ${results.length}/${this.evaluationDataset.length}`);
    }

    // Aggregate results
    const aggregated = this.aggregateResults(results);

    // Check against targets
    const meetsTargets = this.checkTargets(aggregated);

    return {
      timestamp: new Date(),
      testCaseCount: this.evaluationDataset.length,
      results,
      aggregated,
      meetsTargets,
      passed: meetsTargets.allPassed,
    };
  }

  private async evaluateTestCase(testCase: EvaluationTestCase): Promise<TestCaseResult> {
    // 1. Execute RAG pipeline
    const { retrievedContexts, generatedNotification } = await this.executeRAG(
      testCase.query,
      testCase.context
    );

    // 2. Evaluate retrieval
    const retrievalMetrics = await this.retrievalEvaluator.evaluateQuery({
      query: testCase.query,
      results: retrievedContexts,
      groundTruth: new Set(testCase.groundTruth.relevantTemplateIds),
    });

    // 3. Evaluate generation
    const generationMetrics = await this.generationEvaluator.evaluateGeneration(
      generatedNotification,
      testCase.groundTruth.expectedAnswer,
      retrievedContexts.map(c => c.text)
    );

    // 4. Evaluate with RAGAS
    const ragasMetrics = await this.ragasEvaluator.evaluate({
      query: testCase.query,
      retrievedContexts: retrievedContexts.map(c => c.text),
      generatedAnswer: generatedNotification.body,
      groundTruthAnswer: testCase.groundTruth.expectedAnswer,
    });

    return {
      testCaseId: testCase.id,
      retrieval: retrievalMetrics,
      generation: generationMetrics,
      ragas: ragasMetrics,
      passed: this.checkTestCasePassed(testCase, retrievalMetrics, ragasMetrics),
    };
  }

  private checkTargets(aggregated: AggregatedMetrics): TargetCheck {
    return {
      retrieval: {
        precisionP5: aggregated.retrieval.precision.p5 >= RETRIEVAL_TARGETS.precision.p5,
        recallR10: aggregated.retrieval.recall.r10 >= RETRIEVAL_TARGETS.recall.r10,
        mrr: aggregated.retrieval.mrr >= RETRIEVAL_TARGETS.mrr,
        ndcg10: aggregated.retrieval.ndcg10 >= RETRIEVAL_TARGETS.ndcg10,
      },
      generation: {
        bertScoreF1: aggregated.generation.bertScoreF1 >= GENERATION_TARGETS.bertScoreF1,
        coherence: aggregated.generation.coherence >= GENERATION_TARGETS.coherence,
        hallucinationRate: aggregated.generation.hallucinationRate <= GENERATION_TARGETS.hallucinationRate,
      },
      ragas: {
        faithfulness: aggregated.ragas.faithfulness >= RAGAS_TARGETS.transactional.faithfulness,
        answerRelevancy: aggregated.ragas.answerRelevancy >= RAGAS_TARGETS.transactional.answerRelevancy,
        ragasScore: aggregated.ragas.ragasScore >= RAGAS_TARGETS.ragasScore,
      },
      allPassed: this.allTargetsMet(/* ... */),
    };
  }
}
```

**Usage:**
```bash
# Before deployment
npm run evaluate:offline

# Output:
# ✅ Retrieval: Precision@5=0.82 (target: 0.80)
# ✅ Retrieval: Recall@10=0.87 (target: 0.85)
# ✅ Generation: BERTScore F1=0.86 (target: 0.85)
# ✅ RAGAS: Faithfulness=0.92 (target: 0.90)
# ✅ All targets met! Safe to deploy.
```

### 3.2 Online Monitoring Pipeline

**When:** Continuously in production

```typescript
class OnlineMonitoringPipeline {
  private metricsCollector: MetricsCollector;
  private alertManager: AlertManager;

  async startMonitoring(): Promise<void> {
    // 1. Collect metrics every minute
    setInterval(async () => {
      const metrics = await this.collectRealtimeMetrics();
      await this.metricsCollector.store(metrics);
    }, 60 * 1000);

    // 2. Check alerts every 5 minutes
    setInterval(async () => {
      await this.checkAlerts();
    }, 5 * 60 * 1000);

    // 3. Sample quality evaluation every hour
    setInterval(async () => {
      await this.runSampledEvaluation();
    }, 60 * 60 * 1000);
  }

  private async collectRealtimeMetrics(): Promise<RealtimeMetrics> {
    return {
      timestamp: new Date(),

      // Technical metrics
      requestCount: await this.getRequestCount(),
      errorCount: await this.getErrorCount(),
      errorRate: await this.getErrorRate(),

      latency: {
        p50: await this.getLatencyPercentile(0.50),
        p95: await this.getLatencyPercentile(0.95),
        p99: await this.getLatencyPercentile(0.99),
      },

      // Throughput
      qps: await this.getQueriesPerSecond(),

      // Resource utilization
      cpuUsage: await this.getCPUUsage(),
      memoryUsage: await this.getMemoryUsage(),
      vectorDBConnections: await this.getVectorDBConnections(),
    };
  }

  private async checkAlerts(): Promise<void> {
    const metrics = await this.getRecentMetrics();

    // Error rate alert
    if (metrics.errorRate > 0.01) { // > 1%
      await this.alertManager.trigger({
        severity: 'critical',
        title: 'High Error Rate',
        message: `Error rate: ${(metrics.errorRate * 100).toFixed(2)}% (threshold: 1%)`,
      });
    }

    // Latency alert
    if (metrics.latency.p95 > 2000) { // > 2s
      await this.alertManager.trigger({
        severity: 'warning',
        title: 'High Latency',
        message: `P95 latency: ${metrics.latency.p95}ms (threshold: 2000ms)`,
      });
    }

    // Quality alert (from sampled evaluation)
    const qualityMetrics = await this.getSampledQualityMetrics();
    if (qualityMetrics.ragas.faithfulness < 0.85) {
      await this.alertManager.trigger({
        severity: 'warning',
        title: 'Quality Degradation',
        message: `Faithfulness: ${qualityMetrics.ragas.faithfulness.toFixed(3)} (threshold: 0.85)`,
      });
    }
  }

  private async runSampledEvaluation(): Promise<void> {
    // Sample 10 random recent requests
    const samples = await this.sampleRecentRequests(10);

    const ragasResults = [];
    for (const sample of samples) {
      const ragas = await this.ragasEvaluator.evaluate({
        query: sample.query,
        retrievedContexts: sample.contexts,
        generatedAnswer: sample.answer,
      });
      ragasResults.push(ragas);
    }

    // Store aggregated quality metrics
    await this.metricsCollector.storeSampledQuality({
      timestamp: new Date(),
      sampleSize: samples.length,
      avgFaithfulness: this.average(ragasResults.map(r => r.faithfulness)),
      avgAnswerRelevancy: this.average(ragasResults.map(r => r.answerRelevancy)),
      avgRagasScore: this.average(ragasResults.map(r => r.ragasScore)),
    });
  }
}
```

**Dashboard Visualization:**
```
┌─────────────────────────────────────────────────────────────┐
│ Notification RAG System - Live Monitoring                  │
│ Last updated: 2024-12-10 14:35:22                          │
├─────────────────────────────────────────────────────────────┤
│ Technical Metrics (Last 5 min)                             │
│ ✅ Request Count: 1,245                                     │
│ ✅ Error Rate: 0.3% (target: <1%)                          │
│ ✅ P95 Latency: 1,450ms (target: <2000ms)                  │
│ ✅ QPS: 4.2                                                 │
├─────────────────────────────────────────────────────────────┤
│ Quality Metrics (Last hour, n=60 samples)                  │
│ ✅ Faithfulness: 0.91 (target: ≥0.85)                      │
│ ✅ Answer Relevancy: 0.87 (target: ≥0.80)                  │
│ ✅ RAGAS Score: 0.86 (target: ≥0.85)                       │
├─────────────────────────────────────────────────────────────┤
│ Business Metrics (Last 24h)                                │
│ ⚠️  Open Rate: 22.1% (target: 25%)                         │
│ ✅ Click Rate: 5.4% (target: 5%)                           │
│ ✅ Unsubscribe Rate: 0.3% (target: <0.5%)                  │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Business Metrics Tracking

**When:** Daily aggregation, weekly review

```typescript
class BusinessMetricsTracker {
  async collectDailyMetrics(): Promise<BusinessMetrics> {
    const yesterday = this.getYesterday();

    return {
      date: yesterday,

      // Volume
      notificationsSent: await this.countSent(yesterday),
      notificationsByChannel: {
        email: await this.countSentByChannel(yesterday, 'email'),
        sms: await this.countSentByChannel(yesterday, 'sms'),
        push: await this.countSentByChannel(yesterday, 'push'),
      },

      // Engagement
      openRate: await this.calculateOpenRate(yesterday),
      clickRate: await this.calculateClickRate(yesterday),
      conversionRate: await this.calculateConversionRate(yesterday),

      // Risk
      unsubscribeRate: await this.calculateUnsubscribeRate(yesterday),
      complaintRate: await this.calculateComplaintRate(yesterday),
      bounceRate: await this.calculateBounceRate(yesterday),

      // Revenue impact (if applicable)
      attributedRevenue: await this.calculateAttributedRevenue(yesterday),
    };
  }

  async generateWeeklyReport(): Promise<string> {
    const last7Days = await this.getDailyMetrics(7);
    const prev7Days = await this.getDailyMetrics(7, 7); // Week before

    const current = this.aggregate(last7Days);
    const previous = this.aggregate(prev7Days);

    return `
# Weekly Notification Performance Report
**Week of:** ${this.getWeekRange()}

## Volume
- **Total Sent:** ${current.notificationsSent.toLocaleString()} (${this.percentChange(current.notificationsSent, previous.notificationsSent)})

## Engagement
- **Open Rate:** ${(current.openRate * 100).toFixed(2)}% (${this.percentChange(current.openRate, previous.openRate)})
- **Click Rate:** ${(current.clickRate * 100).toFixed(2)}% (${this.percentChange(current.clickRate, previous.clickRate)})
- **Conversion Rate:** ${(current.conversionRate * 100).toFixed(2)}% (${this.percentChange(current.conversionRate, previous.conversionRate)})

## Health
- **Unsubscribe Rate:** ${(current.unsubscribeRate * 100).toFixed(3)}% ${current.unsubscribeRate < 0.005 ? '✅' : '⚠️'}
- **Bounce Rate:** ${(current.bounceRate * 100).toFixed(2)}% ${current.bounceRate < 0.02 ? '✅' : '⚠️'}

## Revenue
- **Attributed Revenue:** $${current.attributedRevenue.toLocaleString()} (${this.percentChange(current.attributedRevenue, previous.attributedRevenue)})

## Recommendations
${this.generateRecommendations(current, previous)}
`;
  }
}
```

---

## 4. Continuous Improvement Through A/B Testing

Based on `AB-TESTING-FRAMEWORK.md`:

### 4.1 Experimentation Roadmap

**Quarter 1 Experiments:**

1. **Week 1-2: Hybrid Search Weight Optimization**
   - Hypothesis: Balancing vector/keyword improves exact-match queries
   - Primary metric: Precision@5
   - Expected impact: +5% precision

2. **Week 3-4: Add Reranking Model**
   - Hypothesis: Cohere reranker improves context relevancy
   - Primary metric: Context Relevancy (RAGAS)
   - Expected impact: +10% relevancy

3. **Week 5-6: Prompt Optimization**
   - Hypothesis: More specific prompts reduce hallucinations
   - Primary metric: Faithfulness
   - Expected impact: +5% faithfulness, -3% hallucination rate

4. **Week 7-8: Chunking Strategy**
   - Hypothesis: Semantic chunking improves retrieval
   - Primary metric: Recall@10
   - Expected impact: +8% recall

### 4.2 Experiment Workflow

```typescript
// 1. Define Experiment
const experiment = {
  name: 'Hybrid Search 60/40',
  hypothesis: 'Increasing keyword weight improves precision',
  // ... config
};

// 2. Calculate Required Sample Size
const sampleSize = statisticalAnalyzer.calculateRequiredSampleSize(
  0.05,  // Baseline click rate
  0.10,  // 10% minimum detectable effect
  0.05,  // 95% confidence
  0.80   // 80% power
);
// Result: ~3,200 notifications per variant

// 3. Start Experiment
await experimentManager.startExperiment(experiment.id);

// 4. Monitor Daily
const report = await experimentDashboard.generateReport(experiment.id);

// 5. Make Decision
const decision = await decisionEngine.evaluate(experiment.id);

if (decision.decision === 'rollout') {
  // 6. Gradual Rollout
  await gradualRollout.rolloutTreatment(experiment.id);
}
```

---

## 5. Complete Evaluation Workflow

### 5.1 Development Phase

```
1. Developer makes change (e.g., tune retrieval parameter)
2. Run offline evaluation: npm run evaluate:offline
3. Check results against targets
4. If passed → Create pull request
5. If failed → Iterate on changes
```

### 5.2 Deployment Phase

```
1. PR approved and merged
2. Deploy to staging environment
3. Run smoke tests (10 test cases)
4. If passed → Deploy to production (5% traffic)
5. Monitor for 24 hours
6. If healthy → Increase to 100%
7. If issues → Rollback
```

### 5.3 Production Phase

```
1. Online monitoring runs continuously
2. Alerts trigger if thresholds breached
3. Daily: Business metrics report
4. Weekly: Performance review meeting
5. Monthly: Experiment planning session
```

---

## 6. Tooling & Infrastructure

### 6.1 Required Tools

```typescript
const EVALUATION_TOOLS = {
  // Offline Evaluation
  testRunner: 'Jest / Vitest',
  evaluationFramework: 'Custom (TypeScript)',
  metricsLibrary: 'RAGAS (Python) + Custom',

  // Online Monitoring
  apm: 'Datadog / New Relic',
  logging: 'CloudWatch / Grafana Loki',
  metrics: 'Prometheus + Grafana',
  alerting: 'PagerDuty / Opsgenie',

  // A/B Testing
  experimentPlatform: 'Custom / LaunchDarkly',
  analytics: 'Mixpanel / Amplitude',
  statisticalAnalysis: 'Custom (TypeScript)',

  // Business Metrics
  dataWarehouse: 'Snowflake / BigQuery',
  visualization: 'Metabase / Looker',
  reporting: 'Automated email reports',
};
```

### 6.2 Evaluation Schedule

```typescript
const EVALUATION_SCHEDULE = {
  // Real-time (continuous)
  realtime: [
    'Request count',
    'Error rate',
    'Latency (p50, p95, p99)',
  ],

  // Every 5 minutes
  fiveMinutes: [
    'Alert checks',
  ],

  // Hourly
  hourly: [
    'Sampled quality evaluation (10 samples)',
    'Resource utilization check',
  ],

  // Daily
  daily: [
    'Business metrics aggregation',
    'A/B test dashboard update',
    'Anomaly detection',
  ],

  // Weekly
  weekly: [
    'Performance review report',
    'Quality trends analysis',
    'Experiment results review',
  ],

  // Monthly
  monthly: [
    'Full evaluation dataset run',
    'Model performance audit',
    'Experiment planning session',
  ],

  // Quarterly
  quarterly: [
    'System architecture review',
    'Cost optimization analysis',
    'Roadmap planning',
  ],
};
```

---

## 7. Success Criteria

### 7.1 Phase 1: Foundation (Weeks 1-2) ✅ COMPLETE

- [x] Define retrieval metrics
- [x] Define generation metrics
- [x] Study RAGAS framework
- [x] Create 50-case evaluation dataset
- [x] Design A/B testing framework
- [x] Document evaluation strategy

### 7.2 Phase 2: Implementation (Weeks 3-4)

- [ ] Implement offline evaluation pipeline
- [ ] Set up metrics collection infrastructure
- [ ] Establish baseline metrics (run evaluation)
- [ ] Create evaluation report templates
- [ ] Document current system performance

### 7.3 Phase 3: Monitoring (Weeks 5-6)

- [ ] Deploy online monitoring pipeline
- [ ] Set up alerting rules
- [ ] Create real-time dashboard
- [ ] Implement sampled quality evaluation
- [ ] Weekly automated reports

### 7.4 Phase 4: Experimentation (Weeks 7+)

- [ ] Launch first A/A test (validation)
- [ ] Run first A/B test (hybrid search)
- [ ] Iterate based on results
- [ ] Scale experimentation program
- [ ] Document learnings

---

## 8. Key Performance Indicators (KPIs)

### 8.1 System Health KPIs

```typescript
const SYSTEM_HEALTH_KPIS = {
  // Must maintain
  availability: 0.999,           // 99.9% uptime
  errorRate: 0.01,               // < 1% errors
  p95Latency: 2000,              // < 2s p95

  // Quality
  ragasScore: 0.85,              // Overall quality
  faithfulness: 0.90,            // No hallucinations
  answerRelevancy: 0.85,         // On-topic

  // Business
  openRate: 0.25,                // 25% open rate
  unsubscribeRate: 0.005,        // < 0.5% unsubscribe
};
```

### 8.2 Improvement KPIs (Quarterly)

```typescript
const IMPROVEMENT_KPIS = {
  // Experimentation
  experimentsLaunched: 4,         // 4 experiments per quarter
  winRate: 0.50,                  // 50% of experiments succeed
  avgImprovement: 0.05,           // 5% average improvement

  // Quality
  ragasScoreImprovement: 0.02,    // +2% per quarter
  hallucinationReduction: 0.01,   // -1% per quarter

  // Efficiency
  costPerNotification: -0.10,     // -10% cost reduction
  latencyReduction: -0.05,        // -5% latency reduction
};
```

---

## 9. Risk Management

### 9.1 Guardrail Metrics (Red Lines)

```typescript
const GUARDRAIL_METRICS = {
  // Never cross these thresholds
  critical: {
    errorRate: 0.05,              // STOP if > 5% errors
    unsubscribeRate: 0.01,        // STOP if > 1% unsubscribe
    hallucinationRate: 0.10,      // STOP if > 10% hallucinations
    latencyP99: 5000,             // STOP if > 5s p99
  },

  // Trigger alerts but don't stop
  warning: {
    errorRate: 0.02,              // WARN if > 2% errors
    unsubscribeRate: 0.005,       // WARN if > 0.5% unsubscribe
    hallucinationRate: 0.05,      // WARN if > 5% hallucinations
    latencyP95: 2500,             // WARN if > 2.5s p95
  },
};
```

### 9.2 Rollback Procedure

```typescript
class RollbackManager {
  async checkHealthAndRollback(): Promise<void> {
    const metrics = await this.getCurrentMetrics();

    // Check critical guardrails
    if (
      metrics.errorRate > GUARDRAIL_METRICS.critical.errorRate ||
      metrics.unsubscribeRate > GUARDRAIL_METRICS.critical.unsubscribeRate ||
      metrics.hallucinationRate > GUARDRAIL_METRICS.critical.hallucinationRate
    ) {
      console.error('🚨 CRITICAL: Guardrail violated! Rolling back immediately...');

      await this.rollbackToLastKnownGood();

      await this.alertManager.trigger({
        severity: 'critical',
        title: 'Automatic Rollback Triggered',
        message: 'System rolled back due to guardrail violation',
      });
    }
  }

  private async rollbackToLastKnownGood(): Promise<void> {
    // 1. Stop accepting new traffic to bad version
    await this.trafficSplitter.setTrafficAllocation({
      lastKnownGood: 1.0,
      current: 0.0,
    });

    // 2. Wait for in-flight requests to complete
    await this.sleep(10000);

    // 3. Redeploy last known good version
    await this.deployManager.deploy(this.lastKnownGoodVersion);

    // 4. Verify health
    const health = await this.healthCheck();

    if (!health.healthy) {
      console.error('Rollback failed! Manual intervention required.');
      await this.alertManager.trigger({
        severity: 'critical',
        title: 'Rollback Failed',
        message: 'Manual intervention required immediately',
      });
    } else {
      console.log('✅ Rollback successful. System healthy.');
    }
  }
}
```

---

## 10. Summary & Next Actions

### 10.1 Evaluation Strategy Summary

```
Layer 1 (Offline): Test on 50-case dataset before deploy
  → Retrieval: Precision, Recall, MRR, NDCG
  → Generation: BLEU, ROUGE, BERTScore, Coherence
  → RAGAS: Faithfulness, Relevancy, Context quality
  → Target: Pass all thresholds

Layer 2 (Online): Monitor production continuously
  → Technical: Error rate, latency, throughput
  → Quality: Sampled RAGAS evaluation (hourly)
  → Alerts: Trigger on threshold violations
  → Target: Maintain SLAs

Layer 3 (Business): Track user engagement
  → Engagement: Open rate, click rate, conversion
  → Risk: Unsubscribe rate, complaint rate
  → A/B Testing: Data-driven improvements
  → Target: Improve KPIs quarterly
```

### 10.2 Immediate Next Steps (Week 1-2)

1. ✅ **COMPLETE:** Documentation
   - Retrieval metrics
   - Generation metrics
   - RAGAS framework
   - Evaluation dataset (50 cases)
   - A/B testing framework
   - Evaluation strategy

2. **TODO:** Implementation (Week 3-4)
   - [ ] Implement offline evaluation pipeline (2 days)
   - [ ] Set up metrics collection (2 days)
   - [ ] Run baseline evaluation (1 day)
   - [ ] Create evaluation reports (1 day)

3. **TODO:** Deployment (Week 5-6)
   - [ ] Deploy monitoring infrastructure (3 days)
   - [ ] Set up alerting (1 day)
   - [ ] Create dashboards (2 days)
   - [ ] Document runbooks (1 day)

### 10.3 Success Metrics

**By End of Month:**
- Baseline metrics established for all 3 layers
- Automated evaluation pipeline running
- Real-time monitoring dashboard live
- First A/B test launched

**By End of Quarter:**
- 4 experiments completed
- 2 successful improvements rolled out
- 5-10% improvement in primary KPIs
- Zero guardrail violations

---

## Appendix: Related Documentation

- **RETRIEVAL-METRICS.md** - Detailed retrieval evaluation metrics
- **GENERATION-METRICS.md** - Detailed generation evaluation metrics
- **RAGAS-FRAMEWORK.md** - RAG-specific evaluation framework
- **EVALUATION-DATASET.md** - 50 test cases with ground truth
- **AB-TESTING-FRAMEWORK.md** - A/B testing methodology
- **VECTOR-DB-DESIGN.md** - System architecture context
