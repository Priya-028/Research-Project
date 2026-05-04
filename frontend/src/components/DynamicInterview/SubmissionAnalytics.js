import React from 'react';

const SubmissionAnalytics = ({ selectedSubmission, getConsistencyColor, getScoreColor }) => {
  if (!selectedSubmission) return null;

  const antiCheat = selectedSubmission.anti_cheat || {};
  const metrics = antiCheat.metrics || {};
  const audio = selectedSubmission.audio_metrics || {};
  const audioResponses = audio.responses || [];
  
  const avgWPM = audioResponses.length > 0 
    ? Math.round(audioResponses.reduce((acc, r) => acc + (r.wpm || 0), 0) / audioResponses.length)
    : 0;

  const avgConfidence = audioResponses.length > 0 
    ? Math.round(audioResponses.reduce((acc, r) => acc + (r.confidence || 0), 0) / audioResponses.length)
    : 0;

  const totalHesitations = audioResponses.reduce((acc, r) => acc + (r.hesitations || 0), 0);
  const totalPauses = audioResponses.reduce((acc, r) => acc + (r.pauses || 0), 0);

  const integrityScore = antiCheat.score || 1;
  const statusLabel = integrityScore > 0.8 ? 'SECURE' : integrityScore > 0.5 ? 'CAUTION' : 'FLAGGED';
  const statusColor = getConsistencyColor(integrityScore);

  return (
    <div className="analytics-row" style={{ display: 'flex', gap: '28px', marginBottom: '40px', flexWrap: 'wrap' }}>
      
      {/* Recruitment Integrity Card */}
      <div className="analytics-card" style={{ 
        flex: '1.4',
        minWidth: '360px',
        background: 'rgba(255, 255, 255, 0.85)', 
        backdropFilter: 'blur(24px)',
        borderRadius: '32px',
        boxShadow: '0 20px 50px -12px rgba(0, 0, 0, 0.08)', 
        padding: '36px',
        border: '1px solid rgba(255, 255, 255, 0.6)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Abstract Background Decor */}
        <div style={{ 
          position: 'absolute', 
          top: '-40px', 
          right: '-40px', 
          width: '180px', 
          height: '180px', 
          background: `radial-gradient(circle, ${statusColor}15 0%, transparent 70%)`, 
          borderRadius: '50%',
          zIndex: 0
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
            <div style={{ 
              background: 'linear-gradient(135deg, #1e293b, #334155)', 
              width: '52px', 
              height: '52px', 
              borderRadius: '16px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              boxShadow: '0 8px 16px rgba(0,0,0,0.1)'
            }}>
              <i className="fas fa-shield-halved" style={{ color: '#fff', fontSize: '1.4rem' }} />
            </div>
            <div>
               <h4 style={{ margin: 0, fontSize: '1.3rem', color: '#1e293b', fontWeight: 900 }}>Recruitment Integrity</h4>
               <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>AI Behavioral Consistency Index</span>
            </div>
          </div>

          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            gap: '24px', 
            padding: '24px', 
            background: 'rgba(255,255,255,0.9)', 
            borderRadius: '24px', 
            border: `1px solid ${statusColor}44`, 
            marginBottom: '32px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.02)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
               <div style={{ 
                  width: '68px', 
                  height: '68px', 
                  borderRadius: '50%', 
                  background: '#fff',
                  border: `4px solid ${statusColor}`, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  fontSize: '1.15rem',
                  fontWeight: 900,
                  color: statusColor,
                  boxShadow: `0 0 20px ${statusColor}22`
               }}>
                  {Math.round(integrityScore * 100)}%
               </div>
               <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <span style={{ 
                      fontWeight: 900, 
                      color: '#fff', 
                      fontSize: '0.65rem', 
                      padding: '4px 10px', 
                      background: statusColor, 
                      borderRadius: '8px',
                      letterSpacing: '0.05em'
                    }}>{statusLabel}</span>
                    <span style={{ color: '#1e293b', fontWeight: 800, fontSize: '1.1rem' }}>Security Index</span>
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#64748b', lineHeight: 1.4 }}>{antiCheat.message}</div>
               </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
             {[
               { label: 'Vocabulary', val: `${Math.round((metrics.avg_richness || 0) * 100)}%`, icon: 'fa-signature', color: '#6366f1' },
               { label: 'Variance', val: metrics.variances?.sent_len_var || 0, icon: 'fa-wave-square', color: '#0ea5e9' },
               { label: 'Hesitations', val: totalHesitations, icon: 'fa-microphone-slash', color: '#f59e0b' },
               { label: 'Avg Pace', val: `${avgWPM} WPM`, icon: 'fa-bolt-lightning', color: '#10b981' }
             ].map((m, i) => (
               <div key={i} style={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  gap: '8px', 
                  padding: '16px', 
                  background: 'rgba(248, 250, 252, 1)', 
                  borderRadius: '16px', 
                  border: '1px solid #f1f5f9',
                  transition: 'transform 0.2s ease'
               }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className={`fas ${m.icon}`} style={{ color: m.color, fontSize: '0.8rem' }} />
                    <span style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{m.label}</span>
                  </div>
                  <div style={{ color: '#1e293b', fontWeight: 900, fontSize: '1.1rem' }}>{m.val}</div>
               </div>
             ))}
          </div>
        </div>
      </div>

      {/* Speech Quality Card */}
      <div className="analytics-card" style={{ 
        flex: '1',
        minWidth: '320px',
        background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)', 
        borderRadius: '32px',
        padding: '36px',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(30, 27, 75, 0.3)',
        border: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
         {/* Glow Effect */}
         <div style={{ position: 'absolute', top: '-20%', right: '-20%', width: '150px', height: '150px', background: 'rgba(79, 172, 254, 0.15)', filter: 'blur(50px)', borderRadius: '50%' }} />

         <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '36px', position: 'relative' }}>
             <div style={{ background: 'rgba(255,255,255,0.1)', width: '52px', height: '52px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
               <i className="fas fa-waveform-lines" style={{ color: '#4facfe', fontSize: '1.4rem' }} />
             </div>
             <div>
                <h4 style={{ margin: 0, fontSize: '1.3rem', color: '#fff', fontWeight: 900 }}>Speech Quality</h4>
                <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 500 }}>Vocal Confidence Analysis</span>
             </div>
         </div>
         
         <div style={{ marginBottom: '40px', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '16px' }}>
               <div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.5px' }}>Average Pace</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                     <span style={{ fontSize: '3.5rem', fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-1px' }}>{avgWPM}</span>
                     <span style={{ fontSize: '1rem', color: '#4facfe', fontWeight: 700 }}>WPM</span>
                  </div>
               </div>
               <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#00f2fe' }}>{avgConfidence}%</div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 800, letterSpacing: '0.5px' }}>CONFIDENCE</div>
               </div>
            </div>
            
            <div style={{ height: '12px', background: 'rgba(255,255,255,0.08)', borderRadius: '6px', overflow: 'hidden' }}>
               <div 
                 style={{ 
                   width: `${Math.min(100, (avgWPM / 180) * 100)}%`, 
                   height: '100%', 
                   background: 'linear-gradient(90deg, #4facfe 0%, #00f2fe 100%)',
                   boxShadow: '0 0 20px rgba(0, 242, 254, 0.4)',
                   transition: 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1)'
                 }} 
               />
            </div>
         </div>

         <div style={{ 
           background: 'rgba(255,255,255,0.04)', 
           padding: '24px', 
           borderRadius: '24px', 
           border: '1px solid rgba(255,255,255,0.06)',
           marginTop: 'auto',
           position: 'relative'
         }}>
            <div style={{ fontSize: '0.95rem', color: '#cbd5e1', lineHeight: '1.7' }}>
               Voice analysis confirms a <strong>{avgConfidence > 80 ? 'Authoritative' : avgConfidence > 60 ? 'Professional' : 'Hesitant'}</strong> delivery profile with <strong>{totalPauses}</strong> tactical pauses detected.
            </div>
            <div style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
               <span style={{ fontSize: '0.65rem', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '5px 12px', borderRadius: '30px', fontWeight: 900, letterSpacing: '0.5px' }}>NATURAL PACE</span>
               <span style={{ fontSize: '0.65rem', background: 'rgba(14, 165, 233, 0.15)', color: '#0ea5e9', padding: '5px 12px', borderRadius: '30px', fontWeight: 900, letterSpacing: '0.5px' }}>{totalHesitations < 3 ? 'FLUID DICTION' : 'MODERATE FLOW'}</span>
            </div>
         </div>
      </div>

      {/* Proctoring Intelligence Card */}
      <div className="analytics-card" style={{ 
        flex: '1',
        minWidth: '320px',
        background: 'rgba(255, 255, 255, 0.85)', 
        backdropFilter: 'blur(24px)',
        borderRadius: '32px',
        padding: '36px',
        border: '1px solid rgba(255, 255, 255, 0.6)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 50px -12px rgba(0, 0, 0, 0.08)'
      }}>
         <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '32px' }}>
             <div style={{ background: '#1e293b', width: '52px', height: '52px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
               <i className="fas fa-user-shield" style={{ color: '#fff', fontSize: '1.4rem' }} />
             </div>
             <div>
                <h4 style={{ margin: 0, fontSize: '1.3rem', color: '#1e293b', fontWeight: 900 }}>Proctoring</h4>
                <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>Anti-Cheat Behavioral Logic</span>
             </div>
         </div>

         <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {[
              { 
                label: 'Tab Switching', 
                count: selectedSubmission.proctoring_logs?.filter(l => l.type === 'TAB_SWITCH').length || 0,
                icon: 'fa-arrow-up-right-from-square',
                threshold: 1,
                warningColor: '#f59e0b'
              },
              { 
                label: 'Window Blur', 
                count: selectedSubmission.proctoring_logs?.filter(l => l.type === 'WINDOW_BLUR').length || 0,
                icon: 'fa-up-right-and-down-left-from-center',
                threshold: 2,
                warningColor: '#64748b'
              },
              { 
                label: 'Paste Attempts', 
                count: selectedSubmission.proctoring_logs?.filter(l => l.type === 'PASTE_ATTEMPT').length || 0,
                icon: 'fa-copy',
                threshold: 0,
                warningColor: '#ef4444'
              }
            ].map((p, i) => {
              const isFlagged = p.count > p.threshold;
              return (
                <div key={i} style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '18px',
                  background: isFlagged ? `${p.warningColor}08` : '#f8fafc',
                  border: `1px solid ${isFlagged ? `${p.warningColor}33` : '#f1f5f9'}`,
                  borderRadius: '20px',
                  transition: 'all 0.3s ease'
                }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <i className={`fas ${p.icon}`} style={{ color: isFlagged ? p.warningColor : '#94a3b8', fontSize: '1rem' }} />
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#475569' }}>{p.label}</span>
                   </div>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '1.2rem', fontWeight: 900, color: isFlagged ? p.warningColor : '#1e293b' }}>{p.count}</span>
                      {isFlagged && <i className="fas fa-triangle-exclamation" style={{ color: p.warningColor, fontSize: '0.85rem' }} />}
                   </div>
                </div>
              );
            })}
         </div>

         {selectedSubmission.proctoring_logs?.length > 0 && (
           <div style={{ marginTop: 'auto', paddingTop: '24px' }}>
              <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.04)', borderRadius: '16px', border: '1px dashed rgba(239, 68, 68, 0.2)' }}>
                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#b91c1c', fontWeight: 700, lineHeight: 1.5 }}>
                    ALERT: Behavioral anomalies detected. Review logs for external assistance or browser manipulations.
                 </p>
              </div>
           </div>
         )}
      </div>
    </div>
  );
};

export default SubmissionAnalytics;
