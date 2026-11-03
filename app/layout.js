import "./globals.css";

export const metadata = {
  title: "TruckSafe Fleet | ניהול צי חכם",
  description: "מערכת חכמה לניהול צי משאיות, נהגים, משימות ובטיחות בדרכים"
};

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
