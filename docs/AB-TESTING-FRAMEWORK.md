# A/B Testing Framework for Notification System

## Executive Summary

This document defines a comprehensive A/B testing framework for evaluating improvements to the notification RAG system. The framework enables data-driven decisions through controlled experiments that measure both technical metrics (retrieval/generation quality) and business metrics (engagement, conversion).

**Key Components:**
- **Experiment Design** - Hypothesis formation, variant creation, sample size calculation
- **Traffic Splitting** - Randomized user assignment with consistency
- **Metrics Collection** - Technical + business KPIs
- **Statistical Analysis** - Significance testing, confidence intervals
- **Decision Framework** - Rollout criteria and safety guardrails

**Target Metrics:**
- **Primary:** Open rate, click rate, conversion rate
- **Secondary:** RAGAS score, faithfulness, answer relevancy
- **Guardrail:** Unsubscribe rate < 0.5%, complaint rate < 0.1%

---

## 1. A/B Testing Framework Overview

### 1.1 Why A/B Testing for RAG Systems?

**RAG System Improvements to Test:**
- New retrieval algorithms (HNSW vs IVF, different similarity thresholds)
- Chunking strategies (micro/macro/mega vs fixed-size)
- Metadata filtering approaches
- Hybrid search weights (vector vs keyword balance)
- LLM prompt variations
- Different embedding models
- Reranking models

**Benefits:**
- **Data-Driven Decisions:** Measure actual impact, not assumptions
- **Risk Mitigation:** Test on small traffic before full rollout
- **Continuous Improvement:** Iterate based on real user behavior
- **ROI Justification:** Quantify value of technical improvements

### 1.2 A/B Testing Architecture

```typescript
interface ABTestFramework {
  // Experiment Definition
  experiment: Experiment;

  // Traffic Management
  trafficSplitter: TrafficSplitter;

  // Metrics Collection
  metricsCollector: MetricsCollector;

  // Statistical Analysis
  analyzer: StatisticalAnalyzer;

  // Decision Engine
  decisionEngine: DecisionEngine;
}
```

**Flow:**
```
User Request → Traffic Splitter → Variant Assignment → Execute RAG Pipeline →
Collect Metrics → Statistical Analysis → Decision (Continue/Rollout/Stop)
```

---

## 2. Experiment Design

### 2.1 Experiment Structure

```typescript
interface Experiment {
  id: string;
  name: string;
  hypothesis: string;
  description: string;

  // Variants
  control: Variant;
  treatment: Variant;

  // Traffic Allocation
  trafficAllocation: {
    control: number;      // 0.5 = 50%
    treatment: number;    // 0.5 = 50%
  };

  // Duration
  startDate: Date;
  plannedEndDate: Date;
  minDuration: number;    // Days
  maxDuration: number;    // Days

  // Metrics
  primaryMetric: Metric;
  secondaryMetrics: Metric[];
  guardrailMetrics: Metric[];

  // Statistical Parameters
  significanceLevel: number;    // 0.05 = 95% confidence
  power: number;                // 0.80 = 80% power
  minimumDetectableEffect: number; // 0.05 = 5% relative change

  // Status
  status: 'draft' | 'running' | 'paused' | 'completed' | 'rolled_out';
}

interface Variant {
  id: string;
  name: string;
  description: string;
  config: VariantConfig;
}

interface VariantConfig {
  // Retrieval Configuration
  retrieval?: {
    algorithm?: 'hnsw' | 'ivf';
    topK?: number;
    similarityThreshold?: number;
    efSearch?: number;
    hybridSearchWeights?: {
      vector: number;
      keyword: number;
    };
  };

  // Chunking Configuration
  chunking?: {
    strategy: 'multi_level' | 'fixed_size' | 'semantic';
    sizes?: number[];
    overlap?: number;
  };

  // Generation Configuration
  generation?: {
    model: string;
    temperature: number;
    maxTokens: number;
    prompt: string;
  };

  // Feature Flags
  features?: {
    useReranking?: boolean;
    useMetadataFiltering?: boolean;
    useQueryExpansion?: boolean;
  };
}
```

### 2.2 Example Experiments

#### Experiment 1: Hybrid Search Weight Optimization
```typescript
const hybridSearchExperiment: Experiment = {
  id: 'exp_001',
  name: 'Hybrid Search Weight Optimization',
  hypothesis: 'Increasing keyword search weight from 30% to 40% will improve precision for exact-match queries without hurting semantic search quality',
  description: 'Test optimal balance between vector and keyword search in hybrid retrieval',

  control: {
    id: 'control_001',
    name: 'Current (70/30)',
    description: '70% vector, 30% keyword',
    config: {
      retrieval: {
        hybridSearchWeights: {
          vector: 0.7,
          keyword: 0.3,
        },
      },
    },
  },

  treatment: {
    id: 'treatment_001',
    name: 'Balanced (60/40)',
    description: '60% vector, 40% keyword',
    config: {
      retrieval: {
        hybridSearchWeights: {
          vector: 0.6,
          keyword: 0.4,
        },
      },
    },
  },

  trafficAllocation: {
    control: 0.5,
    treatment: 0.5,
  },

  startDate: new Date('2024-12-15'),
  plannedEndDate: new Date('2024-12-29'),
  minDuration: 7,   // Minimum 1 week
  maxDuration: 14,  // Maximum 2 weeks

  primaryMetric: {
    name: 'click_rate',
    displayName: 'Click Rate',
    type: 'conversion',
    target: 'increase',
    minimumDetectableEffect: 0.05, // 5% relative improvement
  },

  secondaryMetrics: [
    {
      name: 'precision_at_5',
      displayName: 'Precision@5',
      type: 'quality',
      target: 'increase',
    },
    {
      name: 'ragas_score',
      displayName: 'Overall RAGAS Score',
      type: 'quality',
      target: 'increase',
    },
  ],

  guardrailMetrics: [
    {
      name: 'unsubscribe_rate',
      displayName: 'Unsubscribe Rate',
      type: 'risk',
      target: 'maintain',
      threshold: 0.005, // Must stay below 0.5%
    },
  ],

  significanceLevel: 0.05,
  power: 0.80,
  minimumDetectableEffect: 0.05,

  status: 'draft',
};
```

#### Experiment 2: Reranking Model Addition
```typescript
const rerankingExperiment: Experiment = {
  id: 'exp_002',
  name: 'Add Cohere Reranking',
  hypothesis: 'Adding Cohere reranker after initial retrieval will improve context relevancy by 10%+ and increase click rate',
  description: 'Test impact of cross-encoder reranking on retrieval quality',

  control: {
    id: 'control_002',
    name: 'No Reranking',
    description: 'Direct vector search results',
    config: {
      features: {
        useReranking: false,
      },
    },
  },

  treatment: {
    id: 'treatment_002',
    name: 'Cohere Reranking',
    description: 'Rerank top 20 results, return top 5',
    config: {
      retrieval: {
        topK: 20, // Fetch more for reranking
      },
      features: {
        useReranking: true,
      },
    },
  },

  trafficAllocation: {
    control: 0.5,
    treatment: 0.5,
  },

  primaryMetric: {
    name: 'context_relevancy',
    displayName: 'Context Relevancy (RAGAS)',
    type: 'quality',
    target: 'increase',
    minimumDetectableEffect: 0.10,
  },

  secondaryMetrics: [
    {
      name: 'click_rate',
      displayName: 'Click Rate',
      type: 'conversion',
      target: 'increase',
    },
    {
      name: 'latency_p95',
      displayName: 'P95 Latency',
      type: 'performance',
      target: 'maintain',
      threshold: 150, // Must stay under 150ms
    },
  ],

  // ... rest of config
};
```

---

## 3. Traffic Splitting

### 3.1 Traffic Splitter Implementation

```typescript
class TrafficSplitter {
  private experiments: Map<string, Experiment> = new Map();

  // Assign user to variant consistently
  assignVariant(userId: string, experimentId: string): Variant {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) throw new Error('Experiment not found');

    // Use deterministic hash for consistency
    const hash = this.hashUserId(userId, experimentId);
    const normalized = hash / 0xffffffff; // 0 to 1

    // Traffic allocation
    if (normalized < experiment.trafficAllocation.control) {
      return experiment.control;
    } else {
      return experiment.treatment;
    }
  }

  // Deterministic hash: same user always gets same variant
  private hashUserId(userId: string, experimentId: string): number {
    const input = `${userId}:${experimentId}`;
    let hash = 0;

    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash);
  }

  // Check if user should be in experiment (for gradual rollouts)
  shouldIncludeUser(userId: string, experimentId: string, rolloutPercentage: number): boolean {
    const hash = this.hashUserId(userId, experimentId);
    const normalized = hash / 0xffffffff;
    return normalized < rolloutPercentage;
  }
}
```

### 3.2 Integration with RAG Pipeline

```typescript
class RAGPipelineWithABTesting {
  private trafficSplitter: TrafficSplitter;
  private metricsCollector: MetricsCollector;

  async generateNotification(
    userId: string,
    query: string,
    context: NotificationContext
  ): Promise<GeneratedNotification> {
    // 1. Get active experiments for this user
    const activeExperiments = await this.getActiveExperiments(userId);

    let variantConfig: VariantConfig = this.getDefaultConfig();
    let assignedVariant: string | null = null;

    // 2. Assign to variant (pick first applicable experiment)
    if (activeExperiments.length > 0) {
      const experiment = activeExperiments[0];
      const variant = this.trafficSplitter.assignVariant(userId, experiment.id);
      variantConfig = { ...variantConfig, ...variant.config };
      assignedVariant = `${experiment.id}:${variant.id}`;

      // Track assignment
      await this.metricsCollector.trackAssignment({
        userId,
        experimentId: experiment.id,
        variantId: variant.id,
        timestamp: new Date(),
      });
    }

    // 3. Execute RAG pipeline with variant config
    const startTime = Date.now();

    const retrievedContexts = await this.retrieve(query, variantConfig.retrieval);
    const generatedNotification = await this.generate(
      query,
      retrievedContexts,
      variantConfig.generation
    );

    const endTime = Date.now();

    // 4. Collect metrics
    if (assignedVariant) {
      await this.metricsCollector.trackGeneration({
        userId,
        experimentVariant: assignedVariant,
        query,
        retrievedContexts,
        generatedNotification,
        latency: endTime - startTime,
        timestamp: new Date(),
      });
    }

    return generatedNotification;
  }

  private async retrieve(
    query: string,
    config?: VariantConfig['retrieval']
  ): Promise<RetrievedContext[]> {
    // Apply variant-specific retrieval config
    const topK = config?.topK || 10;
    const threshold = config?.similarityThreshold || 0.7;
    // ... implement retrieval with config
  }
}
```

---

## 4. Metrics Collection

### 4.1 Metrics Collector

```typescript
interface MetricEvent {
  userId: string;
  experimentVariant: string; // "exp_001:treatment_001"
  eventType: 'assignment' | 'generation' | 'notification_sent' | 'opened' | 'clicked' | 'converted' | 'unsubscribed';
  timestamp: Date;
  metadata?: Record<string, any>;
}

class MetricsCollector {
  private eventStore: EventStore;

  async trackAssignment(event: {
    userId: string;
    experimentId: string;
    variantId: string;
    timestamp: Date;
  }): Promise<void> {
    await this.eventStore.insert({
      userId: event.userId,
      experimentVariant: `${event.experimentId}:${event.variantId}`,
      eventType: 'assignment',
      timestamp: event.timestamp,
    });
  }

  async trackGeneration(event: {
    userId: string;
    experimentVariant: string;
    query: string;
    retrievedContexts: RetrievedContext[];
    generatedNotification: GeneratedNotification;
    latency: number;
    timestamp: Date;
  }): Promise<void> {
    await this.eventStore.insert({
      userId: event.userId,
      experimentVariant: event.experimentVariant,
      eventType: 'generation',
      timestamp: event.timestamp,
      metadata: {
        query: event.query,
        contextCount: event.retrievedContexts.length,
        notificationLength: event.generatedNotification.body.length,
        latency: event.latency,
      },
    });
  }

  async trackNotificationSent(event: {
    userId: string;
    notificationId: string;
    experimentVariant: string;
    channel: string;
    timestamp: Date;
  }): Promise<void> {
    await this.eventStore.insert({
      userId: event.userId,
      experimentVariant: event.experimentVariant,
      eventType: 'notification_sent',
      timestamp: event.timestamp,
      metadata: {
        notificationId: event.notificationId,
        channel: event.channel,
      },
    });
  }

  async trackOpened(event: {
    userId: string;
    notificationId: string;
    timestamp: Date;
  }): Promise<void> {
    const notification = await this.getNotification(event.notificationId);

    await this.eventStore.insert({
      userId: event.userId,
      experimentVariant: notification.experimentVariant,
      eventType: 'opened',
      timestamp: event.timestamp,
      metadata: {
        notificationId: event.notificationId,
        timeToOpen: event.timestamp.getTime() - notification.sentAt.getTime(),
      },
    });
  }

  async trackClicked(event: {
    userId: string;
    notificationId: string;
    linkUrl: string;
    timestamp: Date;
  }): Promise<void> {
    const notification = await this.getNotification(event.notificationId);

    await this.eventStore.insert({
      userId: event.userId,
      experimentVariant: notification.experimentVariant,
      eventType: 'clicked',
      timestamp: event.timestamp,
      metadata: {
        notificationId: event.notificationId,
        linkUrl: event.linkUrl,
      },
    });
  }

  async trackUnsubscribed(event: {
    userId: string;
    notificationId: string;
    timestamp: Date;
  }): Promise<void> {
    const notification = await this.getNotification(event.notificationId);

    await this.eventStore.insert({
      userId: event.userId,
      experimentVariant: notification.experimentVariant,
      eventType: 'unsubscribed',
      timestamp: event.timestamp,
      metadata: {
        notificationId: event.notificationId,
      },
    });
  }
}
```

### 4.2 Metrics Aggregation

```typescript
class MetricsAggregator {
  async getExperimentMetrics(experimentId: string): Promise<ExperimentMetrics> {
    const variants = ['control', 'treatment'];
    const metrics: Record<string, VariantMetrics> = {};

    for (const variantId of variants) {
      const variantKey = `${experimentId}:${variantId}`;

      // Count events
      const assignments = await this.countEvents(variantKey, 'assignment');
      const sent = await this.countEvents(variantKey, 'notification_sent');
      const opened = await this.countEvents(variantKey, 'opened');
      const clicked = await this.countEvents(variantKey, 'clicked');
      const converted = await this.countEvents(variantKey, 'converted');
      const unsubscribed = await this.countEvents(variantKey, 'unsubscribed');

      // Calculate rates
      metrics[variantId] = {
        // Sample size
        users: assignments,
        notifications: sent,

        // Engagement metrics
        openRate: sent > 0 ? opened / sent : 0,
        clickRate: sent > 0 ? clicked / sent : 0,
        conversionRate: sent > 0 ? converted / sent : 0,
        unsubscribeRate: sent > 0 ? unsubscribed / sent : 0,

        // Performance metrics
        avgLatency: await this.getAvgLatency(variantKey),
        p95Latency: await this.getP95Latency(variantKey),

        // Quality metrics (from evaluation runs)
        avgPrecision: await this.getAvgQualityMetric(variantKey, 'precision_at_5'),
        avgRagasScore: await this.getAvgQualityMetric(variantKey, 'ragas_score'),
        avgFaithfulness: await this.getAvgQualityMetric(variantKey, 'faithfulness'),
        avgAnswerRelevancy: await this.getAvgQualityMetric(variantKey, 'answer_relevancy'),
      };
    }

    return {
      experimentId,
      control: metrics['control'],
      treatment: metrics['treatment'],
      comparison: this.calculateComparison(metrics['control'], metrics['treatment']),
    };
  }

  private calculateComparison(
    control: VariantMetrics,
    treatment: VariantMetrics
  ): MetricComparison {
    return {
      openRate: {
        control: control.openRate,
        treatment: treatment.openRate,
        absoluteDiff: treatment.openRate - control.openRate,
        relativeDiff: (treatment.openRate - control.openRate) / control.openRate,
      },
      clickRate: {
        control: control.clickRate,
        treatment: treatment.clickRate,
        absoluteDiff: treatment.clickRate - control.clickRate,
        relativeDiff: (treatment.clickRate - control.clickRate) / control.clickRate,
      },
      // ... other metrics
    };
  }
}
```

---

## 5. Statistical Analysis

### 5.1 Statistical Significance Testing

```typescript
class StatisticalAnalyzer {
  // Z-test for proportions (e.g., conversion rates)
  calculateZTest(
    controlSuccesses: number,
    controlTotal: number,
    treatmentSuccesses: number,
    treatmentTotal: number
  ): ZTestResult {
    const p1 = controlSuccesses / controlTotal;
    const p2 = treatmentSuccesses / treatmentTotal;

    // Pooled proportion
    const p = (controlSuccesses + treatmentSuccesses) / (controlTotal + treatmentTotal);

    // Standard error
    const se = Math.sqrt(p * (1 - p) * (1 / controlTotal + 1 / treatmentTotal));

    // Z-score
    const z = (p2 - p1) / se;

    // P-value (two-tailed)
    const pValue = 2 * (1 - this.normalCDF(Math.abs(z)));

    // Confidence interval (95%)
    const ci = 1.96 * se;

    return {
      zScore: z,
      pValue,
      isSignificant: pValue < 0.05,
      confidenceInterval: {
        lower: (p2 - p1) - ci,
        upper: (p2 - p1) + ci,
      },
      effectSize: p2 - p1,
      relativeChange: (p2 - p1) / p1,
    };
  }

  // T-test for continuous metrics (e.g., latency, RAGAS score)
  calculateTTest(
    controlSamples: number[],
    treatmentSamples: number[]
  ): TTestResult {
    const mean1 = this.mean(controlSamples);
    const mean2 = this.mean(treatmentSamples);

    const variance1 = this.variance(controlSamples);
    const variance2 = this.variance(treatmentSamples);

    const n1 = controlSamples.length;
    const n2 = treatmentSamples.length;

    // Welch's t-test (unequal variances)
    const se = Math.sqrt(variance1 / n1 + variance2 / n2);
    const t = (mean2 - mean1) / se;

    // Degrees of freedom (Welch-Satterthwaite equation)
    const df = Math.pow(variance1 / n1 + variance2 / n2, 2) /
               (Math.pow(variance1 / n1, 2) / (n1 - 1) + Math.pow(variance2 / n2, 2) / (n2 - 1));

    // P-value (approximate, two-tailed)
    const pValue = 2 * (1 - this.tCDF(Math.abs(t), df));

    return {
      tStatistic: t,
      degreesOfFreedom: df,
      pValue,
      isSignificant: pValue < 0.05,
      effectSize: mean2 - mean1,
      relativeChange: (mean2 - mean1) / mean1,
    };
  }

  // Sample size calculation
  calculateRequiredSampleSize(
    baselineRate: number,
    minimumDetectableEffect: number,
    alpha: number = 0.05,
    power: number = 0.80
  ): number {
    const p1 = baselineRate;
    const p2 = baselineRate * (1 + minimumDetectableEffect);

    const zAlpha = this.normalInverseCDF(1 - alpha / 2); // 1.96 for 95% CI
    const zBeta = this.normalInverseCDF(power);          // 0.84 for 80% power

    const n = Math.pow(zAlpha + zBeta, 2) *
              (p1 * (1 - p1) + p2 * (1 - p2)) /
              Math.pow(p2 - p1, 2);

    return Math.ceil(n);
  }

  // Statistical power analysis
  calculatePower(
    sampleSize: number,
    baselineRate: number,
    observedEffect: number,
    alpha: number = 0.05
  ): number {
    const p1 = baselineRate;
    const p2 = baselineRate + observedEffect;

    const zAlpha = this.normalInverseCDF(1 - alpha / 2);

    const se = Math.sqrt(p1 * (1 - p1) / sampleSize + p2 * (1 - p2) / sampleSize);
    const z = (p2 - p1) / se;

    const power = this.normalCDF(z - zAlpha);

    return power;
  }

  private mean(samples: number[]): number {
    return samples.reduce((sum, val) => sum + val, 0) / samples.length;
  }

  private variance(samples: number[]): number {
    const m = this.mean(samples);
    return samples.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / (samples.length - 1);
  }

  private normalCDF(z: number): number {
    // Approximation of standard normal CDF
    return 0.5 * (1 + this.erf(z / Math.sqrt(2)));
  }

  private erf(x: number): number {
    // Abramowitz and Stegun approximation
    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);

    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  private normalInverseCDF(p: number): number {
    // Approximation for inverse CDF (for z-scores)
    if (p === 0.95) return 1.645;  // 90% CI
    if (p === 0.975) return 1.96;  // 95% CI
    if (p === 0.995) return 2.576; // 99% CI
    if (p === 0.80) return 0.84;   // 80% power

    // General approximation
    const c0 = 2.515517;
    const c1 = 0.802853;
    const c2 = 0.010328;
    const d1 = 1.432788;
    const d2 = 0.189269;
    const d3 = 0.001308;

    const t = Math.sqrt(-2 * Math.log(1 - p));
    return t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
  }

  private tCDF(t: number, df: number): number {
    // Simplified approximation for t-distribution CDF
    // For large df, t-distribution approximates normal distribution
    if (df > 30) {
      return this.normalCDF(t);
    }

    // For small df, use approximation
    const x = df / (df + t * t);
    return 1 - 0.5 * this.betaIncomplete(df / 2, 0.5, x);
  }

  private betaIncomplete(a: number, b: number, x: number): number {
    // Simplified incomplete beta function (placeholder)
    // In production, use a proper statistical library
    return x; // Placeholder
  }
}
```

### 5.2 Experiment Dashboard

```typescript
class ExperimentDashboard {
  private metricsAggregator: MetricsAggregator;
  private statisticalAnalyzer: StatisticalAnalyzer;

  async generateReport(experimentId: string): Promise<string> {
    const metrics = await this.metricsAggregator.getExperimentMetrics(experimentId);
    const experiment = await this.getExperiment(experimentId);

    // Statistical tests
    const openRateTest = this.statisticalAnalyzer.calculateZTest(
      metrics.control.notifications * metrics.control.openRate,
      metrics.control.notifications,
      metrics.treatment.notifications * metrics.treatment.openRate,
      metrics.treatment.notifications
    );

    const clickRateTest = this.statisticalAnalyzer.calculateZTest(
      metrics.control.notifications * metrics.control.clickRate,
      metrics.control.notifications,
      metrics.treatment.notifications * metrics.treatment.clickRate,
      metrics.treatment.notifications
    );

    return `
# A/B Test Report: ${experiment.name}

**Experiment ID:** ${experimentId}
**Status:** ${experiment.status}
**Duration:** ${this.getDuration(experiment)} days
**Start Date:** ${experiment.startDate.toISOString().split('T')[0]}

## Hypothesis
${experiment.hypothesis}

## Sample Size
- **Control:** ${metrics.control.users} users, ${metrics.control.notifications} notifications
- **Treatment:** ${metrics.treatment.users} users, ${metrics.treatment.notifications} notifications

## Primary Metric: ${experiment.primaryMetric.displayName}

| Variant | Rate | Change | P-Value | Significant? |
|---------|------|--------|---------|--------------|
| Control | ${(metrics.control.clickRate * 100).toFixed(2)}% | - | - | - |
| Treatment | ${(metrics.treatment.clickRate * 100).toFixed(2)}% | ${(clickRateTest.relativeChange * 100).toFixed(2)}% | ${clickRateTest.pValue.toFixed(4)} | ${clickRateTest.isSignificant ? '✅ Yes' : '❌ No'} |

**95% Confidence Interval:** [${(clickRateTest.confidenceInterval.lower * 100).toFixed(2)}%, ${(clickRateTest.confidenceInterval.upper * 100).toFixed(2)}%]

## Secondary Metrics

### Open Rate
| Variant | Rate | Change | P-Value | Significant? |
|---------|------|--------|---------|--------------|
| Control | ${(metrics.control.openRate * 100).toFixed(2)}% | - | - | - |
| Treatment | ${(metrics.treatment.openRate * 100).toFixed(2)}% | ${(openRateTest.relativeChange * 100).toFixed(2)}% | ${openRateTest.pValue.toFixed(4)} | ${openRateTest.isSignificant ? '✅ Yes' : '❌ No'} |

### Quality Metrics (RAGAS)
| Metric | Control | Treatment | Change |
|--------|---------|-----------|--------|
| RAGAS Score | ${metrics.control.avgRagasScore.toFixed(3)} | ${metrics.treatment.avgRagasScore.toFixed(3)} | ${((metrics.treatment.avgRagasScore - metrics.control.avgRagasScore) / metrics.control.avgRagasScore * 100).toFixed(2)}% |
| Faithfulness | ${metrics.control.avgFaithfulness.toFixed(3)} | ${metrics.treatment.avgFaithfulness.toFixed(3)} | ${((metrics.treatment.avgFaithfulness - metrics.control.avgFaithfulness) / metrics.control.avgFaithfulness * 100).toFixed(2)}% |

### Performance Metrics
| Metric | Control | Treatment | Change |
|--------|---------|-----------|--------|
| Avg Latency | ${metrics.control.avgLatency.toFixed(0)}ms | ${metrics.treatment.avgLatency.toFixed(0)}ms | ${((metrics.treatment.avgLatency - metrics.control.avgLatency) / metrics.control.avgLatency * 100).toFixed(2)}% |
| P95 Latency | ${metrics.control.p95Latency.toFixed(0)}ms | ${metrics.treatment.p95Latency.toFixed(0)}ms | ${((metrics.treatment.p95Latency - metrics.control.p95Latency) / metrics.control.p95Latency * 100).toFixed(2)}% |

## Guardrail Metrics

### Unsubscribe Rate
| Variant | Rate | Threshold | Status |
|---------|------|-----------|--------|
| Control | ${(metrics.control.unsubscribeRate * 100).toFixed(3)}% | <0.5% | ${metrics.control.unsubscribeRate < 0.005 ? '✅' : '❌'} |
| Treatment | ${(metrics.treatment.unsubscribeRate * 100).toFixed(3)}% | <0.5% | ${metrics.treatment.unsubscribeRate < 0.005 ? '✅' : '❌'} |

## Recommendation

${this.generateRecommendation(metrics, clickRateTest, openRateTest, experiment)}
`;
  }

  private generateRecommendation(
    metrics: ExperimentMetrics,
    primaryTest: ZTestResult,
    secondaryTest: ZTestResult,
    experiment: Experiment
  ): string {
    // Check guardrails
    if (metrics.treatment.unsubscribeRate >= 0.005) {
      return '❌ **STOP EXPERIMENT**: Guardrail violated. Unsubscribe rate exceeds 0.5% threshold.';
    }

    // Check statistical significance and direction
    if (primaryTest.isSignificant && primaryTest.effectSize > 0) {
      const improvement = (primaryTest.relativeChange * 100).toFixed(1);
      return `✅ **ROLLOUT TREATMENT**: Treatment shows statistically significant ${improvement}% improvement in ${experiment.primaryMetric.displayName}. Recommend full rollout.`;
    } else if (primaryTest.isSignificant && primaryTest.effectSize < 0) {
      const degradation = Math.abs(primaryTest.relativeChange * 100).toFixed(1);
      return `❌ **STOP EXPERIMENT**: Treatment shows statistically significant ${degradation}% degradation in ${experiment.primaryMetric.displayName}. Do not rollout.`;
    } else {
      return `⏳ **CONTINUE**: No statistically significant difference yet. Continue experiment to reach sufficient sample size.`;
    }
  }
}
```

---

## 6. Decision Framework

### 6.1 Rollout Criteria

```typescript
interface RolloutCriteria {
  // Statistical Significance
  primaryMetricSignificant: boolean;     // P-value < 0.05
  primaryMetricImproved: boolean;        // Positive effect

  // Minimum Effect Size
  meetsMinimumEffect: boolean;           // Exceeds MDE

  // Guardrails
  guardrailsHealthy: boolean;            // No guardrail violations

  // Sample Size
  sufficientSampleSize: boolean;         // Reached minimum n

  // Duration
  sufficientDuration: boolean;           // >= minDuration days
}

class DecisionEngine {
  evaluate(experimentId: string): Promise<RolloutDecision> {
    const metrics = await this.metricsAggregator.getExperimentMetrics(experimentId);
    const experiment = await this.getExperiment(experimentId);

    const primaryTest = this.statisticalAnalyzer.calculateZTest(
      metrics.control.primaryMetricSuccesses,
      metrics.control.notifications,
      metrics.treatment.primaryMetricSuccesses,
      metrics.treatment.notifications
    );

    const criteria: RolloutCriteria = {
      primaryMetricSignificant: primaryTest.isSignificant,
      primaryMetricImproved: primaryTest.effectSize > 0,
      meetsMinimumEffect: Math.abs(primaryTest.relativeChange) >= experiment.minimumDetectableEffect,
      guardrailsHealthy: this.checkGuardrails(metrics, experiment),
      sufficientSampleSize: metrics.treatment.notifications >= this.getMinSampleSize(experiment),
      sufficientDuration: this.getDuration(experiment) >= experiment.minDuration,
    };

    return {
      decision: this.makeDecision(criteria),
      criteria,
      confidence: this.calculateConfidence(criteria, primaryTest),
    };
  }

  private makeDecision(criteria: RolloutCriteria): 'rollout' | 'stop' | 'continue' {
    // Guardrail violation → stop immediately
    if (!criteria.guardrailsHealthy) {
      return 'stop';
    }

    // Not enough data yet → continue
    if (!criteria.sufficientSampleSize || !criteria.sufficientDuration) {
      return 'continue';
    }

    // Statistically significant improvement → rollout
    if (
      criteria.primaryMetricSignificant &&
      criteria.primaryMetricImproved &&
      criteria.meetsMinimumEffect
    ) {
      return 'rollout';
    }

    // Statistically significant degradation → stop
    if (criteria.primaryMetricSignificant && !criteria.primaryMetricImproved) {
      return 'stop';
    }

    // No significance yet → continue (up to maxDuration)
    return 'continue';
  }

  private calculateConfidence(
    criteria: RolloutCriteria,
    test: ZTestResult
  ): number {
    // Confidence score based on criteria met
    let score = 0;

    if (criteria.primaryMetricSignificant) score += 0.4;
    if (criteria.meetsMinimumEffect) score += 0.2;
    if (criteria.sufficientSampleSize) score += 0.2;
    if (criteria.sufficientDuration) score += 0.1;
    if (criteria.guardrailsHealthy) score += 0.1;

    // Adjust by p-value (lower p-value = higher confidence)
    score *= (1 - test.pValue);

    return Math.min(1.0, score);
  }
}
```

### 6.2 Gradual Rollout Strategy

```typescript
class GradualRollout {
  private stages = [
    { percentage: 0.05, duration: 1 },  // 5% for 1 day
    { percentage: 0.25, duration: 2 },  // 25% for 2 days
    { percentage: 0.50, duration: 3 },  // 50% for 3 days
    { percentage: 1.00, duration: 0 },  // 100% (full rollout)
  ];

  async rolloutTreatment(experimentId: string): Promise<void> {
    const experiment = await this.getExperiment(experimentId);

    for (const stage of this.stages) {
      console.log(`Rolling out to ${stage.percentage * 100}% of traffic...`);

      // Update traffic allocation
      await this.updateTrafficAllocation(experimentId, {
        control: 1 - stage.percentage,
        treatment: stage.percentage,
      });

      // Wait for stage duration
      await this.sleep(stage.duration * 24 * 60 * 60 * 1000);

      // Check health metrics
      const metrics = await this.metricsAggregator.getExperimentMetrics(experimentId);

      if (!this.checkGuardrails(metrics, experiment)) {
        console.error('Guardrail violation detected! Rolling back...');
        await this.rollback(experimentId);
        return;
      }
    }

    console.log('✅ Full rollout complete!');
    await this.completeExperiment(experimentId, 'rolled_out');
  }

  private async rollback(experimentId: string): Promise<void> {
    await this.updateTrafficAllocation(experimentId, {
      control: 1.0,
      treatment: 0.0,
    });
  }
}
```

---

## 7. Complete Workflow

```typescript
// 1. Create Experiment
const experiment = await experimentManager.createExperiment(hybridSearchExperiment);

// 2. Start Experiment
await experimentManager.startExperiment(experiment.id);

// 3. Monitor Daily
setInterval(async () => {
  const dashboard = await experimentDashboard.generateReport(experiment.id);
  console.log(dashboard);

  // Check for decision
  const decision = await decisionEngine.evaluate(experiment.id);

  if (decision.decision === 'rollout') {
    console.log('✅ Treatment won! Starting gradual rollout...');
    await gradualRollout.rolloutTreatment(experiment.id);
  } else if (decision.decision === 'stop') {
    console.log('❌ Treatment lost. Stopping experiment...');
    await experimentManager.stopExperiment(experiment.id);
  } else {
    console.log('⏳ Continue collecting data...');
  }
}, 24 * 60 * 60 * 1000); // Check daily
```

---

## 8. Best Practices

1. **Always Run A/A Tests First** - Validate instrumentation with no changes
2. **Set Guardrail Metrics** - Prevent disasters (unsubscribe, latency)
3. **Calculate Sample Size Upfront** - Know when you'll have enough data
4. **Don't Peek Too Early** - Wait for minimum duration to avoid false positives
5. **Test One Change at a Time** - Isolate effects
6. **Document Hypothesis** - Clear expectations before running
7. **Gradual Rollout** - Minimize risk with staged deployment
8. **Monitor Long-Term Effects** - Track metrics for weeks after rollout

---

## 9. Next Steps

1. **Implement Traffic Splitting** (deterministic user assignment)
2. **Set Up Metrics Collection** (event tracking infrastructure)
3. **Build Experiment Dashboard** (real-time monitoring)
4. **Run First A/A Test** (validate measurement)
5. **Launch First A/B Test** (hybrid search weights)
