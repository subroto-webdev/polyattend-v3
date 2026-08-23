'use client';
import RequireRole from '@/components/common/RequireRole';
import AppShell from '@/components/common/AppShell';

const navItems = [
  { label: 'Dashboard', icon: 'dashboard', path: '/semesterAdmin' },
  { section: 'Management' },
  { label: 'Create Teacher', icon: 'school', path: '/semesterAdmin/teachers' },
  { label: 'Student Validation', icon: 'users', path: '/semesterAdmin/students' },
  { label: 'Semester Promotion', icon: 'chevronRight', path: '/semesterAdmin/promotion' },
  { label: 'Users', icon: 'users', path: '/semesterAdmin/users' },
  { section: 'Analytics' },
  { label: 'Reports', icon: 'chart', path: '/semesterAdmin/reports' },
  { section: 'Tools' },
  { label: 'Search Mobile Number', icon: 'phone', path: '/semesterAdmin/search-mobile' },
];

export default function SemesterAdminRootLayout({ children }) {
  return (
    <RequireRole roles={['semesterAdmin']}>
      <AppShell navItems={navItems}>{children}</AppShell>
    </RequireRole>
  );
}
