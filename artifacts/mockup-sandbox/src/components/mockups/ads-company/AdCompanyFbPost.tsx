import React from 'react';

const AdCompanyFbPost = () => {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', backgroundColor: '#0a1628', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <img 
        src="/__mockup/images/ad-company-fbpost.png" 
        alt="Security Guard Company Background" 
        style={{ position: 'absolute', inset: 0, objectFit: 'cover', width: '100%', height: '100%' }} 
      />
      
      {/* Heavy dark overlay on bottom 60% */}
      <div 
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to top, rgba(10,22,40,0.98) 0%, rgba(0,0,0,0.0) 55%)',
          pointerEvents: 'none'
        }}
      />
      
      {/* Content wrapper */}
      <div style={{ 
        position: 'absolute', 
        inset: 0, 
        display: 'flex', 
        flexDirection: 'column', 
        padding: '5vw 4.5vw',
        zIndex: 10
      }}>
        
        {/* Brand */}
        <div style={{ 
          color: '#C9A84C', 
          fontSize: '1.8vw', 
          fontWeight: 700, 
          letterSpacing: '0.15em', 
          textTransform: 'uppercase',
          textShadow: '0 2px 4px rgba(0,0,0,0.5)'
        }}>
          CoAIleague
        </div>
        
        {/* Spacer to push content to bottom */}
        <div style={{ flex: 1 }} />
        
        {/* Main Content */}
        <div style={{ paddingBottom: '1vw' }}>
          <h1 style={{ 
            color: 'white', 
            fontSize: '7vw', 
            fontWeight: 900, 
            marginBottom: '2vw',
            lineHeight: 1.05,
            margin: '0 0 2vw 0',
            letterSpacing: '-0.02em',
            maxWidth: '95%'
          }}>
            Your Payroll Is Your Biggest Cost.
          </h1>
          
          <p style={{ 
            color: 'white', 
            fontSize: '2.8vw', 
            opacity: 0.85, 
            lineHeight: 1.5, 
            margin: '0 0 3.5vw 0',
            maxWidth: '85%',
            fontWeight: 400
          }}>
            Most security companies are overpaying by $4-12/employee. CoAIleague processes for as low as $3.50.
          </p>
          
          {/* Stats Bar */}
          <div style={{ 
            display: 'flex', 
            flexDirection: 'row', 
            justifyContent: 'space-between',
            gap: '2.5vw',
            width: '100%'
          }}>
            {/* Stat 1 */}
            <div style={{ 
              flex: 1, 
              border: '1px solid #C9A84C', 
              padding: '1.5vw', 
              textAlign: 'center',
              backgroundColor: 'rgba(10,22,40,0.6)',
              backdropFilter: 'blur(8px)',
              borderRadius: '4px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
            }}>
              <div style={{ color: '#C9A84C', fontWeight: 800, fontSize: '3.5vw', lineHeight: 1.1 }}>
                60-75%
              </div>
              <div style={{ color: 'white', fontSize: '1.5vw', opacity: 0.8, letterSpacing: '0.08em', marginTop: '0.5vw', fontWeight: 600, textTransform: 'uppercase' }}>
                SAVINGS
              </div>
            </div>
            
            {/* Stat 2 */}
            <div style={{ 
              flex: 1, 
              border: '1px solid #C9A84C', 
              padding: '1.5vw', 
              textAlign: 'center',
              backgroundColor: 'rgba(10,22,40,0.6)',
              backdropFilter: 'blur(8px)',
              borderRadius: '4px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
            }}>
              <div style={{ color: '#C9A84C', fontWeight: 800, fontSize: '3.5vw', lineHeight: 1.1 }}>
                14-DAY
              </div>
              <div style={{ color: 'white', fontSize: '1.5vw', opacity: 0.8, letterSpacing: '0.08em', marginTop: '0.5vw', fontWeight: 600, textTransform: 'uppercase' }}>
                FREE TRIAL
              </div>
            </div>
            
            {/* Stat 3 */}
            <div style={{ 
              flex: 1, 
              border: '1px solid #C9A84C', 
              padding: '1.5vw', 
              textAlign: 'center',
              backgroundColor: 'rgba(10,22,40,0.6)',
              backdropFilter: 'blur(8px)',
              borderRadius: '4px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
            }}>
              <div style={{ color: '#C9A84C', fontWeight: 800, fontSize: '3.5vw', lineHeight: 1.1 }}>
                50-STATE
              </div>
              <div style={{ color: 'white', fontSize: '1.5vw', opacity: 0.8, letterSpacing: '0.08em', marginTop: '0.5vw', fontWeight: 600, textTransform: 'uppercase' }}>
                COMPLIANCE
              </div>
            </div>
            
          </div>
        </div>
        
      </div>
    </div>
  );
};

export default AdCompanyFbPost;