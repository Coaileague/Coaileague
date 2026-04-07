import React from 'react';

export default function AdRegulatoryTcoleEs() {
  return (
    <div className="w-screen h-screen overflow-hidden relative font-sans bg-[#0a1628]">
      {/* Background Image */}
      <img 
        src="/__mockup/images/ad-regulatory-spanish.png" 
        alt="Texas Regulatory Background" 
        className="absolute inset-0 object-cover w-full h-full"
      />
      
      {/* Gradient Overlay */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to bottom, rgba(10,22,40,0.5) 0%, rgba(10,22,40,0.97) 65%)'
        }}
      />

      {/* Top Elements */}
      <div className="absolute left-[6%] right-[6%] flex justify-between items-start" style={{ top: '3%' }}>
        <div className="flex flex-col gap-[1vh]">
          <span 
            className="text-[#B8960C] uppercase font-semibold"
            style={{ fontSize: '1.3vw', letterSpacing: '0.2em' }}
          >
            PROGRAMA DE CUMPLIMIENTO · ESTADO DE TEXAS
          </span>
          <span 
            className="text-[#B8960C] font-medium opacity-90"
            style={{ fontSize: '1.6vw' }}
          >
            CoAIleague
          </span>
        </div>
        
        <div 
          className="border border-[#B8960C] text-[#B8960C] uppercase font-medium rounded-sm flex items-center justify-center bg-transparent"
          style={{ fontSize: '1.3vw', padding: '0.6vw 1.2vw', letterSpacing: '0.1em' }}
        >
          EN ESPAÑOL
        </div>
      </div>

      {/* Main Content (Bottom) */}
      <div className="absolute left-[6%] right-[6%] flex flex-col items-start" style={{ bottom: '10%' }}>
        <h1 
          className="text-white font-bold max-w-[90%]"
          style={{ 
            fontSize: '7.5vw', 
            lineHeight: 1.15,
            textShadow: '0 4px 24px rgba(0,0,0,0.5)'
          }}
        >
          Audite Cada Guardia en Texas.
        </h1>
        
        <p 
          className="text-white font-medium max-w-[85%]"
          style={{ 
            fontSize: '2.5vw',
            opacity: 0.88,
            marginTop: '3vh' 
          }}
        >
          Cumplimiento estatal completo — sin costo para su agencia reguladora
        </p>

        <button 
          className="hover:bg-[#B8960C]/10 transition-colors duration-300 flex items-center justify-center"
          style={{
            marginTop: '5vh',
            border: '2px solid #B8960C',
            backgroundColor: '#0a1628',
            color: '#B8960C',
            fontSize: '2.2vw',
            padding: '2vh 4vw',
            fontWeight: 600,
            letterSpacing: '0.05em',
            borderRadius: '4px'
          }}
        >
          Solicitar Acceso de Agencia
        </button>

        <div 
          className="text-white/60 font-medium uppercase"
          style={{ 
            marginTop: '2vh',
            fontSize: '1.4vw',
            letterSpacing: '0.1em'
          }}
        >
          Gratis para organismos reguladores de Texas
        </div>
      </div>
    </div>
  );
}
