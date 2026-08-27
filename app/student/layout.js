'use client';
import RequireRole from '@/components/common/RequireRole';
import AppShell from '@/components/common/AppShell';

const navItems = [
  { label: 'Dashboard', icon: 'dashboard', path: '/student' },
  { label: 'My Attendance', icon: 'clipboard', path: '/student/attendance' },
  { label: 'Download Report', icon: 'download', path: '/student/report' },
];

export default function StudentRootLayout({ children }) {
  return (
    <RequireRole roles={['student']}>
      <AppShell navItems={navItems}>{children}</AppShell>
    </RequireRole>
  );
}
