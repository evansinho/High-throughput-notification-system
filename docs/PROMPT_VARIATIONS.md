# Prompt Variations for Notification Template Retrieval

## Overview
This document explores different prompting strategies to improve notification template retrieval and generation quality in our RAG system.

## Context
Our notification system uses:
1. **Vector Search**: Retrieve similar templates from Qdrant
2. **LLM Generation**: Use Claude to adapt/generate notifications based on retrieved templates

## Prompt Engineering Principles

### 1. Clear Context
- Provide complete context about the notification purpose
- Include user information and trigger event
- Specify channel and tone requirements

### 2. Template Guidance
- Show retrieved templates as examples
- Highlight which aspects to preserve/modify
- Give explicit instructions for adaptation

### 3. Constraint Specification
- Define length limits clearly
- Specify required/forbidden elements
- Set tone and style guidelines

### 4. Output Format
- Request specific format (plain text, HTML, etc.)
- Define variable placeholder format
- Specify any metadata to include

## Retrieval Query Variations

### Strategy 1: Direct Query (Baseline)
**Approach**: Use the notification intent directly as the search query

```typescript
const query = "password reset notification";
```

**Pros**:
- Simple and straightforward
- Low latency
- Easy to implement

**Cons**:
- May miss semantic variations
- Doesn't leverage metadata
- Limited context

**Example**:
```typescript
const searchQuery = {
  queryText: "password reset",
  topK: 3,
  filter: {
    channel: "email",
    category: "transactional"
  }
};
```

### Strategy 2: Expanded Query
**Approach**: Expand query with synonyms and related terms

```typescript
const query = "forgot password, reset password, password recovery, account security";
```

**Pros**:
- Better recall
- Catches semantic variations
- More robust

**Cons**:
- Longer embedding generation
- May dilute relevance
- Requires manual expansion

**Example**:
```typescript
const expandQuery = (intent: string): string => {
  const expansions = {
    'password_reset': 'forgot password, reset password, password recovery, account access, login help',
    'order_shipped': 'package sent, shipment, delivery, order dispatch, tracking',
    'payment_failed': 'payment declined, card rejected, transaction failed, billing error',
  };
  return expansions[intent] || intent;
};
```

### Strategy 3: LLM-Enhanced Query
**Approach**: Use LLM to generate optimal search query

```typescript
const prompt = `
Given this notification intent, generate an optimal search query for finding similar notification templates:

Intent: ${userIntent}
Channel: ${channel}
Context: ${additionalContext}

Generate a concise search query (1-2 sentences) that captures the core message and tone.
`;
```

**Pros**:
- Highly relevant queries
- Captures semantic meaning
- Adapts to context

**Cons**:
- Additional LLM call (cost + latency)
- More complex
- Potential for over-optimization

**Example**:
```typescript
async function generateSearchQuery(intent: NotificationIntent): Promise<string> {
  const prompt = `
Generate a search query for finding notification templates.

Intent: User requested password reset
Channel: Email
Tone: Professional and reassuring
User context: First-time password reset

Return only the search query, nothing else.
`;

  const response = await llmService.generateCompletion({
    prompt,
    maxTokens: 50,
    temperature: 0.3,
  });

  return response.content;
}
```

### Strategy 4: Hybrid Query with Metadata Weighting
**Approach**: Combine semantic search with metadata filtering and boosting

```typescript
const searchQuery = {
  queryText: "password reset",
  topK: 10,
  filter: {
    channel: "email",
    category: "transactional",
    tags: ["security", "password"], // Must match at least one
  },
  scoreThreshold: 0.7,
  // Rerank by recency, usage count, or performance metrics
};
```

**Pros**:
- Best precision
- Leverages all available data
- Highly customizable

**Cons**:
- More complex implementation
- Requires metadata management
- May over-filter

## Generation Prompt Variations

### Variation 1: Basic Template Adaptation

```typescript
const prompt = `
You are writing a ${notification.channel} notification for ${notification.category} purposes.

Context:
- Event: ${notification.event}
- User: ${notification.user.name}
- Tone: ${notification.tone}

Here are similar templates for reference:
${retrievedTemplates.map((t, i) => `
Template ${i + 1}:
${t.content}
`).join('\n')}

Generate a notification based on these templates. Use the same structure and tone.

Requirements:
- Use variables like {{user_name}}, {{order_number}} for dynamic content
- Keep it ${notification.channel === 'sms' ? 'under 160 characters' : 'concise'}
- Maintain ${notification.tone} tone

Return only the notification content, nothing else.
`;
```

**Use Case**: Simple template adaptation
**Quality**: ⭐⭐⭐
**Consistency**: ⭐⭐⭐⭐

### Variation 2: Zero-Shot with Guidelines

```typescript
const prompt = `
Write a ${notification.channel} notification with these requirements:

Purpose: ${notification.purpose}
Audience: ${notification.audience}
Tone: ${notification.tone}

Guidelines:
1. Start with a clear subject/greeting
2. State the key information in the first sentence
3. Provide any necessary actions or next steps
4. Use a ${notification.tone} closing
5. Use variables like {{variable_name}} for dynamic content

${notification.channel === 'email' ? 'Include a clear call-to-action button or link.' : 'Keep it under 160 characters.'}

Write the notification:
`;
```

**Use Case**: When no good templates exist
**Quality**: ⭐⭐⭐
**Consistency**: ⭐⭐

### Variation 3: Few-Shot with Analysis

```typescript
const prompt = `
You are an expert at writing ${notification.channel} notifications.

Here are examples of high-quality notifications for this purpose:

${retrievedTemplates.map((t, i) => `
Example ${i + 1}:
Content: ${t.content}
Why it works: ${t.metadata.performanceNotes || 'Clear, actionable, and ${t.tone}'}
Performance: ${t.metadata.openRate || 'N/A'} open rate
`).join('\n')}

Now write a similar notification for:
Event: ${notification.event}
User context: ${notification.userContext}
Special requirements: ${notification.requirements}

Analysis:
1. What makes these templates effective?
2. What tone and structure should you use?
3. What key information must be included?

Based on this analysis, write the notification:
`;
```

**Use Case**: When you want high-quality, reasoned output
**Quality**: ⭐⭐⭐⭐⭐
**Consistency**: ⭐⭐⭐⭐

### Variation 4: Structured Output with Chain-of-Thought

```typescript
const prompt = `
Task: Generate a ${notification.channel} notification

Context:
${JSON.stringify(notification.context, null, 2)}

Retrieved Templates:
${retrievedTemplates.map((t, i) => `${i + 1}. ${t.content}`).join('\n')}

Think step by step:

Step 1 - Analyze the context:
What is the primary goal of this notification?
What does the user need to know?
What action should they take?

Step 2 - Review the templates:
What patterns do you see?
What tone and style are consistent?
What structure works best?

Step 3 - Plan your notification:
Opening: [How will you start?]
Body: [What's the key message?]
Action: [What should the user do?]
Closing: [How will you end?]

Step 4 - Generate the notification:
[Write the final notification here]

Format your final answer as JSON:
{
  "analysis": "...",
  "notification": "...",
  "variables": ["var1", "var2"],
  "confidence": 0.0-1.0
}
`;
```

**Use Case**: When you need transparency and reliability
**Quality**: ⭐⭐⭐⭐⭐
**Consistency**: ⭐⭐⭐⭐⭐

### Variation 5: Constrained Generation with Examples

```typescript
const prompt = `
Generate a notification following this EXACT structure:

Required Elements:
1. Greeting: "Hi {{user_name}}," or "Hello {{user_name}},"
2. Main message: One clear sentence about ${notification.event}
3. Details: 1-2 sentences with specifics
4. Call-to-action: Clear next step
5. Closing: Professional sign-off

Constraints:
- Total length: ${notification.channel === 'email' ? '150-250' : '100-160'} characters
- Tone: ${notification.tone}
- Must include variables: ${requiredVariables.join(', ')}
- Cannot include: promotional language, urgent CTAs, multiple actions

Good Example:
${retrievedTemplates[0].content}

Bad Example:
"URGENT! Click here NOW! Your account needs immediate attention! Don't miss out!"

Now generate:
`;
```

**Use Case**: When you need strict format compliance
**Quality**: ⭐⭐⭐⭐
**Consistency**: ⭐⭐⭐⭐⭐

## Advanced Prompting Techniques

### Technique 1: Dynamic Temperature Adjustment

```typescript
function getOptimalTemperature(notificationType: string): number {
  const temperatureMap = {
    'transactional': 0.2,  // Very consistent
    'marketing': 0.7,      // More creative
    'system': 0.1,         // Highly consistent
    'welcome': 0.5,        // Balanced
  };
  return temperatureMap[notificationType] || 0.3;
}

const response = await llmService.generateCompletion({
  prompt,
  temperature: getOptimalTemperature(notification.category),
  maxTokens: 200,
});
```

### Technique 2: Multi-Stage Generation

```typescript
// Stage 1: Generate outline
const outlinePrompt = `
Based on these templates, create an outline for a ${notification.event} notification:
${templates}

Return a brief outline with: Opening, Main Message, Details, CTA, Closing
`;

const outline = await llmService.generateCompletion({
  prompt: outlinePrompt,
  maxTokens: 100,
  temperature: 0.3,
});

// Stage 2: Fill in the outline
const finalPrompt = `
Using this outline, write the complete notification:
${outline}

Make it ${notification.tone} and include these variables: ${variables.join(', ')}
`;

const final = await llmService.generateCompletion({
  prompt: finalPrompt,
  maxTokens: 200,
  temperature: 0.5,
});
```

### Technique 3: Self-Critique and Refinement

```typescript
// Generate initial version
const initial = await generateNotification(context, templates);

// Self-critique
const critiquePrompt = `
Review this notification and identify issues:

${initial}

Criteria:
1. Is the tone ${notification.tone}?
2. Is it clear and actionable?
3. Are all required variables included?
4. Is the length appropriate?
5. Does it match the template style?

List any issues found.
`;

const critique = await llmService.generateCompletion({
  prompt: critiquePrompt,
  maxTokens: 150,
  temperature: 0.3,
});

// Refine if issues found
if (critique.includes('issue') || critique.includes('problem')) {
  const refinePrompt = `
Original notification:
${initial}

Issues identified:
${critique}

Generate an improved version addressing these issues:
`;

  const refined = await llmService.generateCompletion({
    prompt: refinePrompt,
    maxTokens: 200,
    temperature: 0.4,
  });

  return refined;
}

return initial;
```

### Technique 4: Ensemble Generation

```typescript
// Generate multiple variations
const variations = await Promise.all([
  generateWithPrompt(templates, 'direct'),
  generateWithPrompt(templates, 'analytical'),
  generateWithPrompt(templates, 'constrained'),
]);

// Use LLM to select best
const selectionPrompt = `
Here are 3 notification variations:

1. ${variations[0]}
2. ${variations[1]}
3. ${variations[2]}

Which one best matches these criteria?
- Tone: ${notification.tone}
- Clarity: High
- Action: Clear
- Style: Consistent with templates

Return only the number (1, 2, or 3) of the best variation.
`;

const selection = await llmService.generateCompletion({
  prompt: selectionPrompt,
  maxTokens: 10,
  temperature: 0.1,
});

return variations[parseInt(selection) - 1];
```

## Prompt Template Library

### Template 1: Transactional Notifications
```typescript
const TRANSACTIONAL_PROMPT = `
You are writing a transactional ${channel} notification.

Context: ${context}
Retrieved examples: ${templates}

Requirements:
- Professional and clear tone
- Lead with the key information
- Include specific details (order numbers, dates, etc.)
- Provide clear next steps if needed
- Use variables for dynamic content: {{user_name}}, {{order_id}}, etc.

${channel === 'email' ? 'Include a clear, single call-to-action.' : 'Keep under 160 characters.'}

Write the notification:
`;
```

### Template 2: Marketing Notifications
```typescript
const MARKETING_PROMPT = `
You are writing a marketing ${channel} notification.

Campaign: ${campaign}
Offer: ${offer}
Target audience: ${audience}

Retrieved high-performing examples:
${templates}

Requirements:
- ${tone} and engaging tone
- Clear value proposition in first sentence
- Create urgency without being pushy
- Strong call-to-action
- Use variables: {{user_name}}, {{discount_code}}, etc.

${channel === 'email' ? 'Include personalization and a compelling CTA button.' : 'Make every word count - max 160 chars.'}

Write the notification:
`;
```

### Template 3: System Notifications
```typescript
const SYSTEM_PROMPT = `
You are writing a system ${channel} notification.

Event: ${systemEvent}
Impact: ${impact}
Status: ${status}

Retrieved examples:
${templates}

Requirements:
- Clear and factual tone
- Explain what happened
- State the impact on the user
- Provide resolution timeline or next steps
- Use variables: {{service_name}}, {{incident_id}}, {{eta}}, etc.

${channel === 'email' ? 'Include a status page link.' : 'Be concise - max 160 chars.'}

Write the notification:
`;
```

## Testing Framework

### A/B Test Different Prompts

```typescript
interface PromptVariant {
  id: string;
  template: string;
  strategy: 'direct' | 'analytical' | 'constrained' | 'multi-stage';
  temperature: number;
}

async function testPromptVariations(
  notificationContext: any,
  retrievedTemplates: Template[],
): Promise<ABTestResult> {
  const variants: PromptVariant[] = [
    {
      id: 'A',
      template: BASIC_PROMPT,
      strategy: 'direct',
      temperature: 0.3,
    },
    {
      id: 'B',
      template: ANALYTICAL_PROMPT,
      strategy: 'analytical',
      temperature: 0.5,
    },
    {
      id: 'C',
      template: CONSTRAINED_PROMPT,
      strategy: 'constrained',
      temperature: 0.2,
    },
  ];

  const results = await Promise.all(
    variants.map(async (variant) => {
      const startTime = Date.now();
      const notification = await generateWithPrompt(
        notificationContext,
        retrievedTemplates,
        variant,
      );
      const latency = Date.now() - startTime;

      // Evaluate quality
      const quality = await evaluateQuality(notification, notificationContext);

      return {
        variantId: variant.id,
        notification,
        latency,
        quality,
        strategy: variant.strategy,
      };
    }),
  );

  return {
    variants: results,
    winner: selectWinner(results),
    insights: analyzeResults(results),
  };
}
```

## Metrics to Track

### 1. Generation Quality
- Relevance to context (RAGAS relevance score)
- Faithfulness to templates (RAGAS faithfulness)
- Tone consistency
- Format compliance

### 2. Business Impact
- Open rate
- Click-through rate
- Conversion rate
- Unsubscribe rate

### 3. Operational Metrics
- Generation latency
- Token usage (cost)
- Error rate
- Cache hit rate

## Recommendations

### For Notification System

**Start with**: Variation 4 (Structured Output with Chain-of-Thought)
- Provides transparency
- High quality and consistency
- Easy to debug
- Good balance of all factors

**Experiment with**:
- Dynamic temperature based on category
- Self-critique for critical notifications
- Ensemble for A/B testing

**Avoid initially**:
- Multi-stage generation (adds complexity)
- LLM-enhanced queries (extra cost)
- Ensemble (unless A/B testing)

### Implementation Priority

1. **Week 7**: Implement basic template adaptation (Variation 1)
2. **Week 8**: Add structured output with CoT (Variation 4)
3. **Week 9**: Implement A/B testing framework
4. **Week 10**: Experiment with advanced techniques based on metrics

## Next Steps

1. Implement prompt template library
2. Create prompt variant configuration system
3. Add prompt versioning and tracking
4. Set up A/B testing infrastructure
5. Monitor quality metrics for each prompt variant
6. Iterate based on production data

## References

- [Anthropic Prompt Engineering Guide](https://docs.anthropic.com/claude/docs/prompt-engineering)
- [OpenAI Prompt Engineering](https://platform.openai.com/docs/guides/prompt-engineering)
- [RAG Prompt Patterns](https://arxiv.org/abs/2312.10997)
- [Chain-of-Thought Prompting](https://arxiv.org/abs/2201.11903)
