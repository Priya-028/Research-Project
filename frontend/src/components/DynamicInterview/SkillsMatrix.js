import React from 'react';

const SkillsMatrix = ({ skills, results = [], getScoreColor }) => {
  const derivedSkills = Array.isArray(skills) && skills.length > 0
    ? skills
    : Object.values(
        (Array.isArray(results) ? results : []).reduce((acc, result) => {
          const skill = result.skill || 'General';
          const score = Number(result.score);
          if (!Number.isFinite(score)) return acc;

          if (!acc[skill]) {
            acc[skill] = { skill, scores: [], details: [] };
          }

          acc[skill].scores.push(score);
          acc[skill].details.push({
            question_number: result.question_number,
            score,
          });

          return acc;
        }, {})
      ).map((item) => ({
        skill: item.skill,
        score: Math.round((item.scores.reduce((sum, score) => sum + score, 0) / item.scores.length) * 100) / 100,
        details: item.details,
      }));

  if (!derivedSkills.length) return null;

  return (
    <div style={{ 
      marginBottom: '32px', 
      background: 'rgba(255, 255, 255, 0.7)', 
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderRadius: '28px', 
      padding: '40px', 
      boxShadow: '0 25px 50px -12px rgba(0,0,0,0.06)',
      border: '1px solid rgba(255, 255, 255, 0.5)',
      transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
         <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
               <div style={{ background: '#4f46e5', padding: '10px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.2)' }}>
                 <i className="fas fa-layer-group" style={{ color: '#fff', fontSize: '1.2rem' }} />
               </div>
               <h3 style={{ margin: 0, color: '#1e293b', fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.03em' }}>Technical Proficiency Matrix</h3>
            </div>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem', fontWeight: 500 }}>Multidimensional skills assessment extracted from candidate responses</p>
         </div>
         <div style={{ 
           padding: '8px 18px', 
           background: 'rgba(241, 245, 249, 0.9)', 
           borderRadius: '30px', 
           fontSize: '0.8rem', 
           fontWeight: 800, 
           color: '#475569',
           border: '1px solid rgba(226, 232, 240, 0.8)',
           boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
         }}>
           {derivedSkills.length} DIMENSIONS EVALUATED
         </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '28px' }}>
        {derivedSkills.map((sm, idx) => {
          const score = Math.max(0, Math.min(100, Number(sm.score) || 0));
          const color = getScoreColor(score);
          const level = score > 85 ? 'Expert' : score > 70 ? 'Strong' : score > 50 ? 'Developing' : 'Foundation';
          
          return (
            <div key={idx} style={{ 
              padding: '28px', 
              borderRadius: '20px', 
              background: 'rgba(255, 255, 255, 0.65)', 
              border: '1.5px solid rgba(255, 255, 255, 0.5)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              cursor: 'default',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.03)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.boxShadow = `0 10px 25px -5px ${color}15`;
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.95)';
              e.currentTarget.style.borderColor = `${color}44`;
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.03)';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.65)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
            }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <span style={{ fontWeight: 800, fontSize: '1rem', color: '#1e293b' }}>{sm.skill}</span>
                <div style={{ 
                  padding: '6px 12px', 
                  background: `${color}15`, 
                  color: color, 
                  borderRadius: '10px', 
                  fontSize: '0.9rem', 
                  fontWeight: 900,
                  boxShadow: `0 4px 10px ${color}08`
                }}>
                  {score}%
                </div>
              </div>

              <div style={{ height: '10px', background: 'rgba(0,0,0,0.04)', borderRadius: '5px', overflow: 'hidden', marginBottom: '18px' }}>
                <div 
                  style={{ 
                    height: '100%', 
                    width: `${score}%`, 
                    background: `linear-gradient(90deg, ${color}cc 0%, ${color} 100%)`, 
                    borderRadius: '5px',
                    boxShadow: `0 0 15px ${color}33`,
                    transition: 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1)'
                  }} 
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>{level} Proficiency</span>
                 </div>
                 <i className="fas fa-arrow-right" style={{ fontSize: '0.7rem', color: '#94a3b8', opacity: 0.5 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SkillsMatrix;
