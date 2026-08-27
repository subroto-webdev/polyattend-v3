'use client';
import React, { useState, useEffect, useRef } from 'react';
import api from '@/utils/api';
import Icon from '@/components/common/Icon';
import toast from 'react-hot-toast';
import Modal from '@/components/common/Modal';
import ConfirmDeleteModal from '@/components/common/ConfirmDeleteModal';

export default function SemesterAdminStudents() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | pending | used
  const [form, setForm] = useState({ roll: '', email: '' });
  const [uploadResult, setUploadResult] = useState(null);
  const fileInputRef = useRef(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // a `used` entry, needs typed-name confirm

  const load = () => {
    setLoading(true);
    api.get('/semesterAdmin/students').then(r => setEntries(r.data.entries || [])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const set = f => e => setForm(p => ({ ...p, [f]: e.target.value }));

  const openCreate = () => { setForm({ roll: '', email: '' }); setShowModal(true); };

  const handleSubmit = async () => {
    if (!form.roll || !form.email) return toast.error('Enter Roll and Email');
    setSaving(true);
    try {
      await api.post('/semesterAdmin/students', form);
      toast.success('Student pre-approved — code sent to their email');
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error');
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      // IMPORTANT: don't set Content-Type manually here — axios/the browser
      // needs to generate the multipart boundary itself.
      const res = await api.post('/semesterAdmin/students', formData);
      setUploadResult(res.data);
      toast.success(res.data.message);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filtered = entries.filter(en => {
    if (statusFilter === 'pending' && en.used) return false;
    if (statusFilter === 'used' && !en.used) return false;
    if (search && !en.roll.toLowerCase().includes(search.toLowerCase()) && !en.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const pendingCount = entries.filter(en => !en.used).length;
  const usedCount = entries.filter(en => en.used).length;

  // Not yet registered — nothing real to lose beyond the pre-approval
  // entry itself, so a lightweight confirm is enough (no typed-name step).
  const handleDeletePending = async (entry) => {
    if (!window.confirm(`Delete pre-approval entry for Roll ${entry.roll}?`)) return;
    try {
      await api.delete(`/semesterAdmin/students/${entry._id}`);
      toast.success('Deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error');
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div className="skeleton" style={{ width: 180, height: 22, marginBottom: 8 }} />
            <div className="skeleton" style={{ width: 320, height: 13 }} />
          </div>
        </div>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 56, borderRadius: 12, marginBottom: 8 }} />
        ))}
        <style jsx>{`
          .skeleton {
            background: linear-gradient(90deg, var(--bg3) 25%, var(--border) 50%, var(--bg3) 75%);
            background-size: 200% 100%;
            animation: shimmer 1.4s ease-in-out infinite;
          }
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="page fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 className="page-title">Student Validation</h2>
          <p className="page-sub">Pre-approve Roll + Email in advance — registration is allowed only once with the same Roll/Email</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary btn-anim" style={{ width: 'auto', padding: '9px 18px' }} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <><div className="spinner spinner-sm" /> Uploading...</> : <><Icon name="excel" size={16} /> Excel Upload</>}
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFileUpload} />
          <button className="btn-primary btn-anim" style={{ width: 'auto', padding: '9px 18px' }} onClick={openCreate}>
            <Icon name="plus" size={16} /> Add One
          </button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 16, background: 'var(--bg3)', padding: '10px 14px', borderRadius: 10 }}>
        📄 The Excel/CSV file must have only <strong>Roll</strong> and <strong>Email</strong> — these two columns (as headers in the first row). Each Student's email will get a separate 12-digit code.
      </div>

      {uploading && (
        <div className="progress-track" style={{ marginBottom: 16 }}>
          <div className="progress-fill" />
        </div>
      )}

      {uploadResult && (
        <div className="card slide-in" style={{ marginBottom: 16, background: 'var(--primary-light)', border: '1px solid var(--primary)' }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--primary)', marginBottom: 6 }}>
            ✅ {uploadResult.added?.length || 0} added
            {uploadResult.skipped?.length > 0 && `, ${uploadResult.skipped.length} rows skipped`}
          </div>
          {uploadResult.skipped?.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--txt2)' }}>
              {uploadResult.skipped.slice(0, 10).map((s, i) => (
                <div key={i} style={{ animation: `fadeInUp .3s ease ${i * 0.03}s both` }}>Row {s.row}: {s.roll || '-'} / {s.email || '-'} — {s.reason}</div>
              ))}
              {uploadResult.skipped.length > 10 && <div>... {uploadResult.skipped.length - 10} more</div>}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, background: 'var(--bg3)', padding: 4, borderRadius: 24 }}>
          {[
            { key: 'all', label: `All (${entries.length})` },
            { key: 'pending', label: `Registration Pending (${pendingCount})` },
            { key: 'used', label: `Completed (${usedCount})` },
          ].map(f => (
            <button
              key={f.key} onClick={() => setStatusFilter(f.key)}
              className="filter-btn"
              style={{
                padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                background: statusFilter === f.key ? 'var(--primary)' : 'transparent',
                color: statusFilter === f.key ? '#fff' : 'var(--txt2)',
                boxShadow: statusFilter === f.key ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                transition: 'all .25s ease',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt3)' }}>
            <Icon name="search" size={14} />
          </span>
          <input
            className="form-input search-anim" style={{ paddingLeft: 34, fontSize: 13, width: 200 }}
            placeholder="Search by Roll or Email" value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card fade-in">
          <div className="empty">
            <div className="empty-icon"><Icon name="clipboard" size={24} /></div>
            <p>No data yet</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((en, i) => (
            <div
              key={en._id}
              className="student-row"
              style={{
                background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
                padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                animation: `fadeInUp .35s ease ${Math.min(i * 0.03, 0.5)}s both`,
              }}
            >
              <span className={en.used ? 'dot-used' : 'dot-pending'} style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                  {en.used && en.usedByUserId?.name ? en.usedByUserId.name : `Roll: ${en.roll}`}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>
                  {en.used && en.usedByUserId?.name ? `Roll: ${en.roll} • ` : ''}{en.email}
                </div>
              </div>
              <span className={`tag ${en.used ? 'tag-green' : 'tag-amber'}`}>
                {en.used ? 'Registration Complete' : 'Pending'}
              </span>
              <button
                onClick={() => en.used ? setDeleteTarget(en) : handleDeletePending(en)}
                title="Delete"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  border: '1px solid var(--danger-light)', borderRadius: 8, cursor: 'pointer',
                  padding: '5px 10px', fontSize: 11, fontWeight: 700,
                  fontFamily: 'inherit', background: 'transparent', color: 'var(--danger)',
                }}
              >
                <Icon name="trash" size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)}>
        <div className="modal-title">Add One Student</div>

        <div className="form-group">
          <label className="form-label">Roll *</label>
          <input className="form-input" placeholder="e.g. 800768" value={form.roll} onChange={set('roll')} />
        </div>
        <div className="form-group">
          <label className="form-label">Email *</label>
          <input className="form-input" type="email" placeholder="email@example.com" value={form.email} onChange={set('email')} />
        </div>

        <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 4, marginBottom: 4 }}>
          Submitting will send a 12-digit Registration Code to this email (valid for 1 month).
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <><div className="spinner spinner-sm" /> Sending...</> : 'Add'}
          </button>
        </div>
      </Modal>

      <ConfirmDeleteModal
        target={deleteTarget ? { name: deleteTarget.usedByUserId?.name || deleteTarget.roll } : null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async (confirmName) => {
          await api.delete(`/semesterAdmin/students/${deleteTarget._id}`, { data: { confirmName } });
          toast.success('Deleted');
          load();
        }}
      />

      <style jsx>{`
        .fade-in { animation: fadeIn .3s ease both; }
        .slide-in { animation: fadeInUp .35s ease both; }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .btn-anim { transition: transform .15s ease, box-shadow .15s ease; }
        .btn-anim:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.12); }
        .btn-anim:active:not(:disabled) { transform: translateY(0); }

        .student-row { transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
        .student-row:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(0,0,0,0.06); border-color: var(--primary); }

        .dot-used { background: var(--primary-mid); }
        .dot-pending {
          background: var(--warning, #f59e0b);
          box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.5);
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.5); }
          70% { box-shadow: 0 0 0 6px rgba(245, 158, 11, 0); }
          100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
        }

        .search-anim { transition: box-shadow .2s ease, border-color .2s ease; }
        .search-anim:focus { box-shadow: 0 0 0 3px var(--primary-light); border-color: var(--primary); }

        .filter-btn:hover { opacity: 0.85; }

        .progress-track {
          height: 4px; border-radius: 4px; background: var(--bg3); overflow: hidden;
        }
        .progress-fill {
          height: 100%; width: 40%; border-radius: 4px; background: var(--primary);
          animation: indeterminate 1.2s ease-in-out infinite;
        }
        @keyframes indeterminate {
          0% { margin-left: -40%; }
          100% { margin-left: 100%; }
        }
      `}</style>
    </div>
  );
}