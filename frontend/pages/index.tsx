import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <h1>AWS Exam Practice</h1>
      <p>Daily AI-generated AWS exam-style questions.</p>
      <Link href="/practice">Start practicing</Link>
    </main>
  );
}
