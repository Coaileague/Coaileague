import { UniversalHeader } from "@/components/universal-header";
import { Footer } from "@/components/footer";
import { CONTACTS, DOMAINS } from "@shared/platformConfig";

export default function SmsOptOut() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <UniversalHeader variant="public" />

      <div className="mx-auto max-w-4xl px-4 pt-24 pb-12 sm:px-6 lg:px-8 flex-1">
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <h1 className="text-4xl font-bold mb-2">SMS Opt-Out</h1>
          <p className="text-muted-foreground mb-8">How to stop receiving SMS messages from CoAIleague</p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. About CoAIleague SMS Messages</h2>
            <p className="text-foreground/90 mb-4">
              CoAIleague sends SMS text messages to workers and managers who have explicitly opted in
              through their workspace administrator. These messages are transactional and operational
              in nature, and may include:
            </p>
            <ul className="list-disc pl-6 mb-4 text-foreground/90">
              <li>Shift reminders (e.g. "You have a shift on Monday at 9:00 AM")</li>
              <li>Schedule change notifications</li>
              <li>Time-off and availability request updates</li>
              <li>Invoice and payment reminders</li>
              <li>Account verification codes (one-time passcodes)</li>
            </ul>
            <p className="text-foreground/90 mb-4">
              Message frequency varies by workspace and role. Message and data rates may apply
              from your carrier. CoAIleague does not charge you to receive these messages.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. How to Opt Out</h2>
            <p className="text-foreground/90 mb-4">
              You can stop receiving SMS messages from CoAIleague at any time using any of the
              following methods:
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">2.1 Reply STOP</h3>
            <p className="text-foreground/90 mb-4">
              Reply <strong>STOP</strong> to any SMS message you receive from us. We will
              immediately stop sending you SMS messages and send a single confirmation reply.
              You may also use any of the following keywords, which Twilio recognizes
              automatically: <code>STOP</code>, <code>STOPALL</code>, <code>UNSUBSCRIBE</code>,
              <code> CANCEL</code>, <code>END</code>, or <code>QUIT</code>.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">2.2 In Your Account Settings</h3>
            <p className="text-foreground/90 mb-4">
              If you have a CoAIleague account, sign in and go to{" "}
              <strong>Settings → Notifications</strong> and disable the "SMS notifications"
              toggle. Your preference is saved immediately.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">2.3 Email Us</h3>
            <p className="text-foreground/90 mb-4">
              Email <a href={`mailto:${CONTACTS.support}`}>{CONTACTS.support}</a> from
              the address associated with your account, with the subject line "SMS Opt-Out",
              and include the phone number you want removed. We will process your request
              within one business day.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. Opting Back In</h2>
            <p className="text-foreground/90 mb-4">
              If you have opted out and later wish to receive SMS messages again, reply{" "}
              <strong>START</strong> or <strong>UNSTOP</strong> to any prior CoAIleague SMS
              thread, or re-enable SMS notifications in <strong>Settings → Notifications</strong>{" "}
              within your account.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. Help</h2>
            <p className="text-foreground/90 mb-4">
              Reply <strong>HELP</strong> to any CoAIleague SMS message to receive contact
              information. You can also reach our support team at{" "}
              <a href={`mailto:${CONTACTS.support}`}>{CONTACTS.support}</a> or by
              visiting our <a href="/support">Support page</a>.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. Privacy</h2>
            <p className="text-foreground/90 mb-4">
              Mobile phone numbers and opt-in status are never sold, rented, or shared with
              third parties for marketing purposes. SMS data is used solely to deliver the
              transactional messages described above. For full details, see our{" "}
              <a href="/privacy">Privacy Policy</a>.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. Contact</h2>
            <p className="text-foreground/90 mb-4">
              CoAIleague<br />
              Email: <a href={`mailto:${CONTACTS.support}`}>{CONTACTS.support}</a><br />
              Web: <a href={DOMAINS.app}>{DOMAINS.app}</a>
            </p>
          </section>
        </div>
      </div>

      <Footer />
    </div>
  );
}
