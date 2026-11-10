import type { Metadata } from 'next';
import LoginForm from './login-form';

export const metadata: Metadata = { title: 'دخول فريق العيادة' };

export default function AdminLoginPage() {
  return <LoginForm />;
}
