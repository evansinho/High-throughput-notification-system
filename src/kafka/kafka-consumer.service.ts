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
          // DLQ handling is implemented in RetryService (see src/notification/retry.service.ts)
          // Failed messages are automatically routed to DLQ after max retries
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

  /**
   * Get consumer lag metrics for monitoring
   * Returns the lag (difference between latest offset and committed offset) per partition
   */
  async getConsumerLag(): Promise<{
    totalLag: number;
    partitionLag: Array<{
      topic: string;
      partition: number;
      lag: number;
      currentOffset: string;
      highWatermark: string;
    }>;
  }> {
    try {
      const admin = this.kafka.admin();
      await admin.connect();

      const groupId =
        process.env.KAFKA_CONSUMER_GROUP || 'notification-workers';
      const topics = ['notifications']; // Hardcoded for now, can be made dynamic
      const partitionLag: Array<{
        topic: string;
        partition: number;
        lag: number;
        currentOffset: string;
        highWatermark: string;
      }> = [];
      let totalLag = 0;

      for (const topic of topics) {
        try {
          // Get consumer group offsets (committed offsets)
          const offsets = await admin.fetchOffsets({
            groupId,
            topics: [topic],
          });

          // Get topic high watermarks (latest offsets)
          const topicOffsets = await admin.fetchTopicOffsets(topic);

          // Calculate lag for each partition
          for (const offset of offsets) {
            for (const partitionOffset of offset.partitions) {
              const partition = partitionOffset.partition;
              const committed = partitionOffset.offset;

              // Find high watermark for this partition
              const partitionMeta = topicOffsets.find(
                (p) => p.partition === partition,
              );

              if (partitionMeta && committed !== null && committed !== '-1') {
                const currentOffset = BigInt(committed);
                const highWatermark = BigInt(partitionMeta.high);
                const lag = Number(highWatermark - currentOffset);

                partitionLag.push({
                  topic,
                  partition,
                  lag: lag > 0 ? lag : 0,
                  currentOffset: currentOffset.toString(),
                  highWatermark: highWatermark.toString(),
                });

                totalLag += lag > 0 ? lag : 0;
              }
            }
          }
        } catch (topicError) {
          this.logger.warn(`Failed to get lag for topic ${topic}:`, topicError);
        }
      }

      await admin.disconnect();

      return { totalLag, partitionLag };
    } catch (error) {
      this.logger.error('Failed to fetch consumer lag:', error);
      return { totalLag: -1, partitionLag: [] };
    }
  }

  /**
   * Get consumer for direct access (use with caution)
   */
  getConsumer(): Consumer {
    return this.consumer;
  }
}
