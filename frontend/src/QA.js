import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

export default function QA() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [citations, setCitations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function askQuestion() {
    if (!question.trim()) return;
    setLoading(true);
    setError('');
    setAnswer('');
    setCitations([]);
    try {
      const res = await fetch('http://localhost:8000/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setAnswer(data.answer);
      setCitations(data.citation);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <textarea
        rows={3}
        style={{ width: '100%', marginBottom: '8px', padding: '8px' }}
        placeholder="Ask a question about Azure AI..."
        value={question}
        onChange={e => setQuestion(e.target.value)}
      />
      <button onClick={askQuestion} disabled={loading}>
        {loading ? 'Thinking...' : 'Ask'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {answer && (
        <div style={{ marginTop: '24px' }}>
          <h3>Answer</h3>
          <ReactMarkdown>{answer}</ReactMarkdown>
          {citations.length > 0 && (
            <details style={{ marginTop: '16px' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                Sources ({citations.length})
              </summary>
              <ul>
                {citations.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
