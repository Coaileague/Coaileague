/**
 * AI Working Animation
 * Unique animation for ScheduleOS Smart AI automation
 * Shows when AI is processing schedules, analyzing data, or generating proposals
 */

export function AIWorkingAnimation({ message = "Working..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-6">
      {/* Brain/Neural Network Animation */}
      <div className="relative w-24 h-24">
        {/* Central AI Core */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-500 rounded-full animate-pulse shadow-lg shadow-blue-500/50">
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-6 h-6 bg-white rounded-full"></div>
            </div>
          </div>
        </div>
        
        {/* Orbiting Data Nodes */}
        <div className="absolute inset-0 animate-spin-slow">
          <div className="absolute top-0 left-1/2 -ml-2 w-4 h-4 bg-blue-400 rounded-full shadow-md"></div>
        </div>
        <div className="absolute inset-0 animate-spin-slow" style={{ animationDelay: '-1s' }}>
          <div className="absolute top-0 left-1/2 -ml-2 w-4 h-4 bg-cyan-400 rounded-full shadow-md"></div>
        </div>
        <div className="absolute inset-0 animate-spin-slow" style={{ animationDelay: '-2s' }}>
          <div className="absolute top-0 left-1/2 -ml-2 w-4 h-4 bg-blue-300 rounded-full shadow-md"></div>
        </div>
        
        {/* Neural Connection Lines */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="url(#gradient1)" strokeWidth="1" opacity="0.3" className="animate-dash"/>
          <circle cx="50" cy="50" r="35" fill="none" stroke="url(#gradient2)" strokeWidth="1" opacity="0.3" className="animate-dash-reverse"/>
          <defs>
            <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
            <linearGradient id="gradient2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      
      {/* Processing Text */}
      <div className="flex flex-col items-center space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          </div>
          <p className="text-lg font-semibold text-foreground">{message}</p>
        </div>
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          ScheduleOS™ Smart AI is analyzing data and optimizing assignments
        </p>
      </div>
      
      {/* Progress Indicators */}
      <div className="w-full max-w-xs space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Processing...</span>
          <span className="font-mono">∞</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-600 to-blue-500 rounded-full animate-progress-bar"></div>
        </div>
      </div>
      
      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes dash {
          to { stroke-dashoffset: -100; }
        }
        @keyframes dash-reverse {
          to { stroke-dashoffset: 100; }
        }
        @keyframes progress-bar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-spin-slow {
          animation: spin-slow 4s linear infinite;
        }
        .animate-dash {
          stroke-dasharray: 10 5;
          animation: dash 20s linear infinite;
        }
        .animate-dash-reverse {
          stroke-dasharray: 10 5;
          animation: dash-reverse 15s linear infinite;
        }
        .animate-progress-bar {
          animation: progress-bar 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
