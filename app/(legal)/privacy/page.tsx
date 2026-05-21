import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — CampusOS',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-base font-semibold text-white mb-3">{title}</h2>
      <div className="space-y-3 text-sm text-slate-400 leading-relaxed">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <>
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: May 21, 2026</p>
      </div>

      <p className="text-sm text-slate-400 leading-relaxed">
        CampusOS collects only what it needs to run the platform. We don't sell your data.
        We try to be direct about what we collect and why.
      </p>

      <Section title="1. What we collect">
        <p><strong className="text-slate-300">Account information:</strong> When you sign up, we collect
        your name, university email address, university name, major, and year of study. This information
        is used to create your profile and make it visible to other students on the platform.</p>

        <p><strong className="text-slate-300">Requests and offers:</strong> When you post a request or
        submit an offer, we store the content of that request or offer — including category, title,
        location, time, budget, and any details you add. This is the core of how the platform works.</p>

        <p><strong className="text-slate-300">Messages:</strong> When you send messages through CampusOS
        to coordinate with another student, we store those messages. They are used to power the
        messaging feature and are visible to you and the other participant in the conversation.</p>

        <p><strong className="text-slate-300">Ratings and reviews:</strong> Completed task ratings and
        any reputation signals are stored and visible on your profile.</p>

        <p><strong className="text-slate-300">Usage and analytics:</strong> We collect lightweight
        behavioral events to understand how the platform is used — for example, when pages are visited,
        when requests are posted, when offers are submitted. These events include a session identifier
        but do not include the content of your messages or requests. Events are used to improve the
        product and are visible only to CampusOS administrators.</p>

        <p><strong className="text-slate-300">Reports:</strong> If you file a report about another user
        or piece of content, we store that report including the reason and any details you provide.
        Reports are only visible to CampusOS administrators.</p>
      </Section>

      <Section title="2. What we do not collect">
        <p>We do not collect payment information. All payments happen directly between students
        outside of the platform. We never see your Venmo, Zelle, bank, or card details.</p>
        <p>We do not collect government ID, passport, or any form of official identity document.</p>
        <p>We do not track your precise location or GPS position in real time.</p>
      </Section>

      <Section title="3. How we use your data">
        <p>Your data is used to:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Power the core features of the platform — profiles, requests, offers, messaging, ratings</li>
          <li>Show your profile to other students so they can decide whether to work with you</li>
          <li>Send you notifications about your requests and offers</li>
          <li>Understand platform usage and improve the product (analytics events)</li>
          <li>Review safety reports and enforce community guidelines</li>
        </ul>
        <p>We do not use your data for advertising. We do not build advertising profiles.</p>
      </Section>

      <Section title="4. Who can see your data">
        <p><strong className="text-slate-300">Other students:</strong> Your name, university, rating,
        and completed task count are visible on your public profile. The requests and offers you post
        are visible to other logged-in students.</p>

        <p><strong className="text-slate-300">CampusOS administrators:</strong> Platform administrators
        can see all platform data for the purpose of operating and maintaining the service, reviewing
        safety reports, and enforcing community guidelines.</p>

        <p><strong className="text-slate-300">Service providers:</strong> We use the following
        infrastructure providers who may process your data:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong className="text-slate-300">Supabase</strong> — database, authentication, and
          real-time features. Your data is stored in Supabase's infrastructure (AWS us-east-1).</li>
          <li><strong className="text-slate-300">Vercel</strong> — web hosting and deployment.
          Request data passes through Vercel's edge network.</li>
          <li><strong className="text-slate-300">Anthropic</strong> — AI-powered request parsing.
          When you describe a request in plain text, that text is sent to the Claude API for parsing.
          We do not send your name, email, or account information to Anthropic.</li>
        </ul>
        <p>We do not sell your personal data to any third party.</p>
      </Section>

      <Section title="5. Data retention">
        <p>
          We retain your account data, requests, offers, and messages for as long as your account
          is active. Analytics events are retained for up to 12 months.
        </p>
        <p>
          When you delete your account, we delete your profile information and disassociate your
          identity from platform data. Some records (such as completed transactions) may be retained
          in anonymized form for platform integrity purposes.
        </p>
      </Section>

      <Section title="6. Your rights">
        <p>You can request access to your data, correction of inaccurate data, or deletion of your
        account at any time by emailing us at{' '}
        <a href="mailto:campusosapp@gmail.com" className="text-blue-400 hover:underline">campusosapp@gmail.com</a>.
        We will respond within 30 days.</p>
      </Section>

      <Section title="7. Cookies and sessions">
        <p>
          CampusOS uses cookies to maintain your login session. These are functional cookies required
          for the platform to work. We do not use third-party tracking cookies or advertising cookies.
        </p>
      </Section>

      <Section title="8. Children">
        <p>
          CampusOS is not intended for anyone under 18. We do not knowingly collect data from
          users under 18. If you believe a minor has signed up, contact us and we will delete
          the account promptly.
        </p>
      </Section>

      <Section title="9. Changes to this policy">
        <p>
          If we make significant changes to how we handle your data, we will update this page and
          the date at the top. Continued use of the platform after changes constitutes acceptance.
        </p>
      </Section>

      <Section title="10. Contact">
        <p>
          Privacy questions or data requests:{' '}
          <a href="mailto:campusosapp@gmail.com" className="text-blue-400 hover:underline">campusosapp@gmail.com</a>
        </p>
      </Section>
    </>
  )
}
