import { Injectable, Logger } from '@nestjs/common';
import { LLMService } from './llm.service';

/**
 * RAG Evaluation Service - Implements RAGAS-inspired metrics
 *
 * Features:
 * - Faithfulness: Does the answer align with retrieved context?
 * - Relevancy: Is the answer relevant to the query?
 * - Context Precision: Are retrieved docs relevant?
 * - Context Recall: Are all relevant docs retrieved?
 * - Answer Similarity: Semantic similarity to reference
 */
@Injectable()
export class RAGEvaluationService {
  private readonly logger = new Logger(RAGEvaluationService.name);

  constructor(private readonly llmService: LLMService) {
    this.logger.log('RAG Evaluation Service initialized');
  }

  /**
   * Evaluate a single RAG response
   */
  async evaluateResponse(
    query: string,
    generatedAnswer: string,
    retrievedContext: string[],
    referenceAnswer?: string,
  ): Promise<EvaluationResult> {
    const startTime = Date.now();

    try {
      this.logger.debug(`Evaluating RAG response for query: "${query}"`);

      // Run evaluations in parallel for efficiency
      const [faithfulness, answerRelevancy, contextPrecision] =
        await Promise.all([
          this.evaluateFaithfulness(generatedAnswer, retrievedContext),
          this.evaluateAnswerRelevancy(query, generatedAnswer),
          this.evaluateContextPrecision(query, retrievedContext),
        ]);

      // Optional: Answer similarity if reference provided
      let answerSimilarity: number | undefined;
      if (referenceAnswer) {
        answerSimilarity = await this.evaluateAnswerSimilarity(
          generatedAnswer,
          referenceAnswer,
        );
      }

      // Calculate overall score (weighted average)
      const overallScore = this.calculateOverallScore({
        faithfulness,
        answerRelevancy,
        contextPrecision,
        answerSimilarity,
      });

      const evaluationTimeMs = Date.now() - startTime;

      this.logger.log(
        `Evaluation complete: Overall=${overallScore.toFixed(2)}, Faithfulness=${faithfulness.toFixed(2)}, Relevancy=${answerRelevancy.toFixed(2)} (${evaluationTimeMs}ms)`,
      );

      return {
        query,
        generatedAnswer,
        metrics: {
          faithfulness,
          answerRelevancy,
          contextPrecision,
          answerSimilarity,
          overallScore,
        },
        metadata: {
          evaluationTimeMs,
          contextCount: retrievedContext.length,
          hasReference: !!referenceAnswer,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Evaluation failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Evaluate faithfulness: Does the answer align with context?
   * Uses LLM to check if answer statements are supported by context
   */
  private async evaluateFaithfulness(
    answer: string,
    context: string[],
  ): Promise<number> {
    if (context.length === 0) {
      return 0;
    }

    const contextText = context.join('\n\n');

    const prompt = `You are an evaluation assistant. Your task is to determine if an answer is faithful to the provided context.

Context:
${contextText}

Answer:
${answer}

Question: Is the answer fully supported by the context? Consider:
1. Are all claims in the answer backed by the context?
2. Does the answer introduce information not in the context?
3. Are there any contradictions with the context?

Respond with a single number between 0 and 1:
- 1.0: Completely faithful, all statements supported
- 0.7-0.9: Mostly faithful, minor unsupported details
- 0.4-0.6: Partially faithful, some unsupported claims
- 0.1-0.3: Mostly unfaithful, many unsupported claims
- 0.0: Completely unfaithful, contradicts or ignores context

Score (0-1):`;

    try {
      const response = await this.llmService.generateCompletion(prompt, {
        temperature: 0.1,
        maxTokens: 10,
      });

      const score = this.extractScore(response.content);
      return Math.max(0, Math.min(1, score));
    } catch (error) {
      this.logger.warn('Faithfulness evaluation failed, returning 0.5');
      return 0.5;
    }
  }

  /**
   * Evaluate answer relevancy: Is the answer relevant to the query?
   * Uses LLM to check if answer addresses the question
   */
  private async evaluateAnswerRelevancy(
    query: string,
    answer: string,
  ): Promise<number> {
    const prompt = `You are an evaluation assistant. Your task is to determine if an answer is relevant to the query.

Query:
${query}

Answer:
${answer}

Question: How relevant is the answer to the query? Consider:
1. Does the answer directly address the query?
2. Is the answer focused on the topic?
3. Does it contain unnecessary information?

Respond with a single number between 0 and 1:
- 1.0: Perfectly relevant, directly addresses query
- 0.7-0.9: Highly relevant, mostly on-topic
- 0.4-0.6: Moderately relevant, partially on-topic
- 0.1-0.3: Slightly relevant, mostly off-topic
- 0.0: Not relevant, doesn't address query

Score (0-1):`;

    try {
      const response = await this.llmService.generateCompletion(prompt, {
        temperature: 0.1,
        maxTokens: 10,
      });

      const score = this.extractScore(response.content);
      return Math.max(0, Math.min(1, score));
    } catch (error) {
      this.logger.warn('Answer relevancy evaluation failed, returning 0.5');
      return 0.5;
    }
  }

  /**
   * Evaluate context precision: Are retrieved docs relevant?
   * Checks if context contains information needed to answer query
   */
  private async evaluateContextPrecision(
    query: string,
    context: string[],
  ): Promise<number> {
    if (context.length === 0) {
      return 0;
    }

    const contextText = context.join('\n\n');

    const prompt = `You are an evaluation assistant. Your task is to determine if the retrieved context is relevant to the query.

Query:
${query}

Retrieved Context:
${contextText}

Question: How relevant is the context to answering the query? Consider:
1. Does the context contain information to answer the query?
2. Is there irrelevant information in the context?
3. How precise is the retrieval?

Respond with a single number between 0 and 1:
- 1.0: Highly precise, all context relevant
- 0.7-0.9: Good precision, mostly relevant
- 0.4-0.6: Moderate precision, some irrelevant content
- 0.1-0.3: Low precision, mostly irrelevant
- 0.0: No precision, completely irrelevant

Score (0-1):`;

    try {
      const response = await this.llmService.generateCompletion(prompt, {
        temperature: 0.1,
        maxTokens: 10,
      });

      const score = this.extractScore(response.content);
      return Math.max(0, Math.min(1, score));
    } catch (error) {
      this.logger.warn('Context precision evaluation failed, returning 0.5');
      return 0.5;
    }
  }

  /**
   * Evaluate answer similarity: Semantic similarity to reference
   * Uses LLM to compare generated answer with reference
   */
  private async evaluateAnswerSimilarity(
    generatedAnswer: string,
    referenceAnswer: string,
  ): Promise<number> {
    const prompt = `You are an evaluation assistant. Your task is to determine semantic similarity between two answers.

Reference Answer:
${referenceAnswer}

Generated Answer:
${generatedAnswer}

Question: How semantically similar are these answers? Consider:
1. Do they convey the same meaning?
2. Are the key points the same?
3. Ignore minor wording differences

Respond with a single number between 0 and 1:
- 1.0: Identical meaning, same key points
- 0.7-0.9: Very similar, minor differences
- 0.4-0.6: Moderately similar, some differences
- 0.1-0.3: Somewhat similar, major differences
- 0.0: Completely different meaning

Score (0-1):`;

    try {
      const response = await this.llmService.generateCompletion(prompt, {
        temperature: 0.1,
        maxTokens: 10,
      });

      const score = this.extractScore(response.content);
      return Math.max(0, Math.min(1, score));
    } catch (error) {
      this.logger.warn('Answer similarity evaluation failed, returning 0.5');
      return 0.5;
    }
  }

  /**
   * Calculate overall score from individual metrics
   */
  private calculateOverallScore(metrics: {
    faithfulness: number;
    answerRelevancy: number;
    contextPrecision: number;
    answerSimilarity?: number;
  }): number {
    // Weighted average
    const weights = {
      faithfulness: 0.35,
      answerRelevancy: 0.35,
      contextPrecision: 0.2,
      answerSimilarity: 0.1,
    };

    let score =
      metrics.faithfulness * weights.faithfulness +
      metrics.answerRelevancy * weights.answerRelevancy +
      metrics.contextPrecision * weights.contextPrecision;

    if (metrics.answerSimilarity !== undefined) {
      score += metrics.answerSimilarity * weights.answerSimilarity;
    } else {
      // Redistribute weight if no reference
      const redistributed =
        weights.answerSimilarity / (1 - weights.answerSimilarity);
      score = score * (1 + redistributed);
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Extract numeric score from LLM response
   */
  private extractScore(text: string): number {
    // Try to find a number between 0 and 1
    const match = text.match(/(?:^|\s)(0?\.\d+|1\.0|0|1)(?:\s|$)/);
    if (match) {
      return parseFloat(match[1]);
    }

    // Fallback: look for any decimal number
    const decimalMatch = text.match(/\d+\.\d+/);
    if (decimalMatch) {
      return parseFloat(decimalMatch[0]);
    }

    // Default to 0.5 if can't parse
    this.logger.warn(`Could not extract score from: "${text}"`);
    return 0.5;
  }

  /**
   * Evaluate a batch of examples
   */
  async evaluateBatch(
    examples: EvaluationExample[],
  ): Promise<BatchEvaluationResult> {
    const startTime = Date.now();
    const results: EvaluationResult[] = [];
    const errors: Array<{ index: number; error: string }> = [];

    this.logger.log(`Starting batch evaluation of ${examples.length} examples`);

    for (let i = 0; i < examples.length; i++) {
      const example = examples[i];

      try {
        const result = await this.evaluateResponse(
          example.query,
          example.generatedAnswer,
          example.retrievedContext,
          example.referenceAnswer,
        );

        results.push(result);

        if ((i + 1) % 10 === 0) {
          this.logger.debug(`Evaluated ${i + 1}/${examples.length} examples`);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        errors.push({ index: i, error: errorMessage });
        this.logger.warn(`Failed to evaluate example ${i}: ${errorMessage}`);
      }
    }

    const totalTimeMs = Date.now() - startTime;

    // Calculate aggregate statistics
    const aggregateMetrics = this.calculateAggregateMetrics(results);

    this.logger.log(
      `Batch evaluation complete: ${results.length}/${examples.length} succeeded, ${errors.length} failed (${totalTimeMs}ms)`,
    );

    return {
      results,
      errors,
      aggregateMetrics,
      metadata: {
        totalExamples: examples.length,
        successCount: results.length,
        errorCount: errors.length,
        totalTimeMs,
        avgTimePerExample: results.length > 0 ? totalTimeMs / results.length : 0,
      },
    };
  }

  /**
   * Calculate aggregate metrics from results
   */
  private calculateAggregateMetrics(
    results: EvaluationResult[],
  ): AggregateMetrics {
    if (results.length === 0) {
      return {
        avgFaithfulness: 0,
        avgAnswerRelevancy: 0,
        avgContextPrecision: 0,
        avgAnswerSimilarity: 0,
        avgOverallScore: 0,
        distribution: {
          excellent: 0,
          good: 0,
          fair: 0,
          poor: 0,
        },
      };
    }

    const sum = results.reduce(
      (acc, r) => ({
        faithfulness: acc.faithfulness + r.metrics.faithfulness,
        answerRelevancy: acc.answerRelevancy + r.metrics.answerRelevancy,
        contextPrecision: acc.contextPrecision + r.metrics.contextPrecision,
        answerSimilarity:
          acc.answerSimilarity + (r.metrics.answerSimilarity || 0),
        overallScore: acc.overallScore + r.metrics.overallScore,
      }),
      {
        faithfulness: 0,
        answerRelevancy: 0,
        contextPrecision: 0,
        answerSimilarity: 0,
        overallScore: 0,
      },
    );

    const withSimilarity = results.filter(
      (r) => r.metrics.answerSimilarity !== undefined,
    ).length;

    // Distribution by overall score
    const distribution = {
      excellent: results.filter((r) => r.metrics.overallScore >= 0.8).length,
      good: results.filter(
        (r) => r.metrics.overallScore >= 0.6 && r.metrics.overallScore < 0.8,
      ).length,
      fair: results.filter(
        (r) => r.metrics.overallScore >= 0.4 && r.metrics.overallScore < 0.6,
      ).length,
      poor: results.filter((r) => r.metrics.overallScore < 0.4).length,
    };

    return {
      avgFaithfulness: sum.faithfulness / results.length,
      avgAnswerRelevancy: sum.answerRelevancy / results.length,
      avgContextPrecision: sum.contextPrecision / results.length,
      avgAnswerSimilarity:
        withSimilarity > 0 ? sum.answerSimilarity / withSimilarity : undefined,
      avgOverallScore: sum.overallScore / results.length,
      distribution,
    };
  }

  /**
   * Compare two systems (e.g., RAG vs naive)
   */
  async compareSystems(
    system1Results: EvaluationResult[],
    system2Results: EvaluationResult[],
  ): Promise<ComparisonResult> {
    const metrics1 = this.calculateAggregateMetrics(system1Results);
    const metrics2 = this.calculateAggregateMetrics(system2Results);

    const improvement = {
      faithfulness: metrics1.avgFaithfulness - metrics2.avgFaithfulness,
      answerRelevancy: metrics1.avgAnswerRelevancy - metrics2.avgAnswerRelevancy,
      contextPrecision: metrics1.avgContextPrecision - metrics2.avgContextPrecision,
      overallScore: metrics1.avgOverallScore - metrics2.avgOverallScore,
    };

    const percentImprovement = {
      faithfulness:
        metrics2.avgFaithfulness > 0
          ? (improvement.faithfulness / metrics2.avgFaithfulness) * 100
          : 0,
      answerRelevancy:
        metrics2.avgAnswerRelevancy > 0
          ? (improvement.answerRelevancy / metrics2.avgAnswerRelevancy) * 100
          : 0,
      contextPrecision:
        metrics2.avgContextPrecision > 0
          ? (improvement.contextPrecision / metrics2.avgContextPrecision) * 100
          : 0,
      overallScore:
        metrics2.avgOverallScore > 0
          ? (improvement.overallScore / metrics2.avgOverallScore) * 100
          : 0,
    };

    return {
      system1: metrics1,
      system2: metrics2,
      improvement,
      percentImprovement,
      winner: metrics1.avgOverallScore > metrics2.avgOverallScore ? 1 : 2,
    };
  }
}

/**
 * Evaluation Example
 */
export interface EvaluationExample {
  query: string;
  generatedAnswer: string;
  retrievedContext: string[];
  referenceAnswer?: string;
}

/**
 * Evaluation Result
 */
export interface EvaluationResult {
  query: string;
  generatedAnswer: string;
  metrics: {
    faithfulness: number;
    answerRelevancy: number;
    contextPrecision: number;
    answerSimilarity?: number;
    overallScore: number;
  };
  metadata: {
    evaluationTimeMs: number;
    contextCount: number;
    hasReference: boolean;
  };
}

/**
 * Batch Evaluation Result
 */
export interface BatchEvaluationResult {
  results: EvaluationResult[];
  errors: Array<{ index: number; error: string }>;
  aggregateMetrics: AggregateMetrics;
  metadata: {
    totalExamples: number;
    successCount: number;
    errorCount: number;
    totalTimeMs: number;
    avgTimePerExample: number;
  };
}

/**
 * Aggregate Metrics
 */
export interface AggregateMetrics {
  avgFaithfulness: number;
  avgAnswerRelevancy: number;
  avgContextPrecision: number;
  avgAnswerSimilarity?: number;
  avgOverallScore: number;
  distribution: {
    excellent: number; // >= 0.8
    good: number; // 0.6-0.8
    fair: number; // 0.4-0.6
    poor: number; // < 0.4
  };
}

/**
 * Comparison Result
 */
export interface ComparisonResult {
  system1: AggregateMetrics;
  system2: AggregateMetrics;
  improvement: {
    faithfulness: number;
    answerRelevancy: number;
    contextPrecision: number;
    overallScore: number;
  };
  percentImprovement: {
    faithfulness: number;
    answerRelevancy: number;
    contextPrecision: number;
    overallScore: number;
  };
  winner: 1 | 2;
}
