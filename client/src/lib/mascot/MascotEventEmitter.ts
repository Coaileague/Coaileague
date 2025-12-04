/**
 * MascotEventEmitter - Global event system for mascot emote triggers
 * 
 * Allows any component to trigger mascot emotes without needing 
 * direct access to the mascot hooks.
 */

type MascotEventListener = (trigger: string) => void;

class MascotEventEmitterClass {
  private listeners: Set<MascotEventListener> = new Set();

  subscribe(listener: MascotEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(trigger: string): void {
    this.listeners.forEach(listener => {
      try {
        listener(trigger);
      } catch (error) {
        console.error('[MascotEventEmitter] Error in listener:', error);
      }
    });
  }

  // Convenience methods for common onboarding events
  orgCreated(): void {
    this.emit('org_created');
  }

  invitationSent(): void {
    this.emit('invitation_sent');
  }

  invitationAccepted(): void {
    this.emit('invitation_accepted');
  }

  roleAssigned(): void {
    this.emit('role_assigned');
  }

  clientWelcomeSent(): void {
    this.emit('client_welcome_sent');
  }

  employeeOnboarded(): void {
    this.emit('employee_onboarded');
  }

  taskCompleted(): void {
    this.emit('task_complete');
  }

  formSubmitted(): void {
    this.emit('form_submit');
  }

  errorOccurred(): void {
    this.emit('error_occurred');
  }
}

export const mascotEvents = new MascotEventEmitterClass();
