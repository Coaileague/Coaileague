import React from 'react';

export default function AdRegulatoryAllStates() {
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: '#0a1628',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
    >
      {/* Background Image */}
      <img
        src="/__mockup/images/ad-regulatory-allstates.png"
        alt="Statewide compliance visibility"
        style={{
          position: 'absolute',
          inset: 0,
          objectFit: 'cover',
          width: '100%',
          height: '100%',
          zIndex: 0
        }}
      />

      {/* Dark Institutional Overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to bottom, rgba(10,22,40,0.65) 0%, rgba(10,22,40,0.97) 60%)',
          zIndex: 1
        }}
      />

      {/* Top Header Bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '8vw',
          backgroundColor: 'rgba(10, 22, 40, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2,
          borderBottom: '1px solid rgba(184, 150, 12, 0.2)'
        }}
      >
        <span
          style={{
            color: '#B8960C',
            fontSize: '1.3vw',
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            fontWeight: 600
          }}
        >
          Regulatory Compliance Program · All 50 States
        </span>
      </div>

      {/* Brand */}
      <div
        style={{
          position: 'absolute',
          top: '11vw',
          left: '6%',
          color: '#B8960C',
          fontSize: '1.8vw',
          fontWeight: 700,
          letterSpacing: '0.05em',
          zIndex: 2
        }}
      >
        CoAIleague
      </div>

      {/* Text Block */}
      <div
        style={{
          position: 'absolute',
          bottom: '10%',
          left: '6%',
          right: '6%',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start'
        }}
      >
        {/* Decorative gold line */}
        <div
          style={{
            width: '12vw',
            height: '3px',
            backgroundColor: '#B8960C',
            marginBottom: '3.5vw'
          }}
        />

        {/* Headline */}
        <h1
          style={{
            color: '#ffffff',
            fontSize: '8vw',
            fontWeight: 700,
            lineHeight: 1.1,
            margin: '0 0 2vw 0',
            maxWidth: '90%'
          }}
        >
          See Every Licensed Guard in Your State.
        </h1>

        {/* Subtext */}
        <p
          style={{
            color: '#ffffff',
            fontSize: '2.5vw',
            opacity: 0.88,
            margin: '0 0 5vw 0',
            fontWeight: 400,
            maxWidth: '85%'
          }}
        >
          Statewide compliance auditing — free for your regulatory agency
        </p>

        {/* CTA */}
        <button
          style={{
            backgroundColor: '#0a1628',
            color: '#B8960C',
            border: '2px solid #B8960C',
            borderRadius: '4px',
            padding: '2vw 4.5vw',
            fontSize: '2vw',
            fontWeight: 600,
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '2vw',
            transition: 'all 0.2s ease-in-out',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
          }}
        >
          Request Statewide Access
        </button>

        {/* Below CTA text */}
        <p
          style={{
            color: '#ffffff',
            fontSize: '1.4vw',
            opacity: 0.5,
            margin: 0,
            fontWeight: 400,
            letterSpacing: '0.02em'
          }}
        >
          Available for all 50 state regulatory bodies
        </p>
      </div>
    </div>
  );
}
