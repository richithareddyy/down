import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "open seat — walk into campus life already happening.",
  description:
    "Personal agents restructure activities already happening on campus so solo students can join without the awkward ask.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
