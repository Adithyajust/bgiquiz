"use client";

import dynamic from "next/dynamic";

// The live quiz fetches its state after mounting. Keep the server and initial
// browser output identical, then mount the interactive UI entirely in the
// browser so an event-name attribute cannot conflict with prerendered markup.
const QuizClient = dynamic(() => import("./quiz-client"), {
  ssr: false,
  loading: () => (
    <main className="main-content" aria-busy="true" aria-label="Memuat aplikasi kuis">
      <div className="loading-state" role="status">
        <h2>Memuat aplikasi kuis</h2>
        <p>Menyiapkan tampilan dan koneksi kuis…</p>
      </div>
    </main>
  ),
});

export default function QuizApp(props: { page?: string; teamId?: string }) {
  return <QuizClient {...props} />;
}
