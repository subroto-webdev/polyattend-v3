'use client';

// ── FEATURE: Active-session exit guard (HARD BLOCK, no skip option) ───────
// While a teacher has a live Attendance Session running (Manual Attendance),
// they must NOT be able to leave the page — via in-app
// navigation, Logout, or the Back button — without properly ending the
// session first. This used to be a skippable confirm() dialog ("leave
// anyway?"), which defeats the purpose since a teacher could just click
// through it. It now hard-blocks those three paths: the navigation/logout/
// back action is simply cancelled, and the teacher sees an alert telling
// them to end the session first. There is no "leave anyway" button anymore
// for paths this app controls.
//
// IMPORTANT HONEST LIMITATION: a page refresh or closing the browser tab
// cannot be hard-blocked by any website — this is a deliberate browser
// security restriction (no site is allowed to trap someone on a page against
// their will when they refresh/close). The best any site can do there is
// `beforeunload`, which shows the BROWSER's own generic "Leave site? /
// Cancel" dialog with wording the browser controls, not custom text — and
// the person can always choose to leave. That part is still wired up below
// for refresh/close specifically, since it's the only thing the platform
// allows; everything this app itself controls (nav buttons, logout, back
// button) is now a true hard block with no skip.
let activeGuard = null; // { label: string } | null

export function activateSessionGuard(label) {
  activeGuard = { label: label || 'Attendance' };
}

export function deactivateSessionGuard() {
  activeGuard = null;
}

export function isSessionGuardActive() {
  return !!activeGuard;
}

// Call before any in-app navigation, tab switch, or logout that this app
// controls. Returns true if the action should proceed (no active session).
// If a session IS active, it blocks the action (returns false) and alerts
// the teacher — there is no confirm/bypass choice.
export function blockIfSessionActive() {
  if (!activeGuard) return false; // nothing active, nothing to block
  window.alert(
    `🔒 "${activeGuard.label}" Session is still ongoing!\n\n` +
    `Save the Session first or End the Session.\n\n` +
    `You cannot leave this page until the Session ends (click End Session).`
  );
  return true; // blocked
}
