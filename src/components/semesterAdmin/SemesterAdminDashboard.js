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
    const allowedSemesters = user.semesters && user.semesters.length ? user.semesters : (user.semester ? [user.semester] : []);
    // PERFORMANCE: previously fetched the full teacher and student lists
    // just to read `.count` off the response — downloading every one of
    // this Semester Admin's students on every dashboard load. `countOnly`
    // returns just the number, no documents.
    //
    // MULTI-SEMESTER ADMIN: Pending Validation is fetched once PER granted
    // Semester (the endpoint itself keeps each Semester's queue strictly
    // separate — see /api/semesterAdmin/students) and summed here just for
    // this one dashboard total.
    Promise.all([
      api.get('/users', { params: { role: 'teacher', countOnly: true } }),
      api.get('/users', { params: { role: 'student', countOnly: true } }),
      Promise.all(allowedSemesters.map(sem => api.get('/semesterAdmin/students', { params: { semester: sem } }))),
    ]).then(([t, st, preResults]) => {
      const pendingCount = preResults.reduce((sum, r) => sum + (r.data.entries || []).filter(e => !e.used).length, 0);
      setStats({
        teachers: t.data.count || 0,
        students: st.data.count || 0,
        pendingStudents: pendingCount,
      });
    }).finally(() => setLoading(false));
  }, [user]);

  if (loading) return <DashboardLoading />;

  const greeting = getGreeting(now);
  const grantedSemesters = user?.semesters && user.semesters.length ? user.semesters : (user?.semester ? [user.semester] : []);
  const badges = [
    user?.departmentId?.name || user?.departmentCode,
    SHIFT_LABEL[user?.shift] || user?.shift,
    ...grantedSemesters.map(sem => `Semester ${sem}`),
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
