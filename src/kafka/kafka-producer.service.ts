import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Kafka, Producer, ProducerRecord, RecordMetadata } from 'kafkajs';
import { NotificationMessage } from './schemas/notification.schema';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private kafka: Kafka;
  private producer: Producer;

  constructor() {
    this.kafka = new Kafka({
      clientId: 'notification-service',
      brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
    });
  }

  async onModuleInit() {
    await this.producer.connect();
    this.logger.log('Kafka Producer connected');
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
    this.logger.log('Kafka Producer disconnected');
  }

  /**
   * Send a single notification message to Kafka
   */
  async sendNotification(
    message: NotificationMessage,
  ): Promise<RecordMetadata[]> {
    try {
      const record: ProducerRecord = {
        topic: 'notifications',
        messages: [
          {
            key: message.userId, // Partition by userId for ordering
            value: JSON.stringify(message),
            headers: {
              'idempotency-key': message.idempotencyKey,
              'message-type': message.type,
              priority: message.priority,
            },
          },
        ],
      };

      const metadata = await this.producer.send(record);
      this.logger.log(
        `Message sent to Kafka: topic=${metadata[0].topicName}, partition=${metadata[0].partition}, offset=${metadata[0].baseOffset}`,
      );
      return metadata;
    } catch (error) {
      this.logger.error('Failed to send message to Kafka:', error);
      throw error;
    }
  }

  /**
   * Send multiple notifications in batch (more efficient)
   */
  async sendNotificationBatch(
    messages: NotificationMessage[],
  ): Promise<RecordMetadata[]> {
    try {
      const record: ProducerRecord = {
        topic: 'notifications',
        messages: messages.map((msg) => ({
          key: msg.userId,
          value: JSON.stringify(msg),
          headers: {
            'idempotency-key': msg.idempotencyKey,
            'message-type': msg.type,
            priority: msg.priority,
          },
        })),
      };

      const metadata = await this.producer.send(record);
      this.logger.log(`Batch of ${messages.length} messages sent to Kafka`);
      return metadata;
    } catch (error) {
      this.logger.error('Failed to send batch to Kafka:', error);
      throw error;
    }
  }

  /**
   * Send a message to a custom topic (for flexibility)
   */
  async sendToTopic(
    topic: string,
    key: string,
    value: unknown,
    headers?: Record<string, string>,
  ): Promise<RecordMetadata[]> {
    try {
      const record: ProducerRecord = {
        topic,
        messages: [
          {
            key,
            value: JSON.stringify(value),
            headers,
          },
        ],
      };

      const metadata = await this.producer.send(record);
      this.logger.log(`Message sent to topic ${topic}`);
      return metadata;
    } catch (error) {
      this.logger.error(`Failed to send message to topic ${topic}:`, error);
      throw error;
    }
  }

  /**
   * Send messages with transaction support (exactly-once semantics)
   */
  async sendInTransaction(
    messages: ProducerRecord[],
  ): Promise<RecordMetadata[][]> {
    const transaction = await this.producer.transaction();

    try {
      const results: RecordMetadata[][] = [];

      for (const record of messages) {
        const metadata = await transaction.send(record);
        results.push(metadata);
      }

      await transaction.commit();
      this.logger.log('Transaction committed successfully');
      return results;
    } catch (error) {
      await transaction.abort();
      this.logger.error('Transaction aborted:', error);
      throw error;
    }
  }
}
