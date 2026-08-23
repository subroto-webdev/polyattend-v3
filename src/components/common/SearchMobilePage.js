'use client';
import React, { useState } from 'react';
import api from '@/utils/api';
import Icon from './Icon';

export default function SearchMobilePage() {
  const [roll, setRoll] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    const trimmed = roll.trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await api.get('/users/lookup-by-roll', { params: { roll: trimmed } });
      setResult(res.data.student);
    } catch (err) {
      setError(err.response?.data?.message || 'Not found');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <style suppressHydrationWarning>{`
        .smb-card {
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 28px;
          max-width: 520px;
          box-shadow: var(--shadow);
        }
        .smb-title {
          font-size: 20px;
          font-weight: 800;
          color: var(--txt);
          margin-bottom: 4px;
        }
        .smb-sub {
          font-size: 13px;
          color: var(--txt2);
          margin-bottom: 24px;
        }
        .smb-input-wrap {
          display: flex;
          gap: 10px;
          margin-bottom: 16px;
        }
        .smb-input {
          flex: 1;
          background: var(--bg2);
          border: 1.5px solid var(--border);
          border-radius: 12px;
          padding: 12px 16px;
          font-size: 15px;
          color: var(--txt);
          outline: none;
          transition: border-color 0.18s;
          font-family: monospace;
          letter-spacing: 1px;
        }
        .smb-input:focus {
          border-color: var(--primary);
        }
        .smb-btn {
          background: var(--primary);
          color: #fff;
          border: none;
          border-radius: 12px;
          padding: 12px 22px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: opacity 0.15s, transform 0.15s;
          white-space: nowrap;
        }
        .smb-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .smb-btn:not(:disabled):hover {
          opacity: 0.88;
          transform: scale(1.03);
        }
        .smb-error {
          background: rgba(248, 113, 113, 0.1);
          border: 1px solid rgba(248, 113, 113, 0.25);
          border-radius: 10px;
          padding: 10px 14px;
          font-size: 13px;
          color: #f87171;
          margin-top: 8px;
        }
        .smb-result {
          margin-top: 18px;
          background: var(--bg2);
          border: 1.5px solid var(--border);
          border-radius: 14px;
          padding: 18px;
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .smb-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 700;
          color: #fff;
          flex-shrink: 0;
        }
        .smb-name {
          font-size: 15px;
          font-weight: 700;
          color: var(--txt);
          margin-bottom: 3px;
        }
        .smb-meta {
          font-size: 12px;
          color: var(--txt2);
        }
        .smb-mobile-box {
          margin-left: auto;
          text-align: right;
          flex-shrink: 0;
        }
        .smb-mobile-label {
          font-size: 11px;
          color: var(--txt3);
          margin-bottom: 2px;
        }
        .smb-mobile-number {
          font-size: 17px;
          font-weight: 800;
          color: #34d399;
          letter-spacing: 0.5px;
          font-family: monospace;
        }
        .smb-mobile-empty {
          font-size: 13px;
          color: var(--txt3);
        }
        .smb-hint {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 12px 16px;
          font-size: 12.5px;
          color: var(--txt2);
          margin-top: 20px;
        }
      `}</style>

      {/* Page header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <h2 className="page-title" style={{ fontSize: 22, fontWeight: 800, color: 'var(--txt)' }}>
          Search Mobile Number
        </h2>
        <p style={{ color: 'var(--txt2)', fontSize: 13, marginTop: 3 }}>
          Search Mobile Number using a Student's Roll number
        </p>
      </div>

      <div className="smb-card">
        <div className="smb-title">📱 Search Mobile Number</div>
        <div className="smb-sub">See a Student's Mobile Number using their Roll (e.g. 800768)</div>

        <form onSubmit={handleSearch}>
          <div className="smb-input-wrap">
            <input
              className="smb-input"
              type="text"
              value={roll}
              onChange={e => { setRoll(e.target.value); setError(''); setResult(null); }}
              placeholder="Enter Roll number…"
              autoFocus
            />
            <button className="smb-btn" type="submit" disabled={loading || !roll.trim()}>
              <Icon name="search" size={15} />
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>
        </form>

        {error && <div className="smb-error">⚠️ {error}</div>}

        {result && (
          <div className="smb-result">
            <div className="smb-avatar">
              {(result.name || '?').trim().charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="smb-name">{result.name}</div>
              <div className="smb-meta">
                Roll: {result.studentId}
                {result.departmentId?.code ? ` · ${result.departmentId.code}` : ''}
                {result.semester ? ` · Sem ${result.semester}` : ''}
                {result.section ? ` · Group ${result.section}` : ''}
              </div>
            </div>
            <div className="smb-mobile-box">
              <div className="smb-mobile-label">Mobile Number</div>
              {result.mobile
                ? <div className="smb-mobile-number">{result.mobile}</div>
                : <div className="smb-mobile-empty">Not provided</div>
              }
            </div>
          </div>
        )}

        <div className="smb-hint">
          <Icon name="info" size={14} />
          You can only search Students in your Department / Shift
        </div>
      </div>
    </div>
  );
}
