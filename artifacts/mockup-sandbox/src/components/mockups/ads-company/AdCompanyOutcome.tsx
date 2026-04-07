import React from 'react';

export default function AdCompanyOutcome() {
  return (
    <div 
      style={{ 
        width: '100vw', 
        height: '100vh', 
        overflow: 'hidden', 
        position: 'relative', 
        backgroundColor: '#0a1628',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >
      {/* Hero Image */}
      <img 
        src="/__mockup/images/ad-company-outcome.png" 
        alt="Security Guard Company Outcome"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />

      {/* Strong Dark Overlay Gradient */}
      <div 
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(10,22,40,0.92) 100%)',
        }}
      />

      {/* Brand Name */}
      <div style={{
        position: 'absolute',
        top: '6%',
        left: '6%',
        color: '#C9A84C',
        fontSize: '1.8vw',
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        textShadow: '2px 2px 12px rgba(0,0,0,0.9)'
      }}>
        CoAIleague
      </div>

      {/* Text Content */}
      <div style={{
        position: 'absolute',
        bottom: '15%',
        left: '6%',
        right: '6%',
        display: 'flex',
        flexDirection: 'column',
        gap: '2vw',
        alignItems: 'flex-start',
      }}>
        <h1 style={{
          color: 'white',
          fontSize: '9vw',
          fontWeight: 900,
          lineHeight: 1.0,
          margin: 0,
          textShadow: '2px 2px 12px rgba(0,0,0,0.9)'
        }}>
          Cut Payroll Costs by <span style={{ color: '#C9A84C' }}>up to 75%</span>
        </h1>
        
        <p style={{
          color: 'white',
          fontSize: '2.8vw',
          fontWeight: 400,
          opacity: 0.9,
          margin: 0,
          textShadow: '2px 2px 12px rgba(0,0,0,0.9)'
        }}>
          As low as $3.50/employee vs. $8-15 at ADP
        </p>

        <div style={{ 
          marginTop: '1.5vw', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '1.5vw', 
          alignItems: 'center' 
        }}>
          <button style={{
            backgroundColor: '#C9A84C',
            color: '#0a1628',
            fontWeight: 'bold',
            fontSize: '2.2vw',
            borderRadius: '50px',
            padding: '1.2vw 3vw',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          }}>
            See What You'll Save
          </button>
          
          <span style={{
            color: 'white',
            fontSize: '1.4vw',
            opacity: 0.7,
            textShadow: '1px 1px 6px rgba(0,0,0,0.8)'
          }}>
            14-day free trial &middot; No credit card
          </span>
        </div>
      </div>
    </div>
  );
}
