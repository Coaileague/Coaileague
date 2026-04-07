import React from 'react';

export default function AdRegulatoryTcole() {
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: '#0a1628',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Hero Image */}
      <img
        src="/__mockup/images/ad-regulatory-tcole.png"
        alt="TCOLE compliance"
        style={{
          position: 'absolute',
          inset: 0,
          objectFit: 'cover',
          width: '100%',
          height: '100%',
        }}
      />

      {/* Institutional Dark Overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to bottom, rgba(10,22,40,0.6) 0%, rgba(10,22,40,0.97) 65%)',
        }}
      />

      {/* Top Left Logo Area */}
      <div
        style={{
          position: 'absolute',
          top: '6%',
          left: '6%',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.8vw',
        }}
      >
        <div
          style={{
            color: 'white',
            fontSize: '1.5vw',
            fontWeight: 600,
            letterSpacing: '0.05em',
          }}
        >
          CoAIleague
        </div>
        <div
          style={{
            height: '2px',
            width: '10vw',
            backgroundColor: '#B8960C',
          }}
        />
      </div>

      {/* Official Seal / Partnership Text */}
      <div
        style={{
          position: 'absolute',
          top: '6%',
          right: '6%',
          color: '#B8960C',
          fontSize: '1.3vw',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          fontWeight: 600,
        }}
      >
        STATE OF TEXAS · COMPLIANCE PARTNERSHIP
      </div>

      {/* Bottom Text Block */}
      <div
        style={{
          position: 'absolute',
          bottom: '10%',
          left: '6%',
          right: '6%',
          display: 'flex',
          flexDirection: 'column',
          gap: '2vw',
        }}
      >
        {/* Decorative Gold Rule */}
        <div
          style={{
            width: '100%',
            height: '1px',
            backgroundColor: '#B8960C',
            opacity: 0.6,
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2vw' }}>
          <h1
            style={{
              color: 'white',
              fontSize: '7.5vw',
              fontWeight: 700,
              lineHeight: 1.15,
              margin: 0,
            }}
          >
            Audit Every Licensed Guard in Texas.
          </h1>
          <p
            style={{
              color: 'white',
              fontSize: '2.5vw',
              opacity: 0.88,
              lineHeight: 1.6,
              margin: 0,
              maxWidth: '85%',
            }}
          >
            TCOLE-authorized compliance visibility — at no cost to your agency
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1vw',
            alignItems: 'flex-start',
            marginTop: '1.5vw',
          }}
        >
          <button
            style={{
              backgroundColor: '#0a1628',
              border: '2px solid #B8960C',
              color: '#B8960C',
              fontSize: '2vw',
              fontWeight: 600,
              padding: '1.5vw 3.5vw',
              borderRadius: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              cursor: 'pointer',
              boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
            }}
          >
            Request Agency Access
          </button>
          <div
            style={{
              color: 'white',
              fontSize: '1.5vw',
              opacity: 0.7,
              fontWeight: 400,
              paddingLeft: '0.5vw',
            }}
          >
            Free for all Texas regulatory bodies
          </div>
        </div>
      </div>
    </div>
  );
}
