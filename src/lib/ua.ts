export interface UaInfo {
  browser: string;
  os: string;
  device: string;
}

export function parseUa(agent: string): UaInfo | null {
  if (!agent) return null;

  // Browser
  let browser = "Unknown";
  const browserPatterns: [RegExp, string, string][] = [
    [/Edg\/([\d.]+)/, "Edge", "tabler:brand-edge"],
    [/Chrome\/([\d.]+)/, "Chrome", "tabler:brand-chrome"],
    [/Firefox\/([\d.]+)/, "Firefox", "tabler:brand-firefox"],
    [/Safari\/([\d.]+)/, "Safari", "tabler:brand-safari"],
    [/OPR\/([\d.]+)/, "Opera", "tabler:brand-opera"],
  ];
  for (const [re, name] of browserPatterns) {
    const m = agent.match(re);
    if (m) {
      browser = `${name} ${m[1].split(".")[0]}`;
      break;
    }
  }

  // OS
  let os = "Unknown";
  let osIcon = "tabler:device-desktop";
  if (/Windows NT 10/.test(agent)) { os = "Windows 10"; osIcon = "tabler:brand-windows"; }
  else if (/Windows NT 11/.test(agent)) { os = "Windows 11"; osIcon = "tabler:brand-windows"; }
  else if (/Windows NT (\d+)/.test(agent)) { os = `Windows ${RegExp.$1}`; osIcon = "tabler:brand-windows"; }
  else if (/Mac OS X/.test(agent)) { os = "macOS"; osIcon = "tabler:brand-apple"; }
  else if (/Android/.test(agent)) { os = "Android"; osIcon = "tabler:brand-android"; }
  else if (/iPhone|iPad/.test(agent)) { os = "iOS"; osIcon = "tabler:brand-apple"; }
  else if (/Linux/.test(agent)) { os = "Linux"; osIcon = "tabler:brand-linux"; }

  // Device
  let device = "Desktop";
  if (/Mobile|Android.*Mobile/.test(agent)) device = "Mobile";
  else if (/iPad|Tablet/.test(agent)) device = "Tablet";

  return { browser, os, device };
}
