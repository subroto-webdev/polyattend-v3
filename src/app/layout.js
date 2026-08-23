import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import ToasterClient from '@/components/common/ToasterClient';

export const metadata = {
  title: {
    default: 'PolyAttend — Thakurgaon Polytechnic Institute',
    template: '%s | PolyAttend',
  },
  description: 'PolyAttend is a Smart Attendance Management System built for Thakurgaon Polytechnic Institute (TPI). Easy and fast online attendance tracking for Teachers and Students, digital attendance management, and real-time reporting.',
  keywords: [
    // Brand
    'PolyAttend',
    'PolyAttend TPI',
    'PolyAttend login',
    'PolyAttend app',
    'PolyAttend Thakurgaon',

    // Institute short
    'TPI',
    'TPI attendance',
    'TPI login',
    'TPI portal',
    'TPI app',
    'TPI student',
    'TPI teacher',
    'TPI hazira',
    'TPI CST',
    'TPI department',
    'TPI result',
    'TPI notice',
    'TPI website',
    'TPI online',

    // Full institute name variants
    'Thakurgaon Polytechnic',
    'Thakurgaon Polytechnic Institute',
    'Thakurgaon Polytechnic attendance',
    'Thakurgaon Polytechnic login',
    'Thakurgaon Polytechnic student',
    'Thakurgaon Polytechnic app',
    'Thakurgaon Polytechnic portal',
    'Thakurgaon Polytechnic hazira',
    'Thakurgaon Polytechnic CST',

    // Bengali-region name variants (transliterated to English)
    'Thakurgaon Polytechnic',
    'Thakurgaon Polytechnic Institute hazira',
    'Thakurgaon Polytechnic login',
    'Thakurgaon Polytechnic attendance system',
    'Thakurgaon Polytechnic app',
    'Thakurgaon Polytechnic student',
    'Polytechnic hazira system',
    'Polytechnic online hazira',
    'Online hazira system',
    'Digital attendance polytechnic',

    // Attendance generic
    'attendance system',
    'attendance app',
    'attendance management',
    'attendance tracker',
    'attendance portal',
    'online attendance',
    'digital attendance',
    'smart attendance',
    'automatic attendance',
    'attendance dashboard',
    'attendance report',
    'attendance software',
    'student attendance',
    'student attendance management',
    'teacher attendance',
    'teacher attendance dashboard',
    'class attendance',
    'college attendance',
    'school attendance',
    'attendance checker',
    'attendance calculator',
    'daily attendance',

    // Polytechnic generic
    'polytechnic attendance',
    'polytechnic attendance management system Bangladesh',
    'polytechnic login',
    'polytechnic student portal',
    'polytechnic app',
    'polytechnic system',
    'polytechnic institute app',
    'polytechnic institute Bangladesh',
    'polytechnic Bangladesh',
    'polytechnic result',
    'diploma attendance',
    'diploma engineering attendance',
    'diploma student portal',

    // BTEB related
    'BTEB attendance',
    'BTEB student attendance system',
    'BTEB student system',
    'BTEB portal',
    'BTEB login',

    // Department related
    'CST attendance',
    'CST department TPI',
    'Computer Science Technology TPI',
    'polytechnic CST',

    // Action / intent keywords
    'how to check attendance system',
    'how to see TPI attendance',
    'how to check Thakurgaon Polytechnic attendance system',
    'polytechnic hazira app',
    'attendance app download',
    'TPI app download',
    'TPI attendance app download',
    'how to check attendance TPI',
    'student login system',
    'teacher login system',
    'school management system Bangladesh',
    'attendance system Bangladesh',
    'best attendance app Bangladesh',
    'free attendance system',
    'web based attendance system',
    'student attendance app Bangladesh',
    'Next.js attendance system',
  ],
  authors: [{ name: 'Subroto' }],
  metadataBase: new URL('https://polyattend-system2026.vercel.app'),
  openGraph: {
    title: 'PolyAttend — Thakurgaon Polytechnic Institute',
    description: 'Smart Attendance Management System for TPI. Easy and fast attendance tracking for Teachers and Students.',
    url: 'https://polyattend-system2026.vercel.app',
    siteName: 'PolyAttend',
    locale: 'en_US',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
  verification: {
    google: 'Rv-warpxyxgzIEGN5-ulYl0zJ3IfODOf1AjL_X9Ibjg',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
          <ToasterClient />
        </AuthProvider>
      </body>
    </html>
  );
}