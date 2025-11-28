import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  // Create test users
  const hashedPassword = await bcrypt.hash('password123', 10);

  const user1 = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: {
      email: 'alice@example.com',
      name: 'Alice Johnson',
      password: hashedPassword,
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: {
      email: 'bob@example.com',
      name: 'Bob Smith',
      password: hashedPassword,
    },
  });

  console.log('Created users:', { user1, user2 });

  // Create test events
  const event1 = await prisma.event.create({
    data: {
      type: 'user.signup',
      userId: user1.id,
      payload: {
        source: 'web',
        referrer: 'google',
      },
      status: 'completed',
      processedAt: new Date(),
    },
  });

  const event2 = await prisma.event.create({
    data: {
      type: 'order.completed',
      userId: user2.id,
      payload: {
        orderId: 'order_123',
        amount: 99.99,
        items: 3,
      },
      status: 'pending',
    },
  });

  console.log('Created events:', { event1, event2 });

  // Create test notifications
  const notification1 = await prisma.notification.create({
    data: {
      userId: user1.id,
      eventId: event1.id,
      channel: 'email',
      type: 'welcome_email',
      subject: 'Welcome to our platform!',
      content: 'Thank you for signing up, Alice!',
      status: 'sent',
      priority: 'normal',
      sentAt: new Date(),
    },
  });

  const notification2 = await prisma.notification.create({
    data: {
      userId: user2.id,
      eventId: event2.id,
      channel: 'email',
      type: 'order_confirmation',
      subject: 'Your order has been confirmed',
      content: 'Your order #order_123 for $99.99 has been confirmed.',
      status: 'pending',
      priority: 'high',
    },
  });

  const notification3 = await prisma.notification.create({
    data: {
      userId: user2.id,
      channel: 'sms',
      type: 'shipping_update',
      content: 'Your package will arrive tomorrow!',
      status: 'delivered',
      priority: 'normal',
      sentAt: new Date(Date.now() - 3600000), // 1 hour ago
      deliveredAt: new Date(Date.now() - 3000000), // 50 minutes ago
    },
  });

  console.log('Created notifications:', {
    notification1,
    notification2,
    notification3,
  });

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
