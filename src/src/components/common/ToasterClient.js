'use client';
import { Toaster } from 'react-hot-toast';

export default function ToasterClient() {
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        duration: 3500,
        style: { borderRadius: '12px', background: '#1A1D26', color: '#F1F5F9', border: '1px solid #242938', boxShadow: '0 8px 24px rgba(0,0,0,0.45)' },
        success: { iconTheme: { primary: '#22c55e', secondary: '#1A1D26' } },
        error: { iconTheme: { primary: '#f43f5e', secondary: '#1A1D26' } },
      }}
    />
  );
}
