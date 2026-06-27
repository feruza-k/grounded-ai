import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import './App.css';

function App() {
  const [mode, setMode] = useState('qa');

  // Q&A state
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [citations, setCitations] = useState([]);

  // Quiz state
  const [quiz, setQuiz] = useState(null);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);

  // Shared
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

  async function generateQuiz() {
    setLoading(true);
    setError('');
    setQuiz(null);
    setSelected(null);
    try {
      const res = await fetch('http://localhost:8000/quiz', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setQuiz(data);
      setTotal(t => t + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', fontFamily: 'sans-serif', padding: '0 20px' }}>
      <h1>Grounded AI — Azure AI-102 Prep</h1>

      {/* Mode toggle */}
      <div style={{ marginBottom: '24px' }}>
        <button onClick={() => setMode('qa')} style={{ marginRight: '8px', fontWeight: mode === 'qa' ? 'bold' : 'normal' }}>
          Q&A
        </button>
        <button onClick={() => setMode('quiz')} style={{ fontWeight: mode === 'quiz' ? 'bold' : 'normal' }}>
          Quiz
        </button>
      </div>

      {/* Q&A view */}
      {mode === 'qa' && (
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
                  <summary style={{ cursor: 'pointer', fontWeight: 
              'bold' }}>
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
      )}

      {/* Quiz view */}
      {mode === 'quiz' && (
        <div>
          <p>Score: {score} / {total}</p>
          <button onClick={generateQuiz} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Question'}
          </button>
          {error && <p style={{ color: 'red' }}>{error}</p>}
          {quiz && (
            <div style={{ marginTop: '24px' }}>
              <p><strong>{quiz.question}</strong></p>
              {quiz.options.map((opt, i) => {
                const letter = opt[0];
                let bg = '#f0f0f0';
                if (selected) {
                  if (letter === quiz.answer) bg = '#c8f7c5';
                  else if (letter === selected) bg = '#f7c5c5';
                }
                return (
                  <div
                    key={i}
                    onClick={() => {
                      if (selected) return;
                      setSelected(letter);
                      if (letter === quiz.answer) setScore(s => s + 1);
                    }}
                    style={{ background: bg, padding: '10px', marginBottom: '8px', cursor: selected ? 'default' : 'pointer', borderRadius: '4px' }}
                  >
                    {opt}
                  </div>
                );
              })}
              {selected && (
                <div style={{ marginTop: '16px', padding: '12px', background: '#fffbe6' }}>
                  <strong>{selected === quiz.answer ? 'Correct!' : `Incorrect — answer is ${quiz.answer}`}</strong>
                  <p>{quiz.explanation}</p>
                  <p style={{ fontSize: '12px', color: '#888' }}>Source: {quiz.source}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
