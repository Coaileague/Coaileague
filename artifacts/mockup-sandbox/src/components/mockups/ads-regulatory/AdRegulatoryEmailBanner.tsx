import React from 'react';

export default function AdRegulatoryEmailBanner() {
  return (
    <div 
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      <img 
        src="/__mockup/images/ad-regulatory-emailbanner.png" 
        alt="Background" 
        style={{
          position: 'absolute',
          inset: 0,
          objectFit: 'cover',
          width: '100%',
          height: '100%'
        }} 
      />
      <div 
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to right, rgba(10,22,40,0.97) 50%, rgba(10,22,40,0.6) 100%)'
        }} 
      />
      
      <div 
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          boxSizing: 'border-box'
        }}
      >
        <div 
          style={{
            flex: 1,
            paddingLeft: '4vw',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '0.8vw'
          }}
        >
          <div 
            style={{
              color: '#B8960C',
              fontSize: '1.8vw',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              fontWeight: 600
            }}
          >
            Regulatory Compliance Platform
          </div>
          <div 
            style={{
              color: 'white',
              fontSize: '3.5vw',
              fontWeight: 700,
              lineHeight: 1.2
            }}
          >
            Statewide Guard Audit — Free for Your Agency
          </div>
          <div 
            style={{
              color: 'white',
              fontSize: '2.2vw',
              opacity: 0.8,
              fontWeight: 400
            }}
          >
            Auditoría Estatal — Gratis para Su Agencia
          </div>
        </div>
        
        {/* Vertical divider */}
        <div 
          style={{
            width: '1px',
            height: '60%',
            backgroundColor: '#B8960C',
            opacity: 0.5
          }}
        />

        <div 
          style={{
            width: '28%',
            textAlign: 'center',
            paddingRight: '3vw',
            paddingLeft: '3vw',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1.2vw'
          }}
        >
          <button 
            style={{
              backgroundColor: '#0a1628',
              color: '#B8960C',
              border: '2px solid #B8960C',
              borderRadius: '4px',
              fontSize: '2vw',
              fontWeight: 600,
              padding: '1.2vw 2vw',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              width: '100%',
              boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
            }}
          >
            Request Access
          </button>
          <div 
            style={{
              color: 'white',
              fontSize: '1.5vw',
              opacity: 0.9,
              letterSpacing: '0.05em'
            }}
          >
            CoAIleague.com
          </div>
        </div>
      </div>
    </div>
  );
}
