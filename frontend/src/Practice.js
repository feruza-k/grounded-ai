import { useState } from 'react';

const TOPICS = [
  { key: 'plan_manage', label: 'Plan & Manage Azure AI' },
  { key: 'generative_ai', label: 'Generative AI Solutions' },
  { key: 'agentic', label: 'Agentic Solutions' },
  { key: 'computer_vision', label: 'Computer Vision' },
  { key: 'nlp', label: 'Natural Language Processing' },
  { key: 'knowledge_mining', label: 'Knowledge Mining' },
];

export default function Practice() {
  const [topic, setTopic] = useState('random');
  const [quiz, setQuiz] = useState(null);
  const [selected, setSelected] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);

  async function generateQuestion() {
    setLoading(true);
    setError('');
    setQuiz(null);
    setSelected([]);
    setSubmitted(false);

    const chosenTopic = topic === 'random'
      ? TOPICS[Math.floor(Math.random() * TOPICS.length)].key
      : topic;

    const questionType = Math.random() < 0.3 ? 'multi' : 'single';

    try {
      const res = await fetch('http://localhost:8000/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: chosenTopic, question_type: questionType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setQuiz(data);
      setTotal(t => t + 1);
    } catch (e) {
      setError(e.message);
      setTotal(t => t - 1);
    } finally {
      setLoading(false);
    }
  }

  function toggleOption(letter) {
    if (submitted) return;
    if (quiz.question_type === 'single') {
      setSelected([letter]);
    } else {
      setSelected(prev =>
        prev.includes(letter) ? prev.filter(l => l !== letter) : [...prev, letter]
      );
    }
  }

  function submit() {
    if (selected.length === 0) return;
    setSubmitted(true);
    const correct = quiz.answer.every(a => selected.includes(a)) && selected.every(a => quiz.answer.includes(a));
    if (correct) setScore(s => s + 1);
  }

  function optionStyle(letter) {
    if (!submitted) return selected.includes(letter) ? '#d0e8ff' : '#f0f0f0';
    if (quiz.answer.includes(letter)) return '#c8f7c5';
    if (selected.includes(letter)) return '#f7c5c5';
    return '#f0f0f0';
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <select value={topic} onChange={e => setTopic(e.target.value)} style={{ padding: '6px' }}>
          <option value="random">Random topic</option>
          {TOPICS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <button onClick={generateQuestion} disabled={loading}>
          {loading ? 'Generating...' : quiz ? 'Next Question' : 'Generate Question'}
        </button>
        <span style={{ marginLeft: 'auto', fontWeight: 'bold' }}>Score: {score} / {total}</span>
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {quiz && (
        <div>
          <p style={{ fontSize: '13px', color: '#0078d4', marginBottom: '4px' }}>
            {TOPICS.find(t => t.key === quiz.topic)?.label} — {quiz.question_type === 'multi' ? 'Select TWO' : 'Select ONE'}
          </p>
          <p><strong>{quiz.question}</strong></p>

          {quiz.options.map((opt, i) => {
            const letter = opt[0];
            return (
              <div
                key={i}
                onClick={() => toggleOption(letter)}
                style={{
                  background: optionStyle(letter),
                  padding: '10px',
                  marginBottom: '8px',
                  cursor: submitted ? 'default' : 'pointer',
                  borderRadius: '4px',
                  border: selected.includes(letter) && !submitted ? '1px solid #0078d4' : '1px solid transparent',
                }}
              >
                {opt}
              </div>
            );
          })}

          {!submitted && (
            <button onClick={submit} disabled={selected.length === 0} style={{ marginTop: '8px' }}>
              Submit Answer
            </button>
          )}

          {submitted && (
            <details open style={{ marginTop: '16px', padding: '12px', background: '#fffbe6', borderRadius: '4px' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                {quiz.answer.every(a => selected.includes(a)) && selected.every(a => quiz.answer.includes(a))
                  ? '✓ Correct!'
                  : `✗ Incorrect — correct answer: ${quiz.answer.join(', ')}`}
              </summary>
              <p style={{ marginTop: '8px' }}>{quiz.explanation}</p>
              <p style={{ fontSize: '12px', color: '#888' }}>Source: {quiz.source}</p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
