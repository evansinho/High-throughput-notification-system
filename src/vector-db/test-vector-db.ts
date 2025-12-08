/**
 * Test script for Vector DB functionality
 * Run with: npx ts-node src/vector-db/test-vector-db.ts
 */
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { QdrantService } from './services/qdrant.service';
import { EmbeddingService } from './services/embedding.service';
import { NotificationTemplate } from './interfaces/vector.interface';
import configuration from '../config/configuration';
import { randomUUID } from 'crypto';

async function testVectorDB() {
  console.log('🧪 Testing Vector DB...\n');

  // Create a testing module
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [configuration],
      }),
    ],
    providers: [QdrantService, EmbeddingService],
  }).compile();

  await moduleRef.init();

  const qdrantService = moduleRef.get<QdrantService>(QdrantService);
  const embeddingService = moduleRef.get<EmbeddingService>(EmbeddingService);

  try {
    // Clean up: Clear collection before testing
    console.log('Preparing test environment...');
    await qdrantService.clearCollection();
    console.log('✅ Collection cleared\n');

    // Test 1: Check collection info
    console.log('Test 1: Check collection information');
    const collectionInfo = await qdrantService.getCollectionInfo();
    console.log('✅ Collection:', collectionInfo);
    console.log('');

    // Test 2: Test embedding generation
    console.log('Test 2: Generate embeddings');
    const sampleTexts = [
      'Welcome to our service! We are excited to have you.',
      'Your order #12345 has been shipped and is on its way.',
      'Your password reset link is ready. Click here to reset.',
    ];

    const embeddings = await embeddingService.generateEmbeddings(sampleTexts);
    console.log(`✅ Generated ${embeddings.length} embeddings`);
    console.log(`   Dimensions: ${embeddings[0].dimensions}`);
    console.log(`   Model: ${embeddings[0].model}`);
    console.log('');

    // Test 3: Upload sample templates
    console.log('Test 3: Upload notification templates');

    // Generate UUIDs for templates (Qdrant requires UUID or numeric IDs)
    const templateIds = {
      welcome: randomUUID(),
      shipping: randomUUID(),
      passwordReset: randomUUID(),
      promotion: randomUUID(),
      paymentFailed: randomUUID(),
    };

    const templates: NotificationTemplate[] = [
      {
        id: templateIds.welcome,
        content:
          'Welcome to {{service_name}}! We are excited to have you on board.',
        channel: 'email',
        category: 'transactional',
        tone: 'friendly',
        language: 'en',
        tags: ['welcome', 'onboarding'],
        metadata: { priority: 'high' },
      },
      {
        id: templateIds.shipping,
        content:
          'Your order {{order_number}} has been shipped and will arrive in 3-5 business days.',
        channel: 'email',
        category: 'transactional',
        tone: 'professional',
        language: 'en',
        tags: ['order', 'shipping'],
        metadata: { priority: 'medium' },
      },
      {
        id: templateIds.passwordReset,
        content:
          'Hi {{user_name}}, you requested to reset your password. Click the link to proceed.',
        channel: 'email',
        category: 'transactional',
        tone: 'professional',
        language: 'en',
        tags: ['security', 'password-reset'],
        metadata: { priority: 'high' },
      },
      {
        id: templateIds.promotion,
        content: 'Flash Sale! Get 50% off on all items. Limited time offer.',
        channel: 'email',
        category: 'marketing',
        tone: 'exciting',
        language: 'en',
        tags: ['promotion', 'sale'],
        metadata: { priority: 'low' },
      },
      {
        id: templateIds.paymentFailed,
        content:
          'Your payment for order {{order_number}} failed. Please update your payment method.',
        channel: 'sms',
        category: 'transactional',
        tone: 'urgent',
        language: 'en',
        tags: ['payment', 'error'],
        metadata: { priority: 'critical' },
      },
    ];

    // Generate embeddings and upload
    const templateEmbeddings = await embeddingService.generateEmbeddings(
      templates.map((t) => t.content),
    );

    const batch = templates.map((template, index) => ({
      template,
      embedding: templateEmbeddings[index].embedding,
    }));

    await qdrantService.upsertTemplates(batch);
    console.log(`✅ Uploaded ${templates.length} templates`);
    console.log('');

    // Test 4: Search for similar templates
    console.log('Test 4: Search for similar templates');
    const searchQuery = 'I forgot my password and need to reset it';
    const queryEmbedding =
      await embeddingService.generateEmbedding(searchQuery);

    const searchResults = await qdrantService.search(queryEmbedding.embedding, {
      queryText: searchQuery,
      topK: 3,
      scoreThreshold: 0.0, // Low threshold for mock embeddings
    });

    console.log(`Query: "${searchQuery}"`);
    console.log(`Found ${searchResults.length} similar templates:`);
    searchResults.forEach((result, index) => {
      console.log(`\n  ${index + 1}. Template ID: ${result.id}`);
      console.log(`     Score: ${result.score.toFixed(4)}`);
      console.log(`     Content: ${result.payload.content}`);
      console.log(
        `     Channel: ${result.payload.channel}, Category: ${result.payload.category}`,
      );
      console.log(`     Tags: ${result.payload.tags.join(', ')}`);
    });
    console.log('');

    // Test 5: Search with metadata filtering
    console.log('Test 5: Search with metadata filtering');
    const filterQuery = 'order notification';
    const filterEmbedding =
      await embeddingService.generateEmbedding(filterQuery);

    const filteredResults = await qdrantService.search(
      filterEmbedding.embedding,
      {
        queryText: filterQuery,
        topK: 5,
        filter: {
          category: 'transactional',
          channel: 'email',
        },
        scoreThreshold: 0.5,
      },
    );

    console.log(`Query: "${filterQuery}"`);
    console.log('Filter: category=transactional, channel=email');
    console.log(`Found ${filteredResults.length} matching templates:`);
    filteredResults.forEach((result, index) => {
      console.log(
        `\n  ${index + 1}. ${result.payload.content.substring(0, 60)}...`,
      );
      console.log(`     Score: ${result.score.toFixed(4)}`);
      console.log(`     Tags: ${result.payload.tags.join(', ')}`);
    });
    console.log('');

    // Test 6: Get template count
    const count = await qdrantService.countTemplates();
    console.log(`✅ Total templates in collection: ${count}`);
    console.log('');

    // Test 7: Retrieve specific template
    console.log('Test 7: Retrieve specific template');
    const retrievedTemplate = await qdrantService.getTemplate(
      templateIds.passwordReset,
    );
    if (retrievedTemplate) {
      console.log('✅ Retrieved template:');
      console.log(`   ID: ${retrievedTemplate.id}`);
      console.log(`   Content: ${retrievedTemplate.content}`);
      console.log(`   Tags: ${retrievedTemplate.tags.join(', ')}`);
    }
    console.log('');

    console.log('🎉 All tests passed!');
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Test failed:', errorMessage);
    if (error instanceof Error && error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    await moduleRef.close();
  }
}

// Run tests
testVectorDB().catch((error) => {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  console.error('❌ Fatal error:', errorMessage);
  process.exit(1);
});
