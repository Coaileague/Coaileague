import React from 'react';

const AdCompanyIdentity = () => {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', backgroundColor: '#0a1628', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <img 
        src="/__mockup/images/ad-company-identity.png" 
        alt="Built for Security Companies" 
        style={{ position: 'absolute', inset: 0, objectFit: 'cover', width: '100%', height: '100%' }} 
      />
      
      <div 
        style={{ 
          position: 'absolute', 
          inset: 0, 
          background: 'linear-gradient(to top, rgba(10,22,40,0.96) 0%, rgba(0,0,0,0.0) 50%)' 
        }} 
      />
      
      {/* Brand name */}
      <div style={{ 
        position: 'absolute', 
        top: '6%', 
        left: '6%', 
        color: '#C9A84C', 
        fontSize: '1.8vw', 
        fontWeight: 700, 
        letterSpacing: '0.15em', 
        textTransform: 'uppercase' 
      }}>
        CoAIleague
      </div>

      {/* Text Content */}
      <div style={{ 
        position: 'absolute', 
        bottom: '10%', 
        left: '6%', 
        right: '6%', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'flex-start' 
      }}>
        <h1 style={{ 
          color: 'white', 
          fontSize: '8.5vw', 
          fontWeight: 900, 
          textTransform: 'uppercase', 
          lineHeight: 1.05, 
          margin: 0, 
          padding: 0,
          textShadow: '0 4px 20px rgba(0,0,0,0.3)'
        }}>
          Built for<br />Security<br />Companies.
        </h1>
        
        <div style={{ 
          height: '2px', 
          width: '12vw', 
          backgroundColor: '#C9A84C', 
          marginTop: '3.5vw', 
          marginBottom: '3.5vw',
          boxShadow: '0 2px 10px rgba(201,168,76,0.3)'
        }} />
        
        <p style={{ 
          color: 'white', 
          fontSize: '2.5vw', 
          fontWeight: 400, 
          lineHeight: 1.6, 
          opacity: 0.9, 
          margin: 0, 
          padding: 0, 
          maxWidth: '85%',
          textShadow: '0 2px 10px rgba(0,0,0,0.5)'
        }}>
          Not retrofitted. Not generic. Purpose-built for the security industry.
        </p>
        
        <div style={{ marginTop: '5vw', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <button style={{ 
            border: '2px solid #C9A84C', 
            backgroundColor: 'transparent', 
            color: '#C9A84C', 
            fontSize: '2.2vw', 
            fontWeight: 700,
            borderRadius: '50px', 
            padding: '1.5vw 4vw',
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            transition: 'all 0.2s ease',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
          }}>
            See How It Works
          </button>
          <span style={{ 
            color: 'white', 
            fontSize: '1.6vw', 
            opacity: 0.8, 
            marginTop: '1.5vw', 
            marginLeft: '1.5vw',
            fontWeight: 500
          }}>
            Try free for 14 days
          </span>
        </div>
      </div>
    </div>
  );
};

export default AdCompanyIdentity;