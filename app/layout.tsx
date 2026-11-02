import ProductIntro from "./product-intro";
import "./style.css";
export const metadata = {
  title: "SyncBoard · Product studio",
  description: "An open studio for shared project work.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><ProductIntro /><div id="workspace">{children}</div></body>
    </html>
  );
}
