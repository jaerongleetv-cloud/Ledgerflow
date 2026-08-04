import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata = {
  title: {
    default: "LedgerFlow",
    template: "%s | LedgerFlow",
  },
  description: "Track transactions, net worth, and financial reports in one place.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
