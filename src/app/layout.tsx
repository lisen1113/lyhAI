import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "物理化学 AI 训练系统",
  description: "初中物理化学 AI 自适应训练系统 V1.0",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
