'use client';
import React, { useState, useEffect } from 'react';
import api from '@/utils/api';
import Icon from '@/components/common/Icon';
import toast from 'react-hot-toast';

export default function AdminSettings() {
  const [threshold, setThreshold] = useState(70);
  const [savedThreshold, setSavedThreshold] = useState(70);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/settings')
      .then(res => {
        const t = res.data.settings?.attendanceThreshold ?? 70;
        setThreshold(t);
        setSavedThreshold(t);
      })
      .catch(err => toast.error(err.response?.data?.message || 'Problem loading Settings'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    const val = Number(threshold);
    if (isNaN(val) || val < 0 || val > 100) {
      toast.error('Please enter a number between 0 and 100');
      return;
    }
    setSaving(true);
    try {
      const res = await api.put('/settings', { attendanceThreshold: val });
      setSavedThreshold(res.data.settings.attendanceThreshold);
      setThreshold(res.data.settings.attendanceThreshold);
      toast.success('Settings saved!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Problem saving');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const hasChanges = Number(threshold) !== savedThreshold;

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Settings</h2>
        <p className="page-sub">Change general system settings</p>
      </div>

      <div className="card" style={{ padding: 20, maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div className="item-icon icon-amber"><Icon name="alert" size={18} /></div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Exam Eligibility — Attendance Threshold</div>
            <div style={{ fontSize: 12, color: 'var(--txt2)' }}>
              If a student's attendance falls below this percentage, a warning will be shown on their Dashboard that they cannot sit for the exam in that subject.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
          <input
            type="number"
            min={0}
            max={100}
            className="form-input"
            style={{ width: 110, textAlign: 'center', fontWeight: 700, fontSize: 18 }}
            value={threshold}
            onChange={e => setThreshold(e.target.value)}
          />
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--txt2)' }}>%</span>
          <input
            type="range"
            min={0}
            max={100}
            value={threshold}
            onChange={e => setThreshold(e.target.value)}
            style={{ flex: 1 }}
          />
        </div>

        <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 10 }}>
          Currently saved value: <strong>{savedThreshold}%</strong>
        </div>

        <button
          className="btn-primary"
          style={{ marginTop: 18 }}
          onClick={save}
          disabled={saving || !hasChanges}
        >
          {saving ? <><div className="spinner spinner-sm" /> Saving...</> : <><Icon name="check" size={16} /> Save Changes</>}
        </button>
      </div>
    </div>
  );
}
