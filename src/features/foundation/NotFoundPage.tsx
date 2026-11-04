import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="welcome-card" aria-labelledby="not-found-title">
      <p className="eyebrow">404</p>
      <h1 id="not-found-title">This page is not available.</h1>
      <p className="welcome-copy">Return to the application home to continue.</p>
      <Link className="text-link" to="/">
        Go home
      </Link>
    </section>
  );
}
