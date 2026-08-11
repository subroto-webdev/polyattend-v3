'use client';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom'; // ← ১. এটা যোগ করো
import api from '@/utils/api';
import Icon from '@/components/common/Icon';
import toast from 'react-hot-toast';

const TYPES = { friday: 'শুক্রবার', eid: 'ঈদ', puja: 'পূজা', national: 'জাতীয় ছুটি', semester_break: 'সেমিস্টার বিরতি', other: 'অন্যান্য' };

export default function AdminHolidays() {
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: '', startDate: '', endDate: '', type: 'other', description: '' });

  const fetch = async () => {
    setLoading(true);
    try { const res = await api.get('/holidays'); setHolidays(res.data.holidays); }
    catch { toast.error('Load failed'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/holidays', form);
      toast.success('Holiday added!');
      setShowModal(false);
      setForm({ title: '', startDate: '', endDate: '', type: 'other', description: '' });
      fetch();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this holiday?')) return;
    try { await api.delete(`/holidays/${id}`); toast.success('Deleted'); fetch(); }
    catch { toast.error('Failed'); }
  };

  const typeColors = { friday: 'tag-blue', eid: 'tag-green', puja: 'tag-amber', national: 'tag-red', semester_break: 'tag-gray', other: 'tag-gray' };

  return (
    <div>
      <div className="action-bar">
        <Icon name="calendar" size={18} style={{ color: 'var(--txt2)' }} />
        <span className="action-bar-title">Holiday Management</span>
        <button className="btn-secondary btn-sm" onClick={() => setShowModal(true)}>
          <Icon name="plus" size={14} /> Add Holiday
        </button>
      </div>
      <div className="page" style={{ paddingTop: 8 }}>
        <div className="info-banner mb-3">
          <Icon name="info" size={16} />
          <span className="info-text">Holiday-র দিনে attendance session শুরু করা যাবে না। Percentage calculation-এ বাদ পড়বে।</span>
        </div>
        {loading ? <div className="loading"><div className="spinner" /></div> : (
          <div className="card">
            {holidays.length === 0 ? <div className="empty"><Icon name="calendar" size={32} /><p>কোনো holiday নেই</p></div> : holidays.map(h => (
              <div key={h._id} className="list-item">
                <div className="item-icon icon-amber"><Icon name="calendar" size={18} /></div>
                <div className="item-content">
                  <div className="item-title">{h.title}</div>
                  <div className="item-sub">{new Date(h.startDate).toLocaleDateString('en-BD')} — {new Date(h.endDate).toLocaleDateString('en-BD')}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`tag ${typeColors[h.type]}`}>{TYPES[h.type]}</span>
                  <button onClick={() => handleDelete(h._id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 4 }}>
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ← ২. মডালটাকে createPortal দিয়ে wrap করো */}
      {showModal && createPortal(
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-sheet">
            <div className="modal-handle" />
            <h3 className="modal-title">নতুন Holiday</h3>
            <form onSubmit={handleCreate}>
              <div className="form-group"><label className="form-label">Title *</label><input className="form-input" required placeholder="যেমন: Eid ul Fitr" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} /></div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-select" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                  {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="form-group"><label className="form-label">Start Date *</label><input className="form-input" type="date" required value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">End Date *</label><input className="form-input" type="date" required value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} /></div>
              </div>
              <div className="form-group"><label className="form-label">Description</label><input className="form-input" placeholder="বিবরণ (ঐচ্ছিক)" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button type="button" className="btn-secondary w-full" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submi t" className="btn-primary">Add Holiday</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}