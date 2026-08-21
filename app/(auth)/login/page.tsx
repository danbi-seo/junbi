import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "로그인 · JUNBI" };

export default async function LoginPage(props: PageProps<"/login">) {
  const { e } = await props.searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl tracking-tight">JUNBI</h1>
        <p className="mt-2 mb-8 leading-7 text-ash">
          일정과 지금 상태를 나누되,
          <br />
          어디까지 보여줄지는 각자 정해요.
        </p>

        {e === "link" && (
          <p className="mb-6 rounded-lg bg-slot-b-bg px-4 py-3 text-sm leading-6">
            링크가 만료됐거나 이미 사용됐어요.
            <br />
            아래에서 코드를 새로 받아 주세요.
          </p>
        )}

        <LoginForm />
      </div>
    </main>
  );
}
