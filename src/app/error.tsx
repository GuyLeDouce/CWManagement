'use client';
export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="standalone-message">
      <h1>We couldn’t load this page.</h1>
      <p>Please try again. If this continues, contact your administrator.</p>
      <button className="primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
