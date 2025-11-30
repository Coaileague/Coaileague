interface DynamicBackgroundProps {
  variant?: 'subtle' | 'vibrant' | 'mesh';
  children: React.ReactNode;
  className?: string;
}

export function DynamicBackground({ 
  variant = 'subtle', 
  children, 
  className = '' 
}: DynamicBackgroundProps) {
  const getParticles = () => {
    const particles = [];
    const count = variant === 'vibrant' ? 8 : 5;
    
    for (let i = 0; i < count; i++) {
      const size = Math.random() * 100 + 50;
      const left = Math.random() * 100;
      const top = Math.random() * 100;
      const delay = Math.random() * 5;
      const duration = 8 + Math.random() * 4;
      
      const colors = variant === 'vibrant' 
        ? ['rgba(168, 85, 247, 0.15)', 'rgba(236, 72, 153, 0.12)', 'rgba(59, 130, 246, 0.1)']
        : ['rgba(168, 85, 247, 0.06)', 'rgba(236, 72, 153, 0.05)', 'rgba(59, 130, 246, 0.04)'];
      
      particles.push(
        <div
          key={i}
          className="absolute rounded-full animate-floating-particle blur-3xl pointer-events-none"
          style={{
            width: `${size}px`,
            height: `${size}px`,
            left: `${left}%`,
            top: `${top}%`,
            background: colors[i % colors.length],
            animationDelay: `${delay}s`,
            animationDuration: `${duration}s`,
          }}
        />
      );
    }
    return particles;
  };

  if (variant === 'mesh') {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <div 
          className="absolute inset-0 animate-mesh-gradient pointer-events-none opacity-30"
          style={{
            background: `
              radial-gradient(ellipse at 0% 0%, rgba(168, 85, 247, 0.2) 0%, transparent 50%),
              radial-gradient(ellipse at 100% 0%, rgba(236, 72, 153, 0.15) 0%, transparent 50%),
              radial-gradient(ellipse at 100% 100%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
              radial-gradient(ellipse at 0% 100%, rgba(34, 197, 94, 0.08) 0%, transparent 50%)
            `,
            backgroundSize: '400% 400%',
          }}
        />
        <div className="relative z-10">{children}</div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div className="absolute inset-0 pointer-events-none">
        {getParticles()}
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function FloatingParticles({ count = 5 }: { count?: number }) {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {[...Array(count)].map((_, i) => {
        const size = 80 + Math.random() * 120;
        const left = Math.random() * 100;
        const top = Math.random() * 100;
        const delay = Math.random() * 8;
        
        return (
          <div
            key={i}
            className="absolute rounded-full animate-floating-particle blur-3xl"
            style={{
              width: `${size}px`,
              height: `${size}px`,
              left: `${left}%`,
              top: `${top}%`,
              background: `rgba(${Math.random() > 0.5 ? '168, 85, 247' : '236, 72, 153'}, ${0.03 + Math.random() * 0.04})`,
              animationDelay: `${delay}s`,
              animationDuration: `${10 + Math.random() * 5}s`,
            }}
          />
        );
      })}
    </div>
  );
}
