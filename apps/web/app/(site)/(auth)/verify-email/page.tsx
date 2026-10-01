import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth-card';
import { VerifyEmail } from './verify-email';

export const metadata: Metadata = { title: 'Verify your email', robots: { index: false } };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).token;
  const token = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
  return (
    <AuthCard title="Verify your email">
      <VerifyEmail token={token} />
    </AuthCard>
  );
}
