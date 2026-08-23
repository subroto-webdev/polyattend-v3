'use client';
import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import api from '@/utils/api';
import Icon from '@/components/common/Icon';
import { isStrongPassword } from '@/lib/validatePassword';

function ResetPasswordPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Retrieve email if passed in query from ForgotPasswordPage
  const initialEmail = searchParams.get('email') || '';

  const [form, setForm] = useState({
    email: initialEmail,
    otp: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const passwordsMatch = form.newPassword && form.confirmPassword && form.newPassword === form.confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { email, otp, newPassword, confirmPassword } = form;

    if (!email || !otp || !newPassword || !confirmPassword) {
      return toast.error('Please fill in all fields');
    }
    const pwCheck = isStrongPassword(newPassword);
    if (!pwCheck.ok) {
      return toast.error(pwCheck.message);
    }
    if (newPassword !== confirmPassword) {
      return toast.error('Passwords do not match');
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/reset-password', {
        email,
        otp,
        newPassword
      });
      toast.success(res.data?.message || 'Password changed successfully! 🎉');
      router.push('/login');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Password change failed. Please check the OTP.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <style>{`
        @keyframes rstFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .rst-anim { animation: rstFadeUp .5s cubic-bezier(.16,1,.3,1) both; }
        .rst-field { animation: rstFadeUp .45s cubic-bezier(.16,1,.3,1) both; }
        .rst-submit { position: relative; overflow: hidden; }
        .rst-submit:not(:disabled):hover { transform: translateY(-2px); box-shadow: 0 12px 28px -8px rgba(22,163,74,0.5); }
        .rst-submit:not(:disabled):active { transform: translateY(0) scale(0.98); }
        .rst-eye-btn { transition: color .2s ease, transform .2s ease; }
        .rst-eye-btn:hover { color: #34d399 !important; }
        .rst-back-link { position: relative; text-decoration: none; }
        .rst-back-link::after {
          content: ''; position: absolute; left: 18px; bottom: -2px; width: 0; height: 1px;
          background: #34d399; transition: width .25s ease;
        }
        .rst-back-link:hover::after { width: calc(100% - 18px); }
        .rst-icon-pulse { animation: authGlowPulse 3s ease-in-out infinite; }
      `}</style>

      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />
      <div className="auth-orb auth-orb-3" />

      <div className="auth-card rst-anim" style={{ maxWidth: 420 }}>
        {/* Header */}
        <div className="auth-logo">
          <div className="auth-logo-icon rst-icon-pulse">
            <Icon name="refresh" size={28} />
          </div>
          <h1 className="auth-title">Reset Password</h1>
          <p className="auth-sub" style={{ lineHeight: 1.6 }}>
            Submit with the OTP code sent to your email and your new password.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div className="form-group rst-field" style={{ animationDelay: '0ms' }}>
            <label className="form-label">Email Address</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', display: 'flex', pointerEvents: 'none' }}>
                <Icon name="mail" size={16} />
              </span>
              <input
                type="email"
                required
                placeholder="your@email.edu"
                className="form-input"
                style={{ paddingLeft: 40 }}
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                autoComplete="email"
              />
            </div>
          </div>

          {/* OTP */}
          <div className="form-group rst-field" style={{ animationDelay: '60ms' }}>
            <label className="form-label">6-Digit OTP Code</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', display: 'flex', pointerEvents: 'none' }}>
                <Icon name="check" size={16} />
              </span>
              <input
                type="text"
                required
                maxLength={6}
                placeholder="• • • • • •"
                className="form-input"
                style={{ paddingLeft: 40, letterSpacing: 6, fontWeight: 600 }}
                value={form.otp}
                onChange={e => setForm(p => ({ ...p, otp: e.target.value.replace(/\D/g, '') }))}
              />
            </div>
          </div>

          {/* New Password */}
          <div className="form-group rst-field" style={{ animationDelay: '120ms' }}>
            <label className="form-label">New Password</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', display: 'flex', pointerEvents: 'none' }}>
                <Icon name="lock" size={16} />
              </span>
              <input
                type={showPass ? 'text' : 'password'}
                required
                placeholder="••••••••"
                className="form-input"
                style={{ paddingLeft: 40, paddingRight: 42 }}
                value={form.newPassword}
                onChange={e => setForm(p => ({ ...p, newPassword: e.target.value }))}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPass(p => !p)}
                className="rst-eye-btn"
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}
              >
                <Icon name="eye" size={16} />
              </button>
            </div>
            <div style={{ fontSize: 11, marginTop: 5, color: 'rgba(255,255,255,0.4)' }}>
              At least 8 characters, with uppercase, lowercase and a number
            </div>
          </div>

          {/* Confirm Password */}
          <div className="form-group rst-field" style={{ animationDelay: '180ms' }}>
            <label className="form-label">Confirm New Password</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', display: 'flex', pointerEvents: 'none' }}>
                <Icon name="lock" size={16} />
              </span>
              <input
                type={showConfirmPass ? 'text' : 'password'}
                required
                placeholder="••••••••"
                className="form-input"
                style={{ paddingLeft: 40, paddingRight: 42 }}
                value={form.confirmPassword}
                onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPass(p => !p)}
                className="rst-eye-btn"
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}
              >
                <Icon name="eye" size={16} />
              </button>
            </div>
            {form.confirmPassword && (
              <div style={{ fontSize: 11, marginTop: 5, fontWeight: 600, color: passwordsMatch ? '#4ade80' : '#f87171' }}>
                {passwordsMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
              </div>
            )}
          </div>

          <button type="submit" disabled={loading} className="btn-primary rst-submit" style={{ marginTop: 8 }}>
            {loading ? <><div className="spinner spinner-sm" /> Resetting...</> : 'Reset Password'}
          </button>
        </form>

        <div style={{ marginTop: 22, textAlign: 'center' }}>
          <Link href="/login" className="rst-back-link" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.55)',
          }}>
            <Icon name="chevronLeft" size={14} /> Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>}>
      <ResetPasswordPageInner />
    </React.Suspense>
  );
}
