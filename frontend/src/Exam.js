import { useState, useEffect, useRef } from 'react';

// Exam topic weights match the official AI-102 study guide percentages.
// Weights don't sum to exactly 1.0 — rounding is corrected in buildTopicQueue.
const TOPICS = [
  { key: 'plan_manage',      label: 'Plan & Manage Azure AI',       weight: 0.23 },
  { key: 'generative_ai',    label: 'Generative AI Solutions',      weight: 0.18 },
  { key: 'agentic',          label: 'Agentic Solutions',            weight: 0.08 },
  { key: 'computer_vision',  label: 'Computer Vision',              weight: 0.12 },
  { key: 'nlp',              label: 'Natural Language Processing',  weight: 0.18 },
  { key: 'knowledge_mining', label: 'Knowledge Mining',             weight: 0.21 },
];

// Builds a shuffled queue of topic assignments for N questions.
// Rounding errors are corrected by adjusting the highest-weight topic.
function buildTopicQueue(totalQuestions) {
  const counts = TOPICS.map(t => ({
    ...t,
    count: Math.round(t.weight * totalQuestions),
  }));

  const total = counts.reduce((sum, t) => sum + t.count, 0);
  const diff = totalQuestions - total;
  if (diff !== 0) {
    counts.sort((a, b) => b.weight - a.weight);
    counts[0].count += diff;
  }

  const queue = [];
  counts.forEach(t => {
    for (let i = 0; i < t.count; i++) {
      queue.push({ key: t.key, label: t.label });
    }
  });

  // Fisher-Yates shuffle so questions aren't grouped by topic
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }

  return queue;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// Checks if the user's selection exactly matches the correct answer array.
function isCorrect(userSelected, correctAnswer) {
  return (
    correctAnswer.every(a => userSelected.includes(a)) &&
    userSelected.every(a => correctAnswer.includes(a))
  );
}

export default function Exam() {
  const [phase, setPhase] = useState('config'); // 'config' | 'exam' | 'results'

  // Config state
  const [totalQuestions, setTotalQuestions] = useState(50);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(110);

  // Exam state
  const [queue, setQueue] = useState([]);         // ordered list of topic assignments
  const [currentIndex, setCurrentIndex] = useState(0);
  const [questions, setQuestions] = useState([]); // fetched question objects, indexed by position
  const [selected, setSelected] = useState([]);   // current question's selected options
  const [answers, setAnswers] = useState([]);     // user's submitted answers, indexed by position
  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [timeUsed, setTimeUsed] = useState(0);
  const timerRef = useRef(null);
  const loadingTimerRef = useRef(null);

  // Start countdown when exam begins; auto-finish when time runs out.
  useEffect(() => {
    if (phase !== 'exam') return;

    timerRef.current = setInterval(() => {
      // Pause countdown while a question is loading — don't penalise the user for API latency
      setLoadingQuestion(isLoading => {
        if (!isLoading) {
          setSecondsLeft(s => {
            if (s <= 1) {
              clearInterval(timerRef.current);
              finishExam();
              return 0;
            }
            return s - 1;
          });
        }
        return isLoading;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [phase]);

  // Fetch the question for the current index whenever it changes.
  // Already-fetched questions are skipped (cached in the questions array).
  useEffect(() => {
    if (phase !== 'exam' || queue.length === 0) return;
    fetchQuestion(currentIndex);
  }, [phase, currentIndex, queue]);

  function startExam() {
    const q = buildTopicQueue(totalQuestions);
    setQueue(q);
    setCurrentIndex(0);
    setQuestions([]);
    setAnswers([]);
    setSelected([]);
    setSecondsLeft(timeLimitMinutes * 60);
    setTimeUsed(0);
    setPhase('exam');
  }

  // background=true for pre-fetches: skips loading state so the UI isn't disrupted
  async function fetchQuestion(index, background = false) {
    if (questions[index]) return; // already cached

    if (!background) {
      setLoadingQuestion(true);
      setLoadingSeconds(0);
      loadingTimerRef.current = setInterval(() => setLoadingSeconds(s => s + 1), 1000);
    }

    const topic = queue[index];
    const questionType = Math.random() < 0.3 ? 'multi' : 'single';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    try {
      const res = await fetch('http://localhost:8000/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.key, question_type: questionType }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      setQuestions(prev => {
        const updated = [...prev];
        updated[index] = data;
        return updated;
      });
    } catch (e) {
      clearTimeout(timeoutId);
      if (!background) {
        setQuestions(prev => {
          const updated = [...prev];
          updated[index] = { error: true };
          return updated;
        });
      }
      console.error('Failed to fetch question', e);
    } finally {
      if (!background) {
        clearInterval(loadingTimerRef.current);
        setLoadingQuestion(false);
      }
      // Pre-fetch the next question silently while the user reads this one
      if (index + 1 < totalQuestions && !questions[index + 1]) {
        fetchQuestion(index + 1, true);
      }
    }
  }

  function toggleOption(letter, questionType) {
    if (questionType === 'single') {
      setSelected([letter]);
    } else {
      setSelected(prev =>
        prev.includes(letter) ? prev.filter(l => l !== letter) : [...prev, letter]
      );
    }
  }

  function submitAndNext() {
    const newAnswers = [...answers];
    newAnswers[currentIndex] = selected;
    setAnswers(newAnswers);
    setSelected([]);

    if (currentIndex + 1 >= totalQuestions) {
      finishExam(newAnswers);
    } else {
      setCurrentIndex(i => i + 1);
    }
  }

  function finishExam(finalAnswers) {
    clearInterval(timerRef.current);
    setTimeUsed(timeLimitMinutes * 60 - secondsLeft);
    if (finalAnswers) setAnswers(finalAnswers);
    setPhase('results');
  }

  // ─── Config screen ────────────────────────────────────────────────────────
  if (phase === 'config') {
    return (
      <div style={{ maxWidth: '420px' }}>
        <h3>Exam Configuration</h3>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '4px' }}>Number of questions</label>
          <input
            type="number"
            min={5}
            max={100}
            value={totalQuestions}
            onChange={e => setTotalQuestions(Number(e.target.value))}
            style={{ padding: '6px', width: '100px' }}
          />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '4px' }}>Time limit (minutes)</label>
          <input
            type="number"
            min={5}
            max={300}
            value={timeLimitMinutes}
            onChange={e => setTimeLimitMinutes(Number(e.target.value))}
            style={{ padding: '6px', width: '100px' }}
          />
        </div>

        {/* Live preview of topic distribution based on current question count */}
        <div style={{ marginBottom: '24px', fontSize: '13px', color: '#555' }}>
          <strong>Topic distribution:</strong>
          <ul style={{ marginTop: '8px' }}>
            {TOPICS.map(t => (
              <li key={t.key}>
                {t.label}: {Math.round(t.weight * totalQuestions)} questions ({Math.round(t.weight * 100)}%)
              </li>
            ))}
          </ul>
        </div>

        <button onClick={startExam} style={{ padding: '8px 24px', fontSize: '16px' }}>
          Start Exam
        </button>
      </div>
    );
  }

  // ─── Exam screen ──────────────────────────────────────────────────────────
  if (phase === 'exam') {
    const currentQuestion = questions[currentIndex];

    return (
      <div>
        {/* Header: progress + early exit + countdown timer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <span>Question {currentIndex + 1} of {totalQuestions}</span>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <button
              onClick={() => finishExam(answers)}
              style={{ fontSize: '13px', padding: '4px 10px', background: '#fff', border: '1px solid #ccc', cursor: 'pointer', borderRadius: '4px' }}
            >
              Finish Early
            </button>
            {/* Timer turns red when under 5 minutes remaining */}
            <span style={{ fontWeight: 'bold', color: secondsLeft < 300 ? 'red' : '#333' }}>
              ⏱ {formatTime(secondsLeft)}
            </span>
          </div>
        </div>

        {loadingQuestion || !currentQuestion ? (
          <p style={{ color: '#888' }}>Generating question {currentIndex + 1}...</p>
        ) : currentQuestion.error ? (
          <div>
            <p style={{ color: 'red' }}>Failed to generate question. The AI service timed out.</p>
            <button onClick={() => {
              setQuestions(prev => { const u = [...prev]; u[currentIndex] = null; return u; });
              fetchQuestion(currentIndex);
            }}>
              Retry
            </button>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: '13px', color: '#0078d4', marginBottom: '4px' }}>
              {queue[currentIndex]?.label} — {currentQuestion.question_type === 'multi' ? 'Select TWO' : 'Select ONE'}
            </p>
            <p><strong>{currentQuestion.question}</strong></p>

            {currentQuestion.options.map((opt, i) => {
              const letter = opt[0];
              return (
                <div
                  key={i}
                  onClick={() => toggleOption(letter, currentQuestion.question_type)}
                  style={{
                    background: selected.includes(letter) ? '#d0e8ff' : '#f0f0f0',
                    padding: '10px',
                    marginBottom: '8px',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    border: selected.includes(letter) ? '1px solid #0078d4' : '1px solid transparent',
                  }}
                >
                  {opt}
                </div>
              );
            })}

            <button
              onClick={submitAndNext}
              disabled={selected.length === 0}
              style={{ marginTop: '8px', padding: '8px 20px' }}
            >
              {currentIndex + 1 === totalQuestions ? 'Finish Exam' : 'Next Question'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── Results screen ───────────────────────────────────────────────────────
  if (phase === 'results') {
    // Merge questions with user answers and correctness
    const scored = questions.map((q, i) => ({
      ...q,
      userAnswer: answers[i] || [],
      correct: isCorrect(answers[i] || [], q.answer),
    }));

    const totalCorrect = scored.filter(q => q.correct).length;
    const scorePercent = Math.round((totalCorrect / totalQuestions) * 100);
    const passed = scorePercent >= 70; // AI-102 passing threshold

    // Build per-topic stats for the domain breakdown table
    const topicStats = {};
    TOPICS.forEach(t => { topicStats[t.key] = { label: t.label, correct: 0, total: 0 }; });
    scored.forEach((q, i) => {
      const topicKey = queue[i]?.key;
      if (topicStats[topicKey]) {
        topicStats[topicKey].total += 1;
        if (q.correct) topicStats[topicKey].correct += 1;
      }
    });

    return (
      <div>
        {/* Summary */}
        <h2>Exam Complete</h2>
        <div style={{ display: 'flex', gap: '32px', marginBottom: '24px', alignItems: 'center' }}>
          <div style={{ fontSize: '48px', fontWeight: 'bold' }}>{scorePercent}%</div>
          <div>
            <div style={{
              display: 'inline-block',
              padding: '4px 12px',
              borderRadius: '4px',
              background: passed ? '#c8f7c5' : '#f7c5c5',
              fontWeight: 'bold',
              marginBottom: '8px',
            }}>
              {passed ? '✓ PASS' : '✗ FAIL'}
            </div>
            <div>{totalCorrect} / {totalQuestions} correct</div>
            <div style={{ color: '#888', fontSize: '13px' }}>
              Time used: {formatTime(timeUsed)} of {formatTime(timeLimitMinutes * 60)}
            </div>
          </div>
        </div>

        {/* Domain breakdown */}
        <h3>Domain Breakdown</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '32px' }}>
          <thead>
            <tr style={{ background: '#f0f0f0' }}>
              <th style={{ padding: '8px', textAlign: 'left' }}>Topic</th>
              <th style={{ padding: '8px', textAlign: 'center' }}>Score</th>
              <th style={{ padding: '8px', textAlign: 'center' }}>Result</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(topicStats).map(t => {
              const pct = t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0;
              return (
                <tr key={t.label} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px' }}>{t.label}</td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>{t.correct}/{t.total} ({pct}%)</td>
                  <td style={{ padding: '8px', textAlign: 'center', color: pct >= 70 ? 'green' : 'red' }}>
                    {t.total === 0 ? '—' : pct >= 70 ? '✓' : '✗ Review needed'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Full question review — green for correct answer, red for wrong user pick */}
        <h3>Question Review</h3>
        {scored.map((q, i) => (
          <div key={i} style={{ marginBottom: '16px', padding: '12px', border: '1px solid #eee', borderRadius: '4px' }}>
            <p style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
              Q{i + 1} · {queue[i]?.label}
            </p>
            <p><strong>{q.question}</strong></p>

            {q.options.map((opt, j) => {
              const letter = opt[0];
              const isUserAnswer = q.userAnswer.includes(letter);
              const isCorrectAnswer = q.answer.includes(letter);
              let bg = '#f9f9f9';
              if (isCorrectAnswer) bg = '#c8f7c5';
              else if (isUserAnswer) bg = '#f7c5c5';
              return (
                <div key={j} style={{ background: bg, padding: '8px', marginBottom: '4px', borderRadius: '4px', fontSize: '14px' }}>
                  {opt} {isCorrectAnswer && '✓'} {isUserAnswer && !isCorrectAnswer && '✗'}
                </div>
              );
            })}

            {/* Explanation collapsed by default — click to expand */}
            <details style={{ marginTop: '8px' }}>
              <summary style={{ cursor: 'pointer', fontSize: '13px', color: '#0078d4' }}>
                Explanation
              </summary>
              <p style={{ fontSize: '13px', marginTop: '8px' }}>{q.explanation}</p>
            </details>
          </div>
        ))}

        <button onClick={() => setPhase('config')} style={{ marginTop: '16px', padding: '8px 20px' }}>
          Start New Exam
        </button>
      </div>
    );
  }
}
