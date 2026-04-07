/**
 * DYNAMIC MESSAGE SERVICE
 * ========================
 * All chat messages are generated dynamically using Trinity AI brain.
 * No hardcoded messages - everything feels natural and responsive.
 * Fallbacks are contextual and still feel human-generated.
 * 
 * Like the old mIRC eggbots but powered by real AI.
 */

import { meteredGemini } from './billing/meteredGeminiClient';
import { HELPAI, PLATFORM } from '@shared/platformConfig';
import { TIMEOUTS } from '../config/platformConfig';
import { createLogger } from '../lib/logger';
const log = createLogger('dynamicMessageService');


// Message types for context-aware generation
export type MessageContext = 
  | 'user_joined'
  | 'user_left'
  | 'motd'
  | 'welcome_customer'
  | 'welcome_staff'
  | 'voice_granted'
  | 'voice_pending'
  | 'ticket_created'
  | 'escalation_needed'
  | 'staff_assigned'
  | 'no_staff_available'
  | 'fallback_help'
  | 'queue_update';

interface MessageParams {
  userName?: string;
  roomName?: string;
  ticketNumber?: string;
  queuePosition?: number;
  waitTime?: number;
  staffName?: string;
  staffRole?: string;
  reason?: string;
  availableCommands?: string[];
}

// Smart fallback messages that still feel natural and contextual
const SMART_FALLBACKS: Record<MessageContext, (params: MessageParams) => string> = {
  user_joined: (p) => {
    const greetings = [
      `${p.userName} just walked in`,
      `Hey, ${p.userName} is here`,
      `${p.userName} connected`,
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  },
  
  user_left: (p) => {
    const farewells = [
      `${p.userName} stepped away`,
      `${p.userName} disconnected`,
      `${p.userName} left the chat`,
    ];
    return farewells[Math.floor(Math.random() * farewells.length)];
  },
  
  motd: (p) => {
    const commands = p.availableCommands?.slice(0, 3).join(', ') || '/help, /status';
    const name = p.roomName || 'Chat Room';
    return `Welcome to ${name}! Use ${commands} for options. Invite teammates to start collaborating.`;
  },
  
  welcome_customer: (p) => {
    const welcomes = [
      `Hey ${p.userName}! What can I help you with today?`,
      `Hi ${p.userName}, I'm here. What's going on?`,
      `${p.userName}, welcome! Tell me what you need.`,
    ];
    return welcomes[Math.floor(Math.random() * welcomes.length)];
  },
  
  welcome_staff: (p) => {
    return `${p.userName}, you're live. ${p.roomName || 'Support'} is active.`;
  },
  
  voice_granted: (p) => {
    return `You're all set ${p.userName} - go ahead and chat.`;
  },
  
  voice_pending: (p) => {
    return `One sec ${p.userName}, getting you connected...`;
  },
  
  ticket_created: (p) => {
    const position = p.queuePosition ? ` You're #${p.queuePosition} in line.` : '';
    return `Got it, ${p.userName}. Your ticket is ${p.ticketNumber}.${position}`;
  },
  
  escalation_needed: (p) => {
    return `I'm bringing in a human to help with this, ${p.userName}. Hang tight.`;
  },
  
  staff_assigned: (p) => {
    return `${p.staffName} from our team just joined to help you out.`;
  },
  
  no_staff_available: (p) => {
    return `No one's available right now, but I'm logging this. We'll follow up soon.`;
  },
  
  fallback_help: (p) => {
    const responses = [
      `Let me look into that for you.`,
      `On it. Give me a moment.`,
      `I hear you. Let me check on this.`,
      `Working on it now.`,
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  },
  
  queue_update: (p) => {
    if (p.queuePosition === 1) {
      return `You're next up, ${p.userName}.`;
    }
    return `You're #${p.queuePosition} in the queue. About ${p.waitTime || 5} min wait.`;
  },
};

class DynamicMessageService {
  private cache = new Map<string, { message: string; timestamp: number }>();
  private CACHE_TTL = TIMEOUTS.dynamicMessageCacheTtlMs;
  
  /**
   * Generate a dynamic, context-aware message using Trinity AI
   * Falls back to smart contextual messages if AI unavailable
   */
  async generateMessage(
    context: MessageContext,
    params: MessageParams,
    workspaceId?: string
  ): Promise<string> {
    // Check cache for recently generated similar message
    const cacheKey = `${context}_${JSON.stringify(params)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      // Add slight variation to cached message
      return this.addVariation(cached.message);
    }
    
    try {
      const prompt = this.buildPrompt(context, params);
      
      const result = await meteredGemini.generate({
        workspaceId: workspaceId,
        userId: 'system',
        featureKey: 'dynamic_message_generation',
        prompt,
        systemInstruction: this.getSystemInstruction(),
        model: 'gemini-2.5-flash',
        temperature: 0.8, // Higher for more natural variation
        maxOutputTokens: 100, // Keep messages concise
      });
      
      if (result.text) {
        const message = this.cleanMessage(result.text);
        this.cache.set(cacheKey, { message, timestamp: Date.now() });
        return message;
      }
      
      return this.getSmartFallback(context, params);
    } catch (error) {
      log.info(`[DynamicMessage] AI unavailable, using smart fallback for: ${context}`);
      return this.getSmartFallback(context, params);
    }
  }
  
  /**
   * Generate MOTD dynamically based on room context
   */
  async generateMOTD(
    roomName: string,
    roomModes: string[],
    activeBots: string[],
    workspaceId?: string
  ): Promise<string> {
    const params: MessageParams = {
      roomName,
      availableCommands: this.getCommandsForModes(roomModes),
    };
    
    try {
      const botsInfo = activeBots.length > 0 ? `Active bots: ${activeBots.join(', ')}` : '';
      const modesInfo = roomModes.length > 0 ? `Room type: ${roomModes.join(', ')}` : '';
      
      const result = await meteredGemini.generate({
        workspaceId: workspaceId,
        userId: 'system',
        featureKey: 'dynamic_motd',
        prompt: `Generate a brief, friendly MOTD (message of the day) for a chat room called "${roomName}". ${modesInfo}. ${botsInfo}. Include 2-3 useful slash commands they can use. Keep it under 50 words. No emojis.`,
        systemInstruction: `You are generating chat room welcome messages. Be concise, helpful, and professional. Sound like a knowledgeable system, not a chatbot. Use natural language.`,
        model: 'gemini-2.5-flash',
        temperature: 0.7,
        maxOutputTokens: 80,
      });
      
      if (result.text) {
        return this.cleanMessage(result.text);
      }
      
      return this.getSmartFallback('motd', params);
    } catch (error) {
      return this.getSmartFallback('motd', params);
    }
  }
  
  /**
   * Generate a welcome message for new users
   */
  async generateWelcome(
    userName: string,
    isStaff: boolean,
    roomName: string,
    ticketNumber?: string,
    queuePosition?: number,
    workspaceId?: string
  ): Promise<string> {
    const context: MessageContext = isStaff ? 'welcome_staff' : 'welcome_customer';
    const params: MessageParams = {
      userName,
      roomName,
      ticketNumber,
      queuePosition,
    };
    
    return this.generateMessage(context, params, workspaceId);
  }
  
  /**
   * Generate a contextual AI response when helping users
   */
  async generateHelpResponse(
    userMessage: string,
    userName: string,
    conversationHistory: Array<{ role: string; content: string }>,
    workspaceId?: string
  ): Promise<string> {
    try {
      const historyContext = conversationHistory
        .slice(-3)
        .map(h => `${h.role}: ${h.content}`)
        .join('\n');
      
      const result = await meteredGemini.generate({
        workspaceId: workspaceId,
        userId: 'system',
        featureKey: 'helpai_dynamic_response',
        prompt: `User ${userName} said: "${userMessage}"\n\nRecent conversation:\n${historyContext}\n\nRespond helpfully and naturally. Be concise (1-2 sentences). If you can help, help. If you need to escalate, say so.`,
        systemInstruction: `You are ${HELPAI.name}, a support assistant for ${PLATFORM.name}. Be helpful, direct, and human. Don't use corporate speak. Sound like a knowledgeable friend who works at the company. Never use emojis. Keep responses under 50 words.`,
        model: 'gemini-2.5-flash',
        temperature: 0.75,
        maxOutputTokens: 100,
      });
      
      if (result.text) {
        return this.cleanMessage(result.text);
      }
      
      return this.getSmartFallback('fallback_help', { userName });
    } catch (error) {
      return this.getSmartFallback('fallback_help', { userName });
    }
  }
  
  private buildPrompt(context: MessageContext, params: MessageParams): string {
    const contextDescriptions: Record<MessageContext, string> = {
      user_joined: `Generate a brief chat notification that ${params.userName} has joined ${params.roomName || 'the room'}. Keep it simple, like IRC.`,
      user_left: `Generate a brief notification that ${params.userName} has left the chat.`,
      motd: `Generate a one-line MOTD for ${params.roomName}. Mention /help command.`,
      welcome_customer: `Welcome ${params.userName} to support. Ask how you can help. Be warm but brief.`,
      welcome_staff: `Welcome staff member ${params.userName} back. Mention the room is active.`,
      voice_granted: `Tell ${params.userName} they can now speak in the chat. Keep it casual.`,
      voice_pending: `Tell ${params.userName} to wait a moment while they're being connected.`,
      ticket_created: `Confirm ticket ${params.ticketNumber} was created for ${params.userName}. ${params.queuePosition ? `They're #${params.queuePosition} in queue.` : ''}`,
      escalation_needed: `Tell ${params.userName} you're bringing in human help. Be reassuring.`,
      staff_assigned: `Announce that ${params.staffName} (${params.staffRole}) is now helping.`,
      no_staff_available: `Tell the user no staff is available but you're logging their issue.`,
      fallback_help: `Acknowledge you're looking into their request. Be brief.`,
      queue_update: `Update ${params.userName} on their queue position (#${params.queuePosition}, ~${params.waitTime} min).`,
    };
    
    return contextDescriptions[context] + ' Keep under 30 words. No emojis. Natural language.';
  }
  
  private getSystemInstruction(): string {
    return `You generate chat messages for ${PLATFORM.name}'s support system. Rules:
1. Sound human, not robotic
2. Be concise - under 30 words
3. No emojis ever
4. No corporate buzzwords
5. Direct and helpful
6. Like a knowledgeable coworker, not a bot`;
  }
  
  private getSmartFallback(context: MessageContext, params: MessageParams): string {
    const fallbackFn = SMART_FALLBACKS[context];
    if (fallbackFn) {
      return fallbackFn(params);
    }
    return `Got it. Working on this now.`;
  }
  
  private cleanMessage(text: string): string {
    // Remove quotes, excessive punctuation, and clean up
    return text
      .replace(/^["']|["']$/g, '')
      .replace(/\n+/g, ' ')
      .trim();
  }
  
  private addVariation(message: string): string {
    // Add slight natural variation to cached messages
    const variations = ['', ' ', ''];
    return message + variations[Math.floor(Math.random() * variations.length)];
  }
  
  private getCommandsForModes(modes: string[]): string[] {
    const commands = ['/help'];
    if (modes.includes('support') || modes.includes('sup')) {
      commands.push('/status', '/escalate', '/ticket');
    }
    if (modes.includes('org')) {
      commands.push('/who', '/topic');
    }
    return commands.slice(0, 4);
  }
}

export const dynamicMessageService = new DynamicMessageService();
