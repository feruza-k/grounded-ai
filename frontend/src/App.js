import { useState } from 'react';
import QA from './QA';
import Practice from './Practice';
import Exam from './Exam';

export default function App() {
  const [tab, setTab] = useState('qa');

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', fontFamily: 'sans-serif', padding: '0 20px'}}>
      <h1>Grounded AI — Azure AI-102 Prep</h1>

      <div style={{ marginBottom: '24px',borderBottom: '2px solid #eee', paddingBottom: '12px'}}>
      {['qa', 'practice', 'exam'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              marginRight: '12px',
              fontWeight: tab === t ? 'bold' :'normal',
              borderBottom: tab === t ? '2px solid #0078d4' : 'none',
              background: 'none',
              border: 'none',
              cursor: 'pointer', 
              fontSize: '16px',
              paddingBottom: '4px',
            }}
          >
            {t === 'qa' ? 'Q&A' : t === 'practice' ? 'Practice' : 'Exam'}
          </button>
        ))}
      </div>

      {tab === 'qa' && <QA />}
      {tab === 'practice' && <Practice />}
      {tab === 'exam' && <Exam />}
    </div>
  );
}