'use client';
import { useEffect } from 'react';
import { activateSessionGuard, deactivateSessionGuard, blockIfSessionActive } from '@/utils/sessionGuard';

// Call with (isActive, label) from any page that runs a live attendance
// session (Manual Attendance). While isActive is true:
//   - Pressing the Back button is HARD BLOCKED — no skip/bypass option. It
//     shows an alert telling the teacher to end the session first, and the
//     page never actually navigates away (via a well-known SPA trick: push
//     one extra history entry so every Back press has something harmless
//     to consume first, giving us a chance to intercept and cancel it).
//   - In-app navigation (sidebar/bottom-nav buttons) and Logout are hard-
//     blocked the same way, in AppShell, using the same shared guard.
//   - Refreshing / closing the tab / typing a new address still shows the
//     BROWSER's own "Leave site?" dialog (beforeunload) — this is the one
//     case no website can hard-block; it's a deliberate browser security
//     restriction, and the browser's own dialog always lets the person
//     choose to leave anyway. That part of the requirement ("no way to
//     leave, period") isn't something any site can fully deliver for
//     refresh/close — everything else (nav, logout, back) is now airtight.
export default function useSessionExitGuard(isActive, label) {
  useEffect(() => {
    if (isActive) activateSessionGuard(label);
    else deactivateSessionGuard();
    return () => deactivateSessionGuard();
  }, [isActive, label]);

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!isActive) return;
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;

    // Extra history entry that only exists so the next Back press has
    // something harmless to consume first, giving us a chance to intercept
    // and cancel it — with no skip option, unlike the old confirm()-based
    // version.
    window.history.pushState({ __sessionGuard: true }, '');

    const onPopState = () => {
      if (blockIfSessionActive()) {
        // Hard block: always restore the guard entry so the next Back
        // press is caught here again instead of ever actually leaving.
        window.history.pushState({ __sessionGuard: true }, '');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isActive]);
}
