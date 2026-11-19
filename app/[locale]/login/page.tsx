import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { authCopy } from "@/components/auth/auth-copy";
import { AuthShell, UnavailableNotice } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { readPageSession } from "@/server/auth/page-access";
import { isLocale } from "@/server/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { title: `${authCopy[locale].signInTitle} | Stead`, robots: { index: false } };
}

export default async function LoginPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const session = await readPageSession();
  if (session === "authenticated") redirect(`/${locale}`);
  if (session === "unavailable") return <UnavailableNotice locale={locale} path="/login" />;

  return (
    <AuthShell locale={locale} path="/login">
      <LoginForm locale={locale} />
    </AuthShell>
  );
}
