import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Demo Seed Script
 *
 * Creates realistic demo data for presentation:
 * - 5 demo users with different roles
 * - 100+ notifications across all channels
 * - Mix of statuses (SENT, FAILED, PENDING, SCHEDULED)
 * - Realistic timestamps for dashboard visualization
 */

async function main() {
  console.log('🚀 Starting demo data seed...');

  // Clean existing demo data
  console.log('🧹 Cleaning existing demo data...');
  await prisma.notification.deleteMany({
    where: {
      user: {
        email: {
          contains: 'demo',
        },
      },
    },
  });
  await prisma.user.deleteMany({
    where: {
      email: {
        contains: 'demo',
      },
    },
  });

  // Create demo users
  console.log('👥 Creating demo users...');
  const hashedPassword = await bcrypt.hash('Demo123!@#', 10);

  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: 'demo.admin@example.com',
        name: 'Demo Admin',
        password: hashedPassword,
        role: 'ADMIN',
      },
    }),
    prisma.user.create({
      data: {
        email: 'demo.user1@example.com',
        name: 'Alice Johnson',
        password: hashedPassword,
        role: 'USER',
      },
    }),
    prisma.user.create({
      data: {
        email: 'demo.user2@example.com',
        name: 'Bob Smith',
        password: hashedPassword,
        role: 'USER',
      },
    }),
    prisma.user.create({
      data: {
        email: 'demo.user3@example.com',
        name: 'Carol Williams',
        password: hashedPassword,
        role: 'USER',
      },
    }),
    prisma.user.create({
      data: {
        email: 'demo.user4@example.com',
        name: 'David Brown',
        password: hashedPassword,
        role: 'USER',
      },
    }),
  ]);

  console.log(`✅ Created ${users.length} demo users`);

  // Create notifications with realistic distribution
  console.log('📬 Creating demo notifications...');

  const now = new Date();
  const notificationTemplates = [
    // Email notifications
    {
      channel: 'EMAIL',
      type: 'TRANSACTIONAL',
      priority: 'HIGH',
      subject: 'Welcome to Our Platform!',
      payload: {
        to: 'user@example.com',
        subject: 'Welcome to Our Platform!',
        body: 'Thank you for signing up. Get started with our comprehensive guide.',
        template: 'welcome',
      },
    },
    {
      channel: 'EMAIL',
      type: 'TRANSACTIONAL',
      priority: 'URGENT',
      subject: 'Password Reset Request',
      payload: {
        to: 'user@example.com',
        subject: 'Reset Your Password',
        body: 'Click the link below to reset your password. Link expires in 1 hour.',
        template: 'password-reset',
      },
    },
    {
      channel: 'EMAIL',
      type: 'MARKETING',
      priority: 'MEDIUM',
      subject: 'New Feature Alert: Real-time Notifications',
      payload: {
        to: 'user@example.com',
        subject: 'New Feature Alert',
        body: 'Check out our new real-time notification system with 50K req/s capacity!',
        template: 'feature-announcement',
      },
    },
    {
      channel: 'EMAIL',
      type: 'SYSTEM',
      priority: 'LOW',
      subject: 'Weekly Digest',
      payload: {
        to: 'user@example.com',
        subject: 'Your Weekly Activity Summary',
        body: "Here's what happened this week on your account...",
        template: 'weekly-digest',
      },
    },
    // SMS notifications
    {
      channel: 'SMS',
      type: 'ALERT',
      priority: 'URGENT',
      subject: null,
      payload: {
        to: '+1234567890',
        body: "Security Alert: New login detected from Chrome on Windows. If this wasn't you, secure your account immediately.",
      },
    },
    {
      channel: 'SMS',
      type: 'TRANSACTIONAL',
      priority: 'HIGH',
      subject: null,
      payload: {
        to: '+1234567890',
        body: 'Your verification code is: 123456. Valid for 10 minutes.',
      },
    },
    {
      channel: 'SMS',
      type: 'MARKETING',
      priority: 'LOW',
      subject: null,
      payload: {
        to: '+1234567890',
        body: 'Flash Sale! 50% off premium features. Use code: DEMO50. Expires tonight!',
      },
    },
    // Push notifications
    {
      channel: 'PUSH',
      type: 'ALERT',
      priority: 'HIGH',
      subject: null,
      payload: {
        title: 'Payment Processed Successfully',
        body: 'Your payment of $49.99 has been processed.',
        data: {
          transactionId: 'txn_123456',
          amount: 49.99,
        },
      },
    },
    {
      channel: 'PUSH',
      type: 'SYSTEM',
      priority: 'MEDIUM',
      subject: null,
      payload: {
        title: 'App Update Available',
        body: 'Version 2.0 is now available with exciting new features!',
        data: {
          version: '2.0.0',
          updateUrl: 'https://app.example.com/update',
        },
      },
    },
    {
      channel: 'PUSH',
      type: 'MARKETING',
      priority: 'LOW',
      subject: null,
      payload: {
        title: 'New Content Just for You',
        body: "We think you'll love these personalized recommendations.",
        data: {
          contentIds: ['c1', 'c2', 'c3'],
        },
      },
    },
  ];

  const statuses = [
    'SENT',
    'SENT',
    'SENT',
    'SENT',
    'SENT',
    'FAILED',
    'PENDING',
    'SCHEDULED',
  ]; // 62.5% success rate
  const notifications = [];

  // Create 120 notifications (last 7 days)
  for (let i = 0; i < 120; i++) {
    const user = users[Math.floor(Math.random() * users.length)];
    const template =
      notificationTemplates[
        Math.floor(Math.random() * notificationTemplates.length)
      ];
    const status = statuses[Math.floor(Math.random() * statuses.length)];

    // Random timestamp within last 7 days
    const daysAgo = Math.floor(Math.random() * 7);
    const hoursAgo = Math.floor(Math.random() * 24);
    const createdAt = new Date(
      now.getTime() - daysAgo * 24 * 60 * 60 * 1000 - hoursAgo * 60 * 60 * 1000,
    );

    const notification: any = {
      userId: user.id,
      channel: template.channel,
      type: template.type,
      priority: template.priority,
      subject: template.subject,
      payload: {
        ...template.payload,
        to: user.email,
      },
      status,
      metadata: {
        source: 'demo-seed',
        userAgent: 'Demo Script v1.0',
        ipAddress: '192.168.1.' + Math.floor(Math.random() * 255),
      },
      idempotencyKey: `demo-${i}-${Date.now()}`,
      correlationId: `corr-demo-${i}`,
      createdAt,
      updatedAt: createdAt,
      retryCount: status === 'FAILED' ? Math.floor(Math.random() * 3) : 0,
      maxRetries: 3,
    };

    // Add timestamps based on status
    if (status === 'SENT') {
      notification.sentAt = new Date(createdAt.getTime() + 5000); // 5 seconds after creation
      notification.deliveredAt = new Date(createdAt.getTime() + 30000); // 30 seconds after creation
    } else if (status === 'FAILED') {
      notification.failedAt = new Date(createdAt.getTime() + 10000);
      notification.errorMessage = [
        'SendGrid API error: Invalid API key',
        'Twilio error: Phone number not verified',
        'FCM error: Invalid device token',
        'Network timeout after 30 seconds',
        'Rate limit exceeded',
      ][Math.floor(Math.random() * 5)];
    } else if (status === 'SCHEDULED') {
      // Schedule for future (1-48 hours from now)
      const hoursFromNow = Math.floor(Math.random() * 48) + 1;
      notification.scheduledFor = new Date(
        now.getTime() + hoursFromNow * 60 * 60 * 1000,
      );
    }

    notifications.push(notification);
  }

  // Batch create notifications
  await prisma.notification.createMany({
    data: notifications,
  });

  console.log(`✅ Created ${notifications.length} demo notifications`);

  // Create some events for audit trail
  console.log('📋 Creating demo events...');
  const events = [];

  for (let i = 0; i < 50; i++) {
    const user = users[Math.floor(Math.random() * users.length)];
    const eventTypes = [
      'user.signup',
      'user.login',
      'order.completed',
      'payment.processed',
      'subscription.renewed',
      'password.reset',
    ];
    const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];

    const daysAgo = Math.floor(Math.random() * 7);
    const createdAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

    events.push({
      userId: user.id,
      type: eventType,
      status: 'completed',
      payload: {
        timestamp: createdAt.toISOString(),
        metadata: {
          source: 'demo-seed',
        },
      },
      processedAt: new Date(createdAt.getTime() + 1000),
      createdAt,
      updatedAt: createdAt,
    });
  }

  await prisma.event.createMany({
    data: events,
  });

  console.log(`✅ Created ${events.length} demo events`);

  // Print summary
  console.log('\n📊 Demo Data Summary:');
  console.log('='.repeat(50));
  console.log(`👥 Users: ${users.length}`);
  console.log(`📬 Notifications: ${notifications.length}`);
  console.log(`📋 Events: ${events.length}`);
  console.log('='.repeat(50));
  console.log('\n🎯 Demo Accounts:');
  console.log('Admin: demo.admin@example.com / Demo123!@#');
  console.log('User:  demo.user1@example.com / Demo123!@#');
  console.log('User:  demo.user2@example.com / Demo123!@#');
  console.log('User:  demo.user3@example.com / Demo123!@#');
  console.log('User:  demo.user4@example.com / Demo123!@#');
  console.log('\n✅ Demo data seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding demo data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
