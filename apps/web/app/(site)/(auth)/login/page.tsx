import type { Metadata } from 'next';
import NextLink from 'next/link';
import { AuthCard } from '@/components/auth-card';
import { safeNext } from '@/lib/navigation';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNext((await searchParams).next);
  return (
    <AuthCard
      title="Welcome back"
      intro="Your orders, saved details and baby’s sizes, all in one place."
      footer={
        <>
          New to Bambino?{' '}
          <NextLink
            href={`/register?next=${encodeURIComponent(next)}`}
            className="font-semibold text-link underline underline-offset-4 hover:decoration-2"
          >
            Create an account
          </NextLink>
        </>
      }
    >
      <LoginForm next={next} />
    </AuthCard>
  );
}
