import { APIGatewayProxyHandler } from 'aws-lambda';
import { queryByPk } from '../common/aws';
import { randomLevel } from '../common/generation';

export const handler: APIGatewayProxyHandler = async () => {
  const level = randomLevel();
  const pk = `LEVEL#${level}`;
  const result = await queryByPk(pk);
  const items = (result.Items || []).filter((i) => i.entityType === 'QUESTION' && i.isPublished);

  const shuffled = items.sort(() => Math.random() - 0.5).slice(0, 10);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, count: shuffled.length, questions: shuffled })
  };
};
