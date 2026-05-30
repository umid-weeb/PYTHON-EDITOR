import { useEffect, useState } from 'react';

type QuizItem = {
  question: string;
  options: string[];
  correct_answer_index: number;
};

type Remediation = {
  concept_explanation: string;
  youtube_embed_id: string;
  quiz: QuizItem[];
};

export default function RemediationModule({ userId, topic }: { userId: string; topic: string }) {
  const [data, setData] = useState<Remediation | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/ai/adaptive/remediation?userId=${encodeURIComponent(userId)}&topic=${encodeURIComponent(topic)}`);
        if (!mounted) return;
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [userId, topic]);

  if (loading) return <div>Yuklanmoqda...</div>;
  if (!data) return <div>Remediation mavjud emas.</div>;

  const allCorrect = data.quiz.every((q, i) => answers[i] === q.correct_answer_index);

  const handleSubmit = async () => {
    if (!allCorrect) return;
    setSubmitting(true);
    try {
      await fetch('/api/learning/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, topic }),
      });
      // optimism: backend will update and front-end can reflect unlocked state elsewhere
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="prose max-w-none">
        <h3>Remediation</h3>
        <p>{data.concept_explanation}</p>
      </div>

      <div className="aspect-video w-full rounded overflow-hidden">
        <iframe
          src={`https://www.youtube.com/embed/${data.youtube_embed_id}`}
          title="Remediation video"
          sandbox="allow-scripts allow-same-origin"
          className="w-full h-full"
        />
      </div>

      <div>
        <h4 className="font-semibold">Quiz</h4>
        <div className="space-y-4">
          {data.quiz.map((q, idx) => (
            <div key={idx} className="p-3 rounded border">
              <div className="mb-2 font-medium">{q.question}</div>
              <div className="space-y-1">
                {q.options.map((opt, oi) => (
                  <label key={oi} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`q-${idx}`}
                      checked={answers[idx] === oi}
                      onChange={() => setAnswers((s) => ({ ...s, [idx]: oi }))}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <button
          disabled={!allCorrect || submitting}
          onClick={handleSubmit}
          className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {submitting ? 'Yuklanmoqda...' : 'Bajarildi - Unlock'}
        </button>
      </div>
    </div>
  );
}
