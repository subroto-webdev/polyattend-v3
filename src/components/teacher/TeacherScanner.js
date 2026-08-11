'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '@/utils/api';
import Icon from '@/components/common/Icon';
import toast from 'react-hot-toast';
import useSessionExitGuard from '@/hooks/useSessionExitGuard';
// html5-qrcode browser-only library প্রথমে load হয় client-side, SSR safety-র জন্য dynamic import

const SCAN_COOLDOWN = 1200;
const SCAN_FPS = 15;
const SCANNER_HEIGHT = 300; // single source of truth for scanner height

export default function TeacherScanner() {
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [session, setSession] = useState(null);
  const [scannedList, setScannedList] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [scanStatus, setScanStatus] = useState('idle'); // 'idle' | 'scanning' | 'success' | 'error'
  const [lastScanned, setLastScanned] = useState(null);
  const [cameraError, setCameraError] = useState(null);

  // FIX: teacher must not be able to leave this page mid-session (Back,
  // Refresh, other page, Logout) without ending it first — see
  // src/hooks/useSessionExitGuard.js.
  useSessionExitGuard(!!session, selectedSubject ? `QR Scanner — ${selectedSubject.name}` : 'QR Scanner');

  // ── NEW FEATURE: Session চলাকালীন student manually search করে present করা ──
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [markingId, setMarkingId] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const scannerRef = useRef(null);
  const html5QrRef = useRef(null);
  const lastScanTime = useRef(0);
  const processingRef = useRef(false);

  useEffect(() => {
    api.get('/subjects')
      .then(r => setSubjects(r.data.subjects || []))
      .finally(() => setLoadingSubjects(false));

    api.get('/sessions?status=active').then(r => {
      if (r.data.sessions?.length > 0) {
        const s = r.data.sessions[0];
        setSession(s);
        loadScanned(s._id);
      }
    }).catch(() => { });

    return () => stopScanner();
  }, []);

  // Live-refresh the attendance list while a session is running, so students
  // who self-check-in from their own dashboard show up here automatically —
  // teacher no longer needs to manually reload the page.
  useEffect(() => {
    if (!session?._id) return;
    const interval = setInterval(() => {
      loadScanned(session._id);
    }, 4000);
    return () => clearInterval(interval);
  }, [session?._id]);

  const loadScanned = async (sessionId) => {
    try {
      const res = await api.get(`/attendance/session/${sessionId}`);
      setScannedList(res.data.attendance || []);
    } catch {
      // Silent — this also runs on a background poll now, so we don't want
      // to spam toast errors every few seconds on a transient network hiccup.
    }
  };

  const startSession = async (subject) => {
    // Guard: a subject with a missing/broken Department reference used to send
    // departmentId: null and crash the session downstream. Fail fast with a
    // clear message instead.
    if (!subject?.departmentId) {
      toast.error('এই subject-এর Department সেট নেই। "Subjects" পেজ থেকে এটি Edit করে Department দিন।');
      return;
    }
    setSessionLoading(true);
    try {
      const res = await api.post('/sessions', {
        subjectId: subject._id,
        semester: subject.semester,
        section: subject.section
      });
      setSelectedSubject(subject);
      setSession(res.data.session);
      toast.success('Session শুরু হয়েছে!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Session শুরু করতে সমস্যা হয়েছে');
    } finally {
      setSessionLoading(false);
    }
  };

  const handleScan = useCallback(async (qrData) => {
    if (!session || processingRef.current) return;

    const now = Date.now();
    if (now - lastScanTime.current < SCAN_COOLDOWN) return;
    lastScanTime.current = now;
    processingRef.current = true;

    setScanStatus('scanning');
    try {
      const res = await api.post('/attendance/scan', { sessionId: session._id, qrData });
      setScanStatus('success');
      setLastScanned(res.data.student?.name || res.data.studentName || 'Student');
      toast.success(res.data.message);
      await loadScanned(session._id);
    } catch (err) {
      setScanStatus('error');
      const msg = err.response?.data?.message || 'Scan করা যায়নি';
      toast.error(msg);
    } finally {
      setTimeout(() => {
        setScanStatus('idle');
        setLastScanned(null);
        processingRef.current = false;
      }, 1000);
    }
  }, [session]);

  const startScanning = async () => {
    setCameraError(null);
    setScanStatus('idle');

    // 🌐 HTTP & Local IP Address checking for camera restriction in browser secure context
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = 'Camera API ব্লক করা হয়েছে। এটি শুধুমাত্র localhost অথবা HTTPS সংযোগে কাজ করে।';
      setCameraError(msg);
      toast.error(msg);
      return;
    }

    // FIX (speed): this used to call getUserMedia() first just to check
    // camera permission, then stop that stream, then let html5-qrcode open
    // the camera a SECOND time. Opening camera hardware twice in a row is
    // slow on real devices (each open can take anywhere from a few hundred
    // ms to a couple of seconds) — doubling it was the main reason "Camera
    // চালু করুন" felt sluggish. Html5Qrcode.start() below already requests
    // camera permission itself as part of opening it once, and the existing
    // catch block below already turns a permission/NotFound/NotReadable
    // error into a friendly Bangla message — so the separate pre-check
    // wasn't actually needed for correctness, only for a slightly earlier
    // error message, at the cost of being roughly twice as slow every time.
    setScanning(true);

    // Wait one tick so the #qr-reader div is visible in DOM with proper dimensions
    await new Promise(r => setTimeout(r, 50));

    try {
      const containerWidth = document.getElementById('qr-reader')?.offsetWidth || 300;
      // qrbox must be smaller than the container, leave ~20px margin each side
      const boxSize = Math.min(220, containerWidth - 40);

      const { Html5Qrcode } = await import('html5-qrcode');
      html5QrRef.current = new Html5Qrcode('qr-reader');

      try {
        // Try starting with back camera ('environment') first
        await html5QrRef.current.start(
          { facingMode: 'environment' },
          {
            fps: SCAN_FPS,
            qrbox: { width: boxSize, height: boxSize },
          },
          async (decodedText) => {
            await handleScan(decodedText);
          },
          () => { }
        );
      } catch (firstErr) {
        console.warn("Environment camera not available, trying user camera:", firstErr);
        // Fallback to front camera ('user') or default camera if back camera is not available
        await html5QrRef.current.start(
          { facingMode: 'user' },
          {
            fps: SCAN_FPS,
            qrbox: { width: boxSize, height: boxSize },
          },
          async (decodedText) => {
            await handleScan(decodedText);
          },
          () => { }
        );
      }
    } catch (err) {
      setScanning(false);
      // FIX: this used to check err.message.includes('permission') — but
      // real browser errors are usually named NotAllowedError with a
      // message like "Permission denied" (capital P), so the old
      // lowercase-only check silently never matched and everyone just saw
      // the generic fallback message instead of a specific, actionable one.
      // Checking err.name (what browsers actually set) and lower-casing the
      // message fixes that.
      const name = err?.name || '';
      const msg2 = (err?.message || '').toLowerCase();
      let msg = null; // CHANGED: generic fallback message removed per request —
      // for an unrecognized camera error, show nothing at all and just let
      // the "Scanner চালু করুন" button reappear silently so the user can
      // retry. Only the three specific, actionable cases below still show
      // a message, since those tell the user something they can act on.
      if (name === 'NotAllowedError' || msg2.includes('permission') || msg2.includes('denied')) {
        msg = 'Camera permission দেওয়া হয়নি। Browser settings থেকে Camera permission চালু করে আবার চেষ্টা করুন।';
      } else if (name === 'NotFoundError' || msg2.includes('notfounderror')) {
        msg = 'কোনো Camera পাওয়া যায়নি।';
      } else if (name === 'NotReadableError' || msg2.includes('notreadableerror')) {
        msg = 'Camera অন্য app/ট্যাব ব্যবহার করছে। অন্য app বন্ধ করে আবার চেষ্টা করুন।';
      }
      setCameraError(msg); // null when unrecognized — no banner rendered, see cameraError ? ... below
      if (msg) toast.error(msg); // no toast either when there's no message
    }
  };

  const stopScanner = async () => {
    if (html5QrRef.current) {
      try { await html5QrRef.current.stop(); } catch { }
      html5QrRef.current = null;
    }
    setScanning(false);
    setScanStatus('idle');
    processingRef.current = false;
  };

  // FIX (responsiveness): previously this did `await stopScanner()` BEFORE
  // calling the end-session API. stopScanner() has to wait for the camera
  // hardware to fully release (html5QrRef.current.stop()), which can take a
  // noticeable moment on real devices — and the API call, and therefore the
  // whole "session ended" UI update, was blocked behind that. Now the
  // end-session API call fires immediately, and the camera is released in
  // the background (fire-and-forget, not awaited) at the same time. The
  // user sees the session end right away regardless of how long the camera
  // teardown takes. stopScanner() already wraps its own work in try/catch,
  // so not awaiting it here is safe — it can't throw an unhandled rejection.
  const endSession = async () => {
    if (!session) return;
    if (!window.confirm('Session শেষ করবেন? বাকি students absent হবে।')) return;

    const sessionId = session._id;

    // Release the camera in the background — don't block session-end on it.
    stopScanner();

    try {
      await api.put(`/sessions/${sessionId}/end`);
      toast.success('Session শেষ হয়েছে!');
      setSession(null);
      setSelectedSubject(null);
      setScannedList([]);
      setCameraError(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Session শেষ করতে সমস্যা');
    }
  };

  // ── NEW FEATURE: Debounced student search within the active session's class ──
  useEffect(() => {
    if (!session || !searchTerm || searchTerm.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/users', {
          params: {
            role: 'student',
            departmentId: session.departmentId?._id || session.departmentId,
            semester: session.semester,
            section: session.section,
            shift: session.shift,
            search: searchTerm.trim(),
          },
        });
        setSearchResults(res.data.users || []);
      } catch (err) {
        // silent fail — search is a convenience feature
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchTerm, session]);

  const alreadyPresentIds = new Set(
    scannedList.filter(a => a.status === 'present').map(a => (a.studentId?._id || a.studentId)?.toString())
  );

  const markPresentBySearch = async (student) => {
    if (!session || markingId) return;
    setMarkingId(student._id);
    try {
      const res = await api.post('/attendance/mark-present', { sessionId: session._id, studentId: student._id });
      toast.success(res.data.message || `✅ ${student.name} present marked`);
      await loadScanned(session._id);
      setSearchTerm('');
      setSearchResults([]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Present করা যায়নি');
    } finally {
      setMarkingId(null);
    }
  };

  const presentCount = scannedList.filter(a => a.status === 'present').length;

  const overlayColor =
    scanStatus === 'success' ? 'rgba(74,222,128,0.18)' :
      scanStatus === 'error' ? 'rgba(248,113,113,0.18)' :
        scanStatus === 'scanning' ? 'rgba(96,165,250,0.12)' :
          'transparent';

  const cornerColor =
    scanStatus === 'success' ? '#4ade80' :
      scanStatus === 'error' ? '#f87171' :
        scanStatus === 'scanning' ? '#60a5fa' :
          'var(--primary)';

  if (loadingSubjects) return <div className="loading"><div className="spinner" /></div>;

  if (!session) return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">QR Scanner</h2>
        <p className="page-sub">Subject বেছে session শুরু করুন</p>
      </div>
      {subjects.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon"><Icon name="qr" size={24} /></div>
            <p>কোনো subject নেই। আগে subject তৈরি করুন।</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {subjects.map(s => (
            <div
              key={s._id}
              className="subject-card"
              onClick={() => !sessionLoading && startSession(s)}
              style={{ opacity: sessionLoading ? 0.6 : 1, cursor: sessionLoading ? 'not-allowed' : 'pointer' }}
            >
              <div className="subject-code">{s.code}</div>
              <div className="subject-name">{s.name}</div>
              <div className="subject-meta">{s.departmentId?.name} • Sem {s.semester} • Group {s.section}</div>
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--primary)', fontSize: 13, fontWeight: 600 }}>
                {sessionLoading ? <span style={{ fontSize: 12 }}>শুরু হচ্ছে...</span> : <><Icon name="qr" size={14} /> QR Session শুরু</>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div>
      {/* Action bar */}
      <div className="action-bar">
        <div style={{ flex: 1 }}>
          <div className="action-bar-title">{session.subjectId?.name}</div>
          <div style={{ fontSize: 12, color: 'var(--txt2)' }}>
            Sem {session.semester} • Group {session.section} • {presentCount} scanned
          </div>
        </div>
        <button className="btn-danger btn-sm" onClick={endSession}>
          <Icon name="stop" size={14} /> End
        </button>
      </div>

      <div className="page" style={{ paddingTop: 16 }}>

        {/* Scanner area */}
        <div className="scanner-wrap">
          <div
            className="scanner-video-area"
            style={{
              position: 'relative',
              height: SCANNER_HEIGHT,           // ← FIX: explicit height in inline style
              overflow: 'hidden',               // ← FIX: moved here so it's always applied
              background: scanning ? '#000' : '#0a0a0a',
              transition: 'background 0.3s',
              borderRadius: 12,
            }}
          >
            {/* Html5Qrcode mount point — must match parent height */}
            <div
              id="qr-reader"
              ref={scannerRef}
              style={{
                width: '100%',
                height: SCANNER_HEIGHT,         // ← FIX: explicit px height, not '100%'
              }}
            />

            {/* Scan feedback overlay */}
            {scanning && (
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: overlayColor, transition: 'background 0.2s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ position: 'relative', width: 220, height: 220 }}>
                  {['tl', 'tr', 'bl', 'br'].map(pos => (
                    <div key={pos} className={`scanner-corner sc-${pos}`} style={{ borderColor: cornerColor }} />
                  ))}
                  <div style={{
                    position: 'absolute', left: 8, right: 8,
                    height: 2, background: cornerColor, opacity: 0.7,
                    top: '50%', transform: 'translateY(-50%)',
                    animation: 'scanLine 1.5s ease-in-out infinite',
                  }} />
                </div>

                {scanStatus !== 'idle' && (
                  <div style={{
                    marginTop: 14, padding: '6px 16px', borderRadius: 20,
                    fontSize: 13, fontWeight: 600,
                    background:
                      scanStatus === 'success' ? 'rgba(74,222,128,0.9)' :
                        scanStatus === 'error' ? 'rgba(248,113,113,0.9)' :
                          'rgba(96,165,250,0.9)',
                    color: '#0a0a0a',
                  }}>
                    {scanStatus === 'success' && `✓ ${lastScanned || 'Present!'}`}
                    {scanStatus === 'error' && '✗ Scan failed'}
                    {scanStatus === 'scanning' && '⏳ Processing...'}
                  </div>
                )}
              </div>
            )}

            {/* Start prompt (not scanning) */}
            {!scanning && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
              }}>
                <div className="scanner-frame">
                  <div className="scanner-corner sc-tl" />
                  <div className="scanner-corner sc-tr" />
                  <div className="scanner-corner sc-bl" />
                  <div className="scanner-corner sc-br" />
                </div>

                {cameraError ? (
                  <div style={{ textAlign: 'center', padding: '0 20px' }}>
                    <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>
                      ⚠️ {cameraError}
                    </div>
                    <button
                      onClick={startScanning}
                      style={{
                        background: 'var(--primary)', color: '#fff', border: 'none',
                        borderRadius: 8, padding: '10px 20px', fontSize: 14,
                        fontWeight: 600, cursor: 'pointer', display: 'flex',
                        alignItems: 'center', gap: 8, margin: '0 auto',
                      }}
                    >
                      <Icon name="refresh" size={16} /> আবার চেষ্টা করুন
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={startScanning}
                    style={{
                      background: 'var(--primary)', color: '#fff', border: 'none',
                      borderRadius: 8, padding: '10px 20px', fontSize: 14,
                      fontWeight: 600, cursor: 'pointer', display: 'flex',
                      alignItems: 'center', gap: 8,
                    }}
                  >
                    <Icon name="qr" size={16} /> Scanner চালু করুন
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Status bar below scanner */}
          {scanning && (
            <div style={{
              textAlign: 'center', padding: '10px 0',
              color: scanStatus === 'error' ? '#f87171' : '#4ade80',
              fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>
              <span style={{
                display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                background: scanStatus === 'error' ? '#f87171' : '#4ade80',
                animation: 'pulse 1.2s ease-in-out infinite',
              }} />
              {scanStatus === 'error' ? 'Scan আবার চেষ্টা করুন' : 'QR Code স্ক্যান করুন...'}
              <button
                onClick={stopScanner}
                style={{
                  background: 'transparent', border: '1px solid #4ade80',
                  color: '#4ade80', borderRadius: 6, padding: '4px 10px',
                  cursor: 'pointer', fontSize: 12,
                }}
              >
                বন্ধ করুন
              </button>
            </div>
          )}
        </div>

        {/* ── NEW FEATURE: Manual student search — QR scan না করেও student খুঁজে present করা ── */}
        <div className="card" style={{ marginTop: 16, padding: 20 }}>
          <button
            type="button"
            onClick={() => setSearchOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
              color: 'var(--txt)', fontWeight: 700, fontSize: 15,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="search" size={16} /> Student Search করে Present করুন
            </span>
            <Icon name={searchOpen ? 'chevronLeft' : 'chevronRight'} size={16} />
          </button>

          {searchOpen && (
            <div style={{ marginTop: 16 }}>
              <input
                type="text"
                className="form-input"
                placeholder="নাম অথবা Student ID লিখুন... (কমপক্ষে ২ অক্ষর)"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ padding: '10px 14px' }}
              />

              {searching && (
                <div style={{ padding: '16px 0', textAlign: 'center' }}>
                  <div className="spinner spinner-sm" />
                </div>
              )}

              {!searching && searchTerm.trim().length >= 2 && (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {searchResults.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--txt2)', textAlign: 'center', padding: '12px 0' }}>
                      কোনো student পাওয়া যায়নি
                    </p>
                  ) : (
                    searchResults.map(student => {
                      const isPresent = alreadyPresentIds.has(student._id?.toString());
                      return (
                        <div
                          key={student._id}
                          className="list-item"
                          style={{ cursor: 'default', padding: '12px 14px' }}
                        >
                          <div className="item-icon icon-blue"><Icon name="users" size={16} /></div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{student.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--txt2)' }}>
                              ID: {student.studentId} • Group {student.section}
                            </div>
                          </div>
                          {isPresent ? (
                            <span className="tag tag-green" style={{ fontSize: 11 }}>✓ Present</span>
                          ) : (
                            <button
                              className="btn-primary btn-sm"
                              disabled={markingId === student._id}
                              onClick={() => markPresentBySearch(student)}
                              style={{ padding: '6px 14px' }}
                            >
                              {markingId === student._id ? '...' : 'Present করুন'}
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Scanned list */}
        <div className="section-title">
          স্ক্যান হয়েছে ({presentCount} জন)
        </div>
        <div className="card">
          {presentCount === 0 ? (
            <div className="empty"><p>এখনও কেউ স্ক্যান হয়নি</p></div>
          ) : (
            scannedList
              .filter(a => a.status === 'present')
              .map(a => (
                <div key={a._id} className="list-item" style={{ cursor: 'default' }}>
                  <div className="item-icon icon-green"><Icon name="check" size={18} /></div>
                  <div className="item-content">
                    <div className="item-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {a.studentId?.name}
                      {a.markedBy === 'self' && (
                        <span className="tag tag-amber" style={{ fontSize: 10, padding: '2px 6px' }} title="শিক্ষার্থী নিজে attendance দিয়েছে">
                          Self
                        </span>
                      )}
                    </div>
                    <div className="item-sub">{a.studentId?.studentId}</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--txt3)' }}>
                    {a.scannedAt ? new Date(a.scannedAt).toLocaleTimeString() : ''}
                  </div>
                </div>
              ))
          )}
        </div>
      </div>

      <style>{`
        /* ── Fix Html5Qrcode injected elements ── */
        #qr-reader {
          border: none !important;
          padding: 0 !important;
          height: ${SCANNER_HEIGHT}px !important;
          width: 100% !important;
        }
        #qr-reader video {
          width: 100% !important;
          height: ${SCANNER_HEIGHT}px !important;
          object-fit: cover !important;   /* fills container, no black bars */
          border-radius: 0 !important;
        }
        #qr-reader__scan_region {
          width: 100% !important;
          height: ${SCANNER_HEIGHT}px !important;
          overflow: hidden !important;
        }
        #qr-reader__scan_region img {
          display: none !important;        /* hide default QR frame image */
        }
        /* Hide Html5Qrcode's default dashboard UI (file/camera buttons) */
        #qr-reader__dashboard {
          display: none !important;
        }

        @keyframes scanLine {
          0%   { top: 12%; }
          50%  { top: 85%; }
          100% { top: 12%; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.7); }
        }
      `}</style>
    </div>
  );
}