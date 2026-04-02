export type Level = 'practitioner' | 'associate' | 'professional';

export interface ExamQuestion {
  questionId: string;
  topic: string;
  examStyle: string;
  stem: string;
  options: Array<{ key: string; text: string }>;
  correctAnswers: string[];
  explanation: string;
  difficultyScore: number;
}

export interface GenerationPayload {
  questions: ExamQuestion[];
}
