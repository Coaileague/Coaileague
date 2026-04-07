import { UniversalHeader } from "@/components/universal-header";
import { Footer } from "@/components/footer";
import { SEO } from '@/components/seo';
import { Link } from "wouter";

export default function SmsTerms() {
  return (
    <>
      <SEO
        title="SMS Terms of Service | CoAIleague Workforce Alerts"
        description="CoAIleague SMS Workforce Alerts program terms — opt-in, opt-out, message frequency, and privacy information for security workforce SMS notifications."
        canonical="https://coaileague.com/sms-terms"
      />
      <div className="min-h-screen bg-background flex flex-col">
        <UniversalHeader variant="public" />

        <div className="mx-auto max-w-3xl px-4 pt-24 pb-16 sm:px-6 lg:px-8 flex-1">
          <div className="prose prose-slate dark:prose-invert max-w-none">
            <h1 className="text-4xl font-bold mb-2">SMS Terms of Service</h1>
            <p className="text-muted-foreground mb-2">CoAIleague Workforce Alerts SMS Program</p>
            <p className="text-muted-foreground mb-8">Last Updated: March 19, 2026</p>

            {/* ── Program Summary Box ── */}
            <div className="bg-muted/50 border border-border rounded-md p-6 mb-8 not-prose">
              <p className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">Program Summary</p>
              <div className="grid gap-2 text-sm text-foreground/90">
                <div className="flex gap-2"><span className="font-medium min-w-[160px]">Program Name:</span><span>CoAIleague Workforce Alerts</span></div>
                <div className="flex gap-2"><span className="font-medium min-w-[160px]">Sender:</span><span>CoAIleague (toll-free SMS number)</span></div>
                <div className="flex gap-2"><span className="font-medium min-w-[160px]">Message Types:</span><span>Recurring automated workforce notifications</span></div>
                <div className="flex gap-2"><span className="font-medium min-w-[160px]">Message Frequency:</span><span>Varies — up to 10 messages per week during active periods</span></div>
                <div className="flex gap-2"><span className="font-medium min-w-[160px]">Rates:</span><span>Msg &amp; data rates may apply</span></div>
                <div className="flex gap-2"><span className="font-medium min-w-[160px]">Opt Out:</span><span>Reply STOP to any message</span></div>
                <div className="flex gap-2"><span className="font-medium min-w-[160px]">Help:</span><span>Reply HELP or email support@coaileague.com</span></div>
              </div>
            </div>

            {/* ── 1. Program Description ── */}
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">1. Program Description</h2>
              <p className="text-foreground/90 mb-4">
                CoAIleague operates the <strong>CoAIleague Workforce Alerts</strong> SMS messaging program to deliver
                recurring automated text messages to security workforce employees and officers on behalf of their
                employer organizations. These messages support workforce management operations including scheduling,
                safety, compliance, and account administration.
              </p>
              <p className="text-foreground/90 mb-4">
                CoAIleague is a business-to-business (B2B) workforce management platform serving security guard
                companies operating in the United States. SMS messages are sent to employees and officers who have
                explicitly opted in through the CoAIleague platform.
              </p>
            </section>

            {/* ── 2. How to Opt In ── */}
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">2. How to Opt In</h2>
              <p className="text-foreground/90 mb-4">
                SMS consent is obtained through an explicit opt-in checkbox presented to the employee on the
                CoAIleague SMS opt-in page at{" "}
                <Link href="/sms-consent" className="text-primary underline">coaileague.com/sms-consent</Link>{" "}
                and within the CoAIleague workforce platform during profile setup.
                The exact opt-in language displayed at the time of consent is:
              </p>
              <div className="bg-muted border border-border rounded-md p-5 mb-4 not-prose">
                <p className="text-sm text-foreground/90 italic">
                  "By checking this box, I consent to receive recurring automated text message (SMS) notifications
                  from CoAIleague at the mobile number I provided above. Messages include: shift assignments,
                  schedule reminders, clock-in/out alerts, open shift coverage requests, safety alerts, and
                  account notifications sent on behalf of my employer organization. Message frequency varies —
                  up to 10 messages per week during active scheduling periods. Message and data rates may apply.
                  Reply STOP to cancel at any time. Reply HELP for help. Consent is not a condition of purchase,
                  employment, or use of the platform."
                </p>
              </div>
              <p className="text-foreground/90 mb-4">
                The checkbox is <strong>unchecked by default</strong>. Employees must affirmatively check the
                box to enable SMS communications. Consent is recorded with a timestamp and the employee's IP
                address. Consent to receive SMS is entirely separate from and independent of any other agreement,
                including CoAIleague's Terms of Service and Privacy Policy.
              </p>
              <p className="text-foreground/90 mb-4">
                <strong>Consent is not required</strong> to use the CoAIleague platform or as a condition of
                employment with any organization using the platform.
              </p>
            </section>

            {/* ── 3. Types of Messages ── */}
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">3. Types of Messages You May Receive</h2>
              <p className="text-foreground/90 mb-4">
                After opting in, you may receive recurring automated text messages in the following categories:
              </p>
              <ul className="list-disc pl-6 mb-4 text-foreground/90 space-y-2">
                <li>
                  <strong>Shift Assignments:</strong> Notifications of new shift assignments and confirmation
                  messages after you accept a shift offer via SMS reply.
                </li>
                <li>
                  <strong>Schedule Reminders:</strong> Reminders sent before upcoming shifts and notifications
                  of changes to your existing schedule.
                </li>
                <li>
                  <strong>Coverage Requests:</strong> Open shift fill requests sent by your employer when a
                  shift needs to be covered. You may reply YES to accept.
                </li>
                <li>
                  <strong>Safety Alerts:</strong> Emergency notifications, site evacuation alerts, panic alert
                  confirmations, and critical safety communications from your supervisor.
                </li>
                <li>
                  <strong>Clock Reminders:</strong> Reminders to clock in or clock out at the start or end
                  of your assigned shift.
                </li>
                <li>
                  <strong>Account Notifications:</strong> Payroll confirmations, document approval requests,
                  compliance reminders, and time-off request decisions.
                </li>
              </ul>
              <p className="text-foreground/90 mb-4">
                These are operational workforce messages only. CoAIleague does not send marketing, promotional,
                or advertising text messages through this program.
              </p>
            </section>

            {/* ── 4. Message Frequency ── */}
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">4. Message Frequency</h2>
              <p className="text-foreground/90 mb-4">
                Message frequency varies based on your work schedule, your employer's level of activity on the
                platform, and whether you are on-call. During active scheduling periods, you may receive up to
                10 messages per week. During quiet periods, you may receive fewer. Safety and emergency alerts
                may be sent at any time, including outside of normal business hours, when your employer determines
                there is a safety concern requiring immediate notification.
              </p>
            </section>

            {/* ── 5. Message and Data Rates ── */}
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">5. Message and Data Rates</h2>
              <p className="text-foreground/90 mb-4">
                <strong>Message and data rates may apply.</strong> Standard SMS and mobile data rates charged
                by your wireless carrier may apply to text messages you receive from CoAIleague and to any
                replies you send (such as replying YES to a shift offer or STOP to unsubscribe).
                CoAIleague does not charge any additional fees for SMS notifications beyond your standard
                carrier rates. Contact your carrier for rate details.
              </p>
            </section>

            {/* ── 6. How to Opt Out ── */}
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">6. How to Opt Out</h2>
              <p className="text-foreground/90 mb-4">
                You may opt out of SMS messages at any time using any of the following methods:
              </p>
              <ul className="list-disc pl-6 mb-4 text-foreground/90 space-y-2">
                <li>
                  <strong>Reply STOP</strong> to any text message received from CoAIleague. Accepted opt-out
                  keywords include: STOP, STOPALL, CANCEL, END, QUIT, and UNSUBSCRIBE. You will receive exactly
                  one confirmation message and no further messages will be sent to your number unless you
                  affirmatively re-consent.
                </li>
                <li>
                  Log in to the CoAIleague platform, navigate to your employee profile, and uncheck the
                  SMS notifications checkbox.
                </li>
                <li>
                  Email <strong>support@coaileague.com</strong> with your name and mobile phone number
                  requesting removal from SMS communications.
                </li>
              </ul>
              <p className="text-foreground/90 mb-4">
                <strong>Opt-out confirmation message:</strong> After replying STOP (or any accepted opt-out
                keyword), you will receive the following confirmation and no further messages:
              </p>
              <div className="bg-muted border border-border rounded-md p-4 mb-4 not-prose">
                <p className="text-sm text-foreground/90 italic">
                  "You have been unsubscribed from CoAIleague Workforce Alerts. You will receive no further
                  messages from this number. To re-enroll, update your notification preferences in the
                  CoAIleague app."
                </p>
              </div>
            </section>

            {/* ── 7. How to Get Help ── */}
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">7. How to Get Help</h2>
              <p className="text-foreground/90 mb-4">
                Reply <strong>HELP</strong> to any text message from CoAIleague. You will receive the following
                response:
              </p>
              <div className="bg-muted border border-border rounded-md p-4 mb-4 not-prose">
                <p className="text-sm text-foreground/90 italic">
                  "CoAIleague Workforce Alerts: Shift reminders, schedule updates, safety alerts, and account
                  notifications for security staff. Msg frequency varies. Msg &amp; data rates may apply.
                  Reply STOP to unsubscribe. Contact support@coaileague.com for help."
                </p>
              </div>
              <p className="text-foreground/90 mb-4">
                You may also contact CoAIleague support directly:
              </p>
              <ul className="list-none pl-0 mb-4 text-foreground/90 space-y-1">
                <li><strong>Email:</strong> support@coaileague.com</li>
                <li><strong>Website:</strong> coaileague.com</li>
              </ul>
            </section>

            {/* ── 8. Privacy and Data Use ── */}
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">8. Privacy and Data Use</h2>
              <p className="text-foreground/90 mb-4">
                Your mobile phone number and SMS consent status are stored securely within the CoAIleague
                platform and used solely to deliver the workforce notifications you have consented to receive.
              </p>
              <p className="text-foreground/90 mb-4">
                <strong>No mobile information will be shared with third parties or affiliates for marketing
                or promotional purposes.</strong> CoAIleague does not sell, rent, or share your mobile phone
                number with any third party for their own marketing or promotional use.
              </p>
              <p className="text-foreground/90 mb-4">
                Phone numbers are shared with Twilio, Inc. solely for the purpose of message delivery as part
                of the CoAIleague messaging infrastructure. Twilio processes this information under a data
                processing agreement with CoAIleague and is not permitted to use your phone number for its
                own purposes.
              </p>
              <p className="text-foreground/90 mb-4">
                SMS consent records are not shared across employer organizations. Each employer workspace on the
                CoAIleague platform maintains independent, isolated consent records. Opting in with one employer
                does not authorize SMS messages from any other organization.
              </p>
              <p className="text-foreground/90 mb-4">
                For complete privacy information, see our{" "}
                <Link href="/privacy" className="text-primary underline">Privacy Policy</Link>.
              </p>
            </section>

            {/* ── 9. Changes to These Terms ── */}
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">9. Changes to These Terms</h2>
              <p className="text-foreground/90 mb-4">
                CoAIleague may update these SMS Terms of Service from time to time. Material changes will be
                communicated via email to your registered address and via in-app notification. The "Last Updated"
                date at the top of this page will reflect the most recent revision. Continued receipt of SMS
                messages after notice of changes constitutes acceptance of the updated terms.
              </p>
            </section>

            {/* ── 10. Contact ── */}
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">10. Contact</h2>
              <ul className="list-none pl-0 mb-4 text-foreground/90 space-y-1">
                <li><strong>Email:</strong> support@coaileague.com</li>
                <li><strong>Privacy:</strong> privacy@coaileague.com</li>
                <li><strong>Website:</strong> coaileague.com</li>
              </ul>
            </section>

            <div className="mt-10 pt-8 border-t border-border not-prose">
              <p className="text-sm text-muted-foreground">
                These SMS Terms of Service govern the CoAIleague Workforce Alerts SMS program only.
                For general platform terms, see our{" "}
                <Link href="/terms" className="text-primary underline">Terms of Service</Link>.
                For complete privacy information, see our{" "}
                <Link href="/privacy" className="text-primary underline">Privacy Policy</Link>.
              </p>
              <p className="text-xs text-muted-foreground mt-4">
                Trinity™ is a proprietary trademark of CoAIleague, Inc.
                © {new Date().getFullYear()} CoAIleague, Inc. All rights reserved.
              </p>
            </div>
          </div>
        </div>

        <Footer variant="light" />
      </div>
    </>
  );
}
