'use client';
import React, { useState } from 'react';
import api, { getBlobErrorMessage } from '@/utils/api';
import Icon from '@/components/common/Icon';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

export default function StudentReport() {
  const { user } = useAuth();
  const [downloading, setDownloading] = useState(null); // 'excel' | 'pdf' | null

  const downloadReport = async (format = 'excel') => {
    setDownloading(format);
    try {
      const res = await api.get(`/reports/student/${user._id}${format === 'pdf' ? '?format=pdf' : ''}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance_${user.studentId || user.name}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Report download started!');
    } catch (err) {
      toast.error(await getBlobErrorMessage(err));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">My Report</h2>
        <p className="page-sub">Download your attendance report in Excel or PDF format</p>
      </div>

      <div className="card" style={{ padding: 24, textAlign: 'center' }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'var(--primary-light)', color: 'var(--primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px'
        }}>
          <Icon name="download" size={30} />
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Personal Attendance Report</h3>
        <p style={{ color: 'var(--txt2)', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
          An Excel or PDF report with attendance for all your subjects, date-wise records, and statistics.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, maxWidth: 300, margin: '0 auto 24px', textAlign: 'left' }}>
          {[
            'Subject-wise summary',
            'Date-wise records',
            'Total/Present/Absent',
            'Attendance percentage',
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--txt2)' }}>
              <Icon name="check" size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              {item}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, maxWidth: 320, margin: '0 auto', justifyContent: 'center' }}>
          <button className="btn-primary" style={{ flex: 1 }} onClick={() => downloadReport('excel')} disabled={!!downloading}>
            {downloading === 'excel'
              ? <><div className="spinner spinner-sm" /> Generating...</>
              : <><Icon name="download" size={16} /> Excel</>
            }
          </button>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => downloadReport('pdf')} disabled={!!downloading}>
            {downloading === 'pdf'
              ? <><div className="spinner spinner-sm" /> Generating...</>
              : <><Icon name="download" size={16} /> PDF</>
            }
          </button>
        </div>
      </div>

      <div className="info-banner" style={{ marginTop: 16 }}>
        <Icon name="info" size={16} />
        <span className="info-text">
          The report will have two sheets: <strong>Subject Summary</strong> and <strong>Date-wise Records</strong>.
        </span>
      </div>
    </div>
  );
}
