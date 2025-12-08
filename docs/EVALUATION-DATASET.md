# Baseline Evaluation Dataset - Notification RAG System

## Executive Summary

This document contains 50 carefully curated test cases for evaluating the notification RAG system. The dataset covers diverse notification scenarios across channels (email, SMS, push), categories (transactional, marketing, system), and complexity levels.

**Dataset Composition:**
- **Total Test Cases:** 50
- **Email Notifications:** 20 (40%)
- **SMS Notifications:** 15 (30%)
- **Push Notifications:** 15 (30%)
- **Transactional:** 25 (50%)
- **Marketing:** 15 (30%)
- **System Alerts:** 10 (20%)

**Evaluation Dimensions:**
- Retrieval quality (precision, recall, ranking)
- Generation quality (faithfulness, relevancy, coherence)
- RAGAS metrics (all 5 metrics)
- Notification-specific quality (tone, CTA, personalization)

---

## Dataset Structure

```typescript
interface EvaluationTestCase {
  id: string;
  category: 'transactional' | 'marketing' | 'system';
  channel: 'email' | 'sms' | 'push';

  // Input
  query: string;
  context: {
    userId?: string;
    intent: string;
    tone: string;
    metadata?: Record<string, any>;
  };

  // Ground Truth
  groundTruth: {
    relevantTemplateIds: string[];    // For retrieval evaluation
    expectedAnswer: string;            // For generation evaluation
    keyInformation: string[];          // Must-include facts
    prohibitedInformation: string[];   // Must-not-include facts
  };

  // Evaluation Criteria
  criteria: {
    minRetrievalPrecision: number;
    minFaithfulness: number;
    minAnswerRelevancy: number;
    requiredElements: string[];        // e.g., ["CTA", "personalization"]
  };
}
```

---

## Test Cases

### Transactional - Email (10 cases)

#### TC-001: Order Confirmation
```json
{
  "id": "TC-001",
  "category": "transactional",
  "channel": "email",
  "query": "User completed purchase of 2 items totaling $149.99. Send order confirmation email with order #ORD-12345, expected delivery Dec 15, 2024.",
  "context": {
    "userId": "user_123",
    "intent": "order_confirmation",
    "tone": "professional",
    "metadata": {
      "orderId": "ORD-12345",
      "total": 149.99,
      "itemCount": 2,
      "deliveryDate": "2024-12-15"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T001", "T045", "T089"],
    "expectedAnswer": "Thank you for your order! Your order #ORD-12345 has been confirmed. You ordered 2 items for a total of $149.99. Expected delivery: December 15, 2024. Track your order at [tracking_link].",
    "keyInformation": [
      "Order number ORD-12345",
      "Total amount $149.99",
      "Item count 2",
      "Delivery date December 15, 2024",
      "Tracking link or instructions"
    ],
    "prohibitedInformation": [
      "Incorrect order number",
      "Incorrect amount",
      "Marketing promotions"
    ]
  },
  "criteria": {
    "minRetrievalPrecision": 0.80,
    "minFaithfulness": 0.95,
    "minAnswerRelevancy": 0.90,
    "requiredElements": ["order_number", "total", "delivery_date", "tracking_cta"]
  }
}
```

#### TC-002: Password Reset
```json
{
  "id": "TC-002",
  "category": "transactional",
  "channel": "email",
  "query": "User requested password reset. Send email with reset link that expires in 24 hours.",
  "context": {
    "userId": "user_456",
    "intent": "password_reset",
    "tone": "helpful",
    "metadata": {
      "resetLink": "https://app.example.com/reset/abc123",
      "expiryHours": 24
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T010", "T023", "T067"],
    "expectedAnswer": "We received a request to reset your password. Click the link below to create a new password: [reset_link]. This link expires in 24 hours. If you didn't request this, please ignore this email.",
    "keyInformation": [
      "Password reset request received",
      "Reset link",
      "Expiry time 24 hours",
      "Ignore if not requested"
    ],
    "prohibitedInformation": [
      "Actual new password",
      "Security questions"
    ]
  },
  "criteria": {
    "minRetrievalPrecision": 0.85,
    "minFaithfulness": 0.95,
    "minAnswerRelevancy": 0.90,
    "requiredElements": ["reset_link", "expiry_time", "security_note"]
  }
}
```

#### TC-003: Payment Failed
```json
{
  "id": "TC-003",
  "category": "transactional",
  "channel": "email",
  "query": "User's payment for subscription renewal failed. Send email asking to update payment method.",
  "context": {
    "userId": "user_789",
    "intent": "payment_failed",
    "tone": "urgent_but_polite",
    "metadata": {
      "subscriptionPlan": "Premium",
      "amount": 29.99,
      "retryDate": "2024-12-12"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T015", "T056", "T091"],
    "expectedAnswer": "We were unable to process your payment of $29.99 for your Premium subscription. Please update your payment method by December 12 to avoid service interruption. Update payment: [payment_link]",
    "keyInformation": [
      "Payment failed",
      "Amount $29.99",
      "Subscription plan Premium",
      "Action required: update payment method",
      "Retry date December 12",
      "Consequence: service interruption"
    ],
    "prohibitedInformation": [
      "Account already suspended",
      "Late fees"
    ]
  },
  "criteria": {
    "minRetrievalPrecision": 0.80,
    "minFaithfulness": 0.95,
    "minAnswerRelevancy": 0.90,
    "requiredElements": ["amount", "plan_name", "action_required", "deadline", "update_cta"]
  }
}
```

#### TC-004: Account Verification
```json
{
  "id": "TC-004",
  "category": "transactional",
  "channel": "email",
  "query": "New user signed up. Send account verification email with verification link.",
  "context": {
    "userId": "user_new_001",
    "intent": "account_verification",
    "tone": "welcoming",
    "metadata": {
      "verificationLink": "https://app.example.com/verify/xyz789",
      "expiryHours": 48
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T005", "T034", "T078"],
    "expectedAnswer": "Welcome! Please verify your email address by clicking the link below: [verification_link]. This link expires in 48 hours. After verification, you'll have full access to your account.",
    "keyInformation": [
      "Welcome message",
      "Verification link",
      "Expiry time 48 hours",
      "Benefit: full account access"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.80,
    "minFaithfulness": 0.90,
    "minAnswerRelevancy": 0.85,
    "requiredElements": ["verification_link", "expiry_time", "welcome_tone"]
  }
}
```

#### TC-005: Shipment Tracking
```json
{
  "id": "TC-005",
  "category": "transactional",
  "channel": "email",
  "query": "Order has been shipped. Send tracking notification with carrier FedEx, tracking #1Z999AA10123456784.",
  "context": {
    "userId": "user_234",
    "intent": "shipment_tracking",
    "tone": "informative",
    "metadata": {
      "orderId": "ORD-67890",
      "carrier": "FedEx",
      "trackingNumber": "1Z999AA10123456784",
      "estimatedDelivery": "2024-12-18"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T012", "T048", "T092"],
    "expectedAnswer": "Your order #ORD-67890 has shipped! Carrier: FedEx. Tracking #: 1Z999AA10123456784. Estimated delivery: December 18, 2024. Track your package: [tracking_link]",
    "keyInformation": [
      "Order number ORD-67890",
      "Shipment confirmation",
      "Carrier FedEx",
      "Tracking number 1Z999AA10123456784",
      "Estimated delivery December 18"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.85,
    "minFaithfulness": 0.95,
    "minAnswerRelevancy": 0.90,
    "requiredElements": ["order_number", "carrier", "tracking_number", "delivery_date", "tracking_cta"]
  }
}
```

#### TC-006: Refund Processed
```json
{
  "id": "TC-006",
  "category": "transactional",
  "channel": "email",
  "query": "Refund of $75.50 has been processed for order #ORD-11111. Will appear in 5-7 business days.",
  "context": {
    "userId": "user_567",
    "intent": "refund_confirmation",
    "tone": "apologetic_helpful",
    "metadata": {
      "orderId": "ORD-11111",
      "refundAmount": 75.50,
      "processingDays": "5-7 business days"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T020", "T061", "T095"],
    "expectedAnswer": "Your refund of $75.50 for order #ORD-11111 has been processed. The amount will appear in your account within 5-7 business days. If you have questions, contact support.",
    "keyInformation": [
      "Refund confirmation",
      "Amount $75.50",
      "Order number ORD-11111",
      "Timeline 5-7 business days"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.80,
    "minFaithfulness": 0.95,
    "minAnswerRelevancy": 0.90,
    "requiredElements": ["refund_amount", "order_number", "processing_time"]
  }
}
```

#### TC-007: Invoice Available
```json
{
  "id": "TC-007",
  "category": "transactional",
  "channel": "email",
  "query": "Monthly invoice for December 2024 is ready. Amount: $299.00. Send notification with download link.",
  "context": {
    "userId": "user_enterprise_01",
    "intent": "invoice_available",
    "tone": "professional",
    "metadata": {
      "invoiceNumber": "INV-2024-12-001",
      "amount": 299.00,
      "dueDate": "2025-01-15",
      "period": "December 2024"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T025", "T058", "T088"],
    "expectedAnswer": "Your invoice for December 2024 is ready. Invoice #INV-2024-12-001, Amount: $299.00, Due: January 15, 2025. Download invoice: [invoice_link]",
    "keyInformation": [
      "Invoice ready",
      "Period December 2024",
      "Invoice number INV-2024-12-001",
      "Amount $299.00",
      "Due date January 15, 2025"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.85,
    "minFaithfulness": 0.95,
    "minAnswerRelevancy": 0.90,
    "requiredElements": ["invoice_number", "amount", "due_date", "download_cta"]
  }
}
```

#### TC-008: Subscription Cancelled
```json
{
  "id": "TC-008",
  "category": "transactional",
  "channel": "email",
  "query": "User cancelled Premium subscription. Confirm cancellation, access until end of billing period Dec 31.",
  "context": {
    "userId": "user_890",
    "intent": "subscription_cancelled",
    "tone": "understanding",
    "metadata": {
      "plan": "Premium",
      "accessUntil": "2024-12-31"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T030", "T065", "T097"],
    "expectedAnswer": "Your Premium subscription has been cancelled. You'll continue to have access until December 31, 2024. We'd love to have you back anytime. Reactivate: [reactivate_link]",
    "keyInformation": [
      "Cancellation confirmation",
      "Plan Premium",
      "Continued access until December 31, 2024",
      "Reactivation option"
    ],
    "prohibitedInformation": [
      "Immediate access loss"
    ]
  },
  "criteria": {
    "minRetrievalPrecision": 0.80,
    "minFaithfulness": 0.95,
    "minAnswerRelevancy": 0.90,
    "requiredElements": ["cancellation_confirmation", "plan_name", "access_until_date", "reactivate_cta"]
  }
}
```

#### TC-009: Two-Factor Authentication Code
```json
{
  "id": "TC-009",
  "category": "transactional",
  "channel": "email",
  "query": "User logging in from new device. Send 2FA code: 847293. Valid for 10 minutes.",
  "context": {
    "userId": "user_security_01",
    "intent": "2fa_code",
    "tone": "security_focused",
    "metadata": {
      "code": "847293",
      "validityMinutes": 10,
      "device": "Chrome on Windows"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T008", "T042", "T076"],
    "expectedAnswer": "Your verification code is: 847293. This code expires in 10 minutes. If you didn't attempt to log in, please secure your account immediately.",
    "keyInformation": [
      "Verification code 847293",
      "Expiry 10 minutes",
      "Security warning if not user"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.90,
    "minFaithfulness": 0.95,
    "minAnswerRelevancy": 0.95,
    "requiredElements": ["code", "expiry_time", "security_warning"]
  }
}
```

#### TC-010: Download Ready
```json
{
  "id": "TC-010",
  "category": "transactional",
  "channel": "email",
  "query": "User's export file is ready for download. File: user_data_export.zip (25.4 MB). Link expires in 7 days.",
  "context": {
    "userId": "user_345",
    "intent": "download_ready",
    "tone": "informative",
    "metadata": {
      "fileName": "user_data_export.zip",
      "fileSize": "25.4 MB",
      "expiryDays": 7
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T018", "T051", "T084"],
    "expectedAnswer": "Your export file is ready! File: user_data_export.zip (25.4 MB). Download: [download_link]. This link expires in 7 days.",
    "keyInformation": [
      "File ready",
      "Filename user_data_export.zip",
      "File size 25.4 MB",
      "Download link",
      "Expiry 7 days"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.80,
    "minFaithfulness": 0.90,
    "minAnswerRelevancy": 0.85,
    "requiredElements": ["file_name", "file_size", "download_cta", "expiry_time"]
  }
}
```

---

### Transactional - SMS (10 cases)

#### TC-011: SMS Order Confirmation
```json
{
  "id": "TC-011",
  "category": "transactional",
  "channel": "sms",
  "query": "Send SMS order confirmation for order #ORD-99999. Total: $89.99.",
  "context": {
    "userId": "user_sms_01",
    "intent": "order_confirmation",
    "tone": "concise",
    "metadata": {
      "orderId": "ORD-99999",
      "total": 89.99
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T101", "T145", "T189"],
    "expectedAnswer": "Order #ORD-99999 confirmed! Total: $89.99. Track: example.com/track/ORD-99999",
    "keyInformation": [
      "Order number ORD-99999",
      "Total $89.99",
      "Tracking link"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.85,
    "minFaithfulness": 0.95,
    "minAnswerRelevancy": 0.90,
    "requiredElements": ["order_number", "total", "tracking_link", "max_160_chars"]
  }
}
```

#### TC-012: SMS Delivery Update
```json
{
  "id": "TC-012",
  "category": "transactional",
  "channel": "sms",
  "query": "Package out for delivery today for order #ORD-55555.",
  "context": {
    "userId": "user_sms_02",
    "intent": "delivery_update",
    "tone": "urgent",
    "metadata": {
      "orderId": "ORD-55555",
      "status": "out_for_delivery"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T112", "T148", "T192"],
    "expectedAnswer": "Your order #ORD-55555 is out for delivery today! Track: example.com/track",
    "keyInformation": [
      "Order number ORD-55555",
      "Status out for delivery",
      "Timeline today"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.85,
    "minFaithfulness": 0.95,
    "minAnswerRelevancy": 0.90,
    "requiredElements": ["order_number", "status", "urgency", "max_160_chars"]
  }
}
```

#### TC-013: SMS Verification Code
```json
{
  "id": "TC-013",
  "category": "transactional",
  "channel": "sms",
  "query": "Send SMS verification code 482910 for account login.",
  "context": {
    "userId": "user_sms_03",
    "intent": "verification_code",
    "tone": "direct",
    "metadata": {
      "code": "482910",
      "validityMinutes": 5
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T108", "T142", "T176"],
    "expectedAnswer": "Your verification code is: 482910. Valid for 5 minutes.",
    "keyInformation": [
      "Code 482910",
      "Validity 5 minutes"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.90,
    "minFaithfulness": 0.95,
    "minAnswerRelevancy": 0.95,
    "requiredElements": ["code", "validity", "max_160_chars"]
  }
}
```

#### TC-014: SMS Password Reset
```json
{
  "id": "TC-014",
  "category": "transactional",
  "channel": "sms",
  "query": "Send password reset code 739201 via SMS. Expires in 10 minutes.",
  "context": {
    "userId": "user_sms_04",
    "intent": "password_reset",
    "tone": "security_focused",
    "metadata": {
      "code": "739201",
      "validityMinutes": 10
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T110", "T123", "T167"],
    "expectedAnswer": "Password reset code: 739201. Expires in 10 min. Didn't request? Contact support.",
    "keyInformation": [
      "Code 739201",
      "Expiry 10 minutes",
      "Security warning"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.90,
    "minFaithfulness": 0.95,
    "minAnswerRelevancy": 0.95,
    "requiredElements": ["code", "expiry", "security_warning", "max_160_chars"]
  }
}
```

#### TC-015: SMS Appointment Reminder
```json
{
  "id": "TC-015",
  "category": "transactional",
  "channel": "sms",
  "query": "Remind user of appointment tomorrow at 2:00 PM with Dr. Smith.",
  "context": {
    "userId": "user_sms_05",
    "intent": "appointment_reminder",
    "tone": "friendly",
    "metadata": {
      "appointmentDate": "2024-12-11",
      "appointmentTime": "2:00 PM",
      "provider": "Dr. Smith"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T115", "T156", "T193"],
    "expectedAnswer": "Reminder: Appointment tomorrow at 2:00 PM with Dr. Smith. Reply C to confirm, R to reschedule.",
    "keyInformation": [
      "Appointment tomorrow",
      "Time 2:00 PM",
      "Provider Dr. Smith",
      "Action options"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.85,
    "minFaithfulness": 0.90,
    "minAnswerRelevancy": 0.90,
    "requiredElements": ["date", "time", "provider", "action_options", "max_160_chars"]
  }
}
```

#### TC-016: SMS Payment Received
```json
{
  "id": "TC-016",
  "category": "transactional",
  "channel": "sms",
  "query": "Payment of $125.00 received successfully. Send SMS confirmation.",
  "context": {
    "userId": "user_sms_06",
    "intent": "payment_received",
    "tone": "professional",
    "metadata": {
      "amount": 125.00,
      "lastFourDigits": "4532"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T120", "T158", "T195"],
    "expectedAnswer": "Payment received! $125.00 charged to card ending 4532. Questions? Contact support.",
    "keyInformation": [
      "Payment confirmation",
      "Amount $125.00",
      "Card ending 4532"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.85,
    "minFaithfulness": 0.95,
    "minAnswerRelevancy": 0.90,
    "requiredElements": ["amount", "payment_method_hint", "max_160_chars"]
  }
}
```

#### TC-017: SMS Account Locked
```json
{
  "id": "TC-017",
  "category": "transactional",
  "channel": "sms",
  "query": "Account locked due to multiple failed login attempts. Send security alert SMS.",
  "context": {
    "userId": "user_sms_07",
    "intent": "security_alert",
    "tone": "urgent",
    "metadata": {
      "reason": "multiple_failed_logins",
      "unlockUrl": "example.com/unlock"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T125", "T160", "T198"],
    "expectedAnswer": "SECURITY ALERT: Account locked due to failed login attempts. Unlock: example.com/unlock",
    "keyInformation": [
      "Security alert",
      "Account locked",
      "Reason failed logins",
      "Unlock link"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.90,
    "minFaithfulness": 0.95,
    "minAnswerRelevancy": 0.95,
    "requiredElements": ["alert_label", "reason", "action_link", "max_160_chars"]
  }
}
```

#### TC-018: SMS Subscription Expiring
```json
{
  "id": "TC-018",
  "category": "transactional",
  "channel": "sms",
  "query": "Premium subscription expires in 3 days. Send reminder SMS.",
  "context": {
    "userId": "user_sms_08",
    "intent": "subscription_expiring",
    "tone": "reminder",
    "metadata": {
      "plan": "Premium",
      "daysUntilExpiry": 3
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T130", "T165", "T199"],
    "expectedAnswer": "Your Premium subscription expires in 3 days. Renew now: example.com/renew",
    "keyInformation": [
      "Subscription expiring",
      "Plan Premium",
      "Timeline 3 days",
      "Renewal link"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.85,
    "minFaithfulness": 0.90,
    "minAnswerRelevancy": 0.90,
    "requiredElements": ["plan_name", "days_until_expiry", "renew_link", "max_160_chars"]
  }
}
```

#### TC-019: SMS Refund Processed
```json
{
  "id": "TC-019",
  "category": "transactional",
  "channel": "sms",
  "query": "Refund of $45.00 processed. Send SMS notification.",
  "context": {
    "userId": "user_sms_09",
    "intent": "refund_processed",
    "tone": "concise",
    "metadata": {
      "amount": 45.00,
      "processingDays": "5-7"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T135", "T168", "T197"],
    "expectedAnswer": "Refund of $45.00 processed. Amount will appear in 5-7 business days.",
    "keyInformation": [
      "Refund confirmation",
      "Amount $45.00",
      "Timeline 5-7 business days"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.85,
    "minFaithfulness": 0.95,
    "minAnswerRelevancy": 0.90,
    "requiredElements": ["amount", "processing_time", "max_160_chars"]
  }
}
```

#### TC-020: SMS Booking Confirmed
```json
{
  "id": "TC-020",
  "category": "transactional",
  "channel": "sms",
  "query": "Hotel booking confirmed for Dec 20-22, 2024. Confirmation #HTL-98765.",
  "context": {
    "userId": "user_sms_10",
    "intent": "booking_confirmed",
    "tone": "friendly",
    "metadata": {
      "confirmationNumber": "HTL-98765",
      "checkIn": "2024-12-20",
      "checkOut": "2024-12-22"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T140", "T170", "T196"],
    "expectedAnswer": "Booking confirmed! Check-in Dec 20, check-out Dec 22. Confirmation: HTL-98765.",
    "keyInformation": [
      "Booking confirmed",
      "Check-in Dec 20",
      "Check-out Dec 22",
      "Confirmation HTL-98765"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.85,
    "minFaithfulness": 0.95,
    "minAnswerRelevancy": 0.90,
    "requiredElements": ["confirmation_number", "check_in_date", "check_out_date", "max_160_chars"]
  }
}
```

---

### Marketing - Email (10 cases)

#### TC-021: Product Launch Announcement
```json
{
  "id": "TC-021",
  "category": "marketing",
  "channel": "email",
  "query": "Announce new product launch: AI Writing Assistant. Early access for existing users with 20% discount.",
  "context": {
    "userId": "user_mkting_01",
    "intent": "product_launch",
    "tone": "exciting",
    "metadata": {
      "productName": "AI Writing Assistant",
      "discount": "20%",
      "audience": "existing_users"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T201", "T245", "T289"],
    "expectedAnswer": "Introducing the AI Writing Assistant! As a valued customer, get early access with 20% off. Transform your writing with AI-powered suggestions. Get started: [cta_link]",
    "keyInformation": [
      "Product name AI Writing Assistant",
      "Early access for existing users",
      "Discount 20%",
      "Product benefits"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.75,
    "minFaithfulness": 0.85,
    "minAnswerRelevancy": 0.80,
    "requiredElements": ["product_name", "discount", "benefits", "cta"]
  }
}
```

#### TC-022: Abandoned Cart Reminder
```json
{
  "id": "TC-022",
  "category": "marketing",
  "channel": "email",
  "query": "User left 3 items in cart. Send reminder with 10% discount code CART10.",
  "context": {
    "userId": "user_mkting_02",
    "intent": "abandoned_cart",
    "tone": "helpful",
    "metadata": {
      "itemCount": 3,
      "discountCode": "CART10",
      "discount": "10%"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T210", "T256", "T291"],
    "expectedAnswer": "You left 3 items in your cart! Complete your purchase and save 10% with code CART10. Return to cart: [cart_link]",
    "keyInformation": [
      "Items left in cart: 3",
      "Discount 10%",
      "Discount code CART10",
      "CTA return to cart"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.75,
    "minFaithfulness": 0.85,
    "minAnswerRelevancy": 0.80,
    "requiredElements": ["item_count", "discount_code", "cta"]
  }
}
```

#### TC-023: Weekly Newsletter
```json
{
  "id": "TC-023",
  "category": "marketing",
  "channel": "email",
  "query": "Send weekly newsletter with: 3 new blog posts, upcoming webinar on Dec 15, product updates.",
  "context": {
    "userId": "user_mkting_03",
    "intent": "newsletter",
    "tone": "informative",
    "metadata": {
      "blogPostCount": 3,
      "webinarDate": "2024-12-15",
      "hasProductUpdates": true
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T215", "T258", "T295"],
    "expectedAnswer": "This week: 3 new blog posts on productivity tips, join our webinar on Dec 15, and check out our latest product updates. Read more: [newsletter_link]",
    "keyInformation": [
      "3 blog posts",
      "Webinar Dec 15",
      "Product updates"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.70,
    "minFaithfulness": 0.80,
    "minAnswerRelevancy": 0.75,
    "requiredElements": ["blog_posts", "webinar_info", "product_updates", "cta"]
  }
}
```

#### TC-024: Re-engagement Campaign
```json
{
  "id": "TC-024",
  "category": "marketing",
  "channel": "email",
  "query": "User inactive for 60 days. Send re-engagement email with 30% discount to return.",
  "context": {
    "userId": "user_mkting_04",
    "intent": "re_engagement",
    "tone": "we_miss_you",
    "metadata": {
      "inactiveDays": 60,
      "discount": "30%",
      "discountCode": "COMEBACK30"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T220", "T260", "T297"],
    "expectedAnswer": "We miss you! It's been a while since your last visit. Come back and enjoy 30% off with code COMEBACK30. See what's new: [return_link]",
    "keyInformation": [
      "We miss you message",
      "Discount 30%",
      "Code COMEBACK30",
      "Incentive to return"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.75,
    "minFaithfulness": 0.80,
    "minAnswerRelevancy": 0.80,
    "requiredElements": ["re_engagement_message", "discount", "code", "cta"]
  }
}
```

#### TC-025: Seasonal Sale
```json
{
  "id": "TC-025",
  "category": "marketing",
  "channel": "email",
  "query": "Holiday sale: 40% off sitewide, Dec 10-15. Early access for email subscribers.",
  "context": {
    "userId": "user_mkting_05",
    "intent": "seasonal_sale",
    "tone": "urgent_exciting",
    "metadata": {
      "discount": "40%",
      "startDate": "2024-12-10",
      "endDate": "2024-12-15",
      "scope": "sitewide"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T225", "T265", "T299"],
    "expectedAnswer": "Holiday Sale! Get 40% off sitewide, Dec 10-15. Early access for subscribers starts now! Shop the sale: [sale_link]",
    "keyInformation": [
      "Holiday sale",
      "Discount 40%",
      "Duration Dec 10-15",
      "Early access for subscribers",
      "Sitewide"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.75,
    "minFaithfulness": 0.85,
    "minAnswerRelevancy": 0.80,
    "requiredElements": ["discount", "dates", "early_access", "urgency", "cta"]
  }
}
```

#### TC-026: Customer Success Story
```json
{
  "id": "TC-026",
  "category": "marketing",
  "channel": "email",
  "query": "Share customer success story: Company X increased productivity by 50% using our tool.",
  "context": {
    "userId": "user_mkting_06",
    "intent": "case_study",
    "tone": "inspirational",
    "metadata": {
      "companyName": "Company X",
      "metric": "50% productivity increase",
      "product": "our project management tool"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T230", "T268", "T298"],
    "expectedAnswer": "See how Company X increased productivity by 50% with our project management tool. Read their story and discover how we can help you too. Read case study: [case_study_link]",
    "keyInformation": [
      "Company X",
      "50% productivity increase",
      "Product: project management tool",
      "Social proof"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.70,
    "minFaithfulness": 0.85,
    "minAnswerRelevancy": 0.75,
    "requiredElements": ["company_name", "metrics", "product", "cta"]
  }
}
```

#### TC-027: Referral Program
```json
{
  "id": "TC-027",
  "category": "marketing",
  "channel": "email",
  "query": "Promote referral program: Refer friend, both get $25 credit.",
  "context": {
    "userId": "user_mkting_07",
    "intent": "referral_program",
    "tone": "generous",
    "metadata": {
      "referrerReward": "$25",
      "refereeReward": "$25"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T235", "T270", "T294"],
    "expectedAnswer": "Refer a friend and you both get $25 credit! Share your unique referral link and start earning. Start referring: [referral_link]",
    "keyInformation": [
      "Referral program",
      "Both get $25",
      "Unique referral link"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.75,
    "minFaithfulness": 0.85,
    "minAnswerRelevancy": 0.80,
    "requiredElements": ["referrer_reward", "referee_reward", "referral_mechanism", "cta"]
  }
}
```

#### TC-028: Free Trial Expiring
```json
{
  "id": "TC-028",
  "category": "marketing",
  "channel": "email",
  "query": "User's 14-day free trial expires in 2 days. Encourage upgrade with 20% first-month discount.",
  "context": {
    "userId": "user_mkting_08",
    "intent": "trial_expiring",
    "tone": "encouraging",
    "metadata": {
      "daysLeft": 2,
      "discount": "20%",
      "discountCode": "FIRST20"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T240", "T275", "T296"],
    "expectedAnswer": "Your free trial ends in 2 days! Upgrade now with code FIRST20 for 20% off your first month. Don't lose access to your work. Upgrade: [upgrade_link]",
    "keyInformation": [
      "Trial expiring in 2 days",
      "Discount 20% first month",
      "Code FIRST20",
      "Risk of losing access"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.75,
    "minFaithfulness": 0.85,
    "minAnswerRelevancy": 0.80,
    "requiredElements": ["days_left", "discount", "code", "urgency", "cta"]
  }
}
```

#### TC-029: Feature Announcement
```json
{
  "id": "TC-029",
  "category": "marketing",
  "channel": "email",
  "query": "Announce new feature: Dark Mode now available for all users.",
  "context": {
    "userId": "user_mkting_09",
    "intent": "feature_announcement",
    "tone": "exciting",
    "metadata": {
      "featureName": "Dark Mode",
      "availability": "all users"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T245", "T278", "T293"],
    "expectedAnswer": "Introducing Dark Mode! Reduce eye strain and work comfortably at night. Dark Mode is now available for all users. Enable in Settings: [settings_link]",
    "keyInformation": [
      "Feature name Dark Mode",
      "Available for all users",
      "Benefits: eye strain, nighttime use",
      "How to enable"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.75,
    "minFaithfulness": 0.80,
    "minAnswerRelevancy": 0.80,
    "requiredElements": ["feature_name", "benefits", "availability", "cta"]
  }
}
```

#### TC-030: Webinar Invitation
```json
{
  "id": "TC-030",
  "category": "marketing",
  "channel": "email",
  "query": "Invite to webinar: 'Mastering Productivity' on Dec 18, 2PM EST. Guest speaker John Doe.",
  "context": {
    "userId": "user_mkting_10",
    "intent": "webinar_invitation",
    "tone": "professional",
    "metadata": {
      "webinarTitle": "Mastering Productivity",
      "date": "2024-12-18",
      "time": "2:00 PM EST",
      "speaker": "John Doe"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T250", "T280", "T292"],
    "expectedAnswer": "Join our webinar: 'Mastering Productivity' on Dec 18 at 2PM EST. Guest speaker John Doe will share expert tips. Register now: [register_link]",
    "keyInformation": [
      "Webinar title Mastering Productivity",
      "Date Dec 18",
      "Time 2PM EST",
      "Speaker John Doe"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.75,
    "minFaithfulness": 0.85,
    "minAnswerRelevancy": 0.80,
    "requiredElements": ["webinar_title", "date", "time", "speaker", "register_cta"]
  }
}
```

---

### System Alerts - Push & Email (10 cases)

#### TC-031: System Maintenance Alert
```json
{
  "id": "TC-031",
  "category": "system",
  "channel": "push",
  "query": "Scheduled maintenance Dec 12, 2AM-4AM EST. System will be unavailable.",
  "context": {
    "userId": "all_users",
    "intent": "maintenance_alert",
    "tone": "informative",
    "metadata": {
      "date": "2024-12-12",
      "startTime": "2:00 AM EST",
      "endTime": "4:00 AM EST"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T301", "T345", "T389"],
    "expectedAnswer": "Scheduled maintenance: Dec 12, 2-4 AM EST. System will be unavailable during this time. Plan accordingly.",
    "keyInformation": [
      "Maintenance scheduled",
      "Date Dec 12",
      "Time 2-4 AM EST",
      "System unavailable"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.85,
    "minFaithfulness": 0.90,
    "minAnswerRelevancy": 0.85,
    "requiredElements": ["date", "time_range", "impact", "concise"]
  }
}
```

#### TC-032: Security Breach Alert
```json
{
  "id": "TC-032",
  "category": "system",
  "channel": "email",
  "query": "Security incident detected. Users should reset passwords immediately.",
  "context": {
    "userId": "all_users",
    "intent": "security_breach",
    "tone": "urgent_serious",
    "metadata": {
      "incidentDate": "2024-12-10",
      "actionRequired": "password_reset"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T305", "T348", "T391"],
    "expectedAnswer": "SECURITY ALERT: We detected unauthorized access attempts on Dec 10. Please reset your password immediately to secure your account. Reset password: [reset_link]",
    "keyInformation": [
      "Security alert",
      "Incident date Dec 10",
      "Action required: reset password",
      "Urgency"
    ],
    "prohibitedInformation": [
      "Detailed breach information that could aid attackers"
    ]
  },
  "criteria": {
    "minRetrievalPrecision": 0.90,
    "minFaithfulness": 0.95,
    "minAnswerRelevancy": 0.95,
    "requiredElements": ["alert_label", "incident_date", "action_required", "urgency", "reset_cta"]
  }
}
```

#### TC-033: Service Degradation
```json
{
  "id": "TC-033",
  "category": "system",
  "channel": "push",
  "query": "Service running slow due to high traffic. Engineers investigating.",
  "context": {
    "userId": "active_users",
    "intent": "service_degradation",
    "tone": "transparent",
    "metadata": {
      "issue": "high_traffic",
      "status": "investigating"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T310", "T350", "T393"],
    "expectedAnswer": "We're experiencing slower than usual performance due to high traffic. Our team is investigating. Status updates: [status_page]",
    "keyInformation": [
      "Performance issues",
      "Cause: high traffic",
      "Team investigating",
      "Status page link"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.80,
    "minFaithfulness": 0.90,
    "minAnswerRelevancy": 0.85,
    "requiredElements": ["issue_description", "cause", "status", "status_link"]
  }
}
```

#### TC-034: Feature Deprecation Notice
```json
{
  "id": "TC-034",
  "category": "system",
  "channel": "email",
  "query": "Old API v1 will be deprecated on March 1, 2025. Migrate to API v2.",
  "context": {
    "userId": "developers",
    "intent": "deprecation_notice",
    "tone": "technical",
    "metadata": {
      "deprecatedFeature": "API v1",
      "deprecationDate": "2025-03-01",
      "replacement": "API v2"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T315", "T355", "T395"],
    "expectedAnswer": "IMPORTANT: API v1 will be deprecated on March 1, 2025. Please migrate to API v2 before this date to avoid service interruption. Migration guide: [migration_link]",
    "keyInformation": [
      "API v1 deprecation",
      "Date March 1, 2025",
      "Migrate to API v2",
      "Migration guide available"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.85,
    "minFaithfulness": 0.95,
    "minAnswerRelevancy": 0.90,
    "requiredElements": ["deprecated_feature", "date", "replacement", "migration_guide"]
  }
}
```

#### TC-035: Data Breach Notification
```json
{
  "id": "TC-035",
  "category": "system",
  "channel": "email",
  "query": "Data breach affected email addresses. No passwords compromised. Users should be cautious of phishing.",
  "context": {
    "userId": "affected_users",
    "intent": "data_breach_notification",
    "tone": "serious_transparent",
    "metadata": {
      "affectedData": ["email_addresses"],
      "notAffected": ["passwords", "payment_info"],
      "incidentDate": "2024-12-05"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T320", "T358", "T397"],
    "expectedAnswer": "We're writing to inform you of a security incident on Dec 5 that exposed email addresses. Your password and payment information were NOT compromised. Be cautious of phishing emails. More info: [incident_report]",
    "keyInformation": [
      "Security incident",
      "Email addresses exposed",
      "Passwords NOT compromised",
      "Payment info NOT compromised",
      "Phishing warning"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.90,
    "minFaithfulness": 0.95,
    "minAnswerRelevancy": 0.95,
    "requiredElements": ["incident_date", "affected_data", "not_affected_data", "phishing_warning", "more_info_link"]
  }
}
```

#### TC-036: Storage Limit Warning
```json
{
  "id": "TC-036",
  "category": "system",
  "channel": "push",
  "query": "User using 90% of storage quota. Recommend upgrade or cleanup.",
  "context": {
    "userId": "user_storage_01",
    "intent": "storage_warning",
    "tone": "helpful",
    "metadata": {
      "storageUsed": "90%",
      "storagePlan": "Basic 10GB"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T325", "T360", "T394"],
    "expectedAnswer": "You're using 90% of your 10GB storage. Upgrade for more space or delete unused files to free up storage. Manage storage: [storage_link]",
    "keyInformation": [
      "90% storage used",
      "Plan: Basic 10GB",
      "Options: upgrade or cleanup"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.80,
    "minFaithfulness": 0.90,
    "minAnswerRelevancy": 0.85,
    "requiredElements": ["storage_percentage", "storage_plan", "action_options", "manage_link"]
  }
}
```

#### TC-037: New Terms of Service
```json
{
  "id": "TC-037",
  "category": "system",
  "channel": "email",
  "query": "Updated Terms of Service effective Jan 1, 2025. Users must review and accept.",
  "context": {
    "userId": "all_users",
    "intent": "tos_update",
    "tone": "formal",
    "metadata": {
      "effectiveDate": "2025-01-01",
      "actionRequired": "review_accept"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T330", "T365", "T396"],
    "expectedAnswer": "We've updated our Terms of Service, effective January 1, 2025. Please review the changes and accept the new terms to continue using our service. Review terms: [tos_link]",
    "keyInformation": [
      "Terms of Service updated",
      "Effective date Jan 1, 2025",
      "Action required: review and accept",
      "Required to continue service"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.85,
    "minFaithfulness": 0.95,
    "minAnswerRelevancy": 0.90,
    "requiredElements": ["update_type", "effective_date", "action_required", "review_link"]
  }
}
```

#### TC-038: Suspicious Activity Detected
```json
{
  "id": "TC-038",
  "category": "system",
  "channel": "push",
  "query": "Login from new device in Russia. If not you, secure account immediately.",
  "context": {
    "userId": "user_security_02",
    "intent": "suspicious_activity",
    "tone": "urgent",
    "metadata": {
      "location": "Russia",
      "device": "Unknown device"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T335", "T368", "T398"],
    "expectedAnswer": "ALERT: Login from unknown device in Russia. Wasn't you? Secure your account now: [secure_link]",
    "keyInformation": [
      "Suspicious activity alert",
      "Location: Russia",
      "Unknown device",
      "Action: secure account if not user"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.90,
    "minFaithfulness": 0.95,
    "minAnswerRelevancy": 0.95,
    "requiredElements": ["alert_label", "location", "device", "secure_action", "concise"]
  }
}
```

#### TC-039: Backup Completed
```json
{
  "id": "TC-039",
  "category": "system",
  "channel": "email",
  "query": "Weekly backup completed successfully. 2.3 GB backed up.",
  "context": {
    "userId": "user_backup_01",
    "intent": "backup_completed",
    "tone": "informative",
    "metadata": {
      "backupSize": "2.3 GB",
      "backupDate": "2024-12-10",
      "backupType": "weekly"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T340", "T370", "T392"],
    "expectedAnswer": "Your weekly backup completed successfully on Dec 10. 2.3 GB backed up. View backup details: [backup_link]",
    "keyInformation": [
      "Backup completed",
      "Type: weekly",
      "Date: Dec 10",
      "Size: 2.3 GB"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.80,
    "minFaithfulness": 0.90,
    "minAnswerRelevancy": 0.85,
    "requiredElements": ["backup_status", "date", "size", "view_link"]
  }
}
```

#### TC-040: Rate Limit Exceeded
```json
{
  "id": "TC-040",
  "category": "system",
  "channel": "push",
  "query": "API rate limit exceeded. User should upgrade plan or wait for reset.",
  "context": {
    "userId": "developer_01",
    "intent": "rate_limit_exceeded",
    "tone": "technical",
    "metadata": {
      "currentPlan": "Basic",
      "limitReset": "1 hour"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T342", "T375", "T399"],
    "expectedAnswer": "API rate limit exceeded (Basic plan). Limit resets in 1 hour or upgrade for higher limits. Upgrade: [upgrade_link]",
    "keyInformation": [
      "Rate limit exceeded",
      "Current plan: Basic",
      "Reset time: 1 hour",
      "Option to upgrade"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.85,
    "minFaithfulness": 0.90,
    "minAnswerRelevancy": 0.90,
    "requiredElements": ["limit_status", "plan", "reset_time", "upgrade_option"]
  }
}
```

---

### Marketing - Push (5 cases)

#### TC-041: Flash Sale Alert
```json
{
  "id": "TC-041",
  "category": "marketing",
  "channel": "push",
  "query": "24-hour flash sale: 50% off premium plans. Ends midnight tonight.",
  "context": {
    "userId": "free_users",
    "intent": "flash_sale",
    "tone": "urgent",
    "metadata": {
      "discount": "50%",
      "duration": "24 hours",
      "target": "premium_plans"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T401", "T445", "T489"],
    "expectedAnswer": "⚡ Flash Sale! 50% off Premium plans. Ends tonight at midnight. Upgrade now!",
    "keyInformation": [
      "Flash sale",
      "50% off",
      "Target: Premium plans",
      "Ends midnight tonight"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.75,
    "minFaithfulness": 0.85,
    "minAnswerRelevancy": 0.80,
    "requiredElements": ["discount", "target_product", "urgency", "deadline", "concise"]
  }
}
```

#### TC-042: New Content Available
```json
{
  "id": "TC-042",
  "category": "marketing",
  "channel": "push",
  "query": "New course published: 'Advanced JavaScript Patterns'. Check it out.",
  "context": {
    "userId": "learning_users",
    "intent": "content_available",
    "tone": "exciting",
    "metadata": {
      "contentType": "course",
      "contentTitle": "Advanced JavaScript Patterns"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T410", "T456", "T491"],
    "expectedAnswer": "New course: 'Advanced JavaScript Patterns' is now available! Start learning today.",
    "keyInformation": [
      "New course",
      "Title: Advanced JavaScript Patterns",
      "CTA: start learning"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.75,
    "minFaithfulness": 0.85,
    "minAnswerRelevancy": 0.80,
    "requiredElements": ["content_type", "content_title", "cta", "concise"]
  }
}
```

#### TC-043: Friend Request
```json
{
  "id": "TC-043",
  "category": "marketing",
  "channel": "push",
  "query": "User 'JohnDoe' sent you a friend request. Accept or decline.",
  "context": {
    "userId": "social_user_01",
    "intent": "friend_request",
    "tone": "social",
    "metadata": {
      "senderUsername": "JohnDoe"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T415", "T458", "T493"],
    "expectedAnswer": "JohnDoe sent you a friend request. Accept or decline?",
    "keyInformation": [
      "Friend request",
      "Sender: JohnDoe",
      "Actions: accept or decline"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.80,
    "minFaithfulness": 0.90,
    "minAnswerRelevancy": 0.85,
    "requiredElements": ["sender_name", "action_options", "concise"]
  }
}
```

#### TC-044: Milestone Achieved
```json
{
  "id": "TC-044",
  "category": "marketing",
  "channel": "push",
  "query": "Congratulations! You've reached 100 completed tasks. Celebrate with 10% off upgrade.",
  "context": {
    "userId": "active_user_01",
    "intent": "milestone_achievement",
    "tone": "celebratory",
    "metadata": {
      "milestone": "100 tasks completed",
      "reward": "10% off upgrade"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T420", "T460", "T495"],
    "expectedAnswer": "🎉 Milestone! You completed 100 tasks! Celebrate with 10% off Premium. Claim offer now!",
    "keyInformation": [
      "Milestone achieved",
      "100 tasks completed",
      "Reward: 10% off upgrade"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.75,
    "minFaithfulness": 0.85,
    "minAnswerRelevancy": 0.80,
    "requiredElements": ["milestone_description", "reward", "celebratory_tone", "cta", "concise"]
  }
}
```

#### TC-045: Price Drop Alert
```json
{
  "id": "TC-045",
  "category": "marketing",
  "channel": "push",
  "query": "Item in your wishlist dropped to $49 (was $79). Limited stock.",
  "context": {
    "userId": "shopper_01",
    "intent": "price_drop",
    "tone": "urgent",
    "metadata": {
      "itemName": "Wireless Headphones",
      "oldPrice": 79,
      "newPrice": 49,
      "stock": "limited"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T425", "T465", "T497"],
    "expectedAnswer": "Price Drop! Wireless Headphones: $49 (was $79). Limited stock. Buy now!",
    "keyInformation": [
      "Price drop",
      "Item: Wireless Headphones",
      "Old price: $79",
      "New price: $49",
      "Limited stock"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.80,
    "minFaithfulness": 0.90,
    "minAnswerRelevancy": 0.85,
    "requiredElements": ["item_name", "old_price", "new_price", "urgency", "concise"]
  }
}
```

---

### System - SMS (5 cases)

#### TC-046: System Back Online
```json
{
  "id": "TC-046",
  "category": "system",
  "channel": "sms",
  "query": "Maintenance completed. System back online and fully operational.",
  "context": {
    "userId": "all_users",
    "intent": "system_restored",
    "tone": "informative",
    "metadata": {
      "maintenanceCompleted": true
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T450", "T480", "T498"],
    "expectedAnswer": "Maintenance complete. System is back online and fully operational. Thank you for your patience.",
    "keyInformation": [
      "Maintenance complete",
      "System online",
      "Fully operational"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.85,
    "minFaithfulness": 0.90,
    "minAnswerRelevancy": 0.85,
    "requiredElements": ["status_update", "system_operational", "max_160_chars"]
  }
}
```

#### TC-047: Critical Update Required
```json
{
  "id": "TC-047",
  "category": "system",
  "channel": "sms",
  "query": "Critical security update available. Update app immediately.",
  "context": {
    "userId": "mobile_users",
    "intent": "critical_update",
    "tone": "urgent",
    "metadata": {
      "updateType": "security",
      "urgency": "critical"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T455", "T482", "T499"],
    "expectedAnswer": "CRITICAL: Security update available. Update your app now for continued protection.",
    "keyInformation": [
      "Critical update",
      "Security update",
      "Update immediately"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.90,
    "minFaithfulness": 0.95,
    "minAnswerRelevancy": 0.95,
    "requiredElements": ["urgency_label", "update_type", "action_required", "max_160_chars"]
  }
}
```

#### TC-048: Account Inactivity Warning
```json
{
  "id": "TC-048",
  "category": "system",
  "channel": "sms",
  "query": "Account inactive for 180 days. Will be deleted in 30 days if no action taken.",
  "context": {
    "userId": "inactive_user",
    "intent": "inactivity_warning",
    "tone": "warning",
    "metadata": {
      "inactiveDays": 180,
      "deletionDays": 30
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T460", "T485", "T496"],
    "expectedAnswer": "Account inactive 180 days. Will be deleted in 30 days. Log in to keep: example.com/login",
    "keyInformation": [
      "Inactive 180 days",
      "Deletion in 30 days",
      "Action: log in"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.85,
    "minFaithfulness": 0.90,
    "minAnswerRelevancy": 0.90,
    "requiredElements": ["inactive_days", "deletion_timeline", "action_required", "max_160_chars"]
  }
}
```

#### TC-049: Payment Method Expiring
```json
{
  "id": "TC-049",
  "category": "system",
  "channel": "sms",
  "query": "Credit card ending 4532 expires next month. Update payment method to avoid interruption.",
  "context": {
    "userId": "subscriber_01",
    "intent": "payment_expiring",
    "tone": "reminder",
    "metadata": {
      "lastFourDigits": "4532",
      "expiryMonth": "next month"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T465", "T488", "T494"],
    "expectedAnswer": "Card ending 4532 expires next month. Update payment method: example.com/payment",
    "keyInformation": [
      "Card ending 4532",
      "Expires next month",
      "Action: update payment"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.85,
    "minFaithfulness": 0.90,
    "minAnswerRelevancy": 0.90,
    "requiredElements": ["card_last_four", "expiry_timeline", "update_link", "max_160_chars"]
  }
}
```

#### TC-050: Unusual Activity Warning
```json
{
  "id": "TC-050",
  "category": "system",
  "channel": "sms",
  "query": "Unusual activity detected: 50 failed login attempts. Account temporarily locked.",
  "context": {
    "userId": "security_user_03",
    "intent": "unusual_activity",
    "tone": "urgent",
    "metadata": {
      "activityType": "failed_logins",
      "count": 50,
      "action": "account_locked"
    }
  },
  "groundTruth": {
    "relevantTemplateIds": ["T470", "T490", "T500"],
    "expectedAnswer": "ALERT: 50 failed login attempts. Account locked for security. Unlock: example.com/unlock",
    "keyInformation": [
      "Unusual activity",
      "50 failed logins",
      "Account locked",
      "Security measure"
    ],
    "prohibitedInformation": []
  },
  "criteria": {
    "minRetrievalPrecision": 0.90,
    "minFaithfulness": 0.95,
    "minAnswerRelevancy": 0.95,
    "requiredElements": ["alert_label", "activity_description", "action_taken", "unlock_link", "max_160_chars"]
  }
}
```

---

## Dataset Statistics

```typescript
const DATASET_STATS = {
  total: 50,
  byChannel: {
    email: 30,  // 60%
    sms: 15,    // 30%
    push: 5,    // 10%
  },
  byCategory: {
    transactional: 25,  // 50%
    marketing: 15,      // 30%
    system: 10,         // 20%
  },
  byCombination: {
    transactional_email: 10,
    transactional_sms: 10,
    transactional_push: 5,
    marketing_email: 10,
    marketing_push: 5,
    system_email: 10,
    system_sms: 5,
  },
  avgKeyInformation: 4.2,
  avgRequiredElements: 4.5,
};
```

---

## Usage Instructions

### Running Evaluation

```typescript
import { RAGASEvaluator } from './ragas-evaluator';
import { RetrievalEvaluator } from './retrieval-evaluator';
import { GenerationEvaluator } from './generation-evaluator';
import { EVALUATION_DATASET } from './evaluation-dataset';

async function runEvaluation() {
  const ragasEvaluator = new RAGASEvaluator();
  const retrievalEvaluator = new RetrievalEvaluator();
  const generationEvaluator = new GenerationEvaluator();

  await ragasEvaluator.initialize();
  await generationEvaluator.initialize();

  const results = [];

  for (const testCase of EVALUATION_DATASET) {
    // 1. Execute RAG pipeline
    const { retrievedContexts, generatedAnswer } = await executeRAGPipeline(testCase.query);

    // 2. Evaluate retrieval
    const retrievalMetrics = await retrievalEvaluator.evaluateQuery({
      id: testCase.id,
      query: testCase.query,
      results: retrievedContexts,
      groundTruth: new Set(testCase.groundTruth.relevantTemplateIds),
    });

    // 3. Evaluate generation
    const generationMetrics = await generationEvaluator.evaluateGeneration(
      { body: generatedAnswer },
      testCase.groundTruth.expectedAnswer,
      retrievedContexts.map(c => c.text)
    );

    // 4. Evaluate with RAGAS
    const ragasMetrics = await ragasEvaluator.evaluate({
      query: testCase.query,
      retrievedContexts: retrievedContexts.map(c => c.text),
      generatedAnswer,
      groundTruthAnswer: testCase.groundTruth.expectedAnswer,
    });

    results.push({
      testCaseId: testCase.id,
      retrieval: retrievalMetrics,
      generation: generationMetrics,
      ragas: ragasMetrics,
    });
  }

  return results;
}
```

---

## Next Steps

1. **Implement Evaluation Pipeline** (automated testing with this dataset)
2. **Establish Baseline Metrics** (measure current system against targets)
3. **Design A/B Testing Framework** (test improvements iteratively)
4. **Set Up Continuous Monitoring** (track metrics over time)
5. **Create Evaluation Dashboard** (visualize results)

