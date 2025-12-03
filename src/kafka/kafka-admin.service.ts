import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Admin } from 'kafkajs';

/**
 * KafkaAdminService - Kafka cluster administration
 *
 * Features:
 * - List topics
 * - Fetch topic offsets
 * - List consumer groups
 * - Get consumer group lag
 */
@Injectable()
export class KafkaAdminService implements OnModuleInit {
  private readonly logger = new Logger(KafkaAdminService.name);
  private admin: Admin;
  private kafka: Kafka;

  constructor(private readonly configService: ConfigService) {
    const brokers = this.configService.get<string>(
      'KAFKA_BROKER',
      'localhost:9092',
    );
    const clientId = this.configService.get<string>(
      'KAFKA_CLIENT_ID',
      'notification-admin',
    );

    this.kafka = new Kafka({
      clientId,
      brokers: brokers.split(','),
    });

    this.admin = this.kafka.admin();
  }

  async onModuleInit() {
    try {
      await this.admin.connect();
      this.logger.log('Kafka admin connected');
    } catch (error) {
      this.logger.error('Failed to connect Kafka admin:', error);
    }
  }

  /**
   * List all topics
   */
  async listTopics(): Promise<string[]> {
    try {
      return await this.admin.listTopics();
    } catch (error) {
      this.logger.error('Failed to list topics:', error);
      return [];
    }
  }

  /**
   * Fetch topic offsets
   */
  async fetchTopicOffsets(topic: string): Promise<
    Array<{
      partition: number;
      offset: string;
      high: string;
      low: string;
    }>
  > {
    try {
      const offsets = await this.admin.fetchTopicOffsets(topic);
      return offsets.map((offset) => ({
        partition: offset.partition,
        offset: offset.offset,
        high: offset.high,
        low: offset.low,
      }));
    } catch (error) {
      this.logger.error(`Failed to fetch offsets for topic ${topic}:`, error);
      return [];
    }
  }

  /**
   * List consumer groups
   */
  async listGroups(): Promise<{
    groups: Array<{
      groupId: string;
      protocolType: string;
    }>;
  }> {
    try {
      const groups = await this.admin.listGroups();
      return groups;
    } catch (error) {
      this.logger.error('Failed to list consumer groups:', error);
      return { groups: [] };
    }
  }

  /**
   * Describe consumer group
   */
  async describeGroups(groupIds: string[]): Promise<any> {
    try {
      return await this.admin.describeGroups(groupIds);
    } catch (error) {
      this.logger.error('Failed to describe groups:', error);
      return { groups: [] };
    }
  }

  /**
   * Fetch consumer group offsets
   */
  async fetchOffsets(groupId: string): Promise<any> {
    try {
      return await this.admin.fetchOffsets({ groupId });
    } catch (error) {
      this.logger.error(`Failed to fetch offsets for group ${groupId}:`, error);
      return [];
    }
  }

  /**
   * Disconnect admin client
   */
  async onModuleDestroy() {
    try {
      await this.admin.disconnect();
      this.logger.log('Kafka admin disconnected');
    } catch (error) {
      this.logger.error('Failed to disconnect Kafka admin:', error);
    }
  }
}
