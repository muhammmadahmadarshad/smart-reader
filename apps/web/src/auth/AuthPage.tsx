import { useState } from 'react';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { BookOutlined } from '@ant-design/icons';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api, queryClient } from '../api';
import type { User } from './types';
type Mode = 'login' | 'signup' | 'forgot-password' | 'reset-password';
const headings = {
  login: 'Welcome back',
  signup: 'Make room for a good book',
  'forgot-password': 'Find your way back',
  'reset-password': 'A fresh start',
};
export default function AuthPage({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token'));
  const [success, setSuccess] = useState('');
  const mutation = useMutation({
    mutationFn: (values: { email?: string; password?: string }) =>
      api<User & { message?: string }>(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(mode === 'reset-password' ? { ...values, token } : values),
      }),
    onSuccess: (result) => {
      if (mode === 'login' || mode === 'signup') {
        queryClient.clear();
        queryClient.setQueryData(['me'], result);
        const from = location.state?.from;
        navigate(typeof from === 'string' && from.startsWith('/library') ? from : '/library', {
          replace: true,
        });
      } else setSuccess(result.message || 'Done.');
    },
  });
  const password = mode !== 'forgot-password';
  return (
    <main className="auth-layout">
      <aside className="auth-brand">
        <Link to="/login" className="wordmark">
          <BookOutlined /> Smart Reader
        </Link>
        <div>
          <p className="eyebrow">A LITTLE SPACE FOR YOUR BOOKS</p>
          <h1>
            Turn a page.
            <br />
            Take your time.
          </h1>
          <p>
            Your personal collection, a quiet place to read,
            <br className="desktop-only" /> and a bookmark for wherever life leaves you.
          </p>
        </div>
        <span className="brand-footer">Your books. Your pace.</span>
      </aside>
      <section className="auth-form-panel">
        <div className="auth-form">
          <Typography.Title level={2}>{headings[mode]}</Typography.Title>
          <Typography.Paragraph type="secondary">
            {mode === 'login'
              ? 'Your next chapter is right where you left it.'
              : mode === 'signup'
                ? 'Create your private reading space.'
                : mode === 'forgot-password'
                  ? 'Enter your email and we’ll send you a reset link.'
                  : 'Choose a new password for your account.'}
          </Typography.Paragraph>
          {success ? (
            <Alert
              showIcon
              type="success"
              message={success}
              action={mode === 'reset-password' ? <Link to="/login">Log in</Link> : undefined}
            />
          ) : (
            <>
              {mutation.error && (
                <Alert
                  className="form-alert"
                  showIcon
                  type="error"
                  message={mutation.error.message}
                />
              )}
              {mode === 'reset-password' && !token ? (
                <Alert
                  type="error"
                  message="This reset link is incomplete."
                  description={<Link to="/forgot-password">Request a new link</Link>}
                />
              ) : (
                <Form
                  layout="vertical"
                  requiredMark={false}
                  onFinish={(values) => mutation.mutate(values)}
                >
                  {mode !== 'reset-password' && (
                    <Form.Item
                      label="Email address"
                      name="email"
                      rules={[
                        { required: true, message: 'Enter your email address.' },
                        { type: 'email', message: 'Enter a valid email address.' },
                      ]}
                    >
                      <Input autoComplete="email" placeholder="you@example.com" maxLength={254} />
                    </Form.Item>
                  )}
                  {password && (
                    <Form.Item
                      label="Password"
                      name="password"
                      extra={
                        mode !== 'login'
                          ? 'Use 12–128 characters. A memorable passphrase works well.'
                          : undefined
                      }
                      rules={[
                        { required: true, message: 'Enter your password.' },
                        { min: 12, max: 128, message: 'Use between 12 and 128 characters.' },
                      ]}
                    >
                      <Input.Password
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        maxLength={128}
                      />
                    </Form.Item>
                  )}
                  {mode === 'login' && (
                    <div className="forgot-link">
                      <Link to="/forgot-password">Forgot password?</Link>
                    </div>
                  )}
                  <Button type="primary" htmlType="submit" block loading={mutation.isPending}>
                    {mode === 'login'
                      ? 'Log in'
                      : mode === 'signup'
                        ? 'Create account'
                        : mode === 'forgot-password'
                          ? 'Send reset link'
                          : 'Save new password'}
                  </Button>
                </Form>
              )}
            </>
          )}
          <div className="auth-switch">
            {mode === 'login' ? (
              <>
                New to Smart Reader? <Link to="/signup">Create an account</Link>
              </>
            ) : mode === 'signup' ? (
              <>
                Already have an account? <Link to="/login">Log in</Link>
              </>
            ) : (
              <Link to="/login">Back to login</Link>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
