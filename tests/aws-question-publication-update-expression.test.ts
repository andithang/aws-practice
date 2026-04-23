import { describe, expect, it } from 'vitest';
import { buildQuestionPublicationUpdateExpression } from '../src/functions/common/aws';

describe('buildQuestionPublicationUpdateExpression', () => {
  it('omits #publishedAt when action is deprecate', () => {
    const update = buildQuestionPublicationUpdateExpression('deprecate');

    expect(update.expressionAttributeNames).not.toHaveProperty('#publishedAt');
    expect(update.updateExpression).not.toContain('#publishedAt');
  });

  it('includes publish/deprecate attributes when action is publish', () => {
    const update = buildQuestionPublicationUpdateExpression('publish');

    expect(update.expressionAttributeNames).toHaveProperty('#publishedAt', 'publishedAt');
    expect(update.expressionAttributeNames).toHaveProperty('#deprecatedAt', 'deprecatedAt');
    expect(update.updateExpression).toContain('#publishedAt');
    expect(update.updateExpression).toContain('REMOVE #deprecatedAt');
  });
});
