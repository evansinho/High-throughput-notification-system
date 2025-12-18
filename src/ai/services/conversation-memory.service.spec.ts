import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConversationMemoryService } from './conversation-memory.service';

describe('ConversationMemoryService', () => {
  let service: ConversationMemoryService;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn().mockReturnValue(null), // No Redis URL, use in-memory
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationMemoryService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ConversationMemoryService>(ConversationMemoryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createConversation', () => {
    it('should create a new conversation', async () => {
      const userId = 'user-123';
      const metadata = { title: 'Test Conversation' };

      const conversationId = await service.createConversation(userId, metadata);

      expect(conversationId).toBeDefined();
      expect(conversationId).toContain('conv_');

      // Verify conversation was created
      const conversation = await service.getConversation(conversationId);
      expect(conversation).toBeDefined();
      expect(conversation?.userId).toBe(userId);
      expect(conversation?.metadata.title).toBe('Test Conversation');
      expect(conversation?.turns).toEqual([]);
      expect(conversation?.totalTokens).toBe(0);
    });

    it('should generate unique conversation IDs', async () => {
      const id1 = await service.createConversation('user-1');
      const id2 = await service.createConversation('user-1');

      expect(id1).not.toBe(id2);
    });
  });

  describe('addTurn', () => {
    it('should add turn to conversation', async () => {
      const conversationId = await service.createConversation('user-123');

      const turn = {
        userQuery: 'What is the weather today?',
        assistantResponse: 'The weather is sunny.',
        tokensUsed: 50,
      };

      const updated = await service.addTurn(conversationId, turn);

      expect(updated.turns).toHaveLength(1);
      expect(updated.turns[0].userQuery).toBe(turn.userQuery);
      expect(updated.turns[0].assistantResponse).toBe(turn.assistantResponse);
      expect(updated.turns[0].timestamp).toBeDefined();
      expect(updated.totalTokens).toBe(50);
    });

    it('should track multiple turns', async () => {
      const conversationId = await service.createConversation('user-123');

      await service.addTurn(conversationId, {
        userQuery: 'First question',
        assistantResponse: 'First answer',
        tokensUsed: 30,
      });

      await service.addTurn(conversationId, {
        userQuery: 'Second question',
        assistantResponse: 'Second answer',
        tokensUsed: 40,
      });

      const conversation = await service.getConversation(conversationId);

      expect(conversation?.turns).toHaveLength(2);
      expect(conversation?.totalTokens).toBe(70);
      expect(conversation?.metadata.totalTurns).toBe(2);
    });

    it('should throw error for non-existent conversation', async () => {
      await expect(
        service.addTurn('non-existent', {
          userQuery: 'Test',
          assistantResponse: 'Test',
        }),
      ).rejects.toThrow('Conversation non-existent not found');
    });
  });

  describe('getRecentContext', () => {
    it('should return formatted context from recent turns', async () => {
      const conversationId = await service.createConversation('user-123');

      await service.addTurn(conversationId, {
        userQuery: 'What is the weather?',
        assistantResponse: 'Sunny.',
        tokensUsed: 20,
      });

      await service.addTurn(conversationId, {
        userQuery: 'What about tomorrow?',
        assistantResponse: 'Rainy.',
        tokensUsed: 20,
      });

      const context = await service.getRecentContext(conversationId, 2);

      expect(context).toContain('What is the weather?');
      expect(context).toContain('Sunny.');
      expect(context).toContain('What about tomorrow?');
      expect(context).toContain('Rainy.');
      expect(context).toContain('Turn 1');
      expect(context).toContain('Turn 2');
    });

    it('should limit context to maxTurns', async () => {
      const conversationId = await service.createConversation('user-123');

      for (let i = 1; i <= 5; i++) {
        await service.addTurn(conversationId, {
          userQuery: `Question ${i}`,
          assistantResponse: `Answer ${i}`,
          tokensUsed: 10,
        });
      }

      const context = await service.getRecentContext(conversationId, 2);

      expect(context).not.toContain('Question 1');
      expect(context).not.toContain('Question 2');
      expect(context).not.toContain('Question 3');
      expect(context).toContain('Question 4');
      expect(context).toContain('Question 5');
    });

    it('should return empty string for empty conversation', async () => {
      const conversationId = await service.createConversation('user-123');
      const context = await service.getRecentContext(conversationId);

      expect(context).toBe('');
    });

    it('should return empty string for non-existent conversation', async () => {
      const context = await service.getRecentContext('non-existent');

      expect(context).toBe('');
    });
  });

  describe('listConversations', () => {
    it('should list all conversations for a user', async () => {
      const userId = 'user-123';

      const id1 = await service.createConversation(userId, {
        title: 'Conv 1',
      });
      const id2 = await service.createConversation(userId, {
        title: 'Conv 2',
      });
      await service.createConversation('user-456'); // Different user

      const conversations = await service.listConversations(userId);

      expect(conversations).toHaveLength(2);
      expect(conversations.find((c) => c.conversationId === id1)).toBeDefined();
      expect(conversations.find((c) => c.conversationId === id2)).toBeDefined();
    });

    it('should sort conversations by last activity (newest first)', async () => {
      const userId = 'user-123';

      const id1 = await service.createConversation(userId);
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay
      const id2 = await service.createConversation(userId);

      const conversations = await service.listConversations(userId);

      expect(conversations[0].conversationId).toBe(id2);
      expect(conversations[1].conversationId).toBe(id1);
    });
  });

  describe('deleteConversation', () => {
    it('should delete conversation', async () => {
      const conversationId = await service.createConversation('user-123');

      await service.deleteConversation(conversationId);

      const conversation = await service.getConversation(conversationId);
      expect(conversation).toBeNull();
    });
  });

  describe('clearUserConversations', () => {
    it('should delete all conversations for a user', async () => {
      const userId = 'user-123';

      await service.createConversation(userId);
      await service.createConversation(userId);
      await service.createConversation('user-456'); // Different user

      const count = await service.clearUserConversations(userId);

      expect(count).toBe(2);

      const conversations = await service.listConversations(userId);
      expect(conversations).toHaveLength(0);

      // Other user's conversations should remain
      const otherConversations = await service.listConversations('user-456');
      expect(otherConversations).toHaveLength(1);
    });
  });

  describe('conversation pruning', () => {
    it('should prune old turns when exceeding max turns', async () => {
      const conversationId = await service.createConversation('user-123');

      // Add 25 turns (exceeds max of 20)
      for (let i = 1; i <= 25; i++) {
        await service.addTurn(conversationId, {
          userQuery: `Question ${i}`,
          assistantResponse: `Answer ${i}`,
          tokensUsed: 10,
        });
      }

      const conversation = await service.getConversation(conversationId);

      // Should be pruned to max turns
      expect(conversation?.turns.length).toBeLessThanOrEqual(20);

      // Should keep most recent turns
      const lastTurn = conversation?.turns[conversation.turns.length - 1];
      expect(lastTurn?.userQuery).toContain('Question 25');
    });

    it('should prune by token count', async () => {
      const conversationId = await service.createConversation('user-123');

      // Add turns that exceed token limit (8000)
      for (let i = 1; i <= 200; i++) {
        await service.addTurn(conversationId, {
          userQuery: `Question ${i}`,
          assistantResponse: `Answer ${i}`,
          tokensUsed: 100,
        });
      }

      const conversation = await service.getConversation(conversationId);

      // Total tokens should be within reasonable bounds
      expect(conversation?.totalTokens).toBeLessThanOrEqual(8000);
    });
  });

  describe('getHealth', () => {
    it('should return health status', () => {
      const health = service.getHealth();

      expect(health).toHaveProperty('enabled');
      expect(health).toHaveProperty('redisConnected');
      expect(health).toHaveProperty('storageType');
      expect(health.storageType).toBe('memory'); // Since no Redis configured in tests
    });
  });
});
