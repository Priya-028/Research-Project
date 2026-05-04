import React from 'react';

const ResponseDetails = ({ results, getScoreColor }) => {
  if (!results || results.length === 0) return null;

  return (
    <div className="detailed-responses-container" style={{ marginTop: '40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
        <div style={{ background: '#1e293b', padding: '12px', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          <i className="fas fa-list-check" style={{ color: '#fff', fontSize: '1.2rem' }} />
        </div>
        <div>
          <h3 style={{ margin: 0, color: '#1e293b', fontSize: '1.5rem', fontWeight: 800 }}>Detailed Question Analysis</h3>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.85rem' }}>Step-by-step semantic comparison of candidate responses</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {results.map((r) => {
          const scoreColor = getScoreColor(r.score);
          const isExcellent = r.score > 85;
          const isWarning = r.score < 50;
          
          // Split feedback into sections if it follows the new format
          const feedbackParts = (r.feedback || "").split('\n');
          const strengths = feedbackParts.find(p => p.includes('KEY STRENGTHS:'))?.replace('KEY STRENGTHS:', '').trim();
          const gaps = feedbackParts.find(p => p.includes('AREAS FOR IMPROVEMENT:'))?.replace('AREAS FOR IMPROVEMENT:', '').trim();

          return (
            <div key={r.question_number} className="response-card" style={{ 
               background: 'rgba(255, 255, 255, 0.8)', 
               backdropFilter: 'blur(20px)', 
               borderRadius: '28px', 
               padding: '36px', 
               boxShadow: '0 12px 40px -8px rgba(0,0,0,0.06)',
               border: '1px solid rgba(255, 255, 255, 0.5)',
               position: 'relative',
               overflow: 'hidden'
            }}>
              {/* Professional Tier Watermark */}
              <div style={{ 
                  position: 'absolute', 
                  top: '-10px', 
                  right: '-10px', 
                  fontSize: '5rem', 
                  fontWeight: 900, 
                  color: `${scoreColor}05`, 
                  pointerEvents: 'none',
                  textTransform: 'uppercase',
                  letterSpacing: '-2px'
              }}>
                 {r.tier}
              </div>

              {/* Question Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginBottom: '32px', position: 'relative' }}>
                <div style={{ display: 'flex', gap: '20px' }}>
                   <div style={{ 
                      minWidth: '54px', 
                      height: '54px', 
                      background: 'linear-gradient(135deg, #1e293b, #334155)', 
                      borderRadius: '18px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      fontSize: '1.4rem',
                      fontWeight: 900,
                      color: '#fff',
                      boxShadow: '0 6px 15px rgba(0,0,0,0.1)'
                   }}>
                      {r.question_number}
                   </div>
                   <div>
                      <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.1em' }}>PRECISION BENCHMARK</div>
                      <h4 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b', fontWeight: 700, lineHeight: 1.5, maxWidth: '600px' }}>{r.question}</h4>
                   </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
                   <div style={{ 
                      padding: '10px 18px', 
                      background: '#fff', 
                      border: `1.5px solid ${scoreColor}`,
                      color: scoreColor, 
                      borderRadius: '16px', 
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      boxShadow: `0 8px 20px ${scoreColor}15`
                   }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                         <span style={{ fontSize: '0.65rem', fontWeight: 800, opacity: 0.8, lineHeight: 1 }}>MATCH SCORE</span>
                         <span style={{ fontSize: '1.2rem', fontWeight: 900, lineHeight: 1.1 }}>{Math.round(r.score)}%</span>
                      </div>
                      <div style={{ width: '1px', height: '24px', background: `${scoreColor}44` }} />
                      <span style={{ fontSize: '0.75rem', fontWeight: 900, letterSpacing: '0.05em' }}>{r.tier}</span>
                   </div>
                </div>
              </div>

              {/* Answers Comparison */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '24px', marginBottom: '32px' }}>
                <div style={{ 
                   background: 'rgba(255, 255, 255, 0.9)', 
                   padding: '28px', 
                   borderRadius: '24px', 
                   border: '1px solid #e2e8f0',
                   boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
                     <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(79, 172, 254, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fas fa-user-pen" style={{ color: '#4facfe', fontSize: '0.9rem' }} />
                     </div>
                     <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Candidate Response</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '1rem', color: '#334155', lineHeight: 1.7, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                    {r.candidate_answer || <span style={{ fontStyle: 'italic', color: '#94a3b8' }}>No answer detected in audio transcript</span>}
                  </p>
                </div>

                <div style={{ 
                   background: 'rgba(15, 23, 42, 0.02)', 
                   padding: '28px', 
                   borderRadius: '24px', 
                   border: '1px solid rgba(15, 23, 42, 0.06)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
                     <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(15, 23, 42, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fas fa-sparkles" style={{ color: '#1e293b', fontSize: '0.9rem' }} />
                     </div>
                     <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Precision Target</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '1rem', color: '#475569', lineHeight: 1.7, fontWeight: 500, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                    {r.ideal_answer}
                  </p>
                </div>
              </div>

              {/* AI Diagnostic Summary */}
              {strengths && (
                <div style={{ 
                  background: 'linear-gradient(135deg, #f8faff 0%, #f1f5f9 100%)', 
                  padding: '24px 28px', 
                  borderRadius: '24px', 
                  border: '1px solid #e2e8f0'
                }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                      <i className="fas fa-brain" style={{ color: '#4facfe' }} />
                      <h5 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#1e293b', letterSpacing: '0.5px' }}>AI DIAGNOSTIC INSIGHT</h5>
                   </div>
                   <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                      <div style={{ display: 'flex', gap: '12px' }}>
                         <i className="fas fa-circle-check" style={{ color: '#10b981', marginTop: '4px' }} />
                         <div>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#059669', display: 'block', marginBottom: '4px' }}>STRENGTHS</span>
                            <p style={{ margin: 0, fontSize: '0.9rem', color: '#334155', lineHeight: 1.6 }}>{strengths}</p>
                         </div>
                      </div>
                      {gaps && (
                        <div style={{ display: 'flex', gap: '12px' }}>
                           <i className="fas fa-circle-xmark" style={{ color: '#ef4444', marginTop: '4px' }} />
                           <div>
                              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#dc2626', display: 'block', marginBottom: '4px' }}>TECHNICAL GAPS</span>
                              <p style={{ margin: 0, fontSize: '0.9rem', color: '#334155', lineHeight: 1.6 }}>{gaps}</p>
                           </div>
                        </div>
                      )}
                   </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ResponseDetails;
