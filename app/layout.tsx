export const metadata = {
  title: "Post-purchase Analytics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#1a1a1a" }}>{children}</body>
    </html>
  );
}
