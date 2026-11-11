import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui.tsx';

export function NotFound() {
  return (
    <div className="mx-auto max-w-lg p-6">
      <EmptyState title="This page does not exist" action={<Link to="/" className="link">Go to NourishCart home</Link>}>
        The link may be old, or the page moved.
      </EmptyState>
    </div>
  );
}
