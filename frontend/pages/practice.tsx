import type { GetServerSideProps } from 'next';

type Props = { level: string; questions: any[] };

export default function Practice({ level, questions }: Props) {
  return (
    <main>
      <h1>Practice ({level})</h1>
      {questions.map((q, i) => (
        <article key={q.questionId || i}>
          <h3>{i + 1}. {q.stem}</h3>
          <ul>{q.options?.map((o: any) => <li key={o.key}>{o.key}. {o.text}</li>)}</ul>
          <details><summary>Explanation</summary>{q.explanation}</details>
        </article>
      ))}
    </main>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  const base = process.env.BACKEND_API_BASE_URL || 'http://127.0.0.1:3000';
  const res = await fetch(`${base}/api/practice/questions`);
  const data = await res.json();
  return { props: { level: data.level, questions: data.questions || [] } };
};
