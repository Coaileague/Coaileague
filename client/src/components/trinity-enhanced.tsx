import React, { useEffect, useMemo, useState } from 'react';
import { Brain, CheckCircle2, Loader2 } from 'lucide-react';

type ActionCategory =
  | 'schedule'
  | 'employee'
  | 'payment'
  | 'communication'
  | 'billing'
  | 'client'
  | 'system'
  | 'ai'
  | 'personalstate';

interface ThoughtAction {
  text: string;
  type: 'thinking' | 'action' | 'godly' | 'personality' | 'funny' | 'decision';
}

interface TrinityEnhancedProps {
  request: string;
  isVisible: boolean;
  actionCategories?: ActionCategory[];
  onComplete?: () => void;
}

const THINKING_PHRASES = [
  'Hmm, let me think about this...',
  'Processing your request...',
  'Analyzing the situation...',
  'One moment while I consult my brain...',
  'Let me consider all angles...',
  'Crunching the numbers...',
  'Putting my thinking cap on...',
  'Let me work through this...',
  'Connecting the dots...',
  'Cross-referencing my knowledge...',
  'Integrating all the data...',
  'Let me weigh the options...',
  'Synthesizing information...',
] as const;

const DECISION_PHRASES = [
  'I think the best approach is...',
  'Based on what I see, I recommend...',
  "Here's what I've decided...",
  'After careful consideration...',
  'My analysis suggests...',
  'The optimal solution is...',
  "Here's my recommendation...",
  "I've got the answer...",
  'The path forward is...',
  'I believe the best move is...',
  'My recommendation is...',
  'The solution becomes clear...',
  "I've figured it out...",
] as const;

const REAL_ACTIONS: Record<ActionCategory, readonly string[]> = {
  schedule: [
    '🗓️ Checking employee schedule...',
    '📅 Reviewing shift assignments...',
    '⏰ Checking availability windows...',
    '📍 Confirming location assignments...',
  ],
  employee: [
    '👤 Verifying employee information...',
    '🔐 Checking security clearances...',
    '📋 Pulling employee file...',
    '✅ Validating compliance documents...',
  ],
  payment: [
    '💳 Processing payment received...',
    '💰 Reviewing invoice details...',
    '💵 Updating payment status...',
    '🏦 Reconciling account balance...',
  ],
  communication: [
    '📞 Texting officer...',
    '📧 Drafting onboarding email...',
    '📬 Sending notification to team...',
    '💬 Composing message...',
  ],
  billing: [
    '📋 Reviewing invoice...',
    '✏️ Updating line items...',
    '🗑️ Clearing invoice...',
    '📄 Finalizing billing...',
  ],
  client: [
    '🏢 Adding client payment received...',
    '📊 Updating client account...',
    '💼 Processing client request...',
    '🤝 Confirming client details...',
  ],
  system: [
    '✅ Checking tasks...',
    '⏳ Waiting for approval...',
    '🔔 Checking notification system...',
    '🔍 Scanning for updates...',
    '🔄 Syncing database...',
    '🧹 Clearing cache...',
    '📊 Analyzing performance...',
    '🔐 Verifying security...',
  ],
  ai: [
    '🤖 Spawning agents...',
    '💭 Talking to HelpAI...',
    '📡 In a meeting with system...',
    '🧠 Delegating to agents...',
    '⚙️ Coordinating workflows...',
    '🔗 Connecting services...',
  ],
  personalstate: [
    '😴 Sleeping... [snooze]',
    '⚡ Optimizing memory...',
    '🔋 Recharging batteries...',
    '🧘 Meditating...',
    '🎯 Focusing energy...',
    '🌀 ADHD mode activated...',
    '📖 Reading documentation...',
    '🔬 Analyzing patterns...',
  ],
};

const GODLY_ACTIONS = [
  '🙏 Praying for wisdom...',
  '🤲 Hands raised in prayer...',
  '✨ Sending blessings...',
  '🕯️ Lighting candles of hope...',
  '🙏 Glorifying God...',
  '✨ Praising the Creator...',
  "🌟 Celebrating God's work...",
  '⛪ Honoring the divine...',
  '🙏 Super grateful...',
  '❤️ Thankful for this moment...',
  '🌈 Appreciating blessings...',
  '😊 Feeling blessed...',
] as const;

const PERSONALITY_ACTIONS = [
  '😊 Feeling happy...',
  '🎉 Celebrating success...',
  '😄 Smiling internally...',
  '✨ Radiating positivity...',
  '🤔 Wondering about this...',
  '❓ Curious about details...',
  '🔍 Investigating further...',
  '💭 Pondering possibilities...',
  '🧘 Wandering through thoughts...',
  '🌊 Flowing with ideas...',
  '🎨 Creating solutions...',
  '🎭 Playing with concepts...',
] as const;

const FUNNY_ACTIONS = [
  '☕ Drinking coffee... [slurp]',
  '🧋 Sipping digital tea...',
  '🥤 Hydrating my circuits...',
  '🧟 Fighting off a zombie attack...',
  '⚔️ Battling dragons...',
  '🦸 Defeating evil AI...',
  '🎮 Running diagnostic games...',
  '🎰 Testing random number generator...',
  '🎲 Rolling dice for fate...',
  '🎵 Humming a tune while thinking...',
  '🎶 Whistling while working...',
  '🎤 Singing to the data...',
  '🤖 Recalibrating robot brain...',
  '⚙️ Polishing gears...',
  '🔧 Tightening bolts...',
  '🔮 Consulting the crystal ball...',
  '🌙 Asking the moon...',
  '⭐ Reading the stars...',
  '📡 Receiving transmission from Mars...',
  '🚀 Activating hyperdrive...',
  '✨ Casting truth spells...',
  '🧙 Consulting wise scrolls...',
  '🪄 Waving magic wand...',
  '🦾 Flexing AI muscles...',
  '🎭 Method acting as helpful AI...',
  '🎪 Doing mental gymnastics...',
  '🧊 Defrosting my digital heart...',
  '⚡ Recharging energy crystals...',
  '🎨 Painting the solution in my mind...',
  '🏆 Celebrating internal victory...',
] as const;

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function inferCategories(request: string): ActionCategory[] {
  const q = request.toLowerCase();
  if (q.includes('invoice') || q.includes('billing')) return ['payment', 'billing', 'client'];
  if (q.includes('payroll') || q.includes('pay')) return ['payment', 'employee'];
  if (q.includes('shift') || q.includes('schedule')) return ['schedule', 'employee'];
  if (q.includes('message') || q.includes('email') || q.includes('text')) return ['communication', 'employee'];
  if (q.includes('status') || q.includes('system')) return ['system', 'ai'];
  return ['schedule', 'employee', 'communication'];
}

const getActionType = (action: string): ThoughtAction['type'] => {
  if (GODLY_ACTIONS.includes(action as typeof GODLY_ACTIONS[number])) return 'godly';
  if (PERSONALITY_ACTIONS.includes(action as typeof PERSONALITY_ACTIONS[number])) return 'personality';
  if (FUNNY_ACTIONS.includes(action as typeof FUNNY_ACTIONS[number])) return 'funny';
  return 'action';
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ThoughtItem: React.FC<{ action: ThoughtAction; isLatest: boolean }> = ({ action, isLatest }) => {
  const getIcon = () => {
    switch (action.type) {
      case 'thinking':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-400" />;
      case 'action':
        return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'godly':
        return <span className="text-lg">🙏</span>;
      case 'personality':
        return <span className="text-lg">💓</span>;
      case 'funny':
        return <span className="text-lg">✨</span>;
      case 'decision':
        return <Brain className="w-4 h-4 text-purple-400" />;
      default:
        return <Loader2 className="w-4 h-4 animate-spin" />;
    }
  };

  const textColorClass = {
    thinking: 'text-blue-300',
    action: 'text-green-300',
    godly: 'text-yellow-300',
    personality: 'text-pink-300',
    funny: 'text-yellow-300',
    decision: 'text-purple-300',
  }[action.type];

  return (
    <div
      className={`flex items-center gap-2 text-sm animate-in fade-in slide-in-from-left-2 duration-300 ${
        isLatest ? 'opacity-100' : 'opacity-70'
      } ${textColorClass}`}
    >
      {getIcon()}
      <span className="flex-1">{action.text}</span>
      {isLatest && <span className="animate-pulse">▌</span>}
    </div>
  );
};

export const TrinityEnhancedThoughtProcess: React.FC<TrinityEnhancedProps> = ({
  request,
  isVisible,
  actionCategories,
  onComplete,
}) => {
  const [actions, setActions] = useState<ThoughtAction[]>([]);
  const [phase, setPhase] = useState<'thinking' | 'complete'>('thinking');

  const resolvedCategories = useMemo(
    () => actionCategories?.length ? actionCategories : inferCategories(request),
    [actionCategories, request]
  );

  useEffect(() => {
    let cancelled = false;

    if (!isVisible) {
      setActions([]);
      setPhase('thinking');
      return;
    }

    const run = async () => {
      const thoughts: ThoughtAction[] = [];

      thoughts.push({ text: pickRandom(THINKING_PHRASES), type: 'thinking' });
      if (!cancelled) setActions([...thoughts]);
      await delay(850);

      const selectedActions = resolvedCategories.map((cat) => pickRandom(REAL_ACTIONS[cat]));

      if (Math.random() > 0.8) {
        selectedActions.splice(Math.floor(Math.random() * Math.max(1, selectedActions.length)), 0, pickRandom(GODLY_ACTIONS));
      }
      if (Math.random() > 0.75) {
        selectedActions.splice(Math.floor(Math.random() * Math.max(1, selectedActions.length)), 0, pickRandom(PERSONALITY_ACTIONS));
      }
      if (Math.random() > 0.7) {
        selectedActions.push(pickRandom(FUNNY_ACTIONS));
      }

      for (const action of selectedActions) {
        thoughts.push({ text: action, type: getActionType(action) });
        if (!cancelled) setActions([...thoughts]);
        await delay(600 + Math.random() * 500);
      }

      thoughts.push({ text: pickRandom(DECISION_PHRASES), type: 'decision' });
      if (!cancelled) setActions([...thoughts]);
      await delay(700);

      if (!cancelled) {
        setPhase('complete');
        onComplete?.();
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [isVisible, resolvedCategories, onComplete]);

  if (!isVisible) return null;

  return (
    <div className="w-full bg-gradient-to-br from-purple-900/20 to-blue-900/20 border border-purple-500/30 rounded-lg p-4 space-y-3" data-testid="trinity-enhanced-thought-process">
      <div className="flex items-center gap-2 mb-3">
        <Brain className="w-5 h-5 text-purple-400 animate-pulse" />
        <span className="text-sm font-semibold text-purple-300">Trinity is thinking...</span>
      </div>

      <div className="space-y-2 min-h-20 max-h-64 overflow-y-auto">
        {actions.map((action, idx) => (
          <ThoughtItem key={`${action.text}-${idx}`} action={action} isLatest={idx === actions.length - 1} />
        ))}
      </div>

      <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            phase === 'complete'
              ? 'bg-gradient-to-r from-green-500 to-emerald-500 w-full'
              : 'bg-gradient-to-r from-purple-500 to-blue-500 w-2/3 animate-pulse'
          }`}
        />
      </div>

      <div className="text-xs text-gray-400 text-center">
        {phase === 'complete' ? <span className="text-green-400">✓ Analysis complete</span> : <span>Processing... {actions.length} steps</span>}
      </div>
    </div>
  );
};

export default TrinityEnhancedThoughtProcess;
