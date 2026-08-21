import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "로그인 · JUNBI" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl tracking-tight">JUNBI</h1>
        <p className="mt-2 mb-8 leading-7 text-ash">
          일정과 지금 상태를 나누되,
          <br />
          어디까지 보여줄지는 각자 정해요.
        </p>

        <LoginForm />
      </div>
    </main>
  );
}
