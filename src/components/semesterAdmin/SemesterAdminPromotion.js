'use client';
import React, { useState, useEffect } from 'react';
import api from '@/utils/api';
import Icon from '@/components/common/Icon';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import Modal from '@/components/common/Modal';

// Every 6 months, students move up one semester. This page lists every
// registered Student in this Semester Admin's own scope; the admin
// selects who's continuing (checkbox) and promotes them all at once —
// their `semester` field moves +1, which automatically moves them out of
// this Semester Admin's list and into the next semester's. Anyone left
// unchecked simply stays at the current semester — that's how a drop-out
// is represented, no separate action needed.
//
// MULTI-SEMESTER ADMIN: promotion is done ONE Semester at a time — if
// this admin has more than one granted Semester, a tab selector picks
// which one is "the current semester" being promoted from.
export default function SemesterAdminPromotion() {
  const { user } = useAuth();
  const allowedSemesters = user?.semesters && user.semesters.length ? user.semesters : (user?.semester ? [user.semester] : []);
  const [fromSemester, setFromSemester] = useState(null);
  useEffect(() => {
    if (allowedSemesters.length && fromSemester == null) setFromSemester(allowedSemesters[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [promoting, setPromoting] = useState(false);

  const load = () => {
    if (fromSemester == null) return;
    setLoading(true);
    api.get('/users', { params: { role: 'student', semester: fromSemester } })
      .then(r => setStudents(r.data.users || []))
      .finally(() => setLoading(false));
  };
  useEffect(() => { setSelected(new Set()); load(); }, [fromSemester]);

  const filtered = students.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.studentId || '').toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(s => s._id)));
    }
  };

  const currentSemester = fromSemester;
  const nextSemester = currentSemester ? currentSemester + 1 : null;
  const atFinalSemester = currentSemester >= 8;

  const handlePromote = async () => {
    setPromoting(true);
    try {
      const res = await api.post('/semesterAdmin/promote', { studentIds: Array.from(selected), fromSemester: currentSemester });
      toast.success(res.data.message);
      setSelected(new Set());
      setShowConfirm(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error');
    } finally {
      setPromoting(false);
    }
  };

  const notSelectedCount = filtered.length - selected.size;

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Semester Promotion</h2>
          <p className="page-sub">
            {atFinalSemester
              ? 'You are at Semester 8 — this is the final semester, promotion does not apply'
              : `Promote Students from Semester ${currentSemester} to Semester ${nextSemester}`}
          </p>
        </div>
      </div>

      {/* MULTI-SEMESTER ADMIN: only shown once this admin has more than
          one granted Semester — switching tabs reloads the roster and
          resets any current selection, since promotion always happens
          for exactly one Semester at a time. */}
      {allowedSemesters.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {allowedSemesters.map(sem => (
            <button
              key={sem}
              onClick={() => setFromSemester(sem)}
              style={{
                padding: '7px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                background: fromSemester === sem ? 'var(--primary)' : 'var(--bg3)',
                color: fromSemester === sem ? '#fff' : 'var(--txt2)',
                transition: 'all .18s ease',
              }}
            >
              Semester {sem}
            </button>
          ))}
        </div>
      )}

      {!atFinalSemester && (
        <>
          <div style={{
            fontSize: 12.5, color: 'var(--txt2)', background: 'var(--bg3)',
            padding: '10px 14px', borderRadius: 10, marginBottom: 16,
          }}>
            💡 Whoever gets a ✓ will move to Semester {nextSemester}. Anyone not selected will stay at Semester {currentSemester} (to account for drop-outs).
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <div style={{ position: 'relative', maxWidth: 280, flex: 1, minWidth: 200 }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt3)' }}>
                <Icon name="search" size={14} />
              </span>
              <input
                className="form-input" style={{ paddingLeft: 34, fontSize: 13 }}
                placeholder="Search by name or Roll" value={search} onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn-secondary" style={{ width: 'auto', padding: '8px 14px', fontSize: 12.5 }} onClick={toggleAll}>
                {selected.size === filtered.length && filtered.length > 0 ? 'Deselect All' : 'Select All'}
              </button>
              <button
                className="btn-primary" style={{ width: 'auto', padding: '8px 16px', fontSize: 12.5 }}
                disabled={selected.size === 0}
                onClick={() => setShowConfirm(true)}
              >
                <Icon name="chevronRight" size={14} /> Promote {selected.size} Students
              </button>
            </div>
          </div>
        </>
      )}

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon"><Icon name="users" size={24} /></div>
            <p>No Students yet</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(s => {
            const isSelected = selected.has(s._id);
            return (
              <div
                key={s._id}
                onClick={() => !atFinalSemester && toggle(s._id)}
                style={{
                  background: isSelected ? 'var(--primary-light)' : 'var(--bg)',
                  border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-lg)', padding: '12px 14px',
                  display: 'flex', alignItems: 'center', gap: 12,
                  cursor: atFinalSemester ? 'default' : 'pointer', transition: 'all 0.15s',
                }}
              >
                {!atFinalSemester && (
                  <div style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                    border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border2)'}`,
                    background: isSelected ? 'var(--primary)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isSelected && <Icon name="check" size={13} style={{ color: '#fff' }} />}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{s.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>
                    Roll: {s.studentId} • Group {s.section}{s.mobile ? ` • 📱 ${s.mobile}` : ''}
                  </div>
                </div>
                <span className="tag tag-blue" style={{ fontSize: 10, flexShrink: 0 }}>Sem {s.semester}</span>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showConfirm} onClose={() => setShowConfirm(false)}>
        <div className="modal-title">Confirm Promotion</div>
        <p style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 8 }}>
          <strong>{selected.size} Students</strong> will be promoted from Semester {currentSemester} to <strong>Semester {nextSemester}</strong>.
        </p>
        {notSelectedCount > 0 && (
          <p style={{ fontSize: 12.5, color: 'var(--txt3)', marginBottom: 8 }}>
            The remaining {notSelectedCount} students will stay at Semester {currentSemester}.
          </p>
        )}
        <div className="modal-footer">
          <button className="btn-secondary" onClick={() => setShowConfirm(false)}>Cancel</button>
          <button className="btn-primary" onClick={handlePromote} disabled={promoting}>
            {promoting ? <><div className="spinner spinner-sm" /> Promoting...</> : 'Confirm and Promote'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
