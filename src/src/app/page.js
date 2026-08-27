'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else router.replace(`/${user.role}`);
  }, [user, loading, router]);

  return (
    <div className="auth-page" style={{ flexDirection: 'column', gap: 18 }}>
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />
      <div className="auth-orb auth-orb-3" />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div className="auth-logo-icon" style={{ margin: 0, width: 54, height: 54, animation: 'cinFloat 2.6s ease-in-out infinite' }}>
          <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="spinner" />
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, letterSpacing: 0.4 }}>Loading...</p>
      </div>
    </div>
  );
}
