/**
 * Simple test script for AI service
 * Run with: npx ts-node src/ai/test-ai.ts
 */
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { LLMService } from './services/llm.service';
import { CostTrackingService } from './services/cost-tracking.service';
import configuration from '../config/configuration';

async function testAIService() {
  console.log('🧪 Testing AI Service...\n');

  // Create a testing module
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [configuration],
      }),
    ],
    providers: [LLMService, CostTrackingService],
  }).compile();

  const llmService = moduleRef.get<LLMService>(LLMService);
  const costTrackingService =
    moduleRef.get<CostTrackingService>(CostTrackingService);

  try {
    // Test 1: Basic completion
    console.log('Test 1: Basic prompt completion');
    const response = await llmService.generateCompletion({
      systemPrompt: 'You are a helpful assistant for a notification system.',
      userPrompt: 'Write a brief welcome email subject line (max 10 words).',
      maxTokens: 50,
    });

    console.log('✅ Response:', response.content);
    console.log('📊 Usage:', response.usage);
    console.log('⏱️  Latency:', response.latencyMs, 'ms');
    console.log(
      '💰 Cost: $',
      llmService.calculateCost(response.usage).toFixed(6),
    );
    console.log('');

    // Test 2: Connection test
    console.log('Test 2: Connection test');
    const isHealthy = await llmService.testConnection();
    console.log('✅ Connection:', isHealthy ? 'Healthy' : 'Unhealthy');
    console.log('');

    // Test 3: Get cost statistics
    console.log('Test 3: Cost tracking statistics');
    const stats = costTrackingService.getStatistics();
    console.log('📈 Statistics:', JSON.stringify(stats, null, 2));
    console.log('');

    console.log('🎉 All tests passed!');
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Test failed:', errorMessage);
    process.exit(1);
  }
}

// Run tests
testAIService().catch((error) => {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  console.error('❌ Fatal error:', errorMessage);
  process.exit(1);
});
