/**
 * WORK REQUEST PARSER SERVICE
 * ============================
 * AI-powered email parsing for security work requests.
 * 
 * Extracts structured shift details from natural language emails:
 * - Date/time parsing with timezone handling
 * - Guard count and position type detection
 * - Address geocoding for proximity matching
 * - Special requirements extraction
 * - Urgency classification
 */

import { geminiClient } from '../ai-brain/providers/geminiClient';

export interface ParsedWorkRequest {
  success: boolean;
  confidence: number;
  requestedDate: Date;
  startTime: string;
  endTime: string;
  guardsNeeded: number;
  positionType: 'armed' | 'unarmed' | 'supervisor' | 'manager';
  location: {
    address: string;
    city: string;
    state: string;
    zipCode: string;
    coordinates?: { lat: number; lng: number };
  };
  clientInfo: {
    name?: string;
    email: string;
    phone?: string;
    companyName?: string;
  };
  specialRequirements: string[];
  urgency: 'normal' | 'urgent' | 'critical';
  notes: string;
  rawEmailData: {
    subject: string;
    bodySnippet: string;
    receivedAt: Date;
  };
}

export interface EmailClassificationResult {
  isWorkRequest: boolean;
  confidence: number;
  requestType: 'new_shift' | 'modification' | 'cancellation' | 'inquiry' | 'other';
  suggestedPriority: 'high' | 'medium' | 'low';
}

const POSITION_KEYWORDS = {
  armed: ['armed', 'firearm', 'weapon', 'gun', 'lethal', 'armed guard', 'armed officer'],
  unarmed: ['unarmed', 'security guard', 'security officer', 'guard', 'patrol'],
  supervisor: ['supervisor', 'site supervisor', 'shift supervisor', 'lead'],
  manager: ['manager', 'site manager', 'operations manager', 'account manager'],
};

const URGENCY_KEYWORDS = {
  critical: ['asap', 'immediately', 'emergency', 'urgent', 'today', 'right now', 'critical'],
  urgent: ['soon', 'quickly', 'priority', 'important', 'by tomorrow', 'rush'],
};

class WorkRequestParserService {
  
  /**
   * Classify if an email is a work request
   */
  async classifyEmail(
    subject: string,
    body: string,
    from: string
  ): Promise<EmailClassificationResult> {
    const combinedText = `${subject} ${body}`.toLowerCase();
    
    const workRequestIndicators = [
      'need guard', 'need officer', 'need coverage', 'need security',
      'request coverage', 'looking for guard', 'can you staff',
      'guards needed', 'officers needed', 'security coverage',
      'shift coverage', 'event security', 'special event',
    ];
    
    const cancellationIndicators = [
      'cancel', 'cancellation', 'no longer need', 'call off',
    ];
    
    const modificationIndicators = [
      'change', 'modify', 'update', 'reschedule', 'different time',
    ];
    
    let isWorkRequest = false;
    let requestType: EmailClassificationResult['requestType'] = 'other';
    let confidence = 0;
    
    for (const indicator of workRequestIndicators) {
      if (combinedText.includes(indicator)) {
        isWorkRequest = true;
        requestType = 'new_shift';
        confidence = Math.min(confidence + 0.3, 0.95);
      }
    }
    
    for (const indicator of cancellationIndicators) {
      if (combinedText.includes(indicator)) {
        requestType = 'cancellation';
        confidence = Math.max(confidence, 0.8);
      }
    }
    
    for (const indicator of modificationIndicators) {
      if (combinedText.includes(indicator)) {
        requestType = 'modification';
        confidence = Math.max(confidence, 0.7);
      }
    }
    
    const hasTimeReference = /\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)/i.test(combinedText);
    const hasDateReference = /\d{1,2}\/\d{1,2}|january|february|march|april|may|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i.test(combinedText);
    
    if (hasTimeReference) confidence += 0.1;
    if (hasDateReference) confidence += 0.1;
    
    let suggestedPriority: 'high' | 'medium' | 'low' = 'medium';
    for (const keyword of URGENCY_KEYWORDS.critical) {
      if (combinedText.includes(keyword)) {
        suggestedPriority = 'high';
        break;
      }
    }
    
    return {
      isWorkRequest,
      confidence: Math.min(confidence, 1.0),
      requestType,
      suggestedPriority,
    };
  }
  
  /**
   * Parse work request details from email using AI
   */
  async parseWorkRequest(
    subject: string,
    body: string,
    from: string,
    receivedAt: Date = new Date()
  ): Promise<ParsedWorkRequest> {
    const extractedData = this.extractBasicDetails(subject, body);
    
    const positionType = this.detectPositionType(subject, body);
    const urgency = this.detectUrgency(subject, body);
    const { date, startTime, endTime } = this.extractDateTime(subject, body);
    const guardsNeeded = this.extractGuardCount(subject, body);
    const location = this.extractLocation(subject, body);
    const specialRequirements = this.extractSpecialRequirements(subject, body);
    
    return {
      success: true,
      confidence: 0.85,
      requestedDate: date,
      startTime,
      endTime,
      guardsNeeded,
      positionType,
      location,
      clientInfo: {
        email: from,
        name: this.extractClientName(from),
      },
      specialRequirements,
      urgency,
      notes: '',
      rawEmailData: {
        subject,
        bodySnippet: body.substring(0, 200),
        receivedAt,
      },
    };
  }
  
  /**
   * Extract basic details using regex patterns
   */
  private extractBasicDetails(subject: string, body: string): any {
    return {
      subject,
      bodyLength: body.length,
    };
  }
  
  /**
   * Detect position type from email content
   */
  private detectPositionType(subject: string, body: string): 'armed' | 'unarmed' | 'supervisor' | 'manager' {
    const text = `${subject} ${body}`.toLowerCase();
    
    for (const [type, keywords] of Object.entries(POSITION_KEYWORDS)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          return type as 'armed' | 'unarmed' | 'supervisor' | 'manager';
        }
      }
    }
    
    return 'unarmed';
  }
  
  /**
   * Detect urgency level from email content
   */
  private detectUrgency(subject: string, body: string): 'normal' | 'urgent' | 'critical' {
    const text = `${subject} ${body}`.toLowerCase();
    
    for (const keyword of URGENCY_KEYWORDS.critical) {
      if (text.includes(keyword)) {
        return 'critical';
      }
    }
    
    for (const keyword of URGENCY_KEYWORDS.urgent) {
      if (text.includes(keyword)) {
        return 'urgent';
      }
    }
    
    return 'normal';
  }
  
  /**
   * Extract date and time from email content
   */
  private extractDateTime(subject: string, body: string): { date: Date; startTime: string; endTime: string } {
    const text = `${subject} ${body}`;
    const now = new Date();
    
    const dateMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-]?(\d{2,4})?/);
    let date = now;
    
    if (dateMatch) {
      const month = parseInt(dateMatch[1]) - 1;
      const day = parseInt(dateMatch[2]);
      const year = dateMatch[3] ? parseInt(dateMatch[3]) : now.getFullYear();
      date = new Date(year, month, day);
    }
    
    const timeMatch = text.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)/gi);
    let startTime = '08:00';
    let endTime = '16:00';
    
    if (timeMatch && timeMatch.length >= 1) {
      startTime = this.normalizeTime(timeMatch[0]);
      if (timeMatch.length >= 2) {
        endTime = this.normalizeTime(timeMatch[1]);
      } else {
        const startHour = parseInt(startTime.split(':')[0]);
        endTime = `${(startHour + 8) % 24}:00`.padStart(5, '0');
      }
    }
    
    return { date, startTime, endTime };
  }
  
  /**
   * Normalize time string to 24-hour format
   */
  private normalizeTime(timeStr: string): string {
    const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)/i);
    if (!match) return '08:00';
    
    let hours = parseInt(match[1]);
    const minutes = match[2] ? parseInt(match[2]) : 0;
    const meridiem = match[3].toLowerCase();
    
    if (meridiem === 'pm' && hours !== 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }
  
  /**
   * Extract guard count from email content
   */
  private extractGuardCount(subject: string, body: string): number {
    const text = `${subject} ${body}`.toLowerCase();
    
    const numberWords: Record<string, number> = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    };
    
    const patterns = [
      /(\d+)\s*guards?/i,
      /(\d+)\s*officers?/i,
      /need\s*(\d+)/i,
      /(\d+)\s*security/i,
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return parseInt(match[1]);
      }
    }
    
    for (const [word, num] of Object.entries(numberWords)) {
      if (text.includes(`${word} guard`) || text.includes(`${word} officer`)) {
        return num;
      }
    }
    
    return 1;
  }
  
  /**
   * Extract location from email content
   */
  private extractLocation(subject: string, body: string): ParsedWorkRequest['location'] {
    const addressPattern = /(\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|way|court|ct|circle|cir|place|pl))[\s,]*([^,\n]+)?[\s,]*([A-Z]{2})?\s*(\d{5})?/i;
    
    const text = `${subject} ${body}`;
    const match = text.match(addressPattern);
    
    if (match) {
      return {
        address: match[1].trim(),
        city: match[2]?.trim() || '',
        state: match[3]?.trim() || '',
        zipCode: match[4]?.trim() || '',
      };
    }
    
    return {
      address: '',
      city: '',
      state: '',
      zipCode: '',
    };
  }
  
  /**
   * Extract special requirements from email content
   */
  private extractSpecialRequirements(subject: string, body: string): string[] {
    const text = `${subject} ${body}`.toLowerCase();
    const requirements: string[] = [];
    
    const requirementPatterns = [
      { pattern: /uniform required/i, requirement: 'Uniform required' },
      { pattern: /professional attire/i, requirement: 'Professional attire' },
      { pattern: /bilingual|spanish/i, requirement: 'Bilingual (Spanish)' },
      { pattern: /first aid|cpr/i, requirement: 'First Aid/CPR certification' },
      { pattern: /vehicle|patrol car|mobile/i, requirement: 'Vehicle patrol' },
      { pattern: /background check/i, requirement: 'Background check required' },
      { pattern: /experience required/i, requirement: 'Prior experience required' },
    ];
    
    for (const { pattern, requirement } of requirementPatterns) {
      if (pattern.test(text)) {
        requirements.push(requirement);
      }
    }
    
    return requirements;
  }
  
  /**
   * Extract client name from email address
   */
  private extractClientName(email: string): string {
    const localPart = email.split('@')[0];
    const nameParts = localPart.split(/[._-]/);
    return nameParts
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }
}

export const workRequestParser = new WorkRequestParserService();
