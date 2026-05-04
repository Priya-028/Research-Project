import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import LiveAudioMeter from './DynamicInterview/LiveAudioMeter';

const API_BASE_URL = 'http://localhost:5004';

const CandidateInterview = () => {
  const { interviewId } = useParams();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [interview, setInterview] = useState(null);
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [candidatePhone, setCandidatePhone] = useState('');
  const [answers, setAnswers] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const [proctoringLogs, setProctoringLogs] = useState([]);

  // Recording states
  const [, setIsRecording] = useState(false);
  const [activeMicIndex, setActiveMicIndex] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioMetrics, setAudioMetrics] = useState({
    total_duration: 0,
    responses: []
  });

  // VoiceBot states
  const [isVoiceBotEnabled, setIsVoiceBotEnabled] = useState(false);
  const [currentBotIndex, setCurrentBotIndex] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcribingIndex, setTranscribingIndex] = useState(null);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const speechRef = useRef(null);

  // Stop any active speech on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  const speakQuestion = (text) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
    speechRef.current = utterance;
  };

  const canSubmit = useMemo(() => {
    if (!interview || !Array.isArray(interview.questions)) return false;
    if (!candidateName.trim() || !candidateEmail.trim() || !candidatePhone.trim()) return false;
    return answers.some((a) => a && a.trim() !== '');
  }, [answers, candidateName, candidateEmail, candidatePhone, interview]);

  useEffect(() => {
    const load = async () => {
      if (!interviewId) return;
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE_URL}/api/interviews/${encodeURIComponent(interviewId)}`);
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to load interview');
        }
        setInterview(data.interview);
        setAnswers((data.interview.questions || []).map(() => ''));
      } catch (e) {
        setError(e.message || 'Failed to load interview');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [interviewId]);

  useEffect(() => {
    if (submitted) return;

    const logEvent = (type) => {
      setProctoringLogs(prev => [
        ...prev, 
        { type, timestamp: new Date().toISOString() }
      ]);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        logEvent('TAB_SWITCH');
      }
    };

    const handleBlur = () => logEvent('WINDOW_BLUR');

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [submitted]);

  const handlePaste = (e) => {
    setProctoringLogs(prev => [
      ...prev,
      { type: 'PASTE_ATTEMPT', timestamp: new Date().toISOString() }
    ]);
  };

  const handleAnswerChange = (index, value) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const startRecording = async (index) => {
    if (activeMicIndex !== null) {
      stopRecording();
      // Brief delay to allow the previous recorder to stop
      await new Promise(r => setTimeout(r, 100));
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      recorderRef.current = recorder;
      
      const chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      
      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const duration = (Date.now() - startTimeRef.current) / 1000;
        processAudio(index, audioBlob, duration);
      };

      startTimeRef.current = Date.now();
      recorder.start();
      setIsRecording(true);
      setActiveMicIndex(index);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error('Error starting recording:', err);
      alert('Could not access microphone. Please ensure permissions are granted.');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      clearInterval(timerRef.current);
      setIsRecording(false);
      setActiveMicIndex(null);
    }
  };

  const processAudio = async (index, blob, duration) => {
    setTranscribingIndex(index);
    const formData = new FormData();
    formData.append('audio', blob);
    formData.append('duration', duration);

    try {
      const res = await fetch(`${API_BASE_URL}/api/transcribe-audio`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setAnswers(prev => {
          const next = [...prev];
          const currentText = (next[index] || '').trim();
          next[index] = currentText ? `${currentText} ${data.text}` : data.text;
          return next;
        });
        
        const newMetric = {
          index,
          wpm: data.metrics.wpm,
          confidence: data.metrics.confidence,
          duration: data.metrics.duration,
          hesitations: data.metrics.hesitations,
          pauses: data.metrics.pauses
        };

        setAudioMetrics(prev => ({
          total_duration: prev.total_duration + duration,
          responses: [...prev.responses, newMetric]
        }));
      }
    } catch (err) {
      console.error('Transcription error:', err);
    } finally {
      setTranscribingIndex(null);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/interviews/${encodeURIComponent(interviewId)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_name: candidateName,
          candidate_email: candidateEmail,
          candidate_phone: candidatePhone,
          answers,
          audio_metrics: audioMetrics,
          proctoring_logs: proctoringLogs
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Submission failed');
      }
      setEvaluation(data);
      setSubmitted(true);
    } catch (e) {
      setError(e.message || 'Submission failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="candidate-page">
      <style>{`
        @keyframes recordingPulse {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        @keyframes botPulse {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(79, 172, 254, 0.4); }
          70% { transform: scale(1.05); box-shadow: 0 0 0 15px rgba(79, 172, 254, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(79, 172, 254, 0); }
        }
        @keyframes avatarSpeaking {
          0%, 100% { border-radius: 50%; transform: scale(1); }
          50% { border-radius: 40% 60% 50% 50%; transform: scale(1.05); }
        }
      `}</style>
      <div className="candidate-shell">
        <header className="candidate-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="candidate-title">Answer the Questions</div>
            <div className="candidate-subtitle">
              Voice recording is enabled. You can type or use the microphone to speak your answers.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
             <button 
               onClick={() => {
                 setIsVoiceBotEnabled(!isVoiceBotEnabled);
                 if (!isVoiceBotEnabled && (interview?.questions || [])[currentBotIndex]) {
                   speakQuestion(interview.questions[currentBotIndex]);
                 } else {
                   window.speechSynthesis.cancel();
                 }
               }}
               style={{
                 padding: '8px 16px',
                 background: isVoiceBotEnabled ? 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' : 'rgba(15, 23, 42, 0.05)',
                 color: isVoiceBotEnabled ? '#fff' : '#1e293b',
                 border: '1px solid rgba(15, 23, 42, 0.1)',
                 borderRadius: '12px',
                 fontSize: '0.85rem',
                 fontWeight: 800,
                 cursor: 'pointer',
                 display: 'flex',
                 alignItems: 'center',
                 gap: '8px',
                 transition: 'all 0.3s ease'
               }}
             >
               <i className={`fas ${isVoiceBotEnabled ? 'fa-robot' : 'fa-comment-alt'}`} />
               {isVoiceBotEnabled ? 'Disable Voice Assistant' : 'Enable AI Voice Assistant'}
             </button>
             <div className="candidate-badge"><i className="fas fa-lock" style={{ marginRight: 6 }} /> Secure Link</div>
          </div>
        </header>

        <main className="candidate-body">
          {error && (
            <div className="candidate-alert candidate-alert-error">
              <i className="fas fa-exclamation-circle" />
              <div>
                <strong>Something went wrong</strong>
                <p>{error}</p>
              </div>
            </div>
          )}

          {loading && !interview && (
            <div className="candidate-card candidate-loading">
              <div className="candidate-spinner" />
              <h3>Loading your interview</h3>
              <p>Preparing your questions…</p>
            </div>
          )}

          {interview && !submitted && (
            <>
              <div className="candidate-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '15px' }}>
                  <span><i className="fas fa-briefcase" /> {interview.role}</span>
                  <span><i className="fas fa-list-ol" /> {(interview.questions || []).length} questions</span>
                </div>
                <div style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: '500' }}>
                   {answers.filter(a => a.trim() !== '').length} of {interview.questions.length} Completed
                </div>
              </div>

              <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', margin: '15px 0 30px', overflow: 'hidden' }}>
                <div 
                  style={{ 
                    height: '100%', 
                    width: `${(answers.filter(a => a.trim() !== '').length / (interview.questions || []).length) * 100}%`, 
                    background: 'linear-gradient(90deg, #4facfe 0%, #00f2fe 100%)',
                    transition: 'width 0.4s ease'
                  }} 
                />
              </div>

              <section className="candidate-card candidate-info-card" style={{ marginBottom: '30px' }}>
                <h3>Contact Information</h3>
                <div className="candidate-form-grid">
                  <div className="candidate-form-field">
                    <label>Full Name <span className="required">*</span></label>
                    <input type="text" value={candidateName} onChange={(e) => setCandidateName(e.target.value)} placeholder="Full Name" />
                  </div>
                  <div className="candidate-form-field">
                    <label>Email <span className="required">*</span></label>
                    <input type="email" value={candidateEmail} onChange={(e) => setCandidateEmail(e.target.value)} placeholder="email@address.com" />
                  </div>
                  <div className="candidate-form-field">
                    <label>Phone <span className="required">*</span></label>
                    <input type="tel" value={candidatePhone} onChange={(e) => setCandidatePhone(e.target.value)} placeholder="+1..." />
                  </div>
                </div>
              </section>

              <section>
                {isVoiceBotEnabled ? (
                  <div className="bot-interview-container" style={{ textAlign: 'center', padding: '20px 0' }}>
                    <div style={{ 
                      width: '100px', 
                      height: '100px', 
                      background: 'linear-gradient(135deg, #1e293b, #334155)', 
                      margin: '0 auto 30px', 
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '2.5rem',
                      color: isSpeaking ? '#4facfe' : '#fff',
                      animation: isSpeaking ? 'botPulse 1.5s infinite, avatarSpeaking 3s infinite' : 'none',
                      border: '4px solid rgba(79, 172, 254, 0.1)',
                      boxShadow: isSpeaking ? '0 0 25px rgba(79, 172, 254, 0.3)' : 'none',
                      transition: 'all 0.3s ease'
                    }}>
                       <i className="fas fa-robot" />
                    </div>

                    <div className="candidate-card" style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'left' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>
                           Question {currentBotIndex + 1} of {interview.questions.length}
                        </span>
                        <button 
                          onClick={() => speakQuestion(interview.questions[currentBotIndex])}
                          style={{ background: 'none', border: 'none', color: '#4facfe', cursor: 'pointer', fontSize: '1.2rem' }}
                        >
                           <i className={`fas ${isSpeaking ? 'fa-volume-up' : 'fa-play-circle'}`} />
                        </button>
                      </div>
                      <div className="candidate-question-text" 
                        onCopy={(e) => e.preventDefault()}
                        style={{ 
                          fontSize: '1.4rem', 
                          color: '#1e293b', 
                          fontWeight: 800, 
                          lineHeight: 1.5, 
                          marginBottom: '40px',
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          msUserSelect: 'none'
                        }}
                      >
                         {interview.questions[currentBotIndex]}
                      </div>

                      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'flex-start' }}>
                        <button
                          className="candidate-mic-btn"
                          onClick={() => activeMicIndex === currentBotIndex ? stopRecording() : startRecording(currentBotIndex)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '12px 24px',
                            borderRadius: '14px',
                            border: activeMicIndex === currentBotIndex ? '1px solid #ef4444' : '1px solid #cbd5e1',
                            background: activeMicIndex === currentBotIndex ? 'rgba(239, 68, 68, 0.1)' : '#f8fafc',
                            color: activeMicIndex === currentBotIndex ? '#ef4444' : '#334155',
                            cursor: 'pointer',
                            fontWeight: 700,
                            animation: activeMicIndex === currentBotIndex ? 'recordingPulse 2s infinite' : 'none'
                          }}
                        >
                           {activeMicIndex === currentBotIndex ? (
                             <><i className="fas fa-stop-circle" /> Stop Thinking ({recordingTime}s)</>
                           ) : (
                             <><i className="fas fa-microphone" /> Speak Your Answer</>
                           )}
                        </button>
                      </div>

                      <textarea
                        value={transcribingIndex === currentBotIndex ? 'AI is interpreting your response...' : (answers[currentBotIndex] || '')}
                        onChange={(e) => handleAnswerChange(currentBotIndex, e.target.value)}
                        placeholder="Speak or type your answer here…"
                        rows="6"
                        disabled={transcribingIndex === currentBotIndex}
                        style={{ 
                          width: '100%', 
                          padding: '20px', 
                          borderRadius: '16px', 
                          border: transcribingIndex === currentBotIndex ? '1.5px solid #4facfe' : '1.5px solid #e2e8f0', 
                          fontSize: '1rem', 
                          background: transcribingIndex === currentBotIndex ? 'rgba(79, 172, 254, 0.02)' : '#fff', 
                          outline: 'none',
                          color: transcribingIndex === currentBotIndex ? '#4facfe' : '#1e293b'
                        }}
                      />

                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '30px' }}>
                        <button
                          onClick={() => {
                            if (currentBotIndex > 0) {
                              const newIdx = currentBotIndex - 1;
                              setCurrentBotIndex(newIdx);
                              speakQuestion(interview.questions[newIdx]);
                            }
                          }}
                          disabled={currentBotIndex === 0}
                          style={{ opacity: currentBotIndex === 0 ? 0.3 : 1, padding: '10px 20px', background: 'none', border: '1px solid #cbd5e1', borderRadius: '10px', cursor: 'pointer' }}
                        >
                           <i className="fas fa-chevron-left" /> Previous
                        </button>
                        
                        {currentBotIndex < interview.questions.length - 1 ? (
                          <button
                            onClick={() => {
                              const newIdx = currentBotIndex + 1;
                              setCurrentBotIndex(newIdx);
                              speakQuestion(interview.questions[newIdx]);
                            }}
                            style={{ padding: '10px 30px', background: '#1e293b', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}
                          >
                             Next Question <i className="fas fa-chevron-right" style={{ marginLeft: 6 }} />
                          </button>
                        ) : (
                           <button className="candidate-submit-btn" onClick={handleSubmit} disabled={loading || !canSubmit}>
                             {loading ? 'Submitting...' : 'Complete Interview'}
                           </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {(interview.questions || []).map((question, idx) => (
                      <article key={idx} className="candidate-question-box">
                        <div className="candidate-question-meta">
                          <div className="candidate-question-pill">Question {idx + 1}</div>
                          <div className="candidate-mic-wrapper">
                            <button
                              className="candidate-mic-btn"
                              onClick={() => activeMicIndex === idx ? stopRecording() : startRecording(idx)}
                              title="Click to speak your answer"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 16px',
                                borderRadius: '12px',
                                border: activeMicIndex === idx ? '1px solid #ef4444' : '1px solid #cbd5e1',
                                background: activeMicIndex === idx ? 'rgba(239, 68, 68, 0.1)' : '#f8fafc',
                                color: activeMicIndex === idx ? '#ef4444' : '#334155',
                                cursor: 'pointer',
                                fontWeight: 600,
                                transition: 'all 0.2s ease',
                                animation: activeMicIndex === idx ? 'recordingPulse 2s infinite' : 'none'
                              }}
                            >
                              {activeMicIndex === idx ? (
                                <><i className="fas fa-stop" /> Stop {recordingTime}s</>
                              ) : (
                                <><i className="fas fa-microphone" /> Speak Answer</>
                              )}
                            </button>
                          </div>
                        </div>
                        <div className="candidate-question-text" 
                          onCopy={(e) => e.preventDefault()}
                          style={{ userSelect: 'none', WebkitUserSelect: 'none', msUserSelect: 'none' }}
                        >{question}</div>
                        <div className="candidate-answer-area">
                          <textarea
                            value={transcribingIndex === idx ? 'Interpretation in progress...' : (answers[idx] || '')}
                            onChange={(e) => handleAnswerChange(idx, e.target.value)}
                            placeholder="Speak or type your answer here…"
                            rows="4"
                            disabled={transcribingIndex === idx}
                            style={{
                              width: '100%',
                              padding: '15px',
                              borderRadius: '12px',
                              border: transcribingIndex === idx ? '1px solid #4facfe' : '1px solid #e2e8f0',
                              fontSize: '1rem',
                              background: transcribingIndex === idx ? 'rgba(79, 172, 254, 0.05)' : '#fff',
                              color: transcribingIndex === idx ? '#4facfe' : 'inherit'
                            }}
                          />
                        </div>
                      </article>
                    ))}
                    <div className="candidate-actions" style={{ marginTop: '40px' }}>
                      <button className="candidate-submit-btn" onClick={handleSubmit} disabled={loading || !canSubmit}>
                        {loading ? 'Submitting...' : 'Submit Records'}
                      </button>
                    </div>
                  </>
                )}
              </section>
            </>
          )}

          {submitted && evaluation && (
            <section className="candidate-results-overlay" style={{ padding: '60px 20px', animation: 'fadeIn 0.8s ease-out' }}>
              <div className="candidate-card-primary" style={{ 
                maxWidth: '1000px', 
                margin: '0 auto', 
                padding: '50px', 
                textAlign: 'center',
                background: 'rgba(255, 255, 255, 0.9)',
                backdropFilter: 'blur(20px)',
                borderRadius: '32px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.5)'
              }}>
                <div style={{ 
                  width: '80px', 
                  height: '80px', 
                  background: '#10b981', 
                  borderRadius: '50%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  margin: '0 auto 30px',
                  boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)',
                  fontSize: '2.5rem',
                  color: '#fff'
                }}>
                   <i className="fas fa-check" />
                </div>
                
                <h2 style={{ color: '#1e293b', fontSize: '2.2rem', fontWeight: 900, marginBottom: '12px' }}>Assessment Successfully Transmitted</h2>
                <p style={{ color: '#64748b', fontSize: '1.2rem', maxWidth: '700px', margin: '0 auto 50px', lineHeight: 1.6 }}>
                  Your technical proficiency has been securely recorded. Our AI analysis engine is now generating a comparative evaluation for internal review.
                </p>

                <div style={{ 
                  marginTop: '40px', 
                  padding: '40px', 
                  background: 'rgba(15, 23, 42, 0.02)', 
                  borderRadius: '24px', 
                  textAlign: 'left',
                  border: '1px solid rgba(15, 23, 42, 0.05)'
                }}>
                   <h3 style={{ margin: '0 0 32px 0', fontSize: '1.4rem', fontWeight: 800, color: '#1e293b' }}>
                      What Happens Next?
                   </h3>
                   <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '32px' }}>
                      {[
                        { step: 1, title: 'AI Validation', desc: 'Our engine will cross-reference your answers with role specific KPIs.', icon: 'fa-brain' },
                        { step: 2, title: 'Human Review', desc: 'A senior recruiter will review the analytical highlights of your session.', icon: 'fa-user-tie' },
                        { step: 3, title: 'Final Update', desc: 'Expect a formal update via your registered email within 3-5 days.', icon: 'fa-envelope-open-text' }
                      ].map((item, i) => (
                        <div key={i} style={{ position: 'relative' }}>
                           <div style={{ fontSize: '2rem', color: 'rgba(15, 23, 42, 0.05)', fontWeight: 900, position: 'absolute', top: '-15px', right: 0 }}>
                              0{item.step}
                           </div>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                              <i className={`fas ${item.icon}`} style={{ color: '#4facfe' }} />
                              <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>{item.title}</h4>
                           </div>
                           <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b', lineHeight: 1.6 }}>{item.desc}</p>
                        </div>
                      ))}
                   </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', textAlign: 'left', marginTop: '60px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <i className="fas fa-chart-line" style={{ color: '#4facfe', fontSize: '1.4rem' }} />
                    <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#1e293b' }}>Comparative Performance Summary</h3>
                  </div>

                  {(evaluation.results || []).map((res, i) => (
                    <div key={i} style={{ background: 'rgba(15, 23, 42, 0.02)', borderRadius: '24px', padding: '32px', border: '1px solid rgba(15, 23, 42, 0.05)', marginBottom: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                           <span style={{ width: '36px', height: '36px', background: 'linear-gradient(135deg, #1e293b, #334155)', color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>{i + 1}</span>
                           <h4 style={{ margin: 0, color: '#1e293b', fontSize: '1.2rem', fontWeight: 800 }}>{res.question}</h4>
                        </div>
                        <div style={{ padding: '4px 12px', background: 'rgba(79, 172, 254, 0.1)', color: '#4facfe', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Technical Match</div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                        <div style={{ background: '#fff', padding: '24px', borderRadius: '20px', border: '1px solid rgba(79, 172, 254, 0.2)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#4facfe' }}>
                             <i className="fas fa-user-circle" />
                             <span style={{ fontSize: '0.8rem', fontWeight: 800 }}>YOUR RESPONSE</span>
                          </div>
                          <p style={{ margin: 0, fontSize: '0.95rem', color: '#475569', lineHeight: 1.7, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{res.candidate_answer || 'No response.'}</p>
                        </div>
                        <div style={{ background: 'rgba(16, 185, 129, 0.03)', padding: '24px', borderRadius: '20px', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#10b981' }}>
                             <i className="fas fa-sparkles" />
                             <span style={{ fontSize: '0.8rem', fontWeight: 800 }}>IDEAL BENCHMARK</span>
                          </div>
                          <p style={{ margin: 0, fontSize: '0.95rem', color: '#475569', lineHeight: 1.7, fontWeight: 500, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{res.ideal_answer}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '60px', padding: '20px', background: 'rgba(15, 23, 42, 0.03)', borderRadius: '16px', color: '#64748b', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                   <i className="fas fa-shield-check" style={{ color: '#10b981' }} />
                   <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>Secure session closed. No further action is required.</p>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};

export default CandidateInterview;
