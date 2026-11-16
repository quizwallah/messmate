import FeedbackForms from "../components/feedback-forms";

export default function FeedbackPage() {
  return <main className="page-main">
    <section className="page-heading"><p className="eyebrow">YOUR VOICE MATTERS</p><h1>Feedback & concerns</h1><p>Everyday food feedback goes to the convenor. Serious complaints go straight to the committee.</p></section>
    <div className="feedback-page-layout"><FeedbackForms /></div>
  </main>;
}
