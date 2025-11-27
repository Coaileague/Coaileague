export function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col items-center justify-center z-50">
      {/* Animated Logo */}
      <div className="relative w-32 h-32 mb-12 animate-pulse">
        {/* Outer rotating ring */}
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 border-r-green-500 animate-spin"
          style={{ animationDuration: '3s' }}
        />
        
        {/* Middle ring */}
        <div className="absolute inset-2 rounded-full border-2 border-transparent border-b-cyan-500 border-l-green-400 animate-spin"
          style={{ animationDuration: '4s', animationDirection: 'reverse' }}
        />
        
        {/* Center logo container */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative">
            {/* Neural network nodes */}
            <svg viewBox="0 0 100 100" className="w-20 h-20">
              <defs>
                <linearGradient id="loadGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="50%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
              </defs>
              {/* Nodes */}
              <circle cx="50" cy="20" r="4" fill="url(#loadGradient)" opacity="0.9" />
              <circle cx="80" cy="30" r="4" fill="url(#loadGradient)" opacity="0.8" />
              <circle cx="80" cy="70" r="4" fill="url(#loadGradient)" opacity="0.8" />
              <circle cx="50" cy="80" r="4" fill="url(#loadGradient)" opacity="0.9" />
              <circle cx="20" cy="70" r="4" fill="url(#loadGradient)" opacity="0.8" />
              <circle cx="20" cy="30" r="4" fill="url(#loadGradient)" opacity="0.8" />
              {/* Center */}
              <circle cx="50" cy="50" r="3" fill="url(#loadGradient)" />
              {/* Connections */}
              <line x1="50" y1="20" x2="50" y2="50" stroke="url(#loadGradient)" strokeWidth="1" opacity="0.4" strokeDasharray="2,2" />
              <line x1="80" y1="30" x2="50" y2="50" stroke="url(#loadGradient)" strokeWidth="1" opacity="0.4" strokeDasharray="2,2" />
              <line x1="80" y1="70" x2="50" y2="50" stroke="url(#loadGradient)" strokeWidth="1" opacity="0.4" strokeDasharray="2,2" />
              <line x1="50" y1="80" x2="50" y2="50" stroke="url(#loadGradient)" strokeWidth="1" opacity="0.4" strokeDasharray="2,2" />
              <line x1="20" y1="70" x2="50" y2="50" stroke="url(#loadGradient)" strokeWidth="1" opacity="0.4" strokeDasharray="2,2" />
              <line x1="20" y1="30" x2="50" y2="50" stroke="url(#loadGradient)" strokeWidth="1" opacity="0.4" strokeDasharray="2,2" />
            </svg>
          </div>
        </div>
      </div>

      {/* Brand Text */}
      <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-green-400 to-cyan-400 bg-clip-text text-transparent mb-2 tracking-tight">
        CoAIleague
      </h1>
      <p className="text-slate-400 text-sm mb-8 animate-pulse">
        AI-Powered Workforce Intelligence
      </p>

      {/* Loading Bar */}
      <div className="w-64 h-1 bg-slate-700 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-blue-500 via-green-500 to-cyan-500 rounded-full animate-pulse"
          style={{
            animation: 'shimmer 2s infinite',
            backgroundSize: '200% 100%',
            backgroundPosition: '0% 0%'
          }}
        />
      </div>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0%; }
          100% { background-position: -200% 0%; }
        }
      `}</style>
    </div>
  );
}
