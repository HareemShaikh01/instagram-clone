"use client";

import Link from "next/link";
import { Camera } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-96">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-yellow-400 via-danger to-purple-600">
            <Camera size={30} className="text-white" />
          </div>
          <Link href="/" className="text-3xl font-semibold tracking-tight" style={{ fontFamily: "'Segoe Script', 'Brush Script MT', cursive" }}>
            Instagram Clone
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
