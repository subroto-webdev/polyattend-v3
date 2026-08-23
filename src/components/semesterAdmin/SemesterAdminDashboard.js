'use client';
import React, { useState, useEffect } from 'react';
import api from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import {
  DashboardPage, DashboardLoading, DashboardHero, DashboardClock,
  StatGrid, StatCard, getGreeting,
} from '@/components/common/DashboardKit';

/* ------------------------------------------------------------------ */
/*  All data-fetching / business logic below is unchanged from the     */
/*  original component — only markup + styling has been redesigned    */
/*  to match Teacher Dashboard's dark theme via the shared DashboardKit.*/
/* ------------------------------------------------------------------ */

const SHIFT_LABEL = { '1st': 'Morning Shift', '2nd': 'Day Shift' };

export default function SemesterAdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ teachers: 0, students: 0, pendingStudents: 0 });
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get('/users', { params: { role: 'teacher' } }),
      api.get('/users', { params: { role: 'student' } }),
      api.get('/semesterAdmin/students'),
    ]).then(([t, st, pre]) => {
      const entries = pre.data.entries || [];
      setStats({
        teachers: t.data.count || 0,
        students: st.data.count || 0,
        pendingStudents: entries.filter(e => !e.used).length,
      });
    }).finally(() => setLoading(false));
  }, [user]);

  if (loading) return <DashboardLoading />;

  const greeting = getGreeting(now);
  const badges = [
    user?.departmentId?.name || user?.departmentCode,
    SHIFT_LABEL[user?.shift] || user?.shift,
    user?.semester ? `Semester ${user.semester}` : null,
  ].filter(Boolean);

  return (
    <DashboardPage>
      <DashboardHero
        greeting={greeting}
        name={user?.name}
        subtitle="Semester Admin"
        subtitleColor="text-indigo-300"
        badges={badges}
        rightSlot={<DashboardClock now={now} />}
      />

      <StatGrid>
        <StatCard index={0} icon="school" label="Teacher" value={stats.teachers} accent="emerald" />
        <StatCard index={1} icon="users" label="Student" value={stats.students} accent="amber" />
        <StatCard index={2} icon="clipboard" label="Pending Validation" value={stats.pendingStudents} accent="blue" />
      </StatGrid>
    </DashboardPage>
  );
}
