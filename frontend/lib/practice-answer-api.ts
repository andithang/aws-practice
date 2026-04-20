import { apiRequest } from './api-client';

export async function savePracticeAnswer(input: {
  questionKey: string;
  selectedAnswers: string[];
  level?: string;
}): Promise<void> {
  const response = await apiRequest('/api/practice/answers', {
    method: 'POST',
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`Failed to save answer (${response.status})`);
  }
}

export async function clearPracticeAnswer(questionKey: string): Promise<void> {
  const response = await apiRequest('/api/practice/answers', {
    method: 'DELETE',
    body: JSON.stringify({ questionKey })
  });

  if (!response.ok) {
    throw new Error(`Failed to clear answer (${response.status})`);
  }
}
