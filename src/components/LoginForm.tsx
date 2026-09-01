"use client";

import * as React from "react";
import { useState } from "react";

type LoginMode = "otp" | "password";

/**
 * Login page body with three methods:
 *  - Email OTP (magic code) — primary
 *  - Username + password — wp-graphql-headless-login PASSWORD provider
 *  - Authentik — third-party OIDC button (navigates away)
 *
 * After any successful login the page redirects to `redirect` (default "/").
 */
export default function LoginForm({ redirect }: { redirect: string }) {
  const [mode, setMode] = useState<LoginMode>("otp");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [countdown, setCountdown] = useState(0);

  const finish = (path: string) => {
    window.location.href = path;
  };

  const sendCode = async () => {
    setError("");
    setInfo("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("请输入正确的邮箱地址");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/auth/otp-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "验证码发送失败");
        return;
      }
      setStep("code");
      // 倒计时 = 重发冷却（后端 RESEND_MIN_INTERVAL=60s），而非验证码有效期。
      setInfo(
        `验证码已发送，请查收邮件（${Math.round((data.expiresIn || 600) / 60)} 分钟内有效）`,
      );
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(timer);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async () => {
    setError("");
    setInfo("");
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/otp-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "验证失败");
        return;
      }
      // OTP login must complete the profile first.
      finish(data.needsProfile ? "/user/profile" : redirect);
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setVerifying(false);
    }
  };

  const passwordLogin = async () => {
    setError("");
    setInfo("");
    if (!username || !password) {
      setError("请输入用户名和密码");
      return;
    }
    setLoggingIn(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "登录失败");
        return;
      }
      finish(redirect);
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <div
      style={{
        width: 400,
        margin: "3rem auto 0",
        padding: "1.5rem",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
      }}
    >
      <h2
        style={{
          fontSize: "1.25rem",
          fontWeight: 800,
          marginBottom: "1rem",
          color: "var(--foreground)",
        }}
      >
        登录
      </h2>

      {/* Mode switch */}
      <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1.25rem" }}>
        <button
          type="button"
          onClick={() => {
            setMode("otp");
            setError("");
            setInfo("");
          }}
          style={{
            flex: 1,
            padding: "0.45rem",
            fontSize: "0.85rem",
            fontWeight: 700,
            borderRadius: "var(--radius)",
            cursor: "pointer",
            border:
              mode === "otp"
                ? "2px solid var(--primary)"
                : "1px solid var(--border)",
            background:
              mode === "otp"
                ? "color-mix(in oklch, var(--primary) 10%, transparent)"
                : "transparent",
            color:
              mode === "otp" ? "var(--primary)" : "var(--muted-foreground)",
          }}
        >
          邮箱登录
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("password");
            setError("");
            setInfo("");
          }}
          style={{
            flex: 1,
            padding: "0.45rem",
            fontSize: "0.85rem",
            fontWeight: 700,
            borderRadius: "var(--radius)",
            cursor: "pointer",
            border:
              mode === "password"
                ? "2px solid var(--primary)"
                : "1px solid var(--border)",
            background:
              mode === "password"
                ? "color-mix(in oklch, var(--primary) 10%, transparent)"
                : "transparent",
            color:
              mode === "password"
                ? "var(--primary)"
                : "var(--muted-foreground)",
          }}
        >
          账号密码
        </button>
      </div>

      {error && (
        <p
          style={{
            color: "var(--destructive)",
            fontSize: "0.8rem",
            fontWeight: 600,
            marginBottom: "0.75rem",
          }}
        >
          {error}
        </p>
      )}
      {info && (
        <p
          style={{
            color: "var(--primary)",
            fontSize: "0.8rem",
            fontWeight: 600,
            marginBottom: "0.75rem",
          }}
        >
          {info}
        </p>
      )}

      {mode === "otp" ? (
        step === "email" ? (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="邮箱地址"
              style={{
                padding: "0.55rem 0.8rem",
                fontSize: "0.9rem",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
              }}
            />
            <button
              type="button"
              onClick={sendCode}
              disabled={sending}
              style={{
                padding: "0.55rem",
                fontSize: "0.9rem",
                fontWeight: 700,
                color: "#000",
                background: "var(--primary)",
                borderRadius: "var(--radius)",
                border: "none",
                cursor: sending ? "not-allowed" : "pointer",
                opacity: sending ? 0.6 : 1,
              }}
            >
              {sending ? "发送中…" : "发送验证码"}
            </button>
          </div>
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}
          >
            <input
              type="text"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="6 位验证码"
              inputMode="numeric"
              maxLength={6}
              style={{
                padding: "0.55rem 0.8rem",
                fontSize: "0.9rem",
                letterSpacing: "0.3em",
                textAlign: "center",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
              }}
            />
            <button
              type="button"
              onClick={verifyCode}
              disabled={verifying || code.length !== 6}
              style={{
                padding: "0.55rem",
                fontSize: "0.9rem",
                fontWeight: 700,
                color: "#000",
                background: "var(--primary)",
                borderRadius: "var(--radius)",
                border: "none",
                cursor:
                  verifying || code.length !== 6 ? "not-allowed" : "pointer",
                opacity: verifying || code.length !== 6 ? 0.6 : 1,
              }}
            >
              {verifying ? "验证中…" : "验证并登录"}
            </button>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "0.8rem",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError("");
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--muted-foreground)",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                更换邮箱
              </button>
              {countdown > 0 ? (
                <span style={{ color: "var(--muted-foreground)" }}>
                  {countdown}s 后重新发送
                </span>
              ) : (
                <button
                  type="button"
                  onClick={sendCode}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--primary)",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  重新发送
                </button>
              )}
            </div>
          </div>
        )
      ) : (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}
        >
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="用户名"
            autoComplete="username"
            style={{
              padding: "0.55rem 0.8rem",
              fontSize: "0.9rem",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              background: "var(--background)",
              color: "var(--foreground)",
            }}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            autoComplete="current-password"
            onKeyDown={(e) => {
              if (e.key === "Enter") passwordLogin();
            }}
            style={{
              padding: "0.55rem 0.8rem",
              fontSize: "0.9rem",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              background: "var(--background)",
              color: "var(--foreground)",
            }}
          />
          <button
            type="button"
            onClick={passwordLogin}
            disabled={loggingIn}
            style={{
              padding: "0.55rem",
              fontSize: "0.9rem",
              fontWeight: 700,
              color: "#000",
              background: "var(--primary)",
              borderRadius: "var(--radius)",
              border: "none",
              cursor: loggingIn ? "not-allowed" : "pointer",
              opacity: loggingIn ? 0.6 : 1,
            }}
          >
            {loggingIn ? "登录中…" : "登录"}
          </button>
        </div>
      )}

      {/* Third-party separator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          margin: "1.5rem 0 1rem",
          color: "var(--muted-foreground)",
          fontSize: "0.75rem",
        }}
      >
        <span style={{ flex: 1, height: "1px", background: "var(--border)" }} />
        或
        <span style={{ flex: 1, height: "1px", background: "var(--border)" }} />
      </div>

      <button
        type="button"
        onClick={() => {
          const target = encodeURIComponent(redirect);
          window.location.href = `/api/auth/login?redirect=${target}`;
        }}
        style={{
          width: "100%",
          padding: "0.55rem",
          fontSize: "0.85rem",
          fontWeight: 700,
          borderRadius: "var(--radius)",
          cursor: "pointer",
          border: "1px solid var(--border)",
          background: "transparent",
          color: "var(--foreground)",
        }}
      >
        使用 Authentik 登录
      </button>
    </div>
  );
}
