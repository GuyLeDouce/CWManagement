'use client';
import { useEffect } from 'react';
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const detail = error.message?.slice(0, 600) || 'No additional details were provided.';
  useEffect(() => {
    console.error('Page could not render', {
      name: error.name,
      message: detail,
      digest: error.digest,
    });
  }, [error, detail]);
  return (
    <main className="standalone-message">
      <h1>We couldn’t load this page.</h1>
      <p>
        Please try again. If this continues, share the error details below with your administrator.
      </p>
      <button className="primary" onClick={retry}>
        Try again
      </button>
      <button className="text-button" onClick={() => window.location.reload()}>
        Reload page
      </button>
      <details>
        <summary>Error details</summary>
        <p>{detail}</p>
        {error.digest && <p>Reference: {error.digest}</p>}
      </details>
    </main>
  );
}
