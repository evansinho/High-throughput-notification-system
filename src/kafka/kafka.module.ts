import { Module, Global } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer.service';
import { KafkaAdminService } from './kafka-admin.service';

@Global()
@Module({
  providers: [KafkaProducerService, KafkaConsumerService, KafkaAdminService],
  exports: [KafkaProducerService, KafkaConsumerService, KafkaAdminService],
})
export class KafkaModule {}
