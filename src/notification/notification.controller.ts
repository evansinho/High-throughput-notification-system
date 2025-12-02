import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { CreateNotificationDto, NotificationResponseDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Create a new notification
   * POST /notifications
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createNotificationDto: CreateNotificationDto,
  ): Promise<NotificationResponseDto> {
    return await this.notificationService.create(createNotificationDto);
  }

  /**
   * Get notification by ID
   * GET /notifications/:id
   */
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<NotificationResponseDto> {
    const notification = await this.notificationService.findOne(id);

    if (!notification) {
      throw new NotFoundException(`Notification with ID ${id} not found`);
    }

    return notification;
  }
}
