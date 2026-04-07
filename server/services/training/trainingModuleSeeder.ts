/**
 * Officer Training Module Seeder
 * ================================
 * Seeds 10 platform-default training modules for security guard companies.
 * Each module has sections with real educational content, flashcard_data,
 * section quiz questions, and final exam questions.
 *
 * Safe to run multiple times — uses INSERT WHERE NOT EXISTS pattern.
 */

import { db } from '../../db';
import {
  trainingModules,
  trainingSections,
  trainingQuestions,
} from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';

interface FlashCard {
  front: string;
  back: string;
}

interface QuestionOption {
  id: string;
  text: string;
}

interface SectionDef {
  title: string;
  contentBody: string;
  flashcardData: FlashCard[];
  quizQuestions: Array<{
    questionText: string;
    options: QuestionOption[];
    correctAnswer: string;
    explanation: string;
  }>;
}

interface ModuleDef {
  title: string;
  description: string;
  category: string;
  passingScore: number;
  certificateValidDays: number;
  isRequired: boolean;
  stateCreditHours: string;
  orderIndex: number;
  sections: SectionDef[];
  finalExamQuestions: Array<{
    questionText: string;
    options: QuestionOption[];
    correctAnswer: string;
    explanation: string;
  }>;
}

function opts(a: string, b: string, c: string, d: string): QuestionOption[] {
  return [
    { id: 'a', text: a },
    { id: 'b', text: b },
    { id: 'c', text: c },
    { id: 'd', text: d },
  ];
}

const PLATFORM_MODULES: ModuleDef[] = [
  // ─── MODULE 1 ─────────────────────────────────────────────────────────────
  {
    title: 'Legal Authority of Private Security',
    description: 'Understanding the legal boundaries, authority, and responsibilities of private security officers in the United States.',
    category: 'legal',
    passingScore: 80,
    certificateValidDays: 365,
    isRequired: true,
    stateCreditHours: '2.00',
    orderIndex: 1,
    sections: [
      {
        title: 'What Is Private Security?',
        contentBody: `Private security officers are civilians employed by private companies, organizations, or individuals to protect people, property, and information. Unlike law enforcement officers, private security personnel derive their authority from the property rights of their employer or client — not from the state.

Private security fills a critical gap in public safety infrastructure. In the United States, private security officers outnumber sworn law enforcement officers by approximately three to one. Security officers work in retail, healthcare, corporate campuses, residential communities, events, and critical infrastructure.

Understanding your exact role is essential. You are an agent of your client, assigned to observe and report, deter crime through visible presence, and respond to incidents within the scope of your authority. You are not a police officer, deputy, or agent of the government in any law enforcement capacity.

Your authority stems from three sources: (1) the authority your client grants you as a representative of their property, (2) the rights any private citizen possesses under applicable state law, and (3) the policies and procedures your employer has established for your role.`,
        flashcardData: [
          { front: 'Primary source of a security officer\'s authority', back: 'The property rights of the client — not state police power. Security officers are agents of their employer or client.' },
          { front: 'Key difference: private security vs. law enforcement', back: 'Law enforcement officers exercise state police power. Security officers exercise rights delegated by a private property owner within the bounds of civilian law.' },
          { front: 'Three sources of security officer authority', back: '1. Client/employer delegation\n2. Private citizen rights under state law\n3. Company policies and procedures' },
        ],
        quizQuestions: [
          {
            questionText: 'Where does a private security officer\'s primary legal authority come from?',
            options: opts('State police power delegated by the governor', 'The property rights of their client or employer', 'A federal security officer license', 'The state criminal code automatically grants them authority'),
            correctAnswer: 'b',
            explanation: 'Security officers are civilians whose authority is delegated from their client\'s property rights, not from governmental police power.',
          },
          {
            questionText: 'Which statement best describes the role of private security officers in the United States?',
            options: opts('They have the same authority as police officers while on duty', 'They outnumber sworn law enforcement officers by approximately 3 to 1', 'They are deputized agents of the local sheriff', 'They are required to assist law enforcement in all situations'),
            correctAnswer: 'b',
            explanation: 'There are approximately three private security officers for every sworn law enforcement officer in the U.S., making private security a critical component of public safety infrastructure.',
          },
        ],
      },
      {
        title: 'Legal Authority vs. Law Enforcement',
        contentBody: `One of the most important distinctions in private security is understanding what you can and cannot do compared to sworn law enforcement officers. This distinction protects both you and the public, and failing to understand it creates serious legal liability.

A sworn law enforcement officer has the power of arrest backed by state authority, can conduct warrantless searches under certain conditions, can compel cooperation from citizens, and is protected by qualified immunity in certain circumstances. Private security officers have none of these powers by default.

As a security officer, you cannot compel anyone to stop, answer questions, or submit to a search — unless they voluntarily consent. You cannot detain someone without a lawful basis under your state's citizen's arrest or merchant privilege statutes. You cannot conduct a search of a person without their consent, though you may require consent as a condition of entry to a private property.

The critical advantage private security has that law enforcement does not is the ability to enforce property rules without needing probable cause of a crime. You can remove someone from private property for violating posted rules, behaving in a disruptive manner, or simply because the property owner no longer wishes them to be there. This trespass removal authority does not require any criminal act.`,
        flashcardData: [
          { front: 'Can a security officer compel someone to answer questions?', back: 'No. Cooperation is voluntary. You can request information but cannot compel anyone to answer.' },
          { front: 'Trespass removal — does a crime need to occur?', back: 'No. A property owner can remove anyone from private property for any non-discriminatory reason, including simply not wanting them there.' },
          { front: 'Qualified immunity — does it apply to security officers?', back: 'No. Qualified immunity applies to government actors. Security officers can face personal civil liability for improper detentions, use of force, or rights violations.' },
        ],
        quizQuestions: [
          {
            questionText: 'A security officer wishes to remove a person from a shopping mall. Must the person have committed a crime?',
            options: opts('Yes — a crime must have occurred for removal to be lawful', 'No — the property owner can remove anyone for any non-discriminatory reason', 'Only if the property owner is present to authorize the removal', 'Yes — at minimum a misdemeanor must be observed'),
            correctAnswer: 'b',
            explanation: 'Private property owners, and their agents (security officers), may remove persons from their property for any lawful, non-discriminatory reason without requiring a criminal act.',
          },
          {
            questionText: 'Which protection does a sworn law enforcement officer have that a private security officer does not?',
            options: opts('The right to use force in self-defense', 'The right to be present in public spaces', 'Qualified immunity from civil lawsuits in certain circumstances', 'The right to issue verbal commands'),
            correctAnswer: 'c',
            explanation: 'Qualified immunity applies to government officials acting in their official capacity. Security officers, as private citizens, do not have this protection and can face personal civil liability.',
          },
        ],
      },
      {
        title: 'Trespass and Removal Authority',
        contentBody: `Understanding trespass law is central to every security officer's daily operations. Trespass refers to the unlawful presence of a person on private property after being given notice to leave. The key elements are: (1) the property must be privately owned or controlled, (2) the person must have been given adequate notice that they are not welcome, and (3) the person must remain or return despite that notice.

Notice can be given in multiple ways: posted signs at entrances, verbal notice from an authorized representative, a written trespass notice, or prior notice from a previous incident. In many states, once a person has been given formal trespass notice and a record kept, law enforcement can arrest them for criminal trespass if they return.

When removing a person, the most important principle is that the removal must be peaceful. You are not authorized to physically remove someone who refuses to leave unless you have lawful authority to detain or arrest them — and in most jurisdictions, that authority is narrow. The correct response in most situations is to request they leave, document their refusal, and contact law enforcement to complete the removal.

Always document every trespass incident: date, time, location, person's description or identifying information (if available), the nature of the notice given, their response, and outcome. This documentation protects your client, your company, and you.`,
        flashcardData: [
          { front: 'Three elements required for a valid trespass', back: '1. Private property or controlled property\n2. Adequate notice given to the person\n3. Person remains or returns after notice' },
          { front: 'What to do when someone refuses to leave after a trespass warning', back: 'Document the refusal and call law enforcement. Do not physically remove someone who refuses to leave without lawful detention authority.' },
          { front: 'How can trespass notice be given?', back: 'Posted signs, verbal notice from authorized representative, written trespass notice, or documented prior notice from a previous incident.' },
        ],
        quizQuestions: [
          {
            questionText: 'A person refuses to leave private property after being told to do so. What is the correct security officer response in most situations?',
            options: opts('Physically carry the person off the property', 'Document the situation and contact law enforcement', 'Issue a citation for trespassing', 'Detain the person until the property owner arrives'),
            correctAnswer: 'b',
            explanation: 'The correct response is documentation and contacting law enforcement. Physically removing a non-compliant person creates excessive force liability in most situations.',
          },
        ],
      },
      {
        title: "Citizen's Arrest — When and How",
        contentBody: `Most U.S. states permit citizens, including security officers acting as private citizens, to make an arrest when they directly witness a felony or, in some states, a misdemeanor that constitutes a breach of the peace. This is called a "citizen's arrest" or in the merchant context, "merchant's privilege" or "shopkeeper's privilege."

The legal standards for citizen's arrest vary significantly by state. In general: (1) the arrest must be based on the citizen directly witnessing the felony — hearsay is not sufficient in most states, (2) only reasonable force may be used, (3) the detained person must be turned over to law enforcement promptly, and (4) a mistaken citizen's arrest can expose you and your employer to significant civil and potentially criminal liability.

The threshold for exercising citizen's arrest authority should be extremely high. Ask: Is this clearly a felony? Did I personally witness the act? Is the identity of the suspect certain? Can I safely and lawfully detain them until law enforcement arrives? If the answer to any of these questions is uncertain, the safer course is to observe, document, and report to law enforcement rather than detain.

Merchant privilege statutes in most states give retail establishments (and their security agents) broader authority to detain a suspected shoplifter for a reasonable time for investigation — but this privilege is narrow, applies only to the specific theft context, and requires reasonable grounds, not certainty, of theft.`,
        flashcardData: [
          { front: "Citizen's arrest — general requirement", back: 'The security officer must directly witness a felony. Hearsay or secondhand reports are not sufficient in most states.' },
          { front: 'Merchant privilege / shopkeeper\'s privilege', back: 'Allows retail establishments to detain a suspected shoplifter for a reasonable time for investigation. Requires reasonable grounds of theft — not certainty.' },
          { front: "If a citizen's arrest is mistaken — consequences", back: 'Civil liability for false imprisonment, and potentially criminal charges for the officer and employer. The threshold to exercise this authority must be high.' },
        ],
        quizQuestions: [
          {
            questionText: "Under most state citizen's arrest statutes, what is the minimum requirement to lawfully detain a suspected thief?",
            options: opts('A report from a third party that a theft occurred', 'The officer directly witnessing the criminal act', 'Reasonable suspicion based on the person\'s appearance', 'A signed authorization from the property manager'),
            correctAnswer: 'b',
            explanation: "In most states, citizen's arrest authority requires that the arresting citizen directly witnessed the felony — not hear about it secondhand.",
          },
          {
            questionText: 'A security officer detains a person they believe stole merchandise but is mistaken. What is the most likely consequence?',
            options: opts('No consequence — good faith mistakes are always protected', 'Civil liability for false imprisonment against the officer and employer', 'Automatic immunity because the officer was on duty', 'A written warning from the security company'),
            correctAnswer: 'b',
            explanation: 'A mistaken citizen\'s arrest can expose the security officer and their employer to civil liability for false imprisonment. Good faith is not an automatic defense.',
          },
        ],
      },
      {
        title: 'Documentation Requirements',
        contentBody: `Thorough, accurate documentation is the foundation of every professional security operation. Documentation serves multiple purposes: it creates an accurate record of incidents, it protects you and your employer in legal proceedings, it enables pattern identification, and it fulfills contractual obligations to your client.

Every security officer must understand the basics of report writing: reports should be factual (only what you observed, heard, or did — not speculation), objective (avoid emotional language or personal conclusions), complete (who, what, when, where, how — every incident), and timely (written as soon as possible after the incident while memory is fresh).

At minimum, a security incident report should include: (1) date and exact time, (2) exact location within the property, (3) names and descriptions of all involved parties, (4) what you observed before, during, and after the incident, (5) verbatim or near-verbatim quotes of significant statements, (6) actions you took and their outcomes, (7) names of any witnesses or law enforcement officers involved, and (8) your printed name, signature, badge number, and report time.

Never alter, delete, or amend a completed incident report without supervisory approval and a documented amendment process. In legal proceedings, reports can be examined for consistency with other evidence. Alterations can be used to impute dishonesty.`,
        flashcardData: [
          { front: 'Four qualities of a good security report', back: 'Factual — only observations, not speculation\nObjective — no emotional language\nComplete — who, what, when, where, how\nTimely — written immediately after the incident' },
          { front: 'Why is documentation important for security officers?', back: 'Protects officer and employer in legal proceedings, creates accurate incident records, enables pattern identification, and fulfills client contract obligations.' },
          { front: 'When should a security incident report be written?', back: 'As soon as possible after the incident while memory is fresh. Delayed reports are vulnerable to legal challenge.' },
        ],
        quizQuestions: [
          {
            questionText: 'Which of the following should NOT be included in a security incident report?',
            options: opts('The exact time the incident occurred', 'The officer\'s opinion about why the person behaved as they did', 'Verbatim quotes from parties involved', 'Names of witnesses present at the scene'),
            correctAnswer: 'b',
            explanation: 'Security reports should be factual and objective. Personal opinions, speculation, and conclusions about why people behaved as they did are inappropriate and can create legal liability.',
          },
        ],
      },
    ],
    finalExamQuestions: [
      { questionText: 'A private security officer\'s legal authority is primarily derived from:', options: opts('State police powers delegated by local government', 'Property rights of the client or employer', 'A federal security certification', 'The Fourth Amendment to the U.S. Constitution'), correctAnswer: 'b', explanation: 'Security officers are civilians whose authority comes from the property rights delegated by their client.' },
      { questionText: 'Which of the following can a private security officer do that a police officer cannot do without reasonable suspicion?', options: opts('Make a felony arrest', 'Conduct a warrantless search', 'Remove someone from private property for rule violations', 'Issue citations for misdemeanors'), correctAnswer: 'c', explanation: 'Security officers can remove people from private property for violating posted rules — without needing reasonable suspicion of a crime.' },
      { questionText: 'Qualified immunity protects which category of worker?', options: opts('Any licensed security officer', 'Government officials acting in official capacity', 'Private security officers with 5+ years experience', 'Any worker who acts in good faith'), correctAnswer: 'b', explanation: 'Qualified immunity is a legal doctrine that protects government officials, not private security officers.' },
      { questionText: 'Three elements required for a valid trespass are: private property, adequate notice given, and:', options: opts('A crime has been committed', 'A witness is present', 'The person remains or returns after notice', 'Law enforcement has been notified'), correctAnswer: 'c', explanation: 'The person must remain or return after being given adequate notice to leave.' },
      { questionText: 'Under merchant privilege statutes, security officers may detain a suspected shoplifter if they have:', options: opts('Absolute certainty the theft occurred', 'Reasonable grounds to suspect theft occurred', 'Observed the theft on camera only', 'Received a tip from another customer'), correctAnswer: 'b', explanation: 'Merchant privilege requires reasonable grounds — not certainty — of theft.' },
      { questionText: 'A security officer should alter a completed incident report when:', options: opts('They remember additional facts after signing', 'They are asked by a manager to remove embarrassing details', 'Only with supervisory approval and a documented amendment process', 'They believe the original was too long'), correctAnswer: 'c', explanation: 'Reports should only be amended with supervisory approval and a documented amendment process to preserve integrity.' },
      { questionText: 'Which is NOT a valid form of trespass notice?', options: opts('Posted signs at property entrances', 'Verbal notice from an authorized representative', 'An officer\'s private belief that someone should not be there', 'A written trespass notice on file'), correctAnswer: 'c', explanation: 'An officer\'s private, uncommunicated belief is not a form of notice. Notice must be communicated to the subject.' },
      { questionText: 'After a citizen\'s arrest, the detained person must be:', options: opts('Held until a manager arrives', 'Released on the officer\'s own authority after questioning', 'Turned over to law enforcement promptly', 'Photographed and logged before release'), correctAnswer: 'c', explanation: 'After a citizen\'s arrest, the detained person must be turned over to law enforcement as promptly as possible.' },
      { questionText: 'Security officers in the U.S. outnumber sworn law enforcement officers by approximately:', options: opts('Equal numbers', '1.5 to 1', '3 to 1', '10 to 1'), correctAnswer: 'c', explanation: 'There are approximately three private security officers for every sworn law enforcement officer in the United States.' },
      { questionText: 'Which statement about a mistaken citizen\'s arrest is accurate?', options: opts('The officer is automatically protected if they acted in good faith', 'It can result in civil liability for false imprisonment', 'The employer has no liability for officer mistakes', 'It is a minor administrative issue only'), correctAnswer: 'b', explanation: 'A mistaken citizen\'s arrest can expose both the officer and their employer to civil liability for false imprisonment.' },
      { questionText: 'An incident report should be written:', options: opts('At the end of the security officer\'s shift', 'Within 24 hours of the incident', 'As soon as possible after the incident while memory is fresh', 'Only if the incident results in police involvement'), correctAnswer: 'c', explanation: 'Timely reporting — as soon as possible after the incident — ensures accuracy and is harder to challenge in legal proceedings.' },
      { questionText: 'A security officer can compel a visitor to answer questions about suspicious behavior.', options: opts('True — this is part of the officer\'s authority', 'False — cooperation is always voluntary', 'True — but only if the visitor is on client property', 'True — if the officer is licensed'), correctAnswer: 'b', explanation: 'Security officers cannot compel cooperation. Visitors may refuse to answer questions, and the officer must use other tools (observation, law enforcement notification, removal) if appropriate.' },
      { questionText: 'What is the most important thing to do before physically removing someone from private property?', options: opts('Warn them verbally and document their refusal', 'Confirm with the property owner in writing', 'Obtain a police escort', 'Issue a formal written warning on company letterhead'), correctAnswer: 'a', explanation: 'Verbal warning and documentation of refusal creates a record and is the appropriate first step. In most cases, law enforcement completes physical removals when subjects refuse to comply.' },
      { questionText: 'A security officer is told by a coworker that a shopper stole an item. Can the officer make a citizen\'s arrest based on this?', options: opts('Yes — a coworker\'s report is sufficient', 'No — in most states the officer must have directly witnessed the act', 'Yes — if the coworker is a supervisor', 'Yes — if two employees report the same person'), correctAnswer: 'b', explanation: 'In most states, citizen\'s arrest requires the officer to directly witness the felony. A secondhand report is not sufficient.' },
      { questionText: 'Security officers are subject to which of the following that law enforcement officers may not be?', options: opts('More restrictive use of force standards', 'Full personal civil liability for improper detentions', 'Warrantless search authority on private property', 'Criminal background requirements'), correctAnswer: 'b', explanation: 'Without qualified immunity, security officers face full personal civil liability for false imprisonment, improper force, or rights violations.' },
    ],
  },

  // ─── MODULE 2 ─────────────────────────────────────────────────────────────
  {
    title: 'Use of Force Continuum',
    description: 'Understanding the levels of force, proportional response, and post-incident documentation requirements for private security officers.',
    category: 'use_of_force',
    passingScore: 80,
    certificateValidDays: 365,
    isRequired: true,
    stateCreditHours: '2.00',
    orderIndex: 2,
    sections: [
      {
        title: 'Levels of Force',
        contentBody: `The use of force continuum is a framework that guides officers in selecting an appropriate level of force in response to a subject's behavior. The continuum is not a rigid ladder — officers may skip levels based on the immediacy and severity of the threat — but it establishes proportionality as the guiding principle.

The levels of force, in ascending order, are: (1) Officer presence — the mere presence of a uniformed officer is often sufficient to deter undesirable behavior, (2) Verbal commands — clear, calm, and firm verbal directions, (3) Soft empty-hand control — techniques that guide or redirect without striking, such as escort holds and control holds, (4) Hard empty-hand control — techniques that may cause pain or minor injury, such as joint locks and takedowns, (5) Intermediate weapons — tools such as OC spray or batons where authorized, and (6) Deadly force — force likely to cause death or serious bodily injury, used only as a last resort when there is an imminent threat to life.

For private security officers, the authorization to use any level of force beyond verbal commands varies by state law, company policy, and the specific post order for the assignment. Many security assignments authorize only officer presence and verbal commands. Officers must know exactly what force they are authorized to use at their specific post.

The key legal test for all use of force situations is reasonableness: would a reasonable officer in the same circumstances, with the same knowledge, have used the same level of force? Courts evaluate force decisions from the perspective of the officer at the moment of the decision — not with hindsight.`,
        flashcardData: [
          { front: 'Six levels of force continuum', back: '1. Officer presence\n2. Verbal commands\n3. Soft empty-hand control\n4. Hard empty-hand control\n5. Intermediate weapons\n6. Deadly force' },
          { front: 'Legal test for use of force', back: 'Reasonableness: would a reasonable officer with the same knowledge in the same circumstances have used the same level of force?' },
          { front: 'Key principle of force selection', back: 'Proportionality — the force used must match the threat presented. Officers may escalate or de-escalate rapidly based on subject behavior.' },
        ],
        quizQuestions: [
          {
            questionText: 'What is the first and least intrusive level in the use of force continuum?',
            options: opts('Verbal commands', 'Soft empty-hand control', 'Officer presence', 'Intermediate weapons'),
            correctAnswer: 'c',
            explanation: 'Officer presence — the mere presence of a uniformed security officer — is the least intrusive level and is often sufficient to deter undesirable behavior.',
          },
          {
            questionText: 'The legal standard for evaluating a security officer\'s use of force is:',
            options: opts('Whether the officer intended to cause harm', 'Whether a reasonable officer in the same situation would have made the same decision', 'Whether the subject was ultimately convicted of a crime', 'Whether the officer followed their exact training manual'),
            correctAnswer: 'b',
            explanation: 'Courts evaluate force decisions by the "reasonable officer" standard — from the perspective of the officer at the moment of the decision.',
          },
        ],
      },
      {
        title: 'Proportional Response',
        contentBody: `Proportionality is the cornerstone of lawful use of force. The amount of force used must match the threat being presented at that specific moment. Using excessive force — even against someone who has committed a crime — is unlawful and creates significant personal and employer liability.

Proportionality requires dynamic assessment. A threat level can escalate or de-escalate in seconds. An officer who begins with verbal commands must immediately reassess as the subject's behavior changes. If a subject complies, the officer must immediately reduce force. If a subject escalates, the officer must respond appropriately.

Critical factors in assessing proportionality: (1) Subject size, strength, and apparent ability to cause harm, (2) The number of subjects vs. officers present, (3) Whether the subject has a weapon or appears to have one, (4) The subject's stated intent, (5) The immediacy of the threat, and (6) The proximity — how close is the subject, and how quickly can they reach you or a third party?

Officers must never use force as punishment or retaliation after a threat has ended. Force is only authorized to stop an active threat. Once the threat has ceased — whether the subject has been controlled, has fled, or has surrendered — all use of force must immediately cease.`,
        flashcardData: [
          { front: 'When must an officer immediately reduce force?', back: 'The moment a subject complies or the threat de-escalates. Force is only authorized to stop an active threat — never as punishment after the fact.' },
          { front: 'Six factors in assessing proportionality', back: '1. Subject size/strength\n2. Number of subjects vs. officers\n3. Presence of a weapon\n4. Stated intent\n5. Immediacy\n6. Proximity' },
          { front: 'Can force be used as punishment after a threat ends?', back: 'No. Force used after a threat has ended is unlawful. Once the threat is neutralized, all force must immediately cease.' },
        ],
        quizQuestions: [
          {
            questionText: 'A subject has been handcuffed and is now fully compliant. An officer continues to apply pain compliance techniques. This is:',
            options: opts('Acceptable if the subject was resisting moments before', 'Unlawful — force must cease once the threat is controlled', 'Acceptable if the officer believes the subject may re-resist', 'The officer\'s discretion based on training'),
            correctAnswer: 'b',
            explanation: 'Force must immediately cease once the threat is neutralized. Continuing force after compliance constitutes excessive force.',
          },
        ],
      },
      {
        title: 'Verbal Commands and Presence',
        contentBody: `Effective verbal commands and professional presence resolve the majority of security incidents without any physical contact. Mastering these skills is the most important tool a security officer has.

Professional presence means projecting calm authority. Stand straight, maintain appropriate eye contact, and speak in a measured, confident tone. Nervousness and uncertainty are communicated through body language and voice — subjects who sense uncertainty are more likely to test limits.

Verbal commands should be: clear (say exactly what you want the person to do, not what you want them to stop doing), calm (a loud or panicked officer escalates situations), specific ("Please step outside with me" is better than "You need to leave right now"), and reasonable (give the subject a chance to comply before escalating).

A critical skill is active listening during verbal engagement. When a subject is agitated, letting them speak and acknowledging their concern — without agreeing with their position — can significantly reduce tension. People who feel heard are less likely to escalate. The formula: "I understand you're frustrated about X. What I can do is Y. What I need you to do right now is Z."`,
        flashcardData: [
          { front: 'Four qualities of effective verbal commands', back: 'Clear — specific action requested\nCalm — measured tone\nSpecific — exact instruction\nReasonable — allow time to comply' },
          { front: 'Active listening formula for de-escalation', back: '"I understand you\'re frustrated about [X]. What I can do is [Y]. What I need you to do right now is [Z]."' },
          { front: 'Why does professional presence matter?', back: 'Subjects sense uncertainty. A calm, professional officer projects authority that deters escalation. Nervousness communicates weakness and invites testing.' },
        ],
        quizQuestions: [
          {
            questionText: 'Which verbal command approach is most effective?',
            options: opts('"Stop doing that right now!"', '"Would you mind possibly stepping away?"', '"Please step outside with me" — clear and specific', '"You are not allowed to be here!"'),
            correctAnswer: 'c',
            explanation: 'Specific, calm commands that tell a person exactly what action is needed are most effective. Vague commands or shouting escalates situations.',
          },
        ],
      },
      {
        title: 'Deadly Force Justification as a Private Citizen',
        contentBody: `Deadly force is the most serious force option available to any person, including a security officer. The standard for when deadly force is justified is narrow and applies equally to private citizens and security officers. No training, license, or company policy can expand a security officer's right to use deadly force beyond what state law permits for any private citizen.

In virtually every U.S. jurisdiction, deadly force is justified only when a person reasonably believes they or another person faces an imminent threat of death or serious bodily injury, and deadly force is the only reasonable option available. "Imminent" means the threat is immediate — not potential or future.

Critical rules every security officer must internalize: (1) You cannot use deadly force to protect property. Property crimes alone, regardless of value, do not justify deadly force. (2) You cannot use deadly force against a fleeing suspect who is not currently an active threat. (3) Your own fear alone is not sufficient — the threat must be reasonable and apparent to any objective observer. (4) If you have a safe option to retreat, many states require it.

After any use of deadly force, the officer should call 911 immediately, secure the scene, render aid if safe to do so, preserve evidence, and cooperate fully with law enforcement. Say nothing to anyone except your attorney until you have received legal counsel.`,
        flashcardData: [
          { front: 'When is deadly force justified?', back: 'Only when facing imminent threat of death or serious bodily injury AND deadly force is the only reasonable option. Imminence is required — not a future or potential threat.' },
          { front: 'Can deadly force protect property?', back: 'No. Property crimes alone — regardless of dollar value — do not justify deadly force in any U.S. jurisdiction.' },
          { front: 'After any use of deadly force — immediate steps', back: '1. Call 911\n2. Secure the scene\n3. Render aid if safe\n4. Preserve evidence\n5. Cooperate with law enforcement\n6. Say nothing without an attorney present' },
        ],
        quizQuestions: [
          {
            questionText: 'A shoplifter is fleeing the store with stolen merchandise worth $5,000. Can a security officer use deadly force to stop the fleeing suspect?',
            options: opts('Yes — the value of the theft justifies escalated response', 'No — property crimes alone never justify deadly force', 'Yes — if the officer reasonably believes the person will continue stealing', 'Yes — if the client has authorized the officer to use all necessary force'),
            correctAnswer: 'b',
            explanation: 'Property crimes, regardless of value, do not justify deadly force in any U.S. jurisdiction. A fleeing, non-violent suspect presents no imminent threat of death or serious bodily injury.',
          },
        ],
      },
      {
        title: 'Post-Incident Documentation',
        contentBody: `Every use of force — at any level beyond officer presence — requires immediate, thorough documentation. Post-incident documentation serves multiple functions: it creates the official record of the event, it supports or refutes legal claims, it identifies training gaps, and it fulfills regulatory and contractual obligations.

A use of force report should be completed as soon as the scene is safe. Required elements: (1) Exact time and location, (2) Description of the subject and any others present, (3) Detailed narrative of the events leading to force, including the specific subject behavior that triggered each force level used, (4) Specific force options used in sequence, (5) Subject's response to each force option, (6) When and how the situation was resolved, (7) Injuries to any party, whether first aid was rendered, and whether medical services were requested, (8) Names of witnesses and responding law enforcement.

Never downplay or omit details in a use of force report. If the force was justified, accurate documentation supports your defense. If details are omitted or minimized, it creates the appearance of a cover-up. Supervisors and attorneys will review every word.

Photographs of the scene, any injuries, and any property damage should be taken as soon as safely possible. Most states allow officers to decline to make statements to law enforcement until an attorney is present — this right should generally be exercised until you have legal counsel.`,
        flashcardData: [
          { front: 'Every use of force requires:', back: 'Immediate written documentation as soon as the scene is safe — even if the force was minimal and clearly justified.' },
          { front: 'Should details be omitted from a use of force report?', back: 'Never. Omissions create the appearance of a cover-up. If force was justified, accurate documentation is your best defense.' },
          { front: 'When should a use of force report be completed?', back: 'As soon as the scene is safe — not at the end of shift, not the next day. Fresh memory is more accurate and more defensible.' },
        ],
        quizQuestions: [
          {
            questionText: 'A security officer used a control hold that left no visible injury. Must the officer complete a use of force report?',
            options: opts('No — only visible injuries require documentation', 'No — only if the subject makes a complaint', 'Yes — every use of force beyond officer presence requires documentation', 'Only if the supervisor requests it'),
            correctAnswer: 'c',
            explanation: 'Every use of force — at any level beyond mere presence — requires documentation, regardless of outcome or injury.',
          },
        ],
      },
    ],
    finalExamQuestions: [
      { questionText: 'The use of force continuum is best described as:', options: opts('A rigid step-by-step process', 'A framework for selecting proportional force based on threat level', 'A list of prohibited force options', 'A legal document officers must carry'), correctAnswer: 'b', explanation: 'The continuum is a framework for proportional selection, not a rigid process. Officers may skip levels based on the immediate threat.' },
      { questionText: 'Force must cease immediately when:', options: opts('The officer\'s shift ends', 'The subject is handcuffed, regardless of compliance', 'The threat is neutralized and the subject is controlled or compliant', 'After 30 seconds of compliance'), correctAnswer: 'c', explanation: 'Force must end the moment the threat is neutralized — not after a waiting period, not when cuffs are applied, but when the threat is gone.' },
      { questionText: 'An officer is confronting one subject. A second subject approaches from behind. This changes the force calculation because:', options: opts('It does not change the calculation', 'Multiple subjects vs. one officer significantly increases threat level', 'The officer can now use intermediate weapons', 'The officer must retreat immediately'), correctAnswer: 'b', explanation: 'The ratio of subjects to officers is a proportionality factor. One officer facing multiple subjects faces a greater threat justifying escalated response.' },
      { questionText: 'Deadly force is justified ONLY when:', options: opts('Property is being stolen', 'There is imminent threat of death or serious bodily injury with no safe alternative', 'A felony arrest is being made', 'The subject has been trespassed multiple times'), correctAnswer: 'b', explanation: 'Deadly force requires imminent threat to life or safety, and must be the only reasonable option available.' },
      { questionText: 'A subject complies after being given a verbal command. The officer should:', options: opts('Continue to the next force level to ensure compliance', 'Immediately de-escalate and return to officer presence level', 'Maintain the current force level for 60 seconds', 'Issue a written warning before de-escalating'), correctAnswer: 'b', explanation: 'When a subject complies, force must immediately de-escalate. Continuing force beyond what is needed is excessive.' },
      { questionText: 'The most effective first response to most security incidents is:', options: opts('Immediate physical control to prevent escalation', 'Requesting backup before any engagement', 'Officer presence and clear verbal commands', 'Calling law enforcement before approaching the subject'), correctAnswer: 'c', explanation: 'Officer presence and verbal commands resolve the majority of security incidents without physical contact.' },
      { questionText: 'After a use of force incident, an officer should complete the use of force report:', options: opts('At the end of their shift', 'The next business day', 'As soon as the scene is safe', 'Only if law enforcement requests one'), correctAnswer: 'c', explanation: 'Reports should be completed as soon as the scene is safe while memory is freshest.' },
      { questionText: 'A store\'s client policy states officers may use "all necessary force" to protect merchandise. Does this expand the officer\'s legal authority to use deadly force for property crimes?', options: opts('Yes — client policies can expand officer authority', 'No — state law governs the limits of lawful force regardless of client policy', 'Yes — if the client indemnifies the officer', 'Yes — for items valued over $1,000'), correctAnswer: 'b', explanation: 'Client policies cannot expand authority beyond what state law allows. Deadly force for property crimes is unlawful regardless of what any contract says.' },
      { questionText: 'A subject verbally threatens an officer but is 30 feet away and moving away. Deadly force is:', options: opts('Justified because of the verbal threat', 'Not justified — the threat is not imminent given the distance and direction', 'Justified if the subject has a prior criminal history', 'At the officer\'s discretion'), correctAnswer: 'b', explanation: 'Imminence is required. A retreating subject at distance does not present an imminent threat.' },
      { questionText: 'Which of the following is the most important factor in any use of force analysis?', options: opts('Whether the subject was ultimately convicted', 'Whether the officer followed department policy exactly', 'Whether the force was proportional to the specific threat at that moment', 'Whether the officer warned the subject before using force'), correctAnswer: 'c', explanation: 'Proportionality to the specific threat is the central legal and ethical standard for all use of force decisions.' },
      { questionText: 'Photographs at a use of force scene should be taken:', options: opts('Only by law enforcement', 'As soon as safely possible by the security officer', 'Only if the subject requests documentation', 'After the incident report is completed'), correctAnswer: 'b', explanation: 'Officers should photograph the scene, injuries, and property damage as soon as safely possible to preserve evidence.' },
      { questionText: 'An officer\'s subjective fear of a subject is:', options: opts('Sufficient justification for use of force', 'Not sufficient alone — the threat must be objectively reasonable', 'Never relevant to force analysis', 'Sufficient if the officer has prior training'), correctAnswer: 'b', explanation: 'Personal fear is relevant but not sufficient. The threat must be objectively reasonable to an outside observer.' },
      { questionText: 'What should an officer do after any use of deadly force?', options: opts('Complete the incident report and continue the shift', 'Call 911, secure the scene, render aid if safe, and refuse to make statements without an attorney', 'Immediately report to their direct supervisor and await instructions', 'Release the subject and document the incident'), correctAnswer: 'b', explanation: 'After deadly force: call 911, secure scene, render aid if safe, preserve evidence, cooperate with police, and exercise right to counsel before making statements.' },
      { questionText: 'Hard empty-hand control techniques include:', options: opts('Escort holds and soft redirection', 'Immediate OC spray deployment', 'Joint locks and takedowns', 'Verbal commands delivered firmly'), correctAnswer: 'c', explanation: 'Hard empty-hand control techniques — such as joint locks and takedowns — are designed to overcome active resistance and may cause minor pain or injury.' },
      { questionText: 'The "reasonable officer" standard evaluates force decisions:', options: opts('With the benefit of hindsight', 'From the officer\'s perspective at the moment of the decision', 'Based on the final outcome of the incident', 'Only from the subject\'s perspective'), correctAnswer: 'b', explanation: 'Courts evaluate force from the perspective of the officer at the moment of the decision — not with hindsight about what eventually happened.' },
    ],
  },

  // ─── MODULE 3 ─────────────────────────────────────────────────────────────
  {
    title: 'De-escalation Techniques',
    description: 'Verbal and non-verbal strategies to reduce tension and resolve conflicts without physical force.',
    category: 'soft_skills',
    passingScore: 80,
    certificateValidDays: 365,
    isRequired: true,
    stateCreditHours: '1.50',
    orderIndex: 3,
    sections: [
      {
        title: 'Reading Situations',
        contentBody: `Effective de-escalation begins before a confrontation occurs. The ability to read a situation — to identify warning signs early and intervene before tension reaches a crisis point — is the single most valuable skill a security officer can develop.

Pre-escalation warning signs include: agitated body language (pacing, clenching fists, scanning the room), raised voice or profanity without direct provocation, statements of grievance that seem disproportionate to the situation, apparent intoxication or altered mental state, refusal to make eye contact or conversely, fixated staring, and erratic or unpredictable movement.

When you observe these signs, your goal is environmental management first: reduce stimulation where possible (reduce noise, crowds, competing voices), create or preserve physical space between the subject and triggers, and approach in a calm, non-threatening manner before the situation escalates further.

Situation assessment also means understanding context. Is this person in a medical crisis? Experiencing a mental health episode? Under the influence of substances? Each of these scenarios requires a different approach. A person in a diabetic emergency needs medical assistance, not verbal commands to comply.`,
        flashcardData: [
          { front: 'Pre-escalation warning signs to watch for', back: 'Agitated body language, raised voice without provocation, disproportionate grievances, intoxication, refusal/fixated eye contact, erratic movement.' },
          { front: 'Environmental management before verbal engagement', back: 'Reduce stimulation (noise/crowd), create physical space between subject and triggers, approach calmly before the situation escalates further.' },
          { front: 'Why does context matter in de-escalation?', back: 'Different causes require different responses. Medical crisis needs paramedics, not commands. Mental health crisis needs different approach than intoxication.' },
        ],
        quizQuestions: [
          {
            questionText: 'A person is pacing, clenching their fists, and muttering to themselves. What is the most appropriate first response?',
            options: opts('Issue a direct command to stop and stand still', 'Assess from a safe distance and approach calmly before escalation occurs', 'Immediately call law enforcement', 'Ignore the behavior unless they approach someone'),
            correctAnswer: 'b',
            explanation: 'Pre-escalation intervention — assessing from a safe distance and approaching calmly — is more effective than waiting for a crisis or issuing immediate commands.',
          },
        ],
      },
      {
        title: 'Verbal De-escalation',
        contentBody: `Verbal de-escalation is a structured approach to reducing tension through communication. The goal is to help an agitated person move from an emotional state to a rational one — where they can hear, process, and respond to reason.

The core principles of verbal de-escalation: (1) Speak calmly and slowly — your tone is contagious. If you speak frantically, the subject's agitation increases. If you speak calmly, it often brings their emotional level down. (2) Use the subject's name if you know it — people respond to their own name. (3) Avoid arguing — do not challenge statements or try to win an argument. Acknowledge their perspective without validating harmful or false claims. (4) Ask open-ended questions — "Can you help me understand what happened?" is better than "Did you steal that?" (5) Give choices — "You can walk out with me now, or we can wait here for police. Which would you prefer?" gives the subject a sense of control.

What not to do: Do not stand over a seated person (it reads as dominance). Do not invade personal space. Do not cross your arms. Do not touch without consent. Do not make ultimatums you cannot follow through on. Do not use sarcasm or dismissive language.

De-escalation is not capitulation. You can maintain your position — "I understand you're frustrated, but I need you to step back from the door" — while still validating the person's feelings.`,
        flashcardData: [
          { front: 'Five core principles of verbal de-escalation', back: '1. Speak calmly and slowly\n2. Use their name\n3. Avoid arguing\n4. Ask open-ended questions\n5. Give choices to restore a sense of control' },
          { front: 'Body language to AVOID during de-escalation', back: 'Standing over a seated person, invading personal space, crossed arms, touching without consent, making ultimatums you cannot follow through.' },
          { front: 'De-escalation vs. capitulation — what\'s the difference?', back: 'You can maintain your position and enforce rules while still validating the person\'s feelings. De-escalation is about tone and method, not abandoning authority.' },
        ],
        quizQuestions: [
          {
            questionText: 'An agitated subject is yelling. The best initial response is to:',
            options: opts('Match their volume to assert authority', 'Yell for them to be quiet', 'Speak calmly and slowly — your tone is contagious', 'Say nothing and wait until they stop'),
            correctAnswer: 'c',
            explanation: 'Speaking calmly and slowly is contagious — it naturally brings the subject\'s emotional level down. Matching volume escalates tension.',
          },
        ],
      },
      {
        title: 'Body Language and Positioning',
        contentBody: `Non-verbal communication makes up a significant portion of all human communication — some studies suggest over 55% of the emotional impact of any message is conveyed through body language. Security officers who understand and control their own body language have a significant advantage in de-escalation situations.

Safe positioning: Maintain a 45-degree angle to the subject rather than facing them directly — direct face-to-face positioning reads as confrontational. Keep distance of at least 1.5 to 2 arm lengths (approximately 3 to 4 feet) unless physical control is needed. This gives both parties personal space and gives the officer reaction time if the situation escalates.

Keep your hands visible and in a natural, non-threatening position — in front of your body at waist level. Never put your hands on your hips in a "gunfighter" stance or in your pockets. Non-threatening open palm gestures can signal that you mean no harm.

Maintain appropriate eye contact — steady but not aggressive staring. Looking away entirely communicates disinterest or disrespect; staring challenges the subject. A natural, professional gaze at the forehead or nose bridge (rather than directly into the eyes) achieves the right balance.

Your facial expression should be calm and neutral — not smiling (which can read as mockery) and not scowling (which escalates). Slightly furrowed brows with a neutral mouth communicates "I take this seriously and I'm here to help."`,
        flashcardData: [
          { front: 'Safe positioning during confrontation', back: '45-degree angle to the subject (not directly facing), 3-4 feet of distance. Never turn your back or position yourself directly in front.' },
          { front: 'Where should hands be during de-escalation?', back: 'Visible, in front of the body at waist level. Never on hips, never in pockets. Open palm gestures signal non-threat.' },
          { front: 'Eye contact during de-escalation', back: 'Steady but not aggressive. Looking at the forehead or nose bridge achieves appropriate engagement without the challenge of direct eye contact.' },
        ],
        quizQuestions: [
          {
            questionText: 'The preferred body position when verbally engaging a potentially agitated subject is:',
            options: opts('Directly face-to-face at arm\'s length', 'Behind the subject to reduce confrontation', '45-degree angle at 3-4 feet distance', 'Side-by-side facing the same direction'),
            correctAnswer: 'c',
            explanation: 'A 45-degree angle at 3-4 feet is non-confrontational, provides personal space, and gives reaction time if needed.',
          },
        ],
      },
      {
        title: 'Disengagement Strategies',
        contentBody: `Knowing when and how to disengage is as important as knowing how to engage. Not every situation requires continued officer involvement. Ongoing engagement with a highly agitated subject — without a clear purpose or authority to compel their cooperation — can escalate a manageable situation into a confrontation.

Tactical disengagement means withdrawing from a situation in a controlled, purposeful way to allow tension to dissipate. This is appropriate when: (1) There is no immediate threat to safety, (2) The officer lacks clear authority to compel action, (3) Law enforcement has been contacted and is responding, or (4) Continued engagement is clearly worsening the situation.

How to disengage professionally: give the subject a clear, dignified off-ramp ("You're welcome to stay as long as you're not disrupting others — I'll be nearby if you need anything"), exit to a position of observation rather than fully leaving, and monitor from a distance.

Never turn your back on an agitated subject while disengaging. Exit with your front toward the subject and move backward or sideways to a safe observation point. Maintain awareness — disengagement is not dismissal. You are moving to a better position for observation and to await law enforcement if needed.`,
        flashcardData: [
          { front: 'When is tactical disengagement appropriate?', back: 'No immediate safety threat, no authority to compel action, law enforcement responding, or continued engagement is making things worse.' },
          { front: 'How to disengage professionally', back: 'Give the subject a dignified off-ramp, exit to a position of observation (not full withdrawal), never turn your back — exit facing the subject.' },
          { front: 'Disengagement vs. abandonment', back: 'Disengagement means moving to a better observation position. You continue monitoring. Abandonment means leaving entirely — generally inappropriate if a threat persists.' },
        ],
        quizQuestions: [
          {
            questionText: 'An officer is engaging with an agitated person who has not made any threats. Law enforcement has been called and is 5 minutes away. The best action is:',
            options: opts('Continue verbal engagement at close range', 'Physically remove the subject before police arrive', 'Disengage to an observation position and monitor until law enforcement arrives', 'Leave the area entirely since police are coming'),
            correctAnswer: 'c',
            explanation: 'Tactical disengagement to an observation position reduces escalation risk while the officer continues monitoring until law enforcement arrives.',
          },
        ],
      },
      {
        title: 'Mental Health Awareness and When to Call for Backup',
        contentBody: `Mental health crisis situations require specialized knowledge. Persons experiencing a mental health crisis may exhibit behavior that appears erratic, threatening, or irrational — but may respond very differently to intervention than a subject who is simply non-compliant.

Key indicators of a possible mental health crisis: responding to stimuli others cannot perceive (hallucinations), expressing beliefs that are clearly disconnected from reality (delusions), extreme emotional swings without apparent cause, disorganized speech or thought patterns, or self-harm behavior.

De-escalation for mental health situations: speak slowly in short, simple sentences, avoid jargon or complex instructions, reduce environmental stimulation (move away from crowds or noise), do not argue with delusions — simply redirect, and maintain a calm, non-threatening presence. The goal is safety until specialized help arrives.

Calling for backup or law enforcement is the right decision whenever: the situation involves a weapon, there is an active threat to any person's safety, the subject is in a mental health crisis that the officer cannot safely manage, the officer is outnumbered, or the situation is escalating beyond the officer's training or authority. Calling for help is not weakness — it is professional judgment.

Many jurisdictions now have Crisis Intervention Teams (CIT) within law enforcement. When calling 911 for a mental health situation, specifically request a CIT-trained officer if available.`,
        flashcardData: [
          { front: 'Indicators of mental health crisis', back: 'Responding to stimuli others cannot perceive, beliefs disconnected from reality, extreme emotional swings, disorganized speech, self-harm behavior.' },
          { front: 'De-escalation for mental health crisis', back: 'Short simple sentences, reduce stimulation, do not argue with delusions — redirect, maintain calm presence, prioritize safety until specialized help arrives.' },
          { front: 'When to call for backup — 5 situations', back: '1. Weapon present\n2. Active threat\n3. Mental health crisis beyond officer\'s capacity\n4. Outnumbered\n5. Situation escalating beyond training/authority' },
        ],
        quizQuestions: [
          {
            questionText: 'A subject is speaking to someone who is not there and appears confused. The officer should:',
            options: opts('Argue to help the subject understand reality', 'Use a control hold immediately to prevent harm', 'Speak calmly in short sentences, reduce stimulation, and call for specialized assistance', 'Ignore the behavior unless it becomes a direct threat'),
            correctAnswer: 'c',
            explanation: 'Mental health crisis situations require a calm, non-confrontational approach, reduced stimulation, and getting specialized help. Arguing with delusions is ineffective and escalating.',
          },
        ],
      },
    ],
    finalExamQuestions: [
      { questionText: 'The primary goal of de-escalation is to:', options: opts('Win the confrontation', 'Move the subject from an emotional to a rational state', 'Demonstrate authority', 'Avoid any direct engagement'), correctAnswer: 'b', explanation: 'De-escalation aims to help the subject move from an emotional, reactive state to a rational one where they can engage with reason.' },
      { questionText: 'Which of the following is a warning sign of potential escalation?', options: opts('Making eye contact', 'Asking questions', 'Clenching fists and pacing', 'Standing calmly with arms at sides'), correctAnswer: 'c', explanation: 'Physical agitation signs like clenching fists and pacing are pre-escalation indicators that warrant proactive, calm intervention.' },
      { questionText: 'Standing at a 45-degree angle to a subject during confrontation is preferred because:', options: opts('It makes the officer harder to attack from the front', 'It is non-confrontational, provides personal space, and allows reaction time', 'It allows the officer to draw a weapon more easily', 'State law requires this positioning'), correctAnswer: 'b', explanation: 'The 45-degree position is less confrontational than face-to-face, provides personal space, and gives the officer reaction time.' },
      { questionText: 'During de-escalation, you should:', options: opts('Match the subject\'s emotional level to show empathy', 'Speak calmly and slowly to influence their emotional state', 'Remain silent until they calm down', 'Begin documenting the incident while talking to the subject'), correctAnswer: 'b', explanation: 'Tone is contagious. A calm, measured voice naturally brings an agitated subject\'s emotional level down.' },
      { questionText: 'Which of these de-escalation errors is most likely to worsen a situation?', options: opts('Giving the subject a choice', 'Using open-ended questions', 'Invading personal space while speaking', 'Maintaining eye contact'), correctAnswer: 'c', explanation: 'Invading personal space signals threat and dominance, triggering a defensive response in agitated subjects.' },
      { questionText: 'When should tactical disengagement be considered?', options: opts('After every verbal engagement', 'When continued engagement is clearly escalating the situation and no immediate threat exists', 'Only when the officer is outnumbered', 'After calling for backup'), correctAnswer: 'b', explanation: 'Tactical disengagement is appropriate when continued engagement makes things worse and there is no immediate threat requiring officer presence.' },
      { questionText: 'A person argues that they are not doing anything wrong. The best response is:', options: opts('Counter their argument with facts', 'Acknowledge their perspective without agreeing: "I understand you see it that way. What I need right now is..."', 'Threaten them with arrest to end the argument', 'Walk away to avoid the argument'), correctAnswer: 'b', explanation: 'Acknowledging perspective without agreeing de-escalates without capitulating. Arguing creates resistance.' },
      { questionText: 'An officer disengaging from an agitated subject should:', options: opts('Turn and walk quickly away', 'Exit facing the subject to maintain awareness', 'Ask the subject to turn around first', 'Wait for the subject to walk away first'), correctAnswer: 'b', explanation: 'Never turn your back on an agitated subject when disengaging. Exit while facing the subject to maintain awareness.' },
      { questionText: 'Calling for backup when you feel outnumbered is:', options: opts('A sign of weakness', 'Professional judgment that prioritizes safety', 'Only appropriate for new officers', 'Required only when weapons are present'), correctAnswer: 'b', explanation: 'Calling for backup is professional judgment. All five situations requiring backup (weapon, active threat, mental health crisis, outnumbered, escalating beyond authority) are valid.' },
      { questionText: 'A person experiencing delusions (believing things that are not real) should be:', options: opts('Corrected and shown evidence that their belief is false', 'Redirected rather than argued with, while awaiting specialized help', 'Restrained immediately to prevent unpredictable behavior', 'Told their beliefs are valid to gain cooperation'), correctAnswer: 'b', explanation: 'Arguing with delusions escalates the crisis. Redirection while seeking specialized (CIT) assistance is the appropriate approach.' },
    ],
  },

  // ─── MODULE 4 ─────────────────────────────────────────────────────────────
  {
    title: 'Observation and Report Writing',
    description: 'Techniques for effective observation, documentation of incidents, and writing clear, factual security reports.',
    category: 'operations',
    passingScore: 80,
    certificateValidDays: 365,
    isRequired: true,
    stateCreditHours: '1.50',
    orderIndex: 4,
    sections: [
      {
        title: 'What to Observe',
        contentBody: `Effective observation is a trained skill. Security officers who develop systematic observation habits identify threats earlier, collect more useful evidence, and write more credible reports. Untrained observation is selective — people naturally notice things that confirm what they already believe and miss things that don't fit their expectations.

The CAPSTONE method is a systematic approach to observation: Color (of clothing, vehicles, hair), Age (estimated), Physical description (height, weight, build), Sex, Time (of observation and events), Observable behavior (what are they doing?), Name or identifier (if available), and Equipment (what are they carrying, wearing, or driving?).

Security officers should conduct systematic tours — not random walks. A systematic tour follows the same route or pattern each time, ensuring no area goes unchecked. However, tour timing should be varied to prevent predictability (which allows criminals to time their activities around observed patrol gaps).

Abnormal observation means noticing what is out of place: doors that should be locked are open, vehicles parked in unusual locations or at unusual times, persons in areas where they have no obvious legitimate purpose, odors that don't belong (smoke, chemicals), or sounds that are inconsistent with normal operations.`,
        flashcardData: [
          { front: 'CAPSTONE observation method', back: 'Color, Age, Physical description, Sex, Time, Observable behavior, Name/identifier, Equipment' },
          { front: 'Why should patrol timing be varied?', back: 'Fixed timing is predictable — criminals can time activities to avoid observed patrol windows. Variable timing prevents this.' },
          { front: 'Abnormal observation — what to look for', back: 'Unlocked doors that should be locked, unusual vehicles, persons without obvious purpose, unexpected odors, sounds inconsistent with operations.' },
        ],
        quizQuestions: [
          {
            questionText: 'In the CAPSTONE observation method, the "C" stands for:',
            options: opts('Criminal behavior', 'Color (of clothing, vehicles, hair)', 'Contacts made during patrol', 'Clock time of observation'),
            correctAnswer: 'b',
            explanation: 'CAPSTONE: Color, Age, Physical description, Sex, Time, Observable behavior, Name/identifier, Equipment.',
          },
        ],
      },
      {
        title: 'Objective vs. Subjective Language',
        contentBody: `Security reports that mix objective facts with subjective conclusions are legally vulnerable and professionally weak. Understanding the difference between the two — and rigorously separating them in your writing — is essential.

Objective language describes what you directly observed with your senses: "The individual was pacing in a 10-foot area in front of Exit 3 for approximately 15 minutes." Subjective language assigns meaning, motive, or character: "The individual was acting suspiciously and appeared to be planning something."

Every subjective conclusion should either be removed or grounded in specific objective observations. Instead of "appeared drunk," write "smelled strongly of alcohol, had bloodshot eyes, and staggered when walking." Instead of "seemed threatening," write "raised his voice to approximately 80 decibels, clenched his fists, and stepped toward me twice."

Statements made by subjects should be recorded verbatim (in quotes) or as close to verbatim as possible: "The subject stated, 'I didn't take anything. You're going to regret this.'" This is more useful than "The subject denied theft and made a vague threat." Verbatim quotes cannot be later interpreted or re-characterized.`,
        flashcardData: [
          { front: 'Objective vs. subjective — the key difference', back: 'Objective: what you directly observed with your senses. Subjective: conclusions, interpretations, or character judgments based on those observations.' },
          { front: 'Instead of "appeared drunk," write:', back: '"Smelled strongly of alcohol, had bloodshot eyes, and staggered when walking." Ground conclusions in specific observable facts.' },
          { front: 'Why record subject statements verbatim?', back: 'Verbatim quotes cannot be re-interpreted or re-characterized later. Paraphrasing introduces risk of distortion.' },
        ],
        quizQuestions: [
          {
            questionText: 'Which statement is properly objective?',
            options: opts('"The subject was acting suspiciously near the register."', '"The subject appeared to be concealing merchandise."', '"The subject placed an item inside their jacket and walked toward the exit without approaching any register."', '"The subject looked like they were about to steal something."'),
            correctAnswer: 'c',
            explanation: 'Option C describes only what was directly observed — the specific action and direction — without conclusion or interpretation.',
          },
        ],
      },
      {
        title: 'Incident Report Structure',
        contentBody: `A well-structured incident report follows a consistent format that ensures all necessary information is captured and can be quickly located by reviewers. Most professional security operations use a standardized report form — the structure below reflects best practices applicable to any format.

The five components of a complete incident report: (1) Header — report number, date, time, location, type of incident, reporting officer's name, badge number, and shift. (2) Involved parties — names, descriptions, and contact information for all subjects, victims, and witnesses. If names are unknown, provide thorough physical descriptions using the CAPSTONE method. (3) Chronological narrative — a step-by-step account of events in the order they occurred, written in past tense using objective language. (4) Actions taken — specific actions the officer took and their outcomes, including notifications made and persons contacted. (5) Evidence section — description of any physical evidence, photographs taken, or documentation preserved.

Common structural errors to avoid: starting with your actions rather than what triggered the incident (the narrative should begin with the earliest observable event), skipping the resolution (always document how the situation ended), omitting your notifications (who did you call, when, and what did they tell you?), and writing in the present tense (reports are always written in the past tense — you are documenting what already happened).`,
        flashcardData: [
          { front: 'Five components of a complete incident report', back: '1. Header\n2. Involved parties\n3. Chronological narrative\n4. Actions taken\n5. Evidence section' },
          { front: 'What verb tense should reports use?', back: 'Always past tense. Reports document what already happened.' },
          { front: 'Common structural error: starting with your actions', back: 'Reports should begin with the earliest observable triggering event — not with what you (the officer) did first.' },
        ],
        quizQuestions: [
          {
            questionText: 'A security report narrative should:',
            options: opts('Start with the officer\'s response and work backward', 'Be written in present tense for clarity', 'Follow chronological order starting with the earliest observable event', 'Only include events the officer personally witnessed'),
            correctAnswer: 'c',
            explanation: 'Reports should be written in chronological order, in past tense, starting with the earliest observable event that is part of the incident.',
          },
        ],
      },
      {
        title: 'Timing and Documentation',
        contentBody: `Accurate timing is critical in security documentation. Precise times allow incident reconstruction, establish officer response times, enable timeline correlation with camera footage, and support or refute competing accounts of events.

Use 24-hour (military) time whenever possible — it eliminates AM/PM ambiguity. 1400 hours is unambiguous; 2:00 PM is not (especially when handwritten). Document time at each stage of an incident: time you first observed the issue, time of each escalation, time you called for backup or law enforcement, time law enforcement arrived, and time the incident was resolved.

Documentation should never be backdated or have times altered. If you forgot to record a time and are adding it later, note clearly that the time is estimated: "Approximately 1430 — exact time not noted at scene." Fabricating times is a serious integrity violation that can result in termination and civil or criminal liability.

Preserve any documentation or evidence until specifically released by your supervisor or legal counsel: reports, photographs, video (request security footage immediately — most systems overwrite within 24-72 hours), physical evidence (do not touch without proper technique — call law enforcement for evidence collection), and written statements from witnesses.`,
        flashcardData: [
          { front: 'Why use 24-hour time in reports?', back: 'Eliminates AM/PM ambiguity. 1400 hours is unambiguous; "2:00 PM" can be misread or miswritten.' },
          { front: 'Security camera footage — how quickly must you request it?', back: 'Immediately. Most systems overwrite within 24-72 hours. Delayed requests can result in permanent loss of critical evidence.' },
          { front: 'If you forgot to document a time at the scene:', back: 'Add a clearly noted estimate: "Approximately 1430 — exact time not noted at scene." Never fabricate or backdate times.' },
        ],
        quizQuestions: [
          {
            questionText: 'A security incident occurred. When should you request that security camera footage be preserved?',
            options: opts('At the end of your shift', 'When your supervisor asks for it', 'Immediately — most systems overwrite within 24-72 hours', 'Only if law enforcement requests it'),
            correctAnswer: 'c',
            explanation: 'Security footage must be requested immediately. Most systems overwrite footage within 24-72 hours, making delayed requests risk permanent evidence loss.',
          },
        ],
      },
      {
        title: 'Evidence Handling Basics',
        contentBody: `Evidence handling is one of the most legally sensitive aspects of a security officer's job. Improper evidence handling can destroy its value in legal proceedings, expose you and your employer to liability, and undermine successful prosecution of offenders.

The chain of custody is the documented record of who has had possession of evidence, from the moment it was collected through trial. Any break in the chain — any period where the evidence's location and handler are unknown — can make evidence inadmissible in court.

As a private security officer, your evidence handling role is primarily to: (1) Identify and preserve evidence without touching it, (2) Document the evidence's location, condition, and proximity to the incident, (3) Establish a perimeter to prevent others from disturbing the evidence, and (4) Notify law enforcement and wait for them to collect it.

If evidence must be moved for safety reasons (a firearm in a public area, for example), handle with extreme care: use gloves if available, move minimally, document the original location precisely, and immediately inform law enforcement of where you found it and where you moved it.

Photographs are often the most important evidence a security officer can preserve. Document the scene from multiple angles before anything is moved. The camera timestamp should match real time — verify this periodically.`,
        flashcardData: [
          { front: 'Chain of custody — what is it?', back: 'The documented record of who has had possession of evidence from collection through trial. A break in the chain can make evidence inadmissible.' },
          { front: 'Security officer\'s primary role in evidence handling', back: '1. Identify without touching\n2. Document location and condition\n3. Establish perimeter\n4. Notify law enforcement to collect' },
          { front: 'If evidence must be moved for safety:', back: 'Use gloves if available, move minimally, document original location precisely, immediately inform law enforcement of original and current location.' },
        ],
        quizQuestions: [
          {
            questionText: 'At a crime scene, the security officer\'s primary evidence role is to:',
            options: opts('Collect all evidence before law enforcement arrives', 'Identify and preserve evidence without disturbing it, document its location, and notify law enforcement', 'Move evidence to a secure location immediately', 'Photograph evidence and then collect it for safekeeping'),
            correctAnswer: 'b',
            explanation: 'Security officers identify, document, and preserve evidence — they do not collect it. Proper collection requires law enforcement to maintain chain of custody.',
          },
        ],
      },
    ],
    finalExamQuestions: [
      { questionText: 'CAPSTONE stands for:', options: opts('Confirm, Assess, Plan, Stop, Terminate, Observe, Notify, Enforce', 'Color, Age, Physical description, Sex, Time, Observable behavior, Name, Equipment', 'Control, Approach, Position, Secure, Talk, Organize, Neutralize, Exit', 'Condition, Alert, Priority, Situation, Tactics, Officer, Notice, Evaluate'), correctAnswer: 'b', explanation: 'CAPSTONE is a memory aid for systematic observation: Color, Age, Physical description, Sex, Time, Observable behavior, Name/identifier, Equipment.' },
      { questionText: 'An objective report statement is:', options: opts('"The subject appeared nervous and suspicious."', '"The subject seemed like they were planning something."', '"The subject placed merchandise under their shirt and walked toward the exit."', '"The subject was acting in a criminal manner."'), correctAnswer: 'c', explanation: 'Objective statements describe observable, verifiable actions without conclusions or character judgments.' },
      { questionText: 'Security patrol timing should be:', options: opts('Fixed — always at the same time for consistency', 'Variable — to prevent predictability', 'Random — never the same twice', 'Based on shift handoff schedule only'), correctAnswer: 'b', explanation: 'Variable timing prevents criminals from identifying patrol gaps and timing their activities to avoid observation.' },
      { questionText: 'What is the preferred time format for security incident reports?', options: opts('12-hour format with AM/PM notation', '24-hour (military) time format', 'The format used in the officer\'s state', 'Relative time from shift start'), correctAnswer: 'b', explanation: '24-hour time eliminates AM/PM ambiguity and is standard practice in professional security documentation.' },
      { questionText: 'Subject statements in reports should be:', options: opts('Paraphrased for brevity', 'Recorded verbatim (in quotes) as closely as possible', 'Summarized objectively', 'Omitted if they are threats'), correctAnswer: 'b', explanation: 'Verbatim quotes cannot be re-interpreted or re-characterized. Paraphrasing introduces distortion.' },
      { questionText: 'A break in the chain of custody can result in:', options: opts('A warning to the officer', 'Evidence being inadmissible in court', 'The case being reclassified', 'Automatic mistrial'), correctAnswer: 'b', explanation: 'A break in chain of custody can make evidence inadmissible, potentially undermining prosecution entirely.' },
      { questionText: 'Security camera footage should be requested:', options: opts('Within 1 week of the incident', 'At the end of the shift', 'Immediately after the incident', 'Only if law enforcement is involved'), correctAnswer: 'c', explanation: 'Most systems overwrite within 24-72 hours. Immediate requests prevent permanent evidence loss.' },
      { questionText: 'A security report should begin with:', options: opts('What actions the officer took', 'The officer\'s conclusions about what occurred', 'The earliest observable triggering event', 'A summary of the resolution'), correctAnswer: 'c', explanation: 'Chronological reports begin with the earliest observable event, not the officer\'s actions.' },
      { questionText: 'If you forgot to record the time of an event during an incident:', options: opts('Estimate the most favorable time for the report', 'Leave the time blank', 'Note clearly that the time is estimated', 'Ask a coworker what time they think it was'), correctAnswer: 'c', explanation: 'Estimated times should be clearly noted as such. Fabricating or backdating times is an integrity violation.' },
      { questionText: 'Which is an "abnormal observation" that warrants attention?', options: opts('An employee entering through the main entrance', 'A vehicle in an employee parking lot', 'A door that should be locked standing open', 'A visitor in the lobby during business hours'), correctAnswer: 'c', explanation: 'A door that should be locked standing open is anomalous — it doesn\'t match expected conditions and warrants investigation.' },
    ],
  },

  // ─── MODULE 5 ─────────────────────────────────────────────────────────────
  {
    title: 'Customer Service and Professional Conduct',
    description: 'Professional standards for communication, appearance, client representation, and social media conduct in private security.',
    category: 'professionalism',
    passingScore: 80,
    certificateValidDays: 365,
    isRequired: true,
    stateCreditHours: '1.00',
    orderIndex: 5,
    sections: [
      {
        title: 'Professional Appearance',
        contentBody: `A security officer's appearance is the first impression every visitor, employee, and potential threat receives. A professional, well-maintained appearance communicates authority, competence, and organizational pride. A disheveled or unprofessional appearance undermines confidence and authority before a single word is spoken.

Uniform standards: uniforms must be clean, pressed, and free of stains or tears. Shirts must be tucked. Shoes must be polished or well-maintained. All required equipment must be properly secured to the uniform. Name tags and badges must be visible. Hair should be neat and within any company or site-specific grooming standards.

Personal hygiene is non-negotiable. Security officers interact closely with the public, often in enclosed spaces. Regular bathing, clean clothing, dental hygiene, and appropriate use of deodorant are professional expectations. Excessive cologne or perfume can cause discomfort for persons with sensitivities and is generally inappropriate.

Personal conduct in uniform: when in uniform (including while commuting to and from a post), you represent your employer and your client. Behavior in uniform that would embarrass your employer — public disputes, unprofessional social media posts identifying your uniform, or interactions that reflect poorly on the company — can be a basis for disciplinary action. In uniform, you are always on.`,
        flashcardData: [
          { front: 'Why does professional appearance matter for security officers?', back: 'First impression communicates authority and competence. Disheveled appearance undermines authority before speaking.' },
          { front: 'In-uniform conduct rule', back: 'When in uniform — including commuting — you represent your employer and client. Public conduct in uniform can be grounds for discipline.' },
          { front: 'Uniform standards — key requirements', back: 'Clean, pressed, no stains or tears. Shirt tucked. Shoes maintained. Equipment properly secured. Name/badge visible. Neat grooming.' },
        ],
        quizQuestions: [
          {
            questionText: 'A security officer on their way to work in uniform gets into an argument at a gas station and posts a video of it to social media. This could result in:',
            options: opts('No consequences — the officer was off the clock', 'Disciplinary action — in-uniform conduct represents the employer at all times', 'A verbal warning only — off-duty conduct is personal', 'No consequences unless the client sees the video'),
            correctAnswer: 'b',
            explanation: 'In-uniform conduct represents the employer at all times, including commuting. Public disputes or embarrassing social media posts while in uniform can be grounds for discipline.',
          },
        ],
      },
      {
        title: 'Communication Standards',
        contentBody: `Professional communication is the hallmark of an effective security officer. Officers who communicate clearly, respectfully, and professionally resolve more situations without escalation, create fewer complaints, and earn the trust of clients and the public.

Radio communication: use the phonetic alphabet when spelling names or codes (Alpha, Bravo, Charlie...), keep transmissions brief and clear, identify yourself before transmitting, and avoid slang or unprofessional language. Radio transmissions may be recorded and reviewed.

Telephone communication: answer promptly (ideally within three rings), identify yourself and your post, listen actively, take accurate messages including caller name, time, and message content, and follow up on any promised actions.

In-person communication: greet every visitor professionally ("Good morning, welcome to [property name]. How can I assist you?"), make eye contact, listen before speaking, and maintain a calm tone regardless of how the visitor behaves. The customer service mindset — "How can I assist?" — is always the starting point, regardless of how the interaction may need to evolve.

Written communication: apply the same professional standards to emails and written communications as to formal incident reports. Avoid casual language, abbreviations, or emojis in any professional written communication.`,
        flashcardData: [
          { front: 'Professional in-person greeting standard', back: '"Good morning, welcome to [property name]. How can I assist you?" — always start with service mindset.' },
          { front: 'Radio communication rules', back: 'Use phonetic alphabet, keep transmissions brief, identify yourself first, no slang. Transmissions may be recorded.' },
          { front: 'Key rule for all professional communication', back: 'Regardless of the visitor\'s behavior, the officer maintains a calm, professional tone. Customer service mindset is always the starting point.' },
        ],
        quizQuestions: [
          {
            questionText: 'A visitor approaches the security desk angrily. The officer\'s first response should be:',
            options: opts('Match their energy to show confidence', '"How can I assist you today?" — maintain service mindset regardless of their tone', 'Ask them to calm down before engaging', 'Call for backup immediately'),
            correctAnswer: 'b',
            explanation: 'The service mindset — "How can I assist?" — is always the starting point. An officer\'s calm tone often de-escalates the visitor\'s initial agitation.',
          },
        ],
      },
      {
        title: 'Handling Complaints Professionally',
        contentBody: `Security officers frequently receive complaints — about facility conditions, other visitors, perceived unfair treatment, or the officer's own actions. Handling complaints professionally is both a service skill and a risk management skill.

The LEAP method for complaint handling: Listen (allow the person to fully express their complaint without interruption), Empathize ("I understand why that would be frustrating"), Ask (clarifying questions to understand the full scope of the complaint), and Problem-solve (explain what you can do, not what you cannot do).

Never argue, minimize, or dismiss a complaint. Even if the complaint is unfounded, the person filing it has a perception that needs to be acknowledged. Dismissing complaints — "That's not my problem" — creates escalation risk and is inconsistent with professional conduct.

If a complaint is about the officer's own actions, listen respectfully, document the complaint accurately, and escalate to a supervisor. Do not argue or justify your actions at length to the complainant — that conversation belongs with your supervisor. After acknowledging the complaint: "I hear your concern. I'll document what you've told me and ensure my supervisor is notified."

Documentation of all complaints, no matter how minor, is mandatory. A complaint that is documented and addressed professionally is far less damaging than an undocumented one that resurfaces in a legal proceeding.`,
        flashcardData: [
          { front: 'LEAP complaint handling method', back: 'Listen (fully, without interruption)\nEmpathize ("I understand why...")\nAsk (clarifying questions)\nProblem-solve (explain what you CAN do)' },
          { front: 'If a complaint is about the officer\'s own actions:', back: 'Listen respectfully, document accurately, escalate to supervisor. Do not argue or justify at length to the complainant.' },
          { front: 'Why document all complaints?', back: 'Documented, professionally handled complaints are far less damaging than undocumented ones that resurface in legal proceedings.' },
        ],
        quizQuestions: [
          {
            questionText: 'A visitor complains that a security officer was rude to them. The officer should:',
            options: opts('Explain to the visitor why their perception is incorrect', 'Listen respectfully, document the complaint, and notify a supervisor', 'Ask the visitor for their complaint in writing before responding', 'Dismiss the complaint if the officer knows they acted properly'),
            correctAnswer: 'b',
            explanation: 'Complaints about officer conduct should be listened to respectfully, documented, and escalated to a supervisor — not argued or minimized.',
          },
        ],
      },
      {
        title: 'Representing the Client',
        contentBody: `When you wear your uniform at a client's site, you represent that client to every person who sees you. Every interaction you have on their property reflects on their brand, their culture, and their reputation. Understanding this responsibility is fundamental to professional security work.

Know your client's business: before your first shift at any site, review the post orders, understand the client's business purpose, know who the decision-makers are and how to reach them, and understand the site's visitor population (medical facility, retail, corporate office, residential) and the appropriate tone for that environment.

Your personal opinions about the client's rules, operations, or policies are irrelevant to your job. You enforce the rules you are given, professionally, without editorializing. If a visitor disagrees with a rule, your response is: "That's the policy here. If you have a concern, you're welcome to contact [appropriate person or department]." You are not the policy-maker — you are the policy-enforcer.

Client confidentiality: information you learn about client operations, security vulnerabilities, or personnel matters through your work is confidential. Discussing client information with unauthorized persons — including friends, family, or social media — can result in immediate termination and legal action.`,
        flashcardData: [
          { front: 'Pre-shift preparation at a new client site', back: 'Review post orders, understand the client\'s business, know decision-maker contact info, understand the site\'s visitor population and appropriate tone.' },
          { front: 'If a visitor disagrees with a client policy:', back: '"That\'s the policy here. You\'re welcome to contact [appropriate department]." You enforce, not editorialize.' },
          { front: 'Client confidentiality rule', back: 'Information about client operations, security vulnerabilities, or personnel matters is confidential. Unauthorized disclosure can result in termination and legal action.' },
        ],
        quizQuestions: [
          {
            questionText: 'A visitor asks why a particular rule exists at the client site. The officer should:',
            options: opts('Explain the full rationale for the rule', 'Tell the visitor the rule is pointless but must be followed', 'Enforce the rule professionally without editorializing, and direct complaints to the appropriate department', 'Waive the rule if it seems unreasonable'),
            correctAnswer: 'c',
            explanation: 'Security officers enforce policies without editorializing. Personal opinions about policies are irrelevant. Complaints go to the client\'s appropriate channel.',
          },
        ],
      },
      {
        title: 'Social Media Conduct Policy',
        contentBody: `Social media has created new professional risks for security officers that did not exist a generation ago. A single poorly-considered post can result in termination, civil liability, and damage to your employer's client relationships. Understanding and following social media standards is a professional obligation.

What is prohibited in virtually all professional security organizations: posting any information about client facilities, security procedures, vulnerabilities, staffing patterns, or personnel; posting photographs taken on client property without explicit written authorization; posting anything that could identify your specific post assignment; discussing incidents or events that occurred at your post; making derogatory statements about clients, coworkers, or the public.

What is generally permitted: general statements about your profession (without identifying client information), participation in security industry professional groups, and general personal posts unrelated to your work.

Many employers monitor social media for posts by employees that identify their uniform, employer, or post location. Assume anything you post can be seen by your employer and your client. The test before any work-related social media post: Would my employer and client be proud to see this? If not, don't post it.

Be aware that your social media history may be reviewed during background checks for future employment. Posts made years ago can affect future career opportunities.`,
        flashcardData: [
          { front: 'Social media post test', back: 'Before any work-related post: "Would my employer and client be proud to see this?" If not, don\'t post it.' },
          { front: 'Prohibited social media content for security officers', back: 'Client facility info, security vulnerabilities, post assignments, incident details, photos taken on client property, derogatory statements about clients/coworkers/public.' },
          { front: 'Social media monitoring by employers', back: 'Many employers monitor social media for posts identifying the uniform, employer, or post location. Assume your employer and client can always see what you post.' },
        ],
        quizQuestions: [
          {
            questionText: 'An officer posts a photo at their post saying "Just another boring night at [client name]!" This is:',
            options: opts('Acceptable — it\'s a positive statement about the job', 'Acceptable — the post is outside work hours', 'Prohibited — it identifies the client and the officer\'s post assignment', 'Acceptable if the photo doesn\'t show any security equipment'),
            correctAnswer: 'c',
            explanation: 'Identifying a client name and post assignment on social media violates client confidentiality requirements and social media policy regardless of the time or content of the post.',
          },
        ],
      },
    ],
    finalExamQuestions: [
      { questionText: 'A security officer\'s professional appearance primarily communicates:', options: opts('That the officer is dangerous and to be avoided', 'Authority, competence, and organizational pride', 'That the facility is under constant surveillance', 'The officer\'s personal fitness level'), correctAnswer: 'b', explanation: 'Professional appearance communicates authority and competence before a word is spoken.' },
      { questionText: 'The LEAP method stands for:', options: opts('Look, Evaluate, Act, Proceed', 'Listen, Empathize, Ask, Problem-solve', 'Locate, Enforce, Arrest, Post', 'Learn, Engage, Acknowledge, Patrol'), correctAnswer: 'b', explanation: 'LEAP: Listen, Empathize, Ask, Problem-solve — a systematic approach to handling complaints professionally.' },
      { questionText: 'Client information learned through security work should be:', options: opts('Shared with senior management of the security company', 'Discussed only with immediate coworkers', 'Treated as confidential and not disclosed to unauthorized persons', 'Posted to professional security industry networks'), correctAnswer: 'c', explanation: 'Client information including operations, vulnerabilities, and personnel matters is confidential.' },
      { questionText: 'A visitor is rude to a security officer. The officer should:', options: opts('Match the visitor\'s tone to assert authority', 'Maintain calm professionalism regardless of the visitor\'s behavior', 'Request the visitor leave immediately', 'Document the incident without engaging the visitor'), correctAnswer: 'b', explanation: 'Professional conduct means maintaining calm regardless of how others behave. The service mindset is always the starting point.' },
      { questionText: 'Before posting anything work-related on social media, ask yourself:', options: opts('"Is this entertaining?"', '"Would my employer and client be proud to see this?"', '"Am I off duty right now?"', '"Is this factually accurate?"'), correctAnswer: 'b', explanation: 'The social media test: would your employer and client be proud to see this post? If not, don\'t post it.' },
      { questionText: 'Radio transmissions on a security radio should:', options: opts('Use casual language to build team rapport', 'Be detailed and thorough, including all context', 'Be brief and clear, identifying the officer first', 'Include background noise to establish authenticity'), correctAnswer: 'c', explanation: 'Radio transmissions should be brief, clear, and begin with officer identification. They may be recorded.' },
      { questionText: 'A visitor complains about a client policy the officer personally agrees is unreasonable. The officer should:', options: opts('Agree with the visitor and suggest they ignore the rule', 'Explain that management can be contacted to change the rule', 'Enforce the policy professionally without editorializing', 'Check with a supervisor before enforcing the rule'), correctAnswer: 'c', explanation: 'Officers enforce client policies without editorializing. Personal opinions about rules are irrelevant to enforcement.' },
      { questionText: 'Excessive cologne or perfume on duty is:', options: opts('Professional if it neutralizes other odors', 'Generally inappropriate — it can cause discomfort for those with sensitivities', 'Required if working near food service areas', 'Personal preference and not a professional consideration'), correctAnswer: 'b', explanation: 'Excessive cologne/perfume can cause discomfort or allergic reactions. Professional grooming standards apply.' },
      { questionText: 'When taking a telephone message, a security officer must record:', options: opts('Just the caller\'s name', 'The caller\'s name, time, and message content', 'The caller\'s ID number and shift', 'Only the message content'), correctAnswer: 'b', explanation: 'A complete telephone message includes caller name, time of call, and message content at minimum.' },
      { questionText: 'All complaints, no matter how minor, should be:', options: opts('Resolved verbally with no documentation unless serious', 'Documented — even minor complaints must be recorded', 'Escalated to law enforcement before documentation', 'Resolved personally by the officer without involving supervisors'), correctAnswer: 'b', explanation: 'All complaints must be documented. Minor complaints that go undocumented can resurface significantly in legal proceedings.' },
    ],
  },

  // ─── MODULES 6-10: Shorter versions with real content ─────────────────────
  {
    title: 'Cultural Diversity and Sensitivity',
    description: 'Implicit bias awareness, equitable treatment standards, cultural competency, and discrimination prevention.',
    category: 'professionalism',
    passingScore: 80,
    certificateValidDays: 365,
    isRequired: true,
    stateCreditHours: '1.00',
    orderIndex: 6,
    sections: [
      {
        title: 'Implicit Bias Awareness',
        contentBody: `Implicit bias refers to the unconscious attitudes or stereotypes that influence our understanding, actions, and decisions without conscious awareness. Everyone carries implicit biases — they are a product of our upbringing, media exposure, and life experiences. The professional obligation is not to be without bias, but to be aware of it and actively prevent it from influencing our professional decisions.

Research consistently shows that implicit bias affects who gets stopped, questioned, or suspected — even among professionals who consciously reject discrimination. In security work, this manifests as differential enforcement: treating similar behaviors differently based on the perceived characteristics of the person involved.

The antidote to implicit bias in security work is behavioral-based decision making: decisions to engage, question, or take action must be based on specific, articulable behaviors or policy violations — not on characteristics such as race, ethnicity, national origin, gender, religion, age, or disability. Ask yourself: "If this exact same behavior were exhibited by a person of a different background, would I respond the same way?" If the answer is no, reassess your decision.

Regular self-examination is required. After each interaction, ask: Was my response proportional? Was it based on behavior? Would I handle this situation the same way for any other person?`,
        flashcardData: [
          { front: 'What is implicit bias?', back: 'Unconscious attitudes or stereotypes that influence decisions without awareness. Everyone has them — the obligation is to prevent them from affecting professional decisions.' },
          { front: 'Antidote to implicit bias in security work', back: 'Behavioral-based decision making: act on specific, articulable behaviors or policy violations — never on personal characteristics like race, gender, or religion.' },
          { front: 'The implicit bias self-check question', back: '"If this exact same behavior were exhibited by a person of a different background, would I respond the same way?" If no — reassess.' },
        ],
        quizQuestions: [
          {
            questionText: 'A security officer stops a person for looking "suspicious" in a retail area. Under equitable standards, the basis for stopping someone should be:',
            options: opts('Their appearance and how they carry themselves', 'Their race or ethnicity, based on past theft patterns at the site', 'Specific, articulable behaviors or policy violations', 'Any characteristic the officer finds suspicious'),
            correctAnswer: 'c',
            explanation: 'Stops and interventions must be based on specific, articulable behaviors or policy violations — never on personal characteristics.',
          },
        ],
      },
      {
        title: 'Equitable Treatment Standards',
        contentBody: `Equitable treatment means applying the same rules, with the same level of enforcement, to all persons regardless of their personal characteristics. This is both a legal requirement and a professional standard. Differential enforcement — treating similar behaviors differently based on who is involved — creates legal liability and undermines public trust.

Federal and state civil rights laws prohibit discrimination in public accommodations and in the exercise of legal authority on the basis of race, color, national origin, sex, disability, religion, and in many jurisdictions, age, gender identity, and sexual orientation. Private security officers operating on behalf of businesses that are public accommodations are subject to these requirements.

Practical equitable treatment means: enforce every rule the same way for every person, document all stops and interventions with specific behavioral bases, challenge yourself when you find you have intervened with some groups more frequently than others, and report to supervisors when you observe differential enforcement by coworkers.

When a person alleges discriminatory treatment — even if you disagree — listen respectfully, document the allegation accurately, and escalate to a supervisor. Defensive dismissal of a discrimination allegation can significantly increase legal exposure.`,
        flashcardData: [
          { front: 'Definition of equitable treatment in security', back: 'Applying the same rules at the same enforcement level to all persons regardless of personal characteristics.' },
          { front: 'What laws govern equitable treatment by security officers?', back: 'Federal and state civil rights laws prohibiting discrimination in public accommodations on the basis of race, color, national origin, sex, disability, religion, and more.' },
          { front: 'What to do when a person alleges discriminatory treatment:', back: 'Listen respectfully, document accurately, escalate to supervisor. Do not dismiss or argue the allegation.' },
        ],
        quizQuestions: [
          {
            questionText: 'You notice that your team has intervened with members of one ethnic group far more frequently than others in the past month. You should:',
            options: opts('Assume the pattern reflects actual criminal behavior by that group', 'Continue current practices — statistics are not bias evidence', 'Challenge this pattern internally and report to supervisors for review', 'Reduce enforcement overall to balance the statistics'),
            correctAnswer: 'c',
            explanation: 'Enforcement pattern disparities warrant internal challenge and supervisory review. Patterns of differential enforcement create legal liability.',
          },
        ],
      },
      {
        title: 'Cultural Competency',
        contentBody: `Cultural competency is the ability to interact effectively with people of different cultures, backgrounds, and belief systems. In security work, cultural competency prevents misunderstandings that can escalate into incidents, improves community relations, and reduces complaints.

Cultural competency does not require knowing everything about every culture. It requires three things: awareness that cultural differences affect how people communicate, a commitment to avoiding assumptions, and the habit of verifying understanding rather than assuming it.

Communication differences that security officers must understand: direct vs. indirect communication styles (some cultures consider direct eye contact disrespectful; others require it for respect), different personal space norms (cultures vary widely in acceptable distance during conversation), different norms around touch (what is acceptable greeting in one culture may be offensive in another), and language barriers (many individuals with limited English proficiency can communicate well in their native language — use available translation tools or bilingual staff before assuming non-compliance).

When cultural misunderstanding may have occurred: slow down, simplify language, use visual cues, request interpretation, and never assume that confusion or non-compliance is willful. Document any interaction where a language or cultural barrier may have affected the outcome.`,
        flashcardData: [
          { front: 'Cultural competency — three requirements', back: '1. Awareness that cultural differences affect communication\n2. Commitment to avoiding assumptions\n3. Habit of verifying understanding rather than assuming it' },
          { front: 'Signs of possible language barrier vs. willful non-compliance', back: 'Confusion, repetition of same phrase, looking to others for help, pointing. Always try translation tools before assuming non-compliance.' },
          { front: 'Eye contact across cultures', back: 'Some cultures consider direct eye contact disrespectful; others require it to show respect. Do not interpret avoided eye contact as guilt or evasion.' },
        ],
        quizQuestions: [
          {
            questionText: 'A person does not respond to an officer\'s verbal commands. Before concluding they are non-compliant, the officer should consider:',
            options: opts('The person is being deliberately difficult', 'A language barrier may be preventing comprehension', 'The officer did not speak loudly enough', 'The person is likely under the influence'),
            correctAnswer: 'b',
            explanation: 'Language barriers can prevent comprehension. Translation tools or bilingual staff should be used before assuming willful non-compliance.',
          },
        ],
      },
      {
        title: 'Avoiding Discrimination and Documentation When Bias Is Alleged',
        contentBody: `Discrimination in security work creates liability for the officer, the employer, and the client. Understanding what constitutes discriminatory conduct — and how to document situations where bias is alleged — is essential for every security professional.

Discriminatory conduct includes: differential enforcement of the same rule based on personal characteristics, selectively applying policies to target individuals of a particular background, making comments about a person's characteristics in the context of enforcement, and creating a hostile environment through repeated negative interactions targeting members of a protected class.

When a subject alleges that your actions were discriminatory: (1) Do not argue or become defensive. (2) Listen and acknowledge their perception: "I hear that you feel you were treated unfairly. That concern is important." (3) Inform them of how to make a formal complaint. (4) Document every detail of the interaction: time, location, your specific actions and their behavioral basis, the subject's statements about discrimination, and witnesses. (5) Immediately notify your supervisor.

The importance of documentation when bias is alleged cannot be overstated. A contemporaneous report that accurately documents your behavioral basis for action is your primary protection in a discrimination claim. A report written after a claim is filed is viewed with significant skepticism. Write it right the first time.`,
        flashcardData: [
          { front: 'Response when someone alleges discriminatory treatment', back: '1. Do not argue or be defensive\n2. Acknowledge their perception\n3. Inform of formal complaint process\n4. Document everything\n5. Notify supervisor immediately' },
          { front: 'What constitutes discriminatory conduct by security officers?', back: 'Differential enforcement based on characteristics, selective policy application, comments about protected characteristics, creating hostile environments through repeated targeting.' },
          { front: 'Why is contemporaneous documentation critical in bias allegations?', back: 'A report written at the time of the incident is far more credible than one written after a claim is filed. It documents your behavioral basis for action.' },
        ],
        quizQuestions: [
          {
            questionText: 'A subject says "You only stopped me because of my race." The officer should:',
            options: opts('Explain why race was not a factor', 'Tell the subject they are wrong and to move on', 'Listen, acknowledge the concern, document everything, and notify a supervisor', 'Ask for ID to document the person making the allegation'),
            correctAnswer: 'c',
            explanation: 'Discrimination allegations require listening, acknowledgment, thorough documentation, and supervisor notification — not defensiveness or dismissal.',
          },
        ],
      },
    ],
    finalExamQuestions: [
      { questionText: 'Implicit bias differs from explicit bias because:', options: opts('It only affects law enforcement, not security', 'It is subconscious and operates without deliberate intent', 'It is easier to address through training', 'It only affects hiring decisions'), correctAnswer: 'b', explanation: 'Implicit bias operates below conscious awareness, making it more insidious and harder to address than overt prejudice.' },
      { questionText: 'Behavioral-based decision making means:', options: opts('Basing decisions on an officer\'s training instincts', 'Basing decisions on specific, articulable behaviors or policy violations — not personal characteristics', 'Observing behavior patterns over time before acting', 'Allowing individual officer discretion in all situations'), correctAnswer: 'b', explanation: 'Behavioral-based decisions are grounded in specific, observable actions or policy violations — never in protected characteristics.' },
      { questionText: 'Federal civil rights laws protect people from discrimination in security enforcement on the basis of:', options: opts('Personal preferences and lifestyle choices only', 'Race, color, national origin, sex, disability, and religion (and more in many jurisdictions)', 'Criminal history and credit score', 'Age only for those over 65'), correctAnswer: 'b', explanation: 'Federal and state civil rights laws cover race, color, national origin, sex, disability, religion, and increasingly age, gender identity, and sexual orientation.' },
      { questionText: 'A person avoids making eye contact with a security officer. This could indicate:', options: opts('Guilt or deception', 'Cultural norms where avoiding eye contact shows respect', 'Only guilt or deception', 'Alcohol impairment'), correctAnswer: 'b', explanation: 'Eye contact norms vary by culture. Avoiding eye contact does not universally indicate guilt or deception.' },
      { questionText: 'When a discrimination allegation is filed after an incident, the most credible documentation is:', options: opts('A report written after the claim is filed', 'A contemporaneous report written at the time of the incident', 'Witness statements collected afterward', 'Security camera footage alone'), correctAnswer: 'b', explanation: 'Contemporaneous reports written at the time of the incident are far more credible in discrimination claims than after-the-fact documentation.' },
      { questionText: 'Cultural competency requires knowing everything about every culture.', options: opts('True — officers must study all cultures at their post', 'False — it requires awareness, avoiding assumptions, and verifying understanding', 'True — especially for common cultures in the service area', 'True — this is a legal requirement in most states'), correctAnswer: 'b', explanation: 'Cultural competency requires awareness of differences, avoiding assumptions, and verifying understanding — not comprehensive cultural knowledge.' },
      { questionText: 'Equitable treatment means:', options: opts('Being extra cautious with all members of any group with higher crime rates', 'Applying the same rules at the same enforcement level to all persons', 'Giving members of disadvantaged groups extra consideration', 'Treating everyone identically regardless of their behavior'), correctAnswer: 'b', explanation: 'Equitable treatment applies the same standards and enforcement levels to all persons based on behavior — not characteristics.' },
      { questionText: 'When observing a potential language barrier, before assuming non-compliance an officer should:', options: opts('Repeat the command more loudly', 'Use available translation tools or bilingual staff', 'Assume the person understands and proceed with enforcement', 'Conduct a search to confirm suspicion'), correctAnswer: 'b', explanation: 'Translation tools or bilingual staff should be used before assuming willful non-compliance from a person who may not understand English.' },
      { questionText: 'Reporting to supervisors when you observe differential enforcement by coworkers is:', options: opts('Betraying a fellow officer', 'Not your responsibility — each officer manages their own conduct', 'A professional obligation under equitable treatment standards', 'Only required if you are a supervisor yourself'), correctAnswer: 'c', explanation: 'Equitable treatment is a collective obligation. Observing and reporting differential enforcement by coworkers is a professional duty.' },
      { questionText: 'The implicit bias self-check question is:', options: opts('"Did I follow policy exactly?"', '"Would my employer be proud of this decision?"', '"If this behavior were exhibited by a person of a different background, would I respond the same way?"', '"Is this consistent with how I\'ve always handled this situation?"'), correctAnswer: 'c', explanation: 'The self-check: "Would I respond the same way if this behavior were exhibited by someone of a different background?" A "no" requires reassessment.' },
    ],
  },

  {
    title: 'Emergency Procedures',
    description: 'Proper response to active threats, medical emergencies, fire, evacuation, and post-emergency documentation.',
    category: 'safety',
    passingScore: 80,
    certificateValidDays: 365,
    isRequired: true,
    stateCreditHours: '1.50',
    orderIndex: 7,
    sections: [
      {
        title: 'Active Threat Response',
        contentBody: `An active threat is a situation where one or more persons are engaged in killing or injuring people in a confined or populated area and the event is ongoing. The primary model for surviving an active threat situation as a security officer is RUN-HIDE-FIGHT, with an overlay of your additional responsibilities for communication and coordination.

Run: if you can safely evacuate the area, do so. Assist others who are immediately near you in evacuating if possible without exposing yourself to the threat. Do not stop to gather belongings. Once outside, do not return. Contact emergency services (911) as soon as you are in a safe location.

Hide: if you cannot safely evacuate, hide. Get behind cover (something that can stop bullets, like concrete walls or heavy furniture), not just concealment (something that blocks sight lines but not projectiles). Silence your radio and phone. Lock and barricade doors if possible. Stay out of open areas.

Fight: fighting the active shooter/attacker is a last resort — only when you cannot run or hide and violence is imminent. Improvise weapons, create noise and confusion, and commit to aggressive action if you fight. A hesitant defense is worse than no defense.

For security officers: your role in an active threat situation is primarily communication — alerting occupants, calling 911, and directing law enforcement to the threat location upon their arrival. Unless you are specifically trained and authorized for armed response, engaging the threat directly is not your role.`,
        flashcardData: [
          { front: 'RUN-HIDE-FIGHT — in order', back: 'Run: evacuate safely. Hide: cover, not just concealment. Fight: last resort only — active threat, cannot run or hide.' },
          { front: 'Cover vs. concealment', back: 'Cover: stops projectiles (concrete, steel, engine block). Concealment: blocks sight lines only (drywall, curtains, vegetation). Always seek cover.' },
          { front: 'Security officer\'s primary role in active threat', back: 'Communication: alert occupants, call 911, direct law enforcement to threat location. Engaging the threat is NOT the primary role unless specifically trained and authorized.' },
        ],
        quizQuestions: [
          {
            questionText: 'During an active threat event, a security officer\'s PRIMARY role is:',
            options: opts('Engaging and neutralizing the threat', 'Communication: alerting occupants, calling 911, directing law enforcement', 'Evacuating all employees and visitors personally', 'Locking down all entrances and exits'),
            correctAnswer: 'b',
            explanation: 'Unless specifically trained and authorized for armed response, the security officer\'s primary active threat role is communication and coordination, not engaging the threat.',
          },
        ],
      },
      {
        title: 'Medical Emergency Basics',
        contentBody: `Security officers are often the first responder in a medical emergency. Knowing when to act, what to do, and what not to do can be the difference between life and death for a person in crisis.

The first and most critical action in any medical emergency is to call 911 immediately. Do not delay calling because you are unsure of the severity — EMS professionals can assess severity, but only if they are notified in time.

Basic steps while awaiting EMS: (1) Keep the person calm and as still as possible. (2) Do not move an injured person unless there is immediate danger at the scene (fire, structural collapse, drowning). (3) If the person is conscious, ask about any known medical conditions, allergies, or current medications — relay this to EMS. (4) If the person is unconscious and not breathing, follow your CPR/AED training if you have it. (5) Clear the area of bystanders to give the person dignity and clear access for EMS.

AED (Automated External Defibrillator) use: know the location of AEDs at your post before any emergency occurs. AEDs are designed for lay use — follow the device's voice prompts if you have not received formal training. Early defibrillation significantly improves survival rates.

Documentation post-medical event: record the time of emergency onset, symptoms observed, actions taken, time EMS was called, time EMS arrived, and EMS unit number.`,
        flashcardData: [
          { front: 'First action in any medical emergency', back: 'Call 911 immediately. Do not delay to assess severity — EMS can assess, but only if they are notified in time.' },
          { front: 'When should you move an injured person?', back: 'Only if there is immediate danger at the scene (fire, collapse, drowning). Moving an injured person unnecessarily can worsen injuries, especially spinal injuries.' },
          { front: 'AED preparation', back: 'Know the location of every AED at your post before any emergency occurs. AEDs provide voice instructions — follow them even without formal training.' },
        ],
        quizQuestions: [
          {
            questionText: 'A visitor collapses at a security checkpoint. The first action is:',
            options: opts('Search for a medical bracelet before calling for help', 'Call 911 immediately', 'Attempt to wake the person', 'Notify building management before calling 911'),
            correctAnswer: 'b',
            explanation: '911 is always the first call. EMS can assess severity — but they need to be notified in time to respond effectively.',
          },
        ],
      },
      {
        title: 'Fire and Evacuation',
        contentBody: `Security officers play a critical role in fire emergencies: they are often the first to detect a fire, the first to activate the alarm, and the first to begin evacuation. Understanding fire response protocols is essential.

RACE protocol for fire emergencies: Rescue — remove anyone in immediate danger (if safe to do so), Alert — activate the nearest fire alarm pull station, Contain — close doors to slow fire spread (do not lock — fire doors should never be locked), and Evacuate/Extinguish — evacuate the area or extinguish a small, contained fire with an extinguisher (ONLY if you are trained to do so and the fire is small and not spreading).

PASS protocol for fire extinguisher use: Pull (the safety pin), Aim (at the base of the fire, not the flames), Squeeze (the handle), Sweep (side to side at the base).

Evacuation duties: know the evacuation plan for your post before any emergency. Know all exit routes, the primary and secondary assembly points, and any areas with persons who may need assistance (elderly, disabled). Never use elevators during a fire evacuation. Ensure stairwells are clear. Do not re-enter the building until fire department officials authorize it.

Post-evacuation duties: conduct headcounts if possible, report any persons known or believed to be inside the building to fire department incident command, and secure the perimeter to prevent re-entry.`,
        flashcardData: [
          { front: 'RACE protocol for fires', back: 'Rescue (if safe), Alert (activate alarm), Contain (close doors — never lock), Evacuate/Extinguish.' },
          { front: 'PASS protocol for fire extinguisher', back: 'Pull (pin), Aim (base of fire), Squeeze (handle), Sweep (side to side at base).' },
          { front: 'Fire evacuation — critical rules', back: 'Know all exits and assembly points. Never use elevators. Never re-enter until authorized by fire department. Headcount at assembly point.' },
        ],
        quizQuestions: [
          {
            questionText: 'During fire evacuation, officers should:',
            options: opts('Use elevators to evacuate persons from upper floors faster', 'Never use elevators — use stairs only', 'Use elevators only if they are fire-rated', 'Use elevators for persons with disabilities only'),
            correctAnswer: 'b',
            explanation: 'Elevators must never be used during fire evacuation — electrical failure and smoke can trap occupants. Stairs are always the correct route.',
          },
        ],
      },
      {
        title: 'When to Call 911',
        contentBody: `Security officers sometimes hesitate to call 911 because they believe the situation is manageable, they are concerned about client relations, or they are uncertain if the threshold has been reached. In professional security, the threshold for calling 911 is low — and erring on the side of calling is always the correct decision.

Always call 911 immediately for: any medical emergency or suspected medical emergency, any active or credible threat to safety (active shooter, weapon visible, credible threat of violence), any fire, explosion, or hazardous material release, any situation where the officer is physically outmatched or outnumbered without backup available, and any situation beyond the officer's training or authority to manage.

When calling 911: give your location first (address and specific area within the facility), describe the nature of the emergency, give a description of involved parties if relevant, state what actions you have already taken, and stay on the line until dispatch releases you. Do not hang up.

After calling 911: clear the path for emergency responders, designate someone to meet them at the main entrance and direct them to the scene if possible, and preserve the scene. Do not alter the scene based on what you expect investigators will find — preserve it as you found it.

The concern that "this might not be worth a 911 call" is always less important than safety. EMS, fire, and law enforcement professionals can determine whether the response was necessary after arriving — but they can only do that if they are called.`,
        flashcardData: [
          { front: 'When to always call 911', back: 'Any medical emergency, active threat, fire/explosion/hazmat, officer physically outmatched, any situation beyond training/authority.' },
          { front: '911 call sequence — first thing to say', back: 'Your location first: address and specific area. Then nature of emergency, description of parties, actions taken. Stay on the line.' },
          { front: 'The 911 hesitation problem', back: 'Always err on the side of calling. The concern that "this might not warrant 911" is always less important than safety. EMS can assess severity on arrival.' },
        ],
        quizQuestions: [
          {
            questionText: 'When calling 911, the first information provided should be:',
            options: opts('Your name and badge number', 'A description of all involved parties', 'Your location (address and specific area)', 'The nature of the emergency'),
            correctAnswer: 'c',
            explanation: 'Location is the most critical piece of information — if the call is dropped, responders must know where to go. Location goes first.',
          },
        ],
      },
      {
        title: 'Post-Emergency Documentation',
        contentBody: `Every emergency event — medical, fire, active threat, or other — requires thorough documentation. Post-emergency reports serve insurance, legal, regulatory, and training purposes. Incomplete or delayed documentation is a significant liability.

A post-emergency report must include: (1) Date, time, and location of the event, (2) Initial observation — what you first noticed and when, (3) Your immediate actions and their sequence, (4) Names of all persons involved — victims, witnesses, responding agencies, (5) Summary of actions taken by all parties, (6) Time of each significant development (alarm activation, 911 call, EMS arrival, fire department arrival, event resolution), (7) Outcome and current status of all involved persons, and (8) Property damage, if any.

Cooperate with all post-incident investigations — law enforcement, insurance, regulatory, and internal. Provide accurate, complete information. If you are asked to recall specific details and you genuinely do not remember, say so — "I don't recall" is an acceptable and professionally appropriate answer. Fabricating details is not.

Debrief after major incidents: meet with your supervisor and team to review what worked, what didn't, and what can be improved. These debriefs are not blame sessions — they are training opportunities. The goal is continuous improvement of emergency response capability.

Never post about emergency events on social media. Emergency response creates significant legal and privacy implications. All public communications about incidents should go through the client's or employer's designated spokesperson only.`,
        flashcardData: [
          { front: 'Post-emergency report — 8 required elements', back: '1. Date/time/location\n2. Initial observation\n3. Your actions in sequence\n4. All persons involved\n5. Actions by all parties\n6. Timeline of developments\n7. Outcome of persons\n8. Property damage' },
          { front: 'If you genuinely don\'t remember a detail in an investigation:', back: '"I don\'t recall" is acceptable and professional. Fabricating details is not.' },
          { front: 'Post-incident debriefs — purpose', back: 'Review what worked, what didn\'t, and what can be improved. Not blame sessions — training opportunities for continuous improvement.' },
        ],
        quizQuestions: [
          {
            questionText: 'After a major emergency incident, a debrief session is:',
            options: opts('An opportunity to determine which officer made mistakes', 'A training opportunity to improve future emergency response', 'Required only if someone was injured', 'The officer\'s opportunity to explain their actions'),
            correctAnswer: 'b',
            explanation: 'Post-incident debriefs are training opportunities — not blame sessions. The goal is continuous improvement of emergency response.' },
        ],
      },
    ],
    finalExamQuestions: [
      { questionText: 'RUN-HIDE-FIGHT is used during:', options: opts('Standard evacuation drills', 'Active threat situations', 'Medical emergencies', 'Fire evacuations'), correctAnswer: 'b', explanation: 'RUN-HIDE-FIGHT is the active threat response model.' },
      { questionText: 'Cover differs from concealment because:', options: opts('Cover is easier to find', 'Cover blocks sight lines; concealment stops projectiles', 'Cover stops projectiles; concealment only blocks sight lines', 'There is no meaningful difference in an emergency'), correctAnswer: 'c', explanation: 'Cover (concrete, steel) stops projectiles. Concealment (drywall, curtains) only blocks sight lines.' },
      { questionText: 'In RACE, "Contain" means:', options: opts('Contain the fire using a fire extinguisher', 'Close doors to slow fire spread (but never lock them)', 'Contain bystanders away from the emergency', 'Contain the incident report until reviewed by management'), correctAnswer: 'b', explanation: 'Contain means closing fire doors to slow fire spread. Doors must not be locked — evacuation routes must remain open.' },
      { questionText: 'The first step in PASS fire extinguisher protocol is:', options: opts('Push the trigger', 'Pull the safety pin', 'Point at the base of the fire', 'Prepare the area'), correctAnswer: 'b', explanation: 'PASS: Pull (pin), Aim, Squeeze, Sweep. The first step is always pulling the safety pin.' },
      { questionText: 'When should 911 be called for a medical situation?', options: opts('Only when the person is unconscious', 'Only when the person requests emergency services', 'Immediately — EMS professionals can assess severity upon arrival', 'After the security officer has assessed the situation for at least 5 minutes'), correctAnswer: 'c', explanation: '911 should be called immediately in any medical emergency. EMS can assess severity on arrival.' },
      { questionText: 'During fire evacuation, elevators should be used:', options: opts('Only for persons with mobility impairments', 'Never', 'Only on floors below the fire', 'If they are certified fire-rated'), correctAnswer: 'b', explanation: 'Elevators must never be used during fire evacuations — electrical failure and smoke create fatal hazards.' },
      { questionText: 'The first information given when calling 911 should be:', options: opts('Your name', 'The nature of the emergency', 'Your location', 'The number of persons involved'), correctAnswer: 'c', explanation: 'Location goes first — if the call is dropped, responders must know where to go.' },
      { questionText: 'A security officer can re-enter a building after fire evacuation when:', options: opts('The smoke alarm stops sounding', 'They believe the fire is out', 'Authorized by fire department officials', 'Their shift supervisor gives the all-clear'), correctAnswer: 'c', explanation: 'Only fire department officials can authorize re-entry after a fire evacuation.' },
      { questionText: 'After a major emergency, posting about it on social media is:', options: opts('Acceptable if you describe it generally without identifying the client', 'Acceptable if the post is made after the incident is resolved', 'Never acceptable — all public communications go through designated spokespeople', 'Acceptable if you are off duty'), correctAnswer: 'c', explanation: 'Emergency incidents have legal and privacy implications. All public communications go through the client\'s or employer\'s designated spokesperson only.' },
      { questionText: 'If you genuinely do not remember a specific detail during a post-incident investigation:', options: opts('Estimate what likely happened based on standard procedure', 'Say "I don\'t recall" — it is an acceptable and professional answer', 'Ask a coworker what they remember and use that', 'Decline to participate in the investigation'), correctAnswer: 'b', explanation: '"I don\'t recall" is an appropriate response. Fabricating details to fill memory gaps is dishonest and creates serious legal liability.' },
    ],
  },

  {
    title: 'Handcuffing and Restraint',
    description: 'Legal authority to restrain, proper technique overview, liability, documentation, and when not to restrain.',
    category: 'use_of_force',
    passingScore: 80,
    certificateValidDays: 365,
    isRequired: false,
    stateCreditHours: '1.00',
    orderIndex: 8,
    sections: [
      {
        title: 'Legal Authority to Restrain',
        contentBody: `Physical restraint — including handcuffing — is among the most legally significant actions a private security officer can take. Unlike law enforcement, private security officers do not have an inherent right to detain or restrain. This authority must come from specific state law (typically citizen's arrest or merchant privilege statutes), explicit post orders authorizing restraint, and a lawful basis for detention.

Before any restraint, three legal questions must be satisfied: (1) Do I have a legal basis to detain this person? (Under which specific statute or authority?), (2) Is the force level (restraint) proportional to the threat or detention need?, and (3) Am I trained and authorized by my employer to use restraint at this post?

If any of these questions cannot be answered clearly in the affirmative, restraint is not appropriate. The risk of wrongful restraint — civil liability for false imprisonment, potential criminal charges — is substantial. The decision to restrain should never be made hastily.

Restraint may be appropriate when: a person is actively resisting a lawful detention (and you have established lawful authority to detain), a person is an imminent threat to themselves or others, or you are executing a citizen's arrest and need to maintain control of the subject until law enforcement arrives.`,
        flashcardData: [
          { front: 'Three questions before any restraint', back: '1. Is there a legal basis to detain? (Under which authority?)\n2. Is restraint proportional to the threat?\n3. Is the officer trained and authorized for restraint at this post?' },
          { front: 'Legal authority for private security restraint comes from:', back: 'State citizen\'s arrest or merchant privilege statutes, explicit post order authorization, and a lawful basis for detention.' },
          { front: 'Risk of wrongful restraint', back: 'Civil liability for false imprisonment, potential criminal charges against the officer. Decision to restrain must never be made hastily.' },
        ],
        quizQuestions: [
          {
            questionText: 'Before restraining a subject, an officer must confirm that:',
            options: opts('The subject is uncooperative', 'There is a legal basis, restraint is proportional, and the officer is trained and authorized', 'The subject has committed a visible crime', 'At least two officers are present'),
            correctAnswer: 'b',
            explanation: 'All three elements must be present before restraint: legal basis, proportionality, and officer authorization/training.',
          },
        ],
      },
      {
        title: 'Proper Technique Overview',
        contentBody: `Improper handcuffing technique is one of the most common sources of injury claims against security companies. Even a technically lawful detention can result in significant civil liability if the restraint technique causes injury. Understanding proper technique is both a safety and legal obligation.

Key principles of safe handcuffing: (1) Apply handcuffs with the subject's hands behind their back, palms out (this is the most secure and safest position for transport), (2) Check for tightness immediately after application — you should be able to slide one finger between the cuff and the wrist, (3) Double-lock handcuffs after application — this prevents the cuffs from tightening further if the subject struggles, and (4) Monitor the handcuffed subject continuously — never leave them unmonitored.

Position of subject during and after restraint: the prone (face-down) position creates a risk of positional asphyxia, particularly in subjects who are intoxicated, obese, or already struggling. As soon as subjects are controlled, move them to a seated or on-their-side (recovery) position. Death in custody while in the prone position has resulted in significant legal liability for law enforcement and security.

Never restrain a subject's neck, throat, or face. Never pile body weight on a subject's back or chest while they are prone. Both practices have caused deaths and resulted in criminal charges against officers.`,
        flashcardData: [
          { front: 'Handcuff application — 4 key steps', back: '1. Hands behind back, palms out\n2. Check tightness (one finger clearance)\n3. Double-lock cuffs\n4. Monitor subject continuously' },
          { front: 'Positional asphyxia risk', back: 'Prone (face-down) position with weight on back or chest can cause death, especially for intoxicated or obese subjects. Move to seated or recovery position as soon as controlled.' },
          { front: 'Never apply restraint to:', back: 'Neck, throat, or face. Never pile body weight on chest or back of a prone subject. Both have caused deaths and criminal charges.' },
        ],
        quizQuestions: [
          {
            questionText: 'After handcuffing a subject, the officer should immediately:',
            options: opts('Leave the subject to call for backup', 'Check cuff tightness (one finger clearance), double-lock cuffs, and move subject from prone to seated position', 'Apply zip ties as a backup restraint', 'Ask the subject if they have any injuries'),
            correctAnswer: 'b',
            explanation: 'After cuffing: check tightness (one finger clearance), double-lock to prevent tightening, and move from prone to seated or recovery position to prevent positional asphyxia.',
          },
        ],
      },
      {
        title: 'Liability When Restraint Causes Harm',
        contentBody: `When physical restraint causes injury to a subject, the legal consequences can be severe. Understanding the sources of liability — and how to minimize them — is essential for any security officer authorized to use restraint.

Civil liability for restraint injuries arises from: false imprisonment (no lawful basis to detain), excessive force (restraint disproportionate to the threat), negligence in application (improper technique causing injury), and failure to monitor (injuries that occur while the subject is restrained and unmonitored).

The single most important protection against liability is documentation. A contemporaneous, detailed report documenting: the legal basis for detention, the specific behaviors that required restraint, the technique used, the subject's response, injuries present before and after, medical attention provided, and time of each event creates a factual record that is far more credible than memory alone.

Employer and client liability: security companies and their clients face vicarious liability for officer actions. When an officer makes a poor restraint decision, the employer and client are typically named as co-defendants. This is why post orders and training are so important — they document the employer's effort to train officers properly and limit liability for unauthorized actions.

Always seek medical attention for any subject who complains of injury after restraint, who was unconscious at any point, who is intoxicated, or who shows any signs of distress. The cost of EMS evaluation is trivial compared to the liability of an untreated medical emergency in custody.`,
        flashcardData: [
          { front: 'Four sources of civil liability for restraint injuries', back: '1. False imprisonment (no lawful basis)\n2. Excessive force\n3. Negligent application (technique causing injury)\n4. Failure to monitor' },
          { front: 'Best protection against restraint liability', back: 'Contemporaneous, detailed documentation of: legal basis, specific behaviors requiring restraint, technique used, subject response, injuries before/after, medical attention provided.' },
          { front: 'When to seek medical attention for a restrained subject', back: 'Any complaint of injury, any loss of consciousness, intoxication, or any sign of distress. The cost of EMS is trivial compared to liability of untreated custody emergency.' },
        ],
        quizQuestions: [
          {
            questionText: 'A restrained subject complains of wrist pain. The officer should:',
            options: opts('Note it in the report and release the subject', 'Ignore it — complaints of pain are common after arrests', 'Seek medical attention and document the complaint thoroughly', 'Apply a looser restraint and continue monitoring'),
            correctAnswer: 'c',
            explanation: 'Any complaint of injury requires medical evaluation and thorough documentation. Ignoring complaints creates significant liability if the injury worsens.',
          },
        ],
      },
      {
        title: 'Documentation Requirements for Restraint',
        contentBody: `Every use of restraint requires an immediate, thorough incident report. The documentation standards for restraint use are higher than for most other security actions because restraint involves a deprivation of liberty and significant injury risk.

A restraint documentation report must include: (1) Exact time and location of incident, (2) Identity of subject (name, description, or other identifying information), (3) Specific legal basis for detention — which statute or authority, and the specific observable facts supporting it, (4) Specific behaviors by the subject that necessitated restraint (not "the subject was combative" — "the subject swung their right fist at Officer Jones' head when instructed to stop"), (5) Restraint technique applied, time of application, and by whom, (6) Tightness check confirmation and double-lock confirmation, (7) Subject position post-restraint, (8) Any injuries observed before restraint was applied (important — pre-existing injuries must be documented), (9) Any injuries observed after restraint was applied, (10) Medical attention sought and by whom, (11) Time law enforcement was notified and their response.

Photograph every injury — both pre-existing and post-restraint. Photograph the handcuffs on the subject if possible (to document proper placement). Photographs with timestamps create an objective record that is difficult to dispute.

Supervisor notification: restraint incidents must be reported to the supervisor on duty immediately — not at the end of the shift, not the next day. Delayed notification deprives the supervisor of the opportunity to ensure proper procedures were followed and manage any immediate liability.`,
        flashcardData: [
          { front: 'Why are documentation standards higher for restraint?', back: 'Restraint involves deprivation of liberty and significant injury risk — legal standards for documentation are correspondingly higher.' },
          { front: 'Pre-existing injury documentation', back: 'Injuries present BEFORE restraint must be documented and photographed. Failure to do so creates liability for injuries that may have predated the restraint.' },
          { front: 'Supervisor notification for restraint incidents', back: 'Immediately — not end of shift, not next day. Delayed notification prevents timely liability management and proper procedure review.' },
        ],
        quizQuestions: [
          {
            questionText: 'A subject has a bruise on their arm before restraint is applied. The officer should:',
            options: opts('Ignore it — it is not relevant to the restraint documentation', 'Document and photograph the pre-existing injury before proceeding with restraint', 'Decline to apply restraint due to pre-existing injury', 'Have a witness sign that the injury was pre-existing'),
            correctAnswer: 'b',
            explanation: 'Pre-existing injuries must be documented and photographed before restraint to prevent being attributed to the restraint itself.',
          },
        ],
      },
      {
        title: 'When NOT to Restrain',
        contentBody: `Knowing when not to restrain is as important as knowing how to restrain. In many situations, the risks of restraint — injury, liability, improper authority — outweigh the benefits, and alternative responses are more appropriate.

Do NOT restrain for: verbal non-compliance alone (words are not a basis for physical restraint), suspicion without articulable behavioral evidence, situations where law enforcement is already responding and can manage the subject upon arrival, any situation where your post orders or employer policy do not authorize restraint, and any situation where you cannot answer all three pre-restraint questions affirmatively.

Restraint is particularly inadvisable when: the subject is elderly, pregnant, or has a visible medical condition (increased injury risk), the subject has committed only a minor infraction with no flight risk or safety threat, there are enough resources available to contain the situation through presence and verbal communication without physical contact, and law enforcement is minutes away.

Alternative responses to consider before restraint: verbal commands with clear consequences, officer presence (multiple officers), calling for law enforcement, escorting a person off the premises (if they are cooperative), or simply observing and documenting while waiting for law enforcement.

The principle: restraint creates risk — of injury to the subject, injury to the officer, civil liability, and regulatory scrutiny. It should be used only when clearly warranted and all prerequisites are confirmed.`,
        flashcardData: [
          { front: 'When NOT to restrain — 5 situations', back: '1. Verbal non-compliance alone\n2. Suspicion without articulable evidence\n3. Law enforcement already responding\n4. Post orders don\'t authorize it\n5. Cannot answer all 3 pre-restraint questions affirmatively' },
          { front: 'Alternatives to restraint', back: 'Verbal commands with consequences, increased officer presence, calling law enforcement, escorted exit (if cooperative), observation/documentation while awaiting police.' },
          { front: 'High-risk subjects for restraint complications', back: 'Elderly, pregnant, or visibly medically compromised subjects. Minor infraction with no flight risk or safety threat. Restraint complications are worse here.' },
        ],
        quizQuestions: [
          {
            questionText: 'A subject verbally refuses to leave the property but makes no threatening movements. Law enforcement is 3 minutes away. The best action is:',
            options: opts('Immediately apply handcuffs to prevent potential escalation', 'Continue verbal engagement and wait for law enforcement arrival', 'Physically block the subject from leaving to ensure they are present for police', 'Issue a verbal warning and walk away'),
            correctAnswer: 'b',
            explanation: 'With law enforcement 3 minutes away and no immediate safety threat, continuing verbal engagement is more appropriate than physical restraint.',
          },
        ],
      },
    ],
    finalExamQuestions: [
      { questionText: 'A private security officer\'s authority to use restraint comes from:', options: opts('Their security license', 'State citizen\'s arrest/merchant privilege statutes, post order authorization, and a lawful detention basis', 'Any situation where the subject is non-compliant', 'Federal Homeland Security regulations'), correctAnswer: 'b', explanation: 'Restraint authority requires all three: statutory basis, post order authorization, and a lawful detention basis.' },
      { questionText: 'After applying handcuffs, the first check is:', options: opts('Whether the subject will cooperate', 'Cuff tightness — one finger clearance', 'The subject\'s identity', 'Whether backup has been called'), correctAnswer: 'b', explanation: 'Immediately after application, check that cuffs allow one finger clearance and then double-lock to prevent tightening.' },
      { questionText: 'Double-locking handcuffs prevents:', options: opts('The cuffs from opening without a key', 'The cuffs from tightening further if the subject struggles', 'The subject from injuring the officer', 'The cuffs from rusting'), correctAnswer: 'b', explanation: 'Double-locking freezes the ratchet mechanism, preventing the cuffs from tightening if the subject struggles.' },
      { questionText: 'Positional asphyxia risk is highest when a subject is:', options: opts('Seated with hands behind their back', 'Prone (face-down) with weight on their chest or back', 'Seated in a chair', 'Standing and leaning against a wall'), correctAnswer: 'b', explanation: 'Prone position with weight on chest or back restricts breathing and can cause death, especially in intoxicated or obese subjects.' },
      { questionText: 'Verbal non-compliance alone (refusing to answer questions) is:', options: opts('Sufficient basis for restraint if the subject has been warned', 'Never a sufficient basis for physical restraint', 'Sufficient if witnessed by two officers', 'Sufficient if a criminal violation is suspected'), correctAnswer: 'b', explanation: 'Words alone — even defiant refusal — are never a sufficient basis for physical restraint without a lawful detention authority.' },
      { questionText: 'A subject\'s pre-existing bruise must be documented because:', options: opts('It affects the choice of restraint technique', 'It might limit the force level authorized', 'It prevents it from later being attributed to the restraint', 'It is required only if the subject requests documentation'), correctAnswer: 'c', explanation: 'Pre-existing injuries must be documented before restraint to prevent the injuries from being incorrectly attributed to the restraint itself.' },
      { questionText: 'After restraint is applied, the subject should be moved from the prone position to:', options: opts('A standing position immediately', 'A seated or recovery (on-side) position', 'A kneeling position', 'The prone position is acceptable for monitoring'), correctAnswer: 'b', explanation: 'The prone position creates positional asphyxia risk. Move to seated or recovery position as soon as the subject is controlled.' },
      { questionText: 'Restraint liability arises when:', options: opts('Only when the subject is injured', 'Only when restraint was not authorized by post orders', 'From false imprisonment, excessive force, negligent technique, or failure to monitor', 'Only in criminal proceedings'), correctAnswer: 'c', explanation: 'Liability arises from multiple sources: false imprisonment, excessive force, negligent application, and failure to monitor.' },
      { questionText: 'When should a supervisor be notified after a restraint incident?', options: opts('At the end of the shift', 'The next business day', 'Immediately — not at end of shift', 'Only if the subject is transported by EMS'), correctAnswer: 'c', explanation: 'Supervisor notification must be immediate to enable proper procedure review and liability management.' },
      { questionText: 'Which of the following is an alternative to restraint?', options: opts('Standing closer to increase pressure on the subject', 'Calling for law enforcement to manage the subject upon arrival', 'Threatening criminal charges to compel compliance', 'None — restraint is the only option when verbal commands fail'), correctAnswer: 'b', explanation: 'Calling for law enforcement, additional officer presence, escorted exit, and observation/documentation are all alternatives to restraint.' },
    ],
  },

  {
    title: 'Workplace Violence Prevention',
    description: 'Recognizing warning signs, prevention strategies, reporting procedures, and supporting affected coworkers.',
    category: 'safety',
    passingScore: 80,
    certificateValidDays: 365,
    isRequired: true,
    stateCreditHours: '1.00',
    orderIndex: 9,
    sections: [
      {
        title: 'Warning Signs and Risk Factors',
        contentBody: `Workplace violence rarely occurs without warning signs. Research consistently shows that perpetrators of workplace violence exhibit observable warning signs before incidents — but those signs are often dismissed, minimized, or not reported. Security officers play a critical role in identifying and escalating these warning signs before violence occurs.

Behavioral warning signs include: escalating verbal threats (especially specific, targeted threats), increased agitation or hostility without apparent cause, fixation on a grievance (an employee who obsessively references being wronged by a coworker or supervisor), drastic changes in behavior or appearance, social withdrawal combined with expressions of hopelessness or despair, statements about harming others ("If I go down, I'm taking everyone with me"), and bringing weapons or discussing weapons in inappropriate contexts.

Risk factors that increase likelihood of workplace violence: recent termination, disciplinary action, or perceived unfair treatment; personal stressors including financial problems, relationship issues, or substance abuse; history of violent or threatening behavior; and access to the workplace combined with a grievance against it.

The security officer's role is not to diagnose mental illness or predict violence — it is to observe, document, and report observable behaviors to supervisors and, where appropriate, to the threat assessment team or law enforcement. Early reporting saves lives. Barriers to reporting — "I don't want to get them in trouble," "It's probably nothing" — must be overcome.`,
        flashcardData: [
          { front: 'Key behavioral warning signs of potential workplace violence', back: 'Specific targeted threats, escalating agitation, grievance fixation, drastic behavior changes, hopelessness/despair statements, weapons discussion, "taking everyone with me" statements.' },
          { front: 'Risk factors elevating workplace violence likelihood', back: 'Recent termination/discipline, perceived unfair treatment, personal stressors, history of threatening behavior, access combined with grievance.' },
          { front: 'Officer\'s role in workplace violence prevention', back: 'Observe, document, and report observable behaviors to supervisors — not to diagnose or predict. Early reporting saves lives.' },
        ],
        quizQuestions: [
          {
            questionText: 'An employee says to a security officer: "I\'m going to make everyone here regret what they did to me." The officer should:',
            options: opts('Advise the employee to calm down and move on', 'Document the statement verbatim and report it to supervisors immediately', 'Tell the employee this comment will be forgotten if they behave from now on', 'Ask the employee to explain what they mean before deciding to report'),
            correctAnswer: 'b',
            explanation: 'Specific threatening statements must be documented verbatim and reported immediately. The officer\'s role is to observe and report, not to assess whether the threat is credible.',
          },
        ],
      },
      {
        title: 'Prevention Strategies',
        contentBody: `Workplace violence prevention is a shared responsibility requiring multiple layers of protection. Security officers contribute to each of these layers as part of an integrated prevention system.

Physical environment: proper lighting in all areas (particularly parking lots, stairwells, and isolated corridors), access control systems that limit entry to authorized persons, clear sightlines that minimize concealment opportunities, and communication systems that allow immediate contact with security and emergency services.

Access control as prevention: knowing who belongs in your facility is the most powerful prevention tool available. Challenge unfamiliar persons in restricted areas professionally ("Good morning — can I help you find who you're looking for?"). Maintain visitor logs. Ensure terminated employees' access credentials are deactivated immediately — this is a critical security protocol that is frequently overlooked.

Behavioral monitoring: regular visible patrols at variable intervals signal that the facility is actively monitored. Officers who know the regular occupants of their post — by name and by pattern — will recognize deviations from normal behavior.

Reporting culture: the most effective prevention comes from a culture where people feel safe reporting concerns. Officers should proactively communicate to facility occupants that threatening or concerning behavior should be reported and will be taken seriously. "If you see something, say something" only works if people believe reports will be acted upon.`,
        flashcardData: [
          { front: 'Most powerful access control prevention tool', back: 'Knowing who belongs in the facility and professionally challenging unfamiliar persons in restricted areas.' },
          { front: 'Critical termination protocol', back: 'Terminated employees\' access credentials must be deactivated immediately. This is frequently overlooked and creates significant vulnerability.' },
          { front: 'Reporting culture in workplace violence prevention', back: '"See something, say something" only works if people believe reports will be taken seriously. Officers must communicate this credibly.' },
        ],
        quizQuestions: [
          {
            questionText: 'Which prevention measure is most frequently overlooked when an employee is terminated?',
            options: opts('Notifying their manager', 'Retrieving their uniform', 'Immediately deactivating their access credentials', 'Documenting the termination reason'),
            correctAnswer: 'c',
            explanation: 'Immediate deactivation of access credentials after termination is critical and frequently overlooked, creating significant workplace violence vulnerability.',
          },
        ],
      },
      {
        title: 'Reporting Procedures',
        contentBody: `Effective reporting is the bridge between warning sign recognition and prevention. Security officers must know exactly how and where to report workplace violence concerns — and must report without hesitation when they observe warning signs.

Internal reporting chain: the initial report of workplace violence concern goes to the immediate supervisor on duty, followed by escalation to the site security manager or director, the client's HR department or management team (if a client employee is involved), and if threats are specific and credible, law enforcement.

What to include in a workplace violence threat report: (1) Who made the concerning statement or exhibited concerning behavior, (2) Exactly what they said or did — verbatim where possible, (3) When and where it occurred, (4) Any witnesses present, (5) The context — what preceded the behavior, (6) Your assessment of the person's demeanor and emotional state, and (7) Any prior incidents involving the same person.

Confidentiality: threat reports should be handled with discretion. The person being reported should not be informed of the report by the security officer (management will handle this appropriately). Violation of this confidentiality can cause the reporting person to face retaliation and can impede the investigation.

Anonymous reporting options: many organizations have anonymous tip lines for reporting safety concerns. Security officers should know whether such a system exists at their post and be able to direct occupants to it.`,
        flashcardData: [
          { front: 'Internal reporting chain for workplace violence concerns', back: 'Immediate supervisor → site security manager → client HR/management (if client employee) → law enforcement if specific and credible threat.' },
          { front: 'Should the security officer tell the reported person about the report?', back: 'No. Management handles this. Disclosing the report can cause retaliation against the reporter and impede investigation.' },
          { front: '7 elements of a workplace violence threat report', back: 'Who, what (verbatim), when/where, witnesses, context, demeanor assessment, prior incidents with same person.' },
        ],
        quizQuestions: [
          {
            questionText: 'After filing a threat report, should the security officer tell the subject that a report has been filed?',
            options: opts('Yes — to give them a chance to respond', 'No — this creates retaliation risk and impedes investigation', 'Yes — transparency is required', 'Only if the supervisor approves'),
            correctAnswer: 'b',
            explanation: 'Security officers must not disclose to the reported person that a report was filed. Disclosure creates retaliation risk for the reporter and impedes investigation.',
          },
        ],
      },
      {
        title: 'Post-Incident Support',
        contentBody: `Workplace violence — even an incident that does not involve physical harm — can have significant psychological effects on witnesses, bystanders, and security officers involved. Recognizing and addressing these effects is part of a professional post-incident response.

Critical Incident Stress Debriefing (CISD) is a structured process for helping people process traumatic events. Many security companies and employers have access to Employee Assistance Programs (EAPs) that provide counseling and support after critical incidents. Security officers should be aware of these resources and be prepared to direct affected persons to them.

Signs of acute stress reaction in the aftermath of an incident: emotional numbness or detachment, physical symptoms (headache, nausea, dizziness), difficulty concentrating, intrusive thoughts or images about the incident, hyper-vigilance, and sleep disturbances. These are normal responses to an abnormal event — they do not indicate weakness.

Security officers themselves are not immune to the psychological effects of workplace violence incidents. If you were involved in or witnessed a significant incident, you may experience acute stress reactions. Seeking support is professional and appropriate — not a sign of weakness.

Reporting your own stress reactions to a supervisor or EAP is important for your long-term wellbeing and for your ability to continue performing effectively. Untreated stress reactions can worsen over time and impair judgment and performance.`,
        flashcardData: [
          { front: 'Signs of acute stress reaction after workplace violence', back: 'Emotional numbness, physical symptoms (headache, nausea), difficulty concentrating, intrusive thoughts, hyper-vigilance, sleep disturbances. Normal responses to abnormal events.' },
          { front: 'CISD', back: 'Critical Incident Stress Debriefing — a structured process for helping people process traumatic events after workplace violence or other critical incidents.' },
          { front: 'Should security officers seek support after critical incidents?', back: 'Yes. Seeking EAP counseling or CISD support is professional and appropriate. Untreated stress reactions worsen over time and impair performance.' },
        ],
        quizQuestions: [
          {
            questionText: 'An officer who witnessed a violent incident is experiencing sleep disturbances and intrusive thoughts. These symptoms:',
            options: opts('Indicate the officer is unfit for security work', 'Are normal responses to abnormal events and should be reported and addressed', 'Are grounds for immediate suspension', 'Should be ignored — they will resolve on their own without intervention'),
            correctAnswer: 'b',
            explanation: 'Acute stress reactions are normal responses to critical incidents. They should be addressed through EAP or CISD support — ignoring them can worsen outcomes.',
          },
        ],
      },
    ],
    finalExamQuestions: [
      { questionText: 'Workplace violence warning signs include:', options: opts('Arriving to work early', 'Specific targeted threats and fixation on grievances', 'Taking extended lunch breaks', 'Requesting time off'), correctAnswer: 'b', explanation: 'Specific targeted threats and grievance fixation are significant warning signs that must be reported.' },
      { questionText: 'A terminated employee\'s access credentials should be deactivated:', options: opts('Within 30 days of termination', 'At the end of the month', 'Immediately upon termination', 'When they attempt to re-enter the facility'), correctAnswer: 'c', explanation: 'Immediate deactivation upon termination is critical to prevent access-based workplace violence.' },
      { questionText: 'A security officer\'s role upon observing warning signs is to:', options: opts('Diagnose whether the person is dangerous', 'Intervene directly with the person to de-escalate', 'Observe, document, and report to supervisors', 'Post about the behavior for colleague awareness'), correctAnswer: 'c', explanation: 'Security officers observe, document, and report — not diagnose or predict violence.' },
      { questionText: 'The initial report of a workplace violence concern goes to:', options: opts('Local law enforcement directly', 'The immediate supervisor on duty', 'The client\'s CEO directly', 'All coworkers to create awareness'), correctAnswer: 'b', explanation: 'Initial reporting goes to the immediate supervisor, who escalates appropriately.' },
      { questionText: 'Acute stress reactions after a critical incident are:', options: opts('Signs of professional unsuitability', 'Normal responses to abnormal events that should be addressed', 'Automatic grounds for desk duty', 'Only experienced by inexperienced officers'), correctAnswer: 'b', explanation: 'Acute stress reactions are normal after critical incidents. EAP and CISD support should be accessed.' },
      { questionText: 'Confidentiality of a threat report means:', options: opts('The report is never shared with anyone', 'The subject of the report should not be told by the security officer', 'Only law enforcement can see the report', 'The report is sealed for 30 days'), correctAnswer: 'b', explanation: 'Security officers must not disclose to the reported person that a report was filed — management handles this appropriately.' },
      { questionText: 'Which physical environment feature is most important for workplace violence prevention?', options: opts('Comfortable seating in common areas', 'Proper lighting and clear sightlines that minimize concealment', 'Attractive landscaping at main entrance', 'Security cameras in all offices'), correctAnswer: 'b', explanation: 'Proper lighting and clear sightlines reduce concealment opportunities and increase the deterrence effect of security presence.' },
      { questionText: '"If you see something, say something" is most effective when:', options: opts('It is posted on signs throughout the facility', 'People believe reports will be taken seriously and acted upon', 'It is reinforced during annual fire drills', 'The security company is replaced annually'), correctAnswer: 'b', explanation: 'Reporting culture requires credibility — people must believe that reports will be taken seriously before they will report.' },
    ],
  },

  {
    title: 'Sexual Harassment Prevention',
    description: 'Definitions, examples, reporting procedures, officer responsibilities, and bystander intervention.',
    category: 'professionalism',
    passingScore: 80,
    certificateValidDays: 365,
    isRequired: true,
    stateCreditHours: '1.00',
    orderIndex: 10,
    sections: [
      {
        title: 'Definitions and Examples',
        contentBody: `Sexual harassment is unwelcome sexual conduct that creates a hostile, intimidating, or offensive work environment, or that results in an adverse employment decision. It is prohibited by federal law (Title VII of the Civil Rights Act) and by virtually every state law, and applies to all employees including security officers.

There are two primary forms of sexual harassment: (1) Quid pro quo — "this for that" — where an employment benefit is conditioned on sexual conduct ("I'll approve your schedule request if you..."), and (2) Hostile work environment — where sexual conduct is severe or pervasive enough to create an environment that a reasonable person would find hostile, abusive, or offensive.

Sexual harassment can be: verbal (sexual comments, jokes, requests for dates, sexual propositions), non-verbal (sending sexual messages, displaying sexual images, gestures), physical (unwanted touching, proximity, blocking movement), and digital (sexual messages via work communication platforms, social media harassment of coworkers).

Key principle: harassment is defined by the effect on the recipient, not the intent of the sender. "I was just joking" or "I didn't mean anything by it" is not a defense. The standard is whether a reasonable person would find the conduct offensive or hostile.

Sexual harassment can occur between any persons of any gender combination. It does not require a supervisor-subordinate relationship — coworker-to-coworker harassment is equally prohibited.`,
        flashcardData: [
          { front: 'Two forms of sexual harassment', back: 'Quid pro quo: employment benefit conditioned on sexual conduct.\nHostile work environment: sexual conduct severe/pervasive enough to be offensive to a reasonable person.' },
          { front: 'Intent vs. effect in harassment determination', back: 'Intent does not determine harassment. "I was joking" is not a defense. The standard is whether a reasonable person would find the conduct offensive.' },
          { front: 'Four forms sexual harassment can take', back: 'Verbal (comments, jokes, propositions), non-verbal (images, gestures, messages), physical (touching, blocking), digital (work platforms, social media).' },
        ],
        quizQuestions: [
          {
            questionText: 'A coworker tells a sexual joke to a group, and one person finds it offensive but says nothing. This is:',
            options: opts('Not harassment — the person did not object', 'Not harassment — it was directed at the group, not one person', 'Potentially harassment — defined by whether a reasonable person would find it offensive, not whether the victim objected', 'Only harassment if management hears the joke'),
            correctAnswer: 'c',
            explanation: 'Harassment is determined by whether a reasonable person would find the conduct offensive — not by whether the victim verbally objected at the time.',
          },
        ],
      },
      {
        title: 'Reporting Procedures',
        contentBody: `Every employee, including security officers, has the right to report sexual harassment without fear of retaliation. Understanding the reporting process — and the legal protections available — is essential for both officers who experience harassment and those who witness it.

Reporting options: (1) Direct supervisor (unless the supervisor is the harasser), (2) HR department or designated harassment complaint officer, (3) Anonymous complaint line if available, and (4) External reporting to the Equal Employment Opportunity Commission (EEOC) or state equivalent.

Documentation before reporting: document incidents as they occur — date, time, location, who was present, exactly what was said or done, your response, and how it made you feel. Documentation is critical for supporting a complaint.

Retaliation for reporting sexual harassment is separately and additionally illegal. If you report sexual harassment and face negative employment consequences as a result (demotion, schedule changes, hostile treatment, termination), this constitutes retaliation — a separate legal violation that entitles the reporter to additional remedies.

Employers are generally required to investigate all complaints promptly and thoroughly. If you report and the investigation is not taken seriously, you may have additional recourse through external agencies. The EEOC statute of limitations is generally 180 days (or 300 days in states with local fair employment practice agencies) from the date of the violation.`,
        flashcardData: [
          { front: 'Four reporting options for sexual harassment', back: '1. Direct supervisor (unless they are the harasser)\n2. HR department\n3. Anonymous complaint line\n4. EEOC or state equivalent' },
          { front: 'Retaliation for harassment reporting is:', back: 'Separately and additionally illegal. Negative employment consequences after a complaint entitle the reporter to additional legal remedies.' },
          { front: 'EEOC filing deadline', back: 'Generally 180 days (or 300 days in states with local agencies) from the date of the violation. Document incidents immediately.' },
        ],
        quizQuestions: [
          {
            questionText: 'An officer reports sexual harassment and is subsequently assigned worse shifts. This is:',
            options: opts('Normal management discretion', 'Retaliation — separately and additionally illegal', 'Acceptable if the shift change has a business justification', 'Only actionable if accompanied by a verbal threat'),
            correctAnswer: 'b',
            explanation: 'Adverse employment actions following a harassment complaint constitute retaliation — a separately illegal act that provides additional legal remedies.',
          },
        ],
      },
      {
        title: 'Officer Responsibilities',
        contentBody: `Security officers have specific responsibilities related to sexual harassment prevention that go beyond simply not harassing others. As representatives of their employer and their client, officers must maintain professional conduct, respond appropriately when harassment is reported to them, and actively contribute to a respectful work environment.

As a security officer, you must: never engage in sexual harassment of any kind (against coworkers, visitors, or any person), maintain professional conduct at all times in uniform and on client property, respond appropriately when a visitor or employee reports experiencing harassment, document any harassment incidents you observe or that are reported to you, and report observed or reported harassment to your supervisor according to your employer's policy.

If a person reports being harassed to you: listen respectfully, take the report seriously regardless of your personal assessment of its likelihood, tell them you will document the report and ensure it reaches the appropriate person, do not investigate yourself (that is HR's role), and do not identify the reporter to the alleged harasser.

Security officers should not make personal judgments about the credibility of harassment reports. Your role is to receive, document, and forward the report. Credibility assessments are made by HR and management with full information — not by the officer in the field.

Additionally, security officers must never use their position of authority to create or contribute to a hostile environment. The power differential inherent in the security role creates additional professional obligations to exercise authority responsibly and without inappropriate personal conduct.`,
        flashcardData: [
          { front: 'When a person reports harassment to you:', back: 'Listen respectfully, take it seriously, document and forward to supervisor. Do not investigate yourself. Do not identify reporter to alleged harasser.' },
          { front: 'Who assesses credibility of a harassment report?', back: 'HR and management with full information — not the security officer in the field. Officers receive, document, and forward.' },
          { front: 'Additional obligation of security officers re: power differential', back: 'The authority inherent in the security role creates a professional obligation to exercise authority responsibly and without inappropriate personal conduct toward those in a less powerful position.' },
        ],
        quizQuestions: [
          {
            questionText: 'A visitor reports to a security officer that a coworker has been making sexual comments to them. The officer should:',
            options: opts('Tell the visitor it\'s not a security matter — call HR directly', 'Listen respectfully, document the report, and ensure it reaches the appropriate supervisor or HR contact', 'Ask the visitor to identify witnesses before forwarding the report', 'Investigate by speaking with the alleged harasser first'),
            correctAnswer: 'b',
            explanation: 'Officers receive, document, and forward harassment reports — they do not investigate themselves or require witnesses before accepting the report.',
          },
        ],
      },
      {
        title: 'Bystander Intervention',
        contentBody: `Bystander intervention is the practice of safely interrupting or addressing problematic situations as a witness, rather than waiting for the targeted person or management to address it. Research shows that workplaces with active bystander intervention cultures have significantly lower rates of harassment and hostile conduct.

The 5D model for bystander intervention: (1) Direct — directly address the behavior ("That comment was inappropriate and not okay here"), (2) Distract — interrupt the situation without directly confronting ("Hey, can I talk to you for a minute?"), (3) Delegate — find someone with more authority to intervene ("I need to report this to a supervisor right now"), (4) Delay — check in with the targeted person afterward ("Are you okay? Do you want me to help you report what just happened?"), and (5) Document — document what you observed for potential reporting.

For security officers specifically: direct and delegate interventions are most appropriate in your professional role. As a security officer, you have professional authority to address inappropriate conduct in the workplace or client facility. Using this authority to address observed harassment is consistent with your professional role.

Intervention does not require certainty that harassment has occurred. If you observe behavior that appears to cross professional boundaries, intervening appropriately — professionally and without confrontation — prevents escalation and demonstrates that the organization takes standards seriously.

Bystander barriers to overcome: "It's not my place," "I don't want to get involved," "Maybe I'm reading this wrong," or "They'll handle it themselves." These barriers are common — but overcoming them is what distinguishes active bystanders from passive witnesses.`,
        flashcardData: [
          { front: '5D Bystander Intervention Model', back: 'Direct (address it), Distract (interrupt without confronting), Delegate (find authority), Delay (check in afterward), Document (record what you saw).' },
          { front: 'Most appropriate interventions for security officers', back: 'Direct and Delegate — security officers have professional authority to address inappropriate conduct in the workplace.' },
          { front: 'Does intervention require certainty of harassment?', back: 'No. If behavior appears to cross professional boundaries, appropriate intervention prevents escalation. Certainty is not required.' },
        ],
        quizQuestions: [
          {
            questionText: 'A security officer witnesses a supervisor making repeated sexual comments to a subordinate employee. The most appropriate bystander response is:',
            options: opts('Ignore it — it\'s between them', 'Document and report to your supervisor (delegate), address the situation professionally if you can (direct)', 'Tell the targeted employee to file their own complaint', 'Ask the supervisor to stop after the employee leaves'),
            correctAnswer: 'b',
            explanation: 'Document, report (delegate), and if possible address directly. Security officers have professional authority to intervene in observed inappropriate conduct.',
          },
        ],
      },
    ],
    finalExamQuestions: [
      { questionText: 'Quid pro quo harassment involves:', options: opts('Severe or pervasive sexual conduct in the workplace', 'Conditioning an employment benefit on sexual conduct', 'Sexual harassment between peers of equal status', 'Digital harassment through work communication systems'), correctAnswer: 'b', explanation: 'Quid pro quo harassment: "this for that" — employment benefits conditioned on sexual conduct.' },
      { questionText: 'The intent of the person engaging in sexual conduct:', options: opts('Determines whether harassment occurred', 'Does not determine harassment — effect on the recipient matters', 'Is a complete defense if the intent was humorous', 'Only matters in criminal sexual harassment cases'), correctAnswer: 'b', explanation: '"I was just joking" is not a defense. Harassment is determined by effect on a reasonable person, not intent of the actor.' },
      { questionText: 'An officer who witnesses a coworker being harassed should:', options: opts('Mind their own business', 'Consider using the 5D bystander intervention model', 'Tell the targeted coworker to file a report', 'Confront the harasser privately after the incident'), correctAnswer: 'b', explanation: 'The 5D model (Direct, Distract, Delegate, Delay, Document) provides appropriate bystander intervention options.' },
      { questionText: 'Retaliation against someone who reports harassment is:', options: opts('Legal if the harassment report was unsubstantiated', 'Permitted if it is framed as a performance issue', 'Separately and additionally illegal', 'Only illegal at the federal level'), correctAnswer: 'c', explanation: 'Retaliation for harassment reporting is a separate and additional legal violation beyond the original harassment.' },
      { questionText: 'When a person reports harassment to a security officer, the officer\'s role is to:', options: opts('Assess whether the report is credible before forwarding it', 'Investigate by interviewing the alleged harasser', 'Receive, document, and forward the report to the appropriate supervisor or HR', 'Advise the person on whether their complaint is likely to succeed'), correctAnswer: 'c', explanation: 'Officers receive, document, and forward — they do not investigate or assess credibility.' },
      { questionText: 'Bystander intervention requires certainty that harassment has occurred.', options: opts('True — intervention without certainty creates liability', 'False — intervention is appropriate when behavior appears to cross professional boundaries', 'True — only if two witnesses agree', 'True — at minimum a pattern of behavior must be established'), correctAnswer: 'b', explanation: 'Certainty is not required. Appropriate intervention when behavior appears problematic prevents escalation.' },
      { questionText: 'Sexual harassment can only occur between a supervisor and a subordinate.', options: opts('True — authority relationship is required', 'False — peer-to-peer harassment is equally prohibited', 'True — unless the subordinate is the initiator', 'True — in most states'), correctAnswer: 'b', explanation: 'Sexual harassment can occur between any persons of any gender combination and any organizational relationship, including coworkers of equal status.' },
      { questionText: 'The EEOC filing deadline for sexual harassment claims is generally:', options: opts('30 days from the date of violation', '1 year from the date of violation', '180 days (or 300 in states with local agencies) from the date of violation', 'There is no deadline'), correctAnswer: 'c', explanation: 'EEOC deadline: 180 days in states without local agencies, 300 days where state agencies exist. Timely filing is critical.' },
    ],
  },
];

export async function seedPlatformTrainingModules(): Promise<{ modulesSeeded: number; sectionsSeeded: number; questionsSeeded: number; skipped: number }> {
  console.log('[TrainingSeeder] Starting platform module seed check...');

  let modulesSeeded = 0;
  let sectionsSeeded = 0;
  let questionsSeeded = 0;
  let skipped = 0;

  for (const moduleDef of PLATFORM_MODULES) {
    // Check if module already exists (by title + is_platform_default)
    const existing = await db
      .select({ id: trainingModules.id })
      .from(trainingModules)
      .where(
        sql`${trainingModules.title} = ${moduleDef.title} AND ${trainingModules.isPlatformDefault} = true`,
      )
      .limit(1);

    if (existing.length > 0) {
      console.log(`[TrainingSeeder] Module "${moduleDef.title}" already exists — skipping`);
      skipped++;
      continue;
    }

    // Insert module
    const [insertedModule] = await db
      .insert(trainingModules)
      .values({
        workspaceId: null,
        isPlatformDefault: true,
        title: moduleDef.title,
        description: moduleDef.description,
        category: moduleDef.category,
        passingScore: moduleDef.passingScore,
        certificateValidDays: moduleDef.certificateValidDays,
        isRequired: moduleDef.isRequired,
        affectsEmployeeScore: true,
        scorePenaltyPerDayOverdue: 1,
        maxAttemptsBeforeIntervention: 2,
        stateCreditHours: moduleDef.stateCreditHours,
        orderIndex: moduleDef.orderIndex,
      })
      .returning({ id: trainingModules.id });

    if (!insertedModule) {
      console.error(`[TrainingSeeder] Failed to insert module: ${moduleDef.title}`);
      continue;
    }

    modulesSeeded++;
    console.log(`[TrainingSeeder] Seeded module: ${moduleDef.title} (${insertedModule.id})`);

    // Insert sections
    for (let sIdx = 0; sIdx < moduleDef.sections.length; sIdx++) {
      const sectionDef = moduleDef.sections[sIdx];

      const [insertedSection] = await db
        .insert(trainingSections)
        .values({
          moduleId: insertedModule.id,
          title: sectionDef.title,
          contentBody: sectionDef.contentBody,
          flashcardData: sectionDef.flashcardData,
          orderIndex: sIdx,
          sectionQuizRequired: true,
        })
        .returning({ id: trainingSections.id });

      if (!insertedSection) continue;
      sectionsSeeded++;

      // Insert section quiz questions
      for (let qIdx = 0; qIdx < sectionDef.quizQuestions.length; qIdx++) {
        const q = sectionDef.quizQuestions[qIdx];
        await db.insert(trainingQuestions).values({
          moduleId: insertedModule.id,
          sectionId: insertedSection.id,
          questionText: q.questionText,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          isFinalExam: false,
          orderIndex: qIdx,
        });
        questionsSeeded++;
      }
    }

    // Insert final exam questions
    for (let qIdx = 0; qIdx < moduleDef.finalExamQuestions.length; qIdx++) {
      const q = moduleDef.finalExamQuestions[qIdx];
      await db.insert(trainingQuestions).values({
        moduleId: insertedModule.id,
        sectionId: null,
        questionText: q.questionText,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        isFinalExam: true,
        orderIndex: qIdx,
      });
      questionsSeeded++;
    }
  }

  console.log(`[TrainingSeeder] Complete: ${modulesSeeded} modules, ${sectionsSeeded} sections, ${questionsSeeded} questions seeded. ${skipped} modules already existed.`);
  return { modulesSeeded, sectionsSeeded, questionsSeeded, skipped };
}
