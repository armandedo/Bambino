import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth-card';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = { title: 'Reset your password', robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      intro="Enter your email and we’ll send you a link to choose a new password."
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
