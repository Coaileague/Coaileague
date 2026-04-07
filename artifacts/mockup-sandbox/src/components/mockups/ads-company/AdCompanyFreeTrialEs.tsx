import React from 'react';

export default function AdCompanyFreeTrialEs() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', backgroundColor: '#0a1628', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Background Image */}
      <img 
        src="/__mockup/images/ad-company-spanish.png" 
        alt="Background" 
        style={{ position: 'absolute', inset: 0, objectFit: 'cover', width: '100%', height: '100%' }} 
      />
      
      {/* Gradient Overlay */}
      <div 
        style={{ 
          position: 'absolute', 
          inset: 0, 
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(10,22,40,0.93) 70%)' 
        }} 
      />

      {/* Header elements */}
      <div style={{ position: 'absolute', top: '5%', left: '6%', right: '6%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: '#C9A84C', fontSize: '1.8vw', fontWeight: 'bold', letterSpacing: '0.05em' }}>
          CoAIleague
        </div>
        <div style={{ border: '0.15vw solid #C9A84C', color: '#C9A84C', padding: '0.4vw 1vw', borderRadius: '1vw', fontSize: '1.5vw', fontWeight: 'bold', backgroundColor: 'transparent' }}>
          EN ESPAÑOL
        </div>
      </div>

      {/* Main Content */}
      <div style={{ position: 'absolute', bottom: '12%', left: '6%', right: '6%', display: 'flex', flexDirection: 'column', gap: '2vw' }}>
        <h1 style={{ color: 'white', fontSize: '8vw', fontWeight: 900, lineHeight: 1.1, margin: 0, padding: 0 }}>
          14 Días Gratis.<br />Sin Tarjeta.
        </h1>
        
        <p style={{ color: 'white', fontSize: '2.5vw', opacity: 0.88, margin: 0, padding: 0, maxWidth: '85%' }}>
          IA para empresas de seguridad — horarios, nómina, cumplimiento
        </p>

        <div style={{ marginTop: '2vw', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1vw' }}>
          <button style={{ 
            backgroundColor: '#C9A84C', 
            color: '#0a1628', 
            fontSize: '2.2vw', 
            fontWeight: 'bold', 
            padding: '2vw 0', 
            borderRadius: '5vw', 
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 1vw 2vw rgba(0,0,0,0.3)',
            width: '100%',
            textAlign: 'center'
          }}>
            Empieza Gratis Ahora
          </button>
          
          <p style={{ color: 'white', fontSize: '1.8vw', opacity: 0.7, margin: 0, padding: 0, width: '100%', textAlign: 'center' }}>
            Sin tarjeta de crédito requerida
          </p>
        </div>
      </div>
    </div>
  );
}
