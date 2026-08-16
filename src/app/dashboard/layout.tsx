import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import Nav from './Nav';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthenticated())) redirect('/login?next=/dashboard');

  return (
    <div className="dash">
      <Nav />
      <main className="dash-main">{children}</main>
    </div>
  );
}
