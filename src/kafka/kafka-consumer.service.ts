import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  Kafka,
  Consumer,
  EachMessagePayload,
  ConsumerSubscribeTopics,
} from 'kafkajs';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private kafka: Kafka;
  private consumer: Consumer;
  private messageHandlers: Map<
    string,
    (payload: EachMessagePayload) => Promise<void>
  > = new Map();

  constructor() {
    this.kafka = new Kafka({
      clientId: 'notification-service',
      brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });

    this.consumer = this.kafka.consumer({
      groupId: process.env.KAFKA_CONSUMER_GROUP || 'notification-workers',
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });
  }

  async onModuleInit() {
    await this.consumer.connect();
    this.logger.log('Kafka Consumer connected');

    // Subscribe to topics
    await this.subscribe({ topics: ['notifications'] });

    // Start consuming messages
    await this.consume();
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
    this.logger.log('Kafka Consumer disconnected');
  }

  /**
   * Subscribe to Kafka topics
   */
  async subscribe(subscription: ConsumerSubscribeTopics): Promise<void> {
    await this.consumer.subscribe(subscription);
    this.logger.log(`Subscribed to topics: ${subscription.topics.join(', ')}`);
  }

  /**
   * Register a message handler for a specific topic
   */
  registerMessageHandler(
    topic: string,
    handler: (payload: EachMessagePayload) => Promise<void>,
  ): void {
    this.messageHandlers.set(topic, handler);
    this.logger.log(`Registered message handler for topic: ${topic}`);
  }

  /**
   * Start consuming messages
   */
  private async consume(): Promise<void> {
    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        const { topic, partition, message } = payload;

        try {
          this.logger.log(
            `Received message: topic=${topic}, partition=${partition}, offset=${message.offset}`,
          );

          // Get registered handler for this topic
          const handler = this.messageHandlers.get(topic);

          if (handler) {
            await handler(payload);
          } else {
            // Default handler - just log the message
            this.logger.log(
              `No handler registered for topic ${topic}, using default handler`,
            );
            await this.defaultMessageHandler(payload);
          }
        } catch (error) {
          this.logger.error(
            `Error processing message from topic ${topic}:`,
            error,
          );
          // TODO: Send to Dead Letter Queue (DLQ)
          // For now, we'll just log the error and continue
          // In production, you'd want to send failed messages to a DLQ
        }
      },
    });

    this.logger.log('Kafka Consumer started consuming messages');
  }

  /**
   * Default message handler (logs message details)
   */
  private async defaultMessageHandler(
    payload: EachMessagePayload,
  ): Promise<void> {
    const { topic, partition, message } = payload;

    const value = message.value?.toString();
    const key = message.key?.toString();
    const headers = message.headers;

    this.logger.log(
      `Message: topic=${topic}, partition=${partition}, offset=${message.offset}, key=${key}`,
    );
    this.logger.debug(`Value: ${value}`);
    this.logger.debug(`Headers: ${JSON.stringify(headers)}`);
  }

  /**
   * Pause consumption (useful for graceful shutdown or backpressure)
   */
  async pause(topics: string[]): Promise<void> {
    this.consumer.pause(topics.map((topic) => ({ topic })));
    this.logger.log(`Paused consumption for topics: ${topics.join(', ')}`);
  }

  /**
   * Resume consumption
   */
  async resume(topics: string[]): Promise<void> {
    this.consumer.resume(topics.map((topic) => ({ topic })));
    this.logger.log(`Resumed consumption for topics: ${topics.join(', ')}`);
  }

  /**
   * Seek to a specific offset (useful for reprocessing)
   */
  async seek(topic: string, partition: number, offset: string): Promise<void> {
    this.consumer.seek({ topic, partition, offset });
    this.logger.log(
      `Seeked to offset ${offset} for topic ${topic}, partition ${partition}`,
    );
  }

  /**
   * Commit offsets manually (auto-commit is enabled by default)
   */
  async commitOffsets(
    topicPartitions: { topic: string; partition: number; offset: string }[],
  ): Promise<void> {
    await this.consumer.commitOffsets(topicPartitions);
    this.logger.log('Offsets committed manually');
  }
}
