import type { Metadata } from 'next';
import NextLink from 'next/link';
import { AuthCard } from '@/components/auth-card';
import { safeNext } from '@/lib/navigation';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Create an account', robots: { index: false } };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNext((await searchParams).next, '/size-finder');
  return (
    <AuthCard
      title="Create your account"
      intro="Then tell us about your baby and we’ll recommend a size."
      footer={
        <>
          Already have an account?{' '}
          <NextLink
            href={`/login?next=${encodeURIComponent(next)}`}
            className="font-semibold text-link underline underline-offset-4 hover:decoration-2"
          >
            Sign in
          </NextLink>
        </>
      }
    >
      <RegisterForm next={next} />
    </AuthCard>
  );
}
