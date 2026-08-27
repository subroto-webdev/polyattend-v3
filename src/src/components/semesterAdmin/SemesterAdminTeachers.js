'use client';
import React, { useState, useEffect } from 'react';
import api from '@/utils/api';
import Icon from '@/components/common/Icon';
import toast from 'react-hot-toast';
import PersonCard, { PersonCardGrid } from '@/components/common/PersonCard';
import Modal from '@/components/common/Modal';
import ConfirmDeleteModal from '@/components/common/ConfirmDeleteModal';

const GROUPS = ['A', 'B', 'C', 'D'];

export default function SemesterAdminTeachers() {
  const [teachers, setTeachers] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', subjectName: '', subjectCode: '', section: '' });

  // MULTI-SUBJECT: as the Semester Admin types an email, this looks it up
  // to tell them up-front whether it belongs to an existing Teacher
  // (switches the form to "assign another Subject" mode — no Name field,
  // no new registration code) or is genuinely new (normal invite flow).
  const [lookup, setLookup] = useState(null); // { found, isTeacher, teacher, subjects } | null
  const [lookingUp, setLookingUp] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/semesterAdmin/teachers')
      .then(r => { setTeachers(r.data.teachers || []); setPendingInvites(r.data.pendingInvites || []); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  // Debounced lookup — wait for the admin to pause typing before hitting
  // the API, and ignore stale results if the email changes again mid-flight.
  useEffect(() => {
    const email = form.email.trim();
    if (!email || !email.includes('@')) { setLookup(null); return; }
    let cancelled = false;
    setLookingUp(true);
    const t = setTimeout(() => {
      api.get('/semesterAdmin/teachers/lookup', { params: { email } })
        .then(r => { if (!cancelled) setLookup(r.data); })
        .catch(() => { if (!cancelled) setLookup(null); })
        .finally(() => { if (!cancelled) setLookingUp(false); });
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form.email]);

  const set = f => e => setForm(p => ({ ...p, [f]: e.target.value }));

  const openCreate = () => {
    setForm({ name: '', email: '', subjectName: '', subjectCode: '', section: '' });
    setLookup(null);
    setShowModal(true);
  };

  const isExistingTeacher = lookup?.found && lookup?.isTeacher;
  const isBlockedNonTeacher = lookup?.found && !lookup?.isTeacher;

  const handleSubmit = async () => {
    if (!form.email || !form.subjectName || !form.subjectCode || !form.section) {
      return toast.error('Enter Email, Subject, Subject Code and Group');
    }
    if (!isExistingTeacher && !form.name) {
      return toast.error('Enter Name for the new Teacher');
    }
    if (isBlockedNonTeacher) {
      return toast.error('This email is not a Teacher account');
    }
    setSaving(true);
    try {
      const res = await api.post('/semesterAdmin/teachers', form);
      toast.success(res.data.assignedExisting
        ? `New Subject assigned to ${lookup.teacher.name}`
        : 'Teacher invite sent — ask them to check their email');
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (person) => {
    try {
      await api.put(`/users/${person._id}`, { isActive: !person.isActive });
      toast.success(person.isActive ? 'Deactivated' : 'Activated');
      load();
    } catch { toast.error('Error'); }
  };

  // Pending invite hasn't become a real account yet — a lightweight confirm
  // is enough (no typed-name step, unlike deleting an active Teacher).
  const cancelInvite = async (invite) => {
    if (!window.confirm(`Cancel invite for ${invite.name}? This email's code will stop working.`)) return;
    setCancellingId(invite._id);
    try {
      await api.delete(`/semesterAdmin/teachers/${invite._id}`);
      toast.success('Invite cancelled');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error');
    } finally {
      setCancellingId(null);
    }
  };

  const filtered = teachers.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 className="page-title">Teacher</h2>
          <p className="page-sub">Hire a new Teacher, or assign a new Subject to an existing Teacher</p>
        </div>
        <button className="btn-primary" style={{ width: 'auto', padding: '9px 18px' }} onClick={openCreate}>
          <Icon name="plus" size={16} /> Assign Subject
        </button>
      </div>

      <div style={{ marginBottom: 16, position: 'relative', maxWidth: 320 }}>
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt3)' }}>
          <Icon name="search" size={14} />
        </span>
        <input
          className="form-input" style={{ paddingLeft: 34, fontSize: 13 }}
          placeholder="Search by name or Email" value={search} onChange={e => setSearch(e.target.value)}
        />
      </div>

      {pendingInvites.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div className="section-title" style={{ marginBottom: 8 }}>Pending Invite ({pendingInvites.length})</div>
          <PersonCardGrid>
            {pendingInvites.map(inv => (
              <div key={inv._id} style={{
                background: 'var(--bg)', border: '1px dashed var(--border2)',
                borderRadius: 'var(--radius-lg)', padding: '12px 14px',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{inv.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>{inv.email}</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  <span className="tag tag-amber" style={{ fontSize: 10 }}>Registration Pending</span>
                  <span style={{ fontSize: 10.5, color: 'var(--txt2)', background: 'var(--bg3)', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>
                    {inv.subjectName} ({inv.subjectCode})
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--txt2)', background: 'var(--bg3)', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>
                    Group {inv.section}
                  </span>
                </div>
                <button
                  onClick={() => cancelInvite(inv)}
                  disabled={cancellingId === inv._id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '7px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    border: '1px solid var(--border2)', background: 'transparent', color: 'var(--txt2)',
                    cursor: cancellingId === inv._id ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                    marginTop: 4, opacity: cancellingId === inv._id ? 0.6 : 1,
                  }}
                  onMouseEnter={e => { if (cancellingId !== inv._id) { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444'; } }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--txt2)'; }}
                >
                  <Icon name="x" size={13} /> {cancellingId === inv._id ? 'Cancelling...' : 'Cancel Invite'}
                </button>
              </div>
            ))}
          </PersonCardGrid>
        </div>
      )}

      <div className="section-title" style={{ marginBottom: 8 }}>Active Teachers ({filtered.length})</div>
      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon"><Icon name="school" size={24} /></div>
            <p>No Teachers yet</p>
          </div>
        </div>
      ) : (
        <PersonCardGrid>
          {filtered.map(t => (
            <PersonCard
              key={t._id}
              person={t}
              actions={[
                { label: t.isActive ? 'Deactivate' : 'Activate', variant: t.isActive ? 'danger' : undefined, onClick: () => toggleActive(t) },
                { label: 'Delete', variant: 'danger', onClick: () => setDeleteTarget(t) },
              ]}
            />
          ))}
        </PersonCardGrid>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)}>
            <div className="modal-title">Assign Subject to Teacher</div>

            <div className="form-group">
              <label className="form-label">Email *</label>
              <input className="form-input" type="email" placeholder="email@example.com" value={form.email} onChange={set('email')} />
              {lookingUp && <span style={{ fontSize: 11.5, color: 'var(--txt3)', marginTop: 4, display: 'block' }}>Searching...</span>}
              {!lookingUp && isExistingTeacher && (
                <div style={{ fontSize: 12, color: 'var(--primary)', background: 'var(--primary-light)', padding: '8px 10px', borderRadius: 8, marginTop: 6 }}>
                  ✅ <strong>{lookup.teacher.name}</strong> is already a Teacher — a new Subject will be assigned to them, no new email/code will be sent.
                  {lookup.subjects?.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--txt2)' }}>
                      Current Subjects: {lookup.subjects.map(s => `${s.name} (Sem ${s.semester}, Group ${s.section})`).join(', ')}
                    </div>
                  )}
                </div>
              )}
              {!lookingUp && isBlockedNonTeacher && (
                <div style={{ fontSize: 12, color: 'var(--danger)', background: 'var(--danger-light)', padding: '8px 10px', borderRadius: 8, marginTop: 6 }}>
                  ⚠️ This email is a {lookup.role} account — not a Teacher, so it can't be used here.
                </div>
              )}
            </div>

            {!isExistingTeacher && (
              <div className="form-group">
                <label className="form-label">Teacher Name *</label>
                <input className="form-input" placeholder="Full Name" value={form.name} onChange={set('name')} />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Subject Name *</label>
              <input className="form-input" placeholder="e.g. Data Structure" value={form.subjectName} onChange={set('subjectName')} />
            </div>
            <div className="form-group">
              <label className="form-label">Subject Code *</label>
              <input className="form-input" placeholder="e.g. CST-301" value={form.subjectCode} onChange={set('subjectCode')} />
            </div>
            <div className="form-group">
              <label className="form-label">Group *</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {GROUPS.map(g => {
                  const selected = form.section === g;
                  return (
                    <button
                      key={g} type="button"
                      onClick={() => setForm(p => ({ ...p, section: g }))}
                      style={{
                        padding: '10px 0', borderRadius: 10, textAlign: 'center',
                        border: selected ? '2px solid var(--primary)' : '2px solid var(--border2)',
                        background: selected ? 'var(--primary-light)' : 'var(--bg)',
                        color: selected ? 'var(--primary)' : 'var(--txt)',
                        cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700,
                      }}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 4, marginBottom: 4 }}>
              {isExistingTeacher
                ? 'Only one Teacher can be assigned to a Subject.'
                : 'Only one Teacher can be assigned to a Subject. Submitting will send a Registration Code to this email (valid for 1 month).'}
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSubmit} disabled={saving || isBlockedNonTeacher}>
                {saving
                  ? <><div className="spinner spinner-sm" /> {isExistingTeacher ? 'Adding...' : 'Sending...'}</>
                  : isExistingTeacher ? 'Assign Subject' : 'Send Invite'}
              </button>
            </div>
      </Modal>

      <ConfirmDeleteModal
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async (confirmName) => {
          await api.delete(`/users/${deleteTarget._id}`, { data: { confirmName } });
          toast.success(`${deleteTarget.name} has been deleted`);
          load();
        }}
      />
    </div>
  );
}
