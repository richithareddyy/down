import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "down? — the version of the plan everyone’s actually down for.",
  description:
    "Tell your agent how you really feel about the group's plan. The agents negotiate a version everyone can do, and nobody learns who asked.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
