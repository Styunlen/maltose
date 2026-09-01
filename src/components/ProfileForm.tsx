"use client";

import * as React from "react";
import { useState, useEffect } from "react";

/**
 * Profile completion form (ADR-0030 / ADR-0031).
 * Shows after Email OTP login (or from the user menu) to set display name,
 * website URL and description on the WordPress user.
 */
export default function ProfileForm() {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [description, setDescription] = useState("");
  const [lastLogin, setLastLogin] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Prefill from WP viewer (username / display name / last login) + session
  // name fallback, so the form shows the current account state.
  useEffect(() => {
    (async () => {
      try {
        const [meRes, profileRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/user/profile"),
        ]);
        const me = await meRes.json();
        const profile = await profileRes.json();
        if (profile?.ok && profile.user) {
          setUsername(profile.user.username || "");
          setDisplayName(profile.user.name || "");
          setWebsiteUrl(profile.user.url || "");
          setDescription(profile.user.description || "");
          if (profile.user.maltoseLastLogin) {
            setLastLogin(
              new Date(profile.user.maltoseLastLogin).toLocaleString("zh-CN"),
            );
          }
        } else if (me?.user) {
          setDisplayName(me.user.name || me.user.preferred_username || "");
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setError("");
    setSaved(false);
    if (!displayName.trim()) {
      setError("请填写显示名称");
      return;
    }
    setSaving(true);
    try {
      // Persist via the WP updateUser mutation through the proxy (ADR-0030).
      const res = await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim() || undefined,
          displayName: displayName.trim(),
          websiteUrl: websiteUrl.trim() || null,
          description: description.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "保存失败");
        return;
      }
      setSaved(true);
      setTimeout(() => {
        window.location.href = "/";
      }, 1200);
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: 480,
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
          marginBottom: "0.25rem",
          color: "var(--foreground)",
        }}
      >
        完善个人资料
      </h2>
      <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginBottom: "1.25rem" }}>
        首次登录需要补充基本信息，之后可随时修改。
      </p>

      {error && (
        <p style={{ color: "var(--destructive)", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          {error}
        </p>
      )}
      {saved && (
        <p style={{ color: "var(--primary)", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          保存成功，即将跳转…
        </p>
      )}

      {loading ? (
        <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)" }}>加载中…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8rem", fontWeight: 600 }}>
            登录账号
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="字母、数字、下划线、中划线或点"
              autoCapitalize="none"
              style={{
                padding: "0.55rem 0.8rem",
                fontSize: "0.9rem",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
              }}
            />
            <span style={{ fontSize: "0.7rem", fontWeight: 400, color: "var(--muted-foreground)" }}>
              修改后，下次登录请使用新账号
            </span>
          </label>
          {lastLogin && (
            <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: 0 }}>
              上次登录：{lastLogin}
            </p>
          )}
          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8rem", fontWeight: 600 }}>
            显示名称
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="你希望别人看到的昵称"
              style={{
                padding: "0.55rem 0.8rem",
                fontSize: "0.9rem",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
              }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8rem", fontWeight: 600 }}>
            个人网站
            <input
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://你的网站.com（可选）"
              type="url"
              style={{
                padding: "0.55rem 0.8rem",
                fontSize: "0.9rem",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
              }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8rem", fontWeight: 600 }}>
            个人简介
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="一句话介绍自己（可选）"
              rows={3}
              style={{
                padding: "0.55rem 0.8rem",
                fontSize: "0.9rem",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
                resize: "vertical",
              }}
            />
          </label>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              padding: "0.6rem",
              fontSize: "0.9rem",
              fontWeight: 700,
              color: "#000",
              background: "var(--primary)",
              borderRadius: "var(--radius)",
              border: "none",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.6 : 1,
              marginTop: "0.5rem",
            }}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      )}
    </div>
  );
}
